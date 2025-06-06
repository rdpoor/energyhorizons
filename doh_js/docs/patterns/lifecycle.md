# Object Instantiation Lifecycle

![Pattern Lifecycle]({{Package:deploydoh_home}}/images/lifecycle.png?size=small)

This guide explains the **object instantiation lifecycle** in Doh - the step-by-step process by which Doh creates and initializes object instances using the `New()` function. Understanding this **construction flow** and the role of **lifecycle phases** is key to effectively using and extending Doh objects.

This guide covers:
*   The `New()` function and the **object creation process**.
*   The standard **object lifecycle phases** and their execution order.
*   How inheritance and pattern mixing occur during **instantiation**.
*   Handling constructor arguments and object **initialization**.
*   Using the `machine` function for **phase execution** control.

## Overview of Object Creation (`New()`)

In Doh, object instances are created using the `New()` function. This function orchestrates the transformation of a [Pattern](/docs/patterns/patterns) definition and an optional input `idea` object into a fully initialized Doh object instance, ready for use. The process involves resolving inheritance, melding properties, and executing lifecycle phases in a specific order.

```javascript
// Creating a new object instance
let myObject = New('pattern_name', idea_object, phase);
```

## The `New()` Function

The `New()` function is the entry point for object creation in Doh. It can be called in several ways:

1. `New(pattern, idea, phase)` - Create a new object with the specified pattern and idea, machined to the specified phase
2. `New(pattern, idea)` - Create a new object, defaulting to 'final' phase
3. `New(idea)` - Create a new object using idea.pattern as the pattern
4. `New(existingObject, phase)` - Machine an existing object to the specified phase

## The Object Construction Flow

When `New()` is called, it initiates the following **construction flow**:

### 1. Pattern and Idea Processing

First, `New()` determines the primary pattern and initial properties (`idea`):

- If the pattern is a string, it uses that as the idea's pattern
- If the pattern is an array, it merges the array items into idea.inherits
- If the pattern is an object, it treats that as the idea

### 2. Inheritance Resolution

The function then resolves all the patterns that the object should inherit from:

```javascript
// Collect all patterns from both the pattern's inherits and the idea's inherits
var patterns = Doh.meld_objects(
  Doh.extend_inherits(Patterns[idea.pattern].inherits), 
  Doh.extend_inherits(idea.inherits)
);

// Add the main pattern last
patterns[idea.pattern] = true;
```

### 3. Pre-Construction Phase

Before creating the object, constructor arguments are prepared:

```javascript
// Process constructor arguments through pre_constructor hooks
for (let i = 0; i < pre_melded_constructors.length; i++) {
  test_args = pre_melded_constructors[i](constructor_args);
  if (test_args && IsIterable(test_args)) constructor_args = test_args;
}
```

### 4. Object Creation

The actual object is created using either the default prototype constructor or a custom one:

```javascript
// Default PrototypeConstructor creates a proper prototype chain
object = prototype_constructor(...constructor_args);
object.inherited = object.inherited || {};
```

### 5. Constructor Execution

After object creation, constructors are called in inheritance order:

```javascript
// Run all constructor methods in pattern order
for (let i = 0; i < melded_constructors.length; i++) {
  melded_constructors[i].call(object, ...constructor_args);
}
if (Object.hasOwn(idea, 'constructor')) {
  idea.constructor.call(object, ...constructor_args);
}
```

### 6. Pattern Mixing

Each resolved pattern is then mixed into the object instance using `Doh.mixin_pattern` (respecting hard/soft inheritance):

```javascript
// Mix each pattern into the object
// Doh.mixin_pattern applies MOC rules during this process
for (i in patterns) {
  // Only mix in hard inherits (true)
  if (patterns[i] === true) Doh.mixin_pattern(object, i);
  else delete patterns[i]; // Clean up soft inherits
}
```

### 7. Inherits List Creation

The `inherits` property is updated to be an ordered list of inherited patterns:

```javascript
object.inherits = [];
for (i in patterns) {
  object.inherits.push(i);
}
```

### 8. Machine Attachment and Phase Processing

