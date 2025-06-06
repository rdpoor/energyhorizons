# Sub-Object-Builder: Automatic Hierarchical Components

![Sub-Object-Builder]({{Package:deploydoh_home}}/images/sub-object-builder.png?size=small)

The Sub-Object-Builder is enabled by the base [`object` pattern](/docs/patterns/objects), that helps you create **hierarchies of nested objects** in Doh using simple property definitions. It automatically builds child object instances from your declarations, making it easier to create and manage complex component structures without manual instantiation.

This guide covers:
*   How the Sub-Object-Builder relates to the [Object Instantiation Lifecycle](/docs/patterns/lifecycle).
*   Defining properties that trigger automatic child object creation.
*   How nested object hierarchies are built.
*   Using method hooks (related to [MOC](/docs/patterns/moc)) for initialization.
*   Managing **parent-child relationships**.

## Relation to Object Lifecycle

Understanding Doh's [object instantiation lifecycle](/docs/patterns/lifecycle) is essential to effectively using the sub-object-builder system.

### Construction Flow Overview

When you create a Doh object using `New()`, the object goes through several [phases](/docs/patterns/lifecycle):

1.  **Composition Phase**: Patterns and ideas are combined.
2.  **`object_phase`**: Basic object setup and initialization.
3.  **`builder_phase`**: This is where the Sub-Object-Builder system runs, automatically constructing child objects.
4.  **Additional Custom Phases**: Any custom phases defined in patterns.

Crucially, **properties intended for auto-building must be defined *before* the `builder_phase` executes.**

### Defining Buildable Properties

The recommended approach is to define buildable properties directly in the `idea` object literal passed to `New()` or within the `Pattern` definition itself.

```javascript
// PREFERRED: Define properties in the idea object literal
let myObject = New('my_pattern', {
  // Direct properties that will be auto-built
  header: {
    pattern: 'html', // The 'pattern' key signals auto-building
    tag: 'header'
  },
  content: {
    pattern: 'html',
    tag: 'main'
  }
});

// GOOD: Define properties in the pattern definition
Pattern('my_pattern', {
  header: {
    pattern: 'html',
    tag: 'header'
  },
  footer: {
    pattern: 'html',
    tag: 'footer'
  }
});
```

Using the `object_phase` to define buildable properties should be reserved for cases where the structure is dynamic and cannot be determined beforehand.

```javascript
Pattern('my_pattern', {
  object_phase: function() {
    // LESS PREFERRED: Only use for dynamic properties
    if (this.config.dynamicLayout) {
      this.dynamicSection = { pattern: 'html', tag: 'section' };
    }
  }
});
```

The `builder_phase` (provided by the base [`object` pattern](/docs/patterns/objects)) then finds and processes these definitions:

```javascript
// The standard builder_phase logic
builder_phase: function() {
  // 1. Collect properties containing a 'pattern' key
  Doh.collect_buildable_ideas(this, this.moc, this, '');
  
  // 2. Build child objects using New() if any were found
  if (this.built) {
    this.machine_built(this.machine_built_to); // Instantiates items in this.built
  }
}
```

### Phase Execution Order & Hooks

Remember the [lifecycle phase execution order](/docs/patterns/lifecycle):
1.  `object_phase`
2.  `builder_phase`
3.  Custom phases

