const { parentPort } = require('worker_threads');
const fs = require('fs');
const crypto = require('crypto');

parentPort.on('message', async (files) => {
  const issues = {};
  for (const file of files) {
    const [installedHash, backupHash] = await Promise.all([
      hashFile(file.installedPath),
      hashFile(file.backupPath)
    ]);
    if (installedHash !== backupHash) {
      // build a detailed report object for each file
      issues[toForwardSlash(file.installedPath)] = {
        relativePath: toForwardSlash(file.relativePath),
        installedPath: toForwardSlash(file.installedPath),
        backupPath: toForwardSlash(file.backupPath),
        installedHash,
        backupHash,
        status: installedHash === backupHash ? 'OK' : 'Modified',
        mtime: fs.statSync(file.installedPath).mtime
      };
    }
  }
  parentPort.postMessage(issues);
});
const toForwardSlash = (str) => str.replace(/\\/g, '/');

const removeTrailingSlash = (str) => str.endsWith('/') ? str.slice(0, -1) : str;

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');  // Using MD5 for speed, though less secure
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}