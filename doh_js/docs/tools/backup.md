![Backup]({{Package:deploydoh_home}}/images/backup.png?size=small)

Doh's backup system helps you create and manage snapshots of your project. Using codex for automatic versioning and shrines for tagged backups, you can easily save and restore different states of your project when needed.

This guide covers:
* Understanding codex for automatic project versioning
* Creating tagged backups with shrines
* Restoring project states with the enact command
* Working with automatic backup features
* Managing backup versions and cleanup

## Key Components

### 1. Codex

A codex is an automatically versioned backup of the entire project. It captures the current state of all files and directories, excluding those specified in the `packager_ignore` configuration.

### 2. Shrine

A shrine is a tagged snapshot of a codex. It allows developers to create named backups of specific project states, making it easy to identify and restore important milestones.

## Core Functions

### Codify

The `codify` function creates a new codex of the current project state.

**Usage:**
```bash
node doh codify
```

**Behavior:**
- Creates a compressed archive (.tar.gz) of the project in the `/.doh/codex/` directory.
- Automatically increments the version number.
- Excludes files and directories specified in `packager_ignore`.
- Cleans up old codex files based on the `max_codex` setting in the pod configuration.

### Enshrine

The `enshrine` function creates a tagged shrine from the latest codex.

**Usage:**
```bash
node doh enshrine <tag>
```

**Behavior:**
- Creates a copy of the latest codex in the `/.doh/shrines/` directory.
- Appends the provided tag to the version number.
- Allows for easy identification of important project states.

### Enact

The `enact` function restores the project from a codex or shrine backup.

**Usage:**
```bash
node doh enact [version_or_tag]
```

**Behavior:**
- If no version or tag is provided, displays a list of available codex versions and shrines.
- Restores the project to the state of the selected codex or shrine.
- Runs `npm install` after restoration to ensure all dependencies are up to date.
- Executes the auto-packager to rebuild necessary project components.

## Advanced Features

### Automatic Codex Creation

A new codex is automatically created when:
- Upgrading packages (`node doh upgrade`)
- Reinstalling packages (`node doh reinstall`)

This ensures that you always have a backup before making significant changes to your project.

### Version Management

The system uses a sophisticated versioning scheme:
- Versions are in the format `major.minor.patch[suffix]` (e.g., `1.2.3a`).
- Version numbers automatically increment, rolling over to the next suffix when needed.
- Shrines append a tag to the version number (e.g., `1.2.3a-mytag`).

### Cleanup and Maintenance

- The system automatically manages the number of codex backups based on the `max_codex` setting in the pod configuration.
- Old codex files are removed to prevent excessive disk usage while maintaining a history of recent backups.

## Best Practices

1. **Regular Codification**: Run `codify` regularly to maintain a comprehensive project history.
2. **Meaningful Shrine Tags**: Use descriptive tags when enshrining to easily identify important project states.
3. **Pre-update Backups**: Always create a codex or shrine before making significant changes to your project.
4. **Version Control Integration**: While this system provides robust backups, it's not a replacement for version control. Use it in conjunction with systems like Git for optimal project management.

## Troubleshooting

If you encounter issues with the codex or shrine system:

1. Ensure you have sufficient disk space for backups.
2. Check the `packager_ignore` settings to make sure important files are not being excluded.
3. Verify that you have the necessary permissions to read from and write to the `/.doh/` directory.