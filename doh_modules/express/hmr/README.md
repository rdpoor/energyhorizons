# Hot Module Reload: Hot-reload *Everything*.

![HMR](^/HMR.png?size=small)

Doh extends the concept of Hot Module Replacement (HMR) into a complete **Hot Virtual File System** that automatically updates any loadable resource without page reloads. Unlike traditional HMR systems that only handle JavaScript modules, Doh's approach works with **all loadable resources** including CSS, HTML, JSON, images, and any custom loaders.

This guide covers:
* Quick start setup and configuration
* Core concepts of the Hot Virtual File System
* Automatic resource tracking and updates
* Reactive loading patterns with Doh.live_load
* Two-way binding with Doh.mimic_load

> **Note:** For a higher-level view of how HMR/HVFS fits into the overall architecture with `Doh.Loaded`, the `Load System`, and `Data Binding`, see the [Doh.js Core Architecture Overview](/docs/core/overview).

## Quick Start

Getting started with Doh's Hot Virtual File System is incredibly simple:

1. **Enable HMR in your pod.yaml**:
   ```yaml
   browser_pod:
     hmr:
       enabled: true   # This is the only required setting
   ```

2. **That's it!** When enabled:
   - CSS is automatically hot-reloaded by default
   - HTML files served by the router automatically get HMR injection
   - Pattern definitions can* update live without page reloads
   - All required socket connections are set up automatically
   - **Any resource in Doh.Loaded can be hot-updated**

> *requires enabling the module in HMR pod settings

## Doh.Loaded: A Virtual File System

At the core of Doh's HMR capabilities is the `Doh.Loaded` object, which acts as a virtual file system for your application:

- **Universal Resource Cache**: All resources loaded via `Doh.load()` are stored in `Doh.Loaded`
- **Observable Updates**: Resources update in-place when files change on disk
- **Auto-Propagating Changes**: Updates trigger reactively throughout your application
- **Cross-Origin Compatible**: Works with local and remote resources

```javascript
// Resource "mydata.json" is stored in Doh.Loaded["mydata.json"]
const mydata = await Doh.live_load("mydata.json");
console.log(Doh.Loaded["mydata.json"]); // The loaded JSON content

// When the file changes, Doh.Loaded["mydata.json"] is automatically updated
// and all subscribers are notified
```

## Key Features and Benefits

Doh's Hot Virtual File System provides:

1. **Universal Hot Reloading**: Any resource type can be hot-reloaded, not just JS modules
2. **Automatic State Preservation**: Updates occur without losing application state
3. **Zero-Configuration Approach**: Most resources work automatically without extra setup
4. **Reactive Update System**: Changes propagate through observer patterns
5. **Intelligent Diffing**: HTML updates only change what's needed, preserving DOM state
6. **Cross-Environment Consistency**: Same API works in browser and Node.js
7. **Two-Way Binding**: Not just receive updates but also send them back to the server

## Automatic Resource Tracking

Doh automatically tracks and hot-reloads several resource types:

| Resource Type | Tracking Method | Update Behavior |
|---------------|----------------|-----------------|
| CSS | Automatic for all CSS | Style tags update in-place |
| HTML | Automatic with router | Intelligent DOM diffing |
| Patterns | Automatic with HMR | Instances update in real-time |
| JSON/Data | Via Doh.Loaded | In-memory values update |
| JS Modules | Via module system | Selectively reload affected components |

## Using the Hot Virtual File System

### Doh.live_load: Reactive Resource Loading

For any resource type, `Doh.live_load` provides a reactive connection to the file:

```javascript
// Load a JSON configuration and update UI when it changes
await Doh.live_load('config/settings.json', function(jsonString) {
  const settings = JSON.parse(jsonString);
  updateApplicationSettings(settings);
});
```

### Doh.mimic_load: Two-Way File Binding

`Doh.mimic_load` takes HMR to the next level by enabling two-way binding with files:

```javascript
// Create a two-way binding with a JSON configuration
const configMirror = await Doh.mimic_load('config/settings.json', function(jsonString) {
  // This callback runs when the server sends an update
  const settings = JSON.parse(jsonString);
  updateApplicationSettings(settings);
});

// Later, you can modify the file content from the client
// This change will be sent to the server and saved to disk
configMirror.content = JSON.stringify({ theme: 'dark', fontSize: 16 }, null, 2);
```

The `mimic_load` function:
1. Creates a mirror object with a `content` property
2. Sets up a subscription for server updates
3. Observes changes to the `content` property
4. Sends updates back to the server when content changes
5. Prevents update loops by tracking source IDs

This enables powerful collaborative editing scenarios where multiple clients can edit the same files simultaneously.

### Doh.live_html: Smart HTML Updates

For HTML content, `Doh.live_html` provides intelligent DOM diffing:

```javascript
// Load HTML template and auto-update with intelligent diffing
await Doh.live_html('templates/dashboard.html');
```

### Doh.mimic_html: Two-Way HTML Binding

***( !! VERY ALPHA !! )***

Similar to `mimic_load`, but specifically for HTML content with intelligent diffing:

```javascript
// Create a two-way binding with an HTML template
const templateMirror = await Doh.mimic_html('templates/dashboard.html', function(newHtmlString) {
  // This callback runs when the server sends an update
  console.log('Template updated from server');
});

// Later, you can modify the HTML content from the client
// This change will be sent to the server and saved to disk
templateMirror.content = '<div class="dashboard updated">New content</div>';
```

### Subscribing to Resource Changes

For more control, you can subscribe to specific resource updates:

```javascript
Doh.Module('my_app', [
  'hmr_browser?? hmr'
], function(HMR) {
  // Subscribe to updates for a specific resource
  HMR.subscribe('data/metrics.json', (updateData) => {
    const metrics = JSON.parse(Doh.Loaded['data/metrics.json']);
    refreshDashboardMetrics(metrics);
  });
});
```

## The Doh.Loaded Observer Pattern

The power of Doh's Hot Virtual File System comes from its observer pattern:

```javascript
// Observe changes to any resource in Doh.Loaded
Doh.observe(Doh.Loaded, 'config/theme.json', function(obj, prop, newValue) {
  applyThemeChanges(JSON.parse(newValue));
});

// the above can now be replaced with (for simplicity):
Doh.live_load('config/theme.json', function(newValue) {
  applyThemeChanges(JSON.parse(newValue));
})
```

This pattern:
1. Watches for changes to specific keys in `Doh.Loaded`
2. Triggers callbacks when values change
3. Works with any resource type
4. Enables building reactive UIs without virtual DOM frameworks

## Advanced Usage

### Pausing and Resuming HMR

You can temporarily disable and re-enable HMR during runtime:

```javascript
// Disable HMR temporarily
HMR.pause();

// Perform operations that shouldn't trigger HMR
performBatchUpdates();

// Re-enable HMR
HMR.resume();
```

### Checking Connection Status

You can check if HMR is connected and get the list of active loaders:

```javascript
// Check if HMR is connected to the server
if (HMR.isConnected()) {
  console.log('HMR is connected');
}

// Get a list of all active loaders being watched
const activeLoaders = HMR.getActiveLoaders();
console.log('Active loaders:', activeLoaders);
```

### Custom Loaders with Live Updates

Create custom loaders that participate in the Hot Virtual File System:

```javascript
// Custom YAML loader with hot update support
LoaderTypesExtMap['yaml'] = 'yaml';
LoaderTypesExtMap['yml'] = 'yaml';

// define a cache to reduce unwanted reloads
Doh.YAMLIsLoaded = Doh.YAMLIsLoaded || {};

// define the actual loader
Doh.LoaderTypes['yaml'] = async function (loadStatement, from, relpath, loaderType, forceReload = false) {
  if (!forceReload && Doh.YAMLIsLoaded[from]) return Doh.YAMLIsLoaded[from];
  return Doh.ajaxPromise(from + (forceReload ? '?reload=' + forceReload : '')).then(async response => {
    const YAML = await Doh.load('yaml');
    Doh.YAMLIsLoaded[from] = YAML.parse(response.data);
    return Doh.YAMLIsLoaded[from];
  });
};

// Now YAML files are hot-reloadable
await Doh.live_load('config.yaml', function(yamlData) {
  applyConfiguration(yamlData);
});
```

