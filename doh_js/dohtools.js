import fs, { promises as fsp } from 'fs';
import os from 'os';
import tarFs from 'tar-fs';
import zlib from 'zlib';
import path from 'path';
import crypto from 'crypto';
import { Worker } from 'worker_threads';
import YAML from 'yaml';
import { getVersionAsNumber, getVersionFromNumber, getVersion, getVersionTag, tagVersion } from './dohver.js';
import { execSync } from 'child_process';
import * as p from '@clack/prompts';

function onlypack(pod = {}) {
  return Object.assign({}, {
    always_confirm_changes: true,
    always_esbuild: false,
    always_reinstall_dohballs: false,
    always_upgrade_dohballs: false,
    always_update_npm_dependencies: false,
    cleanup_orphaned_packages: false,
    // remove all dohball hosting
    'dohball_deployment': {
      'expose_packages': false
    },
    //'~~host_load': '',
  }, pod);
}

// MARK: DohTools
class DohTools {
  constructor() {
    this.dohRoot = DohPath('/');
    this.dohCacheDir = DohPath('/.doh');
    this.dohJsDir = DohPath('/doh_js');
  }


  //MARK: Status
  async getStatus(verbose) {
    if (Doh.logger) {
      Doh.logger.restoreConsole();
    }

    let localPackages = await Doh.readLocalManifest();

    if (Object.keys(localPackages).length === 0) {
      let packitup = await this.confirmAction('Package manifest is empty. Run the packager?');
      if (packitup) {
        await Doh.run_packager(onlypack());
        localPackages = await Doh.readLocalManifest();
      } else {
        return;
      }
    }

    let packageManifest = await Doh.fetchRemoteManifests();
    if (!packageManifest) {
      console.error('Error fetching remote manifests');
      return;
    }
    const dohballs = new Set();


    for (const [packageName, packageInfo] of Object.entries(packageManifest)) {
      if (packageInfo.path) {
        // skip dohballs that start with doh_js
        //if (packageInfo.path.startsWith('doh_js')) continue;
        dohballs.add(packageInfo.path);
      }
    }
    // let issues = await this.checkFileIntegrity(true);

    console.log('\nDohball Status:');
    console.log('===============');
    for (const dohballPath of dohballs) {
      const fullDohballPath = DohPath(dohballPath);
      const dohballName = dohballPath;
      let installedVersion = '';
      let remoteVersion = '';
      let remoteHost = '';
      let lastModified;

      // Get installed version and host
      try {
        const dohballJsonPath = path.join(fullDohballPath, 'dohball.json');
        const dohballContent = await fsp.readFile(dohballJsonPath, 'utf8');
        const dohballInfo = JSON.parse(dohballContent);
        installedVersion = dohballInfo.version;
        lastModified = (await fsp.stat(dohballJsonPath)).mtime;
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error(`Error reading dohball.json for ${dohballName}:`, error);
        }
        continue;
      }

      if (typeof installedVersion !== 'string') {
        installedVersion = '0.0.1a';
      }

      // Get remote version and host
      const relatedPackages = Object.entries(packageManifest)
        .filter(([, info]) => info.path === dohballPath);

      if (relatedPackages.length > 0) {
        const [, packageInfo] = relatedPackages[0];
        remoteVersion = packageInfo.version;
        remoteHost = packageInfo.dohball_host;
      }

      // Calculate time since last update
      let updateStatus = '';
      if (lastModified) {
        const timeSinceUpdate = Date.now() - lastModified.getTime();

        const seconds = Math.floor(timeSinceUpdate / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const months = Math.floor(days / 30);
        const years = Math.floor(days / 365);

        if (seconds < 60) {
          updateStatus = `(${seconds} second${seconds !== 1 ? 's' : ''} ago)`;
        } else if (minutes < 60) {
          updateStatus = `(${minutes} minute${minutes !== 1 ? 's' : ''} ago)`;
        } else if (hours < 24) {
          updateStatus = `(${hours} hour${hours !== 1 ? 's' : ''} ago)`;
        } else if (days < 30) {
          updateStatus = `(${days} day${days !== 1 ? 's' : ''} ago)`;
        } else if (days < 365) {
          const remainderDays = days % 30;
          updateStatus = `(${months} month${months !== 1 ? 's' : ''} ${remainderDays} day${remainderDays !== 1 ? 's' : ''} ago)`;
        } else {
          const remainderDays = days % 365;
          updateStatus = `(${years} year${years !== 1 ? 's' : ''} ${remainderDays} day${remainderDays !== 1 ? 's' : ''} ago)`;
        }
      }


      // Determine if an update is available
      const updateAvailable = remoteVersion && remoteVersion !== installedVersion;
      let remoteHostNote = '';
      if (remoteHost) {
        remoteHostNote = `${remoteHost}`;
      }

      // MAIN OUTPUT
      console.log(`\n${installedVersion.padEnd(9)} ${(dohballName + ':').padEnd(55)} ${updateStatus}`);

      // UPDATE OUTPUT
      if (updateAvailable && remoteVersion && remoteHost) {
        console.warn(`VERSION: ${(remoteVersion + '').padEnd(9)} of [${(dohballName)}] available from [${remoteHostNote}]`);
      }

      // end each output with _ repeated 80 times
      console.log('_'.repeat(80));

    }
    console.log(' ');
  }


  //MARK: Run
  async Run(arg) {
    if (IsString(arg)) {
      if (arg === 'help') {
        // print all the run commands
        console.log(' ');
        console.log('Doh run Help:');
        console.log('  doh run [command]   (streaming output)');
        console.log(' OR ');
        console.log('  doh dash [command]  (dashboard output)');
        console.log(' ');
        console.log('Available commands:');
        console.log(' ');
        console.log('  help            - show this help message');
        console.log('  <no command>    - run the pod with no arguments');
        console.log('  no-pack         - run the pod without auto-packager or installer');
        console.log('  <podfile>       - run the pod with the given podfile as overloads (still inherits from /pod.yaml)');
        console.log('  <module name>   - run the pod with only the given module (and its dependencies) loaded');
        console.log(' ');
        return;
      } else if (arg !== 'no-pack') {
        let pod = undefined;
        // Existing pod file handling
        // check for `.` because it's not allowed in module names
        if (!arg.endsWith('pod.yaml') && !arg.includes('.')) {
          // is string and a module name
          pod = {
            // delete all host_load
            "~~host_load": true,
            // initialize host_load with the module name only
            host_load: [arg] 
          };
          await Doh.run_packager(onlypack(pod));
        } else {
          // treat like a path
          const podfileExists = fs.existsSync(DohPath(arg));
          if (!podfileExists) {
            console.error('Module or Podfile not found: ' + arg);
            throw new Error('Module or Podfile not found: ' + arg);
          }
          pod = await Doh.build_pod(arg, true);
          await Doh.run_packager(pod);
        }
      }
      // 'no-pack' case - do nothing
    } else {
      // Default case - run packager with no arguments
      await Doh.run_packager();
    }
    // console.log('Loading host_load: ', Doh.pod.host_load);
    await Doh.load('host_load', '', 'CLI run (no args)');
    // finished load
    // console.log('Finished loading host_load: ', Doh.pod.host_load);
  }


  //MARK: Packager
  async pack() {
    await Doh.run_packager(onlypack({ always_esbuild: true }));
    // Doh.performance.endlog('AutoPackager');
  }


  //MARK: Install
  async installPackage() {
    await Doh.ingest_package_manifest();

    // build the package manifest
    let dohballManifest = await Doh.fetchRemoteManifests();
    if (!dohballManifest) {
      console.error('Error fetching remote manifests');
      return;
    }

    // Get package names from command line arguments
    const packageNames = process.argv.slice(3);

    if (packageNames.length === 0) {
      console.error('Please specify at least one package name');
      return;
    }

    // Validate package names
    const invalidPackages = packageNames.filter(name => !dohballManifest.hasOwnProperty(name) && name !== '--confirm-all');
    if (invalidPackages.length > 0) {
      console.error(`Unknown package(s): ${invalidPackages.join(', ')}`);
      return;
    }

    for (const packageName of packageNames) {
      if (packageName === '--confirm-all') {
        continue;
      }
      let packageInfo = dohballManifest[packageName];
      // check if the package is already installed
      let packagePath = DohPath(packageInfo.path);
      let dohballJson = await Doh.readInstallManifest(packagePath);
      let reinstall = false;
      if (dohballJson) {
        reinstall = await this.confirmAction(`Package ${packageName} is already installed. Do you want to reinstall it?`);
        if (!reinstall) {
          continue;
        }
        // remove the package path so it can be reinstalled
        await fsp.rm(packagePath, { recursive: true });
      }
    }

    // ask if we should add the packages to the host_load in the pod.yaml
    // const shouldAddToHostLoad = await this.confirmAction(`Add ${packageNames.join(', ')} to host_load in boot.pod.yaml?`);
    // if (shouldAddToHostLoad) {
    //   await this.updateHostLoad(packageNames, true);
    // }

    // install the packages
    await Doh.run_packager(onlypack({
      always_esbuild: true,
      always_upgrade_dohballs: true,
      always_restore_dohballs: true,
      always_update_npm_dependencies: true,
      '~~host_load': '', // remove all host_load
      host_load: packageNames
    }));
  }