Each phase supports `pre_` and `post_` hooks, allowing fine-grained control. See [Method Hooks](#method-hooks-and-initialization) below.

## How Sub-Object-Building Works

### Identifying Buildable Properties

A property is identified as buildable and processed by the Sub-Object-Builder if:

1.  It is an object literal.
2.  It has a property named `pattern` whose value is a string (the name of the Pattern to instantiate).

```javascript
// This property will be auto-built
header: {
  pattern: 'html', // <<< Required key
  tag: 'header'
}

// This will NOT be auto-built (no 'pattern' key)
footer: {
  tag: 'footer'
}
```

### Direct Properties vs. Collections

Doh strongly encourages using named, direct properties for defining child objects, as this is what the Sub-Object-Builder primarily looks for.

```javascript
// PREFERRED: Direct properties
Pattern('GoodPattern', {
  header: { pattern: 'html', tag: 'header' },
  navigation: { pattern: 'html', tag: 'nav' },
  content: { pattern: 'html', tag: 'main' }
});
```

While Doh does provide a `children` array for object relationships, direct properties are favored for auto-building.

### The Building Process

During the `builder_phase`, the system iterates through properties identified as buildable:

1.  It calls `New()` using the property's value (the `idea` object containing the `pattern` key and other properties) as the `idea` argument **and passes down a target phase**. The target phase is determined by the parent's `machine_built_to` property (or defaults to `'final'`). See [Coordinating Child Lifecycles](#coordinating-child-lifecycles) below.
2.  The original property on the parent object is **replaced** with the newly created child object instance (which has only been machined up to the target phase).
3.  The original `idea` used to construct the child is preserved internally on the child at `childInstance.inherited.idea`.
4.  A `builder` property is added to the child, linking it to the parent.

```javascript
// Before builder_phase runs on parent
myObject.header = { pattern: 'html', tag: 'header', machine_built_to: 'object_phase' };
myObject.content = { pattern: 'html', tag: 'main' }; // Will build to 'final' (default)

// After builder_phase runs on parent
myObject.header = /* Instance of 'html', machined only to 'object_phase' */;
myObject.header.builder = myObject;
myObject.content = /* Instance of 'html', machined to 'final' */;
myObject.content.builder = myObject;
```

### Nested Hierarchies

The Sub-Object-Builder handles **nested definitions** recursively. When a child object is built, its own `builder_phase` runs, potentially building *its* children.

```javascript
// Define a complex nested structure
let page = New('object', {
  body: {             // Level 1
    pattern: 'html',
    tag: 'body',
    header: {         // Level 2
      pattern: 'html',
      tag: 'header',
      title: {        // Level 3
        pattern: 'html',
        tag: 'h1',
        html: 'Welcome'
      }
    },
    content: {        // Level 2
      pattern: 'html',
      tag: 'main'
    }
  }
});

// After building, you have a complete hierarchy:
// page.body
// page.body.header
// page.body.header.title
// page.body.content
```

## Method Hooks and Initialization

The [Melded Object Composition (MOC)](/docs/patterns/moc) system provides hooks that are useful in the context of sub-object-building.

### `pre_` and `post_` Hooks for Phases

You can define `pre_builder_phase` and `post_builder_phase` methods (and hooks for any phase) to run code immediately before or after the main phase logic.

*   **`pre_builder_phase`**: The ideal place to dynamically define properties that need to be auto-built. This hook runs *before* the builder collects buildable properties.
*   **`post_builder_phase`**: Runs *after* all child objects for the current object have been built. Useful for setting up relationships *between* siblings or between parent and children.

```javascript
Pattern('PhasedBuilderPattern', {
  moc: {
    object_phase: 'phase',
    builder_phase: 'phase'
    // custom_phase: 'phase' // example
  },
  
  // Define dynamic children just before building starts
  pre_builder_phase: function() {
    if (this.config.needsWidget) {
      this.widget = { pattern: 'Widget', config: this.config.widgetConf };
    }
  },
  
  // Setup relationships after children are built
  post_builder_phase: function() {
    if (this.widget && this.mainContent) {
      // Example: Let widget know about main content area
      this.widget.contentArea = this.mainContent;
      console.log('Widget and Main Content linked.');
    }
  }
});
```

### Inheritance and Hook Execution Order

As described in the [MOC documentation](/docs/patterns/moc), when inheriting multiple patterns, hooks execute in a specific order relative to the main phase methods:

1.  All `pre_` hooks (inheritance order: base to derived)
2.  All main phase methods (inheritance order: base to derived)
3.  All `post_` hooks (inheritance order: base to derived)

## Parent-Child Relationships

Auto-built objects automatically establish **parent-child relationships**:

*   **`builder` Property:** Each auto-built child object receives a `builder` property that points directly to its parent (the object it was defined within).
*   **Builder Chain Navigation:** Child objects can access properties and methods from their parent (or ancestors) using:
    *   `this.builder_property('propertyName')`: Searches up the builder chain for the first ancestor with the property.
    *   `this.builder_method('methodName')`: Searches up the builder chain for the first ancestor with the method and returns a bound function.

```javascript
Pattern('ParentPattern', {
  parentData: 'Some Value',
  parentMethod: function() { console.log('Parent method called!'); },

  // Child property that will be auto-built
  child: {
    pattern: 'ChildPattern'
  }
});

Pattern('ChildPattern', {
  accessParent: function() {
    // Direct access via builder property
    console.log(this.builder.parentData); // -> Some Value
  }
});

const instance = New('ParentPattern');
instance.child.accessParent();
```

## Coordinating Child Lifecycles (Advanced)

It is possible to influence the [lifecycle phases](/docs/patterns/lifecycle) child objects are initialized to during the automatic build process using the parent object's `machine_built_to` property. This is an advanced mechanism primarily used to coordinate the initialization of UI controls after they have registered but before they are fully rendered.

For a detailed explanation of this mechanism and its primary use case within the control registration system, please see the **[Control Registration System documentation in the html pattern guide](/docs/patterns/html#control-registration-system)**.

## Best Practices

### 1. Define Properties Statically Where Possible

Define buildable properties directly in the `idea` object (passed to `New()`) or within the `Pattern` definition, rather than dynamically in phases, unless necessary.

```javascript
// BEST: In idea
let obj = New('object', { child: { pattern: 'X' } });

// GOOD: In pattern
Pattern('Parent', { child: { pattern: 'X' } });

// OK (Only if dynamic): In pre_builder_phase
Pattern('DynamicParent', {
  pre_builder_phase: function() { this.child = { pattern: 'X' }; }
});

// BAD: In builder_phase or later (too late for auto-build)
Pattern('LateParent', {
  builder_phase: function() { /* ... */ this.child = { pattern: 'X' }; }
});
```

### 2. Prefer Direct Properties Over Collections

Use named, direct properties for children. This leverages the Sub-Object-Builder directly and makes the structure clearer.

```javascript
// PREFERRED
Pattern('Layout', {
  header: { pattern: 'Header' },
  footer: { pattern: 'Footer' }
});

// DISCOURAGED for auto-building
Pattern('Layout', {
  object_phase: function() {
    this.children = [
      { pattern: 'Header' },
      { pattern: 'Footer' }
    ];
  }
});
```

### 3. Use Hooks Appropriately

*   Use `pre_builder_phase` to *define* dynamic child properties.
*   Use `post_builder_phase` to *configure relationships* between children or between parent and children *after* they are built.

### 4. Keep Nesting Understandable

While the system supports deep nesting, overly nested structures can become difficult to manage. Consider flattening hierarchies where appropriate by composing smaller, focused patterns.

## Key Takeaways

1.  The Sub-Object-Builder automatically instantiates properties containing a `pattern` key during the `builder_phase`.
2.  Define buildable properties statically in ideas/Patterns when possible; use `pre_builder_phase` for dynamic definitions.
3.  Direct properties are preferred for auto-building.
4.  Parent-child relationships are automatically established (`builder`, `builder_property`, `builder_method`).
5.  Use `post_builder_phase` for setup that requires children to exist.