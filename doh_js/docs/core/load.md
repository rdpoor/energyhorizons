# Doh.load(): Univeral Dependencies

![Doh.load()]({{Package:deploydoh_home}}/images/doh.load.png?size=small)

The Doh Load System is a dependency management solution that works seamlessly across all JavaScript environments (browser, Node.js, Deno, and Bun). It provides a unified approach to resource loading with a simple, declarative syntax that eliminates environment-specific code paths while giving precise control over execution flow.


This guide covers:
* Core concepts of load statements and resource types
* Environment-aware loading with conditional decorators
* Flow control with await and async patterns
* Error resilience and optional dependencies
* NPM integration and dynamic loading
* Hot reloading capabilities

> **Note:** For a higher-level view of how the Load System interacts with other core components like the Auto-Packager, Manifests, and HMR, see the [Doh.js Core Architecture Overview](/docs/core/overview).

## Why Doh.load()

Rather than dealing with multiple dependency systems across different environments (import, require, script tags, etc.), Doh.load() provides a single, consistent approach that allows code branching to happen naturally inline, reducing the need for complex shims and external environment awareness:

```javascript
Doh.Module('MyFeature', [
    'core-dependency',                     // Load another Doh module 
    '^/path/to/file.js',                   // Load a JavaScript file relative to current
    'browser?? ^/styles.css',              // Load CSS only in browsers
    'nodejs?? import fs from "fs-extra"',  // Load Node modules only in Node
    'optional advanced-feature',           // Continue even if this fails
    'await critical-dependency',           // Block subsequent loads until complete
], function(core) {
    // Your code with dependencies as parameters
});
```

**Key Benefits:**

- **Simplified environment branching** - Express environment-specific code inline rather than with complex external shims
- **Declarative loading** - Express what you need, not how to load it
- **Fine-grained control** - Precisely manage loading order and conditions
- **Error resilience** - Built-in error handling with optional dependencies
- **No configuration** - Zero setup required with intelligent auto-detection

## Core Concepts

### Load Statements

The foundation of the Doh Load System is the **load statement** - a simple string that declares what to load:

```javascript
// Basic load statement examples
'module-name'                            // Load a Doh module or package
'^/path/to/file.js'                      // Load a JavaScript file relative to current
'/absolute/path/file.css'                // Load a CSS file (absolute from Doh root)
'data.json'                              // Load and parse a JSON file
'import { render } from "preact"'        // Import from an ES module
'browser?? mobile-ui'                    // Load conditionally (only in browsers)
'await auth-system'                      // Control execution flow
'optional analytics'                     // Handle failures gracefully
```

### Resource Types

Doh automatically detects and handles different resource types based on file extension or syntax of load statement:

| Type | Example | What Happens |
|------|---------|--------------|
| **`doh`** | `'ui-component'` | Loads a [Doh module](/docs/core/modules) with its dependencies |
| **`js`** | `'utils.js'` | In browser: adds script tag<br>In Node: loads as text |
| **`css`** | `'styles.css'` | In browser: adds stylesheet link<br>In Node: loads as text |
| **`json`** | `'config.json'` | Fetches and parses as JSON |
| **`yaml`** | `'settings.yaml'` | Fetches and parses as YAML |
| **`import`** | `'import { x } from "y"'` | In browser: imports from local install or ESM.sh shim<br>In Node: uses native import |
| **`file`** | `'template.html'` | Loads as raw text |

You can also explicitly specify the type:
```javascript
'^/data.php > json'     // Parse response as JSON
'module-name > doh'     // Force Doh module type
```

## Key Features

### 1. Environment-Aware Loading with Conditionals

Load different resources based on runtime environment or configuration, which is essential when sharing module files across environments:

```javascript
// Real-world example: A shared module file with environment-specific loading
Doh.Module('MyFeature', [
    'common-dependency',                  // Loads in all environments
    'browser?? browser-only-module',      // Loads only in browsers
    'nodejs?? server-only-module',        // Loads only in Node.js
    'deno?? deno-specific-module',        // Loads only in Deno
    'bun?? bun-specific-module',          // Loads only in Bun
    'config.darkTheme?? dark-theme',      // Loads based on configuration
    '!mobile?? desktop-enhancements'      // Loads when condition is false (not mobile)
    'browser&&DEBUG?? dev-tools'          // Loads in browsers when DEBUG is true
], function() {
    // Module code runs after dependencies load
});
```

