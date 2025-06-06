![Modules]({{Package:deploydoh_home}}/images/modules.png?size=small)

Modules in Doh are executable units of code that extend the Package concept by adding a runtime function (callback). While Packages define the structural organization and dependencies, Modules implement the actual behavior and functionality.

In the Doh architecture:
- **Packages** provide the foundation with dependency definitions and metadata
- **Modules** build on Packages by adding executable code and runtime behavior
- **Patterns** (defined within Modules) create reusable components and templates

A Module is essentially a Package with code, leveraging the same dependency system while adding execution logic.

## Relationship to Packages

Modules are directly tied to the Package system:

1. Every Module automatically creates a corresponding Package with the same name
2. Modules inherit all Package capabilities (load blocks, installation instructions, pod configuration)
3. Module dependencies use the same [Load System](/docs/core/load) as Package dependencies
4. The [Auto-Packager](/docs/core/auto_packager) manages both Packages and Modules through the same process

This integration means you can use `Doh.Module()` to define both a Package and its implementation in one step.

## Defining a Module

Modules are defined using the `Doh.Module` function:

```javascript
Doh.Module(moduleName, dependencies, callback);
```

- `moduleName`: A string identifying the module (becomes the Package name as well)
- `dependencies`: An optional array of dependency strings or a single dependency string
- `callback`: A function that defines the module's behavior, receiving globals as parameters

Example:

```javascript
Doh.Module('MyModule', ['dependency1', 'dependency2'], function(SharedObject) {
    // Module implementation using SharedObject
});
```

## Module Dependencies

Dependencies can be specified in several ways:

1. No dependencies:
   ```javascript
   Doh.Module('SimpleModule', function() {
       // No dependencies
   });
   ```

2. Single dependency as a string:
   ```javascript
   Doh.Module('SingleDependencyModule', 'dependency', function() {
       // Single dependency
   });
   ```

3. Multiple dependencies as an array:
   ```javascript
   Doh.Module('MultiDependencyModule', ['dep1', 'dep2'], function() {
       // Multiple dependencies
   });
   ```

### Dependency Types

Doh supports various types of dependencies, all using the [Load System](/docs/core/load):

1. Other Doh modules:
   ```javascript
   Doh.Module('ModuleA', ['ModuleB'], function() {
       // ModuleB is another Doh module
   });
   ```

2. ES modules:
   ```javascript
   Doh.Module('ESMUser', ['import { func } from "esm-module"'], function(func) {
       // func is imported from an ES module
   });
   ```

3. JavaScript files:
   ```javascript
   Doh.Module('ScriptUser', ['path/to/script.js'], function() {
       // script.js is loaded before this module
   });
   ```

4. CSS files:
   ```javascript
   Doh.Module('StyleUser', ['path/to/styles.css'], function() {
       // styles.css is loaded before this module
   });
   ```

### Advanced Load Statements

Modules leverage Doh's powerful [Load System](/docs/core/load) with decorators:

```javascript
Doh.Module('AdvancedModule', [
    // Standard module dependency
    'core-module',
    
    // ES module import 
    'import { component } from "ui-library"',
    
    // Await decorator - ensures this loads before subsequent dependencies
    'await critical-dependency',
    
    // Async decorator - starts loading immediately
    'async non-blocking-dependency',
    
    // Environment conditional - only loads in browser
    'browser?? browser-specific-module',
    
    // Environment conditional - only loads in Node.js
    'nodejs?? node-specific-module',
    
    // Configuration conditional - only loads in debug mode
    'config.debug?? debug-tools',
    
    // Explicit file type declaration
    'dynamic-content.php > js'
], function(component) {
    // Module implementation
});
```

For complete details on load decorators and syntax, see the [Load System](/docs/core/load) documentation.

## Environment Branching for Multi-Environment Modules

A key strength of Doh Modules is their ability to handle multiple environments efficiently. The most common pattern is to bifurcate a module into environment-specific implementations with shared common code:

```javascript
// Main package that branches by environment
Doh.Package('feature_name', {
  load: [
    // Common functionality shared across environments
    'feature_name_common',
    // Environment-specific implementations loaded conditionally
    'browser?? feature_name_ui',     // Only loads in browser environments  
    'nodejs?? feature_name_server'   // Only loads in Node.js environments
  ]
});

// Common module with functionality shared by all environments
Doh.Module('feature_name_common', [], function(FeatureName) {
  // Create shared interface
  FeatureName = FeatureName || {};
  
  // Add common utilities, data structures, and logic
  FeatureName.config = {
    // Shared configuration
  };
  
  FeatureName.utils = {
    // Common utility functions
    formatData: function(data) {
      // Implementation
    }
  };
  
  // Return the shared object for use by environment-specific modules
  return FeatureName;
});

// Browser-specific implementation
Doh.Module('feature_name_ui', [
  // Always load common functionality first
  'feature_name_common',
  // Browser-specific dependencies
  'html',
  '^/feature_name.css'
], function(FeatureName) {
  // Extend the shared object with browser-specific functionality
  FeatureName.renderUI = function(container) {
    // Browser-specific UI rendering
  };
  
  // Create DOM-related components
  FeatureName.components = {
    // Component implementations
  };
});

// Server-specific implementation
Doh.Module('feature_name_server', [
  // Always load common functionality first
  'feature_name_common',
  // Server-specific dependencies
  'express_router',
  'import fs from "fs-extra"'
], function(FeatureName, Router, fs) {
  // Add API routes
  Router.AddRoute('/api/feature', function(data, req, res) {
    // Handle API request
    const result = FeatureName.utils.formatData(data);
    Router.SendJSON(res, result);
  });
  
  // Add server-specific methods
  FeatureName.saveToFile = async function(data, path) {
    // Implementation using Node.js fs module
    await fs.writeFile(path, JSON.stringify(data));
  };
});
```

This pattern keeps code organized while ensuring that browser-specific code (like UI components) is only loaded in browsers, and server-specific code (like file system operations) is only loaded in Node.js.

## Globalization and Parameter Mapping

Doh uses a unique approach to handle module communication through a global shared scope:

1. **Globals Registry**: All shared objects are stored in `Doh.Globals` by name
2. **Parameter Injection**: Module callbacks receive parameters mapped to these globals
3. **Automatic Creation**: If a parameter isn't found in `Doh.Globals`, it's created as an empty object
4. **Singleton Behavior**: All modules referencing the same parameter name share the same object instance

This system:
- Eliminates the need for explicit exports in Doh modules
- Prevents repeated loading/parsing of modules
- Makes modules behave like singletons
- Enables cross-module communication without import/export complexity

Example:
```javascript
// ModuleA.js
Doh.Module('ModuleA', function(sharedObject) {
    // sharedObject is automatically created if it doesn't exist
    sharedObject.message = 'Hello from ModuleA';
});

// ModuleB.js
Doh.Module('ModuleB', ['ModuleA'], function(sharedObject) {
    // This is the SAME sharedObject instance from ModuleA
    console.log(sharedObject.message); // Outputs: "Hello from ModuleA"
});
```

### Parameter Resolution Process

It's important to understand that parameter resolution in Doh modules is based on name, not position. Here's how it works:

1. When a module is being initialized, the [Auto-Packager](/docs/core/auto_packager) examines the callback function's parameter names
2. For each parameter name, it searches for a matching object in the `Doh.Globals` namespace
3. If a matching object is found, it's passed to the callback in the corresponding parameter position
4. If no matching object is found, a new empty object is created in `Doh.Globals` and passed to the callback

This allows you to:
1. Define parameters in any order, regardless of dependency order
2. Use descriptive parameter names that may differ from module names
3. Share state between modules that use the same parameter names
4. Avoid explicit import/export statements

