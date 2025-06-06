![Dataforge](^/dataforge.png?size=small)

Dataforge is a Doh.js module providing a powerful system for defining and executing data manipulation pipelines using chained commands. It features synchronous (`Dataforge`) and asynchronous (`AsyncDataforge`) execution contexts, branching, data conversion, and various transformation utilities.

This module bundles several sub-modules:
*   `dataforge_core`: The essential commands and patterns.
*   `YAML_dataforge`: Adds YAML conversion commands.
*   `nodejs_fs_dataforge`: Adds file system commands (Node.js only).
*   `db_dataforge`: Adds sqlite3 through better-sqlite3 for Node, bun:sqlite for Bun, and Alasql for Browser.


## This guide covers:
*   Installation
*   Core Concepts (Dataforge vs AsyncDataforge, Branching, Modes)
*   Core Commands
*   Branching & Control Flow Commands
*   Data Conversion Commands
*   Handlebars Templating Commands
*   Data Manipulation Commands (Meld, Each)
*   String Operation Commands
*   Number Operation Commands
*   Sanitization & Escaping Commands
*   Asynchronous Commands (`AsyncDataforge` only)
*   YAML Commands
*   File System Commands (Node.js only)

## Installation

Install the module using the Doh.js CLI:

```bash
doh install dataforge
```

This installs the `dataforge` module and its core dependencies. Specific features might require additional Node.js dependencies (like `js-yaml` or database drivers) which are typically handled by Doh.js installation processes for those sub-modules.

## Core Concepts

### `Dataforge` vs `AsyncDataforge` Patterns

Dataforge operations are executed using instances of either the `Dataforge` or `AsyncDataforge` patterns.

*   **`Dataforge` (Synchronous):**
    *   Executes commands synchronously.
    *   Cannot handle overlapping `forge()` calls on the same instance (will error).
    *   Suitable for simple, linear data transformations.

    ```javascript
    // Requires 'dataforge' module
    Doh.Module('my_module', ['dataforge'], function() {
        let df = New('Dataforge');
        let result = df.forge('initial data', [
            { Append: ' - transformed' }
        ]);
        console.log(result); // Output: 'initial data - transformed'
    });
    ```

*   **`AsyncDataforge` (Asynchronous):**
    *   Executes commands asynchronously, returning a Promise from `forge()`.
    *   Includes asynchronous commands (like `Fetch`, `Post`).
    *   **Uses an internal queue:** Overlapping `forge()` calls on the *same* instance are queued and executed sequentially, preventing race conditions for operations relying on shared state within that instance (like local branches or sequential processing).
    *   Suitable for pipelines involving I/O, API calls, or complex sequences.
    *   **Parallelism:** To achieve true parallel execution (e.g., multiple simultaneous API calls), use *separate* `AsyncDataforge` instances for each parallel task.

    ```javascript
    // Requires 'dataforge' module
    Doh.Module('my_module', ['dataforge'], async function() {
        let adf = New('AsyncDataforge');
        let result = await adf.forge('initial data', [
            { Append: ' - asynchronously transformed' }
        ]);
        console.log(result); // Output: 'initial data - asynchronously transformed'
    });
    ```

### Branching (Execution Contexts)

Dataforge uses branches to manage data contexts. Each branch holds its own data register and mode settings.

*   **`main` branch:** The default starting and returning branch.
*   **Local Branches:**
    *   Created using the `Branch` command.
    *   Scoped to a *single* `forge()` execution. They are cleared when the `forge()` call completes.
    *   Useful for temporary calculations or sub-pipelines.
*   **Global Branches:**
    *   Created or accessed using the `Global` command.
    *   Persist across *all* `forge()` calls on *all* Dataforge instances (synchronous and asynchronous).
    *   Useful for sharing state between different pipeline executions, but require careful management to avoid race conditions, especially with parallel `AsyncDataforge` instances.
*   **Anonymous Branches:** If no name is provided to `Branch` or `Global`, an anonymous branch (e.g., `anon0`, `anon1`) is created.

### Modes (`Replace`, `Append`, `Prepend`)