This approach is particularly valuable for modules that share a file but need environment-specific dependencies. For example:

```javascript
// A typical bifurcated module pattern - common pattern in Doh applications
Doh.Package('feature_name', {
  load: [
    // Common functionality for all environments
    'feature_name_common',
    // Environment-specific implementations
    'browser?? feature_name_ui',
    'nodejs?? feature_name_server'
  ]
});

// Common module with shared functionality
Doh.Module('feature_name_common', [], function(SharedObject) {
  // Code that runs in all environments
  SharedObject = SharedObject || {};
  // ... shared implementation
  return SharedObject;
});

// Browser-specific implementation
Doh.Module('feature_name_ui', [
  'feature_name_common',
  'html',             // Browser-specific dependency
  '^/styles.css'      // Browser-only CSS
], function(SharedObject) {
  // Extend the shared object with browser functionality
  // ...
});

// Server-specific implementation
Doh.Module('feature_name_server', [
  'feature_name_common',
  'import fs from "fs"',  // Node.js-specific dependency
  'express_router'        // Server-only routing
], function(SharedObject, fs, Router) {
  // Extend the shared object with server functionality
  // ...
});
```

### 2. Flow Control with `await` and `async`

Control the loading sequence with simple decorators:

```javascript
Doh.Module('SequencedFeature', [
    'async large-dependency',             // Group 1: Starts loading immediately
    'async metrics',                      // Group 1: Also starts loading immediately
    'await auth-system',                  // Group 2: First in await chain 
    'await data-loader',                  // Group 2: Second in await chain
    'user-profile',                       // Group 3: Runs after all await deps complete
    'ui-components'                       // Group 3: Runs in parallel with user-profile
], function(authSystem, dataLoader, userProfile, uiComponents) {
    // Actual execution order:
    // 1. 'async large-dependency' and 'async metrics' start immediately
    // 2. 'await auth-system' executes completely
    // 3. 'await data-loader' executes completely
    // 4. 'user-profile' and 'ui-components' execute in parallel
    
    // Only non-async dependencies are available as parameters in order
    // Async dependencies must be accessed from Doh.Loaded
    // You can safely await them again with dynamic Doh.load()
    const [largeDep, metrics] = await Doh.load(['large-dependency', 'metrics']);
    if (largeDep && metrics) {
        // Use the async dependencies here
    }
});
```

### 3. Error Resilience with `optional`

Make your code resilient without complex try/catch blocks:

```javascript
Doh.Module('ResilientFeature', [
    'core-functionality',                 // Required dependency
    'optional experimental-feature',      // App continues loading if this fails
    'browser?? optional legacy-polyfill'  // Combines conditional and optional
], function() {
    // Check if optional dependency loaded successfully (Loaded uses exact loadStatment as key)
    if (Doh.Loaded['optional experimental-feature']) {
        // Use the experimental feature
    }
});
```

### 4. NPM Integration

Use NPM modules seamlessly in any environment:

```javascript
Doh.Module('DataVisualizer', [
    // Auto-loaded from esm.sh in browsers, npm in Node
    'import { format } from "date-fns"',
    
    // Make available globally with the 'global' decorator
    'global import * as _ from "lodash"',
    
    // Specific version control
    'import { marked } from "marked@4.3.0"',
    
    // Combining features
    'browser?? global import Chart from "chart.js"'
], function(format) {
    // Access format as a parameter
    const formatted = format(new Date(), 'yyyy-MM-dd');
    
    // Access global imports directly
    const doubled = _.map([1, 2, 3], n => n * 2);
});
```

### 5. Dynamic Loading

Load dependencies on-demand when needed:

```javascript
Doh.Module('DynamicFeature', [], async function() {
    // Initial module code
    
    if (userNeedsReports) {
        // Load reporting features only when needed
        const [ generateReport, jsPDF ] = await Doh.load([
            'reporting-engine', 
            'import { jsPDF } from "jspdf"'
        ]);
        
        // Use the dynamically loaded features
        generateReport();
    }
});
```

### 6. Hot Reloading

Reload dependencies without page refresh:

