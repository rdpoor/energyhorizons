![Pods]({{Package:deploydoh_home}}/images/Pods.png?size=small)

Pods are a powerful configuration and inheritance system in Doh that serves as the backbone for application settings, [module](/docs/core/modules) configuration, and environment-specific configurations. The Pod system allows for sophisticated configuration management across different environments with support for inheritance, type validation, and secure separation of sensitive data.

This guide covers:
* Core concepts of pod files and hierarchy
* Type safety with MOC validation
* Pod system components and namespaces
* Boot process and configuration loading
* Host load configuration
* Pod caching and manifests
* CLI commands for pod management
* Pod dashboard and monitoring

## Core Concepts

### Pod Files

The Pod system revolves around several key files:

1. **boot.pod.yaml**: The application-level settings file that defines which [modules](/docs/core/modules) to load on startup and core application configuration. This file should be version controlled and contains shared application settings.

2. **pod.yaml**: The local developer settings file, typically nearly empty and used for environment-specific overrides like local hosting configurations or staging setups. This file is usually ignored in version control.

3. **Module Pods**: Module-specific configuration defined through `Doh.Pod()` calls, stored in [manifest](/docs/core/manifests) files.

### Pod Hierarchy and Inheritance

Pods implement a flexible inheritance model using the `inherits` property:

```yaml
inherits:
  - /path/to/base.pod.yaml
  - https://example.com/shared.pod.yaml
  - /pods/custom-config.pod.yaml
```

This allows for configuration composition where settings cascade from base configurations to more specific ones. The inheritance chain is resolved using the `build_pod` function, which processes all inherited pods recursively.

### Pod Namespaces

Pods maintain two primary namespaces:

1. **Doh.pod**: The complete pod configuration, including server-only settings, available only in Node.js environments.

2. **Doh.browser_pod**: A subset of pod settings that are safe to expose to browser clients. In browser environments, `Doh.pod` is equivalent to `Doh.browser_pod`.

## Type Safety with MOC

The Pod system uses Melded Object Composition (MOC) to provide type safety for configuration values. The `moc` property in a pod defines type validation for its properties:

```yaml
moc:
  apiUrl: 'IsString'
  timeout: 'IsNumber'
  retries: 'IsInt'
  settings: 
    debug: 'IsBoolean'
    logLevel: 'IsString'
```

This ensures that configuration values conform to expected types and can be validated at runtime. All MOC validation operators are available for pod configuration, including composite types and validation rules.

## Pod System Components

### Doh.pod

The global object containing all pod settings merged from boot.pod.yaml, pod.yaml, and module pods. It is the primary way to access configuration values in server-side code:

```javascript
const port = Doh.pod.express_config.port;
const apiKey = Doh.pod.api_keys.service_name;
```

### Doh.browser_pod

A subset of `Doh.pod` that contains only browser-safe configuration values. This is made available to browser clients and excludes sensitive server-only configuration:

```javascript
// In Node.js, both are available
console.log(Doh.pod.private_setting);      // Available
console.log(Doh.browser_pod.api_endpoint); // Available

// In browser, only browser_pod settings are available
console.log(Doh.pod.api_endpoint);         // Available in browser
console.log(Doh.pod.private_setting);      // Undefined in browser
```

### Doh.Pod()

A function to define [module](/docs/core/modules)-specific pod configuration:

```javascript
Doh.Pod('my_module', {
  moc: {
    setting1: 'IsString',
    setting2: 'IsNumber'
  },
  setting1: 'default value',
  setting2: 100,
  
  // Browser-safe settings
  browser_pod: {
    publicUrl: '/api/module'
  }
});
```

These module pods are merged into the main pod configuration and follow the same inheritance rules.

## The Boot Process

When Doh starts, it processes pod files in a specific order:

1. Loads core defaults from `/doh_js/default.pod.yaml`
2. Loads [module](/docs/core/modules)-specific pods from `Doh.Pod()` definitions
3. Loads application settings from `/boot.pod.yaml`
4. Loads local environment settings from `/pod.yaml`
5. Compiles everything into a unified `Doh.pod` object

This process ensures that local settings override application settings, which override defaults.

## host_load Configuration

