# Melded Object Composition (MOC)

![MOC]({{Package:deploydoh_home}}/images/moc.png?size=small)

Melded Object Composition (MOC) is Doh's system for controlling exactly how properties and methods combine when creating [object instances](/docs/patterns/objects) from potentially multiple inherited [Patterns](/docs/patterns/patterns). Think of it like defining custom **recipes** for merging ingredients: when you inherit multiple Patterns (ingredients), MOC specifies how their properties (e.g., arrays, objects, functions) should be intelligently blended together in the final object.

This makes **object composition** highly flexible and predictable, enabling complex components to be built reliably from smaller, reusable parts.

This guide covers:
* Understanding MOC definitions and how they control property behavior
* Working with different types of property melding (Array, Object, Deep)
* Managing method melding for different execution patterns
* Using type validation and exclusion rules
* Combining multiple MOC behaviors for complex properties

> **MOC Definitions Meld:** Remember that `moc` blocks from all inherited patterns are **melded** together using the standard [Resolution Order](/docs/core/resolution_order). You only need to define `moc` entries in a derived pattern if you are introducing **new** properties/methods that require specific melding or are defining **new** lifecycle phases. Core phases like `object_phase` and `builder_phase` are typically defined in the base `object` pattern and don't need redeclaration.
## Core Concepts

### MOC Definitions

At its core, MOC is defined through the `moc` property within a Pattern's [idea](/docs/patterns/patterns) (or an idea passed to `New()`). This property holds an object where keys are property names and values specify the MOC behaviors (the "recipe") for that property:

```javascript
Pattern('ExamplePattern', {
    moc: {
        arrayProp: 'Array',           // Array melding with type validation
        deepProp: {},                 // Deep melding with nested control
        methodProp: 'Method',         // Method melding with context binding
        stringProp: 'IsString',       // Type validation only
        notNullProp: 'NotNull',       // Null/undefined exclusion
        multiProp: ['Array', 'NotNull'] // Multiple MOC behaviors
    },
    
    // Properties controlled by the above MOC definitions
    arrayProp: [1, 2, 3],
    deepProp: { nested: { value: true } },
    methodProp: function() { /* ... */ },
    stringProp: 'example',
    notNullProp: 'must have a value',
    multiProp: [4, 5, 6]
});
```

### MOC Tracks

MOC operations are organized into logical "tracks" or categories, allowing different aspects of property behavior to be controlled independently. This means you can combine a merging strategy (like `Array`) with validation (like `NotNull`) without conflict.

The main tracks are:

1.  **`melder`**: Controls how property *values* combine during inheritance (e.g., `Array`, `Object`, `Concat`, `{}`).
2.  **`typeof`**: Manages type *validation* (e.g., `IsString`, `IsArrayOrFalse`). Only one `typeof` rule applies (the first one encountered in the inheritance chain).
3.  **`not*`**: Handles type *exclusion* (e.g., `NotNull`, `NotUndefined`, `NotString`). Multiple `not` rules are cumulative.
4.  **`async_method`**: Specifically controls asynchronous behavior for method melding types (used implicitly by `Async_*` melders).

Each track operates mostly independently when resolving the final behavior for a property.

## Type System

MOC integrates with Doh's type system to provide validation and type-checking capabilities.

### Type Validation

Type validation ensures properties conform to expected types:

```javascript
Pattern('TypeValidationExample', {
  moc: {
    types: [
      // Basic Types
      'IsAny',                   // Any value (never fails)
      'IsAnything',              // Alias for IsAny
      'IsDefined',               // Not undefined and not null
      'IsSet',                   // Alias for IsDefined (changing soon to be for Set's, instead)
      'HasValue',                // Not undefined, null, or "" (if string)
      'IsLiteral',               // Static values (not objects/arrays)
      'IsBoolean',               // true or false
      'IsString',                // String type
      'IsNumber',                // Number (excluding NaN)
      'IsInt',                   // Integer numbers only
      'IsArray',                 // Array type
      'IsObjectObject',          // Plain object (not array/literal)
      'IsObject',                // Alias for IsObjectObject
      'IsIterable',              // Has Symbol.iterator
      'IsFunction',              // Function type
      'IsPromise',               // Promise instance
      'IsDohObject',             // Doh object instance

      // Or False Variants
      'IsStringOrFalse',         // String or false
      'IsNumberOrFalse',         // Number or false
      'IsIntOrFalse',            // Integer or false
      'IsLiteralOrFalse',        // Static value or false
      'IsArrayOrFalse',          // Array or false
      'IsObjectOrFalse',         // Object or false
      'IsFunctionOrFalse',       // Function or false
      'IsPromiseOrFalse',        // Promise or false
      'IsDohObjectOrFalse',      // Doh object or false
      'IsPromiseOrFunctionOrFalse', // Promise, function, or false

      // Composite Types
      'IsStringOrArray',         // String or array
      'IsStringOrNumber',        // String or number
      'IsArrayOrObjectObject',   // Array or plain object
      'IsStringOrArrayOrObjectObject', // String, array, or plain object

      // Composite Or False Variants
      'IsStringOrArrayOrFalse',  // String, array, or false
      'IsArrayOrObjectObjectOrFalse', // Array, plain object, or false
      'IsStringOrArrayOrObjectObjectOrFalse', // String, array, plain object, or false

      // Special Validation 
      'IsKeySafe',               // Safe to use as object key

      // Different from HasValue in that it requires a String value
      'IsStringAndHasValue',     // String that is not empty

      // Different from IsNumber in that it can be a string of digits,
      // or decimal number with a decimal point, or a signed number
      // excludes NaN, Infinity, and non-numeric strings
      'IsOnlyNumbers',           // Any number type, or String containing only numeric characters

      // Object State
      'IsObjectObjectAndEmpty',   // Empty plain object
      'IsObjectObjectAndNotEmpty', // Non-empty plain object
      'IsObjectObjectAndNotEmptyOrFalse', // Non-empty plain object or false
      'IsArrayAndEmpty',         // Empty array
      'IsArrayAndNotEmpty'       // Non-empty array
    ]
  }
});
```

Most type validation operators ignore `null` and `undefined` values by default, allowing properties to be optional. Use `NotNull` or `NotUndefined` to require a value.

### Type Exclusion

Type exclusion operators prevent properties from having certain types:

```javascript
Pattern('TypeExclusionExample', {
  moc: {
    value: [
      'NotUndefined',   // Cannot be undefined
      'NotNull',        // Cannot be null
      'NotString',      // Cannot be string
      'NotNumber',      // Cannot be number
      'NotBoolean',     // Cannot be boolean
      'NotArray',       // Cannot be array
      'NotObject',      // Cannot be object
      'NotFunction',    // Cannot be function
      'NotPromise',     // Cannot be Promise
      'NotDohObject'    // Cannot be Doh object
    ]
  }
});
```

Unlike validation, multiple exclusions can be combined to create sophisticated type constraints.

## Melding Types

MOC provides various melding strategies for combining properties during inheritance.

### Array (`Array`)

Combines arrays with duplicate removal:

```javascript
Pattern('ArrayMeldingExample', {
    moc: { 
        items: 'Array'  // Automatically includes IsArray validation
    },
    items: [1, 2]
});

const obj = New('ArrayMeldingExample', {
    items: [2, 3]
});
console.log(obj.items); // [1, 2, 3]
```

### Concatenation (`Concat`)

Combines strings or arrays without removing duplicates:

```javascript
Pattern('ConcatExample', {
    moc: {
        text: 'Concat',
        list: 'Concat'
    },
    text: 'Hello ',
    list: [1, 2]
});

const obj = New('ConcatExample', {
    text: 'World',
    list: [2, 3]
});
console.log(obj.text);  // "Hello World"
console.log(obj.list);  // [1, 2, 2, 3]
```

### Object (`Object`)

Performs shallow merging of objects using `Object.assign`:

```javascript
Pattern('ObjectMeldingExample', {
    moc: {
        config: 'Object'
    },
    config: {
        a: 1,
        b: { x: 1 }
    }
});

const obj = New('ObjectMeldingExample', {
    config: {
        b: { y: 2 },
        c: 3
    }
});
console.log(obj.config);  // { a: 1, b: { y: 2 }, c: 3 }
```

### Deep Object (`{}`)

Recursively merges objects with nested MOC control:

```javascript
Pattern('DeepMeldingExample', {
    moc: {
        settings: {  // Empty object = deep melding
            theme: 'IsString',
            counts: 'Array',
            nested: {  // Nested MOC definitions
                enabled: 'IsBoolean'
            }
        }
    },
    settings: {
        theme: 'light',
        counts: [1],
        nested: {
            enabled: true
        }
    }
});

const obj = New('DeepMeldingExample', {
    settings: {
        counts: [2],
        nested: {
            enabled: false
        }
    }
});
console.log(obj.settings);
// {
//   theme: 'light',
//   counts: [1, 2],
//   nested: { enabled: false }
// }
```

## Method Melding Types

MOC provides sophisticated control over how methods are combined during inheritance.

### Common Method Melding Features

All method melding types share these core behaviors:

- Preserve `this` binding in all contexts (callbacks, events, timers)
- Support pre/post hooks via `pre_methodName` and `post_methodName`
- Allow method stacking from multiple patterns

### Method (`Method`)

The standard method melding type. Executes methods in Pattern Resolution Order (base to derived) and intelligently **merges truthy return values onto `this` object**.

```javascript
Pattern('MethodExample', {
    moc: { 
        handler: 'Method'
    },
    pre_handler: function() {
        console.log('Pre-processing');
    },
    handler: function(arg1, arg2) {
        console.log('Base handling', arg1, arg2);
        return { newProp: 'value' };  // Merged onto this
    },
    post_handler: function() {
        console.log('Post-processing');
    }
});

Pattern('ExtendedMethod', 'MethodExample', {
    handler: function(arg1, arg2) {
        console.log('Extended handling', arg1, arg2);
        return { anotherProp: 'value2' };  // Also merged onto this
    }
});
```

Key behaviors:
- Executes in Pattern Resolution Order (base to derived)
- Merges truthy return values onto `this`
- Return `false` to short-circuit with `false`
- Return `true` to short-circuit with `this`
- Arguments passed through to all methods
- Pre-hooks run first, then methods, then post-hooks

### Phase (`Phase`)

Designates a method as a lifecycle phase. Methods of this type are executed in a specific order determined by `__.phase_order()` within the `object.machine()` function during the synchronous `New()` execution. They automatically support `pre_` and `post_` hooks (e.g., `pre_myPhase`, `post_myPhase`) which are executed immediately before and after the main phase method during the `machine` execution, without needing explicit MOC declarations for the hooks themselves.

**IMPORTANT:** Phases **and their `pre_`/`post_` hooks** **cannot** be asynchronous (`async`). They are part of the core synchronous object construction process managed by the `machine`. Attempting to make a phase or its hooks `async` will lead to unpredictable behavior or errors.

**If you need asynchronous initialization:**
*   Use a standard `Method` or `Async_Method`.
*   Call this method *after* the synchronous phases complete, for example, by manually calling it after the `New()` function returns the fully constructed object.
*   Regular methods still benefit from MOC's ordered execution across the inheritance chain and `pre_`/`post_` hooks (which *can* be async for `Method`/`Async_Method`), providing structured flow control for your asynchronous logic, but this must happen *outside* the core phase execution.

```javascript
Pattern('CustomPhaseExample', {
    moc: { 
        // Standard phases (object_phase, builder_phase) are inherited
        custom_setup_phase: 'Phase', // Define a custom synchronous phase
        async_post_setup: 'Async_Method' // Separate async method
    },
    
    // Define the custom phase and its synchronous hooks
    pre_custom_setup_phase: function() {
        console.log('Pre custom setup (sync)');
        this.preData = {};
    },
    custom_setup_phase: function() {
        console.log('Running custom_setup_phase (sync)');
        this.syncData = { customInitialized: true }; // Synchronous setup
        return this.syncData; // Merged onto this
    },
    post_custom_setup_phase: function() {
        console.log('Post custom setup (sync)');
        // Cannot await here! This hook must be synchronous.
        // We can *trigger* async work, but not wait for it.
        this.async_post_setup(); // Fire-and-forget or manage promise elsewhere
    },
    
    // Define the separate asynchronous method
    async_post_setup: async function() {
        console.log('Performing async post-setup...');
        this.asyncData = await Promise.resolve({ setupComplete: true });
        console.log('Async post-setup complete.');
        // If this method returns an object, it's merged onto 'this' 
        // when the promise resolves.
        return { asyncFinished: true }; 
    }
});

// When New('CustomPhaseExample') is called:
// 1. Inherited object_phase and builder_phase run (sync)
// 2. pre_custom_setup_phase runs (sync)
// 3. custom_setup_phase runs (sync)
// 4. post_custom_setup_phase runs (sync)
// 5. post_custom_setup_phase calls async_post_setup (fire-and-forget)
// 6. New() returns the object *before* async_post_setup completes.
// 7. Later, when the async_post_setup promise resolves, its return value is merged.
```

