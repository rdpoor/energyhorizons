Doh.Module('nodejs_fs_dataforge', [
  'path', 
  'fs', 
  'util', 
  'dataforge_core',
], function (path, fs, util, allforge) {

  if (allforge) allforge.nodejs_compatible.push('nodejs_fs_dataforge');

  // convert fs methods which use callbacks to promises
  const exists = util.promisify(fs.exists);
  const readdir = util.promisify(fs.readdir);
  const readFile = util.promisify(fs.readFile);
  const copyFile = util.promisify(fs.copyFile);
  const mkdir = util.promisify(fs.mkdir);
  const cp = util.promisify(fs.cp);
  const writeFile = util.promisify(fs.writeFile);
  const appendFile = util.promisify(fs.appendFile);

  const makeFilePathSafe = function (filepath = "") {
    // Sanitize the filepath
    filepath = filepath.replace(/\s/g, '_').replace(/[^\w\s\-.\/\\\:]/g, '_');

    // Prepend `this.folderName` to the filepath if it is set
    //if (this.folderName) {
    //  filepath = path.join(this.folderName, filepath);
    //}
    // TODO: This is a temporary fix to make the tests pass. The above code should be fixed to work properly with dohpath
    filepath = DohPath(filepath);

    return filepath;
  }

  const fileCache = new Map();
  const fileCacheMtime = new Map();

  Pattern('HandlebarFileProtocolHandler', ['HandlebarProtocolHandler'], {
    protocol: 'file',  // handlebars will have the format {{file:path}}
    loaderType: 'file',
    handler: function (path) {
      const safePath = makeFilePathSafe(path);
      
      // Get current file mtime
      if (fs.existsSync(safePath)) {
        const stats = fs.statSync(safePath);
        const currentMtime = stats.mtime.getTime();
        
        // Check if we need to update cache
        if (!fileCache.has(safePath) || fileCacheMtime.get(safePath) < currentMtime) {
          const content = fs.readFileSync(safePath, 'utf8');
          fileCache.set(safePath, content);
          fileCacheMtime.set(safePath, currentMtime);
        }

        if (Doh.pod.hmr?.enabled && IsFunction(Doh.Globals.HMR?.addLoaderToWatch)) {
          Doh.Globals.HMR.addLoaderToWatch(DohPath.DohSlash(safePath) + ' > ' + this.loaderType);
        }
        
        return `<!-- ${DohPath.DohSlash(safePath)} START -->\n${fileCache.get(safePath)}\n<!-- ${DohPath.DohSlash(safePath)} END -->`;
      } else {
        return '';
      }
    }
  });

  // we store this, but we don't use it directly because it's statically registered on creation
  const fileProtocol = New('HandlebarFileProtocolHandler');
  const editableFileProtocol = New('HandlebarFileProtocolHandler', {
    protocol:'editableFile',
    loaderType: 'raw',
  });
  

  Pattern('nodejs_fs_dataforge', {
    // hard inherit from dataforge and async
    'dataforge_core': true,
    // inherit from the sync version so it can be optionally overridden
    'nodejs_fs_sync_dataforge': true,
    // if async_dataforge is being inherited, then we need to inherit from the async version of the fs dataforge as well
    'async_dataforge': { 'nodejs_fs_async_dataforge': true },
  }, {
    folderName: '.', // the current working directory
    makeFilePathSafe,
    operationRegistry: {
      FromStringToPathToGlobal: {
        arguments: true,
        description: 'Take the current data (must be a string), convert it to a file path safe string, and switch to or mark the branch as global with the given name.',
        method: function (globalBranchName) {
          let ops = this.ops, currentBranchName = this.currentBranch, currentData = this.branches[currentBranchName].data;
          if (typeof currentData !== 'string') {
            Doh.debug('Current data is not a string.');
          }
          let safePath = makeFilePathSafe(currentData);
          // Switch to or mark the branch as global
          ops.Global(globalBranchName);
          // Update the data of the global branch
          this.updateData(safePath);
          // Return to the branch we were on
          ops.Branch(currentBranchName);

          return null;
        }
      },
    },
  });
  Pattern('nodejs_fs_sync_dataforge', {
    // hard inherit from dataforge and async
    'dataforge_core': true,
  }, {
    operationRegistry: {
      ChangeDir: {
        arguments: true,
        description: 'Change the current working directory, creating it if it doesn\'t exist.',
        method: function (folderName) {
          if (!folderName) {
            this.folderName = '.';
            return null;
          }

          let folderPath = makeFilePathSafe(folderName);

          // Check if the directory exists and create it if it doesn't
          if (!(fs.existsSync(folderPath))) {
            fs.mkdirSync(folderPath, { recursive: true });
          }

          this.folderName = folderName;
          return null;
        }
      },
      FromFile: {
        arguments: true,
        description: 'Read the content of a file.',
        method: function (filename) {
          if (!filename) {
            if (this.branches[this.currentBranch].data) {
              filename = this.branches[this.currentBranch].data;
            } else {
              //Doh.warn('FromFile requires a filename or data in the current branch');
              return null;
            }
          }
          //console.log(`Reading file ${filename}`);
          filename = makeFilePathSafe(filename);

          try {
            return fs.readFileSync(filename, 'utf8');
          } catch (err) {
            Doh.error(`Error reading file ${filename}: ${err}`);
            return null;
          }
        }
      },
      ToFile: {
        arguments: true,
        description: 'Write data to one or more files, using the currently selected mode(replace/append/prepend).',
        method: function (...filenames) {
          for (let filename of filenames) {
            let safeFilename = makeFilePathSafe(filename);

            if (!safeFilename.startsWith('/') && this.folderName) {
              safeFilename = `${this.folderName}/${safeFilename}`;
            }

            if (safeFilename.startsWith('/')) {
              safeFilename = safeFilename.slice(1);
            }

            let currentBranch = this.branches[this.currentBranch], currentData = currentBranch.data;
            console.log('safeFilename', safeFilename)
            try {
              if (currentData) {
                if (currentBranch.tempMode === 'Replace') {
                  fs.writeFileSync(safeFilename, `${currentData}\n`);
                } else if (currentBranch.tempMode === 'Append') {
                  fs.appendFileSync(safeFilename, `${currentData}\n`);
                } else if (currentBranch.tempMode === 'Prepend') {
                  let existingContents = this.ops.FromFile(safeFilename);
                  fs.writeFileSync(safeFilename, `${currentData}\n${existingContents}`);
                }
              }
            } catch (err) {
              console.error(`Error writing to file ${safeFilename}: ${err}`);
            }
          }

          return null;
        }
      },
      CopyFile: {
        arguments: true,
        description: 'Copy a file to a destination.',
        method: function (source, destination) {
          try {
            source = makeFilePathSafe(source);
            destination = makeFilePathSafe(destination);
            fs.copyFileSync(source, destination);
            console.log(`File copied from ${source} to ${destination}`);
          } catch (err) {
            console.error(`Error copying ${source} to ${destination}: ${err}`);
          }
        }
      },
      CopyFolder: {
        arguments: true,
        description: 'Recursively copy a source directory to a destination.',
        method: async function (source, destination) {
          try {
            source = makeFilePathSafe(source);
            destination = makeFilePathSafe(destination);
            fs.mkdirSync(destination, { recursive: true });
            fs.cpSync(source, destination, { recursive: true });
            console.log(`Directory ${source} copied to ${destination}`);
          } catch (err) {
            console.error(`Error copying ${source} to ${destination}: ${err}`);
          }
        }
      },
      FromFolder: {
        arguments: true,
        description: 'Read the contents of a folder.',
        method: function (folderName) {
          folderName = makeFilePathSafe(folderName);

          let FromFile = this.ops.FromFile, contents = {};

          for (let file of readdirSync(folderName)) {
            if (!file.startsWith('.')) {
              // make the contents respect the currentBranch.mode
              let currentBranch = this.branches[this.currentBranch], currentData = currentBranch.data;
              if (currentData) {
                if (currentBranch.tempMode === 'Replace') {
                  contents = FromFile(`${folderName}/${file}`);
                } else if (currentBranch.tempMode === 'Append') {
                  contents = `${currentData}\n${FromFile(`${folderName}/${file}`)}`;
                } else if (currentBranch.tempMode === 'Prepend') {
                  contents = `${FromFile(`${folderName}/${file}`)}\n${currentData}`;
                }
              }
            }
          }

          return contents;
        }
      },
      FromFolderToList: {
        arguments: true,
        description: 'Read the contents of a folder into an object keyed by filename.',
        method: function (folderName) {
          folderName = makeFilePathSafe(folderName);

          let FromFile = this.ops.FromFile, contents = {};

          for (let file of fs.readdirSync(folderName)) {
            if (!file.startsWith('.')) {
              contents[file] = FromFile(`${folderName}/${file}`);
            }
          }

          return contents;
        }
      },
      FromListToFolder: {
        arguments: true,
        description: 'Write data from a list object keyed by filename to one or more files, using the currently selected mode(replace/append/prepend).',
        method: function (folderName) {
          folderName = makeFilePathSafe(folderName);
          let data = this.branches[this.currentBranch].data;

          if (!folderName.startsWith('/') && this.folderName) {
            folderName = `${this.folderName}/${folderName}`;
          }

          if (folderName.startsWith('/')) {
            folderName = folderName.slice(1);
          }

          if (NotObjectObject(data)) {
            Doh.debug('FromObjectToFolder requires an object of data, keyed by filename, found:', data);
            return data;
          }

          try {
            fs.mkdirSync(folderName, { recursive: true });
            for (let filename in data) {
              let safeFilename = makeFilePathSafe(filename);
              fs.writeFileSync(`${folderName}/${safeFilename}`, `${data[filename]}\n`);
            }
          } catch (err) {
            console.error(`Error writing to folder ${folderName}: ${err}`);
          }

          return null;
        }
      },
    },
    pre_object_phase: function () {
      this.operationRegistry.ImportFromFile = this.operationRegistry.FromFile;
      this.operationRegistry.ExportToFile = this.operationRegistry.ToFile;
    }
  });
  Pattern('nodejs_fs_async_dataforge', {
    // hard inherit from dataforge and async
    'dataforge_core': true,
    'async_dataforge': true,
  }, {
    operationRegistry: {
      ChangeDir: {
        method: async function (folderName) {
          if (!folderName) {
            this.folderName = '.';
            return null;
          }

          let folderPath = makeFilePathSafe(folderName);

          // Check if the directory exists and create it if it doesn't
          if (!(await exists(folderPath))) {
            await mkdir(folderPath, { recursive: true });
          }

          this.folderName = folderName;
          return null;
        }
      },
      FromFile: {
        method: async function (filename) {
          if (!filename) {
            if (this.branches[this.currentBranch].data) {
              filename = this.branches[this.currentBranch].data;
            } else {
              //Doh.warn('FromFile requires a filename or data in the current branch');
              return null;
            }
          }
          //console.log(`Reading file ${filename}`);
          filename = makeFilePathSafe(filename);

          try {
            return await readFile(filename, 'utf8');
          } catch (err) {
            Doh.error(`Error reading file ${filename}: ${err}`);
            return null;
          }
        }
      },
      ToFile: {
        method: async function (...filenames) {
          for (let filename of filenames) {
            let safeFilename = makeFilePathSafe(filename);

            if (!safeFilename.startsWith('/') && this.folderName) {
              safeFilename = `${this.folderName}/${safeFilename}`;
            }

            if (safeFilename.startsWith('/')) {
              safeFilename = safeFilename.slice(1);
            }

            let currentBranch = this.branches[this.currentBranch], currentData = currentBranch.data;
            console.log('safeFilename', safeFilename)
            try {
              if (currentData) {
                if (currentBranch.tempMode === 'Replace') {
                  await writeFile(safeFilename, `${currentData}\n`);
                } else if (currentBranch.tempMode === 'Append') {
                  await appendFile(safeFilename, `${currentData}\n`);
                } else if (currentBranch.tempMode === 'Prepend') {
                  let existingContents = await this.ops.FromFile(safeFilename);
                  await writeFile(safeFilename, `${currentData}\n${existingContents}`);
                }
              }
            } catch (err) {
              console.error(`Error writing to file ${safeFilename}: ${err}`);
            }
          }

          return null;
        }
      },
      CopyFile: {
        method: async function (source, destination) {
          try {
            source = makeFilePathSafe(source);
            destination = makeFilePathSafe(destination);
            await copyFile(source, destination);
            console.log(`File copied from ${source} to ${destination}`);
          } catch (err) {
            console.error(`Error copying ${source} to ${destination}: ${err}`);
          }
        }
      },
      CopyFolder: {
        method: async function (source, destination) {
          try {
            source = makeFilePathSafe(source);
            destination = makeFilePathSafe(destination);
            await mkdir(destination, { recursive: true });
            await cp(source, destination, { recursive: true });
            console.log(`Directory ${source} copied to ${destination}`);
          } catch (err) {
            console.error(`Error copying ${source} to ${destination}: ${err}`);
          }
        }
      },
      FromFolder: {
        method: async function (folderName) {
          folderName = makeFilePathSafe(folderName);

          let FFMethod = this.ops.FromFile, contents = {};

          for (let file of await readdir(folderName)) {
            if (!file.startsWith('.')) {
              // make the contents respect the currentBranch.mode
              let currentBranch = this.branches[this.currentBranch], currentData = currentBranch.data;
              if (currentData) {
                if (currentBranch.tempMode === 'Replace') {
                  contents = await FFMethod(`${folderName}/${file}`);
                } else if (currentBranch.tempMode === 'Append') {
                  contents = `${currentData}\n${await FFMethod(`${folderName}/${file}`)}`;
                } else if (currentBranch.tempMode === 'Prepend') {
                  contents = `${await FFMethod(`${folderName}/${file}`)}\n${currentData}`;
                }
              }
            }
          }

          return contents;
        }
      },
      FromFolderToList: {
        method: async function (folderName) {
          folderName = makeFilePathSafe(folderName);

          let FFMethod = this.ops.FromFile, contents = {};

          for (let file of await readdir(folderName)) {
            if (!file.startsWith('.')) {
              contents[file] = await FFMethod(`${folderName}/${file}`);
            }
          }

          return contents;
        }
      },
      FromListToFolder: {
        method: async function (folderName) {
          folderName = makeFilePathSafe(folderName);
          let data = this.branches[this.currentBranch].data;

          if (!folderName.startsWith('/') && this.folderName) {
            folderName = `${this.folderName}/${folderName}`;
          }

          if (folderName.startsWith('/')) {
            folderName = folderName.slice(1);
          }

          if (NotObjectObject(data)) {
            Doh.debug('FromObjectToFolder requires an object of data, keyed by filename, found:', data);
            return data;
          }

          try {
            await mkdir(folderName, { recursive: true });
            for (let filename in data) {
              let safeFilename = makeFilePathSafe(filename);
              await writeFile(`${folderName}/${safeFilename}`, `${data[filename]}\n`);
            }
          } catch (err) {
            console.error(`Error writing to folder ${folderName}: ${err}`);
          }

          return null;
        }
      },
    },
  });
});
Doh.Module('__secret_browser_fs_dataforge', [
  'dataforge_core',
], function (allforge) {
  if (allforge) allforge.browser_compatible.push('__secret_browser_fs_dataforge');
  Pattern('__secret_browser_fs_dataforge', {
    'dataforge_core': true,
  }, {
    
  });
  // the main thing we want is to be included in the dataforge engine and run our custom protocol handler
  
  const makeFilePathSafe = function (filepath = "") {
    // Sanitize the filepath
    filepath = filepath.replace(/\s/g, '_').replace(/[^\w\s\-.\/\\\:]/g, '_');

    // Prepend `this.folderName` to the filepath if it is set
    //if (this.folderName) {
    //  filepath = path.join(this.folderName, filepath);
    //}
    // TODO: This is a temporary fix to make the tests pass. The above code should be fixed to work properly with dohpath
    filepath = DohPath(filepath);

    return filepath;
  }

  Pattern('HandlebarFileProtocolHandler', ['HandlebarProtocolHandler'], {
    moc: {
      handler: 'method',
    },
    protocol: 'file',  // handlebars will have the format {{file:path}}
    loaderType: 'file',
    handler: function(hb, loadStatement) {
      let value = makeFilePathSafe(hb);
      Doh.live_load(DohPath.DohSlash(value) + ' > ' + this.loaderType, function(newHtmlString) {
        // all we need to do here is tell the outer file to reload
        Doh.reload(loadStatement);
      });
    }
  });

  // we store this, but we don't use it directly because it's statically registered on creation
  const fileProtocol = New('HandlebarFileProtocolHandler');
  const editableFileProtocol = New('HandlebarFileProtocolHandler', {
    protocol:'editableFile',
    loaderType: 'raw',
  });
});