Finally, the object's `machine` function is attached. This function controls the execution of **lifecycle phases**.

```javascript
object.machine = function (phase) {
  // Cycle through defined phases (from MOC definition)
  for (let phase_name of object.moc.__.phase_order()) {
    if (!object.machine.completed[phase_name]) { // Run each phase only once
      object.machine.phase = phase_name;
      object.machine.completed[phase_name] = false; // Mark as running
      
      // Execute the melded methods for this phase
      // Note: 'Phase' is a MOC type, see docs/moc
      object[phase_name].apply(object);
      
      object.machine.completed[phase_name] = true; // Mark as complete
    }
    // Stop if the target phase is reached
    if (phase_name == phase) return object;
    }
  return object;
};

// Initialize completion state
object.machine.completed = {};

// Execute phases up to the requested phase (or 'final' by default)
object.machine(phase || 'final'); 
```

This `machine` ensures phases run in the correct order (defined by the combined [MOC](/docs/patterns/moc) definitions of the inherited patterns) and only once per instance.

## Core Phases Defined by `object` Pattern

The base [`object` pattern](/docs/patterns/objects) defines two primary **lifecycle phases** that run for all Doh object instances:

### 1. Object Phase (`object_phase`)

The `object_phase` is the primary **initialization** phase. Its responsibilities include setting up internal properties like `melded` and handling static property connections.

```javascript
// Simplified view of object_phase from the base 'object' pattern
object_phase: function () {
  // Ensure this.melded refers to the final MOC definition
  this.melded = this.moc || {};
  Doh.mimic(this, 'melded', this, 'moc');
  
}
```

### 2. Builder Phase (`builder_phase`)

The `builder_phase` handles the automatic construction of child objects defined within the instance, integrating with the [Sub-Object-Builder system](/docs/patterns/sub-object-builder).

```javascript
// Simplified view of builder_phase from the base 'object' pattern
builder_phase: function () {
  // 1. Collect properties marked for auto-building into this.built
  Doh.collect_buildable_ideas(this, this.moc, this, '');
  
  // 2. Set up parent-child linkage helpers (this.builder_method, etc.)
  // ... (builder helper setup) ...
  
  // 3. Build child objects if any were found
  if (this.built) {
    // Define the internal function that builds each child
    this.machine_built = function (targetPhase) { 
      for (let prop_name in this.built) {
        if (IsUndefined(this.built[prop_name])) { // Check if already built
          let idea = this[prop_name]; 
          // Instantiate child, machining it ONLY up to targetPhase
          this[prop_name] = this.built[prop_name] = New(idea, targetPhase);
          this[prop_name].builder = this; // Set parent reference
        }
      }
    };
    // Execute the build, machining children to the phase specified 
    // in this.machine_built_to, or 'final' if not specified.
    this.machine_built(this.machine_built_to || 'final'); 
  }
}
```

This phase uses an internal `machine_built(phase)` function to iterate through properties marked for building (collected in `this.built`) and instantiates them using `New()`, passing down a target phase.

## Additional Object Methods (from `object` pattern)

The base [`object` pattern](/docs/patterns/objects) also provides several utility methods available on all instances:

## Best Practices

1. **Understanding Phase Order**: 
   - Always remember that `object_phase` runs before `builder_phase`
   - Define child objects that need auto-building before or during `object_phase`

2. **Pattern Inheritance**:
   - The 'object' pattern is always at the base of all inheritance
   - Patterns in the inheritance chain are processed in order

3. **Machine Usage**:
   - Use object.machine() to advance an object through phases
   - Check object.machine.completed to see which phases have run

4. **Custom Phases**:
   - Define custom phases in your pattern's MOC definition using the `'phase'` type.
   - They will be run after the core phases (object_phase, builder_phase).
   - Remember that phases automatically support `pre_` and `post_` hooks (see the [MOC documentation](/docs/patterns/moc#phase-phase) for details).

When extending or creating patterns, focus on the phase methods (`object_phase`, `builder_phase`, and custom phases) to properly initialize your objects and build any child components.