```javascript
// Reload specific dependencies
await Doh.reload([
    'updated-module',
    '/styles.css',
    'import { component } from "ui-library"'
]);

// Access updated elements and exports
const updatedStyleLink = Doh.Loaded['/styles.css'];
const newComponent = Doh.Globals.component;
```

## Load Statement Syntax

A load statement can have multiple decorators that modify its behavior:

```
[condition??] [flow] [scope] [resource] [> type]
```

Where:
- **[condition??]** - Optional environment/config condition (`browser??`, `config.feature??`)
- **[flow]** - Optional flow control (`await`, `async`, `optional`)
- **[scope]** - Optional scope decorator (`global`)
- **[resource]** - Required resource identifier (module name, path, import statement)
- **[> type]** - Optional explicit type declaration (` > json`, ` > doh`)

### Decorator Order

Decorators must follow this specific order:
1. Conditional decorator first (`browser??`, etc.)
2. Flow control (`await`, `async`, `optional`) and scope (`global`) decorators next
3. The resource identifier
4. Type specifier (` > [type]`) last

### Examples

```javascript
  'browser?? await global import { Chart } from "chart.js" > import'
// ^ condition ^ flow ^ scope ^ resource                   ^ type
```

## Decorator Reference

### Conditional Decorators

| Decorator | Description |
|-----------|-------------|
| `browser??` | Loads only in browser environments |
| `nodejs??` | Loads only in Node.js environments |
| `deno??` | Loads only in Deno environments |
| `bun??` | Loads only in Bun environments |
| `config.property??` | Loads when specified property is truthy |
| `!condition??` | Negates a condition (loads when condition is false) |
| `condA&&condB??` | Logical AND for multiple conditions |
| `nodejs&&!bun??` | Multiple conditions with negation |

### Flow Control Decorators

| Decorator | Description |
|-----------|-------------|
| `async` | Highest priority - starts loading immediately when the load block is parsed, runs in parallel without blocking. Not available as parameters in the callback function; can be accessed later by calling Doh.load() again *without* the async, which will return the already resolved loadable. |
| `await` | Second priority - dependencies are chained together sequentially, with each awaited dependency fully completing before the next one starts. All awaited dependencies complete before any regular dependencies begin. |
| `optional` | Continues loading even if this dependency fails |

### Scope Decorators

| Decorator | Description |
|-----------|-------------|
| `global` | Makes ESM imports available globally |

### Understanding Load Blocks and Decorator Scoping

Each load block (array of dependencies) operates as its own mini-scope with two processing phases:

1. **Parsing phase**: All entries in the block are collected and parsed into three distinct groups:
   - **Group 1**: `async`-decorated dependencies are identified first
   - **Group 2**: `await`-decorated dependencies are collected next
   - **Group 3**: Regular dependencies (no flow control decorators) are gathered last

2. **Execution phase**: Dependencies are processed based on their grouping:
   - **Group 1**: `async` dependencies start immediately when found and run in parallel - they are effectively "hoisted" since they start before anything else but don't block
   - **Group 2**: `await` dependencies are chained together in sequence (each must complete before the next starts)
   - **Group 3**: Regular dependencies are executed using Promise.all (parallel execution) after all awaited dependencies complete

This three-group prioritization ensures that:
1. `async` dependencies begin loading immediately without entering the normal execution flow
2. `await`-decorated plugins and core libraries can fully initialize before dependent code loads
3. Non-critical dependencies run in parallel for optimal performance when possible

### Parameter Resolution in Module Callbacks

It's important to understand that **[Doh.Module](/docs/core/modules) doesn't enforce callback parameter ordering** as you might expect from the load array. Instead, the [Auto-Packager](/docs/core/auto_packager) scans Module definitions and resolves parameters by name:

1. When your module callback declares parameters, they are resolved by name lookups, not position
2. The Auto-Packager first checks `Doh.Globals` for a matching export
3. If not found, it falls back to check `globalThis`
4. Parameters act as "scope passthroughs" rather than positional arguments

This flexible parameter resolution decouples your function signature from the dependency array order, making modules more maintainable.

We understand that this may not work for every use-case specifically, but our focus is on full-scale application development across multiple deployment targets. For this reason, prioritizing last-mile solutions like global export pollution makes sense because of the maintainability aspect during development time. ESM Imports already allow export remapping, and Doh modules are able to be "imported" in the same way as import() with Doh.load().