The *mode* determines how the result of a command updates the data in the current branch.

*   **`Replace` (Default):** The command's result overwrites the branch's current data.
*   **`Append`:** The command's result is appended to the branch's data (string concatenation, array concat, object merge).
*   **`Prepend`:** The command's result is prepended to the branch's data.

Modes can be set persistently using `Mode` or temporarily for the next command using `Replace`, `Append`, or `Prepend`.

## Command Syntax

Commands are passed as an array to the `forge()` method.

*   **String:** Represents a command with no arguments: `"CommandName"`
*   **Object:** Represents a command with arguments: `{ "CommandName": argOrArgs }`
    *   `argOrArgs` can be a single value or an array of values.

## Core Commands

### `Import`
Replaces the current branch data with the provided argument. Respects the current mode.
```javascript
// Default mode (Replace)
df.forge('old data', [{Import: "new data"}]); // Result: "new data"

// Append mode
df.forge('old data', ["Append", {Import: " new data"}]); // Result: "old data new data"
```
*Alias: `ImportFromValue`*

### `ConsoleLog`
Logs the current branch data (if no arguments) or the provided arguments to the console.
```javascript
df.forge('data to log', [
    "ConsoleLog", // Logs: 'data to log'
    { ConsoleLog: "Custom message" } // Logs: "Custom message"
]);
```

### `Empty`
Sets the current branch data to an empty string `''`.
```javascript
df.forge('some data', ["Empty"]); // Result: ''
```

### `Debugger`
Triggers the browser/Node.js debugger statement, pausing execution if developer tools are open.
```javascript
df.forge('data', ["Debugger"]); // Pauses here
```

## Branching & Control Flow Commands

### `Mode`
Sets the persistent mode (`Replace`, `Append`, `Prepend`) for the current branch.
```javascript
df.forge('data', [
    { Mode: "Append" },
    { Import: " more" } // Appends
    // Mode remains Append for subsequent commands in this branch
]);
```

### `Replace`, `Append`, `Prepend` (Temporary Mode)
Sets the mode for the *next command only*. Can optionally take data as an argument to perform an immediate Import with that temporary mode.
```javascript
// Set temp mode for next command
df.forge('data', ["Append", { Import: " next" }]); // Result: "data next"

// Import immediately with temp mode
df.forge('data', [{ Append: " immediate" }]); // Result: "data immediate"
```

### `Branch`
Executes a sub-pipeline (array of commands) in a specified or anonymous local branch. The current branch data is implicitly copied to the new branch on initialization.
```javascript
df.forge('main data', [
    { Branch: ['subBranch', [
        // Now in 'subBranch', data is 'main data'
        { Append: ' - modified' },
        "Return" // Returns 'main data - modified' to main branch
    ]]}
    // Back in 'main' branch
]); // Result: "main data - modified"
```

### `Global`
Like `Branch`, but operates on or creates a *global* branch that persists across `forge()` calls and instances.
```javascript
// First call
df.forge('initial', [{ Global: ['sharedState', [{ Append: ' first' }]]}]);

// Second call (same or different instance)
df.forge('something else', [
    { From: 'sharedState' } // Retrieves 'initial first'
]);
```

### `Return`
Exits the current branch and returns control to the outer (calling) branch. If called from the `main` branch, it exits the entire `forge()` execution.
*   Without arguments: Returns the current branch's data to the outer branch (respecting the outer branch's mode).
*   With argument: Returns the *argument value* to the outer branch (respecting the outer branch's mode).
```javascript
df.forge('outer', [
    { Branch: ['inner', [
        { Import: 'inner value' },
        { Return: 'explicit return' } // Returns 'explicit return'
    ]]}
]); // Result: 'explicit return'
```

### `From`
Imports data from the specified branch into the current branch (respecting current mode). Does nothing if the source branch doesn't exist or is empty.
```javascript
df.forge('main', [
    { Branch: ['source', [{Import: 'source data'}]] },
    { Append: ' - ' },
    { From: 'source' }
]); // Result: "main - source data"
```
*Alias: `ImportFrom`, `ImportFromBranch`*

### `To`
Exports the current branch's data *to* the specified local branch (respecting the current branch's mode). Initializes the target branch if it doesn't exist. Does *not* switch the current branch.
```javascript
df.forge('export this', [
    { To: 'targetBranch' },
    // 'targetBranch' now contains 'export this'
    // Current branch remains 'main'
    { From: 'targetBranch' }
]); // Result: "export this"
```
*Alias: `ExportTo`, `ExportToBranch`*

