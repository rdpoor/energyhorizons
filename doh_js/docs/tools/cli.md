![CLI]({{Package:deploydoh_home}}/images/CLI.png?size=small)

The Doh CLI system consists of two main components:
1. **Runtime CLI** - Base commands for managing Doh installations and projects
2. **Project CLI** - Commands for managing Doh projects, packages, and deployments

This guide covers:
* Runtime CLI installation and basic commands
* Project CLI for application management
* Package and configuration management
* Dohball creation and management
* Backup and restore capabilities
* Cache management and documentation
* Process management and export tools
* Extending the CLI with custom commands

## Runtime CLI

The Runtime CLI provides commands for managing Doh installations, initializing projects, and serving as a wrapper for Bun commands.

### Initial Installation

To install Doh for the first time:

**Windows:**
```bash
powershell -c "irm deploydoh.com/install.ps1 | iex"
```

**Mac/Linux/Unix:**
```bash
curl -fsSL https://deploydoh.com/install | bash
```

After installation, you can use the `doh` command to manage both Doh and Bun runtimes.

### Main Menu

Run `doh` without any arguments to access the interactive main menu:
```bash
doh
```

This presents options to:
- Run Project - Execute the current Doh project
- Initialize - Start or repair Doh projects and modules
- Install Runtimes - Install/uninstall Doh or Bun
- Exit - Quit the application

### Initialization Menu

Access the initialization menu with:
```bash
doh init
```

Options include:
- Doh Project - Standard Doh project initialization (rerun safe)
- Doh Module - Quick module creation
- Doh Module (Wizard) - Guided module setup
- Doh w/ Webserver - Doh project with Express webserver (safe for existing projects)
- Webserver from URL - Initialize webserver and clone from a URL
- Back to Main Menu

Direct command options:
```bash
doh init project     # Initialize a standard Doh project
doh init doh         # Same as 'project' (alternative command)
doh init module      # Initialize a quick module 
doh init wizard      # Initialize a module with the wizard interface
doh init webserver              # Initialize a Doh webserver project
doh init webserver clone [url]  # Initialize and clone from a URL (prompts if URL omitted)
```

### Runtime Management Commands

#### Install/Upgrade Doh
These commands can be used for both initial installation and subsequent upgrades:
```bash
doh install doh     # Install or upgrade Doh globally
```

#### Install/Upgrade Bun
```bash
doh install bun     # Install or upgrade Bun globally
```

#### Install/Uninstall Node.js (via Volta)
Manage Node.js installation using Volta.
```bash
doh install node     # Install Node.js globally via Volta (installs Volta if needed)
doh uninstall node   # Uninstall Node.js managed by Volta
```

### Bun Passthrough

Execute Bun commands through Doh (Used with bun symlink to avoid installing bun globally):
```bash
doh bun [commands]  # Run Bun commands (e.g., doh bun pm trust --all)
```

## Project CLI

The Project CLI provides commands for managing Doh projects, packages, configurations, deployments, and backups. It integrates with Doh's core systems, including the auto-packager, Dohballs, package management, and pod configurations.

> All commands of the Doh Project CLI core are compatible with the `--confirm-all` flag that shortcuts prompts

### Application Management

#### run
Start the Doh application.
```bash
doh run              # Run with auto-packager
doh run no-pack      # Run without auto-packager or installer
doh run pod.yaml     # Run with specific pod configuration (inherits from /pod.yaml)
doh run <module name> # Run with only the specified module (and its dependencies) loaded
doh run help         # Show detailed help for the run command
```

#### update
Run the auto-packager and force ESBuild compilation. This command is useful for updating build artifacts without running the full application.
```bash
doh update
```

### Package Management

> *These commands also clean up obsolete files from previous versions based on the `dohball.json`.*

#### install
Install specified Doh packages from configured Dohball hosts. Runs the packager after installation, which includes cleanup of obsolete files from previous versions based on `dohball.json`.
```bash
doh install package1 [package2...]
```

#### upgrade
Upgrade all or specific Doh packages.
```bash
doh upgrade                     # Upgrade all packages
doh upgrade package1 [package2] # Upgrade specific packages
```

#### reinstall
Reinstall all or specific Doh packages. Runs the packager after reinstallation, which includes cleanup of obsolete files from previous versions based on `dohball.json`.
```bash
doh reinstall                     # Reinstall all packages
doh reinstall package1 [package2] # Reinstall specific packages
```

### Configuration Management

#### pod
Show the current value and inheritance chain of a pod setting.
```bash
doh pod express_config.port      # Example for a specific setting
```

#### inherits
Manage pod inheritance.
```bash
doh inherits /path/to/pod.yaml   # Add inheritance
doh inherits ~~/path/to/pod.yaml # Remove inheritance
```

#### host_load
Manage Doh package autoloading in Bun/Node.js.
```bash
doh host_load package1 [package2]   # Add packages
doh host_load ~~package1 [package2] # Remove packages
```

