// these are used when the esbuild_doh_plugin is loaded as a plugin
import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import { builtinModules, createRequire } from 'module';

const require = createRequire(import.meta.url);

function isBuiltin(specifier) {
  // Remove the "node:" prefix if it exists.
  if (specifier.startsWith('node:')) {
    specifier = specifier.slice(5);
  }
  // Extract the base module (e.g., "fs" from "fs/promises")
  const [base] = specifier.split('/');
  return builtinModules.includes(base);
}

const isInstalledInNodeModules = (pkg_path, resolveDir = DohPath('/')) => {
  try {
    // Extract the actual package name from the import path
    const packageParts = pkg_path.split('/');
    const isScopedPackage = pkg_path.startsWith('@');
    const pkgName = isScopedPackage ? 
      `${packageParts[0]}/${packageParts[1]}` : 
      packageParts[0];
    
    // Traverse up the directory tree to find the package
    let currentDir = resolveDir;
    
    while (currentDir && currentDir !== path.parse(currentDir).root) {
      // Check if this directory has a node_modules folder with our package
      const possiblePkgDir = path.join(currentDir, 'node_modules', pkgName);
      const possiblePkgJson = path.join(possiblePkgDir, 'package.json');
      
      if (fs.existsSync(possiblePkgJson)) {
        return true;
      }
      
      // Move up one directory
      currentDir = path.dirname(currentDir);
    }
    
    // Final check at project root
    const rootPkgDir = path.join(DohPath('/'), 'node_modules', pkgName);
    const rootPkgJson = path.join(rootPkgDir, 'package.json');
    
    return fs.existsSync(rootPkgJson);
  } catch (error) {
    return false;
  }
}

Doh.Pod('esbuild_doh_plugin', {
  moc: {
    esbuild_doh_plugin: 'IsObject'
  },
  esbuild_doh_plugin: {
    moc: {
      deduplicate_packages: 'IsBoolean',
      log_dedup_summary: 'IsBoolean',
      fix_files: 'IsBoolean',
      replace_native_modules: 'IsBoolean',
      skip_deduplication: 'IsArray',
      node_builtins: 'IsArray',
      allow_external_resolution: 'IsBoolean'
    },
    deduplicate_packages: true,
    log_dedup_summary: false,
    fix_files: true,
    replace_native_modules: true,
    allow_external_resolution: true,
    // list of packages to skip deduplication for by default, we know these packages are not compatible with each other
    exclude_from_deduplication: [],
    include_as_node_builtins: [
      'http', 'https','worker_threads', 'term.js', 'pty.js',
      // 'http', 'https', 'net', 'tls', 'fs', 'path', 'os', 'crypto', 'stream', 
      // 'events', 'child_process', 'cluster', 'dgram', 'dns', 'inspector', 
      // 'module', 'process', 'readline', 'repl', 'tty', 'util', 'v8', 'vm', 
      // 'zlib', 'perf_hooks'
    ],
    empty_modules: []
  }
});
Doh.Package('esbuild_doh_plugin', {load: ['doh_js']});

const toForwardSlash = (str) => str.replace(/\\/g, '/');

