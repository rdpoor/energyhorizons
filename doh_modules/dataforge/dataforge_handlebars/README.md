# Dataforge Handlebars Templating System
![Handlebars](^/handlebars.png?size=small)

Dataforge incorporates a powerful and unique templating system that shares syntax with Handlebars but is a **custom implementation internal to Doh.js and Dataforge**. It is crucial to understand that this is **NOT** the popular Handlebars.js library.

A fundamental characteristic of Dataforge's templating is that **all strings that pass through a Dataforge pipeline are, by default, treated as templates and processed for handlebar content.** This means any string can potentially contain `\{{...}}` expressions that will be evaluated. This behavior might be refined in future versions, but it is the current default.

This system provides mechanisms for simple variable substitution, as well as an advanced "Handlebar Protocol" feature for dynamic content generation.

## Core Templating Concepts

### Data Available in Templates

When a template string is processed, Dataforge makes several sources of data available for substitution:

1.  **Current Branch Data (`\{{data}}`)**: The primary data currently held in the active Dataforge branch can often be accessed directly or implicitly.
2.  **Explicit Handlebar Variables**: Values stored using the `ToHandlebar` command (see below) are available (e.g., `\{{myVar}}`).
3.  **Dataforge Instance Handlebars (`this.handlebars`)**: The Dataforge instance itself has a `handlebars` object where variables can be stored.
4.  **Branch-Specific Data**: Data from any named branch can often be accessed (e.g., `\{{branchName.data}}` or `\{{branchName.someProperty}}` if the data is an object).
5.  **Dynamic Context Variables**:
    *   `\{{branch.name}}`: The name of the current branch.
    *   `\{{branch.data}}`: The data of the current branch.
    *   `\{{branch.tempMode}}`: The temporary mode of the current branch.
    *   `\{{branch.currentMode}}`: The persistent mode of the current branch.
    *   `\{{branch.defaultMode}}`: The default mode of the current branch.
    *   `\{{branch.isGlobal}}`: Boolean indicating if the current branch is global.
    *   `\{{outer.name}}`, `\{{outer.data}}`, etc.: Similar properties for the calling (outer) branch when in a sub-pipeline.
6.  **Protocol Handlers**: As detailed below, protocols like `\{{file:path}}` inject content dynamically.

### Escaping Handlebars

If you need to include literal handlebar expressions in your output without them being processed, you can escape them using a backslash:

```
\\{{this will not be processed}}
```

This will produce the literal text `\\{{this will not be processed}}` in the output. This is particularly useful when:

- Documenting the handlebar system itself
- Generating templates that will be processed later
- Including code examples that use handlebar-like syntax

### Processing Order

Handlebar replacement, including protocol execution, generally occurs when:
*   The `ApplyHandlebars` command is explicitly used.
*   Data is updated in a branch via `this.updateData()`, which internally calls `this.replace_handlebars()`.
*   Arguments to Dataforge commands are processed if they are strings.

## Standard Templating Commands

These commands are used to manage and apply templates.

### `ApplyHandlebars`
Explicitly processes the current branch's data as a Handlebars template, replacing all `\{{...}}` placeholders with their corresponding values from the Dataforge instance's `handlebars` object, current branch data, or dynamic context. Optionally, an object of handlebars can be provided to this command to temporarily add or override handlebar variables for this specific application.

**Syntax:**
`"ApplyHandlebars"`
`{ ApplyHandlebars: { temporaryVar: "value" } }`

**Example:**
```javascript
df.handlebars.user = "Alice";
df.forge("Hello \{{user}} from branch \{{branch.name}}!", [
    { ApplyHandlebars: { 'branch.name': 'main' } } // Temporarily add/override for this call
]); // Result: "Hello Alice from branch main!"
```

### `ToHandlebar`
Stores the current branch's data into a specified variable within the Dataforge instance's `handlebars` object. This makes the data available for subsequent template processing using `\{{handlebarName}}`.

**Syntax:**
`{ ToHandlebar: "handlebarVariableName" }`

