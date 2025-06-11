// First define the necessary package dependencies
Doh.Package('alasql', {
  install: 'npm:alasql',
  load: [
    'browser?? /node_modules/alasql/dist/alasql.min.js',
    'nodejs?? alasql from "alasql"'
  ]
});

Doh.Package('better-sqlite3', {
  install: 'npm:better-sqlite3',
  load: [
    'nodejs&&!bun?? Database from "better-sqlite3"',
    'bun?? Database from "bun:sqlite"'
  ]
});

Doh.Pod('db_dataforge', {
  express_config: {
    ignore_paths: ['/dbs']
  }
});

Doh.Module('db_dataforge', [
    // 'browser?? alasql', 
    'nodejs?? better-sqlite3', 
    'dataforge_core',
    'nodejs?? fs',
    'nodejs?? path'
  ], function (alasql, Database, allforge, fs, path) {
  if (allforge) {
    allforge.nodejs_compatible.push('db_dataforge');
    //allforge.browser_compatible.push('db_dataforge');
  }

  const opreg = {
    IndexJSONPropertyInDB: {
      method: function (table, property_name) {
        let db = this.selectedDB;
        if (db) {
          try {
            // if the table is a `database.table` then we need to index the property of the table
            if (table.includes('.')) {
              table = table.split('.')[1];
            }
            if (IsNode()) {
              db.prepare(`CREATE INDEX IF NOT EXISTS idx_${table}_${property_name} ON ${table} (json_extract(data, '$.${property_name}'))`).run();
            } else {
              alasql(`CREATE INDEX IF NOT EXISTS idx_${table}_${property_name} ON ${db}.${table} (${property_name})`);
            }
          } catch (err) {
            throw console.error(`IndexJSONPropertyInDB tried to index: ${property_name} in table: ${table} but failed with: ${err.message}`);
          }
        }
      }
    },
    // unlike the JSON version, this one is just a normal index on a column
    IndexPropertyInDB: {
      method: function (table, property_name) {
        let db = this.selectedDB;
        if (db) {
          try {
            // if the table is a `database.table` then we need to index the property of the table
            if (table.includes('.')) {
              table = table.split('.')[1];
            }
            if (IsNode()) {
              db.prepare(`CREATE INDEX IF NOT EXISTS idx_${table}_${property_name} ON ${table} (${property_name})`).run();
            } else {
              alasql(`CREATE INDEX IF NOT EXISTS idx_${table}_${property_name} ON ${db}.${table} (${property_name})`);
            }
          } catch (err) {
            throw console.error(`IndexPropertyInDB tried to index: ${property_name} in table: ${table} but failed with: ${err.message}`);
          }
        }
      }
    },
    SelectDB: {
      method: function (db_name) {
        let selectedDBName,
          currentBranch = this.branches[this.currentBranch];

        if (IsStringAndHasValue(db_name)) {
          selectedDBName = db_name;
        } else {
          selectedDBName = currentBranch.data;
        }

        if (!this.selectedDBName || this.selectedDBName !== selectedDBName) {
          if (this.selectedDB) {
            this.ops.CloseDB();
          }

          this.selectedDBName = selectedDBName;
          try {
            if (IsNode()) {
              // If selectedDBName contains a dot, assume it's a full path, otherwise use default /dbs location
              this.selectedDBFilepath = selectedDBName.includes('.') ? 
                DohPath(selectedDBName) : 
                DohPath(`/dbs/${selectedDBName}.sqlite`);
              
              // Ensure the directory exists
              const dirPath = path.dirname(this.selectedDBFilepath);
              fs.mkdirSync(dirPath, { recursive: true });
              this.selectedDB = new Database(this.selectedDBFilepath);
              if(this.selectedDB.pragma) {
                this.selectedDB.pragma('journal_mode = WAL');
              } else {
                // this is for bun:sqlite
                this.selectedDB.exec("PRAGMA journal_mode = WAL;");
              }
              // we need to attach the database to itself at the selectedDBName so that queries can be prefixed with the selectedDBName
              this.selectedDB.prepare(`ATTACH DATABASE '${this.selectedDBFilepath}' AS ${selectedDBName}`).run();
            } else {
              // Use alasql's built-in localStorage support
              alasql(`CREATE localStorage DATABASE IF NOT EXISTS alasql_${selectedDBName}`);
              try {
                alasql(`ATTACH localStorage DATABASE alasql_${selectedDBName} AS ${selectedDBName}`);
              } catch (err) {
                if (err.message.endsWith('because it already exists')) {
                  //console.log(`Non-fatal:SelectDB tried to attach: ${selectedDBName} but failed with: ${err.message}`);
                } else {
                  throw err;
                }
              }
              alasql(`USE ${selectedDBName}`);
              this.selectedDB = selectedDBName;
            }
          } catch (err) {
            console.warn(`SelectDB tried to select: ${selectedDBName} but failed with: ${err.message}`, err);
          }
        }
      }
    },
    CloseDB: {
      method: function () {
        let result = true;
        try {
          if (IsNode() && this.selectedDB) {
            result = this.selectedDB.close();
          } else if (this.selectedDB) {
            result = alasql(`DETACH DATABASE ${this.selectedDB}`);
          }
          this.selectedDB = null;
          this.selectedDBName = null;
        } catch (err) {
          throw console.error(`CloseDB tried to close the database but failed with: ${err.message}`);
        }
        return result;
      }
    },
    CreateTableInDB: {
      method: function (table, schema) {
        let db = this.selectedDB;
        if (!db) return;

        // try {
        // Handle schema object for custom columns
        if (IsObjectObject(schema)) {
          let columns = Object.entries(schema)
            .map(([column, type]) => `${column} ${type}`)
            .join(', ');

          // if (IsNode()) {
          //   db.prepare(`CREATE TABLE IF NOT EXISTS ${table} (${columns})`).run();
          // } else {
          //   alasql(`CREATE TABLE IF NOT EXISTS ${db}.${table} (${columns})`);
          // }
          return this.ops.RunInDB(`CREATE TABLE IF NOT EXISTS ${table} (${columns})`);
        } else {
          // Default to id/data columns for idea storage
          // if (IsNode()) {
          //   db.prepare(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data TEXT)`).run();
          // } else {
          //   alasql(`CREATE TABLE IF NOT EXISTS ${db}.${table} (id TEXT PRIMARY KEY, data TEXT)`);
          // }
          return this.ops.RunInDB(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data TEXT)`);
        }
        // } catch (err) {
        //   console.error('CreateTableInDB error:', err.message);
        // }
      }
    },
    QueryDB: {
      method: function (query, params = []) {
        let db = this.selectedDB;
        if (!db) return null;

        try {
          if (IsNode()) {
            const stmt = db.prepare(query);
            const result = Array.isArray(params) ? stmt.all(...params) : stmt.all(params);
            //this.ops.CloseDB();
            return result;
          } else {
            return alasql(query, params);
          }
        } catch (err) {
          throw console.error(`QueryDB tried to query: ${query} but failed with: ${err.message}`);
        }
      }
    },
    RunInDB: {
      method: function (query, params = []) {
        let db = this.selectedDB;
        if (!db) return null;

        try {
          if (IsNode()) {
            const stmt = db.prepare(query);
            return Array.isArray(params) ? stmt.run(...params) : stmt.run(params);
            //this.ops.CloseDB();
            //return true;
          } else {
            return alasql(query, params);
          }
        } catch (err) {
          throw console.error(`RunInDB tried to run: ${query} but failed with: ${err.message}`);
        }
      }
    },
    StartTransactionInDB: {
      method: function () {
        let db = this.selectedDB;
        if (!db) return;

        // try {
        // if (IsNode()) {
        //   return db.prepare('BEGIN TRANSACTION').run();
        // } else {
        //   return alasql('BEGIN TRANSACTION');
        // }
        return this.ops.RunInDB('BEGIN TRANSACTION');
        // } catch (err) {
        //   console.error('StartTransactionInDB error:', err.message);
        // }
      }
    },
    EndTransactionInDB: {
      method: function (commit = true) {
        let db = this.selectedDB;
        if (!db) return;

        // try {
        // if (IsNode()) {
        //   return db.prepare(commit ? 'COMMIT' : 'ROLLBACK').run();
        // } else {
        // return alasql(commit ? 'COMMIT' : 'ROLLBACK');
        // }
        return this.ops.RunInDB(commit ? 'COMMIT' : 'ROLLBACK');
        // } catch (err) {
        //   console.error('EndTransactionInDB error:', err.message);
        // }
      }
    },
    TruncateTableInDB: {
      method: function (table) {
        let db = this.selectedDB;
        if (!db) return;

        // try {
        // if (IsNode()) {
        //   return db.prepare(`DELETE FROM ${table}`).run();
        // } else {
        // return alasql(`DELETE FROM ${selectedDBName}.${table}`);
        // }
        return this.ops.RunInDB(`DELETE FROM ${table}`);
        // } catch (err) {
        //   console.error('TruncateTableInDB error:', err.message);
        // }
      }
    },
    SelectAllFromDB: {
      method: function (table) {
        let db = this.selectedDB;
        if (!db) return;
        return this.ops.QueryDB(`SELECT * FROM ${table}`);
      }
    },
    ReplaceIntoDB: {
      method: function (table, data) {
        let db = this.selectedDB;
        if (!db) return;
        let result = false;
        // try {
          if (IsNode()) {
            // SQLite approach using JSON
            result = db.prepare(`INSERT OR REPLACE INTO ${table} (id, data) VALUES(?, ?)`).run(data.id, JSON.stringify(data));
            db.prepare(`UPDATE ${table} SET data = json_patch(data, ?) WHERE id = ?`).run(JSON.stringify(data), data.id);
            //this.ops.CloseDB();
          } else {
            // // First try to update, if it exists
            // const updated = alasql(`USE ${this.selectedDB} UPDATE ${table} SET data = ? WHERE id = ?`, [JSON.stringify(data), data.id]);

            // // If no rows were updated (update.length === 0), then insert
            // if (!updated.length) {
            //   result = alasql(`INSERT INTO ${table} (id, data) VALUES(?, ?)`, [data.id, JSON.stringify(data)]);
            // } else {
            //   result = updated;
            // }
            result = alasql(`SELECT * INTO ${table} FROM ?`, [[data]]);
          }
        // } catch (err) {
        //   throw console.error(`ReplaceIntoDB tried to replace:`, data, `into table: ${table} but failed with: ${err.message}`);
        // }
        return result;
      }
    },
    SelectIdeaFromDB: {
      method: function (table, id) {
        // if (IsNode()) {
        //   return this.ops.QueryDB(`SELECT data FROM ${table} WHERE id = ?`, [id]);
        // } else {
        //   return this.ops.QueryDB(`SELECT data FROM ${this.selectedDBName}.${table} WHERE id = ?`, [id]);
        // }
        return this.ops.QueryDB(`SELECT data FROM ${table} WHERE id = ?`, [id]);
      }
    },
    SelectAllIdeasFromDB: {
      method: function (table) {
        // if (IsNode()) {
        //   return this.ops.QueryDB(`SELECT * FROM ${table}`);
        // } else {
        //   return this.ops.QueryDB(`SELECT * FROM ${this.selectedDBName}.${table}`);
        // }
        return this.ops.QueryDB(`SELECT * FROM ${table}`);
      }
    },
    DeleteIdeaFromDB: {
      method: function (table, id) {
        // if (IsNode()) {
        //   return this.ops.QueryDB(`DELETE FROM ${table} WHERE id = ?`, [id]);
        // } else {
        //   return this.ops.QueryDB(`DELETE FROM ${this.selectedDBName}.${table} WHERE id = ?`, [id]);
        // }
        return this.ops.RunInDB(`DELETE FROM ${table} WHERE id = ?`, [id]);
      }
    },
    SearchInDB: {
      method: function (table, query_string, property_name) {
        let db = this.selectedDB;
        if (!db) return [];

        // try {
        if (IsNode()) {
          return this.ops.QueryDB(
            `SELECT data FROM ${table} WHERE json_extract(data, '$.${property_name}') LIKE ?`,
            [`%${query_string}%`]
          );
        } else {
          return this.ops.QueryDB(
            `SELECT * FROM ${table} WHERE ${property_name} LIKE ?`,
            [`%${query_string}%`]
          );
        }
        // } catch (err) {
        //   throw console.error(`SearchInDB tried to search: ${query_string} in table: ${table} but failed with: ${err.message}`);
        // }
      }
    },
    SelectIdeaPropertyFromDB: {
      method: function (table, id, property_name) {
        if (IsNode()) {
          return this.ops.QueryDB(
            `SELECT json_extract(data, '$.${property_name}') AS ${property_name} FROM ${table} WHERE id = ?`,
            [id]
          );
        } else {
          return this.ops.QueryDB(
            `SELECT ${property_name} FROM ${table} WHERE id = ?`,
            [id]
          );
        }
      }
    },
    SelectIdeaByPropertyFromDB: {
      method: function (table, property, value) {
        if (IsNode()) {
          return this.ops.QueryDB(
            `SELECT * FROM ${table} WHERE json_extract(data, '$.${property}') = ?`,
            [value]
          );
        } else {
          return this.ops.QueryDB(
            `SELECT * FROM ${table} WHERE ${property} = ?`,
            [value]
          );
        }
      }
    }
  };

  // Define the pattern
  Pattern('db_dataforge', {
    'dataforge_core': true,
  }, {
    selectedDB: null,
    operationRegistry: opreg
  });
});