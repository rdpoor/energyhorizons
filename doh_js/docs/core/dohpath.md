# DohPath: Universal Path Utilities

![DohPath]({{Package:deploydoh_home}}/images/dohpath.png?size=small)

DohPath is Doh's advanced path manipulation and resolution utility, engineered as a **complete solution** for reliable and consistent path management across the most demanding scenarios: diverse runtimes (Node.js, Browser), operating systems (Windows, Unix-like), project stages (development, exported VFS), and path formats. It transcends the limitations of standard path libraries by introducing a unique **Layered Relativity** system alongside a comprehensive suite of tools for normalization, resolution, storage, comparison, joining, and deconstruction.

## Overview

Think of `DohPath` not just as a replacement for Node.js `path`, but as a **foundational layer** for managing location references throughout your Doh application lifecycle. It provides:

*   **Unified, Intelligent Resolution:** A central `DohPath(path, context)` function seamlessly resolves various path formats (absolute, project-relative, context-relative, dot notation) to normalized, absolute system paths suitable for the current environment (Node/Browser) and OS, automatically handling separators.
*   **Sophisticated Layered Relativity:** Goes beyond simple relative paths (`./`, `../`) to offer:
    *   **DohSlash Paths (`/`):** Stable references relative to a global project root (`LoadDohFrom`). Ideal for application-wide configurations or assets. Handled via `DohPath.DohSlash()`.
    *   **Caret Paths (`^/`):** Flexible references relative to an arbitrary local file context (`ArbitrarilyRelativePath`). Perfect for component-local assets or templates. Handled via `DohPath.Caret()`.
*   **Full Path Lifecycle Management:** Comprehensive utilities for:
    *   **Format Conversion:** Convert *any* resolvable path *into* specific formats (`DohSlash`, `Caret`, `Dot`, `Relative`) for consistent storage or usage.
    *   **Manipulation:** Reliable joining (`DohPath.Join()`) and deconstruction (`DohPath.Basename()`, `DohPath.Dirname()`) that work consistently everywhere.
    *   **Comparison:** Intelligent `DohPath.Compare()` checks if two paths point to the same location, regardless of formatting differences (slashes, relativity types, trailing characters).
*   **Cross-Environment & OS Consistency:** Guarantees predictable behavior whether running server-side or client-side, on Windows or Linux.
*   **Seamless Virtual Filesystem (VFS) Integration:** Works transparently with assets embedded in applications exported via `doh export`, requiring no code changes for VFS compatibility.
*   **Simplified Context Management:** `DohPath.Overload(context)` creates context-aware instances, reducing boilerplate when working within specific file scopes (like modules).

This guide details these powerful functions and concepts, empowering you to implement robust, maintainable, and universally compatible path management in your most complex Doh applications.

## **Core Concepts & Functionality**

`DohPath` provides a comprehensive toolkit built around these fundamental ideas, addressing the full spectrum of path management needs:

*   **The Universal Resolver (`DohPath()`):** The cornerstone function. Takes a path string (`p`) and an optional context (`ArbitrarilyRelativePath`). It intelligently deciphers the path type (`/`, `^/`, absolute, `./`, etc.), resolves it against the appropriate reference (project root or local context), normalizes it for the current OS, and returns a definitive, absolute system path.

*   **Layered Relativity (`LoadDohFrom` vs. `ArbitrarilyRelativePath`):** The core innovation enabling flexible yet stable referencing.
    *   `LoadDohFrom`: A global setting defining the project's root directory. Acts as the anchor for project-relative DohSlash (`/`) paths. Ensures consistent access to shared resources across the application.
    *   `ArbitrarilyRelativePath`: **The key to controlled, portable relativity.** This isn't tied to unpredictable contexts like the Current Working Directory (CWD) or the immediate `import.meta.url` of the *runtime*. Instead, it's an *explicitly provided* anchor (often a file path/URL, but can be any resolvable reference point you define) for context-relative Caret (`^/`) paths. This **decouples relative resolution** from the environment's volatile defaults, solving the nightmare of tracking relative paths through complex workflows (e.g., browser -> server upload -> temp file processing). You control the reference point, ensuring predictable resolution regardless of *where* the code is running or *how* the path arrived there.
    *   This dual system provides the stability of project-relative paths (`/config.json`) alongside the **controlled, portable relativity** of Caret paths (`^/component-data.json`), essential for robust, maintainable applications operating across diverse environments and processing stages.

