
# The `html` Pattern: DOM and UI Components

![HTML]({{Package:deploydoh_home}}/images/html.png?size=small)

The `html` [Pattern](/docs/patterns/patterns) provides a straightforward, object-oriented interface for creating and managing DOM elements within Doh applications. It simplifies **DOM manipulation**, **event handling**, and the creation of reusable **UI components**.

This guide covers:
*   Basic HTML element creation and manipulation
*   Pattern-level **CSS styling**
*   Using **property proxies** (`classes`, `css`, `attr`)
*   **Event handling** and the `html_phase` **lifecycle** phase
*   Integration with the **Sub-Object-Builder** for nested elements
*   **Data binding** with HTML elements

> **jQuery Dependency:** Note that the `html` pattern relies heavily on **jQuery** for its core DOM manipulation and event handling capabilities, accessed primarily through the `this.e` property (which is a jQuery object wrapping the element).

## Basic Usage

Create an HTML object instance using the [`New`](/docs/patterns/lifecycle) function:

```javascript
let myDiv = New('html', {
    //tag: 'div',  // div is the default tag
    css: { backgroundColor: 'lightblue', padding: '10px' },
    html: 'Hello, Doh!', // Sets innerHTML
    attr: { id: 'myUniqueDiv' },
    // This button will be auto-built via the Sub-Object-Builder
    button: {
        pattern: 'html', 
        tag: 'button',
        html: 'Click me'
    }
});

// Default Behavior: Automatic DOM Append
// By default, the created element (myDiv.e) is automatically appended 
// to document.body during its 'html_phase'. This can be customized.
```

This creates a `<div>` element (the default `tag` if unspecified), applies styles and attributes, sets its content, and uses the [Sub-Object-Builder](/docs/patterns/sub-object-builder) to create a nested button.

## Pattern-level CSS Styling

Doh provides an elegant way to define CSS styles at the pattern level, which are then applied to all instances of that pattern. This approach offers several advantages:

1. Consistent styling across all instances of a pattern
2. Improved performance by using CSS classes instead of inline styles
3. Cleaner component code without repetitive style definitions

When you define a pattern with `css` or `style` properties, Doh automatically:

```javascript
Pattern('StyledCard', 'html', {
    // These CSS properties will be converted to a class
    css: {
        backgroundColor: 'white',
        borderRadius: 8,        // Numeric values are automatically converted to 'px'
        padding: 20,            // This becomes '20px' in the CSS
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        margin: '10px 0'
    },
    // Style string is also supported and merged with css object
    style: 'display: flex; flex-direction: column;'
});

// Create an instance - it will automatically have the pattern's styling
let card = New('StyledCard', {
    html: 'This card has pre-defined styling from its pattern'
});
```

### How Pattern Styling Works

Behind the scenes, when you define a pattern with CSS:

1. A unique CSS class name is generated (e.g., 'doh-StyledCard')
2. A stylesheet rule is created with all the defined styles
3. The class is added to the pattern's `classes` array
4. When instances are created, they automatically receive this class
5. Numeric values are automatically converted to pixels (except for z-index and opacity)
6. The original CSS and style definitions are stored in `initial_css` and `initial_style` for reference

This system allows for efficient styling that separates style definitions from component behavior.

## Property Proxies

The `html` pattern provides convenient proxies for interacting with common element properties, simplifying direct DOM access.

### Classes Proxy

```javascript
let myElement = New('html', {
    tag: 'span',
    html_phase: function() {
        // Add classes
        this.classes.push('highlight');
        this.classes('important', 'large');

        // Remove a class
        delete this.classes.important;

        // Check if a class exists
        if ('highlight' in this.classes) {
            console.log('Element is highlighted');
        }

        // Iterate over classes
        for (let className of this.classes) {
            console.log(className);
        }

        // Get class count
        console.log(this.classes.length);

        // Convert to string
        console.log(this.classes.toString());
    }
});
```

### CSS Proxy

```javascript
let styledElement = New('html', {
    tag: 'p',
    html_phase: function() {
        // Set individual properties
        this.css.color = 'navy';
        this.css.fontSize = '16px';

        // Get a property
        console.log(this.css.color);

        // Remove a property
        this.css.color = '';

        // Batch update
        this.css({
            backgroundColor: 'lightyellow',
            border: '1px solid gray',
            padding: '5px'
        });

        // Vendor prefixes
        this.css.webkitTransform = 'rotate(45deg)';

        // Get computed style (read-only)
        console.log(this.css.display);
    }
});
```

### Attributes Proxy

```javascript
let attributeElement = New('html', {
    tag: 'a',
    html_phase: function() {
        // Set attributes
        this.attr.href = 'https://example.com';
        this.attr.target = '_blank';

        // Get an attribute
        console.log(this.attr.href);

        // Remove an attribute
        delete this.attr.target;

        // Check attribute existence
        if ('href' in this.attr) {
            console.log('Link has an href');
        }

        // Batch update
        this.attr({
            'data-custom': 'value',
            'aria-label': 'Visit Example'
        });

        // Boolean attributes
        this.attr.disabled = true;
        console.log(this.attr.disabled); // Returns 'disabled' if set, undefined otherwise
    }
});
```

## Event Handling & `html_phase`

The `html` pattern defines a specific [lifecycle phase](/docs/patterns/lifecycle) called `html_phase`. This phase executes *after* the element (`this.e`) has been created and **automatically appended to the DOM** (usually `document.body`, unless `parent` or `target` properties specify otherwise).

**`html_phase` is the standard place to attach event listeners or perform DOM manipulations that require the element to be in the document.**

```javascript
let interactiveElement = New('html', {
    tag: 'button',
    html: 'Click me',
    // Logic inside html_phase runs after the button is in the DOM
    html_phase: function() { 
        // Use the jQuery proxy 'this.e' to bind events
        this.e.on('click', () => {
            console.log('Button clicked!');
            this.css.backgroundColor = 'yellow'; // Use CSS proxy
        });

        // Multiple events
        this.e.on('mouseenter mouseleave', (event) => {
            this.css.opacity = event.type === 'mouseenter' ? '0.8' : '1';
        });

        // Delegated events (assuming child elements with this class)
        this.e.on('click', '.child-element', (event) => {
            console.log('Child element clicked');
        });
    }
});
```

## Lifecycle Phases

The `html` pattern inherits the standard [object lifecycle phases](/docs/patterns/lifecycle) (`object_phase`, `builder_phase`, etc.) and adds the `html_phase`. You can use hooks (`pre_`, `post_`) for any phase.

**Note:** Like all standard phases, `html_phase` **and its `pre_`/`post_` hooks must be synchronous**. If you need to perform asynchronous actions related to the element (e.g., fetching data to populate it), trigger them *after* the synchronous phases complete by calling a separate `Async_Method` after `New()` returns. Within `html_phase` (and its `pre_`/`post_` hooks), you can safely access `this.e`.

```javascript
Pattern('CustomHtmlComponent', 'html', {
    //tag: 'div',
    object_phase: function() {
        // Runs early: Basic setup, data initialization
        this.data = { clicks: 0 };
    },
    
    builder_phase: function() {
        // Runs after object_phase: Child elements are built here
        // (e.g., if this pattern had properties with a 'pattern' key)
    },

    pre_html_phase: function(){
        // Runs just before element is appended to DOM
        // Good place for last-minute setup before rendering
    },

    html_phase: function() {
        // Runs after element is in the DOM
        // Standard place for event binding, post-append manipulation
        this.e.on('click', () => {
            this.data.clicks++;
            this.childButton.html = `Clicks: ${this.data.clicks}`;
        });
    },

    post_html_phase: function(){
        // Runs after html_phase completes
    },

    // Define a child to be built automatically
    childButton: { pattern: 'html', tag: 'button', html: 'Clicks: 0' }
});

New('CustomHtmlComponent');
```

## DOM Manipulation (via jQuery Proxy `this.e`)

Direct **DOM manipulation** relies on the `this.e` property, which is a **jQuery object** wrapping the component's root DOM element.

```javascript
let parentElement = New('html', {
    html_phase: function() {
        // Use standard jQuery methods on this.e
        this.e.text('New Text Content');
        this.e.addClass('processed');
        this.e.append('<p>Appended paragraph</p>');
    }
});
```

## Control Registration System (Simplified)

Doh provides a mechanism for UI components (often inheriting `html` or `control` patterns) to automatically register themselves with a designated parent "controller" object. This happens during the component's `control_phase` (another synchronous lifecycle phase).

*   The component finds its controller (usually an ancestor with `is_controller: true`).
*   It registers itself in the controller's `controls` object (e.g., `controller.controls.myButton = this`).

This allows controllers to easily manage their child components. While more advanced coordination is possible (e.g., pausing builds until all controls register), the basic concept is straightforward registration for better organization.

## Data Binding

You can use Doh's standard data binding tools (`Doh.mimic`, `Doh.observe`) with `html` pattern instances.

A powerful feature is the ability to observe nested properties within the `css` and `attr` proxies. This allows you to react directly to changes in specific styles or attributes applied to the DOM element.

```javascript
let myElement = New('html', { css: { color: 'blue' } });

// Observe changes to the element's color style
Doh.observe(myElement.css, 'color', (target, prop, newValue, oldValue) => {
    console.log(`Color changed from ${oldValue} to ${newValue}`);
});

// Later, changing the proxy property triggers the observer AND updates the DOM
myElement.css.color = 'red'; // Logs: "Color changed from blue to red"
```