## How It Works

Doh's Hot Virtual File System works through several integrated mechanisms:

1. **File Watching**: The server watches files for changes using chokidar
2. **Socket Communication**: Changes are broadcast to connected clients
3. **Doh.Loaded Updates**: The system updates values in Doh.Loaded
4. **Observer Notifications**: Observers of Doh.Loaded are notified
5. **Automatic Reapplication**: Pattern properties, CSS, and HTML are reapplied
6. **Two-Way Synchronization**: With mimic_load, client changes are sent back to the server

This creates a seamless end-to-end system where:
- File changes on disk
- Updates in-memory representation
- Triggers dependent component updates
- Without losing application state

## Real-World Examples

### Live Documentation Browser

```javascript
// Documentation that updates as you edit
await Doh.live_load('docs/api.md', function(markdown) {
  document.getElementById('docs').innerHTML = marked(markdown);
  Prism.highlightAll();
});
```

### Real-Time Collaborative Editing

```javascript
// Shared resource that updates across clients
const sharedWhiteboard = await Doh.mimic_load('shared/whiteboard.json', function(whiteboardData) {
  renderCollaborativeWhiteboard(JSON.parse(whiteboardData));
});

// Add a new element to the whiteboard from this client
const currentWhiteboard = JSON.parse(sharedWhiteboard.content);
currentWhiteboard.elements.push({ type: 'circle', x: 100, y: 100, radius: 50 });
sharedWhiteboard.content = JSON.stringify(currentWhiteboard);
```

### Live Configuration Editor

```javascript
// Create a UI for editing configuration
const configMirror = await Doh.mimic_load('config/app.json');
const config = JSON.parse(configMirror.content);

// Create UI elements for editing
const themeSelector = document.getElementById('theme-selector');
themeSelector.value = config.theme;

// Update config when UI changes
themeSelector.addEventListener('change', () => {
  const updatedConfig = JSON.parse(configMirror.content);
  updatedConfig.theme = themeSelector.value;
  configMirror.content = JSON.stringify(updatedConfig, null, 2);
});
```

## Configuration Options

Fine-tune the Hot Virtual File System with these pod settings:

```yaml
browser_pod:
  hmr:
    enabled: true                # Enable HMR system
    autocss: true                # Enable automatic CSS hot reloading (default: true)
    debounceTime: 300            # Time in ms to debounce rapid file changes
    highlightBeforeApply: false  # Highlight DOM changes before applying (default: false)
    loaders: [                   # Additional loaders to watch explicitly
      'ui_components.js',
      'dashboard_module',
      'templates/header.html'
    ]
```

## Troubleshooting

If you encounter issues with the Hot Virtual File System:

1. **Check Connection Status**: Look for the visual indicator in the bottom right corner or use `HMR.isConnected()`
2. **Verify File Paths**: Ensure paths match exactly what's in Doh.Loaded
3. **Check Subscriptions**: Use `HMR.getActiveLoaders()` to see what's being watched
4. **Force Reload**: As a last resort, use `HMR.forceReloadPage()` to refresh
5. **Pause and Resume**: If updates are causing issues, try using `HMR.pause()` temporarily

## Conclusion

Doh's Hot Virtual File System represents a significant evolution beyond traditional HMR. By extending hot reloading to the entire virtual file system through Doh.Loaded, it creates a development experience where any resource can be updated without losing application state.

The addition of two-way binding with `mimic_load` takes this even further, enabling collaborative editing scenarios and powerful tools where clients can modify files directly from the browser.

This approach eliminates the friction between writing code and seeing results, making development more efficient and enjoyable while keeping code clean and maintainable.