### `ToGlobal`
Like `To`, but exports to a specified *global* branch.
```javascript
df.forge('export global', [{ ToGlobal: 'sharedTarget' }]);
```
*Alias: `ExportToGlobal`*

### `CloneTo`
Performs a deep clone of the current branch's data and *replaces* the data in the target branch with the clone. Initializes the target branch if needed.
```javascript
df.forge({ a: 1 }, [
    { CloneTo: 'cloneTarget' },
    // 'cloneTarget' now has a distinct copy of { a: 1 }
]);
```

### `Delete`
Deletes the specified local or global branch. Cannot delete reserved branches (like `main`). Switches to `main` if the current branch is deleted.
```javascript
df.forge(null, [
    { Branch: ['temp', [{ Import: 'data' }]] },
    { Delete: 'temp' }
    // 'temp' branch no longer exists
]);
```

### `Exit`
Immediately stops the entire `forge()` execution, returning the current data from the branch where `Exit` was called.
```javascript
df.forge('start', [
    { Append: ' step1' },
    "Exit",
    { Append: ' step2' } // This is skipped
]); // Result: "start step1"
```

### `ExitIfEmpty`
Calls `Exit` if the current branch data is considered empty/lacks value (`LacksValue(data)`).
```javascript
df.forge('', ["ExitIfEmpty", { Append: ' not empty' }]); // Result: ''
df.forge('data', ["ExitIfEmpty", { Append: ' not empty' }]); // Result: 'data not empty'
```

### `If`
Conditionally executes a command block based on evaluating `SeeIf` conditions against the current data. Conditions can be nested.
```javascript
df.forge("test value", [
    { If: [ // Conditions array
        'IsString', 'And', 'HasValue', 'And', { LengthIsGreaterThan: 5 }
      ], 
      // Optional branch name for commands
      'conditionalBranch', 
      // Commands to run if true
      [
        { Append: " - condition was true!" }
      ]
    }
]); // Result: "test value - condition was true!"
```

## Data Conversion Commands

### `ConvertToArray`
Wraps the current data value in an array. Optionally at a specific index.
```javascript
df.forge("value", [{ ConvertToArray: 0 }]); // Result: ["value"]
df.forge("value", [{ ConvertToArray: 2 }]); // Result: [undefined, undefined, "value"]
```

### `ConvertFromArray`
Extracts an element from the current array data at the specified index (default 0).
```javascript
df.forge(["a", "b"], [{ ConvertFromArray: 1 }]); // Result: "b"
```

### `ConvertToObject`
Creates an object with a single specified key, using the current data as the value.
```javascript
df.forge("value", [{ ConvertToObject: "newKey" }]); // Result: { newKey: "value" }
```
*Aliases: `ToKey`, `ConvertToObjectWithKey`*

### `ConvertFromObject`
Extracts the value associated with the specified key from the current object data.
```javascript
df.forge({ id: 123, name: "Test" }, [{ ConvertFromObject: "name" }]); // Result: "Test"
```
*Alias: `FromKey`*

### `ConvertToJSON`
Serializes the current data (object/array) into a JSON string.
```javascript
df.forge({ a: 1 }, ["ConvertToJSON"]); // Result: '{"a":1}'
```

### `ConvertFromJSON`
Parses the current data (JSON string) into a JavaScript object/array.
```javascript
df.forge('{"a":1}', ["ConvertFromJSON"]); // Result: { a: 1 }
```

### `ConvertToString`
Converts the current data to its string representation.
```javascript
df.forge(123, ["ConvertToString"]); // Result: "123"
```

### `ConvertToNumber`
Converts the current data (string) to a number.
```javascript
df.forge("42.5", [{"ConvertToNumber": null}]); // Result: 42.5
```