*   **Bi-Directional Path Format Conversion (`DohPath.DohSlash`, `DohPath.Caret`, `DohPath.Dot`, `DohPath.Relative`):** These functions are not just resolvers; they allow you to *enforce* a specific path format *onto* any resolvable path. Need to store a path relative to the project root in a config file? Use `DohPath.DohSlash(absoluteOrCaretPath)`. Need a traditional relative path for a third-party library? Use `DohPath.Dot(anyResolvablePath, context)`. Need a path that maintains its relationship to a specific *logical* anchor, immune to environmental shifts? Use `DohPath.Caret(anyPath, yourChosenAnchorPath)`. This ensures paths are stored and used in the required format consistently. (`DohPath.DohSlash` is generally preferred for internal storage over `DohPath.Relative`).

*   **Robust Path Manipulation & Comparison:** Beyond simple string operations, these tools understand path semantics:
    *   `DohPath.Join()`: Combines path segments reliably, ensuring correct separators, regardless of environment. Handles the base path and relative fragments correctly.
    *   `DohPath.Basename()`, `DohPath.Dirname()`: Extract file or directory names accurately, matching Node.js `path` behavior but working cross-environment and handling edge cases like root paths correctly.
    *   `DohPath.Compare()`: Essential for reliable checks. Determines if two differently formatted paths (e.g., `/path/file` vs `^/..\\path\\file` from the right context, or paths with different slashes/trailing characters) actually refer to the same file system entity after resolution.

*   **Contextual Simplification (`DohPath.Overload()`):** Creates a specialized `DohPath` instance pre-configured with a specific `ArbitrarilyRelativePath`. This is invaluable within modules or specific file scopes, allowing you to use `DohPath('^/local.file')` without repeatedly passing `import.meta.url`, making code cleaner and less error-prone.

*   **Transparent Export & VFS Handling:** Designed with deployment in mind. When using `doh export`, paths resolved via `DohPath.DohSlash` (and potentially others if manually configured) are automatically recognized by the build process. These paths are then seamlessly mapped to the corresponding assets embedded within the exported application's virtual filesystem. Your application logic using `DohPath` continues to work without modification, whether accessing the live filesystem or the VFS.

---

# DohPath API Reference

## **Key Concepts**

### **LoadDohFrom (Global Project Root)**

A global variable that defines the absolute path to your project root. This serves as the reference point for all `/`-prefixed (DohSlash) paths and maps to the web root in browser environments.

- Set once per application (typically automatically during initialization)
- Provides the foundation for project-wide path resolution
- Can be dynamically determined in browser environments

### **ArbitrarilyRelativePath (Local Context)**

A parameter passed to DohPath functions that defines the local context for resolving `^/`-prefixed (Caret) paths.

- Typically set to `import.meta.url` or the current file's path
- Not stored globally - must be provided per call or via Overload
- Enables arbitrarily-relative paths without automatic path resolution interference

### **Path Types**

DohPath supports multiple path formats, each with different relativity references:

- **DohSlash Paths (`/config.json`):** Relative to project root (`LoadDohFrom`)
- **Caret Paths (`^/styles.css`):** Relative to the specified local context (`ArbitrarilyRelativePath`)
- **Dot Paths (`./styles.css`):** Traditional relative paths (converted to/from Caret paths)
- **Full Paths (`/var/www/site/config.json`):** Absolute system paths (We know the difference by matching inital path parts)

---

## **API**

This section serves as the API reference for the main DohPath functions.

### **DohPath**

