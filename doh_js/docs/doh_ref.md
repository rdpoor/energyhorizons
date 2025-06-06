# Deploy.js Properties

## Runtime Availability
🟢 Node.js | 🌐 Browser | 🔄 Server-Executed

## Methods

**Doh.load**(deps, [rel_path]) 🟢🌐
- Load dependency block
- deps: Array/string of dependencies
- rel_path: Resolution path
- see [load](/docs/core/load) for more details

**Doh.Package**(package_name, package_object) 🟢🔄
- Define new Doh package
- see [package](/docs/core/packages) for more details

**Doh.Module**(module_name, [inherits], module_body, [Globals]) 🟢🌐
- Define new Doh module
- inherits: Optional inheritance array
- module_body: Module code function
- Globals: Optional globals object
- see [module](/docs/core/modules) for more details

**Doh.Pod**(package_name, pod_object) 🟢🔄
- Define the default pod settings
- see [pods](/docs/core/pods) for more details

**Doh.Install**(module_name, installs, [callback]) 🟢🔄
- Run module install commands
- callback: Runs on install/update
- see [install](/docs/tools/external_packages) for more details

**Doh.CLI**(module_name, command_defs_object) 🟢🔄
- Attach files that provide CLI features with `doh [command]`
- command_defs_object: keyed by command, value should be an object where `{file:'^/path/to/cli_file.js', help:"help text for 'doh help'"}`
- see [CLI](/docs/tools/cli) for more details

## Environment Detection

**Doh.IsBrowser**() 🟢🌐
- `true` when Doh detects that the `top` is also the `window`

**Doh.IsLocalFileBrowser**() 🟢🌐
- `true` when Doh.IsBrowser() *and* Doh.BasePathIsLocalFileURL are 'truthy' (window.location.href starts with "`file://`")

**Doh.IsNode**() 🟢🌐
- `true` when `global`, `process`, `process.versions`, and `process.versions.node` are *not* undefined
- Also `true` when IsBun(), IsDohRuntime() and IsDeno() are `true`

**Doh.IsBun**() 🟢🌐
- `true` when `Bun` is *not* undefined
- Also `true` when IsDohRuntime() is `true`

**Doh.IsDohRuntime**() 🟢🌐
- `true` when `DohRuntime` is *not* undefined

**Doh.IsDeno**() 🟢🌐
- `true` when `Deno` is *not* undefined

## Logging

**Doh.log**(...messages) 🟢🌐

**Doh.debug**(...messages) 🟢🌐

**Doh.error**(...messages) 🟢🌐

**Doh.throw**(...messages) 🟢🌐

**Doh.warn**(...messages) 🟢🌐

## Path Handling

**Doh.parse_load_statement**(loadStatement) 🟢🌐
- Parse a load statement into an object describing what Doh uses when handling the statement

**Doh.parseAndRemoveLoadDecorators**(loadStatement) 🟢🌐
- Parse and remove load decorators from a complex load statement

**Doh.removeTrailingSlash**(str) 🟢🌐
- Remove trailing slash from a string

**Doh.toForwardSlash**(path) 🟢🌐
- Convert path to forward slashes

## Reference Handling

**Doh.parse_ref**(object, property_str) 🟢🌐
- Parse reference string into object and property (returns an array of the object and the property name)

**Doh.parse_ref_container**(object, property_str) 🟢🌐
- Parse reference string into container object of the property

**Doh.parse_ref_prop**(property_str) 🟢🌐
- Parse reference string into the property name

**Doh.parse_reference**(object, property_str, count_back=0) 🟢🌐
- Parse reference string into the reference itself, with optional count_back for getting the container of a reference

## State Objects

### Module Tracking
- **Doh.Packages** 🟢🌐: Registered *Doh* packages (Not NPM or ESM)
- **Doh.Loading** 🟢🌐: All "loadables" attempting to load in the current environment (keyed by full load statement string)
- **Doh.Loaded** 🟢🌐: Full contents/exports/elements from all "loadables" that have successfully loaded in the current environment (keyed by full load statement string)



### Environment
- **Doh.Globals** 🟢🌐: Global variables/exports
- **Doh.pod** 🟢: Pod configuration (see [Pods](/docs/core/pods) for more details)
- **Doh.env** 🟢🌐: Environment string ('nodejs' or 'browser', exclusively)
- **Doh.nodejs** 🟢: Node.js flag
- **Doh.browser** 🌐: Browser flag
- **Doh.DebugMode** 🟢🌐: Debug flag
- **Doh.ReduceWarnings** 🌐: Warning reduction flag
- **Doh.performance** 🟢🌐: Performance methods