let esbuild_doh_plugin = {
  name: 'esbuild_doh_plugin',
  setup(build) {
    
    // Cache for problematic package detection
    const problematicPackages = new Set();
    
    // Map to track deduplicated packages and their occurrences
    const dedupMap = new Map();
    
    // Map to track packages that were considered but not deduplicated
    const nonDedupMap = new Map();

    const externalModules = new Set();
    
    // Function to log deduplication summary at the end of the build
    const logDedupSummary = () => {
      if (dedupMap.size === 0 && nonDedupMap.size === 0) {
        // console.log('No packages were considered for deduplication during the build.');
        return;
      }
      
      console.log('=== Package Deduplication Analysis ===');
      
      if (dedupMap.size > 0) {
        console.log(' ');
        console.log('Successfully Deduplicated Packages:');
        console.log(`Total deduplicated packages: ${dedupMap.size}`);
        let countTabs = '';
        let maxKeyLength = 0;
        for (const [pkgKey, details] of dedupMap.entries()) {
          // determine the max length of the package keys
          if (pkgKey.length > maxKeyLength) {
            maxKeyLength = pkgKey.length;
          }
        }
        console.log(`Package:${' '.repeat(maxKeyLength-4)}Count\t| Root Version\t| Nested Versions`);
        console.log('-------------------------------------------'+'-'.repeat(maxKeyLength+4));
        for (const [pkgKey, details] of dedupMap.entries()) {
          const { count, rootVersion, nestedVersion } = details;
          countTabs = ' '.repeat(maxKeyLength - pkgKey.length); 
          console.log(`${pkgKey}:${countTabs}\t${count}\t| ${rootVersion} \t| ${nestedVersion}`);
        }
        console.log('==========================================='+'='.repeat(maxKeyLength+4));
      }
      
      if (nonDedupMap.size > 0) {
        console.log(' ');
        console.log('Packages Not Deduplicated:');
        console.log(`Total non-deduplicated packages: ${nonDedupMap.size}`);
        let countTabs = '';
        let maxKeyLength = 0;
        for (const [pkgKey, details] of nonDedupMap.entries()) {
          // determine the max length of the package keys
          if (pkgKey.length > maxKeyLength) {
            maxKeyLength = pkgKey.length;
          }
        }
        console.log(`Package:${' '.repeat(maxKeyLength-4)}Count\t| Root Version\t| Nested Versions`);
        console.log('-------------------------------------------'+'-'.repeat(maxKeyLength+4));
        for (const [pkgKey, details] of nonDedupMap.entries()) {
          const { count, rootVersion, nestedVersion, reason } = details;
          countTabs = ' '.repeat(maxKeyLength - pkgKey.length); 
          console.log(`${pkgKey}:${countTabs}\t${count}\t| ${rootVersion} \t| ${nestedVersion} \t| ${reason}`);
        }
        console.log('==========================================='+'='.repeat(maxKeyLength+4));
      }
    };
    
    // Register build end callback to show summary
    if (Doh.pod.esbuild_doh_plugin.deduplicate_packages) {
      build.onEnd(() => {
        if (Doh.pod.esbuild_doh_plugin.log_dedup_summary) {
          logDedupSummary();
        }
        return { errors: [] };
      });
    }

    // Handle bare specifier imports (packages without ./ or ../ prefix)
    build.onResolve({ filter: /^[^./]/ }, async (args) => {
      // ignore any imports that are absolute paths (os agnostic using actual file lookup)
      try {
        if (fs.existsSync(args.path)) {
          return null;
        }
      } catch (error) {
        //console.log(`error: ${error}`);
      }

      // Extract package name (for potential subpath imports like 'package/subpath')
      const packageName = args.path.startsWith('@') 
        ? args.path.split('/').slice(0, 2).join('/') // Scoped package
        : args.path.split('/')[0]; // Regular package
      
      // If we already know this package is problematic, return empty module
      if (problematicPackages.has(packageName)) {
        //console.log(`Skipping known problematic package: ${args.path}`);
        return {
          path: args.path,
          namespace: 'empty-module'
        };
      }
      
      // Handle direct Node.js built-in modules
      if (
        Doh.pod.esbuild_doh_plugin.replace_native_modules &&
        Doh.pod.esbuild_doh_plugin.include_as_node_builtins.includes(args.path)
      ) {
        //console.log(`Providing mock for Node.js built-in: ${args.path}`);
        return {
          path: args.path,
          namespace: 'node-builtin-module'
        };
      }

      let resolvedPath = '';
      try {
        // Try to resolve the module using Node's resolution algorithm
        resolvedPath = args.resolveDir;

        let outerResolveObject = null;
        
        if (
          Doh.pod.esbuild_doh_plugin.allow_external_resolution &&
          // ensure it's not resolvable from node
          // !fs.existsSync(rootPkgJsonPath) && 
          // !fs.existsSync(nestedPkgJsonPath) && 
          !isInstalledInNodeModules(args.path, args.resolveDir) &&
          // ensure it's not a node builtin
          !isBuiltin(args.path)
        ) {
          // if neither package.json exists, we can't deduplicate, but we CAN try to load from external source
          // we need to assume as much and tell esbuild that this resolved path is external
          
          externalModules.add(args.path);
          
          return {
            path: args.path,
            external: true,
            namespace: 'external-module'
          };
        }
        try {
          // Check if we're dealing with a nested node_modules installation
          if ((resolvedPath.match(/node_modules/g) || []).length > 0) {
            // Convert the path to forward slashes for consistent path handling
            const normalizedPath = toForwardSlash(args.resolveDir);
            
            // Get the root node_modules path
            const projectRootNodeModulesPath = path.join(process.cwd(), 'node_modules');
            const projectRootNodeModulesPathForwardSlash = toForwardSlash(projectRootNodeModulesPath);
            
            // Skip processing if we're already in the distribution directory or at root node_modules
            if (normalizedPath.includes('dist/esm-bundles') || normalizedPath === projectRootNodeModulesPathForwardSlash) {
              return null;
            }
            
            try {
              
              // Extract the actual package name from the import path
              const packageParts = args.path.split('/');
              const isScopedPackage = args.path.startsWith('@');
              const pkgName = isScopedPackage ? 
                `${packageParts[0]}/${packageParts[1]}` : 
                packageParts[0];
                
              // Check if we're importing a subpath of the package
              const hasSubpath = packageParts.length > (isScopedPackage ? 2 : 1);
              const subpathParts = hasSubpath ? packageParts.slice(isScopedPackage ? 2 : 1) : [];
              const subpathString = subpathParts.join('/');
                
              // Find the package by traversing up from resolveDir to locate the containing node_modules
              const findNestedPackageJson = (startDir, packageName) => {
                let currentDir = startDir;
                
                // Traverse up the directory tree
                while (currentDir && currentDir !== path.parse(currentDir).root) {
                  // Check if this directory has a node_modules folder with our package
                  const possiblePkgDir = path.join(currentDir, 'node_modules', packageName);
                  const possiblePkgJson = path.join(possiblePkgDir, 'package.json');
                  
                  if (fs.existsSync(possiblePkgJson)) {
                    return possiblePkgJson;
                  }
                  
                  // Move up one directory
                  currentDir = path.dirname(currentDir);
                }
                
                return null;
              };
              
              // Find the parent package.json (the package that depends on our nested package)
              const findParentPackageJson = (nestedPackagePath) => {
                // Go up to the node_modules directory containing this package
                const nodeModulesDir = path.dirname(path.dirname(nestedPackagePath));
                // Go up one more to find the parent package
                const parentDir = path.dirname(nodeModulesDir);
                const parentPkgJson = path.join(parentDir, 'package.json');
                
                return fs.existsSync(parentPkgJson) ? parentPkgJson : null;
              };
              
              // Find the nested package.json
              const nestedPkgJsonPath = findNestedPackageJson(args.resolveDir, pkgName);
              
              // Find the root package.json
              const rootPkgDir = path.join(projectRootNodeModulesPath, pkgName);
              const rootPkgJsonPath = path.join(rootPkgDir, 'package.json');
              
              if (nestedPkgJsonPath && 
                  rootPkgJsonPath !== nestedPkgJsonPath &&
                  Doh.pod.esbuild_doh_plugin.deduplicate_packages
              ) {
                
                // skip processing if the package is in the Doh.pod.esbuild_doh_plugin.skip_deduplication array
                if (Doh.pod?.esbuild_doh_plugin?.exclude_from_deduplication?.includes(args.path)) {
                  // Add to nonDedupMap with a reason before skipping
                  const pkgKey = args.path;
                  if (!nonDedupMap.has(pkgKey)) {
                    nonDedupMap.set(pkgKey, { 
                      count: 1, 
                      rootVersion: ' N/A  ', 
                      nestedVersion: ' N/A  ',
                      reason: 'Explicitly skipped in configuration'
                    });
                  } else {
                    const details = nonDedupMap.get(pkgKey);
                    details.count += 1;
                    nonDedupMap.set(pkgKey, details);
                  }
                  return null;
                }
                const nestedPkg = JSON.parse(fs.readFileSync(nestedPkgJsonPath, 'utf8'));
                const rootPkg = JSON.parse(fs.readFileSync(rootPkgJsonPath, 'utf8'));
                
                // Only deduplicate if the packages have the same name
                if (nestedPkg.name === rootPkg.name) {
                  const nestedVersion = nestedPkg.version;
                  const rootVersion = rootPkg.version;
                  
                  // Check if the parent package has a fixed version requirement
                  let hasFixedVersionRequirement = false;
                  let fixedVersionValue = null;
                  const parentPkgJsonPath = findParentPackageJson(nestedPkgJsonPath);
                  
                  if (parentPkgJsonPath) {
                    const parentPkg = JSON.parse(fs.readFileSync(parentPkgJsonPath, 'utf8'));
                    const dependencyFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
                    
                    for (const field of dependencyFields) {
                      if (parentPkg[field] && parentPkg[field][pkgName]) {
                        const versionRequirement = parentPkg[field][pkgName];
                        
                        // Check if it's an exact version (no special characters like ^, ~, >, <, etc.)
                        if (/^\d+\.\d+\.\d+$/.test(versionRequirement)) {
                          hasFixedVersionRequirement = true;
                          fixedVersionValue = versionRequirement;
                          break;
                        }
                      }
                    }
                  }
                  
                  // Check for subpath existence in the root package if we have a subpath
                  let subpathExists = true;
                  if (hasSubpath) {
                    // First check in package.json "exports" field (modern way)
                    const hasExportsField = rootPkg.exports && typeof rootPkg.exports === 'object';
                    const subpathExportExists = hasExportsField && 
                      (rootPkg.exports[`./${subpathString}`] || rootPkg.exports[`/${subpathString}`] || rootPkg.exports[subpathString]);
                    
                    if (!subpathExportExists) {
                      // Then check for physical file presence (older way)
                      const possibleSubpaths = [
                        path.join(rootPkgDir, subpathString), 
                        path.join(rootPkgDir, `${subpathString}.js`),
                        path.join(rootPkgDir, `${subpathString}.mjs`),
                        path.join(rootPkgDir, `${subpathString}/index.js`),
                        path.join(rootPkgDir, `${subpathString}/index.mjs`)
                      ];
                      
                      subpathExists = possibleSubpaths.some(path => fs.existsSync(path));
                    }
                  }
                  
                  // Only deduplicate if:
                  // 1. version is compatible AND
                  // 2. subpath exists (when applicable) AND
                  // 3. no fixed version requirement
                  if (semver.satisfies(rootVersion, '>='+nestedVersion) && 
                      subpathExists && 
                      !(hasFixedVersionRequirement && rootVersion !== nestedVersion)) {
                    
                    outerResolveObject = await build.resolve(args.path, { 
                      kind: 'import-statement',
                      resolveDir: projectRootNodeModulesPath
                    });
                    
                    // Add to deduplication map instead of logging directly
                    const pkgKey = `${pkgName}${hasSubpath ? '/' + subpathString : ''}`;
                    if (!dedupMap.has(pkgKey)) {
                      dedupMap.set(pkgKey, { 
                        count: 1, 
                        rootVersion, 
                        nestedVersion 
                      });
                    } else {
                      const details = dedupMap.get(pkgKey);
                      details.count += 1;
                      dedupMap.set(pkgKey, details);
                    }
                    
                    return outerResolveObject;
                  } else {
                    // Track non-deduplicated packages
                    const pkgKey = `${pkgName}${hasSubpath ? '/' + subpathString : ''}`;
                    
                    let reason = '';
                    if (hasFixedVersionRequirement) {
                      reason = `Parent package requires exact version ${fixedVersionValue}`;
                    } else if (!subpathExists) {
                      reason = `Subpath '${subpathString}' not found in root package`;
                    } else {
                      reason = `Root older than nested`;
                    }
                    
                    if (!nonDedupMap.has(pkgKey)) {
                      nonDedupMap.set(pkgKey, { 
                        count: 1, 
                        rootVersion, 
                        nestedVersion,
                        reason
                      });
                    } else {
                      const details = nonDedupMap.get(pkgKey);
                      details.count += 1;
                      nonDedupMap.set(pkgKey, details);
                    }
                  }
                }
              }
            } catch (error) {
              // If there are any errors (package.json missing, semver issue, etc.), fall back to the nested version
              console.log(`Bare specifier error in esbuild_doh_plugin onResolve for '${args.path}':\n${error.message}`);
              return null;
            }
          }
        } catch (error) {
          // Module does not exist or cannot be resolved, let esbuild handle it normally
          console.log(`Bare specifier error in esbuild_doh_plugin onResolve for '${args.path}':\n${error.message}`);
        }
        
        // Module exists and seems fine for browser, let esbuild handle it normally
        return null;
      } catch (error) {
        // Module does not exist or cannot be resolved
        // console.log(`Module not found: ${args.path}, returning empty module`);
        return {
          path: args.path,
          namespace: 'empty-module'
        };
      }
    });

    if (Doh.pod.esbuild_doh_plugin.fix_files) {
      // Handle problematic file types in node_modules (like .html files)
      build.onResolve({ filter: /\.(html|node|gyp)$/, namespace: 'file' }, (args) => {
        // Check if this file is in node_modules
        if (args.path.includes('node_modules')) {
          // console.log(`Handling problematic file type: ${args.path}, returning empty module`);
          return {
            path: args.path,
            namespace: 'empty-module'
          };
        }
        return null; // Let esbuild handle files outside node_modules normally
      });
    }

    if (Doh.pod.esbuild_doh_plugin.replace_native_modules) {
      // Also intercept native module requires that might cause issues
      build.onResolve({ filter: /^worker_threads$|^node-gyp|^@mapbox\/node-pre-gyp/ }, (args) => {
        // console.log(`Replacing native module dependency: ${args.path} with empty module`);
        return {
          path: args.path,
          namespace: 'empty-module'
        };
      });
    }

    // Handle Node.js built-in modules with comprehensive exports
    if (Doh.pod.esbuild_doh_plugin.replace_native_modules) {
      build.onLoad({ filter: /.*/, namespace: 'node-builtin-module' }, (args) => {
        let moduleContents = '';
        const modulePath = args.path;
        
        // Start with default export
        moduleContents += `const defaultExport = {};\n`;
        moduleContents += `export default defaultExport;\n`;
        moduleContents += `export const __esModule = true;\n`;
        
        // Module-specific implementations
        if (modulePath === 'http') {
          // Special case for http module
          moduleContents += `
            export function createServer() { 
              return { 
                listen: () => {}, 
                on: () => {},
                close: () => {} 
              }; 
            }
            
            export class ServerResponse {
              constructor() {}
              setHeader() {}
              getHeader() {}
              writeHead() {}
              write() {}
              end() {}
            }
            
            export class IncomingMessage {
              constructor() {
                this.headers = {};
                this.url = '';
                this.method = 'GET';
              }
              on() {}
              pipe() {}
            }
            
            export const METHODS = ['GET', 'POST', 'PUT', 'DELETE'];
            export const STATUS_CODES = {200: 'OK', 404: 'Not Found'};
            export const Agent = function() { return {}; };
            export const request = function() { return {}; };
            export const get = function() { return {}; };
            
            // Also add to default export for CommonJS style imports
            defaultExport.createServer = createServer;
            defaultExport.ServerResponse = ServerResponse;
            defaultExport.IncomingMessage = IncomingMessage;
            defaultExport.METHODS = METHODS;
            defaultExport.STATUS_CODES = STATUS_CODES;
            defaultExport.Agent = Agent;
            defaultExport.request = request;
            defaultExport.get = get;
          `;
        } else if (modulePath === 'https') {
          // https module
          moduleContents += `
            export function createServer() { return { listen: () => {}, on: () => {} }; }
            export const request = function() { return {}; };
            export const get = function() { return {}; };
            export const Agent = function() { return {}; };
            
            defaultExport.createServer = createServer;
            defaultExport.request = request;
            defaultExport.get = get;
            defaultExport.Agent = Agent;
          `;
        } else if (modulePath === 'fs') {
          // fs module
          moduleContents += `
            export const readFile = function() { return null; };
            export const writeFile = function() { return null; };
            export const readdir = function() { return null; };
            export const createReadStream = function() { return { pipe: () => {}, on: () => {} }; };
            export const createWriteStream = function() { return { write: () => {}, end: () => {} }; };
            export const promises = { 
              readFile: async () => '', 
              writeFile: async () => null,
              readdir: async () => [] 
            };
            
            defaultExport.readFile = readFile;
            defaultExport.writeFile = writeFile;
            defaultExport.readdir = readdir;
            defaultExport.createReadStream = createReadStream;
            defaultExport.createWriteStream = createWriteStream;
            defaultExport.promises = promises;
          `;
        } else if (modulePath === 'path') {
          // path module
          moduleContents += `
            export const join = function() { return ''; };
            export const resolve = function() { return ''; };
            export const dirname = function() { return ''; };
            export const basename = function() { return ''; };
            export const extname = function() { return ''; };
            export const relative = function() { return ''; };
            
            defaultExport.join = join;
            defaultExport.resolve = resolve;
            defaultExport.dirname = dirname;
            defaultExport.basename = basename;
            defaultExport.extname = extname;
            defaultExport.relative = relative;
          `;
        } else {
          // Generic handling for other Node.js built-ins
          const commonExports = {
            'net': ['createConnection', 'connect', 'Socket', 'Server'],
            'tls': ['connect', 'createServer'],
            'os': ['platform', 'arch', 'cpus', 'totalmem', 'freemem'],
            'crypto': ['createHash', 'createHmac', 'randomBytes', 'publicEncrypt'],
            'stream': ['Readable', 'Writable', 'Transform', 'pipeline', 'finished'],
            'events': ['EventEmitter', 'once', 'on'],
            'child_process': ['spawn', 'exec', 'fork', 'execFile'],
            'cluster': ['fork', 'isMaster', 'isWorker'],
            'worker_threads': ['Worker', 'isMainThread', 'parentPort', 'workerData']
          };
          
          // Get specific exports for this module
          const exports = commonExports[modulePath] || [];
          
          // Add module-specific exports
          exports.forEach(exportName => {
            moduleContents += `export const ${exportName} = function() { return null; };\n`;
            moduleContents += `defaultExport.${exportName} = ${exportName};\n`;
          });
        }
        
        return {
          contents: moduleContents,
          loader: 'js'
        };
      });
    }

    // Handle empty-module namespace
    build.onLoad({ filter: /.*/, namespace: 'empty-module' }, (args) => {
      return {
        contents: `
          // Empty module for '${args.path}' (not installed or problematic file type)
          export default {};
          export const __empty_module = true;
        `,
        loader: 'js'
      };
    });

    build.onEnd(() => {
      // save the external modules to a file
      fs.writeFileSync(DohPath('/dist/esm-bundles/external-modules.json'), JSON.stringify(Array.from(externalModules), null, 2));
    });
    
  },
};

export default esbuild_doh_plugin;