Resolves a path to an absolute system path, accounting for both project root and local context references.

**Syntax:**
```javascript
DohPath(p, ArbitrarilyRelativePath = null)
```

- **`p`**: The path to resolve. Can be:
  - `/`-prefixed for paths relative to `LoadDohFrom` (project root)
  - `^/`-prefixed for paths relative to `ArbitrarilyRelativePath` (local context)
  - Full system paths (unchanged except for normalization)
- **`ArbitrarilyRelativePath`**: The local context reference for resolving `^/`-prefixed paths (typically `import.meta.url`)

**Returns:** A fully resolved absolute system path.

### **DohPath.DohSlash**

Converts any path into a project-root-relative path (DohSlash format).

**Syntax:**
```javascript
DohPath.DohSlash(p, ArbitrarilyRelativePath = null)
```

**Returns:** A DohSlash path string (starting with `/`) that's relative to the project root.

### **DohPath.Caret**

Converts any path into an arbitrarily-relative path (Caret format, `^/`) that's relative to a *specified, controlled* local context, decoupling it from implicit environmental relativity (like CWD or script location).

**Syntax:**
```javascript
DohPath.Caret(p, ArbitrarilyRelativePath = null)
```
- **`p`**: The path to convert. Can be absolute, DohSlash, Dot, or even another Caret path (relative to a *different* context).
- **`ArbitrarilyRelativePath`**: The explicit anchor path/URL. This defines the meaning of `^/` for the conversion. If using an `Overload`ed `DohPath`, this defaults to the overloaded context.

**Returns:** A Caret path string (starting with `^/`) whose relativity is precisely defined by the provided `ArbitrarilyRelativePath`, making it portable and predictable across different execution environments or stages.

### **DohPath.Dot**

Converts a path into traditional dot notation format, replacing caret notation with dot notation.

**Syntax:**
```javascript
DohPath.Dot(p, ArbitrarilyRelativePath = null)
```

**Returns:** A dot notation path string (starting with `.` or `./`).

### **DohPath.Relative**

Converts a path into a system-relative path without leading slash.

**Syntax:**
```javascript
DohPath.Relative(p, ArbitrarilyRelativePath = null)
```

**Returns:** A relative path string (no leading slash).

### **DohPath.Compare**

Compares two paths to determine if they resolve to the same location after normalization and resolution. It's more permissive than strict string equality, handling different slash types, trailing slashes, and different relativity types (`/`, `^/`, etc.).

**Syntax:**
```javascript
DohPath.Compare(p1, p2, ArbitrarilyRelativePath = null)
```

- **`p1`**: The first path to compare.
- **`p2`**: The second path to compare.
- **`ArbitrarilyRelativePath`**: The local context reference used if paths need resolution (e.g., comparing a Caret path to a DohSlash path).

**Returns:** `true` if the paths resolve to the same location, `false` otherwise.

### **DohPath.Join**

Joins multiple path segments together, similar to Node.js `path.join`, but cross-environment compatible. Ensures correct separator usage.

**Syntax:**
```javascript
DohPath.Join(p, ...fragments)
```

- **`p`**: The initial path segment.
- **`fragments`**: Additional path segments to join. These **must** be relative path strings.

**Returns:** A new path string formed by joining the segments. Throws an error if any fragment is not a relative path.

### **DohPath.Basename**

Returns the last portion of a path, similar to Node.js `path.basename`.

**Syntax:**
```javascript
DohPath.Basename(p)
```

- **`p`**: The path from which to extract the basename.

**Returns:** The basename of the path. Handles different separators and trailing slashes. Returns `/` for the root path.

### **DohPath.Dirname**

Returns the directory name of a path, similar to Node.js `path.dirname`.

**Syntax:**
```javascript
DohPath.Dirname(p)
```

- **`p`**: The path from which to extract the directory name.

**Returns:** The directory name of the path. Returns `.` for paths without directory separators (implying the current directory) and `/` for the root path.

