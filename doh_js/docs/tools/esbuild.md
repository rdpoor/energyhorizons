![Esbuild]({{Package:deploydoh_home}}/images/esbuild.png?size=small)

Doh leverages esbuild, a fast JavaScript bundler, to provide optimized bundle sizes and improved loading times. The integration includes:

- Custom esbuild plugin (`esbuild_doh_plugin.js`)
- Manifest processor for ESM support (`esbuild_processor.js`)
- Bundle visualization using Banal
- Intelligent package deduplication
- Node.js builtin module polyfilling

## Configuration

### ESBuild Processor Configuration

The ESBuild processor is configured through the `esbuild_processor` Pod:

```javascript
Doh.Pod('esbuild_processor', {
  esbuild_options: {
    bundle: true,
    outdir: DohPath('/dist/esm-bundles'),
    format: 'esm',
    splitting: true,
    chunkNames: 'chunks/[name]-[hash]',
    minify: true,
    treeShaking: false,
    keepNames: true,
    preserveSymlinks: false,
    target: 'esnext',
    platform: 'browser',
    mainFields: [
      'browser', 
      'module', 
      'main'
    ],
    logLevel: 'silent'
  }
})
```

The primary options include:

| Option | Description |
|--------|------------|
| `bundle` | Combines all dependencies into a single file |
| `outdir` | Output directory for bundled files |
| `format` | Output format (esm, cjs, iife) |
| `splitting` | Enables code splitting for optimized chunks |
| `minify` | Reduces file size through minification |
| `treeShaking` | Removes unused code (disabled by default) |
| `target` | JavaScript target version |
| `platform` | Target platform (browser or node) |
| `mainFields` | Package entry point resolution order |

### ESBuild Plugin Configuration

The custom Doh ESBuild plugin is configured via the `esbuild_doh_plugin` Pod:

```javascript
Doh.Pod('esbuild_doh_plugin', {
  esbuild_doh_plugin: {
    deduplicate_packages: true,
    fix_files: true,
    replace_native_modules: true,
    allow_external_resolution: true,
    exclude_from_deduplication: [],
    include_as_node_builtins: [
      'http', 'https','worker_threads', 'term.js', 'pty.js'
    ],
    empty_modules: []
  }
})
```

The key options include:

| Option | Description |
|--------|------------|
| `deduplicate_packages` | Enables package deduplication |
| `fix_files` | Applies fixes for problematic files |
| `replace_native_modules` | Replaces Node.js builtin modules with browser-compatible versions |
| `allow_external_resolution` | Allows external module resolution |
| `exclude_from_deduplication` | Packages to exclude from deduplication |
| `include_as_node_builtins` | Additional modules to treat as Node.js builtins |
| `empty_modules` | Modules to replace with empty implementations |

## Package Deduplication

One of the key features of Doh's esbuild integration is intelligent package deduplication. This feature helps reduce bundle size by identifying and resolving duplicate package instances.

### How Deduplication Works

1. The plugin identifies nested package instances in `node_modules` directories
2. It compares the versions of the nested and root packages
3. If the versions are compatible, it redirects imports to use the root package instance
4. A detailed deduplication report is generated after bundling

### Configuring Deduplication

You can control deduplication through the following settings:

- `deduplicate_packages`: Enable/disable deduplication (default: `true`)
- `exclude_from_deduplication`: Array of package names to exclude from deduplication

### Deduplication Example

```javascript
// Without deduplication
// - node_modules/package-a/node_modules/lodash (v4.17.20)
// - node_modules/package-b/node_modules/lodash (v4.17.21)
// - node_modules/lodash (v4.17.21)

// With deduplication
// All imports of lodash are redirected to the root instance (v4.17.21)
```

## Bundle Visualization

Doh integrates with the `banal` tool to provide visualization of bundle sizes and dependencies.

### Using Banal Visualization

1. After building with esbuild, a metafile is generated at `dist/esm-bundles/build-meta.json`
2. The `banal` CLI command processes this file to create an interactive visualization:

```shell
node doh banal
```

3. To automatically open the visualization in a browser:

```shell
node doh banal open
```

### Configuring Banal

The `banal` module is configured through its Doh module configuration:

```javascript
Doh.Pod('banal', {
  always_banal: false,
  always_open_after_banal: false
});
```

Set `always_banal` to `true` to automatically generate visualizations after each build.

## ESM Support

Doh's esbuild integration includes robust support for ECMAScript Modules (ESM):

1. The processor generates ESM-compatible bundles
2. Dynamic imports are preserved for code splitting
3. An import map is generated for browser module loading:

```javascript
// Generated at doh_js/manifests/browser_esm_manifest.json
{
  "imports": {
    "package-name": "/dist/esm-bundles/package-name.js",
    // other mappings...
  }
}
```

## Node Polyfills

For browser compatibility, Doh uses the `esbuild-plugins-node-modules-polyfill` plugin to provide browser-compatible implementations of Node.js built-in modules.

### Configured Polyfills

The following Node.js builtins are polyfilled by default:

- `http` and `https` for network requests
- `worker_threads` for multithreading
- Additional modules can be configured via `include_as_node_builtins`

## Usage in Doh Projects

To use esbuild in your Doh project:

1. Ensure the esbuild package is installed:

```javascript
Doh.Install('esbuild', [
  'npm:esbuild',
  'npm:esbuild-plugins-node-modules-polyfill'
]);
```

2. Configure the esbuild options in your project's Pod:

```javascript
Doh.Pod('my_project', {
  esbuild_processor: {
    // Custom esbuild options...
  },
  esbuild_doh_plugin: {
    // Custom plugin options...
  }
});
```

3. Run the bundler:

```shell
node doh esbuild
```

## Advanced Features

### External Modules

You can configure certain modules to be treated as external (not bundled):

```javascript
Doh.Pod('esbuild_processor', {
  esbuild_options: {
    external: [
      'large-package',
      'problematic-package'
    ]
  }
});
```

### Custom Transformations

The `esbuild_doh_plugin` includes hooks for custom file transformations:

- File path normalization with `toForwardSlash`
- Special handling for problematic packages
- Module aliasing

### Import Path Resolving

The plugin includes sophisticated import path resolution:

- Detects and handles node built-in modules
- Supports multiple package entry points via `mainFields`
- Resolves package.json "exports" field

## Troubleshooting

### Common Issues

1. **Duplicate packages in bundle**:
   - Check if the package is in `exclude_from_deduplication`
   - Ensure the versions are semver-compatible

2. **Missing Node.js API in browser**:
   - Add missing polyfills to `include_as_node_builtins`
   - Consider using browser-compatible alternatives

3. **Large bundle sizes**:
   - Enable `treeShaking: true` in esbuild options
   - Use `banal` to identify large dependencies
   - Consider making large packages external

### Debugging

The esbuild plugin includes detailed logging:

- Set `logLevel: 'debug'` in esbuild options for verbose output
- A deduplication report is printed at the end of the build
- Check the browser console for runtime module loading issues

### Support

For additional help with esbuild integration:

- Consult the [esbuild Github documentation](https://esbuild.github.io/)