# Object/Pattern Properties

- [Object](/docs/patterns/object): Core object concepts and usage
- [Object Lifecycle](/docs/patterns/lifecycle): How objects are created, initialized and destroyed
- [Patterns](/docs/patterns/patterns): Template system for defining object types
- [Resolution order](/docs/core/resolution_order): Multiple inheritance and composition
- [Melded Object Composition (MOC)](/docs/patterns/moc): Property melding and validation system
- [Type Checking](/docs/patterns/seeif): Runtime type checking and validation

**Doh.Pattern**(name, [inherits], idea) 🟢🌐
- Define new Doh pattern
- inherits: Optional patterns to inherit from
- idea: Pattern definition object

**Doh.New**(pattern, idea, [phase]) 🟢🌐
- Create pattern instance
- pattern: Name/array of patterns
- phase: Optional machine phase

**Doh.InstanceOf**(object, [pattern]) 🟢🌐
- Check pattern instance

## ID Generation

**Doh.new_id**() 🟢🌐
- Returns: number (incremental ID)

**Doh.NewUUID**() 🟢🌐
- Returns: string (UUID)

## State Objects

### Pattern Registration
- **Doh.Patterns** 🟢🌐: Registered patterns
- **Doh.PatternInheritedBy** 🟢🌐: Inheritance tracking
- **Doh.PatternModule** 🟢🌐: Pattern-to-module mapping
- **Doh.ModulePatterns** 🟢🌐: Module-to-pattern mapping

# Meld Properties

- [Melded Object Composition (MOC)](/docs/patterns/moc): Meld properties and ideas

### Object Melding
**Doh.meld_deep**(dest={}, ...sources) 🟢🌐
- Deep merge objects (types must match)

**Doh.meld_objects**(dest, ...sources) 🟢🌐
- Meld objects into destination (types must match)

**Doh.meld_into_objectobject**(...sources) 🟢🌐
- Meld into new object (types can be string, array or object)

**Doh.blend**(destination, source) 🟢🌐
- Blend values by type

### Array Operations
**Doh.meld_arrays**(destination, array=[], [force_new]) 🟢🌐
- Merge arrays, deduplicate (types must match)

**Doh.meld_into_array**(...sources) 🟢🌐
- Meld into new array (types can be string or array)

**Doh.meld_concat**(...args) 🟢🌐
- Concatenate strings/arrays

### Idea Melding
**Doh.meld_ideas**(destination={}, idea, [deep_moc], [ref_opts]) 🟢🌐
- Meld objects as ideas (use MOC engine)

## Array Utilities

**Doh.grep**(array, callback, [inverse]) 🟢🌐
- Filter array with callback

**Doh.array_move**(array, from_index, to_index) 🟢🌐
- Move array element

**Doh.array_unique**(array) 🟢🌐
- Remove duplicates

**Doh.in_array**(item, array) 🟢🌐
- Check item existence

**Doh.object_keys_from_array_values**(array=[]) 🟢🌐
- Create object from array values


# Mimic

### Property Synchronization
**Doh.mimic**(my_thing, my_prop, their_thing, their_prop, [on_change_callback]) 🟢🌐
- Sync props between objects  
- my_thing/prop: Source object/property
- their_thing/prop: Target object/property
- on_change_callback: Optional change handler

### Property Observation
**Doh.observe**(object, prop, [on_change_callback], [on_every_callback]) 🟢🌐
- Watch object property changes
- on_change_callback: Run on value change
- on_every_callback: Run on every set

# HTML Properties
## Browser DOM Integration (🌐 only)

### Core References
- **Doh.body**: Document body element, wrapped with DohObject
- **Doh.win**: Window object reference, wrapped with jQuery

### Window Management
- **Doh.refresh_win**(): Update window info
- **Doh.OnWindowResizeListeners**: Resize handlers for Doh.refresh_win()
- **Doh.WindowSizes**: Current window dimensions

### Controls & Objects
**Doh.get_dobj**(selector)
- Get Doh object by selector

**Doh.fix_untitled_controls**()
- Auto-title unnamed controls
- **Doh.UntitledControls**: Controls that are pending titles