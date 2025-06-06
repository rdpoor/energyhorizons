import fs, { promises as fsp } from 'fs';
import YAML from 'yaml';
import path from 'path';
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import crypto from 'crypto';
import { Worker } from 'worker_threads';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire, builtinModules } from 'module';
import { isSameOrNewerVersion } from './dohver.js';

const { colorize, header_color, info_color, text_color, number_color, error_color, warn_color, hidden_color } = Doh.colorizer();

const toForwardSlash = (str) => str.replace(/\\/g, '/');

const PackagerFrom = window.LoadDohFrom || '.';

const dPacks = Doh.Packages;

let directories_to_skip = [];

if (Doh.pod.packager_ignore?.directories) {
  Doh.pod.packager_ignore = Doh.pod.packager_ignore.directories;
}
directories_to_skip = Doh.pod.packager_ignore || [];

let DFP = {};

let DAP = {};

let DAPHooks = {};

let DCLI = {};

let DPod = {};

let totalCodebaseSize = 0;

Doh.CorePatterns = [];

let problems = [];
let deprecated = [];

let patternDuplicates = {};
let number_of_files = 0, number_of_yaml_files = 0;

let nodeImports = {};
let browserImports = {};

const problog = function (...args) {
  problems.push(args);
}
const deprecatelog = function (...args) {
  deprecated.push(args);
}

