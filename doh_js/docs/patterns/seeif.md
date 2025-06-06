# SeeIf: Value and Type Checking

![SeeIf]({{Package:deploydoh_home}}/images/seeif.png?size=small)

The `SeeIf` module provides a suite of functions for checking values and evaluating conditions. Its primary role within Doh.js is to supply the underlying **type validation** and **type exclusion** functions used by the **[Melded Object Composition (MOC)](/docs/patterns/moc)** system when defining `moc` properties in Patterns.

While you can use `SeeIf` directly for complex conditional logic, you will most often encounter its functions (`IsString`, `NotNull`, `IsArrayAndNotEmpty`, etc.) as string values within `moc` definitions.

This guide covers:
*   Using the core `SeeIf()` function for direct evaluation.
*   The library of **type checking** functions (used by MOC).
*   Combining conditions with `And`/`Or`.
*   Saving and loading conditions (`Pack`/`Unpack`).

## Core Function: `SeeIf()`

While the individual checking functions are used implicitly by MOC, the `SeeIf()` function allows direct evaluation of a value against a set of conditions.

```javascript
SeeIf(value, conditions, [callback])
```

-   **`value`**: The value to evaluate.
-   **`conditions`**: An array defining the checks. Can include:
    *   `SeeIf` checking functions (e.g., `IsString`, `HasValue`).
    *   Logical operators: `And`, `Or`.
    *   Nested arrays for complex logic: `[ConditionA, Or, [ConditionB, And, ConditionC]]`
-   **`callback`** (optional): Function called if conditions pass. Receives `(result, value, conditions)`.

**Returns**: Boolean result, or the callback's return value if used.

**Example 1**: Basic Checks
```javascript
// Checks if the value is a non-empty string
// Equivalent to moc: { myProp: ['IsString', 'HasValue'] }
SeeIf('hello', [IsString, And, HasValue]); // true
SeeIf('', [IsString, And, HasValue]);      // false
```

**Example 2**: Complex Logic with `Or` and Nesting
```javascript
let conditions = [
  IsNumber, 
  And, 
  // Value must be a number AND (less than 0 OR greater than 10)
  [ 
    { IsLessThan: 0 }, 
    Or, 
    { IsGreaterThan: 10 }
  ]
];

SeeIf(5, conditions);  // false (number, but not < 0 or > 10)
SeeIf(15, conditions); // true (number, and > 10)
SeeIf(-5, conditions); // true (number, and < 0)
SeeIf('text', conditions); // false (not a number)
```

**Example 3**: Using a Callback
```javascript
let result = SeeIf(42, [IsNumber], (res, val, cond) => {
    return `Value ${val} passed check!`;
}); 
// result === "Value 42 passed check!"
```

## Type Checking and Validation Functions (Used by MOC)

The following functions form the vocabulary for type validation (`typeof` track) and exclusion (`not*` track) within [MOC](/docs/patterns/moc) definitions. They return `true` if the value matches the condition.

