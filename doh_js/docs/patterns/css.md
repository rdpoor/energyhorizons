# CSS in Doh.js: Comprehensive Guide

## Overview of CSS Management in Doh.js

Doh.js provides several powerful approaches to managing CSS:

1. **`Doh.css()` function**: Dynamically create and manage global stylesheet elements
2. **Pattern-level CSS styling**: Define CSS at the pattern level that automatically applies to all instances
3. **CSS Proxy (`this.css`)**: Element-specific styling using property proxies
4. **CSS Class Management (`this.classes`)**: Class-based styling using DOM class manipulation

This document covers all these approaches, with guidance on when to use each technique.

## The `Doh.css()` Function

### Basic Usage

```javascript
// Add CSS rules to the default cached style element
Doh.css(`
  .custom-box {
    background-color: #f0f0f0;
    border: 1px solid #ccc;
    padding: 20px;
    margin: 10px;
    border-radius: 5px;
  }
`);
```

### Internal Caching

The `Doh.css()` function uses an internal cache to manage style elements. When called without a specific style element parameter, it will:

1. Check if a default style element exists in the cache
2. If no cached element exists, create a new one and cache it
3. Add the CSS content to the cached style element
4. Return the style element reference

This approach minimizes the number of style elements created in the document.

### Creating Multiple Style Elements

While the default behavior uses a cached style element, you can still create separate style elements when needed:

```javascript
// Create a new, separate style element
const themeStyles = document.createElement('style');
themeStyles.setAttribute('type', 'text/css');
document.head.appendChild(themeStyles);

// Use the custom style element with Doh.css
Doh.css(`
  :root {
    --primary-color: blue;
    --secondary-color: navy;
  }
`, themeStyles);
```

### Appending to Existing Style Elements

```javascript
// Get a reference to an existing style element
const myStyleElement = document.querySelector('#my-styles');

// Append more styles to it
Doh.css(`
  .theme-button { background-color: blue; }
`, myStyleElement);
```

### Function Parameters

```javascript
/**
 * Creates or updates a style element with the provided CSS content
 * @param {string} cssContent - CSS rules to include in the style tag
 * @param {HTMLStyleElement} [styleElement] - Optional existing style element to update
 * @returns {HTMLStyleElement} - The created or updated style element
 */
```

## Pattern-Level CSS (Automatic Class Generation)

One of Doh's most powerful features is the ability to define CSS styles at the pattern level, where they are automatically:

1. Converted to CSS classes
2. Added to the document
3. Applied to all instances of the pattern

### Example

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
    // Raw CSS string is also supported and merged with css object
    style: 'display: flex; flex-direction: column;'
});

// Create an instance - it will automatically have the pattern's styling
let card = New('StyledCard', {
    html: 'This card has pre-defined styling from its pattern'
});
```

### How Pattern Styling Works

When you define a pattern with CSS properties:

1. A unique CSS class name is generated (e.g., 'doh-StyledCard')
2. CSS properties are converted to a CSS rule and added to a stylesheet
3. The class is added to `initial_classes` array
4. All pattern instances automatically get this class
5. Style definitions are stored in `initial_css` and `initial_style` properties

## The CSS Proxy (`this.css`)

For element-specific styling, the `html` pattern provides a convenient `css` proxy that manages inline styles on the element.

```javascript
let element = New('html', {
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

        // Get computed style
        console.log(this.css.display);
    }
});
```

### Advantages of the CSS Proxy

1. **Direct property access**: Set styles using property notation rather than jQuery's `css()` method
2. **Batch updates**: Apply multiple styles at once by passing an object
3. **Two-way binding**: Changes to proxy properties instantly update the DOM
4. **Observability**: You can observe changes to specific CSS properties
5. **Auto-conversion**: Numeric values are automatically converted to pixel values

## The Classes Proxy (`this.classes`)

Doh's `html` pattern also includes a proxy for managing CSS classes that's more powerful than standard DOM class manipulation.

```javascript
let element = New('html', {
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

## Data Binding with CSS

You can observe and react to changes in CSS properties using Doh's data binding system.

```javascript
let myElement = New('html', { 
    css: { color: 'blue' }
});

// Observe changes to the element's color style
Doh.observe(myElement.css, 'color', (target, prop, newValue, oldValue) => {
    console.log(`Color changed from ${oldValue} to ${newValue}`);
});

// Later, changing the proxy property triggers the observer AND updates the DOM
myElement.css.color = 'red'; // Logs: "Color changed from blue to red"
```

## Best Practices: When to Use Each Approach

### Use `Doh.css()` when:

- You need to define global styles that apply across components
- You're implementing dynamic theming with variables
- You want to manage styles programmatically (add/remove entire stylesheets)
- You need to use complex CSS selectors or media queries

### Use Pattern-level CSS when:

- Defining reusable components that need consistent styling
- Creating a component library with standard styling
- Styling should be part of the component definition
- Performance is critical (class-based styling is faster than inline styles)

### Use the CSS Proxy (`this.css`) when:

- Styles need to be dynamic and specific to individual instances
- You need to modify styles in response to events or state changes
- You want to manipulate specific properties at runtime
- You're integrating with external systems that need direct style access

### Use the Classes Proxy (`this.classes`) when:

- You want to toggle predefined styles (defined elsewhere)
- Working with libraries that use class-based styling
- Implementing stateful UI (active, hover, selected states)
- You need cleaner markup (classes vs. inline styles)

## Example: Comprehensive CSS Management

```javascript
// 1. Define global theme styles
Doh.css(`
  :root {
    --primary-color: #3498db;
    --secondary-color: #2980b9;
    --text-color: #333;
    --background-color: #f4f4f4;
  }

  body {
    background-color: var(--background-color);
    color: var(--text-color);
    font-family: sans-serif;
  }

  .theme-button {
    background-color: var(--primary-color);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
  }

  .theme-button:hover {
    background-color: var(--secondary-color);
  }
`);

// 2. Define a styled component with pattern-level CSS
Pattern('Card', 'html', {
  css: {
    backgroundColor: 'white',
    borderRadius: 8,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    padding: 20,
    margin: '20px 0'
  }
});

// 3. Create a component that combines pattern-level styling,
// classes proxy, and css proxy
Pattern('DynamicCard', 'Card', {
  init: function(options) {
    this.options = options || {};
    this.expanded = false;
  },
  
  html_phase: function() {
    // Add a theme class using classes proxy
    this.classes.push('theme-card');
    
    // Set dynamic styles using css proxy
    if (this.options.height) {
      this.css.height = this.options.height;
    }
    
    // Create content
    this.e.html(`
      <h3>${this.options.title || 'Card Title'}</h3>
      <div class="card-content">${this.options.content || ''}</div>
      <button class="theme-button">Toggle</button>
    `);
    
    // Add event handling
    this.e.find('button').on('click', () => {
      this.expanded = !this.expanded;
      this.css.height = this.expanded ? 'auto' : this.options.height;
      
      // Toggle classes
      if (this.expanded) {
        this.classes.push('expanded');
      } else {
        delete this.classes.expanded;
      }
    });
  }
});

// 4. Create a new style element for a specific feature
const darkModeStyles = document.createElement('style');
document.head.appendChild(darkModeStyles);

// 5. Change theme at runtime
function updateTheme(darkMode) {
  if (darkMode) {
    Doh.css(`
      :root {
        --primary-color: #2c3e50;
        --secondary-color: #1a252f;
        --text-color: #ecf0f1;
        --background-color: #34495e;
      }
    `, darkModeStyles);
  } else {
    // Clear dark mode styles
    darkModeStyles.textContent = '';
  }
}
```

## See Also
- [HTML Pattern documentation](/docs/patterns/html)
- [Property Proxies](/docs/patterns/html#property-proxies)
- [Data Binding](/docs/core/data-binding) 