// Main function to process directories passed as arguments
async function processDirectories(directories) {
  for (const dir of directories) {
    //console.log('AutoPackager scanning:', dir);
    const { jsFiles, yamlFiles } = await findDohFiles(dir);
    for (let file of jsFiles) {
      try {
        await parseJSFile(file);
      } catch (error) {
        problog('AutoPackager: error parsing JS file:', file, error);
      }

      file = toForwardSlash(path.relative(PackagerFrom, file));
      // convert DFP to DAP
      const filepackage = DFP[file];
      if (!filepackage) continue;

      totalCodebaseSize += fs.statSync(PackagerFrom + '/' + file).size;

      // get the relative path to the file from this directory
      // convert to forward slashes
      let relative_path = toForwardSlash(path.dirname(path.relative('.', file)));

      // for each module in the file package
      for (const module_name in filepackage.ModuleDefinitions) {
        // get the module object
        let mod = filepackage.ModuleDefinitions[module_name];
        mod.path = relative_path;
        // create the load array
        mod.load = mod.load ? mod.load : [];
        if (IsString(mod.load)) {
          if (mod.load.startsWith('undefined:[')) {
            problog('\nAutoPackager: found unknown load:', mod.load, 'in', file, ' for module:', module_name);
            mod.load = [];
          } else {
            mod.load = [mod.load];
          }
        }
        // for each load in the module, look for a `^` at the beginning of the string
        // if found, replace the `^` with the relative path to the file
        for (let i = 0; i < mod.load.length; i++) {
          if (mod.load[i].indexOf('^') > -1) {
            mod.load[i] = mod.load[i].replace('^', '/' + relative_path);
          }
          if (mod.load[i].includes(' from ')) {
            let load_def = Doh.parse_load_statement(mod.load[i]);
            processImport(load_def.from, file);
          }
        }

        // add the module object to the autopackage
        if (!DAP[module_name]) {
          DAP[module_name] = {
            module_name,
            load: mod.load,
            params: mod.params,
            file: '/' + toForwardSlash(file),
            path: relative_path,
          };
          if(mod.package_imports) {
            DAP[module_name].package_imports = mod.package_imports;
          }
          if(mod.node_imports) {
            DAP[module_name].node_imports = mod.node_imports;
          }
          if(mod.browser_imports) {
            DAP[module_name].browser_imports = mod.browser_imports;
          }
        } else {
          problog('AutoPackager: found duplicate module:', module_name, 'in', file, '\n\tOriginal file:', DAP[module_name].file);
        }
      }
      // for each package in the file package
      for (const pack_name in filepackage.PackageDefinitions) {
        const pack_def = filepackage.PackageDefinitions[pack_name];
        const pack = pack_def.package_obj;
        pack.path = relative_path;
        pack.load = pack.load ? pack.load : [];
        if (IsString(pack.load)) {
          if (pack.load.startsWith('undefined:[')) {
            problog('\nAutoPackager: found unknown load:', pack.load, 'in', file, ' for package:', pack_name);
            pack.load = [];
          } else {
            pack.load = [pack.load];
          }
        }
        
        if(pack_def.package_imports) {
          pack.package_imports = pack_def.package_imports;
        }
        if(pack_def.node_imports) {
          pack.node_imports = pack_def.node_imports;
        }
        if(pack_def.browser_imports) {
          pack.browser_imports = pack_def.browser_imports;
        }

        // for each load in the module, look for a `^` at the beginning of the string
        // if found, replace the `^` with the relative path to the file
        for (let i = 0; i < pack.load.length; i++) {
          if (pack.load[i].indexOf('^') > -1) {
            pack.load[i] = pack.load[i].replace('^', '/' + relative_path);
          }
          if (pack.load[i].includes(' from ')) {
            let load_def = Doh.parse_load_statement(pack.load[i]);
            processImport(load_def.from, file);
          }
        }


        if (!DAP[pack_name]) {
          DAP[pack_name] = {
            ...pack,
            //path: relative_path,
            packagefile: '/' + toForwardSlash(file),
          };
        }

      }

      // collect lists of patterns in each file
      // also find core patterns and add them to the core patterns list
      if (!Doh.PatternsInFile[file]) {
        let pattern_list = Object.keys(filepackage.PatternDefinitions);
        Doh.PatternsInFile[file] = pattern_list;
        if (file.startsWith('doh_js/')) {
          Doh.CorePatterns.push(...pattern_list);
        }
      }

      // for each pattern in the file package
      for (const pattern_name in filepackage.PatternDefinitions) {
        // recursively crawl the pattern definition and convert functions to function definitions
        let pattern = filepackage.PatternDefinitions[pattern_name];
        let idea = pattern.idea;
        // recurse the idea, looking for functions. if a function is found, convert it to a function definition
        // this is done by looking for the function.params object, defined above
        let recurse = (idea) => {
          for (let key in idea) {
            if (typeof idea[key] === 'object') {
              recurse(idea[key]);
            } else if (typeof idea[key] === 'function') {
              let expandParams = (params) => {
                let expanded = [];
                for (let param in params) {
                  if (typeof params[param] === 'object') {
                    expanded.push(`${params[param].name} = ${params[param].defaultValue}`);
                  } else {
                    params[param] = params[param].replace(/\[\[Code\:(.*?)\:(.*?)\]\]\:/g, '');
                    expanded.push(params[param]);
                  }
                }
                return expanded;
              };
              let param_array = expandParams(idea[key].params);
              idea[key] = `function(${param_array.join(', ')})`;
              //let func = idea[key];
            }
          }
        };
        recurse(idea);

        //console.log('AutoPackager: found pattern:', pattern_name, 'in', file);
        // find the module by checking if the pattern line is within the module line range
        let module = Object.values(filepackage.ModuleDefinitions).find((mod) => {
          let line = Number(pattern.line.split(':')[0]),
            mod_line = Number(mod.line.split(':')[0]),
            mod_end = Number(mod.end.split(':')[0]);
          return line >= mod_line && line <= mod_end;
        });
        // if a module is found tell the pattern about it
        let module_name;
        if (module) {
          pattern.module_name = module_name = module.module_name;
        } else if (file.endsWith('doh_js/deploy.js')) {
          pattern.module_name = module_name = 'deploy';
        } else {
          problog('AutoPackager: found pattern:', pattern_name, 'in', file, 'with no module');
        }

        if (!Doh.PatternFile[pattern_name]) {
          Doh.PatternFile[pattern_name] = file;
          Doh.PatternsInModule[module_name] = Doh.PatternsInModule[module_name] || [];
          Doh.PatternsInModule[module_name].push(pattern_name);
          Doh.PatternModule[pattern_name] = module_name;
        } else {
          if (!patternDuplicates[pattern_name] && DFP[Doh.PatternFile[pattern_name]]) {
            // log the first instance of the pattern
            let orig_pattern_def = DFP[Doh.PatternFile[pattern_name]].PatternDefinitions[pattern_name];
            if (orig_pattern_def) {
              patternDuplicates[pattern_name] = [{ module_name: orig_pattern_def.module_name, file: orig_pattern_def.file, line: orig_pattern_def.line }];
            } else {
              patternDuplicates[pattern_name] = [{ module_name: 'unknown', file: orig_pattern_def.file, line: orig_pattern_def.line }];
            }
          } else {
            // log the duplicate instance of the pattern
            patternDuplicates[pattern_name] = patternDuplicates[pattern_name] || [];
          }
          // log the duplicate instance of the pattern
          patternDuplicates[pattern_name].push({ module_name, file: pattern.file, line: pattern.line });
        }

      }
      for (const route_num in filepackage.routes) {
        let route = filepackage.routes[route_num];

      }
      //*/
      for (const installer_name in filepackage.InstallerDefinitions) {
        let installer = filepackage.InstallerDefinitions[installer_name];
        installer.module_name = installer_name;
        // installers bolt an optional .install and/or .callback to a package
        // the .install is an array of assets to install
        // the .callback is a function to run after the assets are installed
        if (DAP[installer_name]) {
          if (installer.install) DAP[installer_name].install = installer.install;
        } else {
          problog('AutoPackager: found installer:', installer_name, 'in', file, 'with no package');
        }
      }

      for (const cli_name in filepackage.CLIDefinitions) {
        let cli_def = filepackage.CLIDefinitions[cli_name];
        cli_def.package_name = cli_name;
        // the CLI object is a package with a map of commands
        // the map of commands is the CLI object
        // the package_name is the name of the package
        // the file is the file
        if (DAP[cli_name]) {
          let cli_map = cli_def.cli_map;
          for (const command in cli_map) {
            let cli = cli_map[command];
            if (IsString(cli)) cli = DohPath(cli, pathToFileURL(file));
            else cli.file = toForwardSlash(path.relative(PackagerFrom, DohPath(cli.file, pathToFileURL(file))));
          }
          DCLI[cli_name] = cli_map;
        } else {
          problog('AutoPackager: found CLI:', cli_name, 'in', file, 'with no package');
        }
      }

      for (const podName in filepackage.PodDefinitions) {
        let pod_def = filepackage.PodDefinitions[podName];
        pod_def.package_name = podName;
        if (DAP[podName]) {
          let pod = pod_def.pod;
          DPod[podName] = pod;
        } else {
          problog('AutoPackager: found Pod:', podName, 'in', file, 'with no package');
        }
      }

      // check for Doh.Asset
      for (const asset_path in filepackage.AssetDefinitions) {
        let asset_def = filepackage.AssetDefinitions[asset_path];
        
        // find the module by checking if the asset line is within the module line range
        let module = Object.values(filepackage.ModuleDefinitions).find((mod) => {
          let line = Number(asset_def.line.split(':')[0]),
            mod_line = Number(mod.line.split(':')[0]),
            mod_end = Number(mod.end.split(':')[0]);
          return line >= mod_line && line <= mod_end;
        });

        // if a module is found tell the asset about it
        let module_name;
        if (module) {
          asset_def.module_name = module_name = module.module_name;
        } else if (file.endsWith('doh_js/deploy.js')) {
          asset_def.module_name = module_name = 'deploy';
        } else {
          //problog('AutoPackager: found asset:', asset_path, 'in', file, 'with no module');
          continue;
        }

        // Track assets in modules similar to patterns
        if (!Doh.AssetsInModule[module_name]) Doh.AssetsInModule[module_name] = [];

        if (!Doh.AssetsInModule[module_name].includes(asset_path)) {
          Doh.AssetsInModule[module_name].push(asset_path);
        }
      }
    }
    for (const file of yamlFiles) {
      await parseDohYAMLFile(file);
    }
    //console.log('  JS files:\t', jsFiles.length);
    number_of_yaml_files += yamlFiles.length;
    //console.log('  YAML files:\t', yamlFiles.length);
  }
}
// New cache handling functions to be added near the top of the file
async function loadApCache() {
  try {
    const cacheData = await fsp.readFile(DohPath('/.doh/manifests/ap_cache.json'), 'utf8');
    return JSON.parse(cacheData);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(colorize('Error loading AP cache:', error_color), colorize(error.message, warn_color));
    }
    return {};
  }
}
async function saveApCache(cache) {
  try {
    await ensureDir(DohPath('/.doh/manifests'));
    await fsp.writeFile(DohPath('/.doh/manifests/ap_cache.json'), JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error(colorize('Error saving AP cache:', error_color), colorize(error.message, warn_color));
  }
}
async function getFileInfo(filePath) {
  try {
    const stats = await fsp.stat(filePath);
    const hash = await calculateFileHash(filePath);
    return {
      mtime: stats.mtime.toISOString(),
      hash,
      type: path.extname(filePath).toLowerCase(),
      size: stats.size
    };
  } catch (error) {
    console.error(colorize(`Error getting file info for ${filePath}:`, error_color), colorize(error.message, warn_color));
    return null;
  }
}
async function hasFileChanged(filePath, cache = global.apCache) {
  try {
    const currentInfo = await getFileInfo(filePath);
    if (!currentInfo) return true;

    const relPath = toForwardSlash(path.relative(PackagerFrom, filePath));

    const cachedInfo = cache[relPath];
    if (!cachedInfo) return true;

    return cachedInfo.mtime !== currentInfo.mtime ||
      cachedInfo.hash !== currentInfo.hash;
  } catch (error) {
    console.error(colorize(`Error checking if file changed ${filePath}:`, error_color), colorize(error.message, warn_color));
    return true; // If in doubt, process the file
  }
}
async function cleanupCache(cache) {
  const removedPaths = [];

  await Promise.all(Object.keys(cache).map(async (filePath) => {
    try {
      await fsp.access(DohPath(filePath));
    } catch (error) {
      if (error.code === 'ENOENT') {
        removedPaths.push(filePath);
      }
    }
  }));

  removedPaths.forEach(path => delete cache[path]);

  if (removedPaths.length > 0) {
    console.log(colorize(`  Cleaned up ${removedPaths.length} removed files from cache`, text_color));
  }

  return cache;
}
// Modified findDohFiles - keeps existing functionality but adds caching
async function findDohFiles(dir, jsFiles = [], yamlFiles = [], cache = global.apCache) {
  const entries = await Promise.all((await fsp.readdir(dir, { withFileTypes: true }))
    .map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      number_of_files++;

      if (path.basename(fullPath).startsWith('.')) return;

      if (entry.isDirectory() && directories_to_skip.indexOf(toForwardSlash(path.basename(fullPath))) === -1) {
        await findDohFiles(fullPath, jsFiles, yamlFiles, cache);
      } else if (entry.isFile()) {
        const relPath = toForwardSlash(path.relative(PackagerFrom, fullPath));

        // Only process .js and .doh.yaml files
        if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs') || entry.name.endsWith('.cjs') || entry.name.endsWith('.doh.yaml')) {
          const fileInfo = await getFileInfo(fullPath);
          const cached = cache[relPath];

          if (entry.name.endsWith('.doh.yaml')) {
            // Always process .doh.yaml files
            yamlFiles.push(fullPath);
            // Update cache
            if (!cached || cached.mtime !== fileInfo.mtime || cached.hash !== fileInfo.hash) {
              cache[relPath] = fileInfo;
            }
          } else { // .js file
            // Check if file has changed or if it's a known Doh file
            const hasChanged = !cached || cached.mtime !== fileInfo.mtime || cached.hash !== fileInfo.hash;
            const isDohFile = cached?.hasDohContent || hasChanged;

            if (isDohFile) {
              jsFiles.push(fullPath);
              // Will be updated after parsing in parseJSFile
              cache[relPath] = {
                ...fileInfo,
                hasDohContent: false // Will be set to true if Doh content is found
              };
            } else if (hasChanged) {
              // New or changed non-Doh file
              cache[relPath] = {
                ...fileInfo,
                hasDohContent: false
              };
            }
          }
        }
      }
    }));

  return { jsFiles, yamlFiles };
}
async function parseDohYAMLFile(filePath) {

  // get the relative path to the file from this directory
  let relative_path = path.dirname(path.relative('.', filePath));
  // remove the .js
  relative_path = relative_path.replace(/\.js$/, '');
  // convert to forward slashes
  relative_path = toForwardSlash(relative_path);

  const data = await fsp.readFile(filePath, 'utf8');
  try {
    const packages = YAML.parse(data);
    for (let packageName in packages) {

      // convert the filePath to relative
      const stashPath = "/" + toForwardSlash(path.relative(PackagerFrom, filePath));
      // deal with the whole packageName being a string
      if (typeof packages[packageName] === 'string') {
        dPacks[packageName] = Object.assign(dPacks[packageName] || {}, {
          load: [packages[packageName]],
          path: relative_path,
          packagefile: stashPath
        });
      } else {
        // otherwise, we have an object
        dPacks[packageName] = Object.assign(dPacks[packageName] || {}, {
          ...packages[packageName],
          path: relative_path,
          packagefile: stashPath
        });
        // we still allow the load to be a string, but we need to convert it to an array
        if (typeof dPacks[packageName].load === 'string') {
          dPacks[packageName].load = [dPacks[packageName].load];
        }
        // ultimately, we need to have an array of strings for the load property
        if (NotArray(dPacks[packageName].load) || dPacks[packageName].load.length === 0) {
          problog('Missing "load" in Doh Package for:', packageName, 'in file:', stashPath);
        }
        // we allow the install to be a string, but we need to convert it to an object
        if (typeof dPacks[packageName].install === 'string') {
          dPacks[packageName].install = { [dPacks[packageName].install]: '' };
        }
        // we allow the install to be an array, but we need to convert it to an object
        if (IsArray(dPacks[packageName].install)) {
          let install_obj = {};
          dPacks[packageName].install.forEach((value) => {
            install_obj[value] = '';
          });
          dPacks[packageName].install = install_obj;
        }
        // the pod must be an object
        if (IsObject(dPacks[packageName].pod)) {
          // move the pod to the DPod object
          DPod[packageName] = dPacks[packageName].pod;
          // remove the pod from the dPacks object
          dPacks[packageName].pod = null;
          delete dPacks[packageName].pod;
        }
      }
      let pack = dPacks[packageName];
      // For each load entry, update any '^' and process import statements
      for (let i = 0; i < pack.load.length; i++) {
        if (pack.load[i].indexOf('^') > -1) {
          pack.load[i] = pack.load[i].replace('^', '/' + relative_path);
        }
        if (pack.load[i].indexOf('import') > -1 || pack.load[i].indexOf(' from ') > -1) {
          const stmt = pack.load[i];
          const parsed = Doh.parse_load_statement(stmt);
          processImport(parsed.from, filePath);
        }
      }
    }
  } catch (err) {
    problog(`Error parsing .doh.yaml in ${filePath}:`, err);
  }
}
async function parseJSFile(filePath) {
  try {
    // convert the filePath to relative
    const stashPath = path.relative(PackagerFrom, filePath);

    let filepackage = {
      file: '/' + toForwardSlash(stashPath),
      PackageDefinitions: {},
      ModuleDefinitions: {},
      DynamicLoads: {},
      PatternDefinitions: {},
      RouteDefinitions: {},
      FunctionDefinitions: {},
      InstallerDefinitions: {},
      CLIDefinitions: {},
      PodDefinitions: {},
      AssetDefinitions: {},
      package_imports: {}, // original "from" statements keyed by specifier
      node_imports: {},    // built-in / Node-only imports keyed by specifier
      browser_imports: {},  // browser-compatible imports keyed by specifier
      imports: {}  // <-- updated to an object
    };
    const code = await fsp.readFile(filePath, 'utf8');
    // Parse the code into an AST
    const ast = acorn.parse(code, { locations: true, ecmaVersion: "latest", sourceType: "module" });

    const extractArg = (arg, context, as_code = false) => {
      if (typeof arg === 'undefined' || arg === null) return undefined;
      if (!arg.type) return undefined;

      let pass = (value) => {
        return value;
      }
      let codify = (value) => {
        if (typeof value === 'string') {
          // if the value contains the string '[[Code:', then we need to remove all instances of '[[Code:'
          if (value.indexOf('[[Code:') > -1) value = value.replace(/\[\[Code\:(.*?)\:(.*?)\]\]\:/g, '');
          return `[[Code:${arg.loc.start.line}:${arg.loc.start.column}]]:` + value;
        }
      };

      let marker = (value) => {
        if (typeof value === 'string') {
          return `[[Marker:${arg.loc.start.line}:${arg.loc.start.column}]]` + value;
        }
      };

      switch (arg.type) {
        case 'Literal':
          if (as_code && arg.raw) {
            return arg.raw;
          }
          return arg.value;
        case 'ArrayExpression':
          // Create a new context for the array elements
          const arrayContext = { type: 'array', elements: [] };

          // Process each element of the array
          arg.elements.forEach(element => {
            const value = extractArg(element, arrayContext);
            if (value !== undefined) arrayContext.elements.push(value);
          });

          // Return the array elements from the context
          return arrayContext.elements;
        case 'ObjectExpression':
          // Create a new context for the object properties
          const objectContext = { type: 'object', properties: {} };

          // Process each property of the object
          arg.properties.forEach(prop => {
            const { key, value } = prop;
            const extractedKey = key.type === 'Identifier' ? key.name : extractArg(key, objectContext);
            const extractedValue = extractArg(value, objectContext);
            if (extractedKey !== undefined && extractedValue !== undefined) {
              objectContext.properties[extractedKey] = extractedValue;
            }
          });

          // Return the object properties from the context
          return objectContext.properties;
        case 'FunctionExpression':
          let func = {
            type: 'function',
            params: arg.params.map(param => {
              if (param.type === 'Identifier') {
                return param.name;
              } else if (param.type === 'AssignmentPattern' && param.left.type === 'Identifier') {
                return { name: param.left.name, defaultValue: extractArg(param.right) };
              } else {
                // Handle other complex cases like RestElement, ObjectPattern
                return extractArg(param, {});
              }
            }),
          };
          return func;
        case 'Identifier':
          return codify(arg.name);
        case 'MemberExpression':
          return codify(`${extractArg(arg.object, context)}.${extractArg(arg.property, context)}`);
        case 'CallExpression':
          return codify(`${extractArg(arg.callee, context)}(${extractArgs(arg, true).join(', ')})`);
        case 'ArrowFunctionExpression':
          return codify('ArrowFunction');
        case 'AssignmentExpression':
          return pass(extractArg(arg.right, context));
        case 'BinaryExpression':
          return codify(`${extractArg(arg.left, context)} ${arg.operator} ${extractArg(arg.right, context)}`);
        case 'LogicalExpression':
          return codify(`${extractArg(arg.left, context)} ${arg.operator} ${extractArg(arg.right, context)}`);
        case 'UnaryExpression':
          return pass(Number(`${arg.operator}${extractArg(arg.argument, context)}`));
        case 'UpdateExpression':
          return codify(`${extractArg(arg.argument, context)}${arg.operator}`);
        case 'ConditionalExpression':
          return codify(`${extractArg(arg.test, context)} ? ${extractArg(arg.consequent, context, true)} : ${extractArg(arg.alternate, context, true)}`);
        case 'NewExpression':
          return codify(`new ${extractArg(arg.callee, context)}`);
        case 'ThisExpression':
          return codify('this');
        case 'ArrayPattern':
          return pass(arg.elements.map(element => extractArg(element, context, true)));
        case 'ObjectPattern':
          return pass(arg.properties.map(prop => {
            const { key, value } = prop;
            return { [extractArg(key, context, true)]: extractArg(value, context, true) };
          }));
        case 'RestElement':
          return codify(`...${extractArg(arg.argument, context)}`);
        case 'AssignmentPattern':
          return codify(`${extractArg(arg.left, context)} = ${extractArg(arg.right, context, true)}`);
        case 'ObjectProperty':
          return codify(`${extractArg(arg.key, context, true)}: ${extractArg(arg.value, context, true)}`);
        case 'SpreadElement':
          return codify(`...${extractArg(arg.argument, context)}`);
        case 'TemplateLiteral':
          return codify(arg.quasis.map(quasi => quasi.value.raw).join('${...}'));
        case 'TaggedTemplateExpression':
          return codify(`${extractArg(arg.tag, context)}${extractArg(arg.quasi, context)}`);
        case 'TemplateElement':
          return pass(arg.value.raw);
        case 'YieldExpression':
          return codify(`yield ${extractArg(arg.argument, context)}`);
        case 'MetaProperty':
          return codify(`${extractArg(arg.meta, context)}.${extractArg(arg.property, context)}`);
        case 'AwaitExpression':
          return codify(`await ${extractArg(arg.argument, context)}`);
        case 'ChainExpression':
          return codify(`${extractArg(arg.expression, context)}`);
        case 'ImportExpression':
          return codify(`import(${extractArg(arg.source, context, true)})`);
        case 'BigIntLiteral':
          return codify(arg.value, context);
        case 'BigIntLiteralTypeAnnotation':
          return marker(arg.value);
        case 'DecimalLiteral':
          return codify(arg.value, context);
        case 'DecimalLiteralTypeAnnotation':
          return marker(arg.value);
        case 'Directive':
          return marker(arg.value);
        case 'DirectiveLiteral':
          return marker(arg.value);

        default:
          // If the node is not handled, return it as is
          return marker(`undefined:[${arg.type}]`);
      }
    };

    const extractArgs = (node, as_code = false) => node.arguments.map(arg => extractArg(arg, {}, as_code));
    const IsFunctionCallNamed = (node, name) => node.callee.name === name;
    const IsMemberMethodCall = (node, obj, method) => node.callee.type === 'MemberExpression' && node.callee.object.name === obj && node.callee.property.name === method;
    const IsDohMethodCallNamed = (node, name) => IsMemberMethodCall(node, 'Doh', name);

    // Function to handle CallExpression nodes
    function handleCallExpression(node, state, ancestors) {

      // Check if the callee is Doh.Module or Doh.Module
      if (IsDohMethodCallNamed(node, 'Module')) {
        //console.log(`Found call to ${node.callee.name || node.calee.object.name + '.' + node.callee.property.name}`);
        // Extract arguments
        const args = extractArgs(node);
        //module_name, load, callback, globals
        // parse the args, since load can be an array or a string, and is optional
        let module_name = args[0];
        let load = args[1];
        let callback = args[2];
        let globals = args[3];
        if (load.type === 'function') {
          globals = callback;
          callback = load;
          load = undefined;
        }
        let params = callback.params;
        //console.log('Doh.Module:', module_name, load, callback, globals);
        filepackage.ModuleDefinitions[module_name] = {
          file: '/' + toForwardSlash(stashPath),
          line: node.loc.start.line + ':' + node.loc.start.column,
          end: node.loc.end.line + ':' + node.loc.end.column,
          module_name,
          load,
          callback,
          params,
          globals
        };
        if (globals) {
          // globals is being deprecated, so log a warning
          deprecatelog('The globals parameter is deprecated in Doh.Module:', module_name, stashPath + ':' + node.loc.end.line, 'for globals:', globals);
        }
      } else if (IsFunctionCallNamed(node, 'Pattern') || IsDohMethodCallNamed(node, 'Pattern')) {
        // Extract arguments
        const args = extractArgs(node);
        let name = args[0];
        let inherits = args[1];
        let idea = args[2];
        // find the arguments
        if (NotString(name)) {
          // the name is the idea
          // only allow this if the idea contains its own pattern name
          idea = name;
          if (IsString(idea.pattern)) name = idea.pattern;
          else problog('AutoPackager found a pattern with no name', name, idea);

          // inherits will be in the idea.inherits
          inherits = [];
        } else if (NotString(inherits) && NotArray(inherits) && !idea) {
          // inherits is the idea
          idea = inherits;
          // inherits will be in the idea
          inherits = [];
        }
        if (!idea) idea = {};
        // otherwise the arguments are as indicated
        filepackage.PatternDefinitions[name] = {
          file: '/' + toForwardSlash(stashPath),
          line: node.loc.start.line + ':' + node.loc.start.column,
          end: node.loc.end.line + ':' + node.loc.end.column,
          name,
          inherits,
          idea
        };

      } else if (IsDohMethodCallNamed(node, 'Package')) {
        // Extract arguments
        const args = extractArgs(node);
        let package_name = args[0];
        let package_obj = args[1];
        package_obj.packagefile = package_obj.packagefile || '/' + toForwardSlash(stashPath);
        //console.log('Doh.Package:', package_name, package_obj);
        filepackage.PackageDefinitions[package_name] = {
          package_name,
          package_obj,
          file: '/' + toForwardSlash(stashPath),
          line: node.loc.start.line + ':' + node.loc.start.column,
          end: node.loc.end.line + ':' + node.loc.end.column,
        };
      } else if (IsDohMethodCallNamed(node, 'load')) {
        // Extract arguments
        const args = extractArgs(node);
        let loaders = args[0];
        let relpath = args[1];
        let module_name = args[2];
        let forceReload = args[3];
        //console.log('Doh.Package:', package_name, package_obj);
        filepackage.DynamicLoads[node.loc.start.line + ':' + node.loc.start.column] = {
          loaders,
          relpath,
          module_name,
          forceReload,
          file: '/' + toForwardSlash(stashPath),
          line: node.loc.start.line + ':' + node.loc.start.column,
          end: node.loc.end.line + ':' + node.loc.end.column,
        };
      } else if (IsMemberMethodCall(node, 'Router', 'AddRoute')) {
        // Extract arguments
        const args = extractArgs(node);
        let route = args[0];
        //console.log('Router.AddRoute:', route, callback);
        filepackage.RouteDefinitions[route] = {
          file: '/' + toForwardSlash(stashPath),
          line: node.loc.start.line + ':' + node.loc.start.column,
          end: node.loc.end.line + ':' + node.loc.end.column,
          route
        };
      } else if (IsDohMethodCallNamed(node, 'Install')) {
        // Extract arguments
        const args = extractArgs(node);
        let module_name = args[0];
        let install = args[1];
        let callback = args[2];
        // args[1] is the assets if args[2] is a function
        if (install.type === 'function') {
          callback = install;
          install = undefined;
        }

        //console.log('Doh.Install:', callback);
        filepackage.InstallerDefinitions[module_name] = {
          file: '/' + toForwardSlash(stashPath),
          line: node.loc.start.line + ':' + node.loc.start.column,
          end: node.loc.end.line + ':' + node.loc.end.column,
          module_name,
        };

        if (install) {
          // install should be an object
          if (IsString(install)) {
            install = { install: '' };
          }
          if (IsArray(install)) {
            // make each value in the array a key in the object
            let install_obj = {};
            install.forEach((value) => {
              install_obj[value] = '';
            });
          }
          filepackage.InstallerDefinitions[module_name].install = install;
        }
        if (callback) {
          filepackage.InstallerDefinitions[module_name].callback = callback;
        }

      } else if (IsDohMethodCallNamed(node, 'CLI')) {
        // Extract arguments
        const args = extractArgs(node);
        let package_name = args[0];
        let cli_map = args[1];

        //console.log('Doh.Install:', callback);
        filepackage.CLIDefinitions[package_name] = {
          file: '/' + toForwardSlash(stashPath),
          line: node.loc.start.line + ':' + node.loc.start.column,
          end: node.loc.end.line + ':' + node.loc.end.column,
          package_name,
        };

        // cli_map should be an object where each key is a command and the value is a string script path to a valid file
        // or an object with a 'file' key and a 'help' key
        if (typeof cli_map === 'object') {
          filepackage.CLIDefinitions[package_name].cli_map = cli_map;
        }

      } else if (IsDohMethodCallNamed(node, 'Pod')) {
        // Extract arguments
        const args = extractArgs(node);
        let package_name = args[0];
        let pod = args[1];

        //console.log('Doh.Pod:', callback);
        filepackage.PodDefinitions[package_name] = {
          file: '/' + toForwardSlash(stashPath),
          line: node.loc.start.line + ':' + node.loc.start.column,
          end: node.loc.end.line + ':' + node.loc.end.column,
          package_name,
        };

        // pod should be a valid object containing a pod definition
        if (typeof pod === 'object') {
          // this is where we need to go through the pod and look for `[[Code:x:y]]:some executable code` and cut the `[[Code:x:y]]:` part and try to execute the `some executable code` part against the global context
          const processPod = (pod) => {
            for (let key in pod) {
              const value = pod[key];
              if (IsString(value) && value.startsWith('[[Code:')) {
                // get the executable code
                const codeMatch = value.match(/\[\[Code:(\d+):(\d+)\]\]:(.*)/);
                if (codeMatch) {
                  let [_, x, y, code] = codeMatch;
                  try {
                    // Execute the code in the global context
                    code = 'let DohPath = globalThis.DohPath.Overload(globalThis.DohPath("/' + toForwardSlash(stashPath) + '"));\n ' + code;
                    const result = (function() { 'use strict'; return eval(code); }).call(Object.create(null));
                    // Store the result in the pod
                    pod[key] = result;
                  } catch (error) {
                    console.error(`Error executing code in pod ${package_name}:`, error);
                  }
                }
              } else if (IsObject(value)) {
                // if the value is an object, then we need to recursively process it
                processPod(value);
              }
            }
          }
          processPod(pod);
          filepackage.PodDefinitions[package_name].pod = pod;
        }

      } else if (IsDohMethodCallNamed(node, 'AutoPackager')) {
        // Extract arguments
        const args = extractArgs(node);
        let package_name = args[0];
        //let callback = args[1];
        // set the hook to the package name and the file it is in
        DAPHooks[package_name] = {
          file: '/' + toForwardSlash(stashPath),
          line: node.loc.start.line + ':' + node.loc.start.column,
          end: node.loc.end.line + ':' + node.loc.end.column,
          package_name,
        };
      } else if (IsMemberMethodCall(node, 'DohPath', 'DohSlash')) {
        // Extract arguments
        const args = extractArgs(node);
        let asset_path = args[0];
        let rel_url = args[1];
        if (IsString(asset_path)) {
          if (asset_path.startsWith('[[Code:')) {
            return;
          }
          const stashPath_dohslash = '/' + toForwardSlash(stashPath);
          const asset_dohslash = DohPath.DohSlash(asset_path, stashPath_dohslash);
          const asset_dohpath = DohPath(asset_path, stashPath_dohslash);
          if (asset_dohslash.startsWith('/.doh/')) {
            // don't allow storing assets in the hidden doh cache directory
            return;
          }
          if (asset_dohslash.startsWith('/doh_js/')) {
            // don't allow storing assets in the doh_js directory
            return;
          }
          if (asset_dohslash.startsWith('/dist/')) {
            // don't allow storing assets in the dist directory
            return;
          }
          if (!fs.existsSync(asset_dohpath)) {
            return;
          }
          if (fs.statSync(asset_dohpath).isDirectory()) {
            return;
          }
          filepackage.AssetDefinitions[asset_path] = {
            file: '/' + toForwardSlash(stashPath),
            line: node.loc.start.line + ':' + node.loc.start.column,
            end: node.loc.end.line + ':' + node.loc.end.column,
            asset_path,
          };
        }
      }
    }

    // Walk the AST to find calls to Doh.Module
    walk.simple(ast, {
      CallExpression: handleCallExpression,
      ImportDeclaration(node) {
        processImport(node.source.value, filePath);
      },
      ImportExpression(node) {
        if (node.source && node.source.type === 'Literal') {
          processImport(node.source.value, filePath);
        }
      }
    });
    if (Object.keys(filepackage.ModuleDefinitions).length > 0 || Object.keys(filepackage.PackageDefinitions).length > 0) {
      //console.log('Doh file:', stashPath);
      DFP[toForwardSlash(stashPath)] = filepackage;
    }
  } catch (error) {
    problog(filePath, error);

    // Only bubble up errors when we're being watched (i.e., in debug mode)
    if (process.env.DOH_WATCHING) {
      if (error instanceof SyntaxError && error.pos && error.loc) {
        const enhancedError = new SyntaxError(
          `${error.message} in file ${filePath} at line ${error.loc.line}, column ${error.loc.column}`
        );
        enhancedError.pos = error.pos;
        enhancedError.loc = error.loc;
        throw enhancedError;
      } else {
        throw error;
      }
    }
  }
}
async function writeJSONManifest(dohpath, obj) {
  try {
    await fsp.writeFile(DohPath(dohpath), JSON.stringify(obj, null, 2));
  } catch (err) {
    problog('AutoPackager: Error writing manifest:', dohpath, err);
  }
}


