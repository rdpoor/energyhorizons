// await import('node:fs').then(mod => { fs = mod.default; fsp = fs.promises; });
export * as fs from 'node:fs';
export * as path from 'node:path';
export * as url from 'node:url';
export * as axios from 'axios';
export * as YAML from 'yaml';

// await import('node:path').then(mod => { path = mod.default; });
// await import('node:url').then(mod => { fileURLToPath = mod.fileURLToPath; pathToFileURL = mod.pathToFileURL; });
// await import('axios').then(mod => { axios = mod.default; });
// await import('yaml').then(mod => { YAML = mod.default; });