  //MARK: Reinstall
  async reinstallDohballs() {
    let argpod = {
      // reinstall updates by default
      always_esbuild: true,
      always_reinstall_dohballs: true,
      always_update_npm_dependencies: true
    };
    const localManifest = await Doh.readLocalManifest();

    // Get package names from command line arguments
    const packageNames = process.argv.slice(3);

    if (packageNames.length > 0) {
      // Validate package names
      // const invalidPackages = packageNames.filter(name => !localManifest.hasOwnProperty(name));
      const invalidPackages = packageNames.filter(name => !localManifest.hasOwnProperty(name) && name !== '--confirm-all');
      if (invalidPackages.length > 0) {
        console.error(`Unknown package(s): ${invalidPackages.join(', ')}`);
        return;
      }
      argpod.host_load = packageNames;
    } else {
      // No package names provided, so reinstall all packages
      argpod.host_load = Object.keys(localManifest);
    }

    const packagesToReinstall = argpod.host_load.join(', ');
    const confirmMessage = argpod.host_load.length === Object.keys(localManifest).length
      ? `Reinstall all packages?`
      : `Reinstall the following package(s): ${packagesToReinstall}?`;

    if (!await this.confirmWarning(confirmMessage)) return;
    await Doh.run_packager(onlypack(argpod));
  }


  //MARK: Upgrade
  async upgradeDohballs() {
    let argpod = {
      // upgrade updates by default
      always_esbuild: true,
      always_upgrade_dohballs: true,
      always_update_npm_dependencies: true
    };
    const localManifest = await Doh.readLocalManifest();

    // Get package names from command line arguments
    const packageNames = process.argv.slice(3);

    if (packageNames.length > 0) {
      // Validate package names
      // const invalidPackages = packageNames.filter(name => !localManifest.hasOwnProperty(name));
      const invalidPackages = packageNames.filter(name => !localManifest.hasOwnProperty(name) && name !== '--confirm-all');
      if (invalidPackages.length > 0) {
        console.error(`Unknown package(s): ${invalidPackages.join(', ')}`);
        return;
      }
      argpod.host_load = packageNames;
    } else {
      // No package names provided, so upgrade all packages
      argpod.host_load = Object.keys(localManifest);
    }

    // const packagesToUpgrade = argpod.host_load.join(', ');
    // const confirmMessage = argpod.host_load.length === Object.keys(localManifest).length
    //   ? `Upgrade all packages?`
    //   : `Upgrade the following package(s): ${packagesToUpgrade}?`;

    // if (!await this.confirmWarning(confirmMessage)) return;
    await Doh.run_packager(onlypack(argpod));
    Doh.performance.endlog('Validate Dependencies');
  }


  //MARK: Bake
  async bake() {
    let args_pod = {
      dohball_deployment: {
        expose_packages: '*', // Expose check still relevant for eligibility
      }
    };
    const localManifest = await Doh.readLocalManifest();
    const allLocalPackages = Object.keys(localManifest);

    // Get package names from command line arguments
    const packageNames = process.argv.slice(3).filter(name => name !== '--confirm-all'); // Filter out confirmation flag

    let packagesToBake = [];
    let invalidPackages = [];

    if (packageNames.length > 0) {
      // Validate specified package names against local manifest
      invalidPackages = packageNames.filter(name => !localManifest.hasOwnProperty(name));
      if (invalidPackages.length > 0) {
        console.error(`Unknown package(s) specified for baking: ${invalidPackages.join(', ')}`);
        // Optionally list available packages
        // console.log('Available packages:', allLocalPackages.join(', '));
        return;
      }
      packagesToBake = packageNames;
      // Ensure dohball_deployment exists before assigning
      args_pod.dohball_deployment = args_pod.dohball_deployment || {};
      args_pod.dohball_deployment.bake_targets = packagesToBake; // Pass specific targets
    } else {
      // No package names provided, bake all locally known packages that are exposable
      packagesToBake = allLocalPackages; // Intention is to bake all eligible
      // No bake_targets means bake all eligible exposed packages in bakeDohballs
    }

    const targetDescription = packageNames.length > 0
        ? `the following package(s): \n\n${packagesToBake.join(', ')}\n`
        : `all eligible exposed packages?`;

    const confirmMessage = `Bake ${targetDescription}`;

    if (!await this.confirmAction(confirmMessage)) return;
    await Doh.run_packager(onlypack(args_pod));
    Doh.performance.endlog('Validate Dependencies');
  }


  //MARK: Rebake
  async rebake() {
    let args_pod = {
      dohball_deployment: {
        expose_packages: '*', // Expose check still relevant for eligibility
        rebake: true
      }
    };
    const localManifest = await Doh.readLocalManifest();
    const allLocalPackages = Object.keys(localManifest);

    // Get package names from command line arguments
    const packageNames = process.argv.slice(3).filter(name => name !== '--confirm-all'); // Filter out confirmation flag

    let packagesToRebake = [];
    let invalidPackages = [];

    if (packageNames.length > 0) {
      // Validate specified package names against local manifest
      invalidPackages = packageNames.filter(name => !localManifest.hasOwnProperty(name));
      if (invalidPackages.length > 0) {
        console.error(`Unknown package(s) specified for rebaking: ${invalidPackages.join(', ')}`);
        // Optionally list available packages
        // console.log('Available packages:', allLocalPackages.join(', '));
        return;
      }
      packagesToRebake = packageNames;
      // Ensure dohball_deployment exists before assigning
      args_pod.dohball_deployment = args_pod.dohball_deployment || {};
      args_pod.dohball_deployment.bake_targets = packagesToRebake; // Pass specific targets
    } else {
      // No package names provided, rebake all locally known packages that are exposable
      packagesToRebake = allLocalPackages; // Intention is to rebake all eligible
      // No bake_targets means rebake all eligible exposed packages in bakeDohballs
    }

     const targetDescription = packageNames.length > 0
        ? `the following specified package(s): ${packagesToRebake.join(', ')}`
        : `all eligible exposed packages`;


    const confirmMessage = `Rebake ${targetDescription}?`;

    if (!await this.confirmWarning(confirmMessage)) return;
    await Doh.run_packager(onlypack(args_pod));
    Doh.performance.endlog('Validate Dependencies');
  }

  async createDohballManifestFromExposedDohballs() {
    const args_pod = {
      dohball_deployment: {
        compile_manifest: true,
      }
    };
    await Doh.run_packager(onlypack(args_pod));
  }

  // async cleanupOrphanedPackages() {
  //   if (!await this.confirmWarning('Clear orphaned packages')) return;
  //   await Doh.run_packager(onlypack({
  //     cleanup_orphaned_packages: true
  //   }));
  // }


