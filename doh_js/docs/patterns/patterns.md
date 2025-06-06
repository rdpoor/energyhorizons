# Doh Patterns: Reusable Object Templates

![Patterns]({{Package:deploydoh_home}}/images/patterns.png?size=small)

The Pattern system in Doh helps you create and manage objects using flexible **reusable templates**. It provides a powerful approach to **object composition** and **inheritance** that's different from traditional object-oriented programming, making it easier to build and maintain complex applications.

This guide covers:
*   Understanding Ideas and Patterns - the building blocks (blueprints) of Doh objects
*   Creating and using Patterns with the `Pattern()` function
*   Working with **inheritance** and **object composition**
*   Managing **object lifecycles** and phases
*   Using **Melded Object Composition (MOC)** for flexible property merging

## Core Concepts

### Ideas and Patterns: The Blueprints

In Doh, there are two foundational concepts that work together to create objects:

1.  **Ideas**: An "idea" is essentially a plain JavaScript object that defines properties and methods. It's the raw material or *initial* **blueprint**.
2.  **Patterns**: A Pattern is a named "idea" that serves as a *reusable* **template** or **blueprint** for object creation. When you define a Pattern, you're creating a *reusable* **template** that can be instantiated into concrete objects using `New()`. Patterns can multi-inherit from other Patterns, creating a rich tapestry of composable functionality.

The relationship between Ideas and Patterns is central to Doh's philosophy:

```javascript
// An idea - a simple JavaScript object
const buttonIdea = {
    text: 'Click Me',
    onClick: function() {
        console.log('Button clicked!');
    }
};

// A Pattern - a named, reusable template
Pattern('Button', {
    tag: 'button',
    html: 'Default Text',
    onClick: function() {
        console.log('Button clicked!');
    },
    html_phase: function() {
        this.e.on('click', this.onClick);
    }
});
```

### From Patterns to Objects

The process of turning a Pattern into an actual object involves the `New()` function:

```javascript
// Creating an object from a Pattern
const myButton = New('Button', {
    html: 'Submit'
});
```

This creates a new object based on the 'Button' Pattern, overriding the `html` property with 'Submit'.

## The Pattern() Function

The `Pattern()` function is the cornerstone of Doh's Pattern system. It defines reusable object templates that can be instantiated via `New()`.

### Syntax

```javascript
Pattern(name, [inherits], idea)
```

- `name`: A string identifying the Pattern.
- `inherits` (optional): A string, array, or object specifying the Patterns to inherit from.
- `idea`: An object defining the properties and methods of the Pattern.

### Basic Usage

#### Simple Pattern Definition

```javascript
Pattern('SimplePattern', {
    property: 'value',
    method: function() {
        console.log('Hello from SimplePattern');
    }
});
```

#### Pattern with Inheritance

```javascript
Pattern('ChildPattern', 'ParentPattern', {
    childMethod: function() {
        console.log('Child-specific method');
    }
});
```

#### Multiple Inheritance

```javascript
Pattern('MultiInheritPattern', ['Pattern1', 'Pattern2'], {
    // Additional properties and methods
});
```

## Inheritance in Patterns

Doh's inheritance system is exceptionally flexible, supporting multiple inheritance paths and sophisticated resolution strategies. It follows the same core principles defined in Doh's unifying [Resolution Order algorithm](/docs/core/resolution_order).

### Inheritance Types

1. **Simple Inheritance**: Inherit from a single Pattern

   ```javascript
   Pattern('Button', 'UIComponent', { /* ... */ });
   ```

2. **Multiple Inheritance**: Inherit from multiple Patterns

   ```javascript
   Pattern('DropdownButton', ['Button', 'Dropdown'], { /* ... */ });
   ```

3. **Complex Inheritance**: Use complex rules to determine inheritance

   ```javascript
   Pattern('AdvancedComponent', {
       inherits: {
           BaseComponent: true,           // Hard inheritance
           OptionalComponent: false,      // Soft inheritance
           ConditionalComponent: {        // Conditional inheritance
               DependencyComponent: true
           }
       }
   });
   ```

### Inheritance Resolution

When a Pattern inherits from multiple sources, Doh uses the sophisticated [Resolution Order algorithm](/docs/core/resolution_order) to determine the final inheritance chain. The order matters because properties and methods from Patterns resolved later can override those from earlier ones.

#### Inheritance Types Explained

1. **Hard Inheritance (true)**: This Pattern will always be included in the inheritance chain.

2. **Soft Inheritance (false)**: This Pattern will only be included if it's also inherited by another Pattern in the chain.

3. **Conditional Inheritance (object)**: This Pattern will be included based on complex conditions involving other Patterns.

```javascript
Pattern('ComplexInheritanceExample', {
    inherits: {
        BasePattern: true,  // Always include BasePattern
        
        OptionalPattern: false,  // Include OptionalPattern only if it's 
                                 // also inherited by another Pattern
        
        ConditionalPattern: {    // Include ConditionalPattern only if
            OtherPattern: true,  // OtherPattern is also included
            
            AnotherPattern: {    // Nested conditions
                YetAnotherPattern: true
            }
        }
    }
});
```

### Implicit Inheritance

If no explicit inheritance is specified and the Pattern is not named 'object', it automatically inherits from the 'object' Pattern:

```javascript
Pattern('ImplicitInheritanceExample', {
    // This Pattern implicitly inherits from 'object'
});
```

## Melded Object Composition (MOC)

Melded Object Composition (MOC) is the system Doh uses to intelligently combine properties and methods from multiple inherited Patterns during **object composition**. You configure how this merging happens using the `moc` property within a Pattern definition.

