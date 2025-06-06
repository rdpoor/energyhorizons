![Export]({{Package:deploydoh_home}}/images/export.png?size=small)

The Doh Export tool helps you create standalone HTML applications from your Doh projects. It combines all your application's code, styles, and assets into a single HTML file that can run without needing a server or internet connection.

This guide covers:
* Using the export command and basic configuration
* Understanding how the export tool packages your application
* Working with the virtual filesystem for asset access
* Managing dependencies and load statements
* Configuring export settings in your pod file

## Overview

The export tool:

1. Embeds all JavaScript dependencies as data URLs in an import map
2. Inlines CSS and scripts directly in the HTML
3. Converts binary assets to base64-encoded data URLs stored in a virtual filesystem
4. Packages the full Doh runtime environment
5. Creates a completely self-sufficient application in a single file

This capability is particularly valuable for:
- Creating portable demos that run offline
- Distributing applications that need to function without internet
- Deploying simple applications without complex server infrastructure
- Creating emergency backups of critical applications

## Usage

### Basic Usage

```bash
doh export
```

This exports your application using the default `pod.yaml` configuration.

### With Specific Pod Configuration

```bash
doh export custom.pod.yaml
```

This uses a specific pod configuration for the export.

## Configuration

The export tool uses a special configuration section in your pod file:

```yaml
export_load: ['module1', 'module2', 'styles.css', '^/local/script.js']
```

The `export_load` property specifies which modules, scripts, and stylesheets should be included in the export. This follows the same format as any Doh load statement, supporting all the standard path notations and module references.

## How It Works

The export process follows these steps:

1. **Initialization**: The tool processes your pod configuration and runs the packager
2. **Import Map Processing**: Converts all import references to inline data URLs
3. **Resource Loading**: Processes all specified loadables from `export_load`
4. **Asset Collection**: Gathers all required assets and converts them to base64 data URLs
5. **HTML Assembly**: Constructs a single HTML file with all components embedded
6. **Virtual Filesystem Setup**: Creates a virtual filesystem for asset access

### Virtual Filesystem

The export tool creates a virtual filesystem (VFS) accessible through `DohOptions.VFS` that maps paths to data URLs:

```javascript
DohOptions.VFS['/path/to/asset.png'] = "data:application/octet-stream;base64,..."
```

This allows your application to access embedded assets exactly as it would access files in a normal deployment.

## Integration with Other Systems

### DohPath Integration

The export tool leverages DohPath for resolving all file paths consistently. This ensures that:

1. All assets are properly located regardless of their original reference style (`/`, `^/`, `./`)
2. Paths in the exported application continue to resolve correctly
3. The virtual filesystem paths align with what your application expects

When your application runs from the exported HTML, DohPath automatically works with the virtual filesystem to retrieve embedded assets:

```javascript
// In your application code:
const imageUrl = DohPath('/assets/logo.png');
// During export, this becomes accessible via the VFS
```

### Load System Integration

The export tool fully integrates with the Doh Load System:

1. It uses the `export_load` property as the entry point for your application
2. It preloads all dependencies specified in your modules
3. It preserves all load decorators and conditionals
4. It maintains the loading order and dependencies

Your application initializes with:

```javascript
await Doh.load(export_load);
```

This ensures that your application bootstraps exactly as it would in a normal deployment.

## Example Output Structure

```html
<html>
  <head>
    <title>Doh.js</title>
    <script type="importmap">
      {"imports": {"module-name":"data:text/javascript;charset=utf-8,...","path":"data:..."}}
    </script>
    <script>/* Embedded script content */</script>
    <style>/* Embedded CSS content */</style>
  </head>
  <body>
    <script type="module">
      globalThis.DohOptions = globalThis.DohOptions || {};
      DohOptions.browser_pod = {...};
      DohOptions.Packages = {...};
      DohOptions.CorePatterns = {...};
      DohOptions.PatternModule = {...};
      DohOptions.PreloadedPackages = {...};
      DohOptions.PreloadedScripts = [...];
      DohOptions.PreloadedStylesheets = [...];
      
      DohOptions.VFS = {};
      DohOptions.VFS['/path/to/asset'] = "data:application/octet-stream;base64,...";
      
      /* Embedded Doh runtime */
      /* Embedded module content */
      
      await Doh.load(["module1", "module2"]);
    </script>
  </body>
</html>
```

## Best Practices

1. **Be Specific with export_load**: Only include the modules and resources your application actually needs
2. **Test Exported Applications**: Verify that all functionality works as expected in the exported version
3. **Consider Asset Optimization**: Large binary assets will increase the file size significantly
4. **Use Path References Consistently**: Stick to DohPath conventions in your application for best results
5. **Version Your Exports**: Keep exports under version control or label them with version information

## Limitations

1. **File Size**: Exported applications with many assets can become quite large
2. **Browser Compatibility**: Some browsers may have limits on the size of data URLs
3. **Dynamic Network Requests**: Any runtime fetch/AJAX calls to external resources will still require internet access

## Example Workflow

### 1. Configure Your Pod

```yaml
# pod.yaml
export_load: ['my-app-entrypoint', '/styles/main.css']
```

### 2. Export Your Application

```bash
doh export
```

### 3. Distribute the Generated HTML

Share the file at `/dist/export/doh.html` with users who need offline access.

## Advanced Usage

### Custom Export File Name

To specify a custom output file, you can modify the export file path in your pod configuration:

```yaml
export: {
  output_file: "/custom/path/app.html"
}
```