**Example:**
```javascript
df.forge("Alice", [{ ToHandlebar: "userName" }]);
// df.handlebars.userName is now "Alice"
// Later use: df.forge("User: {{userName}}", ["ApplyHandlebars"])
```
*Alias: `ExportToHandlebar`*

### `EmptyHandlebar`
Sets the specified handlebar variable within the Dataforge instance's `handlebars` object to an empty string `''`.

**Syntax:**
`{ EmptyHandlebar: "handlebarVariableName" }`

**Example:**
```javascript
df.forge(null, [{ EmptyHandlebar: "userName" }]);
// df.handlebars.userName is now ''
// {{userName}} will now render as an empty string.
```

### `RemoveHandlebar`
Deletes the specified handlebar variable from the Dataforge instance's `handlebars` object. Use with caution as this removes the variable entirely.

**Syntax:**
`{ RemoveHandlebar: "handlebarVariableName" }`

**Example:**
```javascript
df.forge(null, [{ RemoveHandlebar: "userName" }]);
// df.handlebars.userName is now undefined
// {{userName}} might render as "{{userName}}" or an empty string depending on settings.
```

## Handlebar Protocol System

Beyond simple variable replacement, Dataforge includes a powerful Handlebar Protocol system. This allows for dynamic content generation and processing directly within handlebar templates using the syntax: `\{{protocol:value}}`.

This system enables advanced features like embedding file contents, live-reloading parts of templates, and creating custom dynamic tags.

### 1. The `HandlebarProtocolHandler` Pattern

