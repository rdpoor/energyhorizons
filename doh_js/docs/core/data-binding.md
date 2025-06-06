# Data-binding: Stackable Observers for Anything

![Data-binding]({{Package:deploydoh_home}}/images/data-binding.png?size=small)

This guide helps you understand how to use Doh's core data binding tools: `Doh.observe` and `Doh.mimic`. These functions are fundamental to creating reactive applications in Doh, enabling you to automatically synchronize data between different parts of your application and react to changes in real-time. They provide powerful mechanisms for property watching and establishing one-way or two-way data flows.

This guide covers:
* Using `Doh.observe` for one-way property watching and reacting to changes.
* Creating two-way data synchronization between properties with `Doh.mimic`.
* Building reactive networks of connected data objects.
* Integrating data binding with DOM elements using HTML object proxies.
* Understanding performance considerations and safety features.
* Avoiding common pitfalls in reactive programming.

## Observe: One-Way Property Watching

The `Doh.observe` function allows you to monitor changes to a specific property on an object. It establishes a **one-way data flow**, executing callbacks whenever the observed property's value is set. This is ideal for scenarios where one part of your application needs to react to changes initiated elsewhere.

### Syntax

```javascript
const removeObserver = Doh.observe(object, propName, onChangeCallback, onEveryCallback);
```

### Parameters

- `object` - The object containing the property to watch.
- `propName` - The name of the property to observe.
- `onChangeCallback` - (Optional) Function called *only* when the property value actually changes from its previous value.
- `onEveryCallback` - (Optional) Function called on *every* set operation on the property, regardless of whether the value changes.

### Callback Parameters

Callbacks receive these parameters:
- `object` - The object being observed.
- `propName` - The property name being observed.
- `newValue` - The new value being assigned to the property.
- `oldValue` - The previous value of the property (only provided to `onChangeCallback`).

### Return Value

Returns a function. Calling this function will remove the observer and stop the callbacks from firing for future changes.

### Example

```javascript
const user = { name: "John", updates: 0 };

// Observe changes to the 'name' property
const removeNameObserver = Doh.observe(user, "name", 
  (obj, prop, newVal, oldVal) => {
    console.log(`User name changed from ${oldVal} to ${newVal}`);
  }
);

// Observe every update to the 'updates' property
const removeUpdateObserver = Doh.observe(user, "updates", null, // No onChange needed here
  (obj, prop, newVal) => {
    console.log(`User updates counter set to ${newVal}. Total updates: ${newVal}`);
  }
);

user.name = "Jane"; // Logs: "User name changed from John to Jane"
user.name = "Jane"; // Does *not* log, as the value didn't change.

user.updates++;    // Logs: "User updates counter set to 1. Total updates: 1"
user.updates++;    // Logs: "User updates counter set to 2. Total updates: 2"

// Later, to stop observing:
removeNameObserver();
removeUpdateObserver();
```

## Mimic: Two-Way Data Synchronization

The `Doh.mimic` function creates a **two-way binding** between a property on one object and a property on another object. It ensures that if *either* property changes, the other property is automatically updated to match. This is perfect for keeping related data, like a model and a view, perfectly synchronized.

Internally, `Doh.mimic` uses `Doh.observe` on both properties to achieve this mutual synchronization.

### Syntax

```javascript
const removeMimic = Doh.mimic(myObject, myProp, theirObject, theirProp, onChangeCallback);
```

### Parameters

- `myObject` - The first object in the binding pair.
- `myProp` - The property name on the `myObject` to synchronize.
- `theirObject` - The second object in the binding pair.
- `theirProp` - The property name on the `theirObject` to synchronize.
- `onChangeCallback` - (Optional) A callback function that is executed *only* when `myObject[myProp]` changes (either directly or because `theirObject[theirProp]` changed) and its value is different from the previous value.

### Initial Synchronization

Upon calling `Doh.mimic`, the system first checks if the initial values of `myObject[myProp]` and `theirObject[theirProp]` are different. If they are, `myObject[myProp]` is immediately set to the value of `theirObject[theirProp]` *before* the two-way observation begins. This ensures the properties start in a synchronized state without causing an initial echo loop.

### Callback Parameters

The `onChangeCallback` receives:
- `myObject` - The first object (`myObject`).
- `myProp` - The property name on the first object (`myProp`).
- `theirObject` - The second object (`theirObject`).
- `theirProp` - The property name on the second object (`theirProp`).
- `newValue` - The new, synchronized value.
- `oldValue` - The previous value of `myObject[myProp]`.

### Return Value

Returns a function. Calling this function removes the underlying observers, effectively breaking the two-way binding.

### Example

```javascript
const model = { value: 5 };
const view = { displayValue: 0 }; // Starts different

console.log(`Before mimic: model=${model.value}, view=${view.displayValue}`); // model=5, view=0

const removeMimic = Doh.mimic(
  model, "value",        // Source object and property
  view, "displayValue", // Target object and property
  (myThing, myProp, theirThing, theirProp, newVal, oldVal) => {
    // This callback runs when model.value changes
    console.log(`Callback: Model property '${myProp}' changed from ${oldVal} to ${newVal}. View property '${theirProp}' is synchronized.`);
  }
);

console.log(`After mimic: model=${model.value}, view=${view.displayValue}`); // model=0, view=0 (Initial sync: model took view's value)

// Change the model's property
model.value = 10; 
// Output: Callback: Model property 'value' changed from 0 to 10. View property 'displayValue' is synchronized.
console.log(`After model change: model=${model.value}, view=${view.displayValue}`); // model=10, view=10 (View updated)

// Change the view's property
view.displayValue = 15; 
// Output: Callback: Model property 'value' changed from 10 to 15. View property 'displayValue' is synchronized. (Model update triggered the callback)
console.log(`After view change: model=${model.value}, view=${view.displayValue}`); // model=15, view=15 (Model updated)


// Later, to remove the two-way binding:
removeMimic();

// Changes are no longer synchronized
model.value = 20;
console.log(`After removing mimic: model=${model.value}, view=${view.displayValue}`); // model=20, view=15
```