  //MARK: Pods
  async analyzePodSetting(setting) {
    if (Doh.logger) {
      Doh.logger.restoreConsole();
    }
    const podPath = DohPath('/pod.yaml');
    const bootPodPath = DohPath('/boot.pod.yaml');
    const compiledPodPath = DohPath('/.doh/compiled.pod.yaml');
    let podContent;
    try {
      podContent = await fsp.readFile(podPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        podContent = '';
      } else {
        throw error;
      }
    }
    let bootPodContent;
    try {
      bootPodContent = await fsp.readFile(bootPodPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        bootPodContent = '';
      } else {
        throw error;
      }
    }
    let compiledPodContent;
    try {
      compiledPodContent = await fsp.readFile(compiledPodPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        compiledPodContent = '';
      } else {
        throw error;
      }
    }

    let podYaml = YAML.parse(podContent) || {};
    let bootPodYaml = YAML.parse(bootPodContent) || {};
    let compiledPodYaml = YAML.parse(compiledPodContent) || {};

    // Special case for showing the whole pod
    if (!setting) {
      console.log('\nCurrent [ /pod.yaml ]:\n');
      const directPod = { ...podYaml };
      delete directPod.inherited;
      console.log(YAML.stringify(directPod).split('\n').map(line => '  ' + line).join('\n'));

      if (compiledPodContent) {
        console.log('\nCompiled pod:\n');
        const compiledPodWithoutInherited = { ...compiledPodYaml };
        delete compiledPodWithoutInherited.inherited;

        // For each key in the compiled pod, show its inheritance chain
        for (const [key, value] of Object.entries(compiledPodWithoutInherited)) {
          if (key === 'inherits') continue; // Skip the inherits key itself

          console.log(`  ${key}:`);
          const valueStr = YAML.stringify(value).split('\n');
          valueStr.forEach(line => console.log(`    ${line}`));

          // Show inheritance chain for this key
          const inheritChain = [...Object.keys(compiledPodYaml.inherited || {})];
          inheritChain.forEach(inheritPath => {
            if (compiledPodYaml.inherited[inheritPath][key] !== undefined) {
              console.log(`      ^--[ ${inheritPath} ]`);
            }
          });
        }
      }
      console.log(' ');
      return { podYaml, compiledPodYaml };
    }

    const settingValue = Doh.parse_reference(podYaml, setting);
    const bootPodValue = Doh.parse_reference(bootPodYaml, setting);
    const compiledValue = Doh.parse_reference(compiledPodYaml, setting);


    if (compiledPodContent) {
      console.log(`Compiled \`${setting}\` (${SeeIf.TypeOf(compiledValue)}):\n`);
      if (IsArray(compiledValue)) {
        if (compiledValue.length === 0) {
          console.log('  (none)');
        } else {
          compiledValue.forEach(item => {
            let itemLine = `  ${item}`;
            const inheritChain = [...Object.keys(compiledPodYaml.inherited || {})].reverse();
            const inheritSources = [];

            inheritChain.forEach(inheritPath => {
              const inheritedValue = Doh.parse_reference(compiledPodYaml.inherited[inheritPath], setting);
              if (Array.isArray(inheritedValue) && inheritedValue.includes(item)) {
                inheritSources.push(inheritPath);
              }
            });

            if (inheritSources.length > 0) {
              const padding = Math.max(0, 40 - itemLine.length);
              itemLine += `${' '.repeat(padding)} <--[ ${inheritSources.join(', ')} ]`;
            }
            console.log(itemLine);
          });
        }
      } else if (IsObject(compiledValue)) {
        // Helper function to flatten object to key paths
        const flattenObject = (obj, prefix = '') => {
          const result = {};
          for (const [key, value] of Object.entries(obj)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            result[fullKey] = value;
            if (IsObject(value)) {
              Object.assign(result, flattenObject(value, fullKey));
            }
          }
          return result;
        };

        // Get flattened representation of the compiled object
        const flattenedObject = flattenObject(compiledValue);
        const inheritChain = [...Object.keys(compiledPodYaml.inherited || {})].reverse();
        
        // Build inheritance map for each key path
        const keyInheritance = {};
        for (const keyPath of Object.keys(flattenedObject)) {
          keyInheritance[keyPath] = [];
          
          inheritChain.forEach(inheritPath => {
            const fullKeyPath = setting ? `${setting}.${keyPath}` : keyPath;
            const inheritedValue = Doh.parse_reference(compiledPodYaml.inherited[inheritPath], fullKeyPath);
            if (HasValue(inheritedValue)) {
              keyInheritance[keyPath].push(inheritPath);
            }
          });
        }

        // Display the YAML with inheritance annotations
        const yamlLines = YAML.stringify(compiledValue).split('\n');
        const outputLines = [];
        
                 for (let i = 0; i < yamlLines.length; i++) {
           const line = yamlLines[i];
           let fullLine = `  ${line}`;
           
           // Try to match this line to a key in our object
           const match = line.match(/^(\s*)([^:]+):/);
           if (match) {
             const indentLevel = Math.floor(match[1].length / 2);
             const key = match[2].trim();
             
             // Build the full key path based on indentation and previous keys
             let keyPath = key;
             if (indentLevel > 0) {
               // Find the parent key by looking at previous lines with less indentation
               for (let j = i - 1; j >= 0; j--) {
                 const prevMatch = yamlLines[j].match(/^(\s*)([^:]+):/);
                 if (prevMatch) {
                   const prevIndentLevel = Math.floor(prevMatch[1].length / 2);
                   if (prevIndentLevel === indentLevel - 1) {
                     keyPath = `${prevMatch[2].trim()}.${key}`;
                     break;
                   }
                 }
               }
             }
             
             // Check if we have inheritance info for this key
             if (keyInheritance[keyPath] && keyInheritance[keyPath].length > 0) {
               const padding = Math.max(1, 40 - fullLine.length);
               fullLine += `${' '.repeat(padding)} <--[ ${keyInheritance[keyPath].join(', ')} ]`;
             }
           }
           
           outputLines.push(fullLine);
         }
        
        console.log(outputLines.join('\n'));
      } else {
        console.log(`  ${compiledValue}\n`);
        // Show inheritance chain for literal values
        const inheritChain = [...Object.keys(compiledPodYaml.inherited || {})].reverse();
        inheritChain.forEach(inheritPath => {
          const inheritedValue = Doh.parse_reference(compiledPodYaml.inherited[inheritPath], setting);
          if (HasValue(inheritedValue)) {
            const valueStr = `^--[ ${inheritedValue} ]`;
            const sourceStr = ` <--[ ${inheritPath} ]`;
            const padding = Math.max(0, 40 - valueStr.length);
            console.log(`  ${valueStr}${' '.repeat(padding)}${sourceStr}`);
          }
        });
      }
    }
    else {
      console.log(`Current [ /pod.yaml ] \`${setting}\`:\n`);
      if (IsArray(settingValue)) {
        if (settingValue.length === 0) {
          console.log('  (none)');
        } else {
          settingValue.forEach(item => console.log(`  ${item}`));
        }
      } else if (IsObject(settingValue)) {
        console.log(YAML.stringify(settingValue).split('\n').map(line => '  ' + line).join('\n'));
      } else {
        console.log(`  ${settingValue}\n`);
      }
      console.log(' ');
      console.log(`Current [ /boot.pod.yaml ] \`${setting}\`:\n`);
      if (IsArray(bootPodValue)) {
        if (bootPodValue.length === 0) {
          console.log('  (none)');
        } else {
          bootPodValue.forEach(item => console.log(`  ${item}`));
        }
      } else if (IsObject(bootPodValue)) {
        console.log(YAML.stringify(bootPodValue).split('\n').map(line => '  ' + line).join('\n'));
      } else {
        console.log(`  ${bootPodValue}\n`);
      }
    }

    console.log(' ');

    return { podYaml, bootPodYaml, settingValue, compiledPodYaml, compiledValue };
  }
  async updatePodInherits(yamlPaths) {
    const podPath = DohPath('/pod.yaml');
    const { podYaml } = await this.analyzePodSetting('inherits');
    podYaml.inherits = podYaml.inherits || [];

    if (yamlPaths.length > 0) {
      for (const path of yamlPaths) {
        if (path.startsWith('~')) {
          const removePath = path.slice(2);
          podYaml.inherits = podYaml.inherits.filter(p => p !== removePath);
          console.log(`Removed ${removePath} from inherits`);
        } else {
          if (path && !podYaml.inherits.includes(path)) {
            podYaml.inherits.push(path);
            console.log(`Added ${path} to inherits`);
          } else {
            console.log(`${path} already exists in inherits`);
          }
        }
      }
      if (NotArray(podYaml.host_load)) podYaml.host_load = [];
      await fsp.writeFile(podPath, YAML.stringify(podYaml));
      console.log('Updated pod.yaml');
      await Doh.run_packager(onlypack({
        always_compile_pod: true
      }));
      await this.analyzePodSetting('inherits');
    }
  }

  async updateHostLoad(packages, skip_packager) {
    const podPath = DohPath('/boot.pod.yaml');
    let { podYaml } = await this.analyzePodSetting('host_load');
    // load the yaml from the podPath
    podYaml = await fsp.readFile(podPath, 'utf8');
    podYaml = YAML.parse(podYaml);
    podYaml.host_load = podYaml.host_load || [];

    if (packages.length > 0) {
      for (const pkg of packages) {
        if (pkg.startsWith('~')) {
          const removePackage = pkg.slice(2);
          podYaml.host_load = podYaml.host_load.filter(p => p !== removePackage);
          console.log(`Removed ${removePackage} from /boot.pod.yaml host_load`);
        } else {
          if (pkg && !podYaml.host_load.includes(pkg)) {
            podYaml.host_load.push(pkg);
            console.log(`Added ${pkg} to /boot.pod.yaml host_load`);
          } else {
            console.log(`${pkg} already exists in /boot.pod.yaml host_load`);
          }

        }
      }
      if (NotArray(podYaml.host_load)) podYaml.host_load = [];
      await fsp.writeFile(podPath, YAML.stringify(podYaml));
      console.log('Updated /boot.pod.yaml');
      if (!skip_packager) {
        await Doh.run_packager(onlypack({
          always_compile_pod: true
        }));
        await this.analyzePodSetting('host_load');
      }
    }
  }
  async updateDohballHost(hosts) {
    const podPath = DohPath('/pod.yaml');
    const { podYaml } = await this.analyzePodSetting('dohball_host');
    podYaml.dohball_host = podYaml.dohball_host || [];

    if (hosts.length > 0) {
      for (const host of hosts) {
        if (host.startsWith('~')) {
          const removeHost = host.slice(2);
          podYaml.dohball_host = podYaml.dohball_host.filter(p => p !== removeHost);
          console.log(`Removed ${removeHost} from dohball_host`);
        } else {
          if (host && !podYaml.dohball_host.includes(host)) {
            podYaml.dohball_host.push(host);
            console.log(`Added ${host} to dohball_host`);
          } else {
            console.log(`${host} already exists in dohball_host`);
          }
        }
      }
      if (NotArray(podYaml.host_load)) podYaml.host_load = [];
      await fsp.writeFile(podPath, YAML.stringify(podYaml));
      console.log('Updated pod.yaml');
      await Doh.run_packager(onlypack({
        always_compile_pod: true
      }));
      await this.analyzePodSetting('dohball_host');
    }
  }
  
  async managePodValue(setting, value) {
    if (value === undefined) {
      // Show the current value
      await this.analyzePodSetting(setting);
      return;
    }

    // Set the value
    const podPath = DohPath('/pod.yaml');
    const { podYaml } = await this.analyzePodSetting(setting);

    // Check for removal prefix
    if (setting.startsWith('~~')) {
      const actualSetting = setting.slice(2); // Remove ~~ prefix
      this.removeNestedValue(podYaml, actualSetting);
      
      // Write the updated pod.yaml
      await fsp.writeFile(podPath, YAML.stringify(podYaml));
      console.log(`Removed from pod.yaml: ${actualSetting}`);
      
      // Recompile the pod
      await Doh.run_packager(onlypack({
        always_compile_pod: true
      }));
      
      // Show the updated structure (try to show the parent if it exists)
      const parentPath = actualSetting.includes('.') ? actualSetting.split('.').slice(0, -1).join('.') : '';
      await this.analyzePodSetting(parentPath || actualSetting);
      return;
    }

    // Parse and convert the value to appropriate type
    let parsedValue = this.parseValue(value);

    // Set the value using dot notation
    this.setNestedValue(podYaml, setting, parsedValue);

    // Write the updated pod.yaml
    await fsp.writeFile(podPath, YAML.stringify(podYaml));
    console.log(`Updated pod.yaml: ${setting} = ${JSON.stringify(parsedValue)}`);
    
    // Recompile the pod
    await Doh.run_packager(onlypack({
      always_compile_pod: true
    }));
    
    // Show the updated value
    await this.analyzePodSetting(setting);
  }

