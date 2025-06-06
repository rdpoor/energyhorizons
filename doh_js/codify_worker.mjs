// codify_worker.mjs

import { parentPort } from 'worker_threads';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import tarFs from 'tar-fs';
import zlib from 'zlib';
import { incrementVersion } from './dohver.js';

parentPort.on('message', async ({ outputPath, fullProjectPath, excludeDirsAndFiles, currentVersion }) => {
  try {
    const result = await createCodex(outputPath, fullProjectPath, excludeDirsAndFiles, currentVersion);
    parentPort.postMessage({ success: true, result });
  } catch (error) {
    parentPort.postMessage({ success: false, error: error.message });
  }
});

async function createCodex(outputPath, fullProjectPath, excludeDirsAndFiles, currentVersion) {
  const newVersion = incrementVersion(currentVersion);
  const codexFileName = `${newVersion}.tar.gz`;
  const codexPath = path.join(outputPath, codexFileName);

  const entries = new Set();

  await new Promise((resolve, reject) => {
    const packStream = tarFs.pack(fullProjectPath, {
      ignore: (name) => {
        const relativePath = path.relative(fullProjectPath, name);
        if (!shouldExclude(relativePath, excludeDirsAndFiles)) {
          entries.add(relativePath);
          return false;
        }
        return true;
      },
      dereference: true,
      map: (header) => {
        if (header.type === 'directory') {
          header.mode = 0o755;  // Standard permissions for directories
          const dirPath = header.name.replace(/\/$/, '');
          if (!Array.from(entries).some(entry => entry.startsWith(dirPath) || entry === dirPath)) {
            return false; // Exclude empty directories
          }
        } else {
          header.mode = 0o644;  // Standard permissions for files
        }
        // Strip other problematic attributes
        delete header.uid;
        delete header.gid;
        delete header.uname;
        delete header.gname;
        return header;
      },
      dmode: 0o755,
      fmode: 0o644
    });

    const writeStream = fs.createWriteStream(codexPath);
    const gzipStream = zlib.createGzip();

    packStream
      .pipe(gzipStream)
      .pipe(writeStream);

    writeStream.on('finish', () => resolve(codexPath));
    writeStream.on('error', (err) => {
      reject(new Error(`Error creating codex: ${err.message}`));
    });
  });

  return { version: newVersion, path: codexPath };
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
  if (filePath.endsWith('/.git') || filePath.includes('/.git/') || filePath.includes('/node_modules') || filePath.includes('/node_modules/')) {
    return true;
  }

  return false;
}