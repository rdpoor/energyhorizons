# The `object` Pattern: Foundation of Doh Instances

![Objects]({{Package:deploydoh_home}}/images/objects.png?size=small)

The `object` pattern is the **base pattern** or **root pattern** that all other Doh [Patterns](/docs/patterns/patterns) implicitly inherit from. It provides the essential functionality required for **object instance creation** (`New()`) and management, including inheritance resolution, lifecycle phase management, and the automatic building of child objects (sub-object-building).

This guide covers:
*   How **object instances** are created from ideas using the `object` pattern as a base.
*   The core features provided by the `object` **base pattern**.
*   Integration with the **object lifecycle** and phase engine.
*   How the **sub-object-builder** system is enabled by the `object` pattern.
*   Understanding parent-child relationships in constructed **object instances**.

## `object` Pattern in Context

The `object` pattern sits at the intersection of several key Doh systems:

1. **Pattern System**: `object` is the root pattern that all other patterns ultimately extend
2. **Inheritance System**: `object` provides the basic inheritance mechanisms
3. **Object Lifecycle**: `object` establishes the phase execution system
4. **Sub-Object-Builder**: `object` implements the auto-building functionality

This integration creates a cohesive foundation for Doh's component architecture.

## From Ideas to Objects

### The Creation Process

In Doh, objects are created from "ideas," which are plain JavaScript object literals. This transformation occurs through the `New()` function:

```javascript
// Define an idea
let buttonIdea = {
    text: 'Click Me',
    onClick: function() {
        console.log('Button clicked!');
    }
};

// Create a Doh object using the 'object' pattern
let buttonObject = New('object', buttonIdea);
```

This process involves:

1. Resolving the inheritance chain (in this case, just the 'object' pattern)
2. Melding properties from the pattern and idea using MOC rules
3. Executing phase methods in sequence (primarily `object_phase` and `builder_phase`)
4. Returning the fully constructed object

### Internal Structure

After construction, a Doh object has several key internal properties:

- **inherits**: An array listing all patterns in the inheritance chain
- **inherited**: An object containing references to each inherited pattern
- **moc**: The MOC definition controlling property behavior
- **machine**: A function to advance the object through its lifecycle phases
- **object_phase**: Doh's 'init' method
- **builder_phase**: represents this object's phase as an sub-object-builder of children objects

```javascript
// Internal structure (simplified)
buttonObject = {
    // User-defined properties from the idea
    text: 'Click Me',
    onClick: function() { console.log('Button clicked!'); },
    
    // Internal properties (normally not enumerable)
    inherits: ['object'],
    inherited: {
        object: { /* reference to object pattern */ },
        idea: { /* reference to original idea */ }
    },
    moc: { /* melded MOC definitions */ },
    machine: function(phase) { /* phase control function */ }
    object_phase: function() { /* melded method executor */ }
    builder_phase: function() { /* melded method executor */ }
}
```

## Core Features of the Object Pattern

### 1. MOC Definition

The `object` pattern establishes the basic [Melded Object Composition (MOC)](/docs/patterns/moc) structure that governs how properties are composed:

```javascript
moc: {
    object_phase: 'phase',
    builder_phase: 'phase'
}
```

This definition specifies that `object_phase` and `builder_phase` should use the 'phase' melding type—a special method melding behavior for lifecycle phases.

### 2. Phase Engine

The `object` pattern implements the core [object lifecycle](/docs/patterns/lifecycle) phase execution engine through its `machine` function, which:

- Tracks which phases have been completed
- Executes phases in the correct order
- Ensures each phase runs only once
- Can advance an object to any specified phase

```javascript
// Advancing an object to a specific phase
myObject.machine('html_phase');
```

### 3. Object Phase

The `object_phase` is the initial setup phase for all Doh objects:

```javascript
object_phase: function() {
    // Handle static properties
    for (let prop_name in this.moc) {
        if (this.moc[prop_name] === 'STATIC') {
            // Connect to pattern statics
            for (pattern in this.inherited) {
                if (NotUndefined(this.inherited[pattern][prop_name])) {
                    Doh.mimic(this, prop_name, this.inherited[pattern], prop_name);
                    break;
                }
            }
        }
    }
}
```

This phase handles essential object setup, including:
- Setting up static property connections
- Preparing the object for the builder phase

Because of house phases work, patterns can all have their own 'object_phase' and all the different methods will be stiched together, making it a proper behavioral init path.

### 4. Builder Phase

The `builder_phase` is responsible for automated child object construction, integrating tightly with the [Sub-Object-Builder system](/docs/patterns/sub-object-builder):

```javascript
builder_phase: function() {
    // Collect all sub-object-buildable properties into this.built
    Doh.collect_buildable_ideas(this, this.moc, this, '');
    
    // Set up parent-child relationship helpers
    if (this.built || this.builder) {
        this.builder_method = function(method_name) {
            // Implementation that finds methods up the builder chain
        };
        
        this.builder_property = function(prop_name) {
            // Implementation that finds properties up the builder chain
        };
    }
    
    // Build all child objects
    if (this.built) {
        this.machine_built = function(phase) {
            // Implementation that builds child objects
        };
        
        this.machine_built(this.machine_built_to);
    }
}
```

