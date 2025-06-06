![Resolution Order]({{Package:deploydoh_home}}/images/resolution-order.png?size=small)

**Resolution Order is the *unifying algorithm* of Doh's architecture**. It implements a hybrid multi-inheritance system that works consistently across Packages, Modules, Patterns, and Pods. This unified approach creates a cohesive framework where inheritance and dependency resolution follow the same fundamental principles regardless of context.

Unlike traditional inheritance systems that use either single inheritance (like Java) or class-based multiple inheritance (like C++), Doh's approach is more flexible and dynamic, drawing inspiration from both dependency injection systems and prototype-based inheritance.

## Core Resolution Principles

### Fundamental Rules

Doh's resolution algorithm is governed by four key principles:

1. **Multiple Inheritance**: All Doh systems can inherit from or depend on multiple sources simultaneously
2. **Last Wins Priority**: Later declarations generally override earlier ones
3. **Conditional Inclusion**: Dependencies or inheritance can be conditional based on other requirements
4. **Dynamic Resolution**: The resolution chain can be modified at runtime

These principles create a unified model that applies consistently whether you're working with pattern inheritance, module dependencies, or pod configuration.

### Universal Resolution Process

All resolution in Doh follows these general steps:

1. **Identification**: Determine the inheritance/dependency sources from explicit declarations
2. **Expansion**: Recursively resolve the complete dependency tree
3. **Conditional Resolution**: Apply conditional rules (soft dependencies, environment conditions)
4. **Order Determination**: Establish the final resolution order
5. **Application**: Apply the resolution chain according to context-specific rules

This process creates a flattened, ordered list that determines how properties, methods, configurations, or dependencies are resolved.

## Resolution Order Across Doh Systems

### 1. Load System (Dependencies)

The Load System manages how dependencies are resolved and loaded, ensuring they're available in the correct order.

#### Algorithm Implementation

The dependency resolution algorithm is implemented through `Doh.expand_dependencies`:

```javascript
Doh.expand_dependencies = function(dep, packages = Doh.Packages) {
    // Recursively expands dependencies to ensure correct load order
}
```

This function is called internally by `Doh.load()`, which is the universal entry point for loading any dependency:

```javascript
// Load a single dependency
await Doh.load('dependency-name');

// Load multiple dependencies
await Doh.load(['dep1', 'dep2', 'dep3']);
```

#### Key Features

- **Recursive Expansion**: Dependencies of dependencies are automatically resolved
- **Circular Detection**: The algorithm identifies and prevents circular dependencies
- **Conditional Loading**: Environment-specific dependencies are conditionally included
- **Asynchronous Flow Control**: Supports both synchronous and asynchronous loading patterns

#### Resolution Order Example

```javascript
Doh.Module('FeatureModule', [
    'core',               // Loaded first (and its dependencies)
    'await database',     // Loaded next and waited for
    'async utilities',    // Started loading in parallel
    'browser?? ui-tools'  // Conditionally loaded in browser environments
], function(shared) {
    // Module implementation
});
```

The resolution algorithm ensures these dependencies are loaded in the correct order, respecting both explicit decorators and implicit dependencies.

### 2. Pod System (Configuration)

The Pod system determines how configuration inheritance works, allowing for sophisticated configuration hierarchies.

#### Algorithm Implementation

Pod inheritance is handled by the `build_pod` function:

```javascript
Doh.build_pod = async function(podLocation) {
    // Resolves pod inheritance chain and merges configuration objects
}
```

#### Key Features

- **Recursive Inheritance**: Pod files can inherit from other pod files, which themselves inherit
- **Deep Merging**: Configuration objects are deeply merged based on resolution order
- **Environment Awareness**: Supports different configurations for different environments
- **Override Control**: Later pod files override earlier ones in the inheritance chain

#### Resolution Order Example

```yaml
# pod.yaml
inherits:
  - base_config.yaml
  - environment/development.yaml
  - feature/authentication.yaml

# Custom overrides
database:
  host: localhost
  port: 5432
```

Resolution order:
1. `base_config.yaml` (and its inheritance chain)
2. `environment/development.yaml` (and its inheritance chain)
3. `feature/authentication.yaml` (and its inheritance chain)
4. Local pod properties (overriding previous values)

### 3. Pattern System (Melded Object Composition)

The Pattern system provides the most sophisticated implementation of resolution order, handling complex inheritance relationships with conditional rules.

#### Algorithm Implementation

The Pattern resolution is implemented through:

```javascript
Doh.extend_inherits = function(inherits, skip_core = false) {
    // Expands the inheritance tree
}

Doh.resolve_inherits_hardening = function(extended, inherits, skip_core) {
    // Resolves conditional inheritance and hardening
}
```

#### Key Features

- **Hard vs. Soft Inheritance**: Distinguishes between guaranteed and conditional inheritance
- **Inheritance Hardening**: Converts soft dependencies to hard when conditions are met
- **Nested Conditions**: Supports complex conditional inheritance rules
- **Method Melding**: Determines how methods from different patterns are combined

#### Inheritance Types