### **DohPath.Overload**

Creates a specialized version of DohPath that has a pre-configured default value for `ArbitrarilyRelativePath`.

**Syntax:**
```javascript
DohPath.Overload(import_url)
```

**Purpose:**
- Eliminates the need to repeatedly pass `ArbitrarilyRelativePath` with each call
- Creates a drop-in replacement for DohPath with a localized default context
- Can still be overridden by explicitly passing an `ArbitrarilyRelativePath`
- Safe to use repeatedly (Overload an already-Overloaded DohPath)

**Returns:** A specialized DohPath function with all methods that automatically uses the provided URL as the default `ArbitrarilyRelativePath`.

---

## **Usage in Doh Modules**

The recommended way to use DohPath is through Doh modules, where it's automatically provided with the correct local context:

```javascript
Doh.Module('MyModule', ['dependency1'], function(DohPath) {
    // DohPath is automatically Overloaded with this module's context
    const configPath = DohPath('/config/settings.json');    // Uses LoadDohFrom (project root)
    const localPath = DohPath('^/styles/local.css');        // Uses module file's path as ArbitrarilyRelativePath
});
```

## **Integration with Export Tool**

DohPath integrates seamlessly with the Doh export tool, enabling exported applications to work with embedded assets through a virtual filesystem (VFS).

### **Virtual Filesystem Resolution**

When an application is exported using `doh export`, DohPath automatically checks the virtual filesystem before attempting to access the actual filesystem:

```javascript
// In your application code:
const imagePath = DohPath.DohSlash('/assets/logo.png');
// Only .DohSlash is automatically detected by Auto-Packager to populate
// the VFS *for you*. You can populate the VFS too, ya know.

// In browser with exported application
// DohPath will first check DohOptions.VFS['/assets/logo.png']
// and return the embedded data URL if found
```

This virtual filesystem integration allows your application code to remain unchanged while working with both standard deployments and exported standalone applications.

### **Path Consistency**

The export tool maintains all path relationships by:

1. Preserving the original project structure in the virtual filesystem
2. Mapping all path types (`/`, `^/`, `./`) to their appropriate virtual locations
3. Ensuring that relative relationships between files are maintained

### **Data URL Handling**

DohPath automatically recognizes and preserves data URLs, allowing them to pass through untouched:

```javascript
// Data URLs are passed through unchanged
const dataUrl = "data:image/png;base64,iVBORw0KGg...";
DohPath(dataUrl) === dataUrl; // true
```

This enables the export tool to replace file paths with data URLs while ensuring all DohPath operations continue to work correctly.

## **Examples**

### **Example 1: Understanding LoadDohFrom vs ArbitarilyRelativePath**

```javascript
// Global setup:
globalThis.LoadDohFrom = '/project/root';

// Using DohPath in different locations:
// In /project/root/modules/auth/login.js:
const DohPath = DohPath.Overload(import.meta.url);

// Paths relative to LoadDohFrom (project root):
const configPath = DohPath('/config/settings.json');
// Returns: '/project/root/config/settings.json'

// Paths relative to ArbitrarilyRelativePath (current file):
const stylePath = DohPath('^/styles/login.css');
// Returns: '/project/root/modules/auth/styles/login.css'

// Converting between relativity types:
const absolutePath = '/project/root/modules/auth/styles/login.css';
const asDohSlash = DohPath.DohSlash(absolutePath);
// Returns: '/modules/auth/styles/login.css' (relative to LoadDohFrom)

const asCaret = DohPath.Caret(absolutePath, import.meta.url);
// Returns: '^/styles/login.css' (relative to ArbitrarilyRelativePath)
```

### **Example 2: Using DohSlash Paths**

DohSlash paths (`/`) are ideal for resources that should resolve relative to your project root:

```javascript
// assuming: globalThis.LoadDohFrom = '/project/root';

// Converting absolute paths to DohSlash format
const absolutePath = '/project/root/config/settings.json';
const dohSlashPath = DohPath.DohSlash(absolutePath);
// Returns: '/config/settings.json'

// Using DohSlash paths
const resolvedPath = DohPath(dohSlashPath);
// Returns: '/project/root/config/settings.json'
```