| Function | Description | Notes |
|----------|-------------|-------|
| `IsUndefined(value)` | Checks if the value is undefined. | |
| `IsNull(value)` | Checks if the value is null. | |
| `IsString(value)` | Checks if the value is a string. | |
| `IsFunction(value)` | Checks if the value is a function. | |
| `IsTrue(value)` | Checks if the value is true. | Refers to the strict boolean `true`. |
| `IsFalse(value)` | Checks if the value is false. | Refers to the strict boolean `false`. |
| `IsNumber(value)` | Checks if the value is a number (excluding NaN). | NaN is not considered a number. |
| `IsArray(value)` | Checks if the value is an array. | Uses `Array.isArray`. |
| `IsPromise(value)` | Checks if the value is a Promise. | |
| `IsDohObject(value)` | Checks if the value is a Doh object. | Specifically, a complex object built with Doh. |
| `IsObjectObject(value)` | Checks if the value is an object with named properties (not an array or literal). | Excludes arrays and literals. |
| `IsFalsey(value)` | Checks if the value is falsey. | Includes `false`, `0`, `-0`, `0n`, `""`, `null`, `undefined`, and `NaN`. |
| `IsTruthy(value)` | Checks if the value is truthy. | Includes everything not defined as falsey. |
| `IsMeldedMethod(value)` | Checks if the value is a melded method. | Specific to Doh's melding interface. |
| `IsBoolean(value)` | Checks if the value is a boolean. | |
| `IsDefined(value)` | Checks if the value is defined (not undefined and not null). | |
| `IsNullish(value)` | Checks if the value is nullish (undefined or null). | |
| `IsArrayLike(value)` | Checks if the value is array-like. | Includes objects that are iterable and have a length property. |
| `IsIterable(value)` | Checks if the value is iterable. | Must define a `Symbol.iterator`. |
| `IsEnumerable(value)` | Checks if the value is enumerable. | Includes objects that can be iterated over in a `for/in` loop. |
| `IsLiteral(value)` | Checks if the value is a literal. | Static values like strings, booleans, numbers. Excludes objects and arrays. |
| `IsOnlyNumbers(value)` | Checks if the value consists only of numbers. | Matches only numeric characters, including negatives and decimals. |
| `IsKeySafe(value)` | Checks if the value is safe to use as an object key. | Typically strings, excluding empty strings. |
| `HasValue(value)` | Checks if the value is defined and not an empty string. | Includes 0 and negative numbers where `Truthy` does not. |
| `IsStringAndHasValue(value)` | Checks if the value is a non-empty string. | Combines `IsString` and `HasValue` to ensure the value is both a string and not an empty string. |
| `IsEmptyString(value)` | Checks if the value is an empty string. | Returns `true` only if the value is exactly `""`. |
| `IsEmptyObject(value)` | Checks if the value is an empty object or array. | Returns `true` for `{}`, `[]`, or any falsey value (e.g., `null`, `undefined`). This function does **not** differentiate between objects and arrays. |
| `IsObjectObjectAndEmpty(value)` | Checks if the value is an empty object (excluding arrays). | First ensures the value is a plain object (i.e., not an array or literal), then checks if it has no own properties. This is more restrictive than `IsEmptyObject`. |
| `IsObjectObjectAndNotEmpty(value)` | Checks if the value is a non-empty object (excluding arrays). | Ensures the value is a plain object with at least one own property. This function excludes arrays and literals. |
| `IsArrayAndEmpty(value)` | Checks if the value is an empty array. | Returns `true` only if the value is an array with `length === 0`. |
| `IsArrayAndNotEmpty(value)` | Checks if the value is a non-empty array. | Ensures the value is an array with at least one element (`length > 0`). |
| `IsStringOrArray(value)` | Checks if the value is a string or an array. | Useful for handling values that could be either, ensuring they are not objects or other types. |
| `IsStringOrNumber(value)` | Checks if the value is a string or a number. | Ensures the value is either a numeric type or a string, excluding other types like arrays or objects. |
| `IsStringOrArrayOrObjectObject(value)` | Checks if the value is a string, array, or plain object. | Broad check to handle most complex types, excluding literals and functions. |
| `IsArrayOrObjectObject(value)` | Checks if the value is an array or plain object. | Focuses on structures, excluding strings and other primitives. Useful when dealing with collections. |
| `IsAnything(value)` | Always returns true. | Useful in filtering operations. |

### Detailed Explanations

- **`IsFalsey(value)` and `IsTruthy(value)`**:  
  These functions serve as reminders that the truthiness or falsiness of values in JavaScript, where any value can be converted to a boolean, is *NOT* the same as `true` or `false`. `IsFalsey` includes values like `false`, `0`, `-0`, `0n` (BigInt zero), `""` (empty string), `null`, `undefined`, and `NaN`. Anything not in this list is considered `truthy`. These functions provide a way to express this with vocabulary that is serializable using the SeeIf Pack and Serialize systems.

- **`IsMeldedMethod(value)`**:  
  Checks if a method adheres to the Doh melding interface, meaning it has a `meld_stack`