1. **Hard Inheritance (true)**: Pattern will always be included
   ```javascript
   inherits: { 
       BasePattern: true  // Always included
   }
   ```

2. **Soft Inheritance (false)**: Pattern will only be included if required elsewhere
   ```javascript
   inherits: { 
       OptionalPattern: false  // Conditionally included
   }
   ```

3. **Conditional Inheritance (object)**: Pattern will be included based on complex conditions
   ```javascript
   inherits: { 
       ConditionalPattern: {  // Included only if DepPattern is also included
           DepPattern: true
       }
   }
   ```

#### Resolution Order Example

```javascript
Pattern('AdvancedComponent', {
    inherits: {
        BaseComponent: true,          // Hard inheritance
        UIComponent: true,            // Hard inheritance
        DraggableComponent: false,    // Soft inheritance
        ResizableComponent: {         // Conditional inheritance
            DraggableComponent: true  // If ResizableComponent is included, include DraggableComponent
        }
    }
});

Pattern('SpecializedComponent', 'AdvancedComponent', {
    inherits: {
        ResizableComponent: true      // Hard inheritance, triggers conditional inheritance
    }
});
```

Resolution for `SpecializedComponent`:
1. `object` (implicit base)
2. `BaseComponent`
3. `UIComponent`
4. `DraggableComponent` (included due to ResizableComponent)
5. `ResizableComponent`
6. `AdvancedComponent`
7. `SpecializedComponent`

### 4. Module System (Load and Execution)

Modules combine dependency resolution with execution order management.

#### Algorithm Implementation

Module loading is handled by `Doh.load()`:

```javascript
// Load a module
await Doh.load('module-name');

// Load multiple modules
await Doh.load(['module1', 'module2']);
```

#### Key Features

- **Dependency-Based Loading**: Module load order is determined by dependencies
- **Parameter Globalization**: Maps callback parameters to global objects
- **Asynchronous Execution**: Supports both sync and async module callbacks
- **Conditional Loading**: Supports environment-specific module activation

#### Resolution Implications

The module resolution order affects:
1. **Code Execution Sequence**: Which module code runs before others
2. **Global Object Population**: How shared objects are initialized
3. **Pattern Availability**: When patterns become available for instantiation

## Cross-System Integration

What makes Doh's resolution system truly powerful is how these separate systems interact:

### Pattern Inheritance → Object Construction

```javascript
const myComponent = New('SpecializedComponent', {
    // Properties
});
```

The pattern resolution order controls:
- Which properties and methods the object inherits
- How methods are melded together
- The sequence of phase method execution

### Module Dependencies → Pattern Availability

```javascript
Doh.Module('UIModule', ['BaseComponents'], function() {
    // Can safely use patterns defined in BaseComponents
    Pattern('CustomButton', 'Button', {
        // Button is defined in BaseComponents
    });
});
```

### Pod Inheritance → Module Configuration

```yaml
# In pod.yaml
DatabaseModule:
  connection: 
    host: production-db.example.com
```

These configurations are accessible in modules:
```javascript
Doh.Module('DatabaseModule', function() {
    const config = Doh.pod.DatabaseModule.connection;
    // Use configuration
});
```

## Benefits of Unified Resolution

Doh's unified resolution approach provides key advantages:

### 1. Consistent Mental Model

Developers learn one core resolution algorithm that works across all Doh systems.

### 2. Predictable Overrides

The "last wins" principle creates consistent override behavior in all contexts.

### 3. Flexible Composition

All systems support multiple inheritance/dependencies with conditional inclusion.

### 4. Seamless Cross-System Integration

The unified model allows different systems to work together coherently.

## Practical Applications

### Building Extensible Component Libraries

```javascript
// Base component
Pattern('Component', {
    // Core functionality
});

// Feature components
Pattern('DraggableComponent', {
    // Dragging functionality
});

Pattern('ThemeableComponent', {
    // Theming functionality
});

// Composed component
Pattern('AdvancedComponent', {
    inherits: {
        Component: true,
        DraggableComponent: true,
        ThemeableComponent: true
    },
    // Additional functionality
});
```

### Environment-Specific Configuration

```yaml
# base.yaml
database:
  driver: postgres
  timeout: 30

# development.yaml
inherits:
  - base.yaml
database:
  host: localhost
  debug: true

# production.yaml
inherits:
  - base.yaml
database:
  host: production-db.example.com
  pool_size: 20
```

## Conclusion

Doh's resolution algorithm represents a fundamental innovation in how inheritance and dependency systems can be unified. By applying the same core principles across different contexts—from dependency loading to object composition—Doh creates a consistent, powerful, and flexible framework.

This unified approach enables sophisticated patterns like dynamic composition, conditional inheritance, and feature-based customization throughout the framework.

For more detailed information on specific aspects:
- [Patterns in Doh](/docs/patterns/patterns) - For more on pattern definition and usage
- [Object in Doh](/docs/patterns/object) - For details on the fundamental pattern
- [Load System in Doh](/docs/core/load) - For dependency loading details
- [Melded Object Composition](/docs/patterns/moc) - For details on property melding strategies
- [Modules in Doh](/docs/core/module) - For information on module definition and loading 