  parseValue(value) {
    // Handle boolean values
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (value === 'undefined') return undefined;

    // Handle numbers
    if (/^-?\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    if (/^-?\d*\.\d+$/.test(value)) {
      return parseFloat(value);
    }

    // Handle quoted strings (remove quotes)
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    // Return as string
    return value;
  }

  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;

    // Navigate to the parent of the target property
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
        current[key] = {};
      }
      current = current[key];
    }

    // Set the final value
    const finalKey = keys[keys.length - 1];
    current[finalKey] = value;
  }

  removeNestedValue(obj, path) {
    const keys = path.split('.');
    let current = obj;

    // Navigate to the parent of the target property
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
        // Path doesn't exist, nothing to remove
        return false;
      }
      current = current[key];
    }

    // Remove the final key
    const finalKey = keys[keys.length - 1];
    if (finalKey in current) {
      delete current[finalKey];
      return true;
    }
    return false;
  }

  async doRemovals() {
    // process the removals for all installed dohballs
    const installedManifest = await Doh.readLocalManifest();
    let askQuestions = true;
    let firstFileFound = false;
    
    // Track dohballs we've already processed by their DohSlash path
    const processedDohballs = new Set();
    
    for (const [packageName, packageInfo] of Object.entries(installedManifest)) {
      const DohSlashPackagePath = DohPath.DohSlash(packageInfo.path);
      
      // Skip if we've already processed this dohball
      if (processedDohballs.has(DohSlashPackagePath)) {
        continue;
      }
      
      processedDohballs.add(DohSlashPackagePath);
      const absolutePackagePath = DohPath(DohSlashPackagePath);
      const dohballJsonPath = DohPath.Join(absolutePackagePath, 'dohball.json');
      try {
        const dohballJson = await fsp.readFile(dohballJsonPath, 'utf8');
        const dohballJsonObj = JSON.parse(dohballJson);
        
        if (dohballJsonObj.removals && dohballJsonObj.removals.length > 0) {
          // Check if there are any files that actually exist
          const existingFiles = [];
          for (const removal of dohballJsonObj.removals) {
            const removalPath = DohPath.Join(absolutePackagePath, removal);
            if (await this.fileExists(removalPath)) {
              existingFiles.push(removalPath);
            }
          }
          
          if (existingFiles.length > 0) {
            console.log(`\nFound ${existingFiles.length} files to remove in dohball: ${DohSlashPackagePath}`);
            
            // If this is the first time we found files and we're asking questions
            if (!firstFileFound && askQuestions) {
              firstFileFound = true;
              askQuestions = await this.confirmAction("Do you want to be asked about file removals?");
            }
            
            if (askQuestions) {
              const removeAll = await this.confirmAction(`Do you want to remove all ${existingFiles.length} files in ${DohSlashPackagePath} without asking for each one?`);
              
              if (removeAll) {
                // Remove all files without asking
                for (const removalPath of existingFiles) {
                  console.log(`Removing ${removalPath}`);
                  await fsp.unlink(removalPath);
                }
              } else {
                // Ask for each file
                for (const removalPath of existingFiles) {
                  if (await this.confirmAction(`Remove ${removalPath}?`)) {
                    console.log(`Removing ${removalPath}`);
                    await fsp.unlink(removalPath);
                  } else {
                    console.log(`Skipping ${removalPath}`);
                  }
                }
              }
            } else {
              // Don't ask questions, just remove all files
              for (const removalPath of existingFiles) {
                console.log(`Removing ${removalPath}`);
                await fsp.unlink(removalPath);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error processing removals for ${DohSlashPackagePath}: ${error.message}`);
      }
    }
    
    if (!firstFileFound) {
      console.log("No files found that need to be removed.");
    }
  }


  //MARK: Clear
  async clearHostedDohballs(force) {
    // allow the process to be called with `node doh clear-all force` to set force to true
    if (process.argv.includes('force')) {
      force = true;
    }
    if (!force && !await this.confirmWarning('Clear Hosted Dohballs. !!BEWARE!! YOU ARE LIKELY LOOKING FOR: doh do-removals')) return;
    if (!force && !await this.confirmWarning('Are you sure you want to clear ALL dohballs this project is hosting?')) return;
    const manifestPath = path.join(this.dohJsDir, 'manifests', 'dohball_manifest.json');
    await this.safeUnlink(manifestPath);
    const dohballHostDir = path.join(this.dohRoot, 'dohballs');
    await this.removeDirectory(dohballHostDir);
    console.log('  Cleared Hosted Dohballs');
  }
  async clearCompiledDohballManifest(force) {
    // allow the process to be called with `node doh clear-all force` to set force to true
    if (process.argv.includes('force')) {
      force = true;
    }
    if (!force && !await this.confirmWarning('Clear the Compiled Remote Dohball Manifest')) return;
    const manifestPath = path.join(this.dohCacheDir, 'compiled_dohball_manifest.json');
    await this.safeUnlink(manifestPath);
    console.log('  Cleared Compiled Dohball Manifest');
  }
  async clearPackageJSONCache(force) {
    if (!force && !await this.confirmWarning('Clear package.json Caches')) return;
    const corePackageJSONCachePath = path.join(this.dohCacheDir, 'core_package.cache.json');
    const packageJSONCachePath = path.join(this.dohCacheDir, 'package.cache.json');
    await this.safeUnlink(corePackageJSONCachePath);
    await this.safeUnlink(packageJSONCachePath);
    console.log('  Cleared package.json Caches');
  }
  async clearPod(force) {
    // allow the process to be called with `node doh clear-pod force` to set force to true
    if (process.argv.includes('force')) {
      force = true;
    }
    if (!force && !await this.confirmWarning('Clear Pod Cache and Manifest')) return;
    const podManifestPath = DohPath('/.doh/manifests/pod_manifest.json');
    const compiledPodPath = DohPath('/.doh/compiled.pod.yaml');
    await this.safeUnlink(podManifestPath);
    await this.safeUnlink(compiledPodPath);
    console.log('  Cleared Pod Cache and Manifest');
  }
  async clearAutoPackagerOutput(force) {
    // allow the process to be called with `node doh clear-packager force` to set force to true
    if (process.argv.includes('force')) {
      force = true;
    }

    if (!force && !await this.confirmWarning('Clear ALL Auto-packager Manifests')) return;
    const manifestsDir = path.join(this.dohJsDir, 'manifests');
    const entries = await fsp.readdir(manifestsDir);
    for (const entry of entries) {
      if (entry !== 'README.md') {
        await this.safeUnlink(path.join(manifestsDir, entry));
      }
    }

    const cacheEntries = await fsp.readdir(this.dohCacheDir, { withFileTypes: true });
    for (const entry of cacheEntries) {
      if (
        entry.isDirectory() &&
        !['codex', 'shrines', 'logs', 'static'].includes(entry.name)
      ) {
        const cacheDir = path.join(this.dohCacheDir, entry.name);
        if (cacheDir !== this.dohCacheDir) {
          try {
            await this.removeDirectory(cacheDir);
          } catch (error) {
            console.warn(`  Failed to remove cache directory ${cacheDir}: ${error.message}`);
          }
        }
      }
    }
    // clear the compiled dohball manifest
    await this.clearCompiledDohballManifest(true);

    // clear the package.cache.json
    await this.clearPackageJSONCache(true);

    console.log('  Cleared All Auto-packager Manifests');
  }

  async clearDistDirectory(force) {
    // allow the process to be called with `node doh clear-bulid force` to set force to true
    if (process.argv.includes('force')) {
      force = true;
    }

    if (!force && !await this.confirmWarning('Clear build directory at /dist')) return;

    const distDir = DohPath('/dist');

    try {
      await fsp.access(distDir);
      await this.removeDirectory(distDir);

      // Recreate the dist directory
      await fsp.mkdir(distDir, { recursive: true });

      console.log('  Cleared build directory at /dist');
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Dist directory doesn't exist, create it
        await fsp.mkdir(distDir, { recursive: true });
        console.log('  Created build directory at /dist (it didn\'t exist)');
      } else {
        console.warn(`  Failed to clear build directory (/dist): ${error.message}`);
      }
    }
  }

  async clearAll(force) {
    // allow the process to be called with `node doh clear-all force` to set force to true
    if (process.argv.includes('force')) {
      force = true;
    }
    if (!force && !await this.confirmWarning('Clear All generaged manifests and caches')) return;
    await this.clearPod(true);
    await this.clearAutoPackagerOutput(true); // also clears the package.json caches
    // await this.clearDistDirectory(true);
    //await this.clearHostedDohballs();
    console.log('  Clear All completed.');
  }


  //MARK: Codex
  async codify() {
    console.log('Creating codex...');

    const codexDir = DohPath('/.doh/codex');
    await fsp.mkdir(codexDir, { recursive: true });

    const currentVersion = await this.getCurrentCodexVersion();
    // we need to load the compiled pod.yaml to get the packager_ignore
    const compiledPodPath = DohPath('/.doh/compiled.pod.yaml');
    let compiledPodContent;
    try {
      compiledPodContent = await fsp.readFile(compiledPodPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        compiledPodContent = '';
      } else {
        // if there is no compiled pod.yaml, we need to run the packager
        await Doh.run_packager(onlypack());
        compiledPodContent = await fsp.readFile(compiledPodPath, 'utf8');
      }
    }
    compiledPodContent = YAML.parse(compiledPodContent);
    let excludeDirsAndFiles = compiledPodContent.packager_ignore || [];
    // pod.yaml is the custom install config for each instance of a doh system
    // package-lock.json is the lockfile for the dependencies of the npm packages used by the project
    // for this reason, we never want them, even if the user has tried to include them somehow
    excludeDirsAndFiles.push('pod.yaml'); // we don't want to include the pod.yaml in the codex
    excludeDirsAndFiles.push('package-lock.json'); // we don't want to include the package-lock.json in the codex
    // make sure that the excludeDirsAndFiles array doesn't include doh_js or doh_js/
    excludeDirsAndFiles = excludeDirsAndFiles.filter(dir => !dir.includes('doh_js'));
    const fullProjectPath = DohPath('/');

    const worker = new Worker('./doh_js/codify_worker.mjs');

    return new Promise((resolve, reject) => {
      worker.on('message', async (message) => {
        if (message.success) {
          console.log(`Codex created: ${message.result.version}`);
          await this.cleanupOldCodex(compiledPodContent.max_codex);
          resolve(message.result);
        } else {
          reject(new Error(message.error));
        }
        worker.terminate();
      });

      worker.on('error', reject);
      worker.postMessage({
        outputPath: codexDir,
        fullProjectPath,
        excludeDirsAndFiles,
        currentVersion
      });
    });
  }
  async getAvailableVersions() {
    const codexDir = DohPath('/.doh/codex');
    const shrineDir = DohPath('/.doh/shrines');
    let availableCodex = [];
    let availableShrines = [];

    // ensure the codex and shrine directories exist
    if (await this.fileExists(codexDir)) {
      availableCodex = await fsp.readdir(codexDir);
      availableCodex = availableCodex.filter(file => file.endsWith('.tar.gz'));
      // use the array values as keys for an object, and the value is the mtime of the file
      availableCodex = availableCodex.map(file => ({
        file,
        // display the modified time using 'ago' logic
        modified: this.formatTimeAgo((fs.statSync(path.join(codexDir, file))).mtime)
      }));
    }
    if (await this.fileExists(shrineDir)) {
      availableShrines = await fsp.readdir(shrineDir);
      availableShrines = availableShrines.filter(file => file.endsWith('.tar.gz'));
      // use the array values as keys for an object, and the value is the mtime of the file
      availableShrines = availableShrines.map(file => ({
        file,
        // display the modified time using 'ago' logic
        modified: this.formatTimeAgo((fs.statSync(path.join(shrineDir, file))).mtime)
      }));
    }
    return { availableCodex, availableShrines };
  }
  async enshrine(tag) {

    if (!tag) {
      // const { availableCodex, availableShrines } = await this.getAvailableVersions();
      // console.log('\nAvailable codex versions:\n', availableCodex);
      // console.log('\nAvailable shrines:\n', availableShrines, '\n');
      // console.error('Please provide a valid filename-safe tag.');
      // if there is no tag, we will just do a codex
      await this.codify();
      return;
    }

    if (!/^[a-zA-Z0-9-_]+$/.test(tag)) {
      console.error('Please provide a valid filename-safe tag.');
      return;
    }
    console.log('Enshrining codex...');

    const codexDir = DohPath('/.doh/codex');
    const shrineDir = DohPath('/.doh/shrines');
    await fsp.mkdir(shrineDir, { recursive: true });

    await this.codify();  // make sure we have a codex to enshrine

    const currentVersion = await this.getCurrentCodexVersion();
    const taggedVersion = tagVersion(currentVersion, tag);

    const latestCodex = (await fsp.readdir(codexDir))
      .filter(file => file.endsWith('.tar.gz'))
      .sort((a, b) => {
        const versionA = getVersionAsNumber(a.replace('.tar.gz', ''));
        const versionB = getVersionAsNumber(b.replace('.tar.gz', ''));
        return versionB - versionA;
      })[0];

    if (!latestCodex) {
      console.error('No codex found to enshrine.');
      return;
    }

    const sourcePath = path.join(codexDir, latestCodex);
    const destPath = path.join(shrineDir, `${taggedVersion}.tar.gz`);

    await fsp.copyFile(sourcePath, destPath);
    console.log(`Enshrined codex as ${taggedVersion}.tar.gz`);
  }
  async enact(versionOrTag) {

    const codexDir = DohPath('/.doh/codex');
    const shrineDir = DohPath('/.doh/shrines');

    let selectedFile;

    if (!versionOrTag) {
      const { availableCodex, availableShrines } = await this.getAvailableVersions();
      console.log('\nAvailable codex versions:\n', availableCodex);
      console.log('\nAvailable shrines:\n', availableShrines, '\n');
      console.error('Please specify a version or tag to enact.');
      return;
    } else {
      // Try to find the file in codex directory
      selectedFile = await this.findCodex(codexDir, versionOrTag);

      // If not found in codex, try to find in shrines
      if (!selectedFile) {
        selectedFile = await this.findShrine(shrineDir, versionOrTag);
      }
    }

    if (!selectedFile) {
      console.error('Unable to find a matching codex or shrine.');
      const { availableCodex, availableShrines } = await this.getAvailableVersions();
      console.log('\nAvailable codex versions:\n', availableCodex);
      console.log('\nAvailable shrines:\n', availableShrines, '\n');
      return;
    }

    if (await this.confirmWarning(`restore the project from ${selectedFile.file}`)) {
      await this.restoreFromCodex(selectedFile.file, selectedFile.dir);
    }
  }
  async getLatestCodex(dir) {
    // ensure the codex directory exists
    if (!await this.fileExists(dir)) {
      console.error('non-fatal: Codex directory does not exist.');
      return null;
    }

    const files = await fsp.readdir(dir);
    const codexFiles = files
      .filter(file => file.endsWith('.tar.gz'))
      .sort((a, b) => {
        const versionA = getVersionAsNumber(a.replace('.tar.gz', ''));
        const versionB = getVersionAsNumber(b.replace('.tar.gz', ''));
        return versionB - versionA;
      });

    return codexFiles.length > 0 ? { file: codexFiles[0], dir } : null;
  }
  async findCodex(dir, versionOrTag) {
    // ensure the codex directory exists
    if (!await this.fileExists(dir)) {
      console.error('non-fatal: Codex directory does not exist.');
      return null;
    }
    const files = await fsp.readdir(dir);
    const matchingFile = files.find(file =>
      file.startsWith(versionOrTag) || file.replace('.tar.gz', '') === versionOrTag
    );
    return matchingFile ? { file: matchingFile, dir } : null;
  }
  async findShrine(dir, versionOrTag) {
    // ensure the shrine directory exists
    if (!await this.fileExists(dir)) {
      console.error('non-fatal: Shrine directory does not exist.');
      return null;
    }
    const files = await fsp.readdir(dir);
    let matchingFiles = files.filter(file => {
      const version = file.replace('.tar.gz', '');
      return version === versionOrTag ||
        getVersionTag(version) === versionOrTag ||
        getVersion(version) === versionOrTag;
    });

    if (matchingFiles.length === 0) {
      return null;
    }

    // If versionOrTag is a tag and we have multiple matches, select the newest version
    if (matchingFiles.length > 1) {
      matchingFiles.sort((a, b) => {
        const versionA = getVersionAsNumber(a.replace('.tar.gz', ''));
        const versionB = getVersionAsNumber(b.replace('.tar.gz', ''));
        return versionB - versionA;
      });
    }

    return { file: matchingFiles[0], dir };
  }
  async restoreFromCodex(codexFile, sourceDir) {
    const codexPath = path.join(sourceDir, codexFile);
    const projectRoot = DohPath('/');

    console.log(`Restoring from ${codexFile}...`);

    // Create a temporary directory for extraction
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'doh-codex-'));

    try {
      // Extract the codex to the temporary directory
      await new Promise((resolve, reject) => {
        fs.createReadStream(codexPath)
          .pipe(zlib.createGunzip())
          .pipe(tarFs.extract(tempDir))
          .on('finish', resolve)
          .on('error', reject);
      });

      // Copy files from temp directory to project root
      await this.copyRecursive(tempDir, projectRoot);

      console.log('\nRestoration completed successfully.');

      // Run npm install
      console.log('\nRunning npm install...');
      execSync('npm install', { cwd: projectRoot, stdio: 'inherit' });

      // Run onlypack packager
      //console.log('Running Auto-packager...');
      await Doh.run_packager(onlypack({
        always_upgrade_dohballs: true,
        always_update_npm_dependencies: true
      }));

      console.log('Codex restoration and post-restoration tasks completed successfully.');
    } catch (error) {
      console.error('Error during restoration:', error);
    } finally {
      // Clean up the temporary directory
      await fsp.rm(tempDir, { recursive: true, force: true });
    }
  }
  async getCurrentCodexVersion() {
    const codexDir = DohPath('/.doh/codex');
    const files = await fsp.readdir(codexDir);
    const versions = files
      .filter(file => file.endsWith('.tar.gz'))
      .map(file => file.replace('.tar.gz', ''))
      .map(version => getVersionAsNumber(version))
      .sort((a, b) => b - a);

    return versions.length > 0 ? getVersionFromNumber(versions[0]) : '0.0.1a';
  }
  async cleanupOldCodex(maxCodex = 5) {
    const codexDir = DohPath('/.doh/codex');
    const files = await fsp.readdir(codexDir);
    const sortedFiles = files
      .filter(file => file.endsWith('.tar.gz'))
      .sort((a, b) => {
        const versionA = getVersionAsNumber(a.replace('.tar.gz', ''));
        const versionB = getVersionAsNumber(b.replace('.tar.gz', ''));
        return versionB - versionA;
      });

    if (sortedFiles.length > maxCodex) {
      const filesToRemove = sortedFiles.slice(maxCodex);
      for (const file of filesToRemove) {
        await fsp.unlink(path.join(codexDir, file));
        console.log(`Removed old codex: ${file}`);
      }
    }
  }


  //MARK: CompileDocs
  async compileDocs(type = 'md') {
    const docsDir = DohPath('/');
    const outputFile = DohPath('/doh_js/manifests/doh');
    const manifest = {};
    const toc = [];
    const skipToc = process.argv.includes('--skip-toc');
    
    // Track included files and their sizes
    const fileMap = new Map();

    try {
      // skip .git, .doh, node_modules, dist
      let skipFiles = ['.git/', '.doh/', 'node_modules/', 'dist/', 'doh_js/manifests/'];
      // look in .doh/compiled.pod.yaml for packager_ignore, if found, add it to the skipFiles
      const compiledPodPath = DohPath('/.doh/compiled.pod.yaml');
      const compiledPodContent = await fsp.readFile(compiledPodPath, 'utf8');
      const compiledPodYaml = YAML.parse(compiledPodContent) || {};
      const packagerIgnore = compiledPodYaml.packager_ignore || [];
      skipFiles.push(...packagerIgnore.map(ignore => `${ignore}`));

      // remove any entries that contian doh_js in any way
      skipFiles = skipFiles.filter(file => file !== 'doh_js');
      // console.log(skipFiles);

      await this.walkDirectory(docsDir, async (filePath) => {

        if (skipFiles.some(skipFile => Doh.toForwardSlash(filePath).includes(skipFile))) {
          return;
        }
        if (filePath.endsWith('.md')) {
          const fileContent = await fsp.readFile(filePath, 'utf8');
          const lines = fileContent.split('\n');
          const relativeFilePath = Doh.toForwardSlash(path.relative(DohPath('/'), filePath));

          // Get file stats and record in fileMap
          const stats = await fsp.stat(filePath);
          fileMap.set(relativeFilePath, stats.size);

          // Generate TOC entries only if not skipping
          if (!skipToc) {
            lines.forEach((line, index) => {
              if (line.startsWith('#')) {
                const level = line.match(/^#+/)[0].length;
                const title = line.replace(/^#+\s*/, '').replace(/\n\r*/, '').trim();
                const link = (title.toLowerCase().replace(/[^\w\s-]/g, '')).trim().replace(/\s+/g, '-');
                toc.push(`${'  '.repeat(level - 1)}- ${title}`);
              }
            });
          }

          manifest[relativeFilePath] = fileContent;
        }
      });
    } catch (error) {
      console.error('Error during documentation compilation:', error);
    }

    // Generate TOC string only if not skipping
    const tocString = skipToc ? '' : '# Table of Contents\n\n' + toc.join('\n') + '\n\n---\n\n';

    if (type === 'yaml') {
      try {
        const manifestWithToc = skipToc ? manifest : { 'Table of Contents': tocString, ...manifest };
        const manifestString = (YAML.stringify(manifestWithToc)).replace(/\r/g, '');
        const targetFilePath = outputFile + '.yaml';
        // await this.safeUnlink(targetFilePath); // Ensure file is clear before writing -- Removed
        await fsp.writeFile(targetFilePath, manifestString);
        console.log('Documentation compiled successfully to ' + targetFilePath + (skipToc ? ' without TOC.' : ' with TOC.'));
      } catch (error) {
        console.error('Error during documentation compilation:', error.message);
      }
    } else if (type === 'md') {
      try {
        const manifestString = skipToc ? Object.values(manifest).join('\\n') : tocString + Object.values(manifest).join('\\n');
        const targetFilePath = outputFile + '.md';
        // await this.safeUnlink(targetFilePath); // Ensure file is clear before writing -- Removed
        await fsp.writeFile(targetFilePath, manifestString);
        console.log('Documentation compiled successfully to ' + targetFilePath + (skipToc ? ' without TOC.' : ' with TOC.'));
      } catch (error) {
        console.error('Error during documentation compilation:', error.message);
      }
    } else if (type === 'json') {
      try {
        const manifestWithToc = skipToc ? manifest : { 'Table of Contents': tocString, ...manifest };
        const manifestString = JSON.stringify(manifestWithToc, null, 2);
        const targetFilePath = outputFile + '.json';
        // await this.safeUnlink(targetFilePath); // Ensure file is clear before writing -- Removed
        await fsp.writeFile(targetFilePath, manifestString);
        console.log('Documentation compiled successfully to ' + targetFilePath + (skipToc ? ' without TOC.' : ' with TOC.'));
      } catch (error) {
        console.error('Error during documentation compilation:', error.message);
      }
    } else if (type === 'txt') {
      try {
        const manifestWithToc = skipToc ? manifest : { 'Table of Contents': tocString, ...manifest };
        const manifestString = Object.values(manifestWithToc).join('\\n');
        const targetFilePath = outputFile + '.txt';
        // await this.safeUnlink(targetFilePath); // Ensure file is clear before writing -- Removed
        await fsp.writeFile(targetFilePath, manifestString);
        console.log('Documentation compiled successfully to ' + targetFilePath + (skipToc ? ' without TOC.' : ' with TOC.'));
      } catch (error) {
        console.error('Error during documentation compilation:', error.message);
      }
    } else if (type === 'json-txt') {
      try {
        const manifestWithToc = skipToc ? manifest : { 'Table of Contents': tocString, ...manifest };
        const manifestString = JSON.stringify(manifestWithToc, null, 2);
        const targetFilePath = outputFile + '.txt';
        // await this.safeUnlink(targetFilePath); // Ensure file is clear before writing -- Removed
        await fsp.writeFile(targetFilePath, manifestString);
        console.log('Documentation compiled successfully to ' + targetFilePath + (skipToc ? ' without TOC.' : ' with TOC.'));
      } catch (error) {
        console.error('Error during documentation compilation:', error.message);
      }
    }
    
    // Log the included files and their sizes
    const totalSize = Array.from(fileMap.values()).reduce((sum, size) => sum + size, 0);
    const totalSizeKB = (totalSize / 1024).toFixed(2);
    const mappedObj = Object.fromEntries(fileMap);
    console.log(' ');
    console.log('Included files and their sizes:');
    console.log('================================');
    console.log(mappedObj);
    console.log(`Total files included: ${fileMap.size}`);
    console.log(`Total size: ${totalSizeKB} KB`);

    // log the manifest list to the console
    // console.log(Object.keys(manifest));
  }


  //MARK: PM2
  async setPM2(option) {
    const compiledPodPath = DohPath('/.doh/compiled.pod.yaml');
    const compiledPodContent = await fsp.readFile(compiledPodPath, 'utf8');
    const compiledPodYaml = YAML.parse(compiledPodContent) || {};

    const pm2Config = compiledPodYaml.pm2 || {};

    // const isWindows = process.platform === 'win32';
    // let whichDoh;
    // try {
    //   whichDoh = execSync(isWindows ? 'where doh.exe' : 'which doh', { stdio: 'pipe' });
    // } catch (error) {
    //   whichDoh = '';
    // }
    // const whichBun = execSync(isWindows ? 'where bun.exe' : 'which bun', { stdio: 'pipe' });
    // const whichNode = execSync(isWindows ? 'where node.exe' : 'which node', { stdio: 'pipe' });

    // const interpreter = pm2Config.interpreter || whichDoh.toString().trim() || whichBun.toString().trim() || whichNode.toString().trim() || '~/.bun/bin/bun';


    // Use defaults for any missing properties
    const config = {
      name: pm2Config.name || compiledPodYaml.express_config?.servername || compiledPodYaml.express_config?.hostname || compiledPodYaml.name || 'doh',
      args: (pm2Config.args === '' || pm2Config.args) ? pm2Config.args : 'run',
      // interpreter: interpreter,
    };

    // allowed options:
    // node doh pm2 [setup|start|stop|restart|delete|log|tail]
    if (option) {
      switch (option) {
        case 'stop':
          execSync(`pm2 stop ${config.name}`, { stdio: 'inherit' });
          break;
        case 'restart':
          execSync(`pm2 restart ${config.name}`, { stdio: 'inherit' });
          break;
        case 'delete':
          execSync(`pm2 delete ${config.name}`, { stdio: 'inherit' });
          break;
        case 'log':
          execSync(`pm2 log ${config.name}`, { stdio: 'inherit' });
          break;
      }
      if (option !== 'setup') {
        return;
      }
    }
    // option is setup or nothing:

    // Convert the config to a command-line argument string
    const configArgs = Object.entries(config)
      .map(([key, value]) => {
        if (key === 'args') return ``;
        if (typeof value === 'boolean') return value ? `--${key}` : '';
        if (typeof value === 'object') return `--${key} '${JSON.stringify(value)}'`;
        return `--${key} ${value}`;
      })
      .filter(Boolean)
      .join(' ');

    // Execute the PM2 command
    const command = `pm2 start doh.js ${configArgs} -- ${config.args}`;
    execSync(command, { stdio: 'inherit' });
    execSync('pm2 save', { stdio: 'inherit' });

    console.log('PM2 configuration applied and saved.');
    console.warn('Don\'t forget to run `pm2 startup` to enable auto-start on boot.');
  }


  //MARK: Export
  async Export(podfile = '/pod.yaml') {
    let type = 'html';
    const args_pod = await Doh.fetch_pod(podfile);
    await Doh.run_packager(args_pod);
    const exportFile = DohPath('/dist/export/doh.html');
    // ensure the export directory exists
    await fsp.mkdir(DohPath('/dist/export'), { recursive: true });

    // Create write stream
    const writeStream = fs.createWriteStream(exportFile);

    // Helper function to write to stream and handle backpressure
    const writeToStream = (content) => {
      return new Promise((resolve, reject) => {
        const canContinue = writeStream.write(content);
        if (!canContinue) {
          writeStream.once('drain', resolve);
        } else {
          resolve();
        }
      });
    };

    try {

      // make a copy of the packages manifest
      let loadablesManifest = JSON.parse(JSON.stringify(Doh.Packages));

      // remove the loadables that the pod is configured to exclude
      if (Doh.pod.export_exclude_loadables) {
        // remove the loadables from the manifest so they are not expanded below
        for (const loadable of Doh.pod.export_exclude_loadables) {
          delete loadablesManifest[loadable];
        }
      }

      // remove the loadables that are expected to be external to the pod
      if (Doh.pod.expected_external_doh_modules) {
        for (const module of Doh.pod.expected_external_doh_modules) {
          delete loadablesManifest[module];
        }
      }

      // if the pod is configured to export explicit doh modules, 
      // then only expand those modules and remove the rest
      let explicitDohModules = {};
      if (Doh.pod.export_explicit_doh_modules) {
        for (const module of Doh.pod.export_explicit_doh_modules) {
          explicitDohModules[module] = loadablesManifest[module];
        }
        loadablesManifest = explicitDohModules;
      }

      const loadablesObjs = {};
      const filter = (loadable) => {
        const loadObj = Doh.parse_load_statement(loadable);
        if (Doh.pod.export_exclude_loadables && Doh.pod.export_exclude_loadables.includes(loadObj.from)) {
          return false;
        }
        if (loadObj.conditions && loadObj.conditions.includes('nodejs')) {
          return false;
        }
        loadablesObjs[loadObj.from] = loadObj;
        return true;
      }

      // Process loadables
      const loadables = await Doh.expand_loadables(Doh.pod.export_load, loadablesManifest, filter);

      // Write HTML header
      await writeToStream(`<html>\n  <head>\n    <title>Doh.js</title>\n`);

      // Load and write import map
      const importMapPath = DohPath('/doh_js/manifests/browser_esm_manifest.json');
      const importMapContent = await fsp.readFile(importMapPath, 'utf8');
      const importMap = JSON.parse(importMapContent);

      await writeToStream('    <script type="importmap">\n      {"imports": ');

      // Process and write import map entries in chunks
      for (const [key, src] of Object.entries(importMap)) {
        // only write if the key is a key in loadablesObjs
        if (loadablesObjs[key]) {
          let content;
          if (src.startsWith('./') || src.startsWith('../') || src.startsWith('/')) {
            content = await fsp.readFile(DohPath(src), 'utf8');
          } else if (src.startsWith('http') || src.startsWith('https')) {
            const response = await fetch(src);
            content = await response.text();
          }
          importMap[key] = `data:text/javascript;charset=utf-8,${encodeURIComponent(content)}`;
        } else {
          delete importMap[key];
        }
      }
      await writeToStream(JSON.stringify(importMap));
      await writeToStream('}\n    </script>\n');

      // Handle scripts
      const loadableScriptsList = loadables.filter(loadable => loadable.endsWith('.js'));
      for (const file of loadableScriptsList) {
        let content;
        if (file.startsWith('./') || file.startsWith('../') || file.startsWith('/')) {
          content = await fsp.readFile(DohPath(file), 'utf8');
        } else if (file.startsWith('http') || file.startsWith('https')) {
          const response = await fetch(file);
          content = await response.text();
        } else {
          content = await fsp.readFile(DohPath(file), 'utf8');
        }
        await writeToStream(`    <script>${content}</script>\n`);
      }

      // Handle stylesheets
      const loadableStylesheetsList = loadables.filter(loadable => loadable.endsWith('.css'));
      for (const file of loadableStylesheetsList) {
        let content;
        if (file.startsWith('./') || file.startsWith('../') || file.startsWith('/')) {
          content = await fsp.readFile(DohPath(file), 'utf8');
        } else if (file.startsWith('http') || file.startsWith('https')) {
          const response = await fetch(file);
          content = await response.text();
        } else {
          content = await fsp.readFile(DohPath(file), 'utf8');
        }
        await writeToStream(`    <style>${content}</style>\n`);
      }

      // Write body opening
      await writeToStream('  </head>\n  <body style="background-color: #222222; color: #ffffff;">\n');

      // Load and process required manifests
      const [browserPod, packageManifest, corePatternsManifest, patternsManifest, assetsManifest] = await Promise.all([
        podfile !== '/pod.yaml' ? JSON.stringify((await Doh.build_pod(podfile, Doh.pod)).browser_pod) : fsp.readFile(DohPath('/doh_js/manifests/browser_pod.json'), 'utf8'),
        fsp.readFile(DohPath('/doh_js/manifests/package_manifest.json'), 'utf8'),
        fsp.readFile(DohPath('/doh_js/manifests/core_patterns_manifest.json'), 'utf8'),
        fsp.readFile(DohPath('/doh_js/manifests/patterns_manifest.json'), 'utf8'),
        fsp.readFile(DohPath('/doh_js/manifests/assets_manifest.json'), 'utf8'),
      ]);

      let deploy;
      if (!Doh.pod.export_explicit_doh_modules) {
        deploy = await fsp.readFile(DohPath('/doh_js/deploy.js'), 'utf8');
      }

      // Process loadable modules
      const loadableModulesMap = loadables
        .filter(loadable => Doh.Packages[loadable] && Doh.Packages[loadable].file)
        .reduce((acc, loadable) => {
          acc[loadable] = Doh.Packages[loadable].file;
          return acc;
        }, {});
      const loadableModulesList = Array.from(new Set(Object.values(loadableModulesMap)));

      //process the asset manifest
      const vfs = {};
      const assetsManifestContent = JSON.parse(assetsManifest);
      // will be an object with module_names as keys and arrays of paths as values
      for (const [module_name, paths] of Object.entries(assetsManifestContent)) {
        if (loadablesObjs[module_name]) {
          for (const path of paths) {
            if (Doh.pod.export_exclude_loadables && Doh.pod.export_exclude_loadables.includes(path)) {
              continue;
            }
            const fileContent = await fsp.readFile(DohPath(path));
            const base64Content = Buffer.from(fileContent).toString('base64');
            vfs[path] = `data:application/octet-stream;base64,${base64Content}`;
          }
        }
      }

      if (Doh.pod.export_explicit_doh_modules) {
        await writeToStream('    <script>\n');
        await writeToStream(`
        (async()=>{
          const old = document.querySelector('script[type=importmap]'),
                m   = JSON.parse(old.textContent);
          m.imports = m.imports||{};
          m.imports['/doh_js/deploy.js'] =
            'data:application/javascript;charset=utf-8,' +
            encodeURIComponent(await (await fetch('./doh_js/deploy.js')).text());
          const s = document.createElement('script');
          s.type = 'importmap';
          s.textContent = JSON.stringify(m);
          old.replaceWith(s);
        })();\n`);
        await writeToStream('    </script>\n');
      }

      // Write main script content
      await writeToStream('    <script type="module">\n');
      await writeToStream('      globalThis.DohOptions = globalThis.DohOptions || {};\n');
      await writeToStream(`      DohOptions.browser_pod = ${browserPod};\n`);
      await writeToStream(`      DohOptions.Packages = ${JSON.stringify(JSON.parse(packageManifest))};\n`);
      await writeToStream(`      DohOptions.CorePatterns = ${JSON.stringify(JSON.parse(corePatternsManifest))};\n`);
      await writeToStream(`      DohOptions.PatternModule = ${JSON.stringify(JSON.parse(patternsManifest))};\n`);
      await writeToStream(`      DohOptions.PreloadedPackages = ${JSON.stringify(loadableModulesMap)};\n`);
      await writeToStream(`      DohOptions.PreloadedScripts = ${JSON.stringify(loadableScriptsList)};\n`);
      await writeToStream(`      DohOptions.PreloadedStylesheets = ${JSON.stringify(loadableStylesheetsList)};\n\n`);

      await writeToStream('      DohOptions.VFS = {};\n');
      // we can't stringify the whole fs, so write each file
      for (const [path, content] of Object.entries(vfs)) {
        await writeToStream(`      DohOptions.VFS['${path}'] = "${content}";\n`);
      }

      if (deploy) {
        await writeToStream(`      ${deploy}\n\n`);
      } else {
        await writeToStream(`      await import('./doh_js/deploy.js');\n`);
      }

      for (const loadable of loadableModulesList) {
        // read the file and write it to the stream
        const content = await fsp.readFile(DohPath(loadable), 'utf8');
        await writeToStream(`      ${content.replace(/<\/script>/g, '<\\/script>')};\n`);
      }

      await writeToStream('      await Doh.load("html");\n');

      if (Doh.pod.expected_external_doh_modules) {
        for (const module of Doh.pod.expected_external_doh_modules) {
          if (!Doh.Packages[module].file) continue;
          await writeToStream(`      await import('.${Doh.Packages[module].file}');\n`);
        }
      }


      await writeToStream(`      await Doh.load(${JSON.stringify(Doh.pod.export_load)});\n`);
      await writeToStream('    </script>\n');

      // Write HTML footer
      await writeToStream('  </body>\n</html>');

    } catch (error) {
      console.error('Error during export:', error);
      writeStream.destroy(error);
      throw error;
    } finally {
      // Close the write stream
      writeStream.end();
    }

    // Wait for the stream to finish
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    console.log(`Export completed: ${exportFile}`);
  }


  //MARK: Helper methods
  async removeDirectory(dir) {
    await fsp.rm(dir, { recursive: true, force: true });
  }
  async walkDirectory(dir, callback) {
    // this needs to fail more gracefully
    try {
      await fsp.access(dir);
    } catch {
      return;
    }
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walkDirectory(fullPath, callback);
      } else {
        await callback(fullPath);
      }
    }
  }
  async fileExists(filePath) {
    try {
      await fsp.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  async getFileHash(filePath) {
    const fileBuffer = await fsp.readFile(filePath);
    return crypto.createHash('md5').update(fileBuffer).digest('hex');
  }
  async safeUnlink(filePath) {
    try {
      await fsp.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      } else {
        console.log(`File ${filePath} does not exist. Skipping unlink...`);
      }
    }
  }

  async copyRecursive(src, dest) {
    const entries = await fsp.readdir(src, { withFileTypes: true });
    await fsp.mkdir(dest, { recursive: true });

    for (let entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyRecursive(srcPath, destPath);
      } else {
        await fsp.copyFile(srcPath, destPath);
      }
    }
  }
  encodeDohballHost(host) {
    return encodeURIComponent(host.replace(/[^a-zA-Z0-9]/g, '_'));
  }


  //MARK: Confirmation
  async confirmWarning(action) {
    // Check for --confirm-all flag
    if (process.argv.includes('--confirm-all')) {
      return true;
    }

    // Show a nice intro message
    p.intro('!!! WARNING !!!');
    
    const confirmed = await p.confirm({
      message: `This operation will ${action}.\n\nDo you want to proceed?`,
      initialValue: true
    });

    if (p.isCancel(confirmed)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }

    return confirmed;
  }

  async confirmAction(action) {
    // Check for --confirm-all flag
    if (process.argv.includes('--confirm-all')) {
      return true;
    }

    p.intro(action);

    const confirmed = await p.confirm({
      message: 'Are you sure?',
      initialValue: true
    });

    if (p.isCancel(confirmed)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }

    return confirmed;
  }

  askQuestion(query) {
    // Check for --confirm-all flag
    if (process.argv.includes('--confirm-all')) {
      return Promise.resolve('y');
    }

    // For backward compatibility, keep this method but use clack's text input
    return p.text({
      message: query.replace('> ', '').trim() || 'Please enter your response:'
    }).then(answer => {
      if (p.isCancel(answer)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
      }
      return answer;
    });
  }


  //MARK: Time
  formatTimeAgo(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    const intervals = [
      { label: 'year', seconds: 31536000 },
      { label: 'month', seconds: 2592000 },
      { label: 'day', seconds: 86400 },
      { label: 'hour', seconds: 3600 },
      { label: 'minute', seconds: 60 },
      { label: 'second', seconds: 1 }
    ];

    for (let i = 0; i < intervals.length; i++) {
      const interval = intervals[i];
      const count = Math.floor(diffInSeconds / interval.seconds);
      if (count >= 1) {
        return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
      }
    }

    return 'just now';
  }
}


// MARK: Help
// Define core CLI commands
Doh.CLI('doh_js', {
  'status': {
    file: '/doh_js/dohtools.js',
    help: 'Show status of installed Dohballs (`doh status verbose` to show slightly more information)'
  },
  'run': {
    file: '/doh_js/dohtools.js',
    help: 'Run Doh pod with streaming output (`doh run help` for options: no-pack, custom podfile)'
  },
  'pod': {
    file: '/doh_js/dohtools.js',
    help: 'Show or set pod settings using dot notation (e.g., `doh pod express_config.port` to show, `doh pod express_config.port 3000` to set, `doh pod ~~express_config.port true` to remove)'
  },
  'inherits': {
    file: '/doh_js/dohtools.js',
    help: 'Add or remove paths from the inherits list in pod.yaml (use ~ to remove)'
  },
  'host_load': {
    file: '/doh_js/dohtools.js',
    help: 'Add or remove packages from the host_load list in pod.yaml (use ~ to remove)'
  },
  'dohball_host': {
    file: '/doh_js/dohtools.js',
    help: 'Add or remove hosts from the dohball_host list in pod.yaml (use ~ to remove)'
  },
  'update': {
    file: '/doh_js/dohtools.js',
    help: 'Run the auto-packager alone. This is also run automatically when you run Doh.'
  },
  'install': {
    file: '/doh_js/dohtools.js',
    help: 'Install Packages (`doh install package package ...package`)'
  },
  'upgrade': {
    file: '/doh_js/dohtools.js',
    help: 'Upgrade packages (`doh upgrade` for all or `doh upgrade package package ...package`)'
  },
  'reinstall': {
    file: '/doh_js/dohtools.js',
    help: 'Download and install ALL packages (`doh reinstall` for all or `doh reinstall package package ...package`)'
  },
  'bake': {
    file: '/doh_js/dohtools.js',
    help: 'Bake-if-needed exposed Dohballs (`doh bake` for all eligible, `doh bake pkg1 pkg2` for specific packages)'
  },
  'rebake': {
    file: '/doh_js/dohtools.js',
    help: 'Forcibly rebake exposed Dohballs (`doh rebake` for all eligible, `doh rebake pkg1 pkg2` for specific packages)'
  },
  'compile-dohball-manifest': {
    file: '/doh_js/dohtools.js',
    help: 'Create the Dohball hosting manifest from locally hosted Dohballs'
  },
  'do-removals': {
    file: '/doh_js/dohtools.js',
    help: 'Do the removals from the dohball.json files'
  },
  'clear-pod': {
    file: '/doh_js/dohtools.js',
    help: 'Clear ONLY the pod cache and manifest (Add ` force or --confirm-all` to bypass confirmation)'
  },
  'clear-packager': {
    file: '/doh_js/dohtools.js',
    help: 'Clear ALL auto-packaged manifests and parsing caches (Add ` force or --confirm-all` to bypass confirmation)'
  },
  'clear-build': {
    file: '/doh_js/dohtools.js',
    help: 'Clear build directory at /dist containing compiled bundles (Add ` force or --confirm-all` to bypass confirmation)'
  },
  'clear-all': {
    file: '/doh_js/dohtools.js',
    help: 'Run all clear commands (Add ` force` to bypass confirmation)'
  },
  'codify': {
    file: '/doh_js/dohtools.js',
    help: 'Create an auto-versioned backup (codex) of the project (auto-run when upgrading/reinstalling)'
  },
  'enshrine': {
    file: '/doh_js/dohtools.js',
    help: 'Create a tagged shrine from the latest codex (`doh enshrine <tag>`)'
  },
  'enact': {
    file: '/doh_js/dohtools.js',
    help: 'Restore the project from a codex backup (offers a menu of available codex backups)'
  },
  'compile-docs': {
    file: '/doh_js/dohtools.js',
    help: 'Compile the Doh documentation (Defaults to /doh_js/manifests/doh.md)(`doh compile-docs [yaml|json]` to compile to yaml or json)'
  },
  'pm2': {
    file: '/doh_js/dohtools.js',
    help: 'Set PM2 to run Doh and save the configuration (`doh pm2 [setup|stop|restart|delete|log]`)(Set options in pod.yaml:pm2 section)'
  },
  'export': {
    file: '/doh_js/dohtools.js',
    help: 'Export a Doh module entrypoint to a static file (html only currently)'
  }
});


// MARK: Command handler
async function runCoreCommand(passed_args, ...addl_args) {
  const tools = new DohTools();

  if (!passed_args) {
    passed_args = process.argv;
  } else if (IsString(passed_args)) {
    // if we passed args, then we need to imitate the process.argv
    passed_args = ['node', 'doh', ...(passed_args.split(' ')), ...addl_args];
  } else if (IsArray(passed_args)) {
    // if we passed args, then we need to imitate the process.argv
    passed_args = ['node', 'doh', ...passed_args, ...addl_args];
  }

  const [, , command, ...args] = passed_args;

  try {
    switch (command) {
      case 'install':
        return tools.installPackage();
      case 'status':
        return tools.getStatus(args[0]);
      case 'update':
        return tools.pack();
      case 'upgrade':
        return tools.upgradeDohballs();
      case 'reinstall':
        return tools.reinstallDohballs();
      case 'pod':
        return tools.managePodValue(args[0], args[1]);
      case 'inherits':
        return tools.updatePodInherits(args);
      case 'host_load':
        return tools.updateHostLoad(args);
      case 'dohball_host':
        return tools.updateDohballHost(args);
      case 'bake':
        return tools.bake();
      case 'rebake':
        return tools.rebake();
      case 'compile-dohball-manifest':
        return tools.createDohballManifestFromExposedDohballs();
      case 'do-removals':
        return tools.doRemovals();
      case 'clear-pod':
        return tools.clearPod();
      case 'clear-packager':
        return tools.clearAutoPackagerOutput();
      case 'clear-doh-cache':
        return tools.clearDohCache();
      case 'clear-build':
        return tools.clearDistDirectory();
      case 'clear-all':
        return tools.clearAll();
      case 'codify':
        return tools.codify();
      case 'enshrine':
        return tools.enshrine(args[0]);
      case 'enact':
        return tools.enact(args[0]);
      case 'compile-docs':
        return tools.compileDocs(args[0]);
      case 'pm2':
        return tools.setPM2(args[0]);
      case 'export':
        return tools.Export(args[0]);
      case 'run':
      default:
        return tools.Run(args[0]);
    }
  } catch (error) {
    console.error(`Failed to run core command: ${error}`);
    throw error;
  }
};

Doh.Globals.DohTools = DohTools;

export default DohTools;
export { runCoreCommand };