### The `moc` Property

The `moc` property specifies how individual properties should be merged:

```javascript
Pattern('MocExample', {
    moc: {
        arrayProp: 'array',     // Merge arrays, removing duplicates
        objectProp: 'object',   // Shallow merge objects
        deepProp: 'deep',       // Deep merge objects
        methodProp: 'method',   // Combine methods (method melding)
        phaseMethods: 'phase'   // Special handling for phase methods
    },
    
    // Properties that will be handled according to MOC rules
    arrayProp: [1, 2, 3],
    objectProp: { key: 'value' },
    deepProp: { nested: { value: 'deep' } },
    methodProp: function() { console.log('Base method'); }
});
```

### Method Melding

Method melding is a powerful feature that allows methods from different Patterns to be combined:

```javascript
Pattern('BasePattern', {
    moc: {
        methodExample: 'method'
    },
    methodExample: function() {
        console.log('Base method');
        return 'base result';
    }
});

Pattern('ExtendedPattern', 'BasePattern', {
    methodExample: function() {
        console.log('Extended method');
        // The return value from the parent method is passed as the first argument
        return function(parentResult) {
            return parentResult + ' + extended result';
        };
    }
});

// When instantiated:
const example = New('ExtendedPattern');
// Calling example.methodExample() would log:
// "Base method"
// "Extended method"
// And return: "base result + extended result"
```

For more details on MOC, see the [MOC documentation](/docs/patterns/moc).

## Pattern Instantiation and the New() Function

The `New()` function transforms Patterns into concrete objects:

```javascript
const myObject = New('MyPattern', {
    // Additional properties or overrides
});
```

The instantiation process involves:

1. Resolving the inheritance chain
2. Applying MOC rules to merge properties and methods
3. Executing phase methods in order
4. Returning the fully constructed object

### Providing Additional Properties

When instantiating a Pattern, you can provide an idea object to override or add properties:

```javascript
const customButton = New('Button', {
    text: 'Custom Button',
    icon: 'star',
    onClick: function() {
        console.log('Custom button clicked!');
    }
});
```

## Object Lifecycle

Objects created from Patterns go through a series of construction phases, each with specific responsibilities. For more detailed information, see the [Object Lifecycle documentation](/docs/patterns/lifecycle).

### Construction Phases

1.  **Pre-Construction**: Constructor arguments are prepared
2.  **Prototype Chain Establishment**: The object's prototype chain is created
3. **Post-Construction**: Constructors are called in inheritance order
4. **Pattern Mixing**: Each pattern is mixed into the object
5. **Object Phase**: Initial object setup
6. **Builder Phase**: Handles auto-building of child objects
7. **Post-Builder Phase**: Final setup after all objects are built
8. **Custom-defined phases**: continue with other custom phases like control_phase, html_phase, animation_phase, etc...

## Advanced Pattern Features

### Dynamic Pattern Creation

Patterns can be created dynamically at runtime:

```javascript
Pattern(`Component_${name}`, ['BaseComponent'], {
    ...config,
    id: name.toLowerCase(),
    object_phase: function() {
        console.log(`Initializing ${name} component`);
    }
});

// Usage
const slider = New('Component_Slider', { min: 0, max: 100 });
```

### Pattern Composition Through Properties

Patterns can be composed through property definitions:

```javascript
Pattern('ComplexUI', {
    header: {
        pattern: 'UI_Header',
        title: 'My Application'
    },
    sidebar: {
        pattern: 'UI_Sidebar',
        items: ['Home', 'About', 'Contact']
    },
    content: {
        pattern: 'UI_Content',
        html: 'Welcome to my application'
    }
});
```

This is integrated with Doh's Auto-Builder system, which automatically constructs child objects based on the `pattern` property. For more information, see the [Sub-object-builder documentation](/docs/patterns/sub-object-builder).

## Best Practices and Design Patterns

### 1. Leverage MOC for Flexible Composition

Use the MOC system strategically to control how properties and methods are combined:

```javascript
Pattern('ConfigurableComponent', {
    moc: {
        options: 'deep',        // Deep merge configuration options
        handlers: 'object',     // Shallow merge event handlers
        classes: 'array',       // Combine class names
        initialize: 'phase'     // Meld initialization methods into phase engine
    },
    
    options: { /* default options */ },
    handlers: { /* default handlers */ },
    classes: ['base-component'],
    initialize: function() { /* base initialization */ }
});
```

### 2. Use Phase Methods for Controlled Initialization

Leverage the object lifecycle phases for controlled initialization:

```javascript
Pattern('PhaseAwarePattern', {
    object_phase: function() {
        // Basic object setup
        this.initialized = true;
    },
    
    pre_builder_phase: function() {
        // Prepare for building child objects
        this.childComponents = {
            header: { pattern: 'Header' },
            footer: { pattern: 'Footer' }
        };
    },
    
    post_builder_phase: function() {
        // Setup after all objects are built
        this.connectComponents();
    }
});
```

## Pattern System Architecture

The Pattern system integrates with several other components of the Doh architecture:

1. **Object System**: Patterns are the templates for all Doh objects.
2. **MOC (Melded Object Composition)**: Controls how properties are combined during inheritance.
3. **Auto-Builder**: Automatically constructs child objects based on Pattern properties.
4. **Inheritance System**: Manages the relationships between different Patterns.

For more information on related topics, see the documentation for [Object](/docs/patterns/object), [MOC](/docs/patterns/moc), [Sub-object-builder](/docs/patterns/sub-object-builder), and [Object Lifecycle](/docs/patterns/lifecycle).