The foundation of this system is the `HandlebarProtocolHandler` pattern, defined in `dataforge_handlebars.js` (this file's corresponding module).

**Pattern Definition:**
```javascript
Pattern('HandlebarProtocolHandler', {
  moc: {
    protocol: ['IsString', 'NotNull'], // The unique name of the protocol (e.g., 'file')
    handler: ['IsFunction', 'NotNull'],// The function to execute for this protocol
    handlers: 'Static',               // A static collection shared by all instances,
                                      // acting as the global registry:
                                      // Doh.Patterns.HandlebarProtocolHandler.handlers
    enabled: 'IsBoolean',             // Whether this protocol handler is active
  },
  enabled: true, // Default to enabled
  handlers: {},    // Initialize the static handlers registry
  object_phase: function(){
    // When an instance of this pattern (or a child pattern) is created,
    // it registers its protocol and handler function into the static 'handlers' registry.
    if (this.enabled) {
      this.handlers[this.protocol] = this.handler;
    }
  },
});
```

**Key Properties and Behavior:**

*   **`protocol` (String):** A unique string that identifies the protocol. This is the name used in the Handlebars template (e.g., `file` in `\{{file:some/path}}`).
*   **`handler` (Function):** The JavaScript function that gets executed when this protocol is encountered. This function typically receives the `value` part of the `\{{protocol:value}}` syntax as an argument and may also receive other contextual information (like the full "load statement" of the template being processed, useful for features like HMR or `Doh.reload`). It's responsible for returning the content that will replace the Handlebar tag.
*   **`handlers` (Static Object):** This is a crucial static property (`Doh.Patterns.HandlebarProtocolHandler.handlers`). It acts as a global registry where each `protocol` string is mapped to its corresponding `handler` function. When a `HandlebarProtocolHandler` instance is created (e.g., `New('MyCustomProtocolHandler', { ... })`), its `protocol` and `handler` are automatically added to this shared registry during its `object_phase`.
*   **`enabled` (Boolean):** Controls whether the protocol handler is active and registers itself. Defaults to `true`.

### 2. Processing Mechanism (in `dataforge_core`)

The actual processing of these protocols within a template string happens inside the `replace_handlebars` method of the `dataforge_core` pattern (found in `dataforge.js`).

**Simplified Logic:**
```javascript
// Inside dataforge_core.replace_handlebars:

const getReplacement = (key) => {
  key = key.trim();

  // ... (checks for dynamic handlebars like {{data}}, {{branch.name}}, etc.)

  if (key.includes(':')) { // Protocol syntax detected!
    const [protocol, value] = key.split(':', 2); // Split only on the first colon
    if (Doh.Patterns.HandlebarProtocolHandler.handlers.hasOwnProperty(protocol)) {
      // If a handler is registered for this protocol, call it!
      return Doh.Patterns.HandlebarProtocolHandler.handlers[protocol](value /*, other_context_if_any */);
    }
  }

  // ... (checks for standard handlebars like {{myVariable}})

  return `\{{${key}}}`; // Return original if no replacement found
};
```
When `replace_handlebars` encounters a tag like `\{{foo:bar}}`, it:
1.  Splits `foo:bar` into `protocol = 'foo'` and `value = 'bar'`.
2.  Looks up `'foo'` in the `Doh.Patterns.HandlebarProtocolHandler.handlers` registry.
3.  If a handler exists, it's called with `'bar'` (and potentially other context).
4.  The returned value from the handler replaces `{{foo:bar}}` in the template.

### 3. Defining and Registering Custom Protocols

To create your own custom Handlebar protocol:

1.  **Define a new Pattern or instance** that inherits from `HandlebarProtocolHandler`.
2.  **Specify your `protocol` name** and implement the `handler` function.

**Example: A `\{{timestamp:format}}` protocol**
```javascript
// In your custom module, e.g., my_custom_dataforge_protocols.js
Doh.Module('my_custom_dataforge_protocols', ['dataforge_handlebars'], function() { // Depend on dataforge_handlebars

  Pattern('TimestampProtocolHandler', ['HandlebarProtocolHandler'], {
    protocol: 'timestamp', // Protocol name: {{timestamp:...}}
    handler: function(formatString) {
      // formatString is the value after 'timestamp:'
      // Example: {{timestamp:YYYY-MM-DD HH:mm:ss}}
      const now = new Date();
      if (formatString === 'ISO') {
        return now.toISOString();
      }
      if (formatString === 'UTC') {
        return now.toUTCString();
      }
      if (formatString === 'time') {
        return now.toLocaleTimeString();
      }
      // Add more sophisticated date formatting as needed (e.g., using a library)
      return now.toLocaleString(); // Default
    }
  });

  // Instantiate the pattern to register it.
  New('TimestampProtocolHandler');

});

// Ensure this module (my_custom_dataforge_protocols) is loaded by Dataforge,
// perhaps by adding it to the dependencies in dataforge.js or a relevant sub-module.
```

**Usage in a Dataforge command:**
```javascript
// Assuming 'my_custom_dataforge_protocols' module is loaded
let df = New('Dataforge');
let result = df.forge("Report generated on: \{{timestamp:YYYY-MM-DD}} at \{{timestamp:time}}", [
  "ApplyHandlebars" // Process the template
]);
console.log(result); // Output: Report generated on: 2023-10-27 at 10:30:45 AM (example)
```

### 4. Built-in Protocols: `file` and `editableFile`

Dataforge comes with powerful built-in protocols, primarily for file system interaction, implemented in `nodejs_fs_dataforge.js` (for Node.js/Bun) and `__secret_browser_fs_dataforge.js` (for the Browser environment). These modules would typically ensure `dataforge_handlebars` (or at least `HandlebarProtocolHandler`) is available.

#### `\{{file:path/to/your/file.ext}}`

*   **Purpose**: Loads and embeds the content of the specified file directly into the template. This is extremely useful for including snippets, partial templates, or any external file content.
*   **`loaderType`**: Typically `'file'`. This indicates that the content should be treated as a standard file load, which might imply further processing based on Doh's load system conventions (e.g., if the path was `myfile.md > md`, it could be converted to HTML).

*   **Node.js/Bun Behavior** (via `nodejs_fs_dataforge.js`'s `HandlebarFileProtocolHandler` instance):
    *   **File Reading**: Uses `fs.readFileSync()` to synchronously read the file content. The path is made safe using an internal `makeFilePathSafe` function.
    *   **Caching**: Implements an efficient file cache (`fileCache`, `fileCacheMtime`). The file content is cached in memory, and the file is only re-read from disk if its modification time (`mtime`) has changed since the last access. This significantly improves performance for templates that repeatedly include the same files.
    *   **HMR Integration**: If HMR (Hot Module Replacement) is enabled (`Doh.pod.hmr?.enabled`), the resolved file path is automatically added to HMR's watch list using `Doh.Globals.HMR.addLoaderToWatch(resolvedPath + ' > ' + this.loaderType)`. This means if the included file is modified, the HMR system can intelligently update the relevant parts of your application.

*   **Browser Behavior** (via `__secret_browser_fs_dataforge.js`'s `HandlebarFileProtocolHandler` instance):
    *   **File Fetching**: Uses `Doh.live_load(DohPath.DohSlash(value) + ' > ' + this.loaderType, callback)` to asynchronously fetch the file content.
    *   **Live Reloading**: When the underlying file (specified by `value`) changes on the server, `Doh.live_load` detects this. Its callback function then executes `Doh.reload(loadStatement)`, where `loadStatement` refers to the original template or resource that contained the `\{{file:...}}` handlebar. This re-renders/re-processes the part of your application dependent on the changed file.

#### `\{{editableFile:path/to/your/file.ext}}`

*   **Purpose**: Functionally very similar to the `file` protocol.
*   **`loaderType`**: Registered with `loaderType: 'raw'`.
*   **Behavior**:
    *   Uses the same core handler mechanisms as the `file` protocol (i.e., `fs.readFileSync` with caching/HMR in Node.js, and `Doh.live_load` in the browser).
    *   The `loaderType: 'raw'` distinction means the content is treated as raw text, bypassing further transformations. This is suitable for exact content loading, e.g., into a `<textarea>` for editing.

### 5. Default Package-Related Protocols

Dataforge includes several built-in protocols specifically designed for working with packages, paths, and documentation:

#### `\{{DohPath:path}}`

*   **Purpose**: Resolves a path using the Doh path resolution system.
*   **Usage**: `\{{DohPath:some/relative/path}}` will resolve to the appropriate absolute path.

#### `\{{DohPath.DohSlash:path}}`

*   **Purpose**: Transforms a path to use Doh's slash convention.
*   **Usage**: `\{{DohPath.DohSlash:some/path}}` will ensure the path uses the appropriate slashes for the current environment.

#### `\{{Package:packageName}}`

*   **Purpose**: Returns the path to a specified package.
*   **Usage**: `\{{Package:myPackage}}` returns `/path/to/myPackage`

#### `\{{PackageReadme:packageName}}`

*   **Purpose**: Returns the path to a package's README.md file.
*   **Usage**: `\{{PackageReadme:myPackage}}` returns `/path/to/myPackage/README.md`

#### `\{{DohballDocs:packageName}}`

*   **Purpose**: Returns the path to a package's documentation in the dohballs directory.
*   **Usage**: `\{{DohballDocs:myPackage}}` returns `/docs/dohballs/path/to/myPackage`

These protocols are particularly useful when generating documentation or creating package-related content that needs to reference other packages or their documentation.

## Implications and Power

Dataforge's custom Handlebars templating, especially with its "all strings are templates" default and the Handlebar Protocol system, offers:

*   **Deep Integration**: Templating is not an afterthought but a core part of data flow.
*   **Modularity**: Break down complex string generations using file inclusions via protocols.
*   **Reusability**: Common snippets or components via protocols.
*   **Reactivity (Browser)**: `\{{file:...}}` with `Doh.live_load` enables dynamic UI updates.
*   **Server-Side Includes with HMR (Node.js/Bun)**: Efficient and developer-friendly.
*   **Extensibility**: Custom protocols for tailored dynamic content.

This system provides a flexible and powerful way to manage and generate complex string-based content within the Doh.js ecosystem. 