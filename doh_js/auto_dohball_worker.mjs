import { parentPort } from 'worker_threads';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import tarFs from 'tar-fs';
import zlib from 'zlib';
import crypto from 'crypto';
import { incrementVersion } from './dohver.js';
import { pipeline } from 'stream/promises';
import os from 'os';
import DohPath from './dohpath.js';

parentPort.on('message', async ({ packageName, outputPath, fullPackagePath, rebake, allDohballSourcePaths, packagerFrom }) => {
  try {
    const allDohballSourcePathsSet = new Set(allDohballSourcePaths || []);
    const result = await createDohball(packageName, outputPath, fullPackagePath, rebake, allDohballSourcePathsSet, packagerFrom);
    parentPort.postMessage({ success: true, result });
  } catch (error) {
    parentPort.postMessage({ success: false, error: error.message });
  }
});

async function extractDohballFileList(dohballPath) {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dohball-extract-'));
  try {
    await pipeline(
      fs.createReadStream(dohballPath),
      zlib.createGunzip(),
      tarFs.extract(tempDir)
    );
    
    const files = [];
    await scanDirectory(tempDir, tempDir, files);
    return files;
  } finally {
    // Cleanup
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
}

async function scanDirectory(baseDir, currentDir, files) {
  const entries = await fsp.readdir(currentDir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
    
    if (entry.isDirectory()) {
      await scanDirectory(baseDir, fullPath, files);
    } else {
      files.push(relativePath);
    }
  }
}

async function createDohball(packageName, outputPath, fullPackagePath, rebake, allDohballSourcePaths, packagerFrom) {
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });

  let tempOutputPath = false;
  const excludeDirsAndFiles = ['package-lock.json'];

  if (fullPackagePath.endsWith('doh_js')) {
    excludeDirsAndFiles.push('manifests');
  }

  // Get the existing dohball file list
  let existingFiles = [];
  let removals = [];
  
  try {
    if (fs.existsSync(outputPath)) {
      existingFiles = await extractDohballFileList(outputPath);
    }
  } catch (error) {
    console.error(`Error extracting existing dohball file list: ${error.message}`);
  }

  // Get current dohball.json if it exists
  let dohballJson = { version: 0, removals: [] };
  try {
    const dohballJsonPath = path.join(fullPackagePath, 'dohball.json');
    if (fs.existsSync(dohballJsonPath)) {
      dohballJson = JSON.parse(await fsp.readFile(dohballJsonPath, 'utf8'));
      dohballJson.removals = dohballJson.removals || [];
    }
  } catch (error) {
    console.error(`Error reading existing dohball.json: ${error.message}`);
  }

  if (!rebake) {
    tempOutputPath = outputPath + '.tmp';
    const currentHash = await calculateFileHash(outputPath).catch(() => null);
    const entries = new Set();
    await new Promise((resolve, reject) => {
      const packageBaseName = path.basename(fullPackagePath);
      const currentBakingPathRelative = path.relative(packagerFrom, fullPackagePath).replace(/\\/g, '/');
      const packStream = tarFs.pack(fullPackagePath, {
        map: (header) => {
          // Strip Windows-specific permissions
          if (header.type === 'directory') {
            header.mode = 0o755;  // Standard permissions for directories
          } else {
            header.mode = 0o644;  // Standard permissions for files
          }
          // Strip other problematic attributes
          delete header.uid;
          delete header.gid;
          delete header.uname;
          delete header.gname;
          if (header.name.startsWith(packageBaseName + path.sep)) {
            header.name = header.name.slice(packageBaseName.length + 1);
          }
          return header;
        },
        ignore: (name) => {
          // Get the path relative to the project root
          const projectRelativePath = path.relative(packagerFrom, name);

          // Check if this path corresponds to another dohball source path using DohPath.Compare
          let isNestedDohball = false;
          for (const sourcePath of allDohballSourcePaths) {
            // Compare project-relative paths. DohPath.Compare handles slash/trailing slash differences.
            if (DohPath.Compare(projectRelativePath, sourcePath)) {
              // Ensure it's not the exact path we are currently baking
              if (!DohPath.Compare(projectRelativePath, currentBakingPathRelative)) {
                isNestedDohball = true;
                break;
              }
            }
          }

          if (isNestedDohball) {
            //console.log(`Ignoring nested dohball path: ${projectRelativePath} inside ${currentBakingPathRelative}`);
            return true; // Ignore this nested dohball directory
          }

          const relativePath = path.relative(fullPackagePath, name);
          if (!shouldExclude(relativePath, excludeDirsAndFiles)) {
            entries.add(relativePath.replace(/\\/g, '/'));
            return false;
          }
          return true;
        },
        dmode: 0o755,
        fmode: 0o644
      });

      const writeStream = fs.createWriteStream(tempOutputPath);
      const gzipStream = zlib.createGzip();

      packStream
        .pipe(gzipStream)
        .pipe(writeStream);

      writeStream.on('finish', () => resolve(tempOutputPath));
      writeStream.on('error', (err) => {
        reject(new Error(`Error creating tarball for ${packageName}: ${err.message}`));
      });
    });
    
    // Compare file lists to identify removals
    const newFiles = Array.from(entries); // Already has forward slashes
    
    // Files in existing but not in new are removed
    // existingFiles should already have forward slashes from extractDohballFileList
    const removedFiles = existingFiles.filter(file => !newFiles.some(newFile => newFile === file));
    
    // Add DohSlash paths of removed files to the removals list
    removedFiles.forEach(file => {
      const dohSlashPath = '^/' + file; // file should already have forward slashes
      if (!dohballJson.removals.includes(dohSlashPath)) {
        dohballJson.removals.push(dohSlashPath);
      }
    });
    
    // Remove any files from removals that have been added back
    dohballJson.removals = dohballJson.removals.filter(removedPath => {
      // Ensure removedPath (from JSON) is compared correctly
      const relativePath = (removedPath.startsWith('/') ? removedPath.slice(1) : removedPath).replace(/\\/g, '/'); 
      // newFiles already has forward slashes
      return !newFiles.some(newFile => newFile === relativePath); 
    });
    
    const newHash = await calculateFileHash(tempOutputPath);
    if (currentHash === newHash) {
      await fsp.unlink(tempOutputPath);
      return false;
    }
  }

  // Increment the version
  let old_version = dohballJson.version;
  dohballJson.version = incrementVersion(dohballJson.version);
  if (old_version === dohballJson.version) {
    throw console.error(`${packageName} version did not change from ${old_version}`);
  }

  // Write updated dohball.json to the package
  try {
    await fsp.writeFile(path.join(fullPackagePath, 'dohball.json'), JSON.stringify(dohballJson, null, 2));
  } catch (e) {
    throw console.error(`Error writing dohball.json for ${packageName}: ${e.message}`);
  }

  const entries = new Set();
  // Create the final tarball with the updated dohball.json
  await new Promise((resolve, reject) => {
    const packageBaseName = path.basename(fullPackagePath);
    const currentBakingPathRelative = path.relative(packagerFrom, fullPackagePath).replace(/\\/g, '/');
    const packStream = tarFs.pack(fullPackagePath, {
      ignore: (name) => {
        // Get the path relative to the project root
        const projectRelativePath = path.relative(packagerFrom, name);

        // Check if this path corresponds to another dohball source path using DohPath.Compare
        let isNestedDohball = false;
        for (const sourcePath of allDohballSourcePaths) {
          // Compare project-relative paths. DohPath.Compare handles slash/trailing slash differences.
          if (DohPath.Compare(projectRelativePath, sourcePath)) {
            // Ensure it's not the exact path we are currently baking
            if (!DohPath.Compare(projectRelativePath, currentBakingPathRelative)) {
              isNestedDohball = true;
              break;
            }
          }
        }

        if (isNestedDohball) {
          //console.log(`Ignoring nested dohball path: ${projectRelativePath} inside ${currentBakingPathRelative}`);
          return true; // Ignore this nested dohball directory
        }

        const relativePath = path.relative(fullPackagePath, name);
        if (!shouldExclude(relativePath, excludeDirsAndFiles)) {
          entries.add(relativePath);
          return false;
        }
        return true;
      },
      map: (header) => {
        // Strip Windows-specific permissions
        if (header.type === 'directory') {
          header.mode = 0o755;  // Standard permissions for directories
        } else {
          header.mode = 0o644;  // Standard permissions for files
        }
        // Strip other problematic attributes
        delete header.uid;
        delete header.gid;
        delete header.uname;
        delete header.gname;
        if (header.name.startsWith(packageBaseName + path.sep)) {
          header.name = header.name.slice(packageBaseName.length + 1);
        }
        return header;
      },
      dmode: 0o755,
      fmode: 0o644
    });

    const writeStream = fs.createWriteStream(outputPath);
    const gzipStream = zlib.createGzip();

    packStream
      .pipe(gzipStream)
      .pipe(writeStream);

    writeStream.on('finish', () => resolve(outputPath));
    writeStream.on('error', (err) => {
      reject(new Error(`Error creating final tarball for ${packageName}: ${err.message}`));
    });
  });

  if (tempOutputPath) await fsp.unlink(tempOutputPath);
  return outputPath;
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


function shouldExclude(filePath, excludeDirsAndFiles) {
  // Convert file path to forward slashes for consistency
  filePath = filePath.replace(/\\/g, '/');

  // Check if the file path starts with any of the exclude directories
  for (let dirOrFile of excludeDirsAndFiles) {
    dirOrFile = dirOrFile.replace(/\\/g, '/');
    if (filePath === dirOrFile || filePath.startsWith(dirOrFile + '/')) {
      return true;
    }
  }

  // Check if the current path is a .git directory
  if (filePath === '.git' ||
    filePath.includes('/.git') ||
    filePath.includes('.git/') ||
    filePath === 'node_modules' ||
    filePath.includes('/node_modules') ||
    filePath.includes('node_modules/')) {
    return true;
  }

  return false;
}