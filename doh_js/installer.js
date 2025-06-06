import fs, { promises as fsp } from 'fs';
import axios from 'axios';
import tarFs from 'tar-fs';
import zlib from 'zlib';
import semver from 'semver';
import path from 'path';
import { spawn } from 'child_process';
import { confirm } from '@clack/prompts';

Doh.installationChanged = false;

Doh.installStats = {
  totalPackages: 0,
  packagesToUpdate: 0,
  dohballsToInstall: 0,
  npmDepsToInstall: 0,
  upgradeSummary: [],
  dohballIssues: new Map(),
  npmUpdates: [],
  installationChanged: false
};

const { colorize, header_color, info_color, text_color, number_color, error_color, warn_color, hidden_color } = Doh.colorizer();


// Modify logging functions to use colors
async function logInstallAction(message) {
  console.log(colorize(message, info_color));
}

async function logInstallWarn(message) {
  console.warn(colorize('WARNING: ', warn_color) + message);
}

async function logInstallError(message) {
  console.error(colorize('ERROR: ', error_color) + message);
}

async function confirmAction(action) {
  // Check for --confirm-all flag
  if (process.argv.includes('--confirm-all')) {
    return true;
  }
  
  const result = await confirm({
    message: colorize(action, warn_color),
    initialValue: true
  });
  
  return result;
}

async function downloadAndExtractDohball(packageName, targetPath, dohballHost) {
  // don't allow installing to the doh_js directory or its parent, the project root
  const safeTargetPath = path.resolve(DohPath(targetPath));
  const safeDohJsPath = path.resolve(DohPath('/doh_js'));
  const safeProjectRootPath = path.resolve(DohPath('/'));
  const backupPath = DohPath(Doh.toForwardSlash(path.join(`/.doh/${Doh.encodeDohballHostForDohPath(dohballHost)}/`, targetPath)));

  if (safeTargetPath === safeProjectRootPath || safeTargetPath.startsWith(safeDohJsPath + path.sep)) {
    //console.warn(`Invalid target path: ${targetPath} for package ${packageName}. Skipping.`);
    return;
  }

  try {
    const response = await axios.get(`${dohballHost}/dohball/${packageName}`, {
      responseType: 'stream'
    });

    await ensureDir(backupPath);

    // empty the backup directory
    await fsp.rm(backupPath, { recursive: true, force: true });

    await new Promise((resolve, reject) => {
      response.data
        .pipe(zlib.createGunzip())
        .pipe(tarFs.extract(backupPath))
        .on('finish', resolve)
        .on('error', reject);
    });

    // Check for files to remove from the dohball.json in the extracted backup
    let filesToRemove = [];
    try {
      const dohballJsonPath = path.join(backupPath, 'dohball.json');
      if (fs.existsSync(dohballJsonPath)) {
        const dohballJson = JSON.parse(await fsp.readFile(dohballJsonPath, 'utf8'));
        if (dohballJson.removals && Array.isArray(dohballJson.removals)) {
          filesToRemove = dohballJson.removals;
        }
      }
    } catch (error) {
      await logInstallError(`  Error reading dohball.json for removals in ${packageName}: ${error.message}`);
    }

    await ensureDir(targetPath);

    // Copy from backup to target
    await copyRecursive(backupPath, targetPath);

    // Process removals - remove files that are listed in the removals array
    if (filesToRemove.length > 0) {
      await logInstallWarn(`  Processing ${filesToRemove.length} file removals for ${packageName}`);
      
      // Track directories that might need cleanup
      const dirsToCheck = new Set();
      
      // Remove each file
      for (const filePath of filesToRemove) {
        // Convert DohSlash path to absolute path
        const relativePath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
        const fullPath = path.join(targetPath, relativePath);
        
        try {
          if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
            await fsp.unlink(fullPath);
            // Add parent directory to check list
            dirsToCheck.add(path.dirname(fullPath));
          }
        } catch (error) {
          await logInstallError(`  Error removing file ${relativePath} from ${packageName}: ${error.message}`);
        }
      }
      
      // Clean up empty directories (deepest first)
      const sortedDirs = Array.from(dirsToCheck)
        .sort((a, b) => b.split(path.sep).length - a.split(path.sep).length);
      
      for (const dir of sortedDirs) {
        try {
          const dirContents = await fsp.readdir(dir);
          if (dirContents.length === 0) {
            await fsp.rmdir(dir);
            // Add parent directory to potentially clean up
            const parentDir = path.dirname(dir);
            if (parentDir !== targetPath && !sortedDirs.includes(parentDir)) {
              sortedDirs.push(parentDir);
            }
          }
        } catch (error) {
          // Ignore errors when checking directories
        }
      }
    }

    await logInstallWarn(`  Installed ${packageName} to ${targetPath} from ${dohballHost}`);

    // this means that the packager needs to run again
    Doh.installationChanged = true;
  } catch (error) {
    await logInstallError(`  Error installing dohball ${packageName} from ${dohballHost}: ${error + ''}`);
    throw error;
  }
}