Example:
```javascript
// Note how parameter names (auth, core) don't match the dependency order
// The system resolves them by name from Doh.Globals
Doh.Module('ParameterExample', [
    'await core-library',  // Loads first
    'await auth-system',   // Loads second
    'plugin-a'             // Loads third
], function(plugin_a, auth, core) {
    // Parameters are resolved by name, not position:
    // - plugin_a maps to plugin-a
    // - auth maps to auth-system
    // - core maps to core-library
});
```

This globalization approach differs from traditional ES modules but offers significant advantages for large-scale applications with complex dependencies.

## Module Lifecycle

Modules follow a specific lifecycle managed by the Doh runtime:

1. **Definition**: When `Doh.Module` is called, registering the module with the system
2. **Dependency Resolution**: When the module is first required, triggering the loading of dependencies
3. **Execution**: When all dependencies are loaded and the callback function is invoked
4. **Completion**: When the callback execution finishes (for async callbacks, after the Promise resolves)
5. **Globalization**: When the module's parameters are fully established in the global scope

Only after a module's callback has completely finished execution is the module considered loaded, which may trigger other modules waiting on it.

## Asynchronous Modules

Modules can have asynchronous callbacks, allowing for `await` operations:

```javascript
Doh.Module('AsyncModule', async function(database) {
    // Initialize asynchronously
    database.connection = await establishDatabaseConnection();
    
    // Set up tables
    await database.createTablesIfNotExist();
    
    // Only after these async operations is the module considered loaded
});
```

## Dynamic Loading

Modules can dynamically load additional dependencies at runtime:

```javascript
Doh.Module('DynamicModule', async function(features) {
    // Core module functionality
    features.core = initializeCore();
    
    // Conditionally load additional features
    if (features.shouldEnableAdvanced) {
        // Dynamically load another module
        await Doh.load('advanced-feature-module');
        
        // Or load with decorators
        await Doh.load('browser?? browser-specific-features');
        
        features.advanced = initializeAdvancedFeatures();
    }
});
```

## Integration with Auto-Packager

The [Auto-Packager](/docs/core/auto_packager) deeply integrates with the Module system:

1. **Module Discovery**: It automatically scans for `Doh.Module()` calls in your codebase
2. **Dependency Analysis**: It builds a complete dependency graph for all modules
3. **Parameter Inspection**: It analyzes callback parameters to identify required globals 
4. **Manifest Generation**: It creates manifests listing modules, dependencies, and globals

This integration ensures:
- Correct load order for modules based on dependencies
- Proper initialization of global parameters
- Efficient bundling of related modules
- Consistent behavior across environments

## Cross-Environment Capability

Modules can adapt to different JavaScript environments using conditional dependencies and runtime checks:

```javascript
Doh.Module('CrossPlatformModule', [
    // Core dependencies for all environments
    'core-lib',
    
    // Browser-specific dependencies
    'browser?? dom-helpers',
    'browser?? styles/main.css',
    
    // Node.js-specific dependencies
    'nodejs?? fs-utilities',
    
    // Deno-specific dependencies
    'deno?? deno-specific-helper',
    
    // Bun-specific dependencies
    'bun?? bun-optimized-helper'
], function(coreFunctions) {
    // Environment-specific initialization
    if (IsBrowser()) {
        initializeBrowserFeatures();
    } else if (IsNode()) {
        initializeNodeFeatures();
        if (IsDeno()) {
            initializeDenoFeatures();
        } else if (IsBun()) {
            initializeBunFeatures();
        }
    }
    
    // Common functionality
    coreFunctions.initialize();
});
```

## Data Flow Between Environment-Specific Modules

When using the bifurcated pattern (common + environment-specific modules), it's important to understand how data flows between modules:

1. The common module typically creates and initializes a shared object
2. Environment-specific modules extend this shared object with specialized functionality
3. Data can flow in both directions through this shared object
4. Environment-specific modules never communicate directly with each other (they only exist in their respective environments)

Example workflow:
```javascript
// 1. Common module creates shared object (Doh auto-initializes unknown paramaters)
Doh.Module('feature_common', function(Feature) {
    
    // Define shared data structures
    Feature.data = {};
    
    // Define common methods
    Feature.initialize = function(config) {
        Feature.data.config = config;
    };
    
    return Feature;
});

// 2. Browser module extends with UI capabilities (Feature is known now, so Doh links it to the original)
Doh.Module('feature_browser', ['feature_common'], function(Feature) {
    // Add browser-specific method
    Feature.renderUI = function(container) {
        // Create UI based on Feature.data.config
    };
    
    // Listen for UI events that modify shared data
    Feature.onSubmit = function(formData) {
        // Update shared data
        Feature.data.userInput = formData;
    };
});

// 3. Server module extends with data persistence (And here again)
Doh.Module('feature_server', ['feature_common'], function(Feature) {
    // Add server-specific method
    Feature.saveData = function() {
        // Save Feature.data to database
    };
    
    // Process data submitted from browser
    Feature.processUserInput = function() {
        if (Feature.data.userInput) {
            // Process the data submitted from the browser
        }
    };
});
```

## Advanced Features

### Pattern Definition

Modules commonly define [Patterns](/docs/patterns/patterns), which are reusable component templates:

```javascript
Doh.Module('UIModule', function() {
    Pattern('Button', 'html', {
        moc: {
            click: 'method'
        },
        tag: 'button',
        html: 'Click me',
        click: function() {
            this.html = 'Clicked!';
        },
        html_phase: function(){
            this.e.on('click', this.click);
        }
    });
});
```

### Installation Requirements

Modules can specify installation requirements using `Doh.Install()`:

```javascript
Doh.Install('MyModule', {
    // NPM package dependency
    'npm:some-package': '^1.0.0',
});
```

### Pod Configuration

Modules can define configuration data using `Doh.Pod()`:

```javascript
Doh.Pod('MyModule', {
    // Module configuration
    options: {
        theme: 'light',
        features: ['search', 'filter']
    }
});
```

## Real-World Examples

### 1. Feature Module with Environment Branching

A typical feature module with environment-specific functionality:

```javascript
// Main package that branches by environment
Doh.Package('user_system', {
  load: [
    'user_common',               // Common user functionality
    'browser?? user_browser',    // Browser UI implementation
    'nodejs?? user_server'       // Server API implementation
  ]
});

// Common user functionality
Doh.Module('user_common', function(User) {
  User = User || {};
  
  // Shared data structures and validation logic
  User.validateEmail = function(email) {
    return /\S+@\S+\.\S+/.test(email);
  };
  
  User.validatePassword = function(password) {
    return password.length >= 8;
  };
  
  return User;
});

// Browser-specific implementation
Doh.Module('user_browser', [
  'user_common',
  'html',
  '^/styles/user.css'
], function(User) {
  // Add browser-specific UI functionality
  User.renderLoginForm = function(container) {
    const form = $('<form>').html(`
      <input type="email" id="email" placeholder="Email">
      <input type="password" id="password" placeholder="Password">
      <button type="submit">Login</button>
    `);
    
    form.on('submit', function(e) {
      e.preventDefault();
      
      const email = $('#email').val();
      const password = $('#password').val();
      
      if (User.validateEmail(email) && User.validatePassword(password)) {
        // Submit login request
        User.login(email, password);
      }
    });
    
    $(container).append(form);
  };
  
  User.login = function(email, password) {
    // Send login request to server
    $.post('/api/login', { email, password })
      .then(response => {
        if (response.success) {
          User.currentUser = response.user;
          // Trigger login event
          $(document).trigger('user:login', User.currentUser);
        }
      });
  };
});

// Server-specific implementation
Doh.Module('user_server', [
  'user_common',
  'express_router',
  'import bcrypt from "bcrypt"',
  'dataforge'
], function(User, Router, bcrypt) {
  // Set up user database
  User.db = df.Create('users');
  
  // Add server-specific API endpoints
  Router.AddRoute('/api/login', async function(data, req, res) {
    const { email, password } = data;
    
    if (!User.validateEmail(email) || !User.validatePassword(password)) {
      return Router.SendJSON(res, { 
        success: false, 
        error: 'Invalid email or password format' 
      });
    }
    
    // Look up user by email
    const user = await User.db.ops.Find({ email }).first();
    
    if (!user) {
      return Router.SendJSON(res, { 
        success: false, 
        error: 'User not found' 
      });
    }
    
    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    
    if (!passwordMatch) {
      return Router.SendJSON(res, { 
        success: false, 
        error: 'Invalid password' 
      });
    }
    
    // Create session
    req.session.userId = user.id;
    
    // Return success
    Router.SendJSON(res, { 
      success: true, 
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  });
});
```