```javascript
Doh.Module('ParameterExample', [
    'await core-library',        // Loads first (Group 2)
    'await auth-system',         // Loads second (Group 2)
    'plugin-a',                  // Loads third (Group 3)
    'async analytics'            // Starts immediately (Group 1), but accessed differently
], function(plugin_a, auth, core) {  // Parameter order doesn't need to match load order!
    // Parameters are resolved by name from Doh.Globals, not by position
    // So auth refers to auth-system, core to core-library, etc.
    
    // Since Doh modules naturally export their imports to Doh.Globals
    // the actual resolution doesn't depend on load array ordering
    
    // Async dependencies are not resolvable by parameter name
    // and must be accessed from awaiting a later non-async Doh.load()
    const { analytics } = await Doh.load('analytics');
});
```

This system offers significant advantages:
- Reordering dependencies in the load array doesn't break your code
- Module names can differ from parameter names for readability
- Export handling becomes more consistent through Doh.Globals namespaces
- Modules can be more easily refactored without updating all dependents

```javascript
Doh.Module('LoadExample', [
    'async analytics',                 // Group 1: Starts loading immediately
    'await core-library',              // Group 2: First in await chain
    'await auth-system',               // Group 2: Second in await chain (after core-library)
    'plugin-a',                        // Group 3: Runs in parallel after all awaits complete 
    'plugin-b',                        // Group 3: Runs in parallel after all awaits complete
], function(auth, core, pluginA, pluginB) { // Order is flexible, resolved by name
    // Parameter resolution is by name matching to Doh.Globals, then globalThis
    // Not by position in the dependency array
    
    // Access async dependency from Doh.load dynamically
    // uses module loaded earlier (we remove the async here, 
    // but only because we want to wait on it in this case, 
    // other decorators still work as normal)
    const { analytics } = await Doh.load('analytics');
});
```

## Path Resolution

Doh provides flexible path resolution across environments:

| Path Syntax | Description | Example |
|-------------|-------------|---------|
| `/path` | Absolute path from Doh root | `'/components/Button.js'` |
| `^/path` | Relative to current file | `'^/utils/helpers.js'` |
| `./path` | Relative to current file | `'./utils/helpers.js'` |
| `http://` | Remote URL | `'https://cdn.example.com/lib.js'` |

### [DohPath](/docs/core/dohpath) Utilities

For complex path operations:

```javascript
// Create a context-aware path function
const DohPath = globalThis.DohPath.Overload(import.meta.url);

// Resolve paths relative to current file
const absolutePath = DohPath('^/utils/helpers.js');

// Convert to relative path
const relativePath = DohPath.Relative('/components/Button.js');
```

## Integration with Doh Architecture

The Load System is deeply integrated with other parts of the Doh architecture:

1. **[Packages](/docs/core/packages)**: Define dependency relationships using load statements
2. **[Modules](/docs/core/modules)**: Extend packages with runtime functions and parameter resolution
3. **[Auto-Packager](/docs/core/auto_packager)**: Analyzes dependencies and generates manifests
4. **[Patterns](/docs/patterns/patterns)**: Created and loaded within modules for component reuse
5. **[Dohballs](/docs/core/dohballs)**: Packaging and distribution of bundles containing modules

## Real-World Usage Patterns

### 1. Common Environment Branching Pattern

A typical pattern is to bifurcate functionality into common, browser, and server modules:

```javascript
// Main package with environment branching
Doh.Package('feature_name', {
  load: [
    // Common functionality
    'feature_name_common',
    // Environment-specific modules
    'browser?? feature_name_ui',
    'nodejs?? feature_name_server'
  ]
});

// Common functionality shared across environments
Doh.Module('feature_name_common', [], function(FeatureName) {
  // Create shared interface
  FeatureName = FeatureName || {};
  // ... shared implementation
  return FeatureName;
});

// Browser-specific implementation
Doh.Module('feature_name_ui', [
  'feature_name_common',
  'html'  // Browser-only dependency
], function(FeatureName) {
  // Add browser-specific functionality to shared object
});

// Server-specific implementation
Doh.Module('feature_name_server', [
  'feature_name_common',
  'express_router'  // Server-only dependency
], function(FeatureName, Router) {
  // Add server-specific functionality to shared object
  
  // Register API routes
  Router.AddRoute('/api/feature', function(data, req, res) {
    // API implementation
  });
});
```

