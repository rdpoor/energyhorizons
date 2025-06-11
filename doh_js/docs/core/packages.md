![Packages]({{Package:deploydoh_home}}/images/packages.png?size=small)

In Doh, Packages serve as the fundamental organizational unit for code and dependencies. Unlike traditional JavaScript packages, Doh Packages are not physical collections of files, but rather abstract definitions that combine:

1. A unique name identifier
2. A load block defining dependencies
3. Optional metadata (installations, pod configuration, CLI commands)

This approach separates the logical organization of code (Packages) from the physical organization (files and directories), providing greater flexibility and modularity.

## The Central Role of Packages

Packages form the backbone of Doh's architecture:

- They define the dependency graph of your application
- They enable conditional and environment-specific code loading
- They integrate with the [Auto-Packager](/docs/core/auto_packager) for manifest generation
- They are used to create distributable units ([Dohballs](/docs/core/dohballs))
- They serve as the foundation for [Modules](/docs/core/modules), which extend them with runtime functions

## Package Definition Methods

### 1. *.doh.yaml Files

The most declarative way to define packages is through YAML configuration files:

```yaml
package_name:
  load:
    - dependency1
    - dependency2
  install:
    - npm:some-module
  version: 1.0.0
  pod:
    key: value

another_package:
  load:
    - another-dependency
  version: 0.5.0
```

The [Auto-Packager](/docs/core/auto_packager) automatically discovers these files and processes them. Key features:
- Each root-level key defines a separate package
- Multiple packages can be defined in a single file
- Any file with a `.doh.yaml` extension will be recognized

### 2. Doh.Package() Function

For programmatic package definition, use the `Doh.Package()` function:

```javascript
Doh.Package('package_name', {
    load: ['dependency1', 'dependency2'],
    install: ['npm:some-module']
});
```

This function serves as an abstraction layer that makes it possible to define packages in js files and modules. Other metafunctions like `Doh.Pod(package_name, pod)`, `Doh.CLI(package_name, cli_settings)`, and `Doh.Install(package_name, dep_list)`, can also be used alongside `Doh.Package()` definitions.

### 3. Simple String Definition (in YAML)

For packages with simple dependencies, you can use a shorthand notation in YAML:

```yaml
simple_package: 'dependency_package' 
```

This is equivalent to:

```yaml
simple_package:
  load:
    - dependency_package
```

## Package Components

### Load Block

The core component of every package is its load block, which defines dependencies:

```javascript
load: [
    'dependency1',               // Basic dependency
    'await dependency2',         // Awaited dependency (loads before subsequent deps)
    'async dependency3',         // Asynchronous loading (starts immediately)
    'browser?? browser-only-dep', // Conditional dependency (browser environments only)
    'nodejs?? node-only-dep',     // Environment-specific dependency
    'import { func } from "es-module"', // ES module import
    'path/to/script.js',         // Direct file loading
    'styles/main.css'            // CSS loading
]
```

The load block supports a rich set of decorators and syntax for fine-grained control over dependency loading:

1. **Timing Decorators**: `await` and `async` control the loading sequence
2. **Conditional Decorators**: Environment checks like `browser??` and `nodejs??`
3. **Complex Conditions**: `config.debug&&!production??` for configuration-based loading
4. **Type Specification**: `file.php > css` for explicit resource type declaration

For complete details, see the [Load System](/docs/core/load) documentation.

## Environment Branching with Packages

Environment branching is a key capability of the Doh Package system. It allows you to define different dependencies for different environments within a single package definition:

```javascript
// Define a package with environment-specific dependencies
Doh.Package('cross_platform_feature', {
  load: [
    // Common dependencies loaded in all environments
    'core_utilities',
    'data_models',
    
    // Browser-specific dependencies
    'browser?? ui_components',
    'browser?? styles/main.css',
    
    // Node.js-specific dependencies
    'nodejs?? server_api',
    'nodejs?? import fs from "fs-extra"',
    
    // Configuration-based loading
    'Doh.pod.analytics?? analytics_module',
    
    // Combined conditions
    'browser&&Doh.pod.debug?? debug_tools'
  ]
});
```

### Bifurcated Package Pattern

A common pattern for cross-platform features is to create a "bifurcated" package structure that branches into environment-specific implementations:

```javascript
// Main package that branches by environment
Doh.Package('feature_name', {
  load: [
    // Common functionality shared across environments
    'feature_name_common',
    
    // Environment-specific implementations
    'browser?? feature_name_ui',      // Only loads in browsers
    'nodejs?? feature_name_server'    // Only loads in Node.js
  ]
});
```

This pattern allows you to:
1. Share common code across environments
2. Keep environment-specific code separate
3. Ensure environment-specific dependencies are only loaded when needed
4. Organize related functionality under a single package namespace

### Installation Instructions

Packages can define installation requirements:

```javascript
install: {
  'npm:package-name': 'version',  // NPM package dependency
}
```

These instructions are processed by the [Auto-Packager](/docs/core/auto_packager) to ensure all requirements are met when the package is installed.

### Pod Configuration

Packages can include pod configuration data:

```javascript
pod: {
    key: 'value',
    nested: {
        config: true
    }
}
```

This data is merged into the global pod configuration and can be accessed via `Doh.pod.key`. Placing your keys in a container is preferred.

### CLI Commands

Packages can register CLI commands:

```javascript
cli: {
    'command-name': {
      file: 'path/to/script.js',
      help: 'description of command'
    }
}
```

These commands become available through the Doh CLI system.

## Relationship to Modules

A [Module](/docs/core/modules) in Doh is an extension of a Package that adds a callback function:

```javascript
Doh.Module('module_name', ['dependency1', 'dependency2'], function() {
    // Module code here
});
```

Modules inherit all the capabilities of Packages but add execution logic:
- They use the same dependency resolution system
- They support the same load decorators and syntax
- They integrate with the [Auto-Packager](/docs/core/auto_packager) in the same way

For complete details, see the [Module](/docs/core/modules) documentation.

## Integration with Auto-Packager

The [Auto-Packager](/docs/core/auto_packager) automatically:

1. Discovers package definitions (in .doh.yaml files and JavaScript files)
2. Resolves the dependency graph
3. Detects conflicts and cyclic dependencies
4. Generates package manifests
5. Creates Dohballs for distribution

This integration enables:
- Zero-configuration package management
- Automatic dependency resolution
- Build-time package validation
- Runtime package optimization

For complete details, see the [Auto-Packager](/docs/core/auto_packager) documentation.

## Package Resolution and Loading

When a package is requested (either directly or as a dependency):

1. The Doh runtime looks up the package definition in the manifest
2. The load block is processed, and dependencies are resolved
3. Each dependency is loaded according to its type and decorators
4. Once all dependencies are satisfied, the package is considered loaded
5. If the package has an associated module function, it is executed

This process is handled transparently by the Doh runtime, making dependency management seamless.

## Real-World Package Examples

### 1. Cross-Platform Feature with Shared Code

```javascript
// Main package with environment branching
Doh.Package('user_management', {
  load: [
    // Common functionality
    'user_management_common',
    
    // Environment-specific implementations
    'browser?? user_management_ui',
    'nodejs?? user_management_server'
  ]
});
```

This pattern creates a unified namespace for a feature while keeping environment-specific implementations separate.

### 2. Feature Flags and Configuration

```javascript
// Define configuration in pod.yaml or via Doh.Pod()
Doh.Pod('feature_system', {
  features: {
    advanced: true,
    experimental: false
  }
});

// Package that uses configuration-based loading
Doh.Package('feature_system', {
  load: [
    // Core functionality
    'feature_core',
    
    // Conditional features based on configuration
    'config.features.advanced?? advanced_features',
    'config.features.experimental?? experimental_features',
    
    // Combine with environment conditions
    'browser&&config.features.advanced?? advanced_ui'
  ]
});
```

This approach allows features to be enabled or disabled through configuration without code changes.

### 3. NPM Integration Package

```javascript
// Package that wraps an NPM module for use in Doh
Doh.Package('chart_library', {
  // Installation requirements
  install: {
    'npm:chart.js': '^3.0.0'
  },
  
  // Load the module with environment branching
  load: [
    // Browser: Load from ESM.sh
    'browser?? global import Chart from "chart.js"',
    
    // Node.js: Direct import
    'nodejs?? import Chart from "chart.js"'
  ]
});
```

This pattern makes external NPM packages available as Doh packages with proper environment handling.

## Dohballs vs. Packages vs. Modules

It's important to distinguish between Packages and Dohballs:

- **Dohballs**: Physical, versioned distribution units containing entire folders containing packages
- **Packages**: Abstract definitions of names, dependencies, and metadata
- **Modules**: Packages with a callback function that accepts scope parameters

A Dohball might contain multiple Package definitions, but the Package itself is not the collection of files—it's the abstract definition that is bundled into Dohballs.

## Multiple Packages in a Single File

Doh encourages defining multiple packages in the same file:

```javascript
// Package definition
Doh.Package('Package1', {
    load: ['dep1', 'dep2']
});

// Module definition (a package with a function)
Doh.Module('Module1', ['Package1'], function() {
    // Module code
});

// Another package definition
Doh.Package('Package2', {
    load: ['dep4', 'dep5', 'Module1']
});
```

This approach allows for organized, modular code without necessitating separate files for each package or module.

## Processing Flow for Packages

When the [Auto-Packager](/docs/core/auto_packager) processes package definitions:

1. **Discovery Phase**: Finds package definitions in `.doh.yaml` files, `Doh.Package()` calls, and `Doh.Module()` calls
2. **Parsing Phase**: Extracts dependencies and other package metadata
3. **Resolution Phase**: Builds the dependency graph and resolves environment-specific branches
4. **Validation Phase**: Checks for cyclic dependencies and conflicts
5. **Manifest Phase**: Generates package manifests for runtime use
6. **Dohball Phase**: Optionally packages the code for distribution (bake)

During runtime loading, the Doh [Load System](/docs/core/load) handles:

1. **Request Phase**: A package is requested via `Doh.load()` or as a dependency
2. **Lookup Phase**: The package definition is found in the manifest
3. **Conditions Phase**: Conditions are evaluated to determine which dependencies to load
4. **Loading Phase**: Dependencies are loaded according to their type and decorators
5. **Completion Phase**: The package is marked as loaded when all dependencies are satisfied

## Best Practices

1. **Granular Packages**: Create focused packages with clearly defined purposes
2. **Thoughtful Dependencies**: Only include necessary dependencies in load blocks
3. **Conditional Branching**: Use conditional decorators to separate environment-specific code
4. **Bifurcation Pattern**: Follow the common-plus-specifics pattern for cross-platform features
5. **Descriptive Names**: Use meaningful, consistent naming conventions
6. **YAML for Configuration**: Use .doh.yaml for declarative package definitions. (Packages can only be defined once and cannot be used to extend or redefine modules)
7. **JavaScript for Logic**: Use Doh.Module() when packages need associated code (Modules count as packages and cannot be used to extend or redefine packages)
8. **Smart Organization**: Group related packages in the same file or directory
9. **Dependency Management**: Leverage load decorators for optimal loading performance
10. **Configuration Awareness**: Use pod configuration to control feature loading

## Troubleshooting

1. **Package Not Found**
   - Check the package name and path
   - Ensure it's defined correctly with `Doh.Package()` or in a `.doh.yaml` file
   - Run `doh update` to refresh manifests

2. **Dependency Not Loading**
   - Verify the dependency exists and is spelled correctly
   - Check conditional decorators to ensure they match the current environment
   - Use `Doh.loadstatus()` to see what's loaded and what's missing

3. **Environment-Specific Issues**
   - Verify conditional decorators (`browser??`, `nodejs??`) are correctly applied
   - Test in each target environment to confirm behavior
   - Use environment detection functions (`IsBrowser()`, `IsNode()`) to handle edge cases

## Comparison to Traditional Package Systems

Unlike traditional package systems (npm, yarn, etc.), Doh Packages:

1. **Focus on Load-Time Behavior**: They primarily define what should be loaded and how
2. **Are Abstract Definitions**: They don't represent physical file structures
3. **Support Rich Loading Controls**: They offer fine-grained control over when and how dependencies load
4. **Enable Cross-Environment Compatibility**: They work consistently across Node.js, browsers, Deno, and Bun
5. **Integrate Deeply with the Framework**: They connect directly to the runtime and Auto-Packager

## Related Documentation

- [Load System](/docs/core/load) - Understanding the dependency loading mechanism
- [Modules](/docs/core/modules) - Extending packages with runtime functions
- [Auto-Packager](/docs/core/auto_packager) - How packages are discovered and processed
- [Dohballs](/docs/core/dohballs) - Packaging and distribution of bundles
- [Pods](/docs/core/pods) - Configuration system for packages