Key behaviors:
- Auto-executed during object construction by the `machine`.
- **MUST NOT be async**. They execute synchronously as part of `New()`.
- Used for core object lifecycle steps.
- Return values merged onto `this`.
- Automatically get `pre_` and `post_` hooks, which **MUST ALSO be synchronous**.

### This_Blender (`This_Blender`)

**Functionally identical to `Method`**. This name exists for semantic clarity, emphasizing that return values **blend onto `this`**. `Method` is the original name and remains fully supported. Choose whichever name makes the intent clearer in your context.

```javascript
Pattern('ThisBlenderExample', {
    moc: { 
        configure: 'This_Blender'
    },
    configure: function(options) {
        console.log('Configuring with', options);
        return { configured: true };  // Merged onto this
    }
});
```

Key behaviors:
- 'Method' is just the original name for what is now technically `This_Blender`
- 'This_Blender' emphasizes that return values blend into `this`
- 'Method' will never be deprecated, and is often the preferred name
- **`Phase` is the only MOC type that cannot be made asynchronous. Its `pre_` and `post_` hooks must also be synchronous.**

### Chain (`Chain`)

Executes methods in Pattern Resolution Order, **passing the return value** of one method as the **first argument** to the next, enabling **sequential processing** or data transformation pipelines.

```javascript
Pattern('ChainExample', {
    moc: { 
        process: 'Chain'
    },
    process: function(data) {
        console.log('Processing', data);
        return data + 1;  // Passed as first arg to next method
    }
});

Pattern('ExtendedChain', 'ChainExample', {
    process: function(data) {
        console.log('Extended processing', data);
        return data * 2;  // Final return value
    }
});

const obj = New('ExtendedChain');
console.log(obj.process(5));  // Outputs: 12 ((5 + 1) * 2)
```

Key behaviors:
- Executes in Pattern Resolution Order
- Each method's return value becomes first argument of next method
- Original arguments passed after chained value
- Common for data transformation chains

### Blender (`Blender`)

Executes methods in Pattern Resolution Order, merging return values onto a **target object passed as the first argument**. Useful for enhancing or modifying an **external object**.

```javascript
Pattern('BlenderExample', {
    moc: { 
        enhance: 'Blender'
    },
    enhance: function(target, extra) {
        console.log('Enhancing with', extra);
        return { base: true };  // Merged onto target
    }
});

Pattern('ExtendedBlender', 'BlenderExample', {
    enhance: function(target, extra) {
        return { extended: true };  // Also merged onto target
    }
});

const obj = New('ExtendedBlender');
const result = obj.enhance({}, 'extra');
console.log(result);  // { base: true, extended: true }
```

Key behaviors:
- Executes in Pattern Resolution Order
- First argument is target object
- Return values merged onto target object
- Common for object enhancement scenarios

### Funnel (`Funnel`)

Like `Blender`, but executes methods in **reverse Pattern Resolution Order** (derived to base). Merges return values onto the **target object (first argument)**. Useful for applying final modifications or configurations.

**Note:** Like all method melding types *except* `Phase`, `Funnel` methods *can* be `async` if declared using the `Async_Funnel` type.

```javascript
Pattern('FunnelExample', {
    moc: { 
        finalize: 'Funnel'
    },
    finalize: function(target) {
        console.log('Base finalizing');
        return { base: true };  // Applied last
    }
});

Pattern('ExtendedFunnel', 'FunnelExample', {
    finalize: function(target) {
        console.log('Extended finalizing');
        return { extended: true };  // Applied first
    }
});

const obj = New('ExtendedFunnel', {
    finalize: function(target) {
        console.log('Idea finalizing');
        return { idea: true };  // Applied first
    }
});

const result = obj.finalize({});
console.log(result);
// { idea: true, extended: true, base: true }
```

Key behaviors:
- Executes in reverse Pattern Resolution Order (derived to base)
- First argument is target object
- Return values merged onto target object
- Common for finalization scenarios

### This_Funnel (`This_Funnel`)