### 2. Feature Flags and Configuration-Based Loading

Use pod configuration to enable/disable features:

```javascript
// Define configuration in pod.yaml or via Doh.Pod()
Doh.Pod('feature_name', {
  features: {
    advanced_ui: true,
    experimental: false
  }
});

// Use configuration in load statements
Doh.Module('feature_name', [
  // Base features
  'core_component',
  
  // Load based on feature flags
  'Doh.pod.features.advanced_ui?? advanced_ui',
  'Doh.pod.features.experimental?? experimental_feature',
  
  // Combine with environment conditions
  'browser&&Doh.pod.features.advanced_ui?? advanced_animations'
], function() {
  // Module implementation
});
```

## API Reference

### Core Methods

```javascript
// Load dependencies
const [ dep1, dep2 ] = await Doh.load(['dependency1', 'dependency2']);

// Reload dependencies (force cache refresh)
const [ mod, link ] = await Doh.reload(['updated-module', '/styles.css']);

// Define a module with dependencies
Doh.Module('ModuleName', ['dep1', 'dep2'], function(dep1, dep2) {
    // Module code
});

// Check load status with diagnostic info
Doh.loadstatus();
```

### Accessing Loaded Resources

```javascript
// View all loading attempts with parsed load statements
console.log(Doh.Loading); 

// Check if a dependency loaded successfully and access its value
if (Doh.Loaded['dependency-name']) {
    // Use the loaded resource (actual value or HTML element for scripts/styles)
    const resource = Doh.Loaded['dependency-name'];
}

// Access module exports
const moduleExports = Doh.Loaded['module-name'];

// Access globalized imports
const globalImport = Doh.Globals.importedName;
```

## Best Practices

1. **Use Environment Branching** - When modules share a file, use `browser??`, `nodejs??`, etc. to organize environment-specific code inline

2. **Structure Shared Functionality** - Create common modules with shared implementations that environment-specific modules extend

3. **Control Execution Flow** - Use `await` for critical dependencies that others depend on, but use sparingly to maintain performance

4. **Embrace Resilience** - Mark experimental or non-critical features as `optional` to prevent failures from breaking your application

5. **Limit Global Scope** - Use the `global` decorator sparingly to avoid namespace conflicts

6. **Specify Types Explicitly** - When loading resources that might be ambiguous, use `> type` to ensure correct handling

7. **Be Mindful of Parameter Names** - Since parameters are resolved by name from Doh.Globals, choose meaningful parameter names that match their exports

## Troubleshooting

### Common Issues

1. **Module Not Found** - Check if the module name is correct and that it's available in the current environment

2. **Loading Order Problems** - Use `await` for dependencies that are required by others

3. **Conditional Loading Issues** - Verify that your condition matches the current environment

4. **Path Resolution** - Ensure you're using the appropriate path format (`/`, `^/`, or `./`) for your context

5. **Stuck Loads** - Use `Doh.loadstatus()` to identify dependencies that aren't resolving

6. **Parameter Resolution Issues** - Ensure parameter names match the exports in Doh.Globals or consider using Doh.load directly

### Diagnosing Load Problems

```javascript
// Check the status of all loaded dependencies
Doh.loadstatus();

// Examine all attempted load statements and their parsed details
console.log(Doh.Loading);

// Examine specific dependency value after loading
console.log(Doh.Loaded['dependency-name']);
// OR await the load during loading (or if you are unsure)
console.log(await Doh.load('dependency-name'))

// Inspect module exports
console.log(Doh.Loaded['module-name']);
// OR await the load during loading (or if you are unsure)
console.log(await Doh.load('module-name'))

// Check parameter resolution sources
console.log(Doh.Globals);
```

## Related Documentation

- [Modules](/docs/core/modules) - Learn about the executable units built on top of the Load System
- [Packages](/docs/core/packages) - Understand how packages organize code and dependencies
- [Auto-Packager](/docs/core/auto_packager) - Explore how dependencies are analyzed and managed
- [Hot Module Replacement](/docs/core/hmr) - Discover how loaded resources can update in real-time
- [DohPath](/docs/core/dohpath) - Master path resolution across different environments
- [Dohballs](/docs/core/dohballs) - Learn about Doh's unique approach to code distribution