This phase is crucial for:
- Identifying and collecting sub-object-buildable properties
- Establishing parent-child relationships
- Setting up builder chain navigation helpers
- Constructing child objects

## Sub-Object-Building Integration

One of the most powerful features enabled by the `object` pattern is its integrated [sub-object-building system](/docs/patterns/sub-object-builder), which automatically constructs child objects from property definitions.

### How Sub-Object-Building Works

1. During the `builder_phase`, Doh scans the object for properties with a `pattern` attribute
2. These properties are collected in the `built` object
3. Each property is instantiated using `New()`
4. The original property is replaced with the fully constructed Doh object

```javascript
// Before builder_phase
myComponent = {
    header: { pattern: 'html', tag: 'header' }
};

// After builder_phase
myComponent = {
    header: /* Fully built Doh object */
};
```

### Defining Sub-Object-Buildable Properties

Properties should be defined in the idea object or pattern definition (before the `builder_phase` runs):

```javascript
// Best practice: Define sub-object-buildable properties in the idea
let pageObject = New('object', {
    header: {
        pattern: 'html',
        tag: 'header',
        html: 'Page Title'
    },
    content: {
        pattern: 'html',
        tag: 'main',
        html: 'Page content goes here'
    }
});
```

## Parent-Child Relationships

The `object` pattern establishes a robust parent-child relationship system:

1. **Builder Reference**: Each auto-built object gets a `builder` property pointing to its parent

2. **Builder Chain Navigation**: Child objects can navigate up the builder chain using:
   - `builder_method(methodName)`: Access methods from parent objects
   - `builder_property(propName)`: Access properties from parent objects

```javascript
// Parent object with child objects
let form = New('object', {
    submitButton: {
        pattern: 'Button',
        text: 'Submit',
        
        // Child object can access parent methods
        onClick: function() {
            this.builder_method('submitForm')();
        }
    },
    
    // Parent method
    submitForm: function() {
        console.log('Form submitted!');
    }
});
```

## Object Inheritance

The inheritance system in Doh is remarkably flexible, allowing for multiple convenient ways to specify inheritance relationships.

### Flexible Inheritance Specification

Doh's inheritance system accepts the `inherits` property in multiple formats:

1. **String Format**: For inheriting from a single pattern
2. **Array Format**: For inheriting from multiple patterns
3. **Object Format**: For complex inheritance rules with conditions

This flexibility appears throughout the system:

```javascript
// PATTERN DEFINITION: Multiple ways to specify inheritance

// 1. Single inheritance as second argument
Pattern('ButtonPattern', 'UIComponent', {
    // Button-specific properties
});

// 2. Multiple inheritance as array in second argument
Pattern('DropdownButton', ['Button', 'Dropdown'], {
    // Combined functionality
});

// 3. Complex inheritance through inherits property
Pattern('AdvancedComponent', {
    inherits: {
        BaseComponent: true,           // Hard inheritance
        OptionalComponent: false,      // Soft inheritance
        ConditionalComponent: {        // Conditional inheritance
            DependencyComponent: true
        }
    },
    // Component properties
});

// OBJECT CREATION: Similarly flexible inheritance

// 1. Direct inheritance through pattern name
let button = New('ButtonPattern', {
    label: 'Click Me'
});

// 2. Multiple inheritance as first argument
let specialButton = New(['Button', 'Draggable'], {
    label: 'Drag Me'
});

// 3. Inheritance through inherits property in idea
let customObject = New('object', {
    inherits: ['BasePattern', 'MixinPattern'],
    // Custom properties
});

// 4. Combining approaches
let complexComponent = New(['BaseComponent', 'UIComponent'], {
    inherits: {
        'SpecialFeature': true,
        'OptionalFeature': false
    },
    // Additional properties
});
```

### Convenience of the Inheritance System

The inheritance system is designed to be both powerful and convenient, allowing you to easily:

1. **Mix in functionality**: Combine behaviors from multiple patterns
2. **Apply conditional features**: Include patterns only when needed
3. **Create ad-hoc compositions**: Assemble functionality without creating named patterns

```javascript
// Ad-hoc composition example
let specialButton = New(['Draggable', 'Resizable', 'Button'], {
    label: 'Special Button',
});
```

### Inheritance Resolution Order

When multiple patterns are inherited, Doh follows a specific resolution order:

1. Patterns are processed in the order specified in the inheritance array
2. Properties from patterns later in the inheritance chain override earlier ones
3. Properties from the idea object override all inherited patterns
4. Melded properties (like methods) combine according to their MOC rules

This powerful inheritance system is central to Doh's pattern-based composition, enabling clean, reusable, and flexible code structures.

## Best Practices

1. **Explicit Inheritance**: When creating patterns, explicitly inherit from 'object' or another pattern.

2. **MOC Definitions**: Always define MOC types for properties that need special handling.

3. **Phase Methods**: Place initialization code in the appropriate phase methods.

4. **Sub-Object-Building**: Define child objects in the idea or pattern definition, not in phase methods.

5. **Parent-Child Relationships**: Use the builder chain navigation methods to maintain loose coupling.

For more detailed information on related topics, see:
- [Patterns in Doh](/docs/patterns/patterns)
- [Melded Object Composition (MOC)](/docs/patterns/moc)
- [Object Lifecycle](/docs/patterns/lifecycle)