Like `Method`/`This_Blender`, but executes in **reverse Pattern Resolution Order** (derived to base). Merges return values onto `this`. Often used for cleanup or teardown logic.

```javascript
Pattern('ThisFunnelExample', {
    moc: { 
        cleanup: 'This_Funnel'
    },
    cleanup: function() {
        console.log('Base cleanup');
        return { baseClean: true };  // Applied last onto this
    }
});

Pattern('ExtendedThisFunnel', 'ThisFunnelExample', {
    cleanup: function() {
        console.log('Extended cleanup');
        return { extendedClean: true };  // Applied first onto this
    }
});
```

Key behaviors:
- Executes in reverse Pattern Resolution Order
- Return values merged onto `this`
- Common for cleanup/teardown scenarios

### Chain_Funnel (`Chain_Funnel`)

Like `Chain`, but executes in **reverse Pattern Resolution Order** (derived to base). Passes return values sequentially as the first argument to the next method. Useful for bottom-up transformations.

```javascript
Pattern('ChainFunnelExample', {
    moc: { 
        transform: 'Chain_Funnel'
    },
    transform: function(value) {
        console.log('Base transform', value);
        return value + 1;  // Applied last
    }
});

Pattern('ExtendedChainFunnel', 'ChainFunnelExample', {
    transform: function(value) {
        console.log('Extended transform', value);
        return value * 2;  // Applied first
    }
});

const obj = New('ExtendedChainFunnel');
console.log(obj.transform(5));  // Outputs: 11 ((5 * 2) + 1)
```

Key behaviors:
- Executes in reverse Pattern Resolution Order
- Each return value becomes first argument of next method
- Common for bottom-up transformations

### Async Variants

Each method type (except Phase) has an async variant prefixed with `Async_`:

```javascript
Pattern('AsyncExample', {
    moc: {
        method: 'Async_Method',
        chain: 'Async_Chain',
        blender: 'Async_Blender',
        funnel: 'Async_Funnel',
        this_funnel: 'Async_This_Funnel',
        chain_funnel: 'Async_Chain_Funnel',
        // init_phase: 'Phase' // NO Async_Phase! Phases must be sync.
    },
    async method() {
        await someAsyncOperation();
        return { done: true };
    }
});
```

Key behaviors:
- Methods can use async/await
- Execution order preserved
- Returns Promise that resolves to normal return type
- Pre/post hooks can also be async
- Async and sync methods can be mixed in chain
- **`Phase` is the only MOC type that cannot be made asynchronous.**

## Advanced Features

### Nested MOC Control

The `{}` melder enables MOC definitions for nested properties without adding MOC metadata to the actual objects:

```javascript
Pattern('NestedMOCExample', {
    moc: {
        config: {  // Deep melding with nested MOC
            theme: 'IsString',
            counts: 'Array',
            nested: {  // Further nesting
                enabled: 'IsBoolean',
                values: 'Array'
            }
        }
    }
});
```

This is particularly useful when the config object needs to be passed to APIs that don't expect additional properties.

### Multiple MOC Options

Properties can have multiple MOC options from different tracks:

```javascript
Pattern('MultipleOptionsExample', {
    moc: {
        // Combines Array melding, type validation, and exclusions
        items: ['Array', 'NotNull', 'NotUndefined']
    }
});
```

### Automatic Type Checking

Melders automatically include appropriate type validation:

```javascript
Pattern('AutoTypeCheckExample', {
    moc: {
        list: 'Array',       // Includes IsArray
        obj: 'Object',       // Includes IsObjectObject
        fn: 'Method',        // Includes IsFunction
        text: 'Concat'       // Includes IsString or IsArray
    }
});
```

## Integration with Other Doh Systems

MOC is tightly integrated with several other core Doh systems:

1. **Pattern System**: MOC definitions in patterns control how properties are inherited and combined when creating new objects.

2. **Inheritance System**: MOC works with Doh's inheritance system to determine how properties are resolved and merged across the inheritance chain.

3. **Object Lifecycle**: Method MOC types, especially Phase, play a crucial role in the object lifecycle, controlling how initialization methods are executed. Remember that `Phase` methods **and their `pre_`/`post_` hooks** must be synchronous.

4. **Sub-Object-Builder**: MOC definitions help the Sub-Object-Builder system determine how nested objects should be constructed and composed.