async function ensureDir(dir) {
  try {
    await fsp.mkdir(dir, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

async function copyRecursive(src, dest) {
  const stats = await fsp.stat(src);
  if (stats.isDirectory()) {
    await ensureDir(dest);
    await fsp.chmod(dest, 0o755);  // Set directory permissions
    const entries = await fsp.readdir(src);
    for (const entry of entries) {
      await copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    try {
      await fsp.copyFile(src, dest);
      await fsp.chmod(dest, 0o644);  // Set file permissions
    } catch (error) {
      if (error.code === 'ENOENT') {
        await ensureDir(path.dirname(dest));
        await fsp.copyFile(src, dest);
        await fsp.chmod(dest, 0o644);  // Set file permissions
      } else {
        throw error;
      }
    }
  }
}

function spawnPackageManagerCommand(args, cwd = process.cwd(), withOutput = true) {
  return new Promise((resolve, reject) => {
    let command, packageManager;
    
    // Determine which package manager to use
    if (IsBun()) {
      packageManager = 'bun';
    } else {
      // Default to npm
      packageManager = 'npm';
    }
    
    // Use the .cmd extension on Windows for npm
    command = process.platform === 'win32' && packageManager === 'npm' ? 'npm.cmd' : packageManager;
    
    const pm = spawn(command, args, { 
      cwd,
      shell: true, // This helps with cross-platform compatibility
    });
    
    if (withOutput) {
      pm.stdout.on('data', (data) => {
        console.log(data.toString());
      });
    
      pm.stderr.on('data', (data) => {
        console.error(data.toString());
      });
    }
    
    pm.on('close', (code) => {
      if (code === 0) {
        // run `bun pm trust --all` if bun
        if (IsBun() && args[0] !== 'trust') {
          spawnPackageManagerCommand(['pm', 'trust', '--all'], cwd, false);
        }
        resolve();
      } else {
        reject(new Error(`${packageManager} process exited with code ${code}`));
      }
    });
  });
}

async function updatePackageJson() {
  if (Doh.pod.always_confirm_changes) {
    if (await confirmAction('package.json has changed since last run. Run package install to sync up before continuing?')) {
      await logInstallWarn('Running package install');
      await spawnPackageManagerCommand(['install']);
    }
  } else {
    await logInstallWarn('package.json has changed since last run. Running package install to sync up before continuing.');
    await spawnPackageManagerCommand(['install']);
  }
}

async function updatePackageDependencies(npmInstalls) {
  // console.log(colorize('Checking package dependencies...', header_color));
  const packageJsonPath = DohPath('/package.json');
  let packageJson;
  try {
    packageJson = JSON.parse(await fsp.readFile(packageJsonPath, 'utf8'));
  } catch (error) {
    console.error('  Error reading package.json:', error.message);
    packageJson = { dependencies: {} };
  }

  // Check if the package.json has changed by comparing it to the cached version
  try {
    const cachedPackageJson = JSON.parse(await fsp.readFile(DohPath('/.doh/package.cache.json'), 'utf8'));
    if (JSON.stringify(packageJson) !== JSON.stringify(cachedPackageJson)) {
      await updatePackageJson();
    }
  } catch (error) {
    // If the cache file doesn't exist, run package install to sync up
    await updatePackageJson();
  }

  let depsToInstall = [];
  Doh.installStats.npmUpdates = [];

  for (let [dep, version] of Object.entries(npmInstalls)) {
    if (!dep.startsWith('npm:')) continue;
    dep = dep.slice(4);

    const currentVersion = packageJson.dependencies[dep];

    // If the dependency is not in package.json or the version doesn't satisfy the requirement
    if (!currentVersion || (version && !semver.satisfies(semver.coerce(currentVersion), version))) {
      if (Doh.pod.always_update_npm_dependencies) {
        depsToInstall.push(version ? `${dep}@${version}` : dep);
      } else {
        logInstallWarn(`  Dependency ${dep}${version ? `@${version}` : ''} not found or doesn't satisfy requirement (current: ${currentVersion || '(none)'}).`);
      }
      Doh.installStats.npmUpdates.push({
        name: dep,
        currentVersion: currentVersion || 'none',
        requestedVersion: version || 'latest'
      });
    }
  }

  Doh.installStats.npmDepsToInstall = depsToInstall.length;

  if (depsToInstall.length > 0) {
    if (Doh.pod.always_confirm_changes && !await confirmAction(`Install/upgrade ${colorize(depsToInstall.length, number_color)} package dependencies: ${colorize(depsToInstall.join(', '), info_color)}?`)) {
      await logInstallWarn(`User skipped installing/upgrading package dependencies: ${depsToInstall.join(', ')}`);
    } else {
      // console.log(colorize('  Installing/updating package dependencies: ', text_color) + colorize(depsToInstall.join(', '), info_color));
      try {
        await spawnPackageManagerCommand(['install', ...depsToInstall]);
        await logInstallWarn(`Installed/upgraded package dependencies: ${depsToInstall.join(', ')}`);
      } catch (error) {
        await logInstallError(`Error installing/upgrading package dependencies: ${error.message}`);
      }
    }
  } else if (!Doh.pod.always_update_npm_dependencies) {
    // console.log(colorize(`  (${colorize(depsToInstall.length, number_color)}`, text_color) + colorize(' dependencies have been installed/upgraded).', text_color));
  } else {
    // console.log(colorize('  No package dependencies have been installed/upgraded.', text_color));
  }

  // Store a copy of the package.json file in the .doh directory
  await ensureDir(DohPath('/.doh'));
  await fsp.copyFile(packageJsonPath, DohPath('/.doh/package.cache.json'));

  return depsToInstall;
}

function expandDependencies(deps, manifest, faux_conditions = null) {
  let allDeps = new Set();
  let processedPaths = new Set();

  function addDepsRecursively(dep) {
    const loadObj = Doh.parse_load_statement(dep);
    const cleanDep = loadObj.from;
    if (allDeps.has(cleanDep) || !manifest[cleanDep]) return;

    if (IsObjectObjectAndNotEmpty(faux_conditions)) {
      //TODO: check if the faux_conditions are met
    }

    // there's a special mode where we allow the dep to be it's own condition.
    // in this case, we also want it excluded from the install list.
    const conditions = loadObj.conditions || [];
    // if even one of the conditions is dep, we skip
    if (conditions.some(condition => condition === cleanDep)) {
      return;
    }

    allDeps.add(cleanDep);
    const pack_obj = manifest[cleanDep];

    if (pack_obj) {
      // Process load dependencies
      if (pack_obj.load) {
        const loadDeps = Array.isArray(pack_obj.load) ? pack_obj.load : [pack_obj.load];
        loadDeps.forEach(addDepsRecursively);
      }

      // Process other packages in the same path
      if (pack_obj.path && !processedPaths.has(pack_obj.path)) {
        processedPaths.add(pack_obj.path);
        Object.keys(manifest).forEach(otherDep => {
          if (manifest[otherDep].path === pack_obj.path) {
            addDepsRecursively(otherDep);
          }
        });
      }
    }
  }

  // Start with the initial deps
  (Array.isArray(deps) ? deps : [deps]).forEach(addDepsRecursively);

  return Array.from(allDeps);
}

// collect installs from pre-expanded dependencies that are also packages in a manifest
function collectInstallsFromPackagesInManifest(expandedDeps, manifest) {
  let packages = new Map(); // Map of package name to path
  let npmInstalls = {};

  for (const dep of expandedDeps) {
    const pack_obj = manifest[dep];
    if (pack_obj) {
      packages.set(dep, pack_obj.path);

      if (pack_obj.install) {
        if (typeof pack_obj.install === 'string') {
          npmInstalls[pack_obj.install] = '';
        } else if (Array.isArray(pack_obj.install)) {
          pack_obj.install.forEach(inst => npmInstalls[inst] = '');
        } else if (typeof pack_obj.install === 'object') {
          Object.assign(npmInstalls, pack_obj.install);
        }
      }
    }
  }

  return { packages, npmInstalls };
}

async function selectDohballsToInstall(packages, compiledDohballManifests) {
  // Track which package paths we've decided to skip or install
  let pathsSkipped = new Set();
  let pathsToInstall = new Set();
  // Maps package paths to their package names for installation
  let dohballsToInstall = new Map();
  // Stores issues found with dohballs during validation
  let hasDohballIssues = new Map();

  // Initialize/reset installation statistics
  Doh.installStats.totalPackages = packages.size;
  Doh.installStats.packagesToUpdate = 0;
  Doh.installStats.upgradeSummary = [];

  // Iterate through each package and its target installation path
  for (const [packageName, packagePath] of packages) {
    // Convert relative path to full system path
    const fullPath = DohPath(packagePath);
    // Get package info from remote manifest
    const packageInfo = compiledDohballManifests[packageName];
    // Track issues found for this specific package
    const dohballIssues = [];

    // Skip if package isn't in remote manifest
    if (!packageInfo) {
      console.warn(colorize(`  Package ${packageName} not found in remote manifest. Skipping.`, warn_color));
      continue;
    }

    // Get host server for this dohball package
    const dohballHost = packageInfo.dohball_host;
    // Skip if no host is defined for the package
    if (!packageInfo || (packageInfo && !packageInfo.dohball_host)) {
      continue;
    }

    // Get version from remote manifest
    const remoteVersion = packageInfo.version || 0;
    let installedVersion = 0;

    // Try to read version from currently installed package
    try {
      const dohballInstalledJsonPath = path.join(fullPath, 'dohball.json');
      const dohballInstalledJson = JSON.parse(await fsp.readFile(dohballInstalledJsonPath, 'utf8'));
      installedVersion = dohballInstalledJson.version || 0;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(colorize(`  non-fatal Error reading dohball.json for ${packageName}: ${error.message}`, warn_color));
      }
    }

    // Check if package directory exists
    const folderMissing = !fs.existsSync(fullPath);

    // Check if versions don't match
    let versionMismatch = installedVersion !== remoteVersion;

    // Determine if package should be installed based on pod settings:
    // - always_reinstall_dohballs: Always reinstall regardless of version
    // - always_upgrade_dohballs: Install if version mismatch or folder missing
    // - always_restore_dohballs: Install if folder is missing
    const shouldInstall = Doh.pod.always_reinstall_dohballs ||
      (Doh.pod.always_upgrade_dohballs && (versionMismatch || folderMissing)) ||
      (Doh.pod.always_restore_dohballs && folderMissing);

    // Skip installation if package is in a git repository
    if (fs.existsSync(path.join(fullPath, '.git'))) {
      if (shouldInstall && !pathsSkipped.has(packagePath)) {
        console.warn(colorize(`  Skipping installation of ${packagePath} because it is in a sub git repository.`, warn_color));
        pathsSkipped.add(packagePath);
      }
      continue;
    }

    // If package should be installed...
    if (shouldInstall) {
      // Check if a parent path is already marked for installation
      // This prevents installing nested packages multiple times
      let pathAlreadyInstalled = false;
      for (const installedPath of pathsToInstall) {
        if (installedPath === packagePath) {
          pathAlreadyInstalled = true;
          break;
        }
      }
      // Add to installation queue if not already covered
      if (!pathAlreadyInstalled) {
        pathsToInstall.add(packagePath);
        dohballsToInstall.set(packagePath, packageName);
      }
    } else {
      // If not installing but there are version mismatches or missing folders,
      // record the issues for reporting
      if (versionMismatch || folderMissing) {
        dohballIssues.push({ type: 'log', submessage: `  [ ${packagePath} ] @ ${installedVersion}` });
        let warntype = 'log';
        if (installedVersion !== remoteVersion) warntype = 'warn';
        dohballIssues.push({ type: warntype, submessage: `      @ ${remoteVersion} From: ${dohballHost}` });
        if (folderMissing) {
          dohballIssues.push({ type: 'error', submessage: `      Folder Missing.` });
        }
        // Update statistics
        Doh.installStats.packagesToUpdate++;
        Doh.installStats.upgradeSummary.push({
          name: packageName,
          path: packagePath,
          currentVersion: installedVersion,
          newVersion: remoteVersion,
          isMissing: folderMissing,
          host: dohballHost
        });
      }
    }

    // Store any issues found for this package
    if (Object.keys(dohballIssues).length > 0) {
      hasDohballIssues.set(packagePath, dohballIssues);
    }
  }

  // Print all collected issues
  for (const [packagePath, messageArray] of hasDohballIssues) {
    for (const { type, submessage } of messageArray) {
      switch (type) {
        case 'log': console.log(colorize(submessage, text_color)); break;
        case 'warn': console.warn(colorize(submessage, warn_color)); break;
        case 'error': console.error(colorize(submessage, error_color)); break;
      }
    }
  }

  // Update final statistics
  Doh.installStats.dohballsToInstall = dohballsToInstall.size;
  Doh.installStats.dohballIssues = hasDohballIssues;

  return dohballsToInstall;
}

async function installDependencies(compiledDohballManifests) {

  // ensureDir(DohPath('/.doh/manifests'));
  // const installDebugFile = DohPath('/.doh/manifests/doh_install_debug.json');

  // const installDebugObj = { remoteManifest };

  // const localManifest = await Doh.readLocalManifest();
  // installDebugObj.localManifest = localManifest;

  // Read apps.yaml and get modules
  const appsConfig = await Doh.readAppsYaml();
  // installDebugObj.appsConfig = appsConfig;

  const appsModules = Doh.getModulesFromApps(appsConfig.apps);
  // installDebugObj.appsModules = appsModules;

  // Combine Doh.pod.host_load with appsModules
  let hostLoad;
  if (Array.isArray(Doh.pod.host_load)) hostLoad = Doh.pod.host_load
  else if (typeof Doh.pod.host_load === 'string') hostLoad = [Doh.pod.host_load];
  else hostLoad = [];
  hostLoad = [...new Set(hostLoad.concat(appsModules))];
  // installDebugObj.hostLoad = hostLoad;

  // 1. Expand dependencies
  const expandedDeps = expandDependencies(hostLoad, compiledDohballManifests);
  // installDebugObj.expandedDeps = expandedDeps;

  // 2. Collect packages and install commands
  const { packages } = collectInstallsFromPackagesInManifest(expandedDeps, compiledDohballManifests);
  // installDebugObj.packages = packages;
  // installDebugObj.npmInstalls = npmInstalls;

  // 3. Select dohballs to install
  const dohballsToInstall = await selectDohballsToInstall(packages, compiledDohballManifests);
  // installDebugObj.dohballsToInstall = dohballsToInstall;

  // Install selected dohballs
  if (dohballsToInstall.size > 0) {
    if (Doh.pod.always_confirm_changes && !await confirmAction(`${dohballsToInstall.size} Dohball(s) selected for install: (${Array.from(dohballsToInstall.keys()).join(', ')}). Proceed?`)) {
      await logInstallWarn(`  User skipped installing ${dohballsToInstall.size} dohballs.`);
    } else {
      await logInstallAction(`Installing ${dohballsToInstall.size} dohballs from remote hosts...`);

      for (const [path, packageName] of dohballsToInstall) {
        const targetPath = DohPath(path);
        const dohballHost = compiledDohballManifests[packageName].dohball_host;
        if (dohballHost) {
          await downloadAndExtractDohball(packageName, targetPath, dohballHost);
        } else {
          //await logInstallError(`  Error installing ${packageName}: dohball_host not defined in manifest`);
        }
      }
    }
  } else {
    // console.log(colorize('  No dohballs selected for install/upgrade.', text_color));
  }

  // Update npm dependencies
  // walk the compiledDohballManifests and collect all the installed packages by checking for dohball.json
  const installedPackages = [];
  for (const [packageName, packageInfo] of Object.entries(compiledDohballManifests)) {
    const containingFile = packageInfo.file || packageInfo.packagefile;
    if (fs.existsSync(DohPath(containingFile))) {
      installedPackages.push(packageName);
    }
  }
  const { npmInstalls } = collectInstallsFromPackagesInManifest(installedPackages, compiledDohballManifests);
  await updatePackageDependencies(npmInstalls);

  // Write debug file
  // await fsp.writeFile(installDebugFile, JSON.stringify(installDebugObj, null, 2));
}

// Main execution
async function main() {
  Doh.performance.start('Validate Dependencies');
  // console.log(' ');
  // console.log(colorize('Validating Doh Installation according to pod settings and backup cache...', header_color));
  //log = (await readLogFile()).split('\n');
  const compiledDohballManifests = await Doh.fetchRemoteManifests();
  await installDependencies(compiledDohballManifests);
  Doh.performance.end('Validate Dependencies');
  // console.log(' ');
  // Send stats to parent if we're in a child process
  Doh.sendToParent('installerStats', {
    ...Doh.installStats,
    dohballIssues: Object.fromEntries(Doh.installStats.dohballIssues || new Map()),
    installationChanged: Doh.installationChanged
  });
}

await main()