### 2. Configuration-Based Modules

Using pod configuration to customize module behavior:

```javascript
// Define default configuration
Doh.Pod('feature_system', {
  features: {
    advanced: true,
    experimental: false
  },
  theme: 'light'
});

// Module that adapts based on configuration
Doh.Module('feature_system', [
  // Basic functionality
  'core_components',
  
  // Advanced features conditionally loaded based on configuration
  'Doh.pod.features.advanced?? advanced_features',
  
  // Experimental features conditionally loaded based on configuration
  'Doh.pod.features.experimental?? experimental_features',
], function(core) {
  // Initialize with configuration
  core.initialize(Doh.pod.features);
});
```

## Best Practices

1. **Single Responsibility**: Keep modules focused on a single responsibility or feature area
2. **Meaningful Names**: Use clear, descriptive names for modules and parameter names
3. **Smart Dependencies**: Use load decorators to optimize loading performance
4. **Environment Branching**: Use a common + environment-specific module pattern for cross-platform code
5. **Shared Objects**: Use shared parameter objects for communication between related modules
6. **Global Scope Hygiene**: Treat shared parameters carefully to avoid conflicts
7. **Async When Needed**: Use async modules for operations requiring initialization
8. **Parameter Documentation**: Document expected parameters and their structure
9. **Pattern Organization**: Group related patterns within a module
10. **Clear Module Boundaries**: Establish clear interfaces between modules

## Troubleshooting

Common issues and solutions:

1. **Module Not Loading**
   - Check for errors in the browser console or Node.js output
   - Use `Doh.loadstatus()` to see which modules are loaded and loading
   - Verify all dependencies are available and properly named

2. **Undefined Parameters**
   - Ensure the parameter is properly initialized by a dependency
   - Check if the module that should provide the parameter is loaded first
   - Verify the parameter name matches exactly between modules

3. **Load Order Issues**
   - Use `await` decorator for critical dependencies
   - Review the dependency order in your load block
   - Check the Auto-Packager manifest for unexpected dependency paths

4. **Cross-Environment Problems**
   - Use environment-specific conditional decorators
   - Implement environment checks in your module code
   - Test modules in all target environments

5. **Parameter Resolution Confusion**
   - Remember that parameters are resolved by name, not position
   - Use descriptive parameter names that match their corresponding modules
   - Check `Doh.Globals` to see what objects are available for parameter resolution

## Related Documentation

- [Load System](/docs/core/load) - Understanding the core dependency loading mechanism
- [Packages](/docs/core/packages) - The foundation of module dependency structure
- [Auto-Packager](/docs/core/auto_packager) - How modules are discovered and analyzed
- [Patterns](/docs/patterns/patterns) - Defining reusable components within modules
- [Pods](/docs/core/pods) - Configuration system for modules