### **Example 3: Using Caret Paths**

Caret paths (`^/`) are for resources that should remain relative to their containing file:

```javascript
// In file: /project/modules/auth/login.js
const DohPath = DohPath.Overload(import.meta.url);

// Using caret paths 
const localPath = DohPath('^/styles/login.css');
// Returns: '/project/modules/auth/styles/login.css'

// Converting absolute paths to Caret format
const absolutePath = '/project/modules/auth/styles/login.css';
const caretPath = DohPath.Caret(absolutePath);  // ArbitrarilyRelativePath comes from Overload
// Returns: '^/styles/login.css'
```

### **Example 4: Using Dot Notation**

Traditional dot notation is available through the Dot method:

```javascript
// In file: /project/modules/auth/login.js
const DohPath = DohPath.Overload(import.meta.url);

// Converting a path to dot notation
const absolutePath = '/project/modules/auth/styles/login.css';
const dotPath = DohPath.Dot(absolutePath);
// Returns: './styles/login.css'
```

### **Example 5: Using Overload for Simplified Context Management**

```javascript
// In file: /var/www/project/components/navbar/index.js
const DohPath = DohPath.Overload(import.meta.url);

// Now all caret paths resolve relative to the navbar directory
const templatePath = DohPath('^/template.html');
// Returns: '/var/www/project/components/navbar/template.html'

// You can create another specialized DohPath with a different context
const utilsPath = '/var/www/project/utils/helpers.js';
const UtilsDohPath = DohPath.Overload(utilsPath);

// Now UtilsDohPath resolves caret paths relative to the utils directory
const helperPath = UtilsDohPath('^/validation.js');
// Returns: '/var/www/project/utils/validation.js'

// You can still override the ArbitrarilyRelativePath 
const otherPath = DohPath('^/config.json', '/var/www/project/config/index.js');
// Returns: '/var/www/project/config/config.json'
```

### **Example 6: Cross-Platform Path Handling**

DohPath normalizes paths across different platforms:

```javascript
// Windows-style path
const windowsPath = 'C:\\project\\root\\config\\settings.json';
const normalizedPath = DohPath(windowsPath);
// Returns: 'C:/project/root/config/settings.json'
```

### **Example 7: Path Comparison**

```javascript
// In file: /project/modules/user/profile.js
const DohPath = DohPath.Overload(import.meta.url);

const path1 = '/project/modules/user/avatar.png';
const path2 = DohPath('^/avatar.png');          // Resolves to the same absolute path
const path3 = './avatar.png';                   // Interpreted relative to cwd by default
const path4 = DohPath.DohSlash(path1);          // '/modules/user/avatar.png'

DohPath.Compare(path1, path2);                 // true (Absolute vs Caret)
DohPath.Compare(path2, DohPath.Dot(path2));      // true (Caret vs Dot, resolved relative to profile.js)
DohPath.Compare(path1, path4);                 // true (Absolute vs DohSlash)
DohPath.Compare('/path/to/file', '/path/to/file/'); // true (Trailing slash ignored)
```

### **Example 8: Joining Path Segments**

```javascript
const basePath = '/project/assets';
const joinedPath = DohPath.Join(basePath, 'images', 'icons', 'favicon.ico');
// Returns: '/project/assets/images/icons/favicon.ico'

const relativeJoin = DohPath.Join('^/data', '../common', 'config.json');
// Returns: '^/../common/config.json' (Join doesn't resolve '..', DohPath() does)

// Throws an error because '/absolute/fragment' is not relative:
// DohPath.Join(basePath, '/absolute/fragment');
```

### **Example 9: Getting Basename and Dirname**