The `host_load` property in pods defines which [packages](/docs/core/packages) should be automatically loaded when the application starts:

```yaml
host_load:
  - user_routes
  - socket_handler
  - api_module
  - dashboard
```

This provides a declarative way to define your application's entry points without needing to manually [load](/docs/core/load) modules in code.

## Pod Caching and Manifests

The Pod system uses several [manifest](/docs/core/manifests) files to optimize performance:

1. **/.doh/manifests/pod_manifest.json**: Contains module pod settings compiled from `Doh.Pod()` calls
2. **/doh_js/manifests/browser_pod.json**: Contains browser-safe pod settings
3. **/.doh/compiled.pod.yaml**: A cache of the full compiled pod

These files are automatically managed by the Doh runtime and can be cleared with [CLI](/docs/tools/cli) commands when needed.

## CLI Commands for Pod Management

Doh provides several [CLI](/docs/tools/cli) commands for managing pod configurations:

### View Pod Values
```bash
node doh pod express_config.port  # Show value and inheritance
```

### Manage Inheritance
```bash
# Add inheritance
node doh inherits /path/to/pod.yaml

# Remove inheritance
node doh inherits ~~/path/to/pod.yaml
```

### Manage Host Load
```bash
# Add packages to host_load
node doh host_load package1 package2

# Remove packages from host_load
node doh host_load ~~package1 ~~package2
```

### Cache Management
```bash
# Clear pod cache
node doh clear-pod

# Clear all caches
node doh clear-all
```

## Pod Dashboard

The `pod_dashboard` module (if included in your application) provides a web interface for managing pod settings. It allows:

1. Viewing the full pod hierarchy
2. Editing pod values
3. Visualizing inheritance relationships
4. Testing MOC validation rules

Access it at `/admin/pods` in your application (with proper authentication).

## Integration with MOC System

Pod validation leverages the full power of Doh's MOC system, allowing for sophisticated validation rules:

```yaml
moc:
  # Basic Types
  stringValue: 'IsString'
  numberValue: 'IsNumber'
  
  # Composite Types
  configObject: 
    enabled: 'IsBoolean'
    level: 'IsInt'
    name: 'IsStringAndHasValue'
    
  # Advanced Validation
  domains: ['IsArray', 'NotNull']
  timeout: ['IsNumber', 'NotNull']
  database:
    url: 'IsKeySafe'
    maxConnections: 'IsIntOrFalse'
```

This validation ensures configuration correctness and helps prevent runtime errors.

## Pod Security Best Practices

1. **Separate Sensitive Data**: Keep API keys, database credentials, and other sensitive information in separate pod files that are ignored in version control.

2. **Use Browser_Pod Carefully**: Only expose data to the browser that is truly necessary for client-side functionality.

3. **Validate with MOC**: Always define MOC validation rules for your configurations to catch errors early.

4. **Structure Inheritance Wisely**: Create logical layers of pod files:
   - Core application settings (boot.pod.yaml)
   - Environment-specific settings (prod.pod.yaml, dev.pod.yaml)
   - Local overrides (pod.yaml - not version controlled)

5. **Use Path References**: For file paths in pod settings, use relative paths with [`DohPath()`](/docs/core/dohpath) in code to ensure cross-platform compatibility.

## Example Pod Structure

### Application Settings (boot.pod.yaml)
```yaml
inherits:
  - /pods/app-defaults.pod.yaml

host_load:
  - user_routes
  - api_service
  - dashboard

app_version: '1.2.0'
app_name: 'My Doh Application'

express_config:
  port: 3000
  
browser_pod:
  api_base: '/api/v1'
  app_name: 'My Doh Application'
```

### Local Settings (pod.yaml)
```yaml
inherits:
  - /pods/localhost.pod.yaml
  - /pods/dev-secrets.pod.yaml

express_config:
  port: 4000  # Override the default port
  
debug_mode: true
```

### Module Configuration (via Doh.Pod())
```javascript
Doh.Pod('user_module', {
  moc: {
    user_settings: {
      max_sessions: 'IsInt',
      default_role: 'IsString'
    }
  },
  user_settings: {
    max_sessions: 5,
    default_role: 'user'
  },
  browser_pod: {
    login_url: '/auth/login'
  }
});
```