#### dohball_host
Manage Dohball hosts.
```bash
doh dohball_host https://host.com    # Add host
doh dohball_host ~~https://host.com  # Remove host
```

### Dohball Management

#### bake
Create Dohballs for exposed packages.
*This process identifies files removed since the last version and records them in `dohball.json` for cleanup during installation.*
```bash
doh bake                     # Bake all exposed packages
doh bake package1 [package2] # Bake specific packages
```

#### rebake
Force recreation of Dohballs.
*This process identifies files removed since the last version (if one exists) and records them in `dohball.json` for cleanup during installation.*
```bash
doh rebake                     # Rebake all packages
doh rebake package1 [package2] # Rebake specific packages
```

#### compile-dohball-manifest
Create the Dohball hosting manifest from locally hosted Dohballs.
```bash
doh compile-dohball-manifest
```

#### do-removals
Manually process the `removals` list found in the `dohball.json` of installed packages, deleting obsolete files.
*May prompt for confirmation before deleting files unless `--confirm-all` is used.*
```bash
doh do-removals
```

#### status
Show Dohball status, including installed versions, remote versions, and update availability.
```bash
doh status         # Show basic status
doh status verbose # Show detailed status with integrity info, paths, and symlink details
```

#### enshrine
Create a tagged backup. If no tag is provided, it runs `doh codify` to create a standard auto-versioned backup.
```bash
doh enshrine <tag>
```

#### enact
Restore from a backup. If no version or tag is specified, it displays a menu of available codex and shrine backups.
```bash
doh enact                # Show available backups
doh enact <version|tag>  # Restore a specific backup
```

### Cache Management

*Most `clear-*` commands prompt for confirmation. Use the `force` argument or the `--confirm-all` flag to bypass these prompts (e.g., `doh clear-pod force` or `doh clear-pod --confirm-all`).*

#### clear-pod
Clear pod cache and manifest.
```bash
doh clear-pod
```

#### clear-packager
Clear auto-packager output and manifests (includes `package.cache.json`, `core_package.cache.json`, and `compiled_dohball_manifest.json`).
```bash
doh clear-packager
```

#### clear-build
Clear the build directory at /dist containing compiled bundles. (Not part of clear-all)
```bash
doh clear-build
```

#### clear-doh-cache
Clear Doh cache files.
```bash
doh clear-doh-cache
```

#### clear-all
Clear pod cache/manifest and auto-packager manifests/caches (equivalent to `doh clear-pod force` and `doh clear-packager force`). Does *not* clear the build directory (`/dist`) or hosted Dohballs.
```bash
doh clear-all
```

### Documentation

#### compile-docs
Generate documentation by consolidating project `.md` files.
```bash
doh compile-docs                     # Generate markdown docs (/doh_js/manifests/doh.md)
doh compile-docs yaml                # Generate YAML docs (/doh_js/manifests/doh.yaml)
doh compile-docs json                # Generate JSON docs (/doh_js/manifests/doh.json)
doh compile-docs txt                 # Generate plain text docs (/doh_js/manifests/doh.txt)
doh compile-docs json-txt            # Generate JSON-as-text docs (/doh_js/manifests/doh.txt)
doh compile-docs [format] --skip-toc # Generate docs without the Table of Contents
```

### Process Management

#### pm2
Configure PM2 process management.

Uses Doh.pod.pm2 

```bash
doh pm2 setup       # Set up PM2 configuration
doh pm2 stop        # Stop the process
doh pm2 restart     # Start/Restart the process
doh pm2 delete      # Delete the process
doh pm2 log         # View/tail logs
```

### Export

#### export
Export a Doh module to a static HTML file.
```bash
doh export            # Export using default pod.yaml
doh export pod.yaml   # Export using a specific pod configuration
```

The export command creates a completely self-contained HTML file that bundles your Doh application with all its dependencies. See [Export Tool Documentation](/docs/tools/export) for comprehensive details.

## Extending the CLI

### Custom Command Registration
Register new commands using `Doh.CLI()`:
```javascript
Doh.CLI('packageName', {
  'commandName': {
    file: 'path/to/implementation.js',
    help: 'Command description and usage'
  }
});
```

### Command Implementation
Command implementation files should be ES modules:
```javascript
// implementation.js
const args = process.argv.slice(3); // Get command arguments
// Command logic
export default null; // Export is ignored
```

### CLI Manifest
Commands are compiled into `/.doh/manifests/cli_manifest.json`:
```json
{
  "packageName": {
    "commandName": {
      "file": "/path/to/implementation.js",
      "help": "Command description and usage"
    }
  }
}
```

## Best Practices

1. **Command Names**
   - Use descriptive, action-based names.
   - Follow kebab-case convention.
   - Group related commands with common prefixes.

2. **Help Text**
   - Include command purpose and usage examples.
   - Document all arguments and options.

3. **Implementation**
   - Handle errors gracefully.
   - Provide clear feedback.
   - Confirm destructive operations.

4. **Documentation**
   - Keep command documentation updated.
   - Include common use cases.
   - Document side effects.