// Function to check if there's a cycle starting from a specific node
function hasCycle(graph, startNode) {
  const visited = {};
  const recStack = {};

  // Helper function for DFS to detect cycle
  function dfs(node) {
    if (!visited[node]) {
      visited[node] = true;
      recStack[node] = true;

      for (let neighbour of graph[node]) {
        if (!visited[neighbour] && dfs(neighbour)) {
          return true;  // Cycle found
        } else if (recStack[neighbour]) {
          return true;  // Node revisited in current path
        }
      }
    }
    recStack[node] = false;
    return false;
  }

  return dfs(startNode);
}
// Function to create a graph from the package dependencies
function createPackageDependencyGraph(packages) {
  const graph = {};
  for (const key in packages) {
    const pack = packages[key];
    const packName = pack.module_name || key;
    if (!graph[packName]) {
      graph[packName] = new Set();
    }
    let dependencies = pack.load;
    if (!Array.isArray(dependencies)) {
      problog('AutoPackager: invalid load:', dependencies, 'for package:', packName);
      dependencies = [];
    }
    dependencies.forEach(dep => {
      const match = Doh.parseAndRemoveLoadDecorators(dep);
      if (match) {
        const depName = match;
        // if (packages[depName]) {  // add edges for valid packages
          graph[packName].add(depName);
          if (!graph[depName]) {
            graph[depName] = new Set();
          }
        // }
      }
    });
  }
  return graph;
}
// Check for cycles in each package and report them
function checkAllPackagesForCycles(packages) {
  const graph = createPackageDependencyGraph(packages);
  const cyclicPackages = [];
  for (let pack in graph) {
    if (hasCycle(graph, pack)) {
      cyclicPackages.push(pack);
    }
  }
  return cyclicPackages;
}
function createPatternDependencyGraph(patterns) {
  const graph = {};
  for (const key in patterns) {
    const pattern = patterns[key];
    const patternName = pattern.name || key;
    if (!graph[patternName]) {
      graph[patternName] = new Set();
    }
    let dependencies = pattern.inherits;
    if (!Array.isArray(dependencies)) {
      console.log('AutoPackager: invalid inherits:', dependencies, 'for pattern:', patternName);
      dependencies = [];
    }
    dependencies.forEach(dep => {
      if (patterns[dep]) {  // add edges for valid patterns
        graph[patternName].add(dep);
        if (!graph[dep]) {
          graph[dep] = new Set();
        }
      }
    });
  }
  return graph;
}
function convertSetsToArrays(obj) {
  if (obj instanceof Set) {
    return Array.from(obj);
  } else if (Array.isArray(obj)) {
    return obj.map(convertSetsToArrays);
  } else if (typeof obj === 'object' && obj !== null) {
    const newObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        newObj[key] = convertSetsToArrays(obj[key]);
      }
    }
    return newObj;
  } else {
    return obj;
  }
}


