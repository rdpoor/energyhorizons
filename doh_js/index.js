import fs from "fs/promises";

// Ensure DohPath is available
if (!globalThis.DohPath) {
  await import("./deploy.js").then(module => module).catch(error => {
    console.error(`Error loading deploy.js in /doh_js/index.js`, error);
    throw error;
  });
}

const { colorize, header_color, info_color, text_color, number_color, error_color, warn_color, hidden_color } = Doh.colorizer();

class DohCLI {
  constructor() {
    this.commands = {};
    this.coreComamander = null;
  }

  async loadCommands() {
    // Load additional commands from manifest if it exists
    const manifestPath = DohPath('/.doh/manifests/cli_manifest.json');
    try {
      await fs.access(manifestPath);
      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      const additionalCommands = JSON.parse(manifestContent);
      additionalCommands.esbuild = {
        "esbuild": {
          "file": "/doh_js/esbuild_processor.js",
          "help": "build npm bundles"
        }
      }
      // additional commands are grouped by package_name
      // like: {"users": {"poduser": {"file": "^/manage_pod_users.js","help": "[/path/to/pod.yaml](optional) Manage users stored in pod.yaml files"}}}
      for (const [package_name, package_commands] of Object.entries(additionalCommands)) {
        Doh.CLI(package_name, package_commands);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error loading CLI manifest:', error);
      }
    }

    // since core commands can't be overridden, load them last
    // Load core commands from dohtools.js
    this.coreComamander = await import('./dohtools.js').then(module => module.runCoreCommand).catch(error => {
      console.error(`Failed to load core commands from dohtools.js:\n`, error);
      throw error;
    });
  }

  exitCleanly() {
    process.exit(0);
  }

  async runCommand(command, ...args) {
    if (!(command in this.commands)) {
      console.error(`Unknown command: '${command}'. Use "help" to see available commands.`);
      this.exitCleanly();
      return;
    }

    const commandInfo = this.commands[command];
    const scriptPath = typeof commandInfo === 'string' ? commandInfo : commandInfo.file;

    if (scriptPath !== '/doh_js/dohtools.js') {
      await import(DohPath.Dot('^/../' + scriptPath)).catch(error => {
        console.error(`Error executing command '${command}':`);
        throw error;
      });

    } else {
      await this.coreComamander(command, ...args);
    }
    // if (command !== 'dash' && command !== 'run') {
    //   this.exitCleanly();
    // }
  }

  showHelp() {
    if(Doh.logger.intercepted) {
      Doh.logger.restoreConsole();
    }
    // detect running from the doh runtime and add the doh runtime commands
    if (IsDohRuntime()) {
      console.log('DohRuntime CLI Help:');
      console.log('  doh'.padEnd(27) + 'Show the DohRuntime Main Menu');
      console.log(colorize(`  doh`, hidden_color) + ` install doh`.padEnd(22) + 'Install/upgrade Doh globally');
      console.log(colorize(`  doh`, hidden_color) + ` install bun`.padEnd(22) + 'Install/upgrade Bun globally');
      console.log(colorize(`  doh`, hidden_color) + ` install node`.padEnd(22) + 'Install/upgrade Node globally');
      console.log(' ');
      console.log(colorize(`  doh`, hidden_color) + ` init`.padEnd(22) + 'Show Initialization Menu');
      console.log(colorize(`  doh`, hidden_color) + ` init doh`.padEnd(22) + 'Initialize a Doh project in the current directory (safe to run multiple times)');
      console.log(colorize(`  doh`, hidden_color) + ` init module`.padEnd(22) + 'Initialize a Doh module (Create a folder and put a yourmodule.doh.js file in it)');
      console.log(colorize(`  doh`, hidden_color) + ` init wizard`.padEnd(22) + 'Initialize a Doh module like above but with a wizard to select included starter templates');
      console.log(colorize(`  doh`, hidden_color) + ` init webserver`.padEnd(22) + 'Initialize or upgrade the current directory into a Doh webserver project (safe to run multiple times)');
      console.log(' ');
    } else {
      console.log('Doh CLI Help:');
    console.log(' ');
    console.log('  doh [command] [args]');
    }
    console.log('Doh Project-related commands:');
    console.log(' ');
    console.log('  help'.padEnd(27) + 'Show this help menu');
    console.log(' ');

    const commandsByPackage = {};

    for (const [command, info] of Object.entries(this.commands)) {
      const package_name = info.package_name;
      if (!commandsByPackage[package_name]) {
        commandsByPackage[package_name] = [];
      }
      commandsByPackage[package_name].push(command);
    }

    for (const [package_name, commands] of Object.entries(commandsByPackage)) {

      console.log(`### ${package_name} ###`);
      for (const command of commands) {
        //console.log(`  ${command}`);
        const info = this.commands[command];
        if (typeof info === 'string') {
          console.log(`  ${command.padEnd(24)} ${info}`);
        } else {
          console.log(`  ${command.padEnd(24)} ${info.help || info.file}`);
        }
      }
      console.log(' ');
    }
  }

  async run() {
    await this.loadCommands();

    let [, , command, ...args] = process.argv;
    if (!command) {
      command = 'run';
    }
    if (command === 'help') {
      this.showHelp();
      this.exitCleanly();
    } else {
      await this.runCommand(command, ...args);
    }
  }
}

const cli = new DohCLI();

Doh.CLI = function (package_name, commandObject) {
  for (let [command, info] of Object.entries(commandObject)) {
    if (typeof info === 'string') {
      info = { file: info };
    }
    if (typeof info === 'object' && info.file) {
      info.package_name = package_name;
      cli.commands[command] = info;
    } else {
      console.error(`Invalid command configuration for ${command}`);
    }
  }
}

export default Doh;

await cli.run();