## Networking Observers

Both `observe` and `mimic` utilize a stack-based approach for managing callbacks. This design enables the creation of powerful "networks" of observations, where data changes can propagate through multiple interconnected objects.

### Observer Networks

You can chain observers and mimics together to create complex data flow networks. A change initiated at one point can trigger a cascade of updates through connected objects. This architecture encourages building stable "observation anchors" while maintaining flexibility in how different parts of your application react to data changes.

```javascript
// Create a network: data <-> ui -> analytics
const data = { value: 0 };
const ui = { display: 0 };
const analytics = { lastValue: 0 };
const logger = { message: '' };

// 1. Two-way binding between data model and UI display
Doh.mimic(data, "value", ui, "display");

// 2. One-way observation: Analytics watches the UI display
Doh.observe(ui, "display", (obj, prop, newVal) => {
  analytics.lastValue = newVal;
  console.log(`Analytics: UI updated to ${newVal}`);
});

// 3. One-way observation: Logger also watches the UI display
Doh.observe(ui, "display", (obj, prop, newVal) => {
    logger.message = `UI display is now ${newVal}`;
    console.log(`Logger: ${logger.message}`);
});


// Trigger a change in the data model
data.value = 50; 
// Console output will show:
// -> Analytics: UI updated to 50
// -> Logger: UI display is now 50 

console.log(ui.display); // 50
console.log(analytics.lastValue); // 50
console.log(logger.message); // "UI display is now 50"

// Trigger a change from the UI side
ui.display = 100;
// Console output will show:
// -> Analytics: UI updated to 100
// -> Logger: UI display is now 100

console.log(data.value); // 100 (updated via mimic)
console.log(analytics.lastValue); // 100
console.log(logger.message); // "UI display is now 100"
```

Because observers and mimics are managed internally using callback stacks, the system reliably propagates changes regardless of where you attach your observers within a network.

## DOM Integration

### HTML Object Proxies

A key feature of Doh's data binding is its seamless integration with HTML DOM elements through special proxy objects. When you work with Doh's HTML objects (created via `New('ElementType')` or similar), their `attr` and `css` properties are proxies specifically designed for observation.

This allows you to directly `observe` or `mimic` HTML attributes and CSS style properties:

```javascript
// Create Doh HTML elements
const button = New('Button', { text: 'Click Me' });
const panel = New('Panel', { style: 'height: 100px; background-color: lightblue;' });

// Observe the 'disabled' attribute of the button
Doh.observe(button.attr, "disabled", (obj, prop, newVal) => {
  console.log(`Button is now ${newVal ? "disabled" : "enabled"}`);
});

// Observe the 'height' CSS property of the panel
Doh.observe(panel.css, "height", (obj, prop, newVal, oldVal) => {
  console.log(`Panel height changed from ${oldVal} to ${newVal}`);
  // Potentially trigger layout adjustments
  // updateLayout(); 
});

// --- Trigger Changes Programmatically ---

// Disable the button - triggers the first observer
button.attr.disabled = true; // Logs: Button is now disabled

// Change the panel's height - triggers the second observer
panel.css.height = '150px'; // Logs: Panel height changed from 100px to 150px

// Enable the button again
button.attr.disabled = false; // Logs: Button is now enabled

// Note: If the browser or user interaction changes these attributes/styles
// (and Doh reflects these changes back to the proxies), the observers
// would trigger accordingly, creating a powerful link between your 
// JavaScript logic and the live DOM state.
```

This capability creates a robust bridge, allowing your data model and JavaScript logic to react to changes in the visible UI, and vice-versa.

## Performance and Safety

### High-Performance Applications

The `observe` and `mimic` systems are optimized for performance and have been successfully used in demanding production environments, including applications requiring smooth 60+ fps animations. They provide an efficient alternative to manual data synchronization methods, imposing minimal overhead.

### Loop Protection

Reactive systems can sometimes lead to infinite loops or performance issues if not carefully managed. Doh incorporates several safety mechanisms to mitigate these risks in complex observation networks:

1.  **Queue Size Limits**: Prevents infinite observation cascades by limiting the number of pending updates in the internal queue.
2.  **Processing Throttling**: Ensures stability by introducing micro-delays (`setTimeout(0)`) between processing queued updates, preventing the system from hogging the event loop.
3.  **Value Change Detection**: The `onChangeCallback` in `observe` and the internal logic of `mimic` only propagate updates when a value *actually* changes, preventing unnecessary callback executions and potential cycles.
4.  **Asynchronous Processing**: Callbacks are generally processed asynchronously, helping to maintain UI responsiveness even during complex update sequences.

These built-in protections allow developers to build sophisticated reactive systems with greater confidence, reducing the likelihood of encountering common pitfalls associated with reactive programming.

## Implementation Details

Under the hood, `observe` and `mimic` leverage JavaScript's property descriptors, defining custom getters and setters for the observed properties.

-   `observe`: Creates a setter that manages a queue of `onChangeCallback` and `onEveryCallback` functions. It processes this queue asynchronously, invoking callbacks appropriately based on value changes.
-   `mimic`: Essentially sets up two `observe` calls – one for each property pointing at the other – to create the bidirectional synchronization. It includes the logic for initial state synchronization.

The implementation ensures that if a property already has native getters or setters, Doh preserves this original behavior by incorporating them into the observation mechanism, ensuring compatibility while adding reactive capabilities. The use of callback stacks allows multiple observers to coexist on the same property without conflict. 