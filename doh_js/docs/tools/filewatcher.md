# FileWatcher Module

The FileWatcher module provides robust file watching capabilities with state tracking and subscription-based event notifications. It uses chokidar under the hood to efficiently watch for file changes and provides a simple API for subscribing to file events.

## Features

- Watch entire project for file changes
- Track file state (added, modified, removed) in a git-like manner
- Persist state to disk for preservation across restarts
- Subscribe to file events using exact paths, directories, or glob patterns
- Efficient event notification system with minimal overhead
- Configurable via Pod system

## Installation

The FileWatcher module is included in Doh.js. No manual installation is required. When the module is first used, it will automatically install its dependencies.

## Configuration

The FileWatcher can be configured via the Pod system:

```javascript
Doh.Pod('FileWatcher', {
  FileWatcher: {
    // Enable or disable the watcher
    enabled: true,
    
    // Default file patterns to ignore (follows chokidar syntax)
    ignored: [
      '**/.git/**',
      '**/node_modules/**',
      '**/.doh/logs/**',
      '**/.*',
      '**/.*/**',
      '!**/.doh.yaml'
    ],
    
    // State persistence
    statePersistence: {
      enabled: true,
      path: '.doh/watcher_state.json',
      debounceTime: 1000, // Debounce saves to once per second
      atomicWrites: true  // Use atomic writes for safety
    }
  }
});
```

## Usage

### Basic Usage

```javascript
// Load the FileWatcher module
Doh.Module('MyModule', ['FileWatcher'], function(watcher) {
  // The watcher is already initialized and running
  
  // Subscribe to all file changes
  const unsubscribe = watcher.subscribe('**', (event) => {
    console.log(`File ${event.path} was ${event.type}d`);
  });
  
  // Later, when you want to stop receiving events
  unsubscribe();
});
```

### Subscription Patterns

You can subscribe to file events using different pattern types:

#### Exact Path

```javascript
watcher.subscribe('/path/to/file.js', (event) => {
  console.log(`File ${event.path} was ${event.type}d`);
});
```

#### Directory

Subscribe to all files in a directory (including subdirectories):

```javascript
watcher.subscribe('/path/to/directory', (event) => {
  console.log(`File ${event.path} was ${event.type}d`);
});
```

#### Glob Pattern

Subscribe using glob patterns (powered by minimatch):

```javascript
// All JavaScript files
watcher.subscribe('**/*.js', (event) => {
  console.log(`JavaScript file ${event.path} was ${event.type}d`);
});

// All files in a specific directory
watcher.subscribe('src/**', (event) => {
  console.log(`Source file ${event.path} was ${event.type}d`);
});
```

### Event Types

The callback receives an event object with the following properties:

```javascript
{
  type: 'add' | 'change' | 'unlink', // Event type
  path: '/path/to/file.js',          // File path
  state: {                           // Current file state
    path: '/path/to/file.js',
    mtime: 1632489732000,            // Last modification time (milliseconds)
    status: 'added' | 'modified' | 'removed',
    size: 1024,                      // File size in bytes (if available)
    lastSeen: 1632489732000          // When this file was last seen
  },
  timestamp: 1632489732000           // Event timestamp
}
```

### Querying File State

You can query the current state of a file:

```javascript
const fileState = watcher.getFileState('/path/to/file.js');
if (fileState) {
  console.log(`File status: ${fileState.status}`);
  console.log(`Last modified: ${new Date(fileState.mtime)}`);
}
```

### Getting Files by Pattern

You can get all tracked files that match a pattern:

```javascript
// Get all JavaScript files
const jsFiles = watcher.getFiles('**/*.js');

// Log the paths
jsFiles.forEach(file => {
  console.log(`JavaScript file: ${file.path}, status: ${file.status}`);
});
```

## Advanced Usage

### Monitoring Specific Directories

By default, the FileWatcher watches the entire project. If you only need to watch specific directories, you can configure this when initializing your module:

```javascript
Doh.Module('MyModule', ['FileWatcher'], function(watcher) {
  // The default watcher is still watching everything
  
  // Create a more focused subscription for better performance
  const unsubscribe = watcher.subscribe('src/**/*.js', (event) => {
    console.log(`Source JavaScript file ${event.path} was ${event.type}d`);
  });
});
```

### Handling Removed Files

FileWatcher tracks removed files in a git-like manner, meaning they remain in the state store with a 'removed' status:

```javascript
watcher.subscribe('**', (event) => {
  if (event.type === 'unlink') {
    console.log(`File ${event.path} was removed at ${new Date(event.timestamp)}`);
    
    // The file state still exists in the tracker with status='removed'
    console.log(`Removed file's last modification time: ${new Date(event.state.mtime)}`);
  }
});
```

### State Persistence

The FileWatcher automatically saves its state to disk whenever files change. To prevent excessive disk I/O, saves are debounced so they occur at most once per second (configurable via the `debounceTime` option). The state is saved in a JSON file that includes information about all tracked files.

### Clean Shutdown

The FileWatcher handles proper cleanup automatically when the process exits. This includes saving the current state to disk.

## API Reference

### watcher.subscribe(pattern, callback)

Subscribe to file events that match the given pattern.

- **pattern**: String pattern to match files (exact path, directory, or glob)
- **callback**: Function to call when matching events occur
- **returns**: Unsubscribe function

### watcher.getFileState(filePath)

Get the current state of a file.

- **filePath**: Path to the file
- **returns**: File state object or null if not found

### watcher.getFiles(pattern)

Get all tracked files that match a pattern.

- **pattern**: String pattern to match files
- **returns**: Array of file state objects

### watcher.close()

Stop the watcher and save the final state.

- **returns**: Promise that resolves when cleanup is complete

## Examples

### Watching for Changes to a Specific File Type

```javascript
Doh.Module('CssWatcher', ['FileWatcher'], function(watcher) {
  watcher.subscribe('**/*.css', (event) => {
    console.log(`CSS file ${event.path} was ${event.type}d`);
    
    // Perform actions when CSS files change
    if (event.type === 'change' || event.type === 'add') {
      // Reload styles, rebuild CSS, etc.
    }
  });
});
```

### Watching a Specific Directory

```javascript
Doh.Module('ConfigWatcher', ['FileWatcher'], function(watcher) {
  watcher.subscribe('config/', (event) => {
    console.log(`Config file ${event.path} was ${event.type}d`);
    
    // Reload configuration when files in the config directory change
    if (event.type === 'change' || event.type === 'add') {
      // Reload configuration
    }
  });
});
```

### Implementing Auto-Reload Functionality

```javascript
Doh.Module('AutoReloader', ['FileWatcher', 'express_router'], function(watcher, Router) {
  // Watch for changes to server-side JavaScript files
  watcher.subscribe('**/*.js', (event) => {
    // Exclude certain directories
    if (event.path.includes('node_modules') || event.path.includes('.doh/')) {
      return;
    }
    
    if (event.type === 'change') {
      console.log(`JavaScript file ${event.path} changed, notifying clients`);
      
      // Notify connected clients to reload
      Router.io.emit('server:file-changed', {
        path: event.path,
        type: event.type,
        timestamp: event.timestamp
      });
    }
  });
});
```

## Performance Considerations

- The FileWatcher is designed to be efficient, but watching a large number of files can still impact performance.
- Use specific patterns when subscribing rather than watching everything.
- The `ignored` configuration can significantly improve performance by excluding directories with many files (e.g., node_modules).
- State persistence is debounced to minimize disk I/O while still ensuring timely saves.

## Troubleshooting

### Events Not Being Triggered

- Check if the watcher is enabled in the Pod configuration.
- Ensure the file pattern is not being excluded by the `ignored` configuration.
- For glob patterns, ensure minimatch is properly available.

### High CPU or Memory Usage

- Try increasing the `debounceTime` to reduce disk I/O.
- Add more patterns to the `ignored` configuration.
- Use more specific subscription patterns.

## Related Documentation

- [Chokidar Documentation](https://github.com/paulmillr/chokidar)
- [minimatch Documentation](https://github.com/isaacs/minimatch) 