```javascript
const filePath = '/project/src/utils/helpers.js';
DohPath.Basename(filePath); // Returns: 'helpers.js'
DohPath.Dirname(filePath);  // Returns: '/project/src/utils'

DohPath.Basename('/project/src/'); // Returns: 'src'
DohPath.Dirname('/project/src/');  // Returns: '/project'

DohPath.Basename('/'); // Returns: '/'
DohPath.Dirname('/');  // Returns: '/'

DohPath.Basename('file.txt'); // Returns: 'file.txt'
DohPath.Dirname('file.txt');  // Returns: '.'
```

### **Example 10: Path Conversion for Different Contexts**

```javascript
// For storing paths in configuration:
const absolutePath = '/project/root/assets/images/logo.png';
const storedPath = DohPath.DohSlash(absolutePath);
// Store as: '/assets/images/logo.png'

// For module-specific references:
const moduleContext = '/project/root/modules/profile/index.js';
const moduleRelativePath = DohPath.Caret(absolutePath, moduleContext);
// Store as: '^/../../assets/images/logo.png'

// For traditional system compatibility:
const traditionalPath = DohPath.Dot(absolutePath, moduleContext);
// Store as: './../../assets/images/logo.png'
```

## **Best Practices**

1. **Use DohSlash for Project-Wide Resources:**
   ```javascript
   const configPath = DohPath('/config/app.json');  // Relative to LoadDohFrom
   ```

2. **Use Caret for Module-Local Resources:**
   ```javascript
   const stylePath = DohPath('^/styles/component.css');  // Relative to ArbitrarilyRelativePath
   ```

3. **Prefer Module Integration:**
   - Let Doh provide DohPath through module injection
   - Avoid manual context management
   ```javascript
   Doh.Module('MyModule', function(DohPath) {
       // DohPath is already Overloaded with this module's context
       const configPath = DohPath('/config/settings.json');
       const localPath = DohPath('^/styles/local.css');
   });
   ```

4. **For Standalone Scripts, Use Overload:**
   ```javascript
   const DohPath = DohPath.Overload(import.meta.url);
   // Now you can use DohPath without specifying ArbitrarilyRelativePath
   ```

5. **For Path Storage:**
   - Use DohSlash for project-wide references
   - Use Caret only when arbitrarily-relative paths are needed
   - Consider converting to appropriate format when sharing paths between contexts

## **FAQ**

### **1. What's the difference between LoadDohFrom and ArbitrarilyRelativePath?**
`LoadDohFrom` is a global variable that defines the project root and serves as the reference point for all `/`-prefixed paths. `ArbitrarilyRelativePath` is a parameter that defines the local context for resolving `^/`-prefixed paths, typically set to the current file's path.

### **2. When should I use DohSlash vs Caret paths?**
Use DohSlash (`/`) for paths that should resolve from your project root and remain consistent project-wide. Use Caret (`^/`) for paths that need to maintain relativity to their containing file, especially useful for components or modules that might be moved.

### **3. Why use Overload instead of just passing ArbitrarilyRelativePath?**
Overload creates a specialized DohPath instance with a pre-configured default context, eliminating the need to repeatedly pass the same context. It's a drop-in replacement that maintains all the original functionality while adding a default context.

### **4. Can I overload an already-overloaded DohPath?**
Yes, it's safe to call Overload on an already-overloaded DohPath. Each call creates a new specialized instance with the updated context, allowing for flexible and layered context management.

### **5. What's the difference between Dot and Caret notation?**
Caret notation (`^/`) is Doh-specific and designed to maintain arbitrarily-relative paths without interference from automatic path resolvers. Dot notation (`./ or ../`) is the traditional format used in most JavaScript systems but can be problematic when paths are resolved automatically in different contexts. Caret paths allow explicit control over relativity.

### **6. How does the layered relativity system benefit my application?**
The layered system allows you to:
- Store paths without hardcoding absolute file paths
- Convert seamlessly between different relativity contexts
- Maintain proper references when modules or components move
- Support both project-wide and component-specific resource references
- Share paths between environments (server/browser) reliably