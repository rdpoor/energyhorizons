import fs from 'fs';
import path from 'path';
import { promises as fsp } from 'fs';

export async function repairDohEnvironment() {
  try {
    await ensurePackageJson();
    await ensureCriticalFiles();
    return true;
  } catch (error) {
    console.error(`Error repairing Doh environment: ${error.message}`);
    return false;
  }
}

async function ensurePackageJson() {
  const packageJsonPath = DohPath('/package.json');
  let packageJson = {};
  let needsUpdate = false;
  
  try {
    if (fs.existsSync(packageJsonPath)) {
      packageJson = JSON.parse(await fsp.readFile(packageJsonPath, 'utf8'));
    } else {
      // Create a basic package.json if it doesn't exist
      packageJson = { 
        "name": "doh-project",
        "version": "1.0.0",
        "type": "module"
      };
      needsUpdate = true;
    }

    // Ensure type is "module"
    if (!packageJson.type || packageJson.type !== 'module') {
      packageJson.type = 'module';
      needsUpdate = true;
    }

    // Remove doh_js file dependency if it exists
    if (packageJson.dependencies && packageJson.dependencies["doh_js"]) {
      delete packageJson.dependencies["doh_js"];
      needsUpdate = true;
    }

    // Ensure critical dependencies exist
    const requiredDeps = {
      "@clack/prompts": "^0.10.0",
      "acorn": "^8.8.2",
      "acorn-walk": "^8.2.0",
      "axios": "^1.4.0",
      "esbuild": "^0.19.4",
      "esbuild-plugins-node-modules-polyfill": "^1.6.1",
      "neo-blessed": "^0.2.0",
      "semver": "^7.5.4",
      "tar-fs": "^3.0.4",
      "uuid": "^9.0.1",
      "yaml": "^2.3.2"
    };

    if (!packageJson.dependencies) {
      packageJson.dependencies = {};
    }

    // Check for missing dependencies
    for (const [dep, version] of Object.entries(requiredDeps)) {
      if (!packageJson.dependencies[dep]) {
        packageJson.dependencies[dep] = version;
        needsUpdate = true;
      }
    }

    // Write package.json if changes were made
    if (needsUpdate) {
      await ensureDir(path.dirname(packageJsonPath));
      await fsp.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }
  } catch (error) {
    console.error(`Error ensuring package.json: ${error.message}`);
    throw error;
  }
}

async function ensureCriticalFiles() {
  const criticalFiles = {
    '.gitignore': `.DS_Store
.vscode/
node_modules/
dist/
.doh/
dbs/
doh_install.log
package-lock.json
bun.lockb
bun.lock
pod.yaml
`,
    'boot.pod.yaml': `pod_version: 0.0.1

# This pod is used to contain settings needed to bootup the system, regardless of host environment.
# It is NOT in .gitignore, but it IS in Doh.pod.express_config.ignore_paths.
#  This means that it will be committed to the repository, but not exposed to the web.

#host_load:
#  - myModule
`,
    'pod.yaml': `pod_version: 0.0.1

# This pod is used to contain settings needed to bootup a specific instance of the system.
# It IS in .gitignore, AND it IS in Doh.pod.express_config.ignore_paths.
#  This means that it will NOT be committed to the repository, AND will not be exposed to the web.

`,
    'doh.js': `if (globalThis.window === undefined) {
  await import("./doh_js/index.js");
} else {
  await import("./doh_js/deploy.js");
}

const Doh = globalThis.Doh;
export { Doh };
export { Doh as default };
`,
    '.vscode/launch.json': `{
  "version": "0.2.0",
  "configurations":
  [
    {
      "type": "bun",
      "runtime": "doh",
      "name": "DohRuntime",
      "request": "launch",
      "program": "run",
      // "args": ["no-pack"],
      "cwd": "\${workspaceFolder}",
      "stopOnEntry": false,
      "watchMode": false,
      "internalConsoleOptions": "openOnSessionStart"
    },
    {
      "type": "bun",
      "runtime": "doh",
      "name": "Export: HTML",
      "request": "launch",
      "program": "export",
      "args": ["your-entry-module"],
      "cwd": "\${workspaceFolder}",
      "stopOnEntry": false,
      "watchMode": false,
      "internalConsoleOptions": "openOnSessionStart"
    },
    {
      "type": "bun",
      "name": "Bun Doh",
      "request": "launch",
      "program": "doh.js",
      "args": ["run"],
      "cwd": "\${workspaceFolder}",
      "stopOnEntry": false,
      "watchMode": false,
      "internalConsoleOptions": "openOnSessionStart"
    },
    {
      "type": "node-terminal",
      "name": "Node Doh",
      "request": "launch",
      "command": "node doh run",
      "cwd": "\${workspaceFolder}"
    }
  ]
}
`
  };

  // Only create files if they don't exist
  for (const [filename, content] of Object.entries(criticalFiles)) {
    const filePath = DohPath(`/${filename}`);
    if (!fs.existsSync(filePath)) {
      try {
        await ensureDir(path.dirname(filePath));
        await fsp.writeFile(filePath, content);
      } catch (error) {
        console.warn(`Warning: Could not create ${filename}: ${error.message}`);
      }
    }
  }

  // Ensure manifests directory and files exist
  const manifestsDir = DohPath('/doh_js/manifests');
  await ensureDir(manifestsDir);

  const manifestFiles = {
    'package_manifest.json': '{}',
    'core_patterns_manifest.json': '[]',
    'patterns_manifest.json': '{}'
  };

  for (const [filename, content] of Object.entries(manifestFiles)) {
    const filePath = path.join(manifestsDir, filename);
    if (!fs.existsSync(filePath)) {
      try {
        await fsp.writeFile(filePath, content);
      } catch (error) {
        console.warn(`Warning: Could not create manifest file ${filename}: ${error.message}`);
      }
    }
  }
}

async function ensureDir(dirPath) {
  try {
    await fsp.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

const DohPath = globalThis.DohPath || await import('./dohpath.js').then(m => m.default);

// handle being called directly from the command line
if (import.meta.url === `file://${process.argv[1]}`) {
  repairDohEnvironment().then(() => {
    console.log('Doh environment repaired successfully');
  }).catch(error => {
    console.error(`Error repairing Doh environment: ${error.message}`);
  });
}

// Export the main function for use in deploy.js
export default repairDohEnvironment; 