## Handlebars Templating

Dataforge provides a rich Handlebars templating engine, including dynamic protocol handlers for advanced content generation (e.g., `\{{file:path/to/file.ext}}`).

For detailed documentation on all Handlebars features, including template commands (`ApplyHandlebars`, `ToHandlebar`, etc.) and the Handlebar Protocol System, please see the dedicated [Handlebars Sub-Module README]({{DohballDocs:dataforge_handlebars}}).

## Data Manipulation Commands

### `FromRef`
Uses `Doh.parse_reference` to extract a value from the current data using a dot-notation path.
```javascript
df.forge({ a: { b: { c: 123 }}}, [{ FromRef: "a.b.c" }]); // Result: 123
```
*Alias: `ImportFromRef`*

### `MeldDeep`
Performs a deep merge (`Doh.meld_deep`) of the argument object into the current branch's data object.
```javascript
df.forge({ a: { b: 1 }}, [{ MeldDeep: { a: { c: 2 }}}]);
// Result: { a: { b: 1, c: 2 }}
```

### `MeldDeepFrom`
Performs a deep merge of the data from a *specified local branch* into the current branch's data.
```javascript
df.forge({ a: 1 }, [
    { Branch: ['source', [{ Import: { b: 2 } }]] },
    { MeldDeepFrom: 'source' }
]); // Result: { a: 1, b: 2 }
```

### `MeldDeepFromGlobal`
Performs a deep merge of the data from a *specified global branch* into the current branch's data.
```javascript
df.forge({ a: 1 }, [
    { Global: ['globalSource', [{ Import: { b: 2 } }]] },
    // In a separate forge call or later in the same one:
    { MeldDeepFromGlobal: 'globalSource' }
]); // Result: { a: 1, b: 2 }
```

### `Each`
Iterates over the current data (if array or object) and executes a sub-pipeline for each item. The result of the sub-pipeline replaces the original item/value.
```javascript
// Array
df.forge([1, 2], [{ Each: [[{ IncrementNumber: null }]] }]);
// Result: [2, 3]

// Object
df.forge({ a: 1, b: 2 }, [{ Each: [[{ IncrementNumber: null }]] }]);
// Result: { a: 2, b: 3 }
```

## String Operation Commands

