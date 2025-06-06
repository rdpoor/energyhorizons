import * as esbuild from 'esbuild';
import { nodeModulesPolyfillPlugin } from 'esbuild-plugins-node-modules-polyfill';
import esbuild_doh_plugin from './esbuild_doh_plugin.js';
import fs from 'node:fs';
import path from 'node:path';

Doh.Pod('esbuild_processor', {
  esbuild_options: {
    //entryPoints: null,
    bundle: true,
    outdir: DohPath('/dist/esm-bundles'),
    format: 'esm',
    splitting: true,
    chunkNames: 'chunks/[name]-[hash]',
    //sourcemap: true,
    minify: true,
    treeShaking: false,
    keepNames: true,
    preserveSymlinks: false,
    //target: 'es2022',
    target: 'esnext',
    platform: 'browser',
    mainFields: [
      'browser', 
      'module', 
      // 'import', 
      // 'jsnext:main',
      'main', 
    ],
    //conditions: ['browser', 'import', 'default'],
    // logLevel: 'info',
    //logLevel: 'error',
    //logLevel: 'debug',
    logLevel: 'silent',
    alias: {
      
    },
    external: [
      // almost certainly an issue
      'neo-blessed', 
      'nodemailer', 
      'express',
      'express-useragent',
      'helmet',
      'cors',
      'multer',
      'redbird',
      'geoip-lite',
      'node-ipinfo',
      'nodejs-traceroute',
      'greenlock', 
      'node-forge', 
      'ursa-optional',
      'esbuild-plugins-node-modules-polyfill',
      'sqlite3',
      'promised-sqlite3',
      'better-sqlite3',
      'socket.io',

      // likely an issue
      'compression',
    ],
    metafile: true,
    resolveExtensions: [
      '.tsx', '.ts', '.jsx', '.js', '.css', '.json',
      // '.mjs',
      // '.mts',
    ],
    loader: {
      '.ttf': 'file',
      '.woff': 'file',
      '.woff2': 'file',
    }
  },
  nodeModulesPolyfillPlugin:{
    modules: {
      crypto: 'empty',
    },
    fallback: 'empty',
  }
});
Doh.Package('esbuild_processor', {load: ['doh_js']});

async function processManifest() {
  // Read the manifest file
  const manifestPath = DohPath('/doh_js/manifests/browser_esm_manifest.json');
  const manifestContent = await fs.promises.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestContent);
  
  // Create output directory for bundles if it doesn't exist
  const outputDir = DohPath(Doh.pod?.esbuild_options?.outdir || DohPath('/dist/esm-bundles'));
  try {
    await fs.promises.mkdir(outputDir, { recursive: true });
  } catch (error) {
    console.error(`Error creating output directory: ${error.message}`);
  }
  const entryDir = path.resolve('./dist/entry');
  try {
    await fs.promises.mkdir(entryDir, { recursive: true });
  } catch (error) {
    console.error(`Error creating entry directory: ${error.message}`);
  }

  // Get all package names from the manifest
  const packageNames = Object.keys(manifest);
  
  // Create entry files for all packages
  const entryPoints = {};
  // const specialEntryPoints = {};
  const entryFiles = [];
  
  for (const packageName of packageNames) {
    //console.log(`Creating entry file for package: ${packageName}`);
    
    // Create an entry file that re-exports everything including default export
    const entryContent = `
// Re-export all named exports
export * from '${packageName}';

// Dynamic import for ${packageName}
const importedModule = await import('${packageName}');

// Handle default export properly without creating artificial defaults
let defaultExport = importedModule;
if (importedModule.default !== undefined) {
  // If there's a proper default export, re-export it as-is
    defaultExport = importedModule.default;
} else if (Object.getOwnPropertyDescriptor(importedModule, '__esModule') && 
           Object.getOwnPropertyDescriptor(importedModule, '__esModule').value === true) {
  // For transpiled modules with __esModule flag but no default
  // Just export the named exports without creating a default
}
// For CommonJS modules (or modules without __esModule flag)
// CommonJS convention is to export the module itself as default
export default defaultExport;
`;
    const entryFile = path.join(entryDir, `${packageName}-entry.js`);
    await fs.promises.mkdir(path.dirname(entryFile), { recursive: true });
    await fs.promises.writeFile(entryFile, entryContent);
    
    // Store the entry point mapping for esbuild
    entryPoints[packageName] = entryFile;
    entryFiles.push(entryFile);
  }
  
  let result;
  try {
    // Process all packages in a single build
    // console.log('Processing all packages in a single build...');
    
    let buildOptions = Doh.meld_into_objectobject(Doh.pod?.esbuild_options, {
      entryPoints: entryPoints,
      plugins: [
        esbuild_doh_plugin,
        nodeModulesPolyfillPlugin(
          Doh.pod.nodeModulesPolyfillPlugin || null
        ),
      ],
    });
    result = await esbuild.build(buildOptions);

    
    // Save the metafile for debugging
    await fs.promises.writeFile(
      path.join(outputDir, `build-meta.json`),
      JSON.stringify(result.metafile, null, 2)
    );
    
  } catch (error) {
    console.error(`Error processing packages: ${error.message}`);
  }
  
  // Clean up entry files
  for (const entryFile of entryFiles) {
    try {
      await fs.promises.unlink(entryFile);
    } catch (error) {
      console.error(`Error removing entry file ${entryFile}: ${error.message}`);
    }
  }
  
  // Generate an import map that maps bare specifiers to bundled files
  const importMap = {
    imports: {}
  };

  const externalModules = JSON.parse(fs.readFileSync(DohPath('/dist/esm-bundles/external-modules.json'), 'utf8'));
  
  for (const packageName of packageNames) {
    if(
      // did we actually build this package?
      fs.existsSync(DohPath(`/dist/esm-bundles/${packageName}.js`)) &&
      // did we NOT mark this package as external?
      !Doh.pod?.esbuild_options?.external?.includes(packageName) &&
      // did we actually include this package in the build? (by looking at the external modules file)
      !externalModules.includes(packageName)
    ) {
      importMap.imports[packageName] = `/dist/esm-bundles/${packageName}.js`;
    }
  }
  
  // Save the import map
  await fs.promises.writeFile(
    path.join(outputDir, 'import-map.json'),
    JSON.stringify(importMap, null, 2)
  );

  // now, properly update the import map from doh_js/manifests/browser_esm_manifest.json
  // to do this, we need to mix the two objects together, preferring the values from the import map
  // but keeping the keys from the manifest
  for (const packageName of packageNames) {
    if(!importMap.imports[packageName] && manifest[packageName]) {
      importMap.imports[packageName] = manifest[packageName];
    }
  }
  
  // save the import map
  await fs.promises.writeFile(
    DohPath('/doh_js/manifests/browser_esm_manifest.json'),
    JSON.stringify(importMap.imports, null, 2)
  );
  
  // console.log('ESM bundling complete! Import map generated at dist/esm-bundles/import-map.json');
}

// Run the process
await processManifest().catch(error => {
  console.error('Failed to process manifest:', error);
  process.exit(1);
});

export { processManifest };