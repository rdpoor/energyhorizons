# Doh.js HTML Differ Module (`html_differ`)

![HTML Differ](^/html-differ.png?size=small)

This Doh.js module provides utilities for comparing two HTML structures, identifying the differences, applying these differences to a live DOM, and visually highlighting the changes. It includes special handling for stylesheet (`<link rel="stylesheet">`) and inline style (`<style>`) updates.

## Features

-   📄 **HTML Comparison**: Compares two HTML strings by parsing them into DOM trees and generating a list of differences (e.g., text changes, attribute changes, node additions/removals).
-   ⚙️ **DOM Patching**: Applies calculated differences to a specified target element in the live DOM. Offers different application modes (`smart`, `replace`, `merge`).
-   ✨ **Visual Highlighting**: Highlights the detected changes directly on the webpage for easy visualization.
-   🎨 **Stylesheet Management**: Intelligently handles updates to external stylesheets (`<link>`) and inline styles (`<style>`), including cache-busting for reloads and refreshing inline style content.
-   🔧 **DOM Utilities**: Includes helper functions for parsing HTML strings, generating CSS-like paths for elements, finding elements based on diff information, and filtering nodes.

## Installation

Install the module using the Doh.js CLI:

```bash
doh install html_differ
```

## Core Concepts

1.  **Compare**: Use `HtmlDiffer.compare()` to compare an `originalHtmlString` with a `newHtmlString`. This returns an array of difference objects.
2.  **Apply**: Use `HtmlDiffer.applyChanges()` to take the original and new HTML strings (or the calculated differences) and apply them to a `targetSelector` in the current document's DOM.
3.  **Highlight**: Use `HtmlDiffer.highlightChanges()` with the differences array to visually mark the changed elements on the page.

## Basic Usage

```javascript
// Load the module
const { HtmlDiffer } = await Doh.load('html_differ');

// Example HTML strings
const originalHtml = '<body><h1>Title</h1><p>Original content.</p></body>';
const newHtml = '<body><h1>New Title</h1><p>Updated content.</p><button>Click me</button></body>';

// 1. Compare the HTML strings
const differences = HtmlDiffer.compare(originalHtml, newHtml, {
    includeHeadChanges: false // Assuming we only care about body changes here
});

console.log('Differences found:', differences);

// 2. Apply the changes to the live DOM (e.g., to the body)
// Make sure the target element exists in your live page
if (document.body) {
    const success = await HtmlDiffer.applyChanges(originalHtml, newHtml, 'body', {
        applyMode: 'smart', // Automatically choose between replace/merge
        reloadStylesheetsOnChange: true // Handle stylesheet updates
    });
    if (success) {
        console.log('Changes applied successfully.');
    } else {
        console.error('Failed to apply changes.');
    }
}

// 3. Highlight the changes (optional)
// Run this *after* applying changes if you want highlights on the final state,
// or use the 'highlightBeforeApply' option in applyChanges.
HtmlDiffer.highlightChanges(differences, 'body');

// Force reload all stylesheets (useful as a fallback or for debugging)
// HtmlDiffer.forceReloadStylesheets();
```

## API Reference

### `HtmlDiffer.compare(originalHtmlString, newHtmlString, options = {})`

Compares two HTML strings and returns an array of difference objects.

-   `originalHtmlString` (String): The initial HTML content.
-   `newHtmlString` (String): The modified HTML content.
-   `options` (Object): Configuration for the comparison.
    -   `includeHeadChanges` (Boolean, default: `true`): Whether to compare the `<head>` section.
    -   `detectSpecialHeadChanges` (Boolean, default: `true`): Identify head changes (scripts, styles, meta) that might need special handling during application.
    -   `filterInsignificant` (Boolean, default: `true`): Ignore differences that are only whitespace changes in text nodes.
    -   `maxDiffs` (Number, default: `100`): Maximum number of differences to return.
-   **Returns**: (Array) An array of difference objects describing the changes.

### `HtmlDiffer.applyChanges(originalHtmlString, newHtmlString, targetSelector, options = {})`

Applies the differences between two HTML strings to a target element in the live DOM.

-   `originalHtmlString` (String): The initial HTML content (used for comparison if differences aren't provided directly).
-   `newHtmlString` (String): The modified HTML content.
-   `targetSelector` (String): A CSS selector for the element in the live DOM to update (e.g., `'body'`, `'#main-content'`, `'html'`).
-   `options` (Object): Configuration for applying changes.
    -   `applyMode` (String, default: `'smart'`): How to apply changes:
        -   `'smart'`: Uses `'replace'` for major structural changes, `'merge'` for minor ones.
        -   `'replace'`: Replaces the `innerHTML` of the target element entirely.
        -   `'merge'`: Attempts to apply only the specific detected changes selectively.
    -   `handleSpecialHeadChanges` (Boolean, default: `true`): Enables special handling for scripts, stylesheets, and critical meta tags in the `<head>`.
    -   `reloadStylesheetsOnChange` (Boolean, default: `true`): Automatically reloads external stylesheets (`<link>`) and refreshes inline styles (`<style>`) when changes are detected. Includes cache-busting for external sheets.
    -   `reloadScriptsOnChange` (Boolean, default: `false`): Attempts to reload/re-execute scripts when changes are detected. *Use with caution.*
    -   `reloadPageOnMajorHeadChanges` (Boolean, default: `false`): Forces a full page reload if major head changes (like adding/removing scripts or critical meta tags) are detected.
    -   `highlightBeforeApply` (Boolean, default: `false`): Highlights changes for 1 second before applying them.
-   **Returns**: (Boolean | Promise<Boolean>) `true` if changes were applied (or attempted), `false` on major errors (like target not found). Returns a Promise if `highlightBeforeApply` is true.

### `HtmlDiffer.highlightChanges(differences, targetSelector)`

Adds CSS classes to elements in the live DOM corresponding to the provided differences.

-   `differences` (Array): The array of difference objects returned by `compare()`.
-   `targetSelector` (String): A CSS selector for the root element within which to find the changed elements.
-   **Returns**: (Boolean) `true` if highlighting was attempted.

### `HtmlDiffer.forceReloadStylesheets()`

Attempts to forcefully reload all external stylesheets (`<link rel="stylesheet">`) by appending a cache-busting parameter and re-evaluating all inline (`<style>`) tags. Useful as a fallback if automatic style updates aren't working as expected.

-   **Returns**: (Boolean) `true`.

## Stylesheet Handling

The module pays special attention to changes within `<link rel="stylesheet">` and `<style>` tags, especially when `handleSpecialHeadChanges` and `reloadStylesheetsOnChange` options are enabled in `applyChanges`.

-   **External Stylesheets (`<link>`)**:
    -   Added stylesheets are appended to the `<head>`.
    -   Removed stylesheets are removed from the DOM.
    -   Modified stylesheets (e.g., changed `href`) are reloaded by creating a new `<link>` element with a cache-busting query parameter (`_reload=timestamp`) and removing the old one after the new one loads to minimize Flash of Unstyled Content (FOUC).
-   **Inline Styles (`<style>`)**:
    -   Changes to the text content of `<style>` tags are applied directly.
    -   Added/removed `<style>` tags are handled.
    -   The module attempts to force the browser to recalculate styles after changes to ensure they take effect.

## Testing

The module includes a `diff.html` file and a `styles/test-styles.css` file that can be used as a basis for testing various diffing and patching scenarios. Load `diff.html` in a browser where Doh.js is running and use the browser's developer console to interact with the `HtmlDiffer` object. 