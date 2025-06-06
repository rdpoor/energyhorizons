# DU (Data Utilities) Module

This module provides a simple set of data utility functions, primarily focused on converting between JavaScript objects and serialized formats like JSON and YAML.

It populates a global `du` object (creating it if necessary) with helper methods.

## Features

-   **YAML Conversion**: Provides functions to stringify JS objects to YAML and parse YAML strings back to JS objects.
-   **JSON Conversion**: Provides functions to stringify JS objects to JSON and parse JSON strings back to JS objects.

## Installation

Install the module using the Doh.js CLI:

```bash
doh install du
```

This will install the `du` module and its dependencies (including the `yaml` module).

## Usage

Once the module is loaded, the utility functions are available on the global `du` object:

```javascript
// Ensure the module is loaded, e.g., via Doh.load or as a dependency

// YAML
const yamlString = du.toYaml({ key: 'value', list: [1, 2] });
// yamlString = "key: value\nlist:\n  - 1\n  - 2\n"
const jsObjectFromYaml = du.fromYaml(yamlString);
// jsObjectFromYaml = { key: 'value', list: [1, 2] }

// JSON
const jsonString = du.toJson({ key: 'value', list: [1, 2] });
// jsonString = "{\"key\":\"value\",\"list\":[1,2]}"
const jsObjectFromJson = du.fromJson(jsonString);
// jsObjectFromJson = { key: 'value', list: [1, 2] }
```

## Provided Functions

-   `du.toYaml(data)`: Converts a JavaScript object/value to a YAML string.
-   `du.fromYaml(data)`: Parses a YAML string into a JavaScript object/value.
-   `du.toJson(data)`: Converts a JavaScript object/value to a JSON string.
-   `du.fromJson(data)`: Parses a JSON string into a JavaScript object/value.

## Dependencies

-   `du_YAML` (sub-module)
    -   `yaml` (likely the js-yaml library module)
-   `du_JSON` (sub-module)

</rewritten_file> 