(These commands operate on the current branch data if it's a string)

*   `Trim`: Removes leading/trailing whitespace.
*   `LTrim`: Removes leading whitespace.
*   `RTrim`: Removes trailing whitespace.
*   `ToTitleCase`: Converts to Title Case.
*   `ToUpperCase`: Converts to UPPERCASE.
*   `ToLowerCase`: Converts to lowercase.
*   `ToCamelCase`: Converts to camelCase.
*   `ToSnakeCase`: Converts to snake_case.
*   `ToKebabCase`: Converts to kebab-case.
*   `ToPascalCase`: Converts to PascalCase.

```javascript
df.forge("  some string  ", ["Trim", "ToTitleCase"]); // Result: "Some String"
```

## Number Operation Commands

(These commands operate on the current branch data if it's a number)

*   `RoundNumber`: Rounds to nearest integer.
*   `FloorNumber`: Rounds down.
*   `CeilNumber`: Rounds up.
*   `TruncateNumber`: Removes decimal part.
*   `IncrementNumber`: Adds 1.
*   `DecrementNumber`: Subtracts 1.

```javascript
df.forge(5.7, ["FloorNumber", "IncrementNumber"]); // Result: 6
```

## Sanitization & Escaping Commands

These commands clean or modify strings to make them safe for specific contexts.

*   `SanitizeInput`: General-purpose sanitization (removes control chars, zero-width chars, etc.).
*   `SanitizeAlphaNumeric`: Keeps only letters and numbers.
*   `SanitizeNumber`: Keeps only numbers.
*   `SanitizeEmail`: Removes characters invalid in email addresses.
*   `SanitizePhone`: Removes characters invalid in phone numbers.
*   `SanitizeURL`: Removes characters invalid in URLs.
*   `SanitizePath`: Removes characters invalid in file paths.
*   `SanitizeFilename`: Removes characters invalid in filenames.
*   `SanitizeUsername`: Alias for `SanitizeAlphaNumeric`.
*   `SanitizePassword`: Removes characters invalid in typical passwords.
*   `SanitizeToken`: Removes characters invalid in typical tokens.
*   `SanitizeCode`, `SanitizeHTML`, `SanitizeSQL`, `SanitizeJSON`, `SanitizeXML`, `SanitizeCSS`, `SanitizeJS`, `SanitizeMarkdown`, `SanitizeYAML`: Remove characters generally invalid for the respective formats.
*   `EscapeHTML`: Escapes `<`, `>`, `&`, `"`, `'` for safe HTML display.
*   `EscapeJSON`: Escapes characters problematic within JSON strings.
*   `StripHTML`: Removes HTML tags.
*   `RemoveColorCodes`: Removes ANSI terminal color codes.

```javascript
df.forge("<script>alert('bad')</script>", ["StripHTML", "EscapeHTML"]);
// Result: "alert('bad')"
```

## Asynchronous Commands (`AsyncDataforge` only)

These commands perform I/O and require using an `AsyncDataforge` instance and `await`.

### `Fetch`
Fetches data from a URL using `axios` (Node.js) or `Doh.ajaxPromise` (Browser). Uses current data as URL if no argument provided.
```javascript
let result = await adf.forge(null, [{ Fetch: "https://example.com/api/data" }]);
```

### `ImportFromURL`
Fetches data using `Doh.ajaxPromise` (browser-focused, forces HTTP).
```javascript
let result = await adf.forge(null, [{ ImportFromURL: "/api/data.json" }]);
```

### `Post`
Sends the current branch data as a POST request body to the specified URL.
```javascript
let postData = { id: 1, value: "test" };
let result = await adf.forge(postData, [{ Post: "/api/submit" }]);
```

### `ForgeOnServer`
Sends the current data and an array of commands to a server-side endpoint (`/dataforge/forge`) for remote execution.
```javascript
let result = await adf.forge('filename.txt', [
    { ForgeOnServer: ["FromFile"] } // Ask server to read file
]);
```

## YAML Commands (`YAML_dataforge` sub-module)

### `ConvertToYAML`
Serializes the current object/array data to a YAML string.
```javascript
df.forge({ a: 1, b: [2, 3] }, ["ConvertToYAML"]);
// Result: "a: 1\nb:\n  - 2\n  - 3\n"
```

### `ConvertFromYAML`
Parses the current YAML string data into a JavaScript object/array.
```javascript
df.forge("a: 1\nb: [2, 3]", ["ConvertFromYAML"]);
// Result: { a: 1, b: [2, 3] }
```

## File System Commands (`nodejs_fs_dataforge` sub-module) [Node.js Only]

These commands interact with the local file system and only work in a Node.js environment. They work with both `Dataforge` (sync) and `AsyncDataforge` (async).

*   `ChangeDir`: Changes the current working directory for subsequent file operations within the forge instance. `[{ ChangeDir: "path/to/dir" }]`
*   `FromFile`: Reads content from a file path (provided as argument or from current data). `[{ FromFile: "file.txt" }]`
*   `ToFile`: Writes the current data to a file path. `[{ ToFile: "output.txt" }]`
*   `CopyFile`: Copies a file. `[{ CopyFile: ["source.txt", "dest.txt"] }]`
*   `CopyFolder`: Recursively copies a folder. `[{ CopyFolder: ["src_dir", "dest_dir"] }]`
*   `FromFolder`: Reads directory contents (returns array of filenames/subdirs). `[{ FromFolder: "./dir" }]`
*   `FromFolderToList`: Reads contents of multiple files in a folder into an object keyed by filename. `[{ FromFolderToList: "./data_files" }]`
*   `FromListToFolder`: Writes an object (keyed by filename) to multiple files in a directory. `[{ FromListToFolder: "./output_dir" }]`
*   `FromStringToPathToGlobal`: Sanitizes the current data string into a path-safe string and stores it in a global branch. `[{ FromStringToPathToGlobal: "globalBranchName" }]`