async function createDohballWithWorker(packageName, outputPath, fullPackagePath, rebake, allDohballSourcePaths, packagerFrom) {
  return new Promise((resolve, reject) => {
    // Assuming auto_dohball_worker.mjs is relative to this script's location might be fragile.
    // Let's construct a more robust path.
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const workerPath = path.resolve(__dirname, 'auto_dohball_worker.mjs');

    const worker = new Worker(workerPath); // Use resolved path

    worker.on('message', (message) => {
      worker.terminate();
      if (message.success) {
        resolve(message.result);
      } else {
        reject(new Error(message.error));
      }
    });
    worker.on('error', reject);
    const actualRebake = Doh.pod.dohball_deployment?.rebake || rebake; // Combine CLI/Pod rebake flags
    // Pass the new arguments in the message
    worker.postMessage({ packageName, outputPath, fullPackagePath, rebake: actualRebake, allDohballSourcePaths: Array.from(allDohballSourcePaths), packagerFrom }); // Modified payload
  });
}
async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    fs.createReadStream(filePath)
      .on('data', data => hash.update(data))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}
async function shouldExposePackage(packageName, packagePath, compiledDohballManifests) {
  const deployConfig = Doh.pod.dohball_deployment || {};
  const exposeAll = deployConfig.expose_packages === '*';
  const ignoredPackages = deployConfig.ignore_packages || [];
  let ignoredPaths = deployConfig.ignore_paths || [];
  const dohballInstallMap = Doh.pod.dohball_install_map || {};

  // try to load the remote dohball manifests from the .doh cache
  // it is found in the DohPath('/.doh/compiled_dohball_manifests.json') file
  if (!compiledDohballManifests) {
    try {
      compiledDohballManifests = JSON.parse(await fsp.readFile(DohPath('/.doh/compiled_dohball_manifest.json'), 'utf8'));
    } catch (e) {
      // do nothing
      compiledDohballManifests = {};
    }
  }

  const remoteDohballManifestEntry = compiledDohballManifests[packageName] || {};

  // extend ignored paths with Doh.pod.packager_ignore
  ignoredPaths.push(...Doh.pod.packager_ignore);

  // if Doh.pod.dohball_deployment.expose_doh_js is true, then remove doh_js from the ignored paths
  if (Doh.pod.dohball_deployment?.expose_doh_js) {
    ignoredPaths = ignoredPaths.filter(path => path !== 'doh_js');
  }

  // Helper function to check if a path is ignored
  function isPathIgnored(path, ignorePatterns) {
    return ignorePatterns.some(pattern => {
      const patternParts = pattern.split('/');
      const pathParts = path.split('/');

      if (patternParts.length > pathParts.length) return false;

      return patternParts.every((part, index) => part === pathParts[index]);
    });
  }

  // Check if package is ignored
  if (ignoredPackages.includes(packageName)) return false;

  // Check if package path is ignored
  if (isPathIgnored(packagePath, ignoredPaths)) return false;

  // Check if package came from another host
  if (typeof dohballInstallMap[packageName] === 'string' || remoteDohballManifestEntry.dohball_host) {
    // Package came from another host, only expose if explicitly listed
    return IsArray(deployConfig.expose_packages) && deployConfig.expose_packages.includes(packageName);
  }

  // For all other packages, return true if exposing all or if explicitly listed
  return exposeAll || (IsArray(deployConfig.expose_packages) && deployConfig.expose_packages.includes(packageName));
}
async function getExposedPackagesByPathGroup() {
  const packagesByPath = {};
  const allPackages = {};
  let compiledDohballManifests = {};

  try {
    compiledDohballManifests = JSON.parse(await fsp.readFile(DohPath('/.doh/compiled_dohball_manifest.json'), 'utf8'));
  } catch (e) {
    // do nothing
  }
  for (const [packageName, packageInfo] of Object.entries(Doh.Packages)) {
    if (await shouldExposePackage(packageName, packageInfo.path, compiledDohballManifests)) {
      if (!packagesByPath[packageInfo.path]) {
        packagesByPath[packageInfo.path] = [];
      }
      packagesByPath[packageInfo.path].push({ packageName, packageInfo });
      allPackages[packageName] = packageInfo;
    }
  }

  return { packagesByPath, allPackages };
}
async function bakeDohballs() {
  if (!Doh.pod.dohball_deployment?.expose_packages) return;
  Doh.performance.start('Bake Dohballs');

  // Check if specific bake targets were provided via CLI
  const bakeTargets = Doh.pod.dohball_deployment?.bake_targets; // This is set temporarily by DohTools
  const isTargetedBake = Array.isArray(bakeTargets) && bakeTargets.length > 0;

  const bakeAction = Doh.pod.dohball_deployment?.rebake ? 'Re-baking' : 'Baking';
  const targetDescription = isTargetedBake ? `specified Dohballs` : `locally hosted Dohballs`;
  console.log(colorize(`Checking if ${targetDescription} need ${bakeAction.toLowerCase()}...`, header_color));

  // Get all potentially exposable packages first
  let { packagesByPath: allExposablePackagesByPath, allPackages: allExposablePackages } = await getExposedPackagesByPathGroup();

  let finalPackagesByPath = allExposablePackagesByPath;
  let finalAllPackages = allExposablePackages;

  // Filter if specific targets were provided
  if (isTargetedBake) {
    finalPackagesByPath = {};
    finalAllPackages = {};
    const targetSet = new Set(bakeTargets);

    for (const [packageName, packageInfo] of Object.entries(allExposablePackages)) {
      if (targetSet.has(packageName)) {
        finalAllPackages[packageName] = packageInfo;
        // Find the corresponding entry in allExposablePackagesByPath
        for (const [pathKey, packageList] of Object.entries(allExposablePackagesByPath)) {
          const foundPackage = packageList.find(p => p.packageName === packageName);
          if (foundPackage) {
            if (!finalPackagesByPath[pathKey]) {
              finalPackagesByPath[pathKey] = [];
            }
            finalPackagesByPath[pathKey].push(foundPackage);
            break; // Found the package, move to next target
          }
        }
      }
    }
    // Check if any specified targets were not found/eligible
    const foundTargets = new Set(Object.keys(finalAllPackages));
    const missingTargets = bakeTargets.filter(target => !foundTargets.has(target));
    if (missingTargets.length > 0) {
      console.warn(colorize(`  Warning: The following specified targets were not found or are not eligible for baking: ${missingTargets.join(', ')}`, warn_color));
    }
  }

  const created = [];
  const finalPackageCount = Object.keys(finalPackagesByPath).length;

  if (finalPackageCount === 0) {
    console.log(colorize(`  No Dohballs to check.`, text_color));
    Doh.performance.endlog('Bake Dohballs');
    console.log(' ');
    return;
  }

  console.log(colorize(`  Found ${colorize(finalPackageCount, number_color)}`, text_color), colorize(`dohballs to check...`, text_color));

  const dohballsToCreate = [];

  for (const [folderPath, packages] of Object.entries(finalPackagesByPath)) {
    const folderName = path.basename(folderPath);
    const parentPath = path.dirname(folderPath);
    const dohballName = `${folderName}.tar.gz`;
    const dohballHostPath = Doh.toForwardSlash(path.join(DohPath('/dohballs/'), parentPath, dohballName));
    const relativeDohballTargetPath = Doh.toForwardSlash(path.join(parentPath, folderName));

    const packageName = packages[0].packageName;
    const fullPackagePath = DohPath(path.resolve(Doh.Packages[packageName].path));

    dohballsToCreate.push({ packageName, dohballHostPath, fullPackagePath, relativeDohballTargetPath });
  }

  const workerPool = new Set();
  const results = [];
  const WORKER_POOL_SIZE = Doh.pod.dohball_deployment?.worker_pool_size || 4;

  // Collect all source paths that will be baked
  const allDohballSourcePaths = new Set(Object.keys(finalPackagesByPath));

  for (const dohball of dohballsToCreate) {
    if (workerPool.size >= WORKER_POOL_SIZE) {
      await Promise.race(workerPool);
    }

    console.log(colorize(`  Checking:  ${dohball.relativeDohballTargetPath}`, text_color));
    // Pass allDohballSourcePaths and PackagerFrom to the worker
    const workerPromise = createDohballWithWorker(dohball.packageName, dohball.dohballHostPath, dohball.fullPackagePath, undefined, allDohballSourcePaths, PackagerFrom)
      .then(async (result) => {
        if (result !== false) {
          console.log(colorize(`  Baked:  ${dohball.relativeDohballTargetPath}`, warn_color));
          created.push(dohball.relativeDohballTargetPath);
          return true;
        }
        return false;
      })
      .catch((error) => {
        console.error(colorize(`  Error baking dohball for ${dohball.packageName}: ${error.message}`, error_color));
        return false;
      })
      .finally(() => {
        workerPool.delete(workerPromise);
      });

    workerPool.add(workerPromise);
    results.push(workerPromise);
  }

  await Promise.all(results);

  if (created.length > 0) {
    console.log(colorize(`  Ding! Baked ${created.length} Dohballs.`, warn_color));
  } else console.log(colorize('  No Dohballs need re-baking.', text_color));

  //await createDohballManifest(packagesByPath, allPackages);

  Doh.performance.endlog('Bake Dohballs');
  console.log(' ');
}
async function createDohballManifestFromExposedDohballs() {
  if (!Doh.pod.dohball_deployment?.compile_manifest) return;
  let expose_packages = Doh.pod.dohball_deployment.expose_packages;
  Doh.pod.dohball_deployment.expose_packages = '*';
  // console.log(colorize('Checking for locally hosted Dohballs...', header_color));
  const { packagesByPath, allPackages } = await getExposedPackagesByPathGroup();

  const dohballsToCreate = [];

  for (const [folderPath, packages] of Object.entries(packagesByPath)) {
    const folderName = path.basename(folderPath);
    const parentPath = path.dirname(folderPath);
    const dohballName = `${folderName}.tar.gz`;
    const dohballHostPath = Doh.toForwardSlash(path.join(DohPath('/dohballs/'), parentPath, dohballName));
    const relativeDohballTargetPath = Doh.toForwardSlash(path.join(parentPath, folderName));

    const packageName = packages[0].packageName;
    const fullPackagePath = DohPath(path.resolve(Doh.Packages[packageName].path));

    dohballsToCreate.push({ packageName, dohballHostPath, fullPackagePath, relativeDohballTargetPath });
  }
  await createDohballManifest(packagesByPath, allPackages);
  //console.log('  Dohball hosting manifest: ', DohPath('/doh_js/manifests/dohball_manifest.json'));
  Doh.pod.dohball_deployment.expose_packages = expose_packages;
}
async function createDohballManifest(packagesByPath, allPackages) {
  const manifestPath = DohPath('/doh_js/manifests/dohball_manifest.json');
  let manifest = {};

  for (const [folderPath, packages] of Object.entries(packagesByPath)) {
    const folderName = path.basename(folderPath);
    const parentPath = path.dirname(folderPath);
    const dohballName = `${folderName}.tar.gz`;
    const dohballHostPath = Doh.toForwardSlash(path.join(DohPath('/dohballs/'), parentPath, dohballName));
    // get the dohball version from the newly created .dohball file in the original folderPath
    const dohballVersion = await getDohballVersion(folderPath);

    let stats;
    try {
      stats = await fs.promises.stat(dohballHostPath);
      //const checksum = await calculateFileHash(dohballHostPath);
    } catch (error) {
      console.warn(colorize(`  Dohball missing: ${dohballHostPath}`, warn_color));
      // if this fails, we don't have the dohball yet, so just skip adding it for now.
      continue;
    }

    const sharedProperties = {
      version: (dohballVersion || 0),
      updated: stats.mtime.toISOString(),
      //checksum: checksum//,
      //dohball_filepath: Doh.toForwardSlash(path.relative(DohPath('/'), dohballHostPath))
    };

    for (const { packageName, packageInfo } of packages) {
      manifest[packageName] = {
        ...packageInfo,
        ...Doh.Packages[packageName],
        ...sharedProperties
      };
    }
  }

  await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  // if (Object.keys(manifest).length > 0) console.log(colorize(`  Dohball hosting manifest:`, text_color), DohPath.Relative(manifestPath));
}
async function getDohballVersion(dohballPath) {
  const dohballVersionPath = path.join(dohballPath, 'dohball.json');
  try {
    const dohballJSON = await fs.promises.readFile(dohballVersionPath, 'utf8');
    return JSON.parse(dohballJSON).version;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return 0;
    } else {
      throw error;
    }
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

// standardize import handling
async function processImport(importSource, filePath) {
  if (importSource.startsWith('.') || importSource.startsWith('http') || importSource.startsWith('/') ||
      importSource === 'DYNAMIC_EXPRESSION' || builtinModules.includes(importSource)) {
    return;
  }

  try {
    const requireFunc = createRequire(import.meta.url);
    let packagePath;
    
    try {
      // Find the package.json for this import
      const modulePath = requireFunc.resolve(importSource, path.dirname(filePath) + '');
      packagePath = path.join(path.dirname(modulePath), 'package.json');
      
      // For scoped packages, walk up to find the package.json
      if (!fs.existsSync(packagePath)) {
        let currentDir = path.dirname(modulePath);
        while (currentDir !== path.parse(currentDir).root) {
          const candidate = path.join(currentDir, 'package.json');
          if (fs.existsSync(candidate)) {
            packagePath = candidate;
            break;
          }
          currentDir = path.dirname(currentDir);
        }
      }
    } catch (err) {
      // If direct resolution fails, try node_modules
      const parts = importSource.split('/');
      const pkgName = parts[0].startsWith('@') ? parts.join('/') : parts[0];
      const subpath = parts.slice(1).join('/');
      const nodeModulesPath = path.join('node_modules', pkgName);
      
      if (fs.existsSync(nodeModulesPath)) {
        packagePath = path.join(nodeModulesPath, 'package.json');
      } else {
        //return; // Skip if we can't find the module
      }
    }

    const options = {
      dev: false,
      external: [...(Doh.pod.esm_sh_external || [])]
    };
    if (packagePath && fs.existsSync(packagePath)) {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      const version = pkg.version;

      // Generate esm.sh URLs for browser
      const esmShUrl = generateEsmShUrl(importSource, version, options);
      
      // Store the URLs in the import maps
      nodeImports[importSource] = DohPath.DohSlash(packagePath);
      if(!importSource.startsWith('node:') && !importSource.startsWith('bun:')) {
        browserImports[importSource] = esmShUrl;
      }
    } else {
      if(!importSource.startsWith('node:') && !importSource.startsWith('bun:')) {
        // generate a url for the package using latest version
        const esmShUrl = generateEsmShUrl(importSource, 'latest');
        browserImports[importSource] = esmShUrl;
      }
    }
  } catch (err) {
    if (!err.code?.includes('MODULE_NOT_FOUND')) {
      problog(`Error processing import ${importSource}: ${err.message}`);
    }
  }
}
// generate esm.sh URLs
function generateEsmShUrl(moduleName, version, options = {}) {
  
  // Remove @ from scope packages for URL
  let urlName = moduleName.startsWith('@') ? 
    moduleName.replace('/', '%2F') : 
    moduleName;

  // for this to work, the urlName must be the package name, followed by the version, THEN the rest of the path if any
  // the problem is that the urlName sometimes includes a subpath that needs to be preserved and placed after the version
  // so we need to split the urlName by the package name and version, and then join the rest of the path back together
  const parts = urlName.split('/');
  const packageName = parts[0];
  const rest = parts.slice(1).join('/');
  const subpath = rest ? '/' + rest : '';
  if (subpath) options.isSubModuleOf = packageName;
  
  // Build query parameters
  // const params = ['standalone'];
  const params = [];
  if (options.dev) params.push('dev');
  if (options.noModule) params.push('no-module');
  if (options.pin) params.push('pin');
  if (options.external && options.external.length > 0) params.push(`external=${options.external.join(',')}`);
  
  const queryString = params.length > 0 ? '?' + params.join('&') : '';
  
  return `https://esm.sh/${packageName}@${version}${subpath}${queryString}`;
}

//MARK: runPackager
async function runPackager() {

  Doh.performance.start('AutoPackager');

  console.log(colorize('Auto-Packager scanning...', header_color));

  resetPackager();

  ensureDir(DohPath('/.doh/manifests'));
  ensureDir(DohPath('/doh_js/manifests'));

  let blazingfastpromisecollection = [];

  blazingfastpromisecollection.push(processDirectories([PackagerFrom + '/doh_js/']));
  blazingfastpromisecollection.push(processDirectories([PackagerFrom + '/']));

  await Promise.all(blazingfastpromisecollection);
  blazingfastpromisecollection = [];

  // console.log(colorize('  Scanned:\t', text_color), colorize(number_of_files + ' files', number_color));

  // console.log(' ');

  // console.log(colorize('AutoPackager found:', header_color));

  // console.log(colorize('  YAML files:\t', text_color), colorize(number_of_yaml_files, number_color));
  // console.log(colorize('  Doh files:\t\t', text_color), colorize(Object.keys(DFP).length, number_color));

  Object.assign(Doh.Packages, DAP);
  // console.log(colorize('  Packages:\t\t', text_color), colorize(Object.keys(Doh.Packages).length, number_color));

  const cyclicPackages = checkAllPackagesForCycles(Doh.Packages);
  if (cyclicPackages.length > 0) {
    console.log(colorize('  Cyclic deps:\t', text_color), cyclicPackages.length === 0 ?
      colorize('0', number_color) :
      colorize('<<!! YES !!>>', error_color));

    console.log(colorize('First Cyclic dep:\t', error_color), cyclicPackages[0], '\n');
    console.log(colorize('  Problems:\t', error_color), problems.length);
    problems.forEach((problem) => {
      console.log(colorize('    ', error_color), ...problem);
    });
    writeJSONManifest('/.doh/manifests/autopackager_problems.json', problems);
    throw new Error('####  !!Cyclic dependencies found in packages!!  ####');
  }

  blazingfastpromisecollection.push(writeJSONManifest('^/manifests/module_dep_graph.json', convertSetsToArrays(createPackageDependencyGraph(Doh.Packages))));

  // Write the new import manifests
  // node imports are private, so we put them in the /.doh/manifests directory
  blazingfastpromisecollection.push(writeJSONManifest('/.doh/manifests/node_esm_manifest.json', Object.fromEntries(Object.entries(nodeImports).sort())));
  // console.log(colorize('  Node ESM Manifest:\t', text_color), DohPath.Relative('/.doh/manifests/node_esm_manifest.json'));

  // browser imports are public, so we put them in the /doh_js/manifests directory
  blazingfastpromisecollection.push(writeJSONManifest('^/manifests/browser_esm_manifest.json', Object.fromEntries(Object.entries(browserImports).sort())));
  // console.log(colorize('  Browser ESM Manifest:\t', text_color), DohPath.Relative('/doh_js/manifests/browser_esm_manifest.json'));
  
  // console.log(colorize('  Patterns:\t\t', text_color), colorize(Object.keys(Doh.PatternFile).length, number_color));
  blazingfastpromisecollection.push(writeJSONManifest('^/manifests/patterns_manifest.json', Doh.PatternModule));
  blazingfastpromisecollection.push(writeJSONManifest('^/manifests/core_patterns_manifest.json', Doh.CorePatterns));

  // Add asset manifest writing
  // console.log(colorize('  Assets:\t\t', text_color), colorize(Object.keys(Doh.AssetsInModule || {}).length, number_color));
  blazingfastpromisecollection.push(writeJSONManifest('^/manifests/assets_manifest.json', Doh.AssetsInModule));

  // console.log(colorize('  Codebase:\t\t', text_color), colorize(Math.round(totalCodebaseSize / 1024) + ' kb', number_color));

  blazingfastpromisecollection.push(writeJSONManifest('^/manifests/package_manifest.json', Doh.Packages));
  blazingfastpromisecollection.push(writeJSONManifest('/.doh/manifests/cli_manifest.json', DCLI));
  blazingfastpromisecollection.push(writeJSONManifest('/.doh/manifests/pod_manifest.json', DPod));

  let num_pattern_dups = Object.keys(patternDuplicates).length;
  if (num_pattern_dups > 0) {
    console.log(colorize('  Pattern Dups:\t', text_color), colorize(num_pattern_dups, number_color));
    console.log('    ', DohPath.Relative('/.doh/manifests/pattern_duplicates.json'));
  }
  blazingfastpromisecollection.push(writeJSONManifest('/.doh/manifests/pattern_duplicates.json', patternDuplicates));

  let num_deprecated = deprecated.length;
  if (num_deprecated > 0) {
    console.log(colorize('  Deprecated:\t', text_color), colorize(num_deprecated, number_color));
    console.log('    ', DohPath.Relative('/.doh/manifests/deprecated_features.json'));
  }
  blazingfastpromisecollection.push(writeJSONManifest('/.doh/manifests/deprecated_features.json', deprecated));

  if (problems.length > 0) {
    console.log(colorize('  Problems:\t\t', text_color), colorize(problems.length, problems.length > 0 ? error_color : number_color));
    problems.forEach((problem) => {
      console.log(colorize('    ', error_color), ...problem);
    });
  }
  blazingfastpromisecollection.push(writeJSONManifest('/.doh/manifests/autopackager_problems.json', problems));

  // console.log(colorize('Recompiling host pod from new pod manifest...', header_color));
  //await Doh.compile_host_pod();
  blazingfastpromisecollection.push(Doh.load_host_pod(Doh.args_pod || null, true));
  
  await Promise.all(blazingfastpromisecollection);

  // console log the total number of files scanned
  console.log(colorize('  Scanned:\t', text_color), colorize(number_of_files + ' files', number_color));

  Doh.performance.endlog('AutoPackager');

  Doh.packagerStats = {
    packages: Object.keys(Doh.Packages).length,
    totalCodebaseSize,
    totalFiles: number_of_files,
    yamlFiles: number_of_yaml_files,
    dohFiles: Object.keys(DFP).length,
    patterns: Object.keys(Doh.PatternModule).length,
    patternDuplicates: Object.keys(patternDuplicates).length,
    problems: problems.length,
    deprecated: deprecated.length
  };
  // Send stats to parent if we're in a child process
  Doh.sendToParent('packagerStats', Doh.packagerStats);
}


//MARK: resetPackager
function resetPackager() {
  //Doh.Packages = {};

  directories_to_skip = [];

  directories_to_skip = Doh.pod.packager_ignore || [];

  cleanupPackager();

  totalCodebaseSize = 0;

  Doh.CorePatterns = [];

  problems = [];
  deprecated = [];

  patternDuplicates = {};
  number_of_files = 0, number_of_yaml_files = 0;

}

function cleanupPackager() {
  DFP = {};
  DAP = {};
  DAPHooks = {};
  DCLI = {};
  DPod = {};
  browserImports = {};
  nodeImports = {};
}

// Small modifications to parseJSFile and parseDohYAMLFile to update cache
const originalParseJSFile = parseJSFile;
parseJSFile = async function (filePath) {
  await originalParseJSFile(filePath);

  const relPath = toForwardSlash(path.relative(PackagerFrom, filePath));

  // Update cache after parsing
  if (!apCache[relPath]) {
    apCache[relPath] = await getFileInfo(filePath);
  }

  // Check if file contains Doh content
  const hasDohContent = Boolean(
    DFP[relPath]?.ModuleDefinitions && Object.keys(DFP[relPath].ModuleDefinitions).length > 0 ||
    DFP[relPath]?.PackageDefinitions && Object.keys(DFP[relPath].PackageDefinitions).length > 0 ||
    DFP[relPath]?.PatternDefinitions && Object.keys(DFP[relPath].PatternDefinitions).length > 0
  );

  apCache[relPath].hasDohContent = hasDohContent;

  if (hasDohContent && DFP[relPath]) {
    apCache[relPath].manifestEntry = DFP[relPath];
    
    // Store imports as objects keyed by specifier
    apCache[relPath].package_imports = DFP[relPath].package_imports;
    apCache[relPath].node_imports = DFP[relPath].node_imports;
    apCache[relPath].browser_imports = DFP[relPath].browser_imports;
  }
};

const originalParseDohYAMLFile = parseDohYAMLFile;
parseDohYAMLFile = async function (filePath) {
  await originalParseDohYAMLFile(filePath);

  const relPath = "/" + toForwardSlash(path.relative(PackagerFrom, filePath));

  // Update cache after parsing
  if (!apCache[relPath]) {
    apCache[relPath] = await getFileInfo(filePath);
  }

  // All .doh.yaml files are considered Doh content
  apCache[relPath].hasDohContent = true;

  // Store parsed packages
  apCache[relPath].packages = {};
  for (const packageName in Doh.Packages) {
    if (Doh.Packages[packageName].packagefile === relPath) {
      apCache[relPath].packages[packageName] = Doh.Packages[packageName];
    }
  }

  // Convert import arrays to objects if necessary
  // if (!apCache[relPath].package_imports) apCache[relPath].package_imports = {};
  // if (!apCache[relPath].node_imports) apCache[relPath].node_imports = {};
  // if (!apCache[relPath].browser_imports) apCache[relPath].browser_imports = {};
};

// Add cache initialization to resetPackager
const originalResetPackager = resetPackager;
resetPackager = async function () {
  // Initialize cache
  global.apCache = await loadApCache();
  await cleanupCache(apCache);

  // Call original resetPackager
  originalResetPackager();
};

// Add cache saving at the end of runPackager
const originalRunPackager = runPackager;
runPackager = async function () {
  global.apCache = await loadApCache();
  await originalRunPackager();
  await saveApCache(apCache);
};

const runMigrations = async function () {
  const DohVersion = await getDohballVersion(DohPath('/doh_js'));
  // we need to scan for migrations with verions at or below the current version
  const migrations = fs.readdirSync(DohPath('/doh_js/migrations')).filter(file => file.endsWith('.js') && isSameOrNewerVersion(DohVersion, file.replace('.js', '')));
  for (const migration of migrations) {
    // see if the migration has already been run
    const migrationFile = DohPath.FileURL('/doh_js/migrations/' + migration);
    const migrationManifest = DohPath('/secrets/migrations/doh_js/' + (migration.replace('.js', '.json')));
    if (fs.existsSync(migrationManifest)) {
      continue;
    }
    await import(migrationFile);
  }
}

await runMigrations();

await runPackager();

let esbuild_processor;
let processManifest;

Doh.hostUrlString = function () {
  let remote_path;
  const isLocalhost = (Doh.pod?.express_config?.hostname === 'localhost');
  const isSecure = (Doh.pod?.express_config?.ssl_port || false);
  const port = isSecure ? Doh.pod?.express_config?.ssl_port : Doh.pod?.express_config?.port || 3000;
  const isNonStandardPort = isSecure ? (port !== 443) : (port !== 80);
  const portStringOrBlank = (isNonStandardPort && !Doh.pod?.express_config?.mask_remapped_ports) ? `:${port}` : '';


  if (isLocalhost || !Doh.pod?.express_config?.hostname) {
      remote_path = `http${isSecure ? 's' : '' }://localhost${portStringOrBlank}`;
  } else {
      remote_path = `http${isSecure ? 's' : '' }://${Doh.pod?.express_config?.hostname}${portStringOrBlank}`;
  }
  return remote_path;
}

const updateImportMap = function () {
  let hostUrl = Doh.hostUrlString();
  // for each package in the import-map.json file, prefix the url with the hostUrl
  const importMap = JSON.parse(fs.readFileSync(DohPath('/dist/esm-bundles/import-map.json'), 'utf8'));
  const browserEsmManifest = JSON.parse(fs.readFileSync(DohPath('/doh_js/manifests/browser_esm_manifest.json'), 'utf8'));
  for (const [packageName, url] of Object.entries(importMap.imports)) {
    importMap.imports[packageName] = hostUrl + url;
  }
  for (const [packageName, url] of Object.entries(importMap.imports)) {
    browserEsmManifest[packageName] = url;
  }
  fs.writeFileSync(DohPath('/dist/esm-bundles/remote-import-map.json'), JSON.stringify({imports: browserEsmManifest}, null, 2));
}

if (Doh.pod.always_esbuild) {
  esbuild_processor = await import('./esbuild_processor.js');
  processManifest = esbuild_processor.processManifest;
  updateImportMap();
}

await import('./installer.js');

if (Doh.installationChanged) {
  // console.warn(colorize('AutoPackager: Installation changed, running again...', warn_color));
  await runPackager();
  //Doh.installationChanged = false;
  await processManifest().catch(error => {
    console.error('Failed to process manifest:', error);
    process.exit(1);
  });
  updateImportMap();
}

await bakeDohballs();

// create the dohball manifest from the exposed dohballs
await createDohballManifestFromExposedDohballs();

if(Doh.pod.dohball_deployment?.expose_packages) {
  // Discover orphaned dohballs and record them in the dohballs/dohballs.json file
  await discoverOrphanedDohballs();
}

// cleanup memory
// console.log(colorize('  Heap size before cleanup:', text_color), colorize(Doh.memoryUsed(), number_color));

// console.log(colorize('AutoPackager: Cleaning up memory... (Use Doh.memoryUsed() to check)', header_color));


Doh.AutoPackager = function (package_name, callback) {
  DAPHooks[package_name] = DAPHooks[package_name] || {};
  DAPHooks[package_name].callback = callback;
}
for (const [package_name, hookdef] of Object.entries(DAPHooks)) {
  // console.log(colorize('Running Doh.AutoPackager("' + package_name + '")', header_color));
  await import(DohPath.FileURL(hookdef.file));
  await hookdef.callback({
    DAP, 
    DCLI, 
    DPod, 
    DFP, 
    DAPHooks, 
    browserImports, 
    nodeImports, 
    patternDuplicates, 
    deprecated, 
    problems, 
    number_of_files, 
    number_of_yaml_files, 
    totalCodebaseSize});
}

cleanupPackager();

Doh.manifests_are_loaded = true;

if (Doh.installationChanged) {
  console.warn(colorize('AutoPackager: Installation change requires external restart. Run Doh again, or use a process manager to restart it automatically.', warn_color));
  process.exit(0);
}

// Add this new function definition somewhere in the file, 
// for example, after the getDohballVersion function

async function discoverOrphanedDohballs() {
  Doh.performance.start('Discover Orphaned Dohballs');
  const dohballsDir = DohPath('/dohballs/');
  const manifestPath = DohPath.Join(dohballsDir, 'dohballs.json');

  let existingDohballs = [];
  const scannedDohballSourcePaths = new Set();

  // Helper function to recursively scan for .tar.gz files
  async function scanForDohballs(currentDir) {
    try {
      const entries = await fsp.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await scanForDohballs(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.tar.gz')) {
          // Convert dohball file path back to source DohSlash path
          const relativeFilePath = Doh.toForwardSlash(path.relative(dohballsDir, fullPath)); // e.g., modules/user/core.tar.gz
          const sourcePathRelative = relativeFilePath.replace(/\.tar\.gz$/, ''); // e.g., modules/user/core
          const sourceDohSlashPath = '/' + sourcePathRelative; // e.g., /modules/user/core
          scannedDohballSourcePaths.add(sourceDohSlashPath);
          existingDohballs.push(sourceDohSlashPath);
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(colorize(`  Warning: Error scanning ${currentDir}: ${error.message}`, warn_color));
      }
      // If the dohballsDir doesn't exist, there's nothing to clean up
    }
  }

  // Scan the dohballs directory
  await scanForDohballs(dohballsDir);

  // Get the set of currently valid exposed source paths
  // Use '*' temporarily to get all potentially hosted paths, similar to createDohballManifestFromExposedDohballs
  let originalExposePackages = Doh.pod.dohball_deployment?.expose_packages;
  if (Doh.pod.dohball_deployment) Doh.pod.dohball_deployment.expose_packages = '*'; 
  const { packagesByPath } = await getExposedPackagesByPathGroup();
  if (Doh.pod.dohball_deployment) Doh.pod.dohball_deployment.expose_packages = originalExposePackages; // Restore original setting
  
  const validSourcePaths = new Set(Object.keys(packagesByPath));

  // covert the valid source paths to DohSlash paths
  const validSourcePathsDohSlash = new Set(Object.keys(packagesByPath).map(p => ('/' + p)));

  // Identify orphans (exist in scan, but not in valid paths)
  const orphanedPaths = existingDohballs.filter(p => !validSourcePathsDohSlash.has(p));

  // Read or initialize the manifest
  let manifest = { removals: [] };
  try {
    if (await fsp.access(manifestPath, fsp.constants.F_OK)) {
      const manifestContent = await fsp.readFile(manifestPath, 'utf8');
      manifest = JSON.parse(manifestContent);
      manifest.removals = manifest.removals || [];
    } else {
      // Ensure directory exists if manifest is new
      await ensureDir(path.dirname(manifestPath)); 
    }
  } catch (error) {
    console.error(colorize(`  Error reading ${manifestPath}: ${error.message}`, error_color));
  }

  // Update removals list
  let updated = false;
  const currentRemovals = new Set(manifest.removals);

  // Add new orphans
  orphanedPaths.forEach(orphan => {
    if (!currentRemovals.has(orphan)) {
      manifest.removals.push(orphan);
      updated = true;
    }
  });

  // Remove paths that are no longer orphaned (exist in validSourcePaths again)
  const removalsToKeep = [];
  manifest.removals.forEach(removal => {
    if (currentRemovals.has(removal)) { // Check if it was in the original list
        if (validSourcePaths.has(removal)) {
            // It came back! Remove it from removals.
            updated = true; 
        } else {
            // Still orphaned or newly orphaned, keep it.
            removalsToKeep.push(removal);
        }
    } else {
        // This path was just added as an orphan, keep it.
         removalsToKeep.push(removal);
    }
  });

  // Add the newly identified orphans that weren't in the original list
  orphanedPaths.forEach(orphan => {
      if (!currentRemovals.has(orphan)) {
          if (!removalsToKeep.includes(orphan)) { // Avoid duplicates if somehow added above
             removalsToKeep.push(orphan); 
          }
      }
  });
  
  // Use a Set to ensure uniqueness before assigning back
  manifest.removals = [...new Set(removalsToKeep)];

  // Write manifest if updated
  if (updated || !(await fsp.exists(manifestPath))) {
    try {
      await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(colorize(`  Updated orphaned dohball manifest:`, text_color), DohPath.Relative(manifestPath));
    } catch (error) {
      console.error(colorize(`  Error writing ${manifestPath}: ${error.message}`, error_color));
    }
  } else {
    //console.log(colorize(`  Orphaned dohball manifest is up-to-date.`, text_color));
  }
  Doh.performance.endlog('Discover Orphaned Dohballs');
}