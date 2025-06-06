# Stylesheet Module

This module provides utilities for manipulating CSS stylesheets dynamically within the browser environment. It includes a core `Doh.css` function for basic style injection and integrates a more powerful jQuery plugin (`$.stylesheet`) for advanced CSS rule management.

## Core Function: `Doh.css(cssContent, [styleElement])`

This is the primary function for adding CSS rules to the document.

*   **Purpose**: Creates a `<style>` element (if one doesn't exist or isn't provided) and appends CSS rules to it.
*   **Parameters**:
    *   `cssContent` (String): The CSS rules to add (e.g., `"body { background-color: blue; }"`).
    *   `styleElement` (HTMLStyleElement, Optional): An existing `<style>` element to append the CSS to. If omitted, it uses a default, cached `<style>` element, creating it if necessary.
*   **Returns**: (HTMLStyleElement) The `<style>` element that was created or updated.

**Example:**

```javascript
// Add a simple rule to the default style element
Doh.css(".my-class { color: red; }");

// Create a specific style element and add rules to it
const myStyle = document.createElement('style');
document.head.appendChild(myStyle);
Doh.css("p { font-size: 16px; }", myStyle);
Doh.css("a { text-decoration: none; }", myStyle);
```

## jQuery Stylesheet Plugin (`$.stylesheet`)

The module also bundles a jQuery plugin (`$.stylesheet`) for more complex CSS manipulations.

**Author**: Vimal Aravindashan
**Version**: 0.3.7
**License**: MIT

### Overview

This plugin allows you to select CSS rules (potentially filtered by stylesheet ID or href) and then get, set, or delete their properties.

### Factory Function: `$.stylesheet(selector, [name], [value])`

This function acts as both a constructor for `$.stylesheet` objects and a shortcut for applying CSS changes immediately.

*   **Purpose**: Creates a new `$.stylesheet` object instance or directly modifies CSS rules.
*   **Parameters**:
    *   `selector` (String): A CSS selector string. It can optionally include a stylesheet filter prefix (e.g., `'#mySheet { .my-rule }'` or `'* { .my-rule }'`).
    *   `name` (String | Array | Object, Optional): The CSS property name(s) to get or set.
        *   If a string (e.g., `'color'`), gets or sets a single property.
        *   If an array (e.g., `['color', 'font-size']`), gets multiple properties.
        *   If an object (e.g., `{ color: 'blue', 'font-size': '14px' }`), sets multiple properties.
    *   `value` (String, Optional): The value to set for the specified `name`. Used only when `name` is a string.
*   **Returns**: (`$.stylesheet` | String | Object)
    *   If `name` and `value` are omitted: Returns a new `$.stylesheet` object instance representing the matched rules.
    *   If `name` is a string and `value` is omitted: Returns the current value of the CSS property for the first matched rule.
    *   If `name` is an array and `value` is omitted: Returns an object containing the current values of the specified properties.
    *   If `value` (or an object for `name`) is provided: Returns the `$.stylesheet` instance for chaining.

### Static Methods

*   `$.stylesheet.cssRules(selector)`: Returns an array of raw `CSSStyleRule` objects matching the selector (and optional stylesheet filter).
*   `$.stylesheet.camelCase(hyphenatedName)`: Converts a hyphenated CSS property name to camelCase (e.g., `'font-size'` to `'fontSize'`).
*   `$.stylesheet.cssStyleName(name)`: Takes a CSS property name (hyphenated or camelCase) and returns the browser-specific version (including vendor prefixes if necessary) that can be used to access the property via the `style` object (e.g., `'border-radius'` might return `'WebkitBorderRadius'` on some browsers).

### Instance Methods (on `$.stylesheet` objects)

*   `rules()`: Returns a copy of the array of `CSSStyleRule` objects matched by the selector when the `$.stylesheet` object was created.
*   `css(name, [value])`: Gets or sets CSS properties for the matched rules. Behaves similarly to the factory function shortcut but operates on the existing set of matched rules.
    *   `myStylesheet.css('color')`: Gets the color.
    *   `myStylesheet.css('color', 'red')`: Sets the color.
    *   `myStylesheet.css({ color: 'red', 'font-weight': 'bold' })`: Sets multiple properties.
    *   `myStylesheet.css(null)`: Deletes the matched CSS rules entirely.

### Examples

```javascript
// Get the background color of all h1 elements in the '#main-styles' stylesheet
const bgColor = $.stylesheet('#main-styles { h1 }', 'background-color');
console.log('H1 Background:', bgColor);

// Set the font size and color for all elements with class 'highlight'
const highlightStyle = $.stylesheet('.highlight'); // Create instance
highlightStyle.css({
  'font-size': '1.2em',
  'color': 'purple'
});

// Add a new rule using the plugin's internal mechanism
// (Creates rule if it doesn't exist)
$.stylesheet('.new-rule', 'border', '1px solid green');

// Get multiple properties
const props = $.stylesheet('p').css(['margin-top', 'line-height']);
console.log('Paragraph styles:', props);

// Delete a rule
$.stylesheet('.old-rule').css(null);
```

### Notes

*   The plugin handles browser inconsistencies and vendor prefixes.
*   It internally uses an efficient mechanism to add/delete rules.
*   When setting properties, it typically modifies the *first* matched rule if multiple exist, unless creating a new rule.
*   The stylesheet filter in the selector (`#id { selector }` or `href { selector }`) allows targeting specific stylesheets. 