let Doh = globalThis.Doh = {};
globalThis.DohOptions = globalThis.DohOptions || {};
if (typeof globalThis.DohStartTime === 'undefined') {
  globalThis.DohStartTime = performance.now();
  const DohOptions = globalThis.DohOptions || {};
  DohOptions.package_manifest_is_loading = false;
  function IsBrowser() {
    return (typeof top !== 'undefined' && typeof top.window !== 'undefined');
  }
  function IsLocalFileBrowser() {
    return IsBrowser() && Doh.BasePathIsLocalFileURL;
  }
  function IsNode() {
    return (typeof global !== "undefined" && typeof process !== 'undefined' && process.versions != null && process.versions.node != null);
  }
  function IsDeno() {
    return (typeof Deno !== 'undefined');
  }
  function IsBun() {
    return (typeof Bun !== 'undefined');
  }
  function IsDohRuntime() {
    return (typeof DohRuntime !== 'undefined');
  }
  function IsClient() {
    return IsBrowser();
  }
  function IsHost() {
    return IsNode() || IsDeno();
  }

  function heapUsed() {
    if (IsNode()) return (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    // browsers don't support this
    if (IsBrowser()) return NaN;
    // deno supports this
    if (IsDeno()) return (Deno.memory.heapUsed / 1024 / 1024).toFixed(2);
    return NaN;
  }
  function cpuUsage() {
    if (IsNode()) return (process.cpuUsage().system / 1000000).toFixed(2);
    if (IsDeno()) return (Deno.metrics.cpuUsage().system / 1000000).toFixed(2);
    return NaN;
  }


  let filepathcleaner = function (p) {
    if (p.startsWith('file:///')) p = p.slice(8);
    return p;
  }
  const toForwardSlash = (str) => str.replace(/\\/g, '/');
  const removeTrailingSlash = (str) => typeof str === 'string' && str.endsWith('/') ? str.slice(0, -1) : str;

  //MARK: Colorize
  const colorize = (text, color) => {
    // Early return for browser environment - no colors needed
    //if (IsBrowser()) return text;
    const colors = colorize.colors;
    if (!colors[color]) return text;
    return `${colors[color]}${text}${colors.reset}`;
  };
  // Terminal colors for Node environment
  colorize.colors = {
    black: '\x1b[30m',
    white: '\x1b[37m',
    brightwhite: '\x1b[97m',
    gray: '\x1b[90m',
    grey: '\x1b[90m',
    red: '\x1b[31m',
    brightred: '\x1b[91m',
    green: '\x1b[32m',
    brightgreen: '\x1b[92m',
    yellow: '\x1b[33m',
    brightyellow: '\x1b[93m',
    blue: '\x1b[34m',
    brightblue: '\x1b[94m',
    magenta: '\x1b[35m',
    brightmagenta: '\x1b[95m',
    cyan: '\x1b[36m',
    brightcyan: '\x1b[96m',
    hidden: '\x1b[90m',
    reset: '\x1b[0m'
  };
  /* blessed colors
  var colorNames = exports.colorNames = {
    // special
    default: -1,
    normal: -1,
    bg: -1,
    fg: -1,
    // normal
    black: 0,
    red: 1,
    green: 2,
    yellow: 3,
    blue: 4,
    magenta: 5,
    cyan: 6,
    white: 7,
    // light
    lightblack: 8,
    lightred: 9,
    lightgreen: 10,
    lightyellow: 11,
    lightblue: 12,
    lightmagenta: 13,
    lightcyan: 14,
    lightwhite: 15,
    // bright
    brightblack: 8,
    brightred: 9,
    brightgreen: 10,
    brightyellow: 11,
    brightblue: 12,
    brightmagenta: 13,
    brightcyan: 14,
    brightwhite: 15,
    // alternate spellings
    grey: 8,
    gray: 8,
    lightgrey: 7,
    lightgray: 7,
    brightgrey: 7,
    brightgray: 7
  };
  */
  const header_color = 'green';
  const info_color = 'brightgreen';
  const text_color = 'cyan';
  const number_color = 'yellow';
  const error_color = 'red';
  const warn_color = 'yellow';
  const hidden_color = 'hidden';


  //MARK: Initialize
  // console.log(colorize('\nInitializing Doh...', header_color));
  // if (IsNode() || IsDeno()) console.log(colorize('  Starting Heap size:', text_color), colorize(heapUsed() + ' MB', number_color));
  let log, spinner;
  globalThis.doh_spinner = null;
  // Import and run ensure environment function if we're in Node or Deno
  if (IsNode() || IsDeno()) {
    await import('@clack/prompts').then(mod => {
      log = mod.log;
      spinner = mod.spinner;
      globalThis.doh_spinner = spinner();
      // globalThis.doh_spinner.start();
    });
    try {
      const importPath = IsNode() ? './ensure.js' : new URL('./ensure.js', import.meta.url).href;
      import(importPath)
        .then(repair => {
          //console.log(colorize('Ensuring Doh environment...', header_color));
          return repair.default();
        })
        .then(result => {
          if (result) {
            //console.log(colorize('  Doh environment ensure completed.', info_color));
          }
        })
        .catch(err => {
          console.warn(colorize('  Warning: Could not ensure Doh environment:', warn_color), err.message);
        });
    } catch (err) {
      console.warn(colorize('  Warning: Error attempting to ensure Doh environment:', warn_color), err.message);
    }
  }

  //MARK: Environment
  // console.log(colorize('Detecting Environment...', header_color));

  if (IsNode()) {
    // map the window object to global so that Doh can use it
    var window = global.window = global;
    globalThis.DohDebugMode = false;
    // determine from the command line if we need debug
    let args = process.argv.slice(2);
    for (let arg of args) {
      if (arg === 'debug') {
        DohDebugMode = true;
      }
    }
  } else if (IsDeno()) {
    // map the window object to globalThis so that Doh can use it
    var window = globalThis.window = globalThis;
    globalThis.DohDebugMode = false;
    // determine from the command line if we need debug
    let args = Deno.args;
    for (let arg of args) {
      if (arg === 'debug') {
        DohDebugMode = true;
      }
    }
  } else if (IsBrowser()) {
    // sometimes during loading, the window is not fully attatched to the global object
    window = globalThis.window;
    window.DohDebugMode = false;
    // determine from the url if we need debug
    let paramString = location.href.split('?')[1],
      queryString = new URLSearchParams(paramString),
      param_key, param_value;
    for (let pair of queryString.entries()) {
      param_key = pair[0];
      param_value = pair[1];
      if (param_key === 'debug') {
        // if we send debug=false, change the value to be boolean. anything else will be true anyway
        if (param_value === 'false') param_value = false;
        // pass the value through to DebugMode so we can eventually set debug levels
        DohDebugMode = param_value;
      }
    }
  } else {
    console.warn(colorize('  !!Unknown environment!!', error_color));
  }


  //MARK: DohPath
  // import DohPath from './dohpath.js';
  await (async function () {
    // polyfills
    if (!globalThis.Doh) {
      globalThis.Doh = {};
    }
    if (!globalThis.IsLocalFileBrowser) {
      globalThis.IsBrowser = function () {
        return (typeof top !== 'undefined' && typeof top.window !== 'undefined');
      }
      globalThis.IsLocalFileBrowser = function () {
        return globalThis.IsBrowser() && Doh.BasePathIsLocalFileURL;
      }
      globalThis.IsNode = function () {
        return (typeof global !== "undefined" && typeof process !== 'undefined' && process.versions != null && process.versions.node != null);
      }
    }
    if (IsBrowser()) {
      function getDohBasePathFromUrl(importmetaurl) {
        if (importmetaurl) {
          return importmetaurl.replace(/\/doh_js\/[^/]+\.js$/, '');
        }
        return null;
      }
  
      // a subpath to load doh from
      globalThis.LoadDohFrom = globalThis.LoadDohFrom || getDohBasePathFromUrl(import.meta.url) || '';
  
      if (globalThis.LoadDohFrom.startsWith('file://')) {
        Doh.BasePathIsLocalFileURL = true;
      }
      // now IsLocalFileBrowser actually works
    }
  
    let useVirtualFileSystem = false;
    if (globalThis.Doh && IsLocalFileBrowser()) {
      useVirtualFileSystem = true;
    }
  
    let fileURLToPath, pathToFileURL;
    if (IsNode()) {
      await import('url').then(mod => { fileURLToPath = mod.fileURLToPath; pathToFileURL = mod.pathToFileURL; });
    }
    const isRelativePath = (str) => typeof str === 'string' && !str.startsWith(globalThis.LoadDohFrom);
    const isDataURL = (str) => typeof str === 'string' && str.startsWith('data:');
    const isFileURL = (str) => typeof str === 'string' && str.startsWith('file://');
    const FromFileURL = function (p) {
      if (IsNode()) {
        if (isFileURL(p)) return fileURLToPath(p);
        return p;
      }
      if (!p) return p;
      if (isFileURL(p)) p = p.slice(8);
      return p;
    }
    const toForwardSlash = (str) => str.replace(/\\/g, '/');
    const toBackSlash = (str) => str.replace(/\//g, '\\');
    const removeTrailingSlash = (str) => typeof str === 'string' && str.endsWith('/') ? str.slice(0, -1) : str;
    const removeLeadingSlash = (str) => typeof str === 'string' && str.startsWith('/') ? str.slice(1) : str;
    const trimSlashes = (str) => removeTrailingSlash(removeLeadingSlash(toForwardSlash(str)));
    // first, replace ONLY an initial .. with a ^/..
    // then, replace ONLY an initial . with a ^
    const convertDotNotation = (str) => str.replace(/^(\.\.\/)/, '^/../').replace(/^(\.\/)/, '^/').replace(/^\./, '^');
    const cleanDefaultRelativeLoadDohFrom = function (ArbitrarilyRelativePath) {
      if (!ArbitrarilyRelativePath) ArbitrarilyRelativePath = import.meta.url;
      if (typeof ArbitrarilyRelativePath !== 'string') {
        // this means it's a url object
        ArbitrarilyRelativePath = ArbitrarilyRelativePath.toString();
      }
      return removeTrailingSlash(toForwardSlash(FromFileURL(ArbitrarilyRelativePath)));
    }
    const virtualFile = function (p, ArbitrarilyRelativePath) {
      if (!useVirtualFileSystem || !globalThis.Doh || !globalThis.Doh.VFS) return false;
      // assume p is a cleaned and formatted path
      // check relative path first, assuming it will be the same or deeper than LoadDohFrom
      if (p.startsWith(ArbitrarilyRelativePath)) {
        p = p.slice(ArbitrarilyRelativePath.length);
      } else if (p.startsWith(globalThis.LoadDohFrom)) {
        p = p.slice(globalThis.LoadDohFrom.length);
      }
      // ensure p has a leading slash
      if (!p.startsWith('/')) p = '/' + p;
      return globalThis.Doh.VFS[p] || false;
    }
    //MARK: DohPath
    globalThis.DohPath = (function () {
      return function (p, ArbitrarilyRelativePath = null) {
        if (!p) return p;
        if (isDataURL(p)) return p;
  
        // cleaning
        p = toForwardSlash(p);
        p = convertDotNotation(p);
  
        // if LoadDohFrom is not set, set it to the directory above the directory that contains the current file
        // or the current working directory if it's a node environment
        if (!globalThis.LoadDohFrom) {
          if (!IsNode()) globalThis.LoadDohFrom = FromFileURL(import.meta.url.split('/').slice(0, -2).join('/'));
          else globalThis.LoadDohFrom = process.cwd();
        }
        globalThis.LoadDohFrom = removeTrailingSlash(toForwardSlash(globalThis.LoadDohFrom));
        if (globalThis.LoadDohFrom) {
          // if the path already contains LoadDohFrom, don't add it again
          if (p.includes(globalThis.LoadDohFrom)) return p;
          // if the path starts with a slash, add LoadDohFrom
          if (p.startsWith('/')) return globalThis.LoadDohFrom + p;
        }
        // if the path starts with a ^, replace it with the relative path...
        // difference between LoadDohFrom and the current file
        // also support multiple ../
        if (p.startsWith('^')) {
          ArbitrarilyRelativePath = cleanDefaultRelativeLoadDohFrom(ArbitrarilyRelativePath);
          const relpath = ArbitrarilyRelativePath.split('/').slice(0, -1).join('/');
          const count = (p.match(/\.\.\//g) || []).length;
          let newPath = relpath;
          for (let i = 0; i < count; i++) {
            newPath = newPath.split('/').slice(0, -1).join('/');
          }
          newPath = newPath + p.slice(1 + (count * 3));
          //console.log('DohPath:', p, '=>', newPath);
          return newPath;
        }
  
        return p;
      }
    })();
  
  
    //MARK: .Absolute
    globalThis.DohPath.Absolute = function (p, ArbitrarilyRelativePath = null) {
      if (isDataURL(p)) return p;
      return DohPath(p, ArbitrarilyRelativePath);
    }
  
  
    //MARK: .Relative
    globalThis.DohPath.Relative = function (p, ArbitrarilyRelativePath = null) {
      if (isDataURL(p)) return p;
      // convert the path to a relative path from the doh root
      // first, get the absolute path of the doh root
      const dohRoot = removeTrailingSlash(DohPath('/', ArbitrarilyRelativePath));
      let cleanPath = removeTrailingSlash(toForwardSlash(p));
      cleanPath = DohPath(cleanPath, ArbitrarilyRelativePath);
  
      // if cleanPath starts with dohRoot, remove it to get the relative path
      if (cleanPath.startsWith(dohRoot)) {
        cleanPath = cleanPath.slice(dohRoot.length);
      }
  
      cleanPath = removeLeadingSlash(cleanPath);
  
      // if paths don't share a common root, return the original cleaned path
      return cleanPath;
    }
  
  
    //MARK: .DohSlash
    globalThis.DohPath.DohSlash = function (p, ArbitrarilyRelativePath = null) {
      if (isDataURL(p)) return p;
      const relative_dohpath = DohPath.Relative(p, ArbitrarilyRelativePath);
  
      const vf = virtualFile(relative_dohpath, ArbitrarilyRelativePath);
      if (vf) return vf;
  
      // add a leading slash to relative path so it points to the path relative to the doh root
      return `/${relative_dohpath}`;
    }
  
  
    //MARK: .Caret
    globalThis.DohPath.Caret = function (p, ArbitrarilyRelativePath = null) {
      if (isDataURL(p)) return p;
      // convert the path to a caret path from the *RelativeDohFrom* root
      if (p.startsWith('^')) {
        return p;
      }
      // we need to get the absolute path of ArbitrarilyRelativePath, if it's a file, get the containing folder
      const absoluteRLDF = DohPath(ArbitrarilyRelativePath);
      if (!absoluteRLDF) return p;
      let cleanPath = removeTrailingSlash(toForwardSlash(p));
      cleanPath = DohPath(cleanPath, ArbitrarilyRelativePath);
  
      // replace all of the parts of cleanPath that are the same as absoluteRLDF with ^
      for (let i = 0; i < absoluteRLDF.length; i++) {
        if (cleanPath.startsWith(absoluteRLDF[i])) {
          cleanPath = cleanPath.slice(absoluteRLDF[i].length);
        }
      }
      return `^/${cleanPath}`;
    }
  
  
    //MARK: .Dot
    globalThis.DohPath.Dot = function (p, ArbitrarilyRelativePath = null) {
      if (isDataURL(p)) return p;
      // convert the path to a dot notation path
      // first, convert the path to a caret notation path
      p = DohPath.Caret(p, ArbitrarilyRelativePath);
      // then, replace an opening `^` with a `.`, if present
      if (p.startsWith('^')) {
        p = p.replace('^', '.');
      }
      return p;
    }
  
  
    //MARK: .FileURL
    globalThis.DohPath.FileURL = function (p, ArbitrarilyRelativePath = null) {
      if (isDataURL(p)) return p;
      const dohpath = DohPath(p, ArbitrarilyRelativePath);
  
      if (IsNode()) {
        return pathToFileURL(dohpath);
      }
      if (isFileURL(p)) return p;
      return 'file://' + dohpath;
    }
  
  
    //MARK: TOOLS:
  
  
  
  
  
    //MARK: .Compare
    // DohPath.Compare is meant to determine if two paths resolve to the same file
    // it is much more permissive than strict equality
    globalThis.DohPath.Compare = function (p1, p2, ArbitrarilyRelativePath = null) {
      // ok, lets make this a waterfall function
      if(p1 === p2) return true;
  
      // the next mozt likely case is that the slashes are different or trailing
      p1 = removeTrailingSlash(toForwardSlash(p1));
      p2 = removeTrailingSlash(toForwardSlash(p2));
  
      if(p1 === p2) return true;
  
      // ok, at this point, we need to try and resolve the paths
      p1 = DohPath(p1, ArbitrarilyRelativePath);
      p2 = DohPath(p2, ArbitrarilyRelativePath);
  
      // ok, now we need to compare the paths
      // at this point, we can just compare the paths
      // this is because we know that the paths are absolute
      // and that the dohRoot is the same for both paths
      // no matter how they are formatted, they should resolve to the same file
      return p1 === p2;
    }
  
  
    //MARK: .Join
    globalThis.DohPath.Join = function (p, ...fragments) {
      if (isDataURL(p)) return p;
      // we need to imitate the behavior of path.join
      // because we need to be browser compatible, we can't rely on the node path module
      let newP = removeTrailingSlash(toForwardSlash(p));
      for (const fragment of fragments) {
        if (!isRelativePath(fragment) || isDataURL(fragment)) {
          throw new Error('DohPath.Join: fragments must be a relative path, got: ' + fragment + ' for p: ' + newP);
        }
        newP = newP + '/' + trimSlashes(toForwardSlash(fragment));
      }
      return newP;
    }
  
  
    //MARK: .Basename
    globalThis.DohPath.Basename = function (p) {
      if (isDataURL(p)) return p;
      const originalPath = p; // Keep original for checks
      p = toForwardSlash(p);
      // Remove trailing slash unless it's the only character (root)
      if (p.length > 1 && p.endsWith('/')) {
        p = p.slice(0, -1);
      }
      // Now split and get the last part
      const parts = p.split('/');
      const basename = parts.pop();
      // If the result is empty AND the original started with '/', it means the path was root or ended in /
      // In this case, basename of root '/' should be '/'
      if (basename === '' && originalPath.startsWith('/')) {
          return '/';
      }
      // Otherwise, return the popped part (which could be empty if input was '')
      return basename;
    }
  
    //MARK: .Dirname
    globalThis.DohPath.Dirname = function (p) {
      if (isDataURL(p)) return p;
      const originalPath = p; // Keep original for checks
      p = toForwardSlash(p);
      // Remove trailing slash unless it's the only character (root)
      if (p.length > 1 && p.endsWith('/')) {
        p = p.slice(0, -1);
      }
      // Now split, slice, join
      const parts = p.split('/');
      // If only one part (e.g., "file.txt" or "/file.txt" after removing trailing slash)
      if (parts.length <= 1) {
        // If original started with '/', it's the root directory
        if (originalPath.startsWith('/')) return '/';
        // Otherwise, it's in the current directory implicitly
        return '.'; // Mimic path.dirname('.') behaviour
      }
      // More than one part, return all but the last, ensuring root ('/') isn't returned as empty
      return parts.slice(0, -1).join('/') || '/';
    }
    
  
  
    //MARK: .Overload
    globalThis.DohPath.Overload = function (import_url) {
      if (isDataURL(import_url)) return DohPath;
      // overload is used like this:
      //
      // const DohPath = globalThis.DohPath.Overload(import.meta.url);
      //
      // this allows you to use DohPath without having to pass in the import.meta.url
      // it will use the url of the current file as the default
      // for this to work, we need to return a DohPath with the .Relative method overridden as well as the .DohPath method
      // we can't just override the DohPath method because it's a function and we can't override functions in javascript
      // so we need to return a new object with the .Relative method overridden
      const DohPath = (p, ArbitrarilyRelativePath) => globalThis.DohPath(p, ArbitrarilyRelativePath || import_url);
      DohPath.FileURL = (p, ArbitrarilyRelativePath) => globalThis.DohPath.FileURL(p, ArbitrarilyRelativePath || import_url);
      DohPath.Relative = (p, ArbitrarilyRelativePath) => globalThis.DohPath.Relative(p, ArbitrarilyRelativePath || import_url);
      DohPath.DohSlash = (p, ArbitrarilyRelativePath) => globalThis.DohPath.DohSlash(p, ArbitrarilyRelativePath || import_url);
      DohPath.Caret = (p, ArbitrarilyRelativePath) => globalThis.DohPath.Caret(p, ArbitrarilyRelativePath || import_url);
      DohPath.Dot = (p, ArbitrarilyRelativePath) => globalThis.DohPath.Dot(p, ArbitrarilyRelativePath || import_url);
      DohPath.Compare = (p1, p2, ArbitrarilyRelativePath) => globalThis.DohPath.Compare(p1, p2, ArbitrarilyRelativePath || import_url);
      DohPath.Join = globalThis.DohPath.Join;
      DohPath.Basename = globalThis.DohPath.Basename;
      DohPath.Dirname = globalThis.DohPath.Dirname;
      DohPath.Overload = (url) => globalThis.DohPath.Overload(url);
      return DohPath;
    }
  })();


  //MARK: DebugMode
  // show more errors and warnings, allow debug logs to throw breakpoints and most importantly...
  // Proxy DohObjects (set to 'proxy' to enable)
  globalThis.DohDebugMode = globalThis.DohDebugMode || false;
  // custom error class for catching dohball errors
  class DohError extends Error {
    constructor(message) {
      super('DohError: ' + message);
      this.name = 'DohError';
    }
  }
  globalThis.DohError = DohError;

  globalThis.glob = {};

  //MARK: SeeIf
  (function () {
    const evaluateCondition = (value, condition) => {
      let args = undefined;
      switch (SeeIf.TypeOf(condition)) {
        case 'IsArray':
          // If the condition is an array, recursively evaluate it
          return If(value, condition);
        case 'IsString':
          // our assignment allows SeeIf methods to be sent directly as functions or as strings
          // detect if the condition is a string and if it is, convert it to a function
          condition = SeeIf[condition];
          break;
        case 'IsObjectObject':
          // if the condition is an object, it should be a single key/value pair
          // the key is the SeeIf method to use and the value is the argument to pass to it
          let method = Object.keys(condition)[0];
          args = condition[method];
          if (IsString(args)) args = [args];
          // if the method is a string, convert it to a function
          if (IsString(method)) method = SeeIf[method];
          condition = method;
          break;
      }
      let result = false;
      if (IsFunction(condition)) {
        // If the condition is a function, call it with the current data
        if (args) result = condition(value, ...args);
        else result = condition(value);
      }
      result = !!result;
      return result;
    };
    // the conditions is an array of conditionals and operators like so:
    // ['IsTrue', 'And', IsFalse, Or, 'IsString']
    // it should be nestable like:
    // ['IsTrue', 'And', ['IsFalse', 'Or', 'IsString']]
    // evaluate the conditions and return the result
    const SeeIf = globalThis.SeeIf = function (value, conditions, callback) {
      let result = evaluateCondition(value, conditions[0]);
      let i, operator, nextCondition;
      for (i = 1; i < conditions.length; i += 2) {
        operator = conditions[i];
        nextCondition = conditions[i + 1];
        switch (operator) {
          case 'And':
            result = result && evaluateCondition(value, nextCondition);
            break;
          case 'Or':
            result = result || evaluateCondition(value, nextCondition);
            break;
          // Add more operators here
          default:
            throw Doh.error(`If: Unknown operator '${operator}'.`);
        }
        // If the result is false, we can stop evaluating the conditions
        if (!result) break;
      }
      result = !!result;
      if (result) if (IsFunction(callback)) return callback(result, value, conditions);
      return result;
    };
    // enshrine the definitions of variable states in the SeeIf library
    Object.assign(SeeIf, {
      /*
      * These have to be in this order because they are the base types for type_of
      * When we loop over SeeIf, we will always catch one of these, so these are the most primitive types
      */
      // undefined refers to objects that have not been defined anywhere in code yet
      IsUndefined: value => typeof value === 'undefined',
      // null is supposed to refer to objects that have been defined, but have no value. In truth because of "falsey" values, it can have other meanings
      IsNull: value => value === null,
      // string refers to values that are actual string datatype
      IsString: value => typeof value === 'string',
      // function refers to values that are actual functions
      IsFunction: value => typeof value === 'function',
      // true refers to the binary 1 state (Boolean)
      IsTrue: value => value === true,
      // false refers to the binary 0 state (Boolean)
      IsFalse: value => value === false,
      // Number refers to values that are a number datatype EXCEPT NaN (Not a Number)
      IsNumber: value => (typeof value === 'number' && !isNaN(value)),
      // array refers to values that are actual array datatype
      IsArray: value => Array.isArray(value) ? true : false,
      // promise refers to values that are actual promise datatype
      IsPromise: value => value instanceof Promise,
      // dohobject refers to values that are a complex objectobject which was built with Doh
      IsDohObject: value => (InstanceOf ? InstanceOf(value) : false),
      // objectobject refers to values that are complex objects with named properties. No literals or arrays. 
      IsObjectObject: value => (typeof value === 'object' && toString.call(value) == '[object Object]'),

      // MUST BE LAST
      // falsey refers to values that equal binary 0, even if represented by a different datatype. Falsey values include: Undefined, Null, False, '', 0, -1...[negative numbers]
      IsFalsey: value => value ? false : true,
      // Truthy referes to values that equal binary 1, even if represented by a different datatype. Truthy values include: True, 'any string', any_object, HasValue, 1...[positive numbers]
      IsTruthy: value => value ? true : false,

      /*
      * Now the rest for type_match and regular SeeIf usage
      */
      // melded methods are methods that follow the Doh melding interface
      IsMeldedMethod: value => (typeof value === 'function' && value.meld_stack),
      // boolean refers to values that are actual native boolean datatype
      IsBoolean: value => typeof value === 'boolean',
      // defined is supposed to refer to having a usable reference. undefined means without reference. null references are still unusable in JS, so defined nulls should demand special handling
      IsDefined: value => (typeof value !== 'undefined' && value !== null),
      // nullish refers to effectively the opposite of defined
      IsNullish: value => (typeof value === 'undefined' || value === null),
      // arraylike refers to values that act like arrays in every way. they can be used by native array methods
      IsArrayLike: value => (Array.isArray(value) || ((typeof value !== 'undefined' && value !== null) && typeof value[Symbol.iterator] === 'function') && typeof value.length === 'number' && typeof value !== 'string'),
      // iterable refers to values that define a Symbol iterator so that native methods can iterate over them
      IsIterable: value => ((typeof value !== 'undefined' && value !== null) && typeof value[Symbol.iterator] === 'function'),
      // enumerable refers to values that can be iterated over in a for/in loop
      // all objects can be iterated in a for loop and all arrays are objects too.
      IsEnumerable: value => (typeof value === 'object' && value !== null),
      // literal refers to values that are static literals. Strings, booleans, numbers, etc. Basically anything that isn't an object or array. flat values.
      IsLiteral: value => ((typeof value !== 'object' && typeof value !== 'function') || value === null),
      // emptyobject refers to values that are objectobject or arraylike but have no properties of their own. Will return true for both {} and [], as well as IsFalsey.
      IsEmptyObject: value => {
        // falsey is a form of empty
        if (IsFalsey(value)) return true;
        // is it an array with keys? fail if so.
        if (value.length && value.length > 0) return false;
        // if this triggers for an Own property, we fail out.
        for (let key in value) { if (hasOwnProperty.call(value, key)) return false; }
        // is it a set or map? fail if so.
        if (value.size && value.size > 0) return false;
        // it's none of the above, so it can only be an object without Own properties
        return true;
      },
      // keysafe refers to values that are safe for use as the key name in a complex objectobject
      IsKeySafe: value => (typeof value === 'string' && value !== ''),
      // emptystring refers to values that are string literals with no contents
      IsEmptyString: value => value === '',
      // hasvalue refers to values that are defined and notemptystring. specifically this includes 0 and negative numbers where Truthy does not.
      HasValue: value => ((typeof value !== 'undefined' && value !== null) && value !== ''),
      // anything refers to values of any type. it is specifically useful when SeeIf is being used as a filtering library.
      IsAnything: value => true,

      IsStringAndHasValue: value => (typeof value === 'string' && value !== ''),

      IsOnlyNumbers: value => (/^-?\d*\.?\d+$/.test(value)),

      IsInt: value => (typeof value === 'number' && value === parseInt(value)),

      IsObjectObjectAndEmpty: value => {
        // must be an objectobject
        if (NotObjectObject(value)) return false;
        // if this triggers for an Own property, we fail out.
        for (let key in value) { if (hasOwnProperty.call(value, key)) return false; }
        // it's none of the above, so it can only be an object without Own properties
        return true;
      },
      IsObjectObjectAndNotEmpty: value => {
        // must be an objectobject
        if (NotObjectObject(value)) return false;
        return !IsEmptyObject(value);
      },
      IsArrayAndEmpty: value => {
        // must be an array
        if (NotArray(value)) return false;
        return value.length === 0;
      },
      IsArrayAndNotEmpty: value => {
        // must be an array
        if (NotArray(value)) return false;
        return value.length > 0;
      },
      IsStringOrArray: value => (typeof value === 'string' || Array.isArray(value)),
      IsStringOrNumber: value => (typeof value === 'string' || typeof value === 'number'),
      IsStringOrArrayOrObjectObject: value => (typeof value === 'string' || Array.isArray(value) || typeof value === 'object'),
      IsArrayOrObjectObject: value => (Array.isArray(value) || typeof value === 'object'),

      // Not conditions, interestingly different
      NotUndefined: value => typeof value !== 'undefined',
      NotDefined: value => (typeof value === 'undefined' || value === null),
      NotNull: value => value !== null,
      NotFalse: value => value !== false,
      NotTrue: value => value !== true,
      NotBoolean: value => typeof value !== 'boolean',
      NotString: value => typeof value !== 'string',
      // NotNumber refers to values that ARE NOT a number OR ARE NaN (NotaNumber object)
      NotNumber: value => (typeof value !== 'number' || isNaN(value)),
      NotInt: value => (typeof value !== 'number' || value !== parseInt(value)),
      NotArray: value => !Array.isArray(value),
      NotPromise: value => !(value instanceof Promise),
      NotArrayLike: value => !(((typeof value !== 'undefined' && value !== null) && typeof value[Symbol.iterator] === 'function') && typeof value.length === 'number' && typeof value !== 'string'),
      NotIterable: value => !((typeof value !== 'undefined' && value !== null) && typeof value[Symbol.iterator] === 'function'),
      NotEnumerable: value => typeof value !== 'object' || value === null,
      NotFunction: value => typeof value !== 'function',
      NotLiteral: value => typeof value === 'object',
      NotObjectObject: value => !(typeof value === 'object' && toString.call(value) == '[object Object]'),
      NotDohObject: value => !InstanceOf(value),
      NotMeldedMethod: value => !(typeof value === 'function' && value.meld_stack),
      NotKeySafe: value => !(typeof value === 'string' || (typeof value === 'number' && !isNaN(value))),
      NotEmptyString: value => value !== '',
      NotEmptyObject: value => !IsEmptyObject(value),
      LacksValue: value => (typeof value === 'undefined' || value === null || value === ''),
    });
    // some aliases
    Object.assign(SeeIf, {
      NotDefined: SeeIf.IsUndefined,
      NotNullish: SeeIf.IsDefined,
      NotFalsey: SeeIf.IsTruthy,
      NotTruthy: SeeIf.IsFalsey,
      IsSet: SeeIf.IsDefined,
      NotSet: SeeIf.IsUndefined,
      IsObject: SeeIf.IsObjectObject,
      NotObject: SeeIf.NotObjectObject,
      IsAny: SeeIf.IsAnything,
    });
    Object.assign(SeeIf, {
      IsLiteralOrFalse: (value) => IsLiteral(value) || value === false,
      IsStringOrFalse: (value) => IsString(value) || value === false,
      IsNumberOrFalse: (value) => IsNumber(value) || value === false,
      IsIntOrFalse: (value) => IsInt(value) || value === false,
      IsObjectOrFalse: (value) => IsObject(value) || value === false,
      IsObjectObjectOrFalse: (value) => IsObjectObject(value) || value === false,
      IsArrayOrFalse: (value) => IsArray(value) || value === false,
      IsFunctionOrFalse: (value) => IsFunction(value) || value === false,
      IsDohObjectOrFalse: (value) => IsDohObject(value) || value === false,
      IsPromiseOrFalse: (value) => IsPromise(value) || value === false,
      IsPromiseOrFunctionOrFalse: (value) => IsPromise(value) || IsFunction(value) || value === false,
      IsStringOrArrayOrFalse: (value) => IsStringOrArray(value) || value === false,
      IsStringOrArrayOrObjectObjectOrFalse: (value) => IsStringOrArrayOrObjectObject(value) || value === false,
      IsArrayOrObjectObjectOrFalse: (value) => IsArrayOrObjectObject(value) || value === false,
      IsObjectObjectAndNotEmptyOrFalse: (value) => IsObjectObjectAndNotEmpty(value) || value === false,
    })
    // This collection of methods is used in matching and comparing types
    Object.assign(SeeIf, {

      IsEqualTo: (value, compare) => value == compare,
      IsExactly: (value, compare) => value === compare,
      NotEqualTo: (value, compare) => value != compare,
      NotExactly: (value, compare) => value !== compare,
      IsGreaterThan: (value, compare) => value > compare,
      IsLessThan: (value, compare) => value < compare,
      IsGreaterThanOrEqualTo: (value, compare) => value >= compare,
      IsLessThanOrEqualTo: (value, compare) => value <= compare,
      IsIn: (value, compare) => { if (compare && compare.includes) return compare.includes(value); },
      NotIn: (value, compare) => { if (compare && compare.includes) return !compare.includes(value); },
      // other two argument methods

      IsBetween: (value, compare1, compare2) => value > compare1 && value < compare2,
      NotBetween: (value, compare1, compare2) => value < compare1 || value > compare2,
    });
    Object.assign(SeeIf, {
      IsGT: SeeIf.IsGreaterThan,
      IsLT: SeeIf.IsLessThan,
      IsGTE: SeeIf.IsGreaterThanOrEqualTo,
      IsLTE: SeeIf.IsLessThanOrEqualTo,
    });
    // this makes the SeeIf methods available to the inline If system
    SeeIf.And = 'And';
    SeeIf.Or = 'Or';
    SeeIf.IsBrowser = IsBrowser;
    SeeIf.IsLocalFileBrowser = IsLocalFileBrowser;
    SeeIf.IsNode = IsNode;
    SeeIf.IsBun = IsBun;
    SeeIf.IsDohRuntime = IsDohRuntime;
    SeeIf.IsDeno = IsDeno;
    SeeIf.IsClient = IsClient;
    SeeIf.IsHost = IsHost;
    Object.assign(globalThis, SeeIf);

    //MARK: TypeOf
    /**
     *  @brief return the SeeIf primative for value
     *  
     *  @param [in] value [any] thing to find the type of
     *  @return the string name of a SeeIf method that describes the primative for this type of value
     *  
     *  @details Attempts to provide a consistent typeof for javascript primatives
     *  
     *    Doh.type_of()
     *                'IsUndefined'
     *    Doh.type_of('')
     *                'IsString'
     *    Doh.type_of(0)
     *                'IsNumber'
     *    Doh.type_of(false)
     *                'IsBoolean'
     *    Doh.type_of(null)
     *                'IsNull'
     *    Doh.type_of([])
     *                'IsArray'
     *    Doh.type_of({})
     *                'IsObjectObject'
     *    Doh.type_of(function(){})
     *                'IsFunction'
     *    Doh.type_of(New('object',{}))
     *                'IsDohObject'
     */
    SeeIf.TypeOf = function (value) {
      for (let type in SeeIf) {
        if (SeeIf[type](value)) {
          return type;
        }
      }
      // SeeIf can't see it, so it's not defined
      // this should never be possible
      throw Doh.debug("SeeIf couldn't find a type for:'", value, "'");
    };
    SeeIf.Pack = function (conditions) {
      const rtn = [];
      if (!IsArray(conditions)) conditions = [conditions];
      for (let i = 0; i < conditions.length; i++) {
        if (IsArray(conditions[i])) {
          rtn.push(SeeIf.Pack(conditions[i]));
          // if the condition is a function, use it's name
        } else if (IsFunction(conditions[i])) {
          rtn.push(conditions[i].name);
        } else {
          rtn.push(conditions[i]);
        }
      }
      // this should be a nested array of strings
      return rtn;
    };
    SeeIf.Unpack = function (conditions) {
      const rtn = [];
      for (let i = 0; i < conditions.length; i++) {
        if (IsArray(conditions[i])) {
          rtn.push(SeeIf.Unpack(conditions[i]));
        } else if (IsString(conditions[i])) {
          // if the condition is a string, look for a function by that name
          if (SeeIf[conditions[i]]) {
            rtn.push(SeeIf[conditions[i]]);
          } else {
            rtn.push(conditions[i]);
          }
        } else {
          // the condition is not a string, so it's likely an object
          rtn.push(conditions[i]);
        }
      }
      // this should be a nested array of functions and optional arguments
      return rtn;
    };
    SeeIf.Stringify = function (conditions) {
      // pack the conditions
      conditions = SeeIf.Pack(conditions);
      // stringify the conditions
      return JSON.stringify(conditions);
    };
    SeeIf.Parse = function (conditions) {
      // parse the conditions
      conditions = JSON.parse(conditions);
      // unpack the conditions
      return SeeIf.Unpack(conditions);
    };
    //console.log('TEST:', SeeIf('hello', [IsString, And, HasValue, Or, [{IsEqualTo:'hello'}, Or, {IsBetween:[1, 2]}]]));
    //console.log('TEST:', SeeIf('hello', [IsString, And, HasValue]));
    //console.log(SeeIf.Stringify([IsString, And, HasValue, Or, [{IsEqualTo:'hello'}, Or, {IsBetween:[1, 2]}]]));
    //console.log(SeeIf.Parse('["IsString","And","HasValue","Or",[{"IsEqualTo":"hello"},"Or",{"IsBetween":[1,2]}]]'));

    // Create the Doh Global Object. This should be a plain object in the global scope
    // do NOT allow this to be overloaded, create it explicitly here.
  })();


  //MARK: Doh
  Object.assign(globalThis.Doh, {

    IsBrowser, IsLocalFileBrowser, IsNode, IsBun, IsDohRuntime, IsDeno, IsClient, IsHost,
    // show more errors and warnings, allow debug logs to throw breakpoints and most importantly...
    // Proxy DohObjects.
    DebugMode: DohDebugMode,
    // allow Doh to try and fix patterns and objects from older code
    ApplyFixes: true,
    // a list of things that are loading, keyed by the load statement, value is the loader object
    Loading: {},
    // a list of loaded anything, keyed by the load statement, value is the thing that was loaded
    Loaded: {},
    // a list of loaded raw files, keyed by the filepath, value is the thing that was loaded
    RawFileIsLoaded: {},
    // a list of loaded files, keyed by the filepath, value is the thing that was loaded
    FileIsLoaded: {},
    // store scripts we've loaded so we don't duplicate
    ScriptIsLoaded: {},
    // store stylesheets we've loaded so we don't duplicate
    StylesheetIsLoaded: {},
    // store json we've loaded so we don't duplicate
    JSONIsLoaded: {},
    // store yaml we've loaded so we don't duplicate
    YAMLIsLoaded: {},
    // a list of loaded modules keyed by module name
    ModuleIsLoaded: {},
    // a list of loaded pods keyed by pod name
    PodIsLoaded: {},
    //  a list of module dependencies keyed by module name
    ModuleRequires: {},
    // a list of modules that require the keyed module name
    ModuleRequiredBy: {},
    // a list of modules that have been requested to load, keyed by module name, value is the module object
    ModuleWasRequested: {},
    // a list of modules, keyed by module name, value is the module file name
    ModuleFile: {},
    // a list of files, keyed by file name, value is a list of patterns
    PatternsInFile: {},
    // a list of patterns, keyed by pattern name, value is the file name
    PatternFile: {},
    // a list of modules, keyed by module name, value is a list of patterns
    PatternsInModule: {},
    // a list of patterns, keyed by pattern name, value is the module name
    // keyed by pattern, the name of the module that made it (or false if made after load)
    PatternModule: DohOptions.PatternModule || {},
    // keyed by module, a list of patterns it creates
    ModulePatterns: {},
    // allow storage of patterns
    Patterns: {},
    // keyed by pattern, a list of things that inherit from it
    PatternInheritedBy: {},
    // a list of core patterns that are always available
    CorePatterns: DohOptions.CorePatterns || [],
    // Store injection settings for patterns
    PatternInheritRules: {},
    // a list of import exports
    ModulePromises: {},
    // a list of packages, keyed by package name, value is the package object: e.g.: load, path, packagefile, patterns, ...
    Packages: DohOptions.Packages || {},
    // Preloaded packages includes all doh modules that are being loaded or have been loaded, since the core exclusively pre-loads all modules, even when dynamically loaded.
    PreloadedPackages: DohOptions.PreloadedPackages || {},

    ImportMap: DohOptions.ImportMap || {},

    AssetsInModule: {},

    VFS: DohOptions.VFS || {},

    // These are stubs for the packager methods that implement functionality used exclusively by the packager, not at runtime.
    Package: function () { },
    Install: function () { },
    CLI: function () { },
    Pod: function () { },
    AutoPackager: function () { },

    css: function () {
      // this is a stub for the css method
      // it should be implemented by the html module
      // but can be overridden by the user
    },

    Globals: {
      Doh: null,
      DohPath,

      // added later
      LoadDohFrom: null,

      glob,

    },


    //MARK: Performance
    performance: {
      start: function (tag) {
        if (!this[`${tag}_Start`]) this[`${tag}_Start`] = performance.now();
      },
      end: function (tag) {
        if (!this[`${tag}_End`]) this[`${tag}_End`] = performance.now();
      },
      log: function (tag) {
        let thisdif = this.diff(tag);
        if (thisdif < 1000) console.log(`Doh: [${tag}] took`, Number(thisdif.toFixed(2)), 'ms.');
        else if (thisdif < 60000) console.log(`Doh: [${tag}] took`, Number((thisdif / 1000).toFixed(2)), 's.');
        else console.log(`Doh: [${tag}] took`, Number((thisdif / 60000).toFixed(2)), 'm.');
      },
      startlog: function (tag) {
        this.start(tag);
        console.log(`Doh: [${tag}] started`);
      },
      endlog: function (tag) {
        this.end(tag);
        this.log(tag);
      },
      diff: function (tag) { return this[`${tag}_End`] - this[`${tag}_Start`]; },
      Total_Start: DohStartTime,
      heapUsed,
      cpuUsage

    },

    memoryUsed: function () {
      return Doh.performance.heapUsed() + ' MB';
    },
    cpuUsage: function () {
      return Doh.performance.cpuUsage() + ' %';
    },

    sendToParent: function (type, obj) {
      try {
        // Check if we're in a child process that can communicate
        if (process.send) {
          process.send({
            type,
            obj,
            memoryUsed: Doh.memoryUsed(),
            cpuUsage: Doh.cpuUsage()
          });
        }
        return true;
      } catch (error) {
        // Silently ignore errors - this is expected when not in a child process
      }
      return false;
    },

    track_perf: {
      'Core Startup': true,
      'AutoPackager': true,
      'Validate Dependencies': true
    },

    Track: function (tag) {
      this.track_perf[tag] = true;
    },
    TrackStart: function (tag) {
      this.track_perf[tag] = true;
      Doh.performance.start(tag);
    },
    TrackEnd: function (tag) {
      Doh.performance.end(tag);
    },

    toForwardSlash,

    removeTrailingSlash,

    HasReported: {},
    /**
     *  @brief Log a message to Doh, defaults to 'trace' type log
     *  
     *  @param [in] ...arguments [any] values to send to the logger
     *  
     *  @return nothing
     *  
     *  @details Creates a collapsed stack trace for each log entry
     *  console.log('error message', object1, 'some string', objectN, ...);
     */
    // log: console.log.bind(console, ''),
    log: (DohDebugMode ? console.log.bind(console, '') : () => { }),
    /**
     *  @brief log a custom warning to Doh
     *
     *  @param [in] context, context, ...   object(s) of relevence to the warning
     *  @return nothing
     *
     *  @details
     *  Doh.log('', object1, 'some string', objectN, ...);
     */
    warn: console.warn.bind(console, 'Doh.warn:'),
    /**
     *  @brief log a custom error to Doh
     *
     *  @param [in] context, context, ...   object(s) of relevence to the error
     *  @return nothing
     *
     *  @details
     *  Doh.warn('error message', object1, 'some string', objectN, ...);
     */
    error: console.error.bind(console, 'Doh.error:'),
    /**
     *  @brief log a debug error to Doh
     *
     *  @param [in] context, context, ...   object(s) of relevence to the error
     *  @return nothing
     *
     *  @details A debug error throws automatically in DebugMode, but otherwise does not.
     *           Used by core features that want to degrade more gracefully in production.
     *  
     *  Doh.debug('error message', object1, 'some string', objectN, ...);
     */
    debug: (DohDebugMode ? function () { throw console.error('Doh.debug:', ...arguments); } : console.error.bind(console, 'Doh.debug:')),
    /**
     *  @brief throw and log an error to Doh
     *
     *  @param [in] context, context, ...   object(s) of relevence to the error
     *  @return nothing
     *
     *  @details 
     *  
     *  Doh.throw('error message', object1, 'some string', objectN, ...);
     */
    throw: function () { throw Doh._log(arguments, 'Doh.throw:', 'error'); },
    colorize,
    colorizer: function () {
      return {
        colorize,
        header_color,
        info_color,
        text_color,
        number_color,
        error_color,
        warn_color,
        hidden_color,
      }
    },
  });

  //MARK: Heartbeat
  // let beating = null;
  Doh.heartbeat = function () {
    // return Doh.sendToParent('heartbeat', {});
  }
  // try {
  //   beating = Doh.heartbeat();
  // } catch (error) {
  //   // Silently ignore errors - this is expected when not in a child process
  //   beating = false;
  // }

  // if (beating)
  //   setInterval(Doh.heartbeat, 1000);

  //MARK: MOC
  Doh.get_empowered_moc = (function () {
    /**
     * @brief convert a plain object or .moc object into a fully empowered moc object
     * 
     * @param original_moc [object] the original moc object to empower
     * @param destination [object] the object that the moc object is for
     * @param dest_proto [object] (optional) the prototype of the destination object
     * @return empowered moc object
     * 
     * @details the empowered moc object is a proxy object that allows us to track the order of property insertion
     *         and to track the melders of each property
     *        the empowered moc object also has a number of methods that allow us to manipulate the object
     *       and to export the object in a way that can be re-imported later
     */
    return function (original_moc, destination, dest_proto) {
      if (IsDefined(original_moc.__)) return original_moc;
      if (typeof dest_proto === 'undefined') dest_proto = Object.getPrototypeOf(destination);

      let moc = {}, new_moc, insertion_order = [], trackers = {}, moc_defs = {}, moc_prop_proxies = {};

      for (let prop_name in original_moc) {
        insertion_order.push(prop_name);
      }

      let track_controls = {
        obj: destination,
        obj_proto: dest_proto,
        moc: new_moc,
        original_moc: original_moc,
        tracks: moc_prop_proxies,
        order: insertion_order,
        moc_properties: function () {
          let rtn = {};
          for (let prop_name of insertion_order) {
            rtn[prop_name] = destination[prop_name];
          }
          return rtn;
        },
        all_properties: function () {
          let rtn = {};
          for (let prop_name of Doh.meld_into_array(insertion_order, Object.keys(destination))) {
            rtn[prop_name] = destination[prop_name];
          }
          return rtn;
        },
        export_moc: function (prop_names) {
          let rtn = {};
          // we need to build a new object with the properties that we want to export
          // the keys should be decorated with the correct decorator
          if (IsString(prop_names)) prop_names = [prop_names];
          if (IsUndefined(prop_names)) prop_names = insertion_order;
          for (let prop_name of prop_names) {
            //let prop_name = prop_names[i];
            rtn[prop_name] = [...moc_defs[prop_name]];
            // if one of the moc_defs is 'NESTED_MOC', we need to export the nested moc
            if (rtn[prop_name].includes('NESTED_MOC')) {
              let nest = this.moc.__.nest(prop_name);
              // splice the nested moc into the array in place of 'NESTED_MOC'
              let index = rtn[prop_name].indexOf('NESTED_MOC');
              if (index !== -1) rtn[prop_name].splice(index, 1, nest);
            }
          }
          return JSON.parse(JSON.stringify(rtn));
        },
        import_moc: function (moc_obj, idea) {
          if (IsObjectObject(moc_obj)) {
            try {
              moc_obj = JSON.parse(JSON.stringify(moc_obj));
            } catch (e) { }
          }
          if (IsString(moc_obj)) moc_obj = JSON.parse(moc_obj);
          for (let prop_name in moc_obj) {
            this.moc[prop_name] = moc_obj[prop_name];
            if (idea) this.validate_type(idea, prop_name);
          }
        },
        validate_types: function (obj) {
          for (let prop_name in this.moc) {
            this.validate_type(obj, prop_name);
          }
        },
        validate_type(obj, prop_name) {
          let flags_set = this.tracks[prop_name];
          if (NotSet(flags_set)) return true;

          for (let op of flags_set.keys()) {
            let op_def = Doh.getMocOpDef(op);
            if (!op_def || !op_def.match) continue;

            // Check object
            if (prop_name in obj && IsDefined(obj[prop_name]) && !op_def.match(obj[prop_name])) {
              Doh.debug('MOC Error: Property:', prop_name, 'does not match type:', op, 'Value:', obj[prop_name]);
            }
          }
          return true;
        }
      };
      for (let track_name in Doh.MocOpTracks) {
        if (Doh.MocOpTracks[track_name].controls) Doh.meld_objects(track_controls, Doh.MocOpTracks[track_name].controls);
      }

      track_controls.moc = new_moc = new Proxy(moc, {
        get: function (target, prop, receiver) {
          if (prop === '__') return track_controls;
          // rather than using the methods below, make the get/set/deleteProperty methods do the work
          // if the property has a decoration, then we need to clean it before getting the value
          // this will keep melded object clean and allow us to use the decorators to get/set/delete

          // this Symbol needs us to tell it what kind of thing this is
          // this needs to return 'Object' to be compatible with .observe and .mimic
          if (prop === Symbol.toStringTag) return 'Object';
          if (prop === Symbol.toPrimitive || prop === 'toString') return function (hint) {
            return track_controls.export_moc();
          };

          const value = Reflect.get(target, prop, receiver);
          if (IsFunction(value)) {
            // Bind the method to the original Set instance
            return value.bind(target);
          }

          // get will be looking for the melder of a property
          if (IsString(prop)) {
            //prop = prop.toUpperCase();
            // return the defined melder, if any
            if (trackers[prop]) {
              if (trackers[prop].melder === 'DEEP') {
                return trackers[prop].nest;
              }
              return trackers[prop].melder;
            }
          }

          return value;
        },
        set: function (target, prop, value, receiver) {
          if (prop === '__') return false;
          // track the insertion order for posterity
          Doh.meld_arrays(insertion_order, [prop]);

          // first  we need to fix the old ways
          if (IsString(value)) {
            // basically all the old meld types can be all-caps'ed into the new system
            value.toUpperCase();
            value = [value];
          }
          if (IsObjectObject(value)) {
            // this is an old melder of type {}
            value = ['DEEP', value];
          }

          // setters need to create mini-proxies on each key of the target that act like sets
          // the set is a 'list' of operations or options for the key relative to the destination object
          let prop_proxy;
          if (prop in moc_prop_proxies) {
            prop_proxy = moc_prop_proxies[prop];
          } else {
            let minitrackers = moc[prop] = trackers[prop] = {};
            let minidef = moc_defs[prop] = new Set();
            prop_proxy = moc_prop_proxies[prop] = new Proxy(minidef, {
              get: function (minitarget, tracker_or_op, minireceiver) {
                if (tracker_or_op === Symbol.toStringTag) return 'Array';
                if (tracker_or_op === Symbol.toPrimitive || tracker_or_op === 'toString') {
                  return function (hint) {
                    return [...minidef];
                  };
                };
                if (IsString(tracker_or_op)) {
                  // the tracker_or_op could be the name of a tracker or the name of a specific op.
                  // if it's a tracker, return the value of the tracker for this prop
                  if (tracker_or_op in minitrackers) return minitrackers[tracker_or_op];

                  // if it's an op, return true or false based on if the value of the tracker IS the op
                  let op = tracker_or_op.toUpperCase();

                  if (op in Doh.MocOps) {
                    // lookup the track for this op
                    let track_name = Doh.getMocOpTrackName(op, true);
                    // if the tracker is set to this op, return true
                    return minitrackers[prop][track_name] === op;
                  }
                }
                const value = Reflect.get(minitarget, tracker_or_op, minireceiver);
                if (IsFunction(value)) {
                  // Bind the method to the original Set instance
                  return value.bind(minitarget);
                }
                return value;
              },
              set: function (minitarget, op, op_value, minireceiver) {
                // we need to make sure that the value is a string
                let op_name;
                if (IsString(op_value)) {
                  op_name = op_value.toUpperCase();
                } else if (IsObjectObject(op_value)) {
                  // this is an old melder of type {}
                  op_name = 'NESTED_MOC';
                } else if (IsString(op)) {
                  op_name = op.toUpperCase();
                }
                if (IsString(op_name)) {
                  let op_def = Doh.getMocOpDef(op_name, true);
                  // we don't care what the prop is, we only care about the value
                  // basically, the value will be a string that is the MOCOps key for this
                  //let track_name = Doh.getMocOpTrackName(op_name, true);
                  let track_name = op_def.track;

                  // first we need to determine if the new op is compatible with the old one
                  let track_def = Doh.getMocOpTrackDefFromTrackName(track_name, true);
                  let track_value = minitrackers[track_name];
                  if (track_def.lock_on_first_set && track_value) {
                    if (track_value !== op_name && !((op_name === 'NESTED_MOC') && IsObjectObject(track_value))) {
                      // if the track is locked, we can't set it to a new value
                      throw Doh.error('MOC Error: Track is locked and cannot be changed. Property:', prop, 'Track:', track_name, 'Old:', track_value, 'New:', op_name);
                    }
                  }
                  // since we have trackers, don't bother with morphing the value, just update the tracker
                  //let tracker = minitrackers[track_name];
                  if (track_value !== op_name) {
                    // before we set the tracker, we need to make sure that the op is compatible with the prop
                    if (op_def.match) {
                      let dest_prop = destination[prop];
                      if (HasValue(dest_prop) && !op_def.match(dest_prop)) {
                        let error_message = ['MOC Error: Property:', prop, 'was expecting:', op_def.match.name, 'but got:', dest_prop];
                        if (IsFalsey(dest_prop)) Doh.error(...error_message);
                        else throw Doh.error(...error_message);
                      }
                    }


                    // delete the old tracker
                    minitarget.delete(track_value);
                    // set the new tracker
                    if (IsObjectObject(op_value))
                      minitrackers[track_name] = Doh.meld_deep(minitrackers[track_name], op_value);
                    else
                      minitrackers[track_name] = op_name;
                    // add the op to the target so it updates the order of insertion
                    minitarget.add(op_name);

                    if (NotSet(destination[prop]) && NotUndefined(op_def.default)) {
                      // if there is a default value, set it
                      let default_value;
                      if (IsArray(op_def.default)) default_value = Doh.meld_arrays([], op_def.default);
                      else if (IsObjectObject(op_def.default)) default_value = Doh.meld_deep({}, op_def.default);
                      //else if (IsFunction(op_def.default)) default_value = function () { };
                      else default_value = op_def.default;

                      track_controls.base(prop)[prop] = destination[prop] || default_value;
                    }

                    return true;
                  }
                  return true;
                }
                return false;
              },
              deleteProperty: function (minitarget, miniprop) {
                // we need to make sure that the value is a string
                if (IsString(miniprop)) {
                  miniprop = miniprop.toUpperCase();
                  // we don't care what the prop is, we only care about the value
                  // basically, the value will be a string that is the MOCOps key for this
                  let track_name = Doh.getMocOpTrackName(op_name, true);

                  // since we have trackers, don't bother with morphing the value, just update the tracker
                  let tracker = trackers[track_name];
                  if (tracker) {
                    delete trackers[prop][track_name];
                    minitarget.delete(miniprop);
                    return true;
                  }
                }
                return true;
              },
              ownKeys: function (minitarget) {
                if (Reflect.keys)
                  return Reflect.keys([...minitarget]);
                else
                  return [...minitarget];
              },
              has: function (minitarget, miniprop) {
                miniprop = miniprop.toUpperCase();
                return miniprop in minitarget;
              },

              getPrototypeOf: function (target) {
                return Array;
              }
            });
          }

          // now that we have a proxy for the property, we can set the value
          if (IsArray(value)) {
            // this is a new melder ops list
            for (let op of value) {
              prop_proxy[op] = op;
            }
          }
          return true;
        },
        deleteProperty: function (target, prop) {
          if (prop === '__') return false;
          insertion_order.splice(insertion_order.indexOf(prop), 1);

          // clean out the track and the proxy for it
          if (prop in moc) {
            delete moc[prop];
          }
          if (prop in trackers) {
            delete trackers[prop];
          }
          if (prop in moc_defs) {
            delete moc_defs[prop];
          }
          if (prop in moc_prop_proxies) {
            delete moc_prop_proxies[prop];
          }

          return true;
        },
        ownKeys: function (target) {
          return insertion_order;
        },
        /*
        getOwnPropertyDescriptor: function(target, prop){
          
          return Reflect.getOwnPropertyDescriptor(target, prop);
        },
        */
        defineProperty: function (target, prop, descriptor) {
          if (prop === '__') return false;
          return Reflect.defineProperty(target, prop, descriptor);
        },
        has: function (target, prop) {
          return prop in insertion_order;
        },
      });

      return new_moc;
    };
  })();


  //MARK: MocOps
  (function () {
    let track_name;
    Object.assign(Doh, {
      getMocOpDef: function (op_name, and_throw) {
        if (IsString(op_name) && op_name.startsWith('ASYNC_')) {
          op_name = op_name.substr(6);
        }
        return Doh.MocOps[op_name] || ((and_throw) => { if (and_throw) throw Doh.error('getMocOpDef: Unknown MocOp:', op_name) })(and_throw);
      },
      getMocOpTrackName(op_name, and_throw) {
        return Doh.getMocOpDef(op_name, and_throw).track || ((and_throw) => { if (and_throw) throw Doh.error('getMocOpTrackName: Unknown MocOp:', op_name) })(and_throw);
      },
      getMocOpTrackDef(op_name, and_throw) {
        track_name = Doh.getMocOpTrackName(op_name, and_throw);
        return Doh.MocOpTracks[track_name] || ((and_throw) => { if (and_throw) throw Doh.error('getMocOpTrackDef: Unknown Track:', track_name) })(and_throw);
      },
      getMocOpTrackDefFromTrackName(track_name, and_throw) {
        return Doh.MocOpTracks[track_name] || ((and_throw) => { if (and_throw) throw Doh.error('getMocOpTrackDefFromTrackName: Unknown Track:', track_name) })(and_throw);
      },
      // MocOps are the definitions for the flags that are used in the .moc property of a DohObject
      MocOps: {
        /**
         * VISIBILITY
         * PUB/PRIV are currently disabled, setting them does nothing, but they are still tracked.
         */
        PUB: {
          track: 'vis',
          match: IsAnything,
          default: null,
        },
        PRIV: {
          track: 'vis',
          match: IsAnything,
          default: null,
        },
        /**
         * MELDING
         * Melding types are the primary way to define how a property is melded into the object.
         * Defining a melder is not required, and since they are not able to be changed after being set,
         * they are only used when property melding is required. (The ANY flag is therefore a way to keep a property from being melded)
         */
        // ANY is a way to keep a property from being melded
        ANY: {
          track: 'melder',
          match: IsAnything,
          default: null,
        },
        // CONCAT is a way to meld strings or arrays together with concatenation
        CONCAT: {
          track: 'melder',
          match: IsIterable,
          default: null,
        },
        // ARRAY is a way to meld arrays together like Set().add() (no duplicates)
        ARRAY: {
          track: 'melder',
          match: IsArrayOrFalse,
          default: [],
        },
        // OBJECT is a way to meld objects together with Object.assign()
        OBJECT: {
          track: 'melder',
          match: IsObjectObjectOrFalse,
          default: {},
        },
        // IDEA is a way to meld 
        IDEA: {
          track: 'melder',
          match: IsObjectObjectOrFalse,
          default: {},
        },
        DEEP: {
          track: 'melder',
          match: IsObjectObjectOrFalse,
          default: {},
        },
        //* Exremely dangerous, avoid if possible */
        EXCLUSIVE: {
          track: 'melder',
          match: IsAnything,
          default: null,
        },
        //* Exremely dangerous, avoid if possible */
        STATIC: {
          track: 'melder',
          match: IsDefined,
          default: null,
        },
        /**
         * MELDING METHODS
         */
        METHOD: {
          track: 'melder',
          match: IsFunction,
          default: null,
        },
        PHASE: {
          track: 'melder',
          match: IsFunction,
          default: null,
        },
        CHAIN: {
          track: 'melder',
          match: IsFunction,
          default: null,
        },
        CHAIN_FUNNEL: {
          track: 'melder',
          match: IsFunction,
          default: null,
        },
        BLENDER: {
          track: 'melder',
          match: IsFunction,
          default: null,
        },
        THIS_BLENDER: {
          track: 'melder',
          match: IsFunction,
          default: null,
        },
        FUNNEL: {
          track: 'melder',
          match: IsFunction,
          default: null,
        },
        THIS_FUNNEL: {
          track: 'melder',
          match: IsFunction,
          default: null,
        },
        SUPER: {
          track: 'melder',
          match: IsFunction,
          default: null,
        },
        /**
         * ASYNC MODIFIER
         * Lock a melded method to be synchronous or asynchronous, defining it as async will make it awaitable.
         */
        ASYNC: {
          track: 'async_method',
          match: IsFunction,
          default: null,
        },
        SYNC: {
          track: 'async_method',
          match: IsFunction,
          default: null,
        },
        /**
         * MOC NESTING
         * Nesting is a way to define meld-composition for properties of properties.
         * this is done by setting an object as a .moc flag in a property array track.
         * or with the .__.nest method.
         */
        NESTED_MOC: {
          track: 'nest',
          match: IsObjectObjectOrFalse,
          default: {},
        },
        /**
         * STATE TYPES
         * State types are a way to define how a property is used in the state of an object.
         * This feature is not currently implemented, but it is tracked.
         */
        WINDOW: {
          track: 'state_type',
          match: IsAnything,
          default: null,
        },
        THIS: {
          track: 'state_type',
          match: IsAnything,
          default: null,
        },
        UUID: {
          track: 'state_type',
          match: IsAnything,
          default: null,
        },
        VAL: {
          track: 'state_type',
          match: IsAnything,
          default: null,
        },
        IGNORE: {
          track: 'state_type',
          match: IsAnything,
          default: null,
        },
        /**
         * Type checking
         * These allow for type checking of properties, raising errors if the type is incorrect.
         */
        ISANY: {
          track: 'typeof',
          match: IsAny,
        },
        ISANYTHING: {
          track: 'typeof',
          match: IsAnything,
        },
        ISDEFINED: {
          track: 'typeof',
          match: IsDefined,
        },
        ISSET: {
          track: 'typeof',
          match: IsSet,
        },
        HASVALUE: {
          track: 'typeof',
          match: HasValue,
        },
        ISLITERAL: {
          track: 'typeof',
          match: IsLiteral,
        },
        ISBOOLEAN: {
          track: 'typeof',
          match: IsBoolean,
        },
        ISSTRING: {
          track: 'typeof',
          match: IsString,
        },
        ISSTRINGORFALSE: {
          track: 'typeof',
          match: IsStringOrFalse,
        },
        ISNUMBER: {
          track: 'typeof',
          match: IsNumber,
        },
        ISNUMBERORFALSE: {
          track: 'typeof',
          match: IsNumberOrFalse,
        },
        ISINT: {
          track: 'typeof',
          match: IsInt,
        },
        ISINTORFALSE: {
          track: 'typeof',
          match: IsIntOrFalse,
        },
        ISLITERALORFALSE: {
          track: 'typeof',
          match: IsLiteralOrFalse,
        },
        ISKEYSAFE: {
          track: 'typeof',
          match: IsKeySafe,
        },
        ISARRAY: {
          track: 'typeof',
          match: IsArray,
        },
        ISARRAYORFALSE: {
          track: 'typeof',
          match: IsArrayOrFalse,
        },
        ISSTRINGORARRAY: {
          track: 'typeof',
          match: IsStringOrArray,
        },
        ISSTRINGORARRAYORFALSE: {
          track: 'typeof',
          match: IsStringOrArrayOrFalse,
        },
        ISSTRINGANDHASVALUE: {
          track: 'typeof',
          match: IsStringAndHasValue,
        },
        ISOBJECT: {
          track: 'typeof',
          match: IsObject,
        },
        ISOBJECTORFALSE: {
          track: 'typeof',
          match: IsObjectOrFalse,
        },
        ISOBJECTOBJECT: {
          track: 'typeof',
          match: IsObjectObject,
        },
        ISOBJECTOBJECTORFALSE: {
          track: 'typeof',
          match: IsObjectObjectOrFalse,
        },
        ISSTRINGORARRAYOROBJECTOBJECT: {
          track: 'typeof',
          match: IsStringOrArrayOrObjectObject,
        },
        ISSTRINGORARRAYOROBJECTOBJECTORFALSE: {
          track: 'typeof',
          match: IsStringOrArrayOrObjectObjectOrFalse,
        },
        ISARRAYOROBJECTOBJECT: {
          track: 'typeof',
          match: IsArrayOrObjectObject,
        },
        ISARRAYOROBJECTOBJECTORFALSE: {
          track: 'typeof',
          match: IsArrayOrObjectObjectOrFalse,
        },
        ISITERABLE: {
          track: 'typeof',
          match: IsIterable,
        },
        ISFUNCTION: {
          track: 'typeof',
          match: IsFunction,
        },
        ISFUNCTIONORFALSE: {
          track: 'typeof',
          match: IsFunctionOrFalse,
        },
        ISPROMISE: {
          track: 'typeof',
          match: IsPromise,
        },
        ISPROMISEORFALSE: {
          track: 'typeof',
          match: IsPromiseOrFalse,
        },
        ISPROMISEORFUNCTIONORFALSE: {
          track: 'typeof',
          match: IsPromiseOrFunctionOrFalse,
        },
        ISDOHOBJECT: {
          track: 'typeof',
          match: IsDohObject,
        },
        ISDOHOBJECTORFALSE: {
          track: 'typeof',
          match: IsDohObjectOrFalse,
        },
        ISOBJECTOBJECTANDNOTEMPTY: {
          track: 'typeof',
          match: IsObjectObjectAndNotEmpty,
        },
        ISOBJECTOBJECTANDNOTEMPTYORFALSE: {
          track: 'typeof',
          match: IsObjectObjectAndNotEmptyOrFalse,
        },
        /**
         * Type filtering
         * These allow for type filtering of properties, raising errors if the type is a match.
         */
        NOTUNDEFINED: {
          track: 'notundefined',
          match: NotUndefined,
        },
        NOTNULL: {
          track: 'notnull',
          match: NotNull,
        },
        NOTFALSE: {
          track: 'notfalse',
          match: NotFalse,
        },
        NOTTRUE: {
          track: 'nottrue',
          match: NotTrue,
        },
        NOTBOOLEAN: {
          track: 'notboolean',
          match: NotBoolean,
        },
        NOTSTRING: {
          track: 'notstring',
          match: NotString,
        },
        NOTNUMBER: {
          track: 'notnumber',
          match: NotNumber,
        },
        NOTINT: {
          track: 'notint',
          match: NotInt,
        },
        NOTLITERAL: {
          track: 'notliteral',
          match: NotLiteral,
        },
        NOTARRAY: {
          track: 'notarray',
          match: NotArray,
        },
        NOTOBJECT: {
          track: 'notobject',
          match: NotObject,
        },
        NOTOBJECTOBJECT: {
          track: 'notobjectobject',
          match: NotObjectObject,
        },
        NOTITERABLE: {
          track: 'notiterable',
          match: NotIterable,
        },
        NOTFUNCTION: {
          track: 'notfunction',
          match: NotFunction,
        },
        NOTPROMISE: {
          track: 'notpromise',
          match: NotPromise,
        },
        NOTDOHOBJECT: {
          track: 'notdohobject',
          match: NotDohObject,
        },

        // CLEAR is a way to clear out the contents of the property on the object
        CLEAR: {
          track: 'clear',
          match: IsAnything,
        },

        DOHPATH: {
          track: 'dohpath',
          match: IsString,
        },
      },
      // the tracks are the definitions for the properties and controls for the tracks
      // that are used to define the .moc property of a DohObject
      // this is also used to make the track order
      MocOpTracks: {
        vis: {
          controls: {
            // return and/or update the decorator for a property. Cleans Key. (medium)
            vis: function (prop_name, visibility) {
              if (IsString(prop_name)) {
                let track = this.tracks[prop_name];
                if (visibility) {
                  this.moc[prop_name] = visibility;
                }
                if (track) return track.vis;
                return '';
              }
              throw Doh.error('__.vis requires a string property name as the first argument.');
            },
            // move property(ies) to the object own keys and mark them as public. Cleans keys. (medium)
            pub: function (prop_names) {
              if (IsString(prop_names)) {
                prop_names = [prop_names];
              }
              if (IsArray(prop_names)) {
                for (let i in prop_names) {
                  let prop_name = prop_names[i];
                  this.move_to_object(prop_name);
                  this.vis(prop_name, 'PUB');
                }
              }
              return this.moc;
            },
            // move property(ies) to the prototype and mark them as private. Cleans keys. (medium)
            priv: function (prop_names) {
              if (IsString(prop_names)) {
                prop_names = [prop_names];
              }
              if (IsArray(prop_names)) {
                for (let i in prop_names) {
                  let prop_name = prop_names[i];
                  this.move_to_prototype(prop_name);
                  this.vis(prop_name, 'PRIV');
                }
              }
              return this.moc;
            },
            // return the public properties, with values from the actual object. Cleans keys. (medium)
            pub_properties: function () {
              let rtn = {};
              for (let prop_name of this.order) {
                if (this.vis(prop_name) === 'PUB') {
                  rtn[prop_name] = this.obj[prop_name];
                }
              }
              return rtn;
            },
            priv_properties: function () {
              let rtn = {};
              for (let prop_name of this.order) {
                if (this.vis(prop_name) === 'PRIV') {
                  rtn[prop_name] = this.obj[prop_name];
                }
              }
              return rtn;
            },
            all_properties: function () {
              let rtn = {};
              for (let prop_name of Doh.meld_into_array(this.order, Object.keys(this.obj_proto), Object.keys(this.obj))) {
                rtn[prop_name] = this.obj[prop_name];
              }
              return rtn;
            },
            // move property(ies) to the own keys, does clean prop_names (fast)
            move_to_object: function (prop_names) {
              return true;
              if (IsString(prop_names)) {
                prop_names = [prop_names];
              }
              for (let i in prop_names) {
                let prop_name = prop_names[i];
                if (NotUndefined(this.obj[prop_name])) {
                  let value = this.obj[prop_name];
                  delete this.obj_proto[prop_name];
                  if (NotUndefined(value)) this.obj[prop_name] = value;
                }
              }
              return true;
            },
            // move property(ies) to the prototype, does clean prop_names (fast)
            move_to_prototype: function (prop_names) {
              return true;
              if (IsString(prop_names)) {
                prop_names = [prop_names];
              }
              for (let i in prop_names) {
                let prop_name = prop_names[i];
                if (NotUndefined(this.obj[prop_name])) {
                  let value = this.obj[prop_name];
                  delete this.obj[prop_name];
                  if (NotUndefined(value)) this.obj_proto[prop_name] = value;
                }
              }
              return true;
            },
            // return an array of the public keys. Cleans keys. (medium)
            pub_keys: function () {
              let keys = [];
              for (let prop_name of this.order) {
                if (this.vis(prop_name) === 'PUB') keys.push(prop_name);
              }
              return keys;
            },
            // return an array of the private keys. Cleans keys. (medium)
            priv_keys: function () {
              let keys = [];
              for (let prop_name of this.order) {
                if (this.vis(prop_name) === 'PRIV') keys.push(prop_name);
              }
              return keys;
            },
            // make the DohObject prop_names match the moc definition. (slow)
            // if prop_names is not set, then it will sync all keys (slowest)
            sync: function (prop_names) {
              if (IsString(prop_names)) prop_names = [prop_names];
              else if (IsUndefined(prop_names)) prop_names = Doh.meld_into_array(this.order, Object.keys(this.obj_proto), Object.keys(this.obj));

              if (IsArray(prop_names)) {
                for (let i in prop_names) {
                  let prop_name = prop_names[i];
                  let visibility = this.vis(prop_name);
                  if (visibility === 'PUB') this.move_to_object(prop_name);
                  else this.move_to_prototype(prop_name);
                }
              }
              return this.moc;
            },
            // make the DohObject own keys match the moc definition. (slow)
            sync_own_keys: function () {
              return this.sync(Doh.meld_into_array(this.order, Object.keys(this.obj)));
            },
            // make the DohObject prototype keys match the moc definition (slow)
            sync_prototype: function () {
              return this.sync(Doh.meld_into_array(this.order, Object.keys(this.obj_proto)));
            },
            // make the moc definition match the DohObject own keys (slow)
            sync_moc: function (prop_names) {
              if (IsString(prop_names)) prop_names = [prop_names];
              else if (IsUndefined(prop_names)) prop_names = Doh.meld_into_array(this.order, Object.keys(this.obj_proto), Object.keys(this.obj));

              if (IsArray(prop_names)) {
                for (let i in prop_names) {
                  let prop_name = prop_names[i];
                  let visibility = this.vis(prop_name);
                  if (visibility === 'PUB') {
                    // is the property an own key?
                    if (!this.obj.hasOwnProperty(prop_name)) {
                      // if not, make it private
                      this.vis(prop_name, '');
                    }
                  }
                  if (visibility === 'PRIV' || !visibility) {
                    // is the property an own key?
                    if (this.obj.hasOwnProperty(prop_name)) {
                      // if so, make it public
                      this.vis(prop_name, 'PUB');
                    }
                  }
                }
              }

              return this.moc;
            },
            // return the base object that the property should be on. (medium)
            base: function (prop_name) {
              return this.obj;
              let visibility = this.vis(prop_name);
              if (visibility === 'PUB') return this.obj;
              return this.obj_proto;
            },
          },
        },
        async_method: {
          lock_on_first_set: true,
          controls: {
            is_async: function (prop_name) {
              if (IsString(prop_name)) {
                const track = this.tracks[prop_name];
                if (track) return track.async_method === 'ASYNC';
                return false;
              }
              throw Doh.error('__.is_async requires a string property name as the first argument.');
            },
          },
        },
        melder: {
          lock_on_first_set: true,
          controls: {
            phase_order: function () {
              const rtn = [];
              for (const prop_name of this.order) {
                if (this.moc[prop_name] === 'PHASE') rtn.push(prop_name);
              }
              return rtn;
            },
            ideas: function () {
              const rtn = {};
              for (const prop_name of this.order) {
                if (this.moc[prop_name] === 'IDEA') rtn[prop_name] = this.obj[prop_name];
              }
              return rtn;
            },
          },
        },
        nest: {
          controls: {
            nest: function (prop_name, nest) {
              if (IsString(prop_name)) {
                const track = this.tracks[prop_name];
                if (IsObjectObject(nest)) {
                  this.moc[prop_name] = ['DEEP', nest];
                }
                if (track) return track.nest;
                return {};
              }
              throw Doh.error('__.nest requires a string property name as the first argument.');
            },
          }
        },
        state_type: {
          controls: {
            state_type: function (prop_name, state_type) {
              if (IsString(prop_name)) {
                const track = this.tracks[prop_name];
                if (state_type) {
                  this.moc[prop_name] = state_type;
                }
                if (track) return track.state_type;
                return '';
              }
              throw Doh.error('__.state_type requires a string property name as the first argument.');
            },
            export_state: function () {
              const rtn = {};
              for (const prop_name of this.order) {
                if (this.state_type(prop_name) === 'VAL') {
                  rtn[prop_name] = this.obj[prop_name];
                }
              }
              return rtn;
            },
          },
        },
        typeof: {
          controls: {
            typeof: function (prop_name, typeof_name) {
              if (IsString(prop_name)) {
                const track = this.tracks[prop_name];
                if (typeof_name) {
                  this.moc[prop_name] = typeof_name;
                }
                if (track) return track.typeof;
                return '';
              }
              throw Doh.error('__.typeof requires a string property name as the first argument.');
            },
            export_typeof: function () {
              const rtn = {};
              for (const prop_name of this.order) {
                if (this.typeof(prop_name)) {
                  rtn[prop_name] = this.obj[prop_name];
                }
              }
              return rtn;
            },
          },
        },
        notundefined: { lock_on_first_set: true },
        notnull: { lock_on_first_set: true },
        notfalse: { lock_on_first_set: true },
        nottrue: { lock_on_first_set: true },
        notboolean: { lock_on_first_set: true },
        notstring: { lock_on_first_set: true },
        notnumber: { lock_on_first_set: true },
        notliteral: { lock_on_first_set: true },
        notarray: { lock_on_first_set: true },
        notobject: { lock_on_first_set: true },
        notiterable: { lock_on_first_set: true },
        notfunction: { lock_on_first_set: true },
        notpromise: { lock_on_first_set: true },
        notdohobject: { lock_on_first_set: true },
        clear: {
          lock_on_first_set: false,
          controls: {
            clear: function (prop_name) {
              // 
            }
          },
        },
        dohpath: {
          lock_on_first_set: true,
          controls: {
            DohPath: function (path) {
              return DohPath(path);
            }
          },
        },
      },
      // the types of melded methods
      MeldedTypeMethods: [
        /**
         * methods are melded functions that are like mini-phase stacks.
         * allows each pattern to define a method that is called in order of pattern inheritance.
         * all methods are called with the same arguments as the original method.
         * all types of melded methods listed below allow a pre_{method} method to be defined that in the pattern resolution order but before the regular methods.
         */
        // method is the default type and is the same as phase and this_blender
        // this_blenders meld any sparse return values onto the 'this' object using meld_ideas to respect .moc definitions.
        'method',
        // phases are just methods, but they are run in the order they are defined during the melding process
        'phase',
        // async methods are like the methods they prepend, but they are awaitable
        'async_method',
        // chains have a forced first argument that is the return value of the previous method
        'chain',
        'async_chain',
        // chain funnels are like chains, but they reverse the order of the melded methods
        'chain_funnel',
        'async_chain_funnel',
        // blenders use the first arg to determine how to meld the return value onto the first arg
        'blender',
        'async_blender',
        // this_blenders are like blenders, but they always meld the return value onto the `this` object of the melded method
        'this_blender',
        'async_this_blender',
        // funnels are like blenders, but they reverse the order of the melded methods
        'funnel',
        'async_funnel',
        // this_funnels are like funnels, but they always meld the return value onto the `this` object of the melded method
        'this_funnel',
        'async_this_funnel',
        // super methods are composed functions that provide a `super` method to the function body. Closely immitates the ES6 super keyword.
        'super'
      ],
      PhaseTypeMethods: [
        'method',
        'phase',
        'this_blender',
      ],
    })
  })();


  //MARK: Melders
  Object.assign(Doh, {
    meld_deep: function (dest, ...sources) {
      if (dest == null) {
        // If destination is null or undefined, return a new object
        dest = {};
      }

      for (const source of sources) {
        if (source != null) { // Check if source is not null/undefined
          for (const key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
              if (IsObjectObject(source[key])) {
                if (!IsObjectObject(dest[key])) {
                  dest[key] = {};
                }
                Doh.meld_deep(dest[key], source[key]);
              } else if (Array.isArray(source[key])) {
                if (!Array.isArray(dest[key])) {
                  dest[key] = [];
                }
                // Concatenate arrays and remove duplicates
                dest[key] = [...new Set([...dest[key], ...source[key]])];
              } else {
                dest[key] = source[key];
              }
            }
          }
        }
      }

      return dest;
    },
    meld_concat: function (...args) {
      // meld_concat is really just a shorthand for concat strings or arrays
      // determine the concat type using the first argument
      if (Array.isArray(args[0])) return [].concat.apply([], args);
      return args.join('');
    },
    /**
     *  @brief return true if item is in array
     *  
     *  @param [in] item  [any] thing to search for
     *  @param [in] array [array] to search
     *  @return true if item is in array
     *  
     *  @details Used by Doh.meld_arrays to filter arrays of duplicates
     */
    in_array: function (item, array) {

      if (typeof array === 'undefined') return -1;

      if (array.indexOf) {
        return array.indexOf(item);
      }

      for (let i = 0, length = array.length; i < length; i++) {
        if (array[i] === item) {
          return i;
        }
      }

      return -1;
    },
    /**
     *  @brief Concatenate array onto destination, removing duplicates from array.
     *  
     *  @param [in] destination [array] to be melded onto
     *  @param [in] array       [array] to meld onto destination
     *  @param [in] force_new   [bool] if true, meld both destination AND array onto a new [] and pass that back instead
     *  @return destination or the new array from being force_new'd
     *  
     *  @details Primarilly used by html for ordering classes.
     *           Used to be used by the core to manage meld_ system until being replaced by .moc.
     */
    meld_arrays: function (destination, array = [], force_new) {
      if (force_new) {
        Doh.debug('Someone called meld_arrays and wants it forced to new array');
        return Doh.meld_into_array(destination, array);
      }

      destination = destination || [];
      // loop over array
      for (let i = 0; i < array.length; i++) {
        // if the value is not in destination
        if (Doh.in_array(array[i], destination) == -1) {
          // add it
          destination.push(array[i]);
        }
      }
      return destination;
    },
    /**
     *  @brief similar to meld_arrays but always melds onto a new array.
     *  
     *  @param [in] ...arguments arrays or values that will be flattened into a new array
     *  @return new melded array
     *  
     *  @details specifically differs from regular meld_arrays because it doesn't modify either argument
     */
    meld_into_array: function () {
      /* This single line is very potent, let's break it down:
      // Set is unique by default, it is also order-of-insertion.
      // arguments isn't a real array, it's a gimped one with no methods, so we have to use Array.prototype to get .flat()
      // flat() takes an array of arrays or values and flattens into a single array of all the values in each nest.
      // ... spread operator on a Set will spread it into an array or object (the outer array brackets, in our case)
      // Soooo... flatten all the arguments into a single array, then use Set to make it unique, starting with order-inserted
      //   then spread all remaining values into a new array.
      */
      return [...new Set([].flat.call(arguments, 1))];
    },
    meld_objects: Object.assign,
    /**
     *  @brief meld all the ways we can format a list of args into a set of object keys
     *            NOTE: always melds into a new {}. No argument is altered.
     *                   maybe that should be called collect_into_objectobject?
     *
     *  @param [in] aruguments  String, Array, Array-like-object, or Object to
     *                          meld with. (See details)
     *  @return objectobject with keys from the strings and arrays and keys of arguments
     *  
     *  @details
     *  'pattern_name_1'
     *  ['pattern_name_1', 'pattern_name_2']
     *  {'pattern_name_1':true, 'pattern_name_2':true}
     *  {'pattern_name_1':true, 'pattern_name_2':'other Truthy value'}
     *  
     *  *RESULTS IN:* {'pattern_name_1':true, 'pattern_name_2':'other Truthy value'}
     *  *OR* at least:{} if nothing valid is sent in
     **/
    meld_into_objectobject: function () {
      // always land in a new object
      let object = {};
      // call the array prototype method forEach to iterate arguments
      [].forEach.call(arguments, arg => {
        // use strings to set keys to true
        if (IsString(arg)) return object[arg] = true;
        // use arrays to set lists of keys to true
        if (IsArray(arg)) return arg.forEach(subkey => { object[subkey] = true; });
        // just meld in any objects we pass that aren't arrays handled above.
        if (typeof arg === 'object') return Object.assign(object, arg);
      });

      return object;
    },
    /**
     * @brief Blend two values together based on their types
     * 
     * @param destination 
     * @param source 
     * @returns 
     */
    blend: function (destination, source) {
      // blend is a melder that determines the meld type based on the destination
      // if we are passing through, skip the blending
      if (destination === source) return destination;
      // check for short-circuiting, then blend based on type
      switch (SeeIf.TypeOf(source)) {
        case 'IsUndefined':
        case 'IsNull':
        case 'IsTrue':
        case 'IsFalse':
          // if the source is undefined, return the first argument
          return destination;
        case 'IsArray':
          if (NotDefined(destination)) {
            destination = [];
          }
          // allow arrays to be unique-merged
          if (IsArray(destination)) Doh.meld_arrays(destination, source);
          else Doh.debug('Blend Type Mismatch: source is an array but destination is not. Dest:', destination, 'Source:', source);
          break;
        case 'IsObjectObject':
          if (NotDefined(destination)) {
            destination = {};
          }
          if (IsDohObject(destination)) {
            // Doh objects are melded onto the prototype, by default
            Doh.meld_idea_onto_prototype(destination, source);
            break;
          } else if (IsObjectObject(destination)) {
            // non-Doh objects are melded onto the object itself, by default
            Doh.meld_ideas(destination, source);
          } else {
            Doh.debug('Blend Type Mismatch: source is an object but destination is not. Dest:', destination, 'Source:', source);
          }
          break;
        case 'IsFunction':
          if (NotDefined(destination)) {
            destination = () => { };
          }
          // if the first argument is a melded method, add the source to the stack
          if (IsFunction(destination) && IsMeldedMethod(destination)) destination.add(source);
          else Doh.debug('Blend Type Mismatch: source is a function but destination is not a melded method. Dest:', destination, 'Source:', source);
          break;
        default:
          // note that we got an unusable source
          //Doh.debug('Blend Type Mismatch: source is not a usable value. Dest:',destination,'Source:',source);
          break;
      }
      return destination;
    },


    //MARK: Meld Methods
    /**
     *  @brief Given an object and method name, return an array of function references
     *         for inherited patterns that implement the named method
     *  
     *  @param [in] object      [object] to search .inherited
     *  @param [in] method_name [string] name of method to search for
     *  @return an array of function references from .inherited in order of .inherits when extended
     *  
     *  @details NOTE: also prepares and prepends the list of pre_{method} functions and appends the post_{method} functions
     */
    find_meld_method_stack: function (object, method_name) {
      const { pre_meld_method_order, meld_method_order, post_meld_method_order } = Doh.__find_meld_method_stack(object, method_name);
      return pre_meld_method_order.concat(meld_method_order).concat(post_meld_method_order);
    },
    /**
     * @brief Given an object and method name, return an array of function references
     *       for inherited patterns that implement the named method
     *       NOTE: reverses the order of the method calls and adds a post_{method} function
     * 
     * @param [in] object      [object] to search .inherited
     * @param [in] method_name [string] name of method to search for
     * @return an array of function references from .inherited in order of .inherits when extended
     * 
     * @details NOTE: also prepares and prepends the list of pre_{method} functions and appends the post_{method} functions
     */
    find_funnel_method_stack: function (object, method_name) {
      const { pre_meld_method_order, meld_method_order, post_meld_method_order } = Doh.__find_meld_method_stack(object, method_name);
      // funnels go from back to front. so the pre methods still need to run first, but the order is reversed
      // the same goes for the post methods
      // so first we run the pre methods in reverse order, then the funnel methods in reverse order
      return pre_meld_method_order.reverse().concat(meld_method_order.reverse()).concat(post_meld_method_order.reverse());
    },
    __find_meld_method_stack: function (object, method_name) {
      const meld_method_order = [],
        pre_meld_method_order = [],
        post_meld_method_order = [],
        inherited_order = Doh.meld_into_array(['prototype'], object.inherits, ['idea']),
        inherited_patterns = object.inherited;
      let inherited_pattern,
        parsed_name = method_name;

      if (method_name.indexOf('.') !== -1) {
        parsed_name = Doh.parse_ref_prop(method_name);
      }
      for (let i of inherited_order) {
        inherited_pattern = inherited_patterns[i];
        if (!inherited_pattern) continue;
        // if the method_name is parse_ref-able, then we can use it to find the method
        // look for a ., if it's there, then we can parse it
        if (method_name.indexOf('.') !== -1) {
          inherited_pattern = Doh.parse_ref_container(inherited_pattern, method_name);
          if (!inherited_pattern) continue;
        }
        if (inherited_pattern['pre_' + parsed_name]) pre_meld_method_order.push(inherited_pattern['pre_' + parsed_name]);
        if (inherited_pattern[parsed_name]) meld_method_order.push(inherited_pattern[parsed_name]);
        if (inherited_pattern['post_' + parsed_name]) post_meld_method_order.push(inherited_pattern['post_' + parsed_name]);
      }
      return { pre_meld_method_order, meld_method_order, post_meld_method_order };
    },
    /**
     *  @brief return a closure for object[method_name] that will call each function in method_stack
     *  
     *  @param [in] object       [any] thing to use as 'this'
     *  @param [in] method_stack [array] of functions to run as this method OR
     *                           [string] of method name to use for collecting methods from .inherited
     *  @return a closure function that will call each function in method_stack
     *  
     *  @details object[method_name].update_meld_stack() will automatically recalculate
     *           melds based on current .inherited
     *           object[method_name].meld_stack is the actual meld_stack array that can be manipulated to affect the next run of method
     */
    meld_method: function (object, method_name_or_stack, type = 'method', skip_find = false) {
      // if the stack is a string, then we are trying to meld a method from object.inherited
      let method_name, method_stack = [], melded_method;
      if (IsString(method_name_or_stack)) {
        method_name = method_name_or_stack;
        if (!skip_find) {
          if (type === 'funnel' ||
            type === 'async_funnel' ||
            type === 'this_funnel' ||
            type === 'async_this_funnel' ||
            type === 'chain_funnel' ||
            type === 'async_chain_funnel'
          ) {
            method_stack = Doh.find_funnel_method_stack(object, method_name);
          } else {
            method_stack = Doh.find_meld_method_stack(object, method_name);
          }
        } else {
          method_stack = [];
        }
      }
      else if (IsArray(method_name_or_stack)) method_stack = method_name_or_stack;

      switch (type) {
        case 'method':
        case 'phase':
        case 'this_blender':
        case 'this_funnel':
          // this_blenders are like blenders, but they always meld the return value onto the `this` object of the melded method
          melded_method = function (...args) {
            //  walk the method stack and apply each method to the bound object
            const len = method_stack.length;
            let i, return_value;
            for (i = 0; i < len; i++) {
              return_value = undefined;
              return_value = method_stack[i].call(object, ...args);

              if (IsDefined(return_value)) {
                if (IsFalse(return_value)) return false;
                if (IsTrue(return_value)) return object;
                Doh.blend(object, return_value);
              }
            }
            return object;
          };
          break;
        case 'chain':
        case 'chain_funnel':
          // chains have a forced first argument that is the return value of the previous method
          // and the return value of the last method is the return value of the chain
          if (!Doh.DebugMode) {
            melded_method = function (...args) {
              //  walk the method stack and apply each method to the bound object
              const len = method_stack.length;
              let i, return_value = args[0];
              for (i = 0; i < len; i++) {
                return_value = args[0] = method_stack[i].apply(object, args);
              }
              return return_value;
            };
          } else {
            melded_method = function (...args) {
              // this melder always does the same thing:
              //  walk the method stack and apply each method to the bound object
              const len = method_stack.length;
              let i, return_value = args[0];
              for (i = 0; i < len; i++) {
                return_value = args[0] = method_stack[i].apply(object, args);
                if (IsUndefined(return_value)) Doh.debug('Chain method:', method_name, 'returned undefined. This is probably a mistake.');
              }
              return return_value;
            };
          }
          break;
        case 'async_chain':
        case 'async_chain_funnel':
          melded_method = async function (...args) {
            //  walk the method stack and apply each method to the bound object
            const len = method_stack.length;
            let i, return_value = args[0];
            for (i = 0; i < len; i++) {
              return_value = args[0] = await method_stack[i].apply(object, args);
            }
            return return_value;
          };
          break;
        case 'funnel':
        case 'blender':
          // blenders use the first arg to determine how to meld the return value onto the first arg
          // return false to short-circuit the chain with a `false` return value
          // return true to short-circuit the chain with the first argument as the return value
          // return a value that is compatible with the first argument to meld it onto the first argument
          // returning the first argument is safe, but no return is required
          melded_method = function (first_arg = {}, ...args) {
            //  walk the method stack and apply each method to the bound object
            const len = method_stack.length;
            let i, return_value;
            // if the first argument is a function. but not a melded method, meld it
            if (IsFunction(first_arg) && NotMeldedMethod(first_arg)) first_arg = Doh.meld_method(object, [first_arg], 'method');
            for (i = 0; i < len; i++) {
              return_value = undefined;
              return_value = method_stack[i].call(object, first_arg, ...args);

              if (IsFalse(return_value)) return false;
              if (IsTrue(return_value)) return first_arg;

              first_arg = Doh.blend(first_arg, return_value);
            }
            return first_arg;
          };
          break;
        case 'async_funnel':
        case 'async_blender':
          melded_method = async function (first_arg, ...args) {
            //  walk the method stack and apply each method to the bound object
            const len = method_stack.length;
            let i, return_value;
            // if the first argument is a function. but not a melded method, meld it
            if (IsFunction(first_arg) && NotMeldedMethod(first_arg)) first_arg = Doh.meld_method(object, [first_arg], 'method');
            for (i = 0; i < len; i++) {
              return_value = undefined;
              return_value = await method_stack[i].call(object, first_arg, ...args);

              if (IsFalse(return_value)) return false;
              if (IsTrue(return_value)) return first_arg;

              first_arg = Doh.blend(first_arg, return_value);
            }
            return first_arg;
          };
          break;
        case 'async_method':
        case 'async_this_funnel':
        case 'async_this_blender':
          melded_method = async function (...args) {
            //  walk the method stack and apply each method to the bound object
            const len = method_stack.length;
            let i, return_value;
            for (i = 0; i < len; i++) {
              return_value = undefined;
              return_value = await method_stack[i].call(object, ...args);

              if (IsFalse(return_value)) return false;
              if (IsTrue(return_value)) return object;

              if (IsDefined(return_value)) Doh.blend(object, return_value);
            }
            return object;
          };
          break;
        case 'super':
          if (!method_name) Doh.debug('Doh.meld_method called with type "super" but no method_name');
          // bind a call to super that starts with the outermost pattern and works inwards
          melded_method = object.super.bind(object, 'runtime', method_name);
          break;
        default:
          Doh.debug('Doh.meld_method called with unknown type:', type);
          break;
      }
      // track the meld_stack so we can manipulate it
      melded_method.meld_stack = method_stack;
      // if we want to update the pointer, we need a closure to access the original scope
      melded_method.update_meld_stack = function (newStack) {
        // if we didn't pass a stack in but we remember our own name
        if (!newStack && method_name) {
          // get the stack from Doh
          if (type === 'funnel' || type === 'async_funnel' || type === 'this_funnel' || type === 'async_this_funnel') method_stack = Doh.find_funnel_method_stack(object, method_name);
          else method_stack = Doh.find_meld_method_stack(object, method_name);
          return;
        }
        // otherwise, apply the stack we sent in
        method_stack = newStack;
      };
      melded_method.add = function (method, unique = true) {
        if (unique) {
          if (method_stack.indexOf(method) === -1) method_stack.push(method);
        } else {
          method_stack.push(method);
        }
        // return a method that will remove the method from the stack
        return melded_method.remove.bind(null, method);
      };
      melded_method.remove = function (method) {
        const index = method_stack.indexOf(method);
        if (index !== -1) method_stack.splice(index, 1);
      };
      return melded_method;
    },
    /**
     *  @brief Update ALL meld_methods and phases of object
     *  
     *  @param [in] object [object] to look for melded methods on
     *  @return nothing
     *  
     *  @details operates on object, replaces melded method keys with actual method melders
     */
    update_meld_methods: function (object, deep_moc) {
      let inner_moc = deep_moc || object.moc;
      if (!inner_moc.__) inner_moc = Doh.get_empowered_moc(inner_moc, object);

      // Function to flatten the MOC structure
      const flattenMoc = (moc, prefix = '') => {
        const flattened = {};
        let value, fullProp;
        for (let prop in moc) {
          value = moc[prop];
          fullProp = prefix + prop;

          if (IsObjectObject(value) || value === 'DEEP') {
            Object.assign(flattened, flattenMoc(value, fullProp + '.'));
          } else {
            flattened[fullProp] = value;
          }
        }
        return flattened;
      };

      let flatMoc = flattenMoc(inner_moc);
      let full_prop_name, moc_value, is_async, meld_type, target_function;
      for (full_prop_name in flatMoc) {
        moc_value = flatMoc[full_prop_name];

        if (IsString(moc_value)) moc_value = moc_value.toLowerCase();
        else continue;

        is_async = inner_moc.__.is_async(full_prop_name);
        meld_type = is_async ? 'async_' + moc_value : moc_value;

        if (Doh.MeldedTypeMethods.includes(meld_type)) {
          target_function = Doh.parse_reference(object, full_prop_name);

          if (IsFunction(target_function) && IsFunction(target_function.update_meld_stack)) {
            // Update existing melded method
            target_function.update_meld_stack();
          } else {
            // Create new melded method
            let { container, prop } = Doh.parse_ref(object, full_prop_name);
            container[prop] = Doh.meld_method(object, full_prop_name, meld_type);
          }
        }
      }
    },


    //MARK: meld_ideas
    // the most important function in Doh:
    /**
     *  @brief Use Doh's meld_ functions to meld two ideas together.
     *  
     *  @param [in] destination [object] to meld into
     *  @param [in] idea        [object] to meld from
     *  @param [in] deep_moc [object] should be falsey or an object that describes melded types of properties of each idea
     *                                    - used primarily to allow deeply melded objects without polluting them with .moc
     *  @return destination
     *  
     *  @details Uses destination.moc and idea.moc (or deep_moc) to define meld and data types for each property.
     *         Melds each property of idea onto destination based on the meld type of the property.
     */
    __meld_ideas: function (toProto = false, destination, idea, deep_moc, ref_opts) {
      let prop_name = '',
        // the prototype of the destination object
        dest_proto = Object.getPrototypeOf(destination),
        // moc 
        moc,
        // inner_moc is an object that describes the moc types of each property of the idea
        inner_moc = idea.moc,
        // go_deep is a flag that tells us if we need to recursively meld the property
        go_deep,
        // moc_type is the type of melding for the property
        moc_type,
        // the name of the property in the inner_moc object
        moc_prop_name,
        // the value of the property on the idea object
        idea_prop,
        // the final destination object to meld into (either the object or the prototype)
        final_destination = destination;


      // if we are deep melding, we need to use the deep_moc object under the idea.moc object
      if (IsObjectObject(deep_moc)) {
        // this is due to the fact that we don't want to pollute the object with .moc
        inner_moc = Doh.meld_objects(deep_moc, inner_moc || {});
      }

      // empower moc with magic __ powers
      moc = Doh.get_empowered_moc(destination.moc || {}, destination, dest_proto);
      // if we are melding to the prototype, we need to make sure that the moc object is on the prototype
      //if(toProto) dest_proto.moc = moc;
      if (toProto || idea.moc) destination.moc = moc;


      // build up the newly empowered moc object with the parsed moc object to create our final moc definition
      moc.__.import_moc(inner_moc, idea);

      // loop over the idea and decide what to do with the properties
      prop_name = '';
      for (prop_name in idea) {
        if (prop_name === 'moc') continue;
        if (prop_name === 'melded') continue;

        //let visibility = moc.__.vis(prop_name);
        moc_prop_name = prop_name;
        moc_type = moc[prop_name];
        /*
        if(!toProto) {
          final_destination = destination;
          if(visibility === 'PRIV') {
            final_destination = dest_proto;
          }
        } else {
          final_destination = dest_proto;
          if(visibility === 'PUB') {
            final_destination = destination;
          }
        }
          */
        if (IsUndefined(moc_type)) if (moc['*']) {
          moc_prop_name = '*';
          moc_type = moc[moc_prop_name];
        }
        if (IsUndefined(moc_type)) {
          moc_prop_name = prop_name;
          moc_type = moc[moc_prop_name];
        }
        if (IsNull(moc_type)) moc_type = 'ANY';
        if (moc_type === 'DEEP' || IsObjectObject(moc_type) || (NotUndefined(moc_type) && NotString(moc_type) && NotNull(moc_type))) {
          go_deep = true;
          moc_type = 'OBJECT';
        } else {
          go_deep = false;
        }
        if (IsUndefined(moc_type)) {
          moc_type = 'ANY';
          moc_prop_name = prop_name;
        }

        idea_prop = idea[prop_name];
        if (idea_prop !== undefined && idea_prop !== destination[prop_name]) {
          if (Doh.MeldedTypeMethods.includes(moc_type)) {
            // if the property is a melded method, meld it, it will collect it's stack later
            let is_async = moc.__.is_async(prop_name);
            if (ref_opts) {
              final_destination[prop_name] = Doh.meld_method(ref_opts.destination, ref_opts.path, (is_async ? 'async_' + moc_type : moc_type));
            } else {
              final_destination[prop_name] = Doh.meld_method(destination, prop_name, (is_async ? 'async_' + moc_type : moc_type));
            }
            continue;
          }
          if (moc_type === 'EXCLUSIVE' || moc_type === 'STATIC') {
            // exclusive and static properties can only be set by the idea that claims them.
            if (inner_moc) if (inner_moc[moc_prop_name]) {
              // if we didn't throw an error or skip above, and the idea defined the exclusive/static, then we are allowed to set it.
              final_destination[prop_name] = idea_prop;
            }
            continue;
          }
          if (moc_type === 'OBJECT' || (typeof idea_prop === 'object' && NotArray(idea_prop) && IsEmptyObject(idea_prop) && NotNull(idea_prop))) {
            // it's a melded object or an empty default
            if (deep_moc || go_deep) {
              // if we are deep melding, we need to use the deep_moc object instead of the idea.moc object
              // this is the only way to allow deep melding to work without polluting the object with .moc
              final_destination[prop_name] = destination[prop_name] || {};
              const new_ref_opts = {};
              if (ref_opts) {
                // 
                new_ref_opts.path = ref_opts.path + '.' + prop_name;
              } else {
                new_ref_opts.destination = destination;
                new_ref_opts.path = prop_name;
              }
              let nested_moc = moc.__.nest(moc_prop_name);
              final_destination[prop_name] = Doh.meld_ideas(destination[prop_name], idea_prop, nested_moc, new_ref_opts);
              // the nested_moc may have picked up some new moc data, so we need to update ours
              if ((deep_moc || go_deep) && nested_moc) {
                //if (deep_moc) deep_moc[moc_prop_name] = nested_moc;
                if (deep_moc) deep_moc[moc_prop_name] = Doh.meld_deep(deep_moc[moc_prop_name], nested_moc);
                //if (moc) moc.__.import_moc({ [moc_prop_name]: nested_moc }, final_destination);
              }
            } else {
              // if we are not deep melding, we can just meld the object onto the object
              final_destination[prop_name] = Doh.meld_objects(destination[prop_name] || {}, idea_prop);
            }
            continue;
          }
          if (moc_type === 'CONCAT') {
            // it's a concatenated array or string

            // if it's an array, we can just concat it
            if (IsArray(idea_prop)) {
              final_destination[prop_name] = destination[prop_name] || [];
              final_destination[prop_name] = destination[prop_name].concat(idea_prop);
              continue;
            }
            // if it's a string, we can just concat it
            if (IsString(idea_prop)) {
              final_destination[prop_name] = (destination[prop_name] || '') + idea_prop;
              continue;
            }
          }
          if (moc_type === 'ARRAY' || (IsArray(idea_prop) && !idea_prop.length)) {
            // it's a melded array or an empty default
            final_destination[prop_name] = Doh.meld_arrays(destination[prop_name], idea_prop);
            continue;
          }
          // stack the ifs for speed
          if (NotNull(idea_prop)) if (idea_prop.pattern) if (!idea_prop.machine) if (!idea_prop.skip_being_built) {
            // it's an auto-build property, auto-meld it below
            //moc[prop_name] = moc_type = 'IDEA';
            moc_type = 'IDEA';
            // this is for the case where we are deep melding and there is a passed-in deep_moc object
            // if the destination has a moc, then we need to try and meld the idea's moc onto the destination's moc
            // the destination may be different than the final_destination, so we need to check both
            if (destination.moc) if (destination.moc[moc_prop_name] !== moc[moc_prop_name]) {
              if (!final_destination.moc) final_destination.moc = moc;
              final_destination.moc[moc_prop_name] = moc[moc_prop_name];
            }
            // CONTROVERSIAL: modify the moc set passed in?
            // so far this is the only way to allow special moc collections to contain auto-built properties
            // if (inner_moc) {
            //   inner_moc[moc_prop_name] = moc_type;
            // }
            if (deep_moc) {
              // if we are using a deep_moc, then setting the moc_type here will help persist back up to a moc that remains after composition
              deep_moc[moc_prop_name] = moc_type;
            }
          }
          if (moc_type === 'IDEA') {
            final_destination[prop_name] = destination[prop_name] || {};

            let nested_inherits = {};

            // if the property is an idea without an empowered moc, then we need to build it for the composition process
            if (!destination[prop_name].moc?.__) {
              // if we don't have an empowered moc, then we need to build one
              destination[prop_name].moc = Doh.get_empowered_moc(destination[prop_name].moc || {}, destination[prop_name]);

              // inherits can come from either OR both places
              // start with what already exists on the destination
              if (destination[prop_name]?.inherits) nested_inherits = Doh.meld_into_objectobject(nested_inherits, destination[prop_name].inherits);
            }
            // then add any new inherits from the idea
            if (idea_prop.inherits) nested_inherits = Doh.meld_into_objectobject(nested_inherits, idea_prop.inherits);
            // the pattern is an inherit too, so we need to add it last if there are any inherits or if the pattern is different
            if (IsObjectObjectAndNotEmpty(nested_inherits) || idea_prop.pattern !== destination[prop_name]?.pattern) nested_inherits[idea_prop.pattern || destination[prop_name]?.pattern] = true;
            // then expand the inherits (returns an object where each key is an inherit pattern name and the value is truthy)
            if (IsObjectObjectAndNotEmpty(nested_inherits)) {
              const extended_inherits = Doh.extend_inherits(nested_inherits);
              // for this we will need to walk the extended inherits and import any moc objects we find
              for (const inheritName in extended_inherits) {
                const inherited_pattern = Patterns[inheritName];
                if (inherited_pattern) {
                  // if the inherited pattern has a moc object, then we need to import it
                  if (inherited_pattern.moc) {
                    destination[prop_name].moc.__.import_moc(inherited_pattern.moc, inherited_pattern);
                  }
                }
              }
            }
            final_destination[prop_name] = Doh.meld_idea_onto_prototype(destination[prop_name], idea_prop, destination[prop_name].moc);
            continue;
          }

          // non-melded property
          final_destination[prop_name] = idea_prop;
        }
      }

      return destination;
    },
    /**
     * @brief Use Doh's meld_ functions to meld two ideas together.
     * 
     * @param destination
     * @param idea
     * @param deep_moc
     * @returns 
     */
    meld_ideas: function (destination = {}, idea, deep_moc, ref_opts) {
      return Doh.__meld_ideas(false, destination, idea, deep_moc, ref_opts);
    },
    meld_idea_onto_prototype: function (destination = new junk, idea, deep_moc, ref_opts) {
      return Doh.__meld_ideas(true, destination, idea, deep_moc, ref_opts);
    },
    /**
     *  @brief Meld ideas with a special moc descriptor AND multiple ideas
     *  
     *  @param [in] special_moc [object] should be falsey or an object that describes melded types of properties of each idea
     *  @param [in] destination [object/falsey] an object to modify, or falsey/{} to create a new object and return it
     *  @param [in] arguments[] [idea(s)] to meld onto the destination, using special_moc as a moc_type map
     *  @return destination
     *  
     *  @details special_meld_ideas(special_moc, dest, idea1, idea2, idea3, ...)
     */
    special_meld_ideas: function (special_moc, destination) {
      for (let i in arguments) {
        if (i == 0 || i === 'length' || arguments[i] === destination) continue;
        Doh.meld_ideas(destination, arguments[i], special_moc);
      }
      return destination;
    },

    /**
     *  @brief Turn a dot delimited name into a deep reference on 'object'
     *
     *  @param [in] object        The object to get a deep reference to
     *                            Pass true to 'object' and it will return the last key of the split
     *                            Pass false to 'object' to return the split array
     *  @param [in] property_str  A dot-delimited string of the nested property on object
     *  @param [in] count_back    return a reference count_back from the end of the property_str names array
     *  @return A deep reference into 'object' or the last key of the split or the whole split array
     *  
     *  @details Also used by ajax
     *  
     *            Can also handle arrays in the nested flow. (e.g.: myproperty.subprop.subarray.3.property_of_object_on_an_array.etc
     *                                                     becomes: myproperty.subprop.subarray[3].property_of_object_on_an_array.etc)
     */
    parse_reference: function (object, property_str, count_back = 0) {
      let current_reference = object, current_prop,
        property_names_array = new String(property_str).split('.');
      // pass true to 'object' and it will return the last key of the split
      if (object === true) return property_names_array[property_names_array.length - 1];
      // pass false to 'object' and it will return the split array
      if (object === false) return property_names_array;
      // otherwise, use the array to try and walk the reference nesting
      let num_props = property_names_array.length + count_back;
      for (let i = 0; i < num_props; i++) {
        current_prop = property_names_array[i];
        if (IsUndefined(current_reference[current_prop])) {
          if (Doh.DebugMode) console.warn(colorize('Doh.parse_reference(', text_color), colorize(object, info_color), colorize(',', text_color), colorize(property_str, info_color), colorize("couldn't find: '", text_color), colorize(current_prop, info_color), colorize(" on the object:", text_color), colorize(current_reference, info_color));
          return null; // ANDY added this with caution == the previous implementation would return object which could lead to circularity
          //break;
        }
        current_reference = current_reference[current_prop];

        if (IsUndefined(current_reference)) {
          // is it an array? if so, the key could be a number
          if (IsNumber(Number(current_prop)))
            current_reference = current_reference[Number(current_prop)];
        }
      }

      return current_reference;
    },
    // passthrough for parse_reference
    parse_ref_container: function (object, property_str) {
      return Doh.parse_reference(object, property_str, -1);
    },
    parse_ref_prop: function (property_str) {
      return Doh.parse_reference(true, property_str);
    },
    // container, prop = Doh.parse_ref(object, property_str)
    parse_ref: function (object, property_str) {
      return { container: Doh.parse_ref_container(object, property_str), prop: Doh.parse_ref_prop(property_str) };
    },
  });


  //MARK: Mimic
  Object.assign(Doh, {
    /**
     *  @brief call a callback any time a property on an object changes
     *  
     *  @param [in] object             [object] the object to watch
     *  @param [in] prop               [string] the property name to watch
     *  @param [in] on_change_callback [function] the callback to fire when the value of prop changes
     *  @return a function that clears the observing
     *  
     *  @details on_change_callback(object, prop, new_value){this === object;}
     */
    observe: function (object, prop, on_change_callback = null, on_every_callback = null) {
      let prop_desc;
      // we can only set this system up on objectobjects     not triple equal on purpose
      if (toString.call(object) == '[object Object]') {
        // for now, the only valid prop indicator is a string
        // observe requires a function for callback or the observation isn't seen
        if (IsString(prop) && (IsFunction(on_change_callback) || IsFunction(on_every_callback))) {
          // check for a setter already there
          let old_setter, new_setter;
          prop_desc = Object.getOwnPropertyDescriptor(object, prop);
          if (!prop_desc) {
            let proto = Object.getPrototypeOf(object);
            prop_desc = Object.getOwnPropertyDescriptor(proto, prop);
            //console.warn('getOwnPropertyDescriptor fail for',object,prop);
          }
          let has_setter = typeof prop_desc !== 'undefined' && IsFunction(prop_desc.set)
          if (!has_setter || (has_setter && !prop_desc.set.meld_stack)) {
            if (has_setter && !prop_desc.set.meld_stack) {
              old_setter = prop_desc.set;
              new_setter = function (obj, prop, val) {
                old_setter.apply(obj, [val]);
              }
            }
            // bind the original value to a new local variable
            // IMPORTANT: this 'let val ...' statement creates a closure around 'val' and essentially
            //           turns it into the actual value storage for this property. The getter gets this
            //           internal val, and the setter sets it. This allows the property to both store it's own value
            //           as well as have both getter and setter for access and retrieval.
            let val = object[prop],


              // create a local closure for the method stack as well
              method_stack = [],
              every_stack = [],
              // and the melded method that we will assign to the setter
              melded_method = async function (new_value) {
                const QUEUE_MAX_SIZE = 1000;
                const QUEUE_WARN_THRESHOLD = 0.75; // 75%
                // Add to queue and get queue position
                if (!melded_method.queue) {
                  melded_method.queue = [];
                  melded_method.processing = false;
                }

                // Check queue size and handle limits
                if (melded_method.queue.length >= QUEUE_MAX_SIZE) {
                  throw new Error(`Melded method queue overflow (${QUEUE_MAX_SIZE} items) for property: ${prop}`);
                }

                if (melded_method.queue.length > QUEUE_MAX_SIZE * QUEUE_WARN_THRESHOLD) {
                  console.warn(`Melded method queue filling up (${melded_method.queue.length}/${QUEUE_MAX_SIZE}) for property: ${prop}`);
                }

                // Create promise for this call
                let resolver;
                const promise = new Promise(resolve => { resolver = resolve; });

                // Add to queue
                melded_method.queue.push({ new_value, resolver });

                // Process queue if not already processing
                if (!melded_method.processing) {
                  melded_method.processing = true;
                  while (melded_method.queue.length > 0) {
                    const { new_value, resolver } = melded_method.queue[0];
                    let old_value = val;

                    // Only process if value actually changed
                    if (val !== new_value) {
                      val = new_value;
                      const len = method_stack.length;
                      for (let i = 0; i < len; i++) {
                        if (method_stack[i].apply) {
                          await method_stack[i].apply(object, [object, prop, new_value, old_value]);
                        }
                      }
                    }

                    // Process every_stack regardless of value change
                    const len = every_stack.length;
                    for (let i = 0; i < len; i++) {
                      if (every_stack[i].apply) {
                        await every_stack[i].apply(object, [object, prop, new_value, old_value]);
                      }
                    }

                    // Remove from queue and resolve
                    melded_method.queue.shift();
                    resolver();

                    // Release processor between queue items
                    if (melded_method.queue.length > 0) {
                      await new Promise(resolve => setTimeout(resolve, 0));
                    }
                  }
                  melded_method.processing = false;
                }

                // Wait for this call to complete and return its result
                return await promise;
              };
            // track the meld_stack so we can manipulate it
            melded_method.meld_stack = method_stack;
            melded_method.every_stack = every_stack;
            // if we want to update the pointer, we need a closure to access the original scope
            melded_method.update_meld_stack = function (new_stack, for_every = false) {
              // if we didn't pass a stack
              if (!new_stack) {
                console.warn("[melded_method].update_meld_stack didn't get a new_stack");
                return;
              }
              if (for_every) {
                every_stack = new_stack;
                return;
              }
              // otherwise, apply the stack we sent in
              method_stack = new_stack;
            };
            // attach a utility method to remove melded functions from the stack
            melded_method.remove_melded = function (method = null, every_method = null) {
              if (method) method_stack.splice(method_stack.indexOf(method), 1);
              if (every_method) every_stack.splice(every_stack.indexOf(every_method), 1);
            };


            Object.defineProperty(object, prop, {
              // if we have a setter, then we must have a getter
              // our fancy getter retrieves the original value storage, which
              // is the thing that gets updated.
              get: function () { return val; },
              set: melded_method,
              // don't break enumerable stuff
              enumerable: prop_desc ? prop_desc.enumerable : true,
              // don't break our ability to configure
              configurable: true,
            });
          }
          // we have to get (or re-get) the prop_desc here in case the melded setter already exists or we just made one
          prop_desc = Object.getOwnPropertyDescriptor(object, prop);

          if (!prop_desc) {
            let proto = Object.getPrototypeOf(object);
            prop_desc = Object.getOwnPropertyDescriptor(proto, prop);
          }
          if (new_setter) {
            prop_desc.set.every_stack.push(new_setter);
          }
          if (!prop_desc.set.meld_stack) {
            console.warn('Mimic.observe found a different kind of setter for:', prop, 'on object:', object, 'with callback:', on_change_callback);
            return function () { };
          }
          // just push our on_change onto the meld_stack. 
          if (on_change_callback) prop_desc.set.meld_stack.push(on_change_callback);
          if (on_every_callback) prop_desc.set.every_stack.push(on_every_callback);
          // return a function that can be called to remove the on_change callback
          return () => {
            prop_desc.set.remove_melded(on_change_callback, on_every_callback);
          }
        }
      }
    },
    /**
     *  @brief tell two things to have a property mimic the other
     *  
     *  @param [in] my_thing           [object] the object the callback is relative to
     *  @param [in] my_prop            [string] name of the prop on my_thing to sync
     *  @param [in] their_thing        [object] the object to sync with
     *  @param [in] their_prop         [string] name of the prop on their_thing to sync with
     *  @param [in] on_change_callback [function] optionally a function to run when my_thing[my_prop] is changed
     *  @return a function that will remove the mimic that was just created when called
     *  
     *  @details shockingly simple
     *  
     *    on_change_callback(my_thing, my_prop, their_thing, their_prop, new_value){this === my_thing;}
     */
    mimic: function (my_thing, my_prop, their_thing, their_prop, on_change_callback) {

      // syncing demands initial state to be synced BEFORE setters are defined
      // IMPORTANT: this keeps the initial set from echoing forever
      if (my_thing[my_prop] !== their_thing[their_prop]) my_thing[my_prop] = their_thing[their_prop];

      // make a setter for our value that will call the on_change_callback when we change
      const my_remover = Doh.observe(my_thing, my_prop, function (object, prop, new_value) {
        // i only get run if my value changed
        // only make their setter system run when actually needed
        let old_value = their_thing[their_prop];
        if (old_value !== new_value) their_thing[their_prop] = new_value;
        // unlike Setter.observe(), .mimic() does something with the observed value, so the change callback isn't mandatory since it's being wrapped anyway.
        if (on_change_callback) on_change_callback.apply(my_thing, [my_thing, my_prop, their_thing, their_prop, new_value, old_value]);
      }),
        // make a setter for their value that will set me if needed, triggering my own observers 
        their_remover = Doh.observe(their_thing, their_prop, function (object, prop, new_value) {
          // i get run if THEIR value changed, we still have to check
          // if the new value is actually new to us too.
          if (new_value !== my_thing[my_prop]) {
            // if it IS new to us, then setting it will trigger the setters
            my_thing[my_prop] = new_value;
          }
        });
      // return a function that can be called to remove both callbacks
      return function () {
        my_remover();
        their_remover();
      };
    },
  });


  //MARK: Pods
  Object.assign(Doh, {
    // Function to fetch a single pod file from a URL or local file
    fetch_pod: async function (podLocation) {
      if (!podLocation) return {};
      // parse the podLocation string and try to use the extension to determine the type
      // the pod location type is first part of the string before the : which can let us send data: or json: or yaml:, specifically
      let podLocationType = podLocation.split(':').shift();
      // the pod type is file extension, assuming that the above is not present
      let podType = podLocation.split('.').pop();
      // if the pod location type is data, json, or yaml, then we can use it as the pod type
      if (podLocationType === 'data' || podLocationType === 'json' || podLocationType === 'yaml') {
        podType = podLocationType;
      }
      // this will fix yml to be yaml and data to be json
      if (podType === 'yaml' || podType === 'yml') {
        podType = 'yaml';
      } else {
        podType = 'json';
      }

      try {
        return Doh.__fetch_pod(podLocation, podType);
      } catch (error) {
        console.warn(colorize('  Error fetching pod:', error_color), colorize(error.message, warn_color));
      }
    },
    get_pod_as_map: async function (from_pod, pod_map = new Map()) {
      // If already visited, return the result
      if (pod_map.has(from_pod)) return pod_map;

      // if the from_pod is not a string, then we are done
      if (!IsString(from_pod)) return pod_map;

      // Fetch the pod data
      const currentPod = await Doh.fetch_pod(from_pod);

      if (!currentPod) return pod_map;

      // Handle inheritance
      const inherits = Doh.meld_into_array(currentPod.inherits || []);

      for (const inheritedPodLocation of inherits) {
        // Recursively process inherited pods
        if (currentPod.inherited && currentPod.inherited[inheritedPodLocation]) {
          // If the inherited pod is already in the current pod, skip it
          continue;
        }
        await Doh.get_pod_as_map(inheritedPodLocation, pod_map);
      }

      // Set the pod data in the map
      pod_map.set(from_pod, currentPod || {});

      // Return order and the visited Map with pod data
      return pod_map;
    },
    meld_pods: function (dest, source, keep_remover_flags) {
      if (dest == null) {
        // If destination is null or undefined, return a new object
        dest = {};
      }

      let moc = Doh.get_empowered_moc(dest.moc || {}, dest);

      if (source != null) { // Check if source is not null/undefined
        if (source.moc) {
          // if the source has a moc, we need to import it
          moc.__.import_moc(source.moc, source);
        }
        for (const key in source) {
          if (Object.prototype.hasOwnProperty.call(source, key)) {
            // Check if key or value starts with '~~'
            if (key.startsWith('~~')) {
              const cleanItem = key.slice(2);
              delete dest[cleanItem];  // Remove the key from the destination object
              if (keep_remover_flags) {
                dest[key] = '';
              }
              continue;  // Skip
            }
            if (IsObjectObject(source[key])) {
              if (!IsObjectObject(dest[key])) {
                dest[key] = {};
              }
              Doh.meld_pods(dest[key], source[key], keep_remover_flags);
            } else if (IsArray(source[key])) {
              if (NotArray(dest[key])) {
                dest[key] = [];
              }
              // Remove values in destination that match keys in source starting with '~~'
              // and add them to the dest if keep_remover_flags is true
              source[key].forEach(sourceItem => {
                if (IsString(sourceItem) && sourceItem.startsWith('~~')) {
                  const cleanItem = sourceItem.slice(2);
                  dest[key] = dest[key].filter(destItem => destItem !== cleanItem);
                  if (keep_remover_flags && !dest[key].includes(sourceItem)) {
                    dest[key].push(sourceItem);
                  }
                } else {
                  // Add only non-~~ prefixed values
                  if (!dest[key].includes(sourceItem)) {
                    dest[key].push(sourceItem);
                  }
                }
              });
            } else {
              dest[key] = source[key];
            }
          }
        }
      }
      return dest;
    },
    clean_pod: function (pod) {
      if (pod.moc) delete pod.moc;
      // go through the pod and recursively clean it
      for (const key in pod) {
        if (key.startsWith('~~')) continue;
        if (key === 'inherited') continue;
        if (Object.prototype.hasOwnProperty.call(pod, key)) {
          if (IsObjectObject(pod[key])) Doh.clean_pod(pod[key]);
        }
      }
      return pod;
    },
    build_pod: async function (podLocation, pod) {
      //console.log('  Building Pod from:', podLocation);
      let keep_remover_flags = false;
      // if the last argument is `true`, then we keep the remover flags
      if (arguments[arguments.length - 1] === true) {
        keep_remover_flags = true;
      }
      // if the pod is not an object, then we need to make it one
      if (NotObjectObject(pod)) pod = { inherited: {} };
      // get the pod as a map
      let pod_map = await Doh.get_pod_as_map(podLocation);
      // get the order of the pods
      let order = Array.from(pod_map.keys());
      // meld the pods in order
      for (let podLocation of order) {
        let currentPod = pod_map.get(podLocation);
        // meld the pods
        Doh.meld_pods(pod, currentPod, keep_remover_flags);
        // add the inherited pod to the pod
        pod.inherited[podLocation] = currentPod;
        // if the current pod has a browser_pod, then we need to meld it
        if (currentPod.browser_pod) {
          // if the browser_pod has a inherits array, then we need to meld it
          if (pod.browser_pod.inherits && pod.browser_pod.inherits.length > 0) {
            pod.browser_pod = await Doh.build_pod(`data:${JSON.stringify(pod.browser_pod)}`, pod.browser_pod);
          }
          // add the podLocation to the inherits array
          pod.browser_pod.inherits = pod.browser_pod.inherits || [];
          if (!pod.browser_pod.inherits.includes(podLocation)) pod.browser_pod.inherits.push(podLocation);
          // add the inherited pod to the browser_pod
          pod.browser_pod.inherited = pod.browser_pod.inherited || {};
          pod.browser_pod.inherited[podLocation] = currentPod.browser_pod;
        }
      }
      // fix inherits
      pod.inherits = pod.inherits || [];
      if (!pod.inherits.includes(podLocation)) pod.inherits.push(podLocation);
      // now that we have everything fixed up, we need to meld the browser_pod onto the pod itself
      Doh.meld_pods(pod, pod.browser_pod);
      return pod;
    },
  });


  //MARK: Load
  let has_ever_loaded = false;
  Object.assign(Doh, {
    // overload this method in deployers that need special loading
    __ready_to_load: function () {
      // this runs once for each module that is loaded
      Doh.__update_globals();
      return Promise.resolve(true);
    },
    // LoaderTypes is a map of loader types to functions that handle them
    LoaderTypes: {
      'doh': async function (loadStatement, from, relpath, loaderType, forceReload = false) {
        // use the src to get the module name
        const module_name = from;
        if (!forceReload && Doh.ModulePromises[module_name]) return Doh.ModulePromises[module_name];
        const module_package = Doh.Packages[module_name];
        if (module_package) {
          let mod;
          if (module_package.file) {
            // if the package has a file, it will either be preloaded or need to be loaded
            Doh.__preload_doh_package_files(module_name, relpath, forceReload);
            if (Doh.PreloadedPackages[module_name]) mod = await Doh.PreloadedPackages[module_name];
            else Doh.error('Doh package file:', module_package.file, 'failed to load module:', module_name);
          }

          // every package has a .load array of dependencies
          const reqs = module_package.load || [];
          if (module_package.module_name) {
            Doh.performance.start(module_name + '_load');
            // if this is a module, see if it's core
            if (!module_package.path?.startsWith('doh_js')) {
              // if it's not core, we need to load doh_js
              reqs.unshift('await doh_js');
              if (!has_ever_loaded) {
                has_ever_loaded = true;
                Doh.load('browser&&Doh.pod.hmr.enabled?? async optional hmr_browser');
              }
            }
            if (Doh.ModuleIsLoaded[module_name]) {
              Doh.ModulePromises[module_name] = Doh.ModuleIsLoaded[module_name];
            }
          }
          let dep_promise = Doh.load(reqs, relpath, module_name);
          await dep_promise;
          // modules also need to wait on the module callback
          if (module_package.module_name) {
            if (IsFunction(Doh.ModuleWasRequested[module_name])) {
              await Doh.ModuleWasRequested[module_name]();
              Doh.ModuleWasRequested[module_name] = Promise.resolve(true);
            }
          } else {
            // this is a package
            Doh.ModulePromises[module_name] = dep_promise;
          }
          // finally, we need to set our ModulePromises to the module object
          if (!Doh.ModulePromises[module_name] && mod) Doh.ModulePromises[module_name] = mod;
        } else {
          return Promise.reject('Doh.load() failed to load: ' + module_name + ' as a doh package');
        }
        return Doh.ModulePromises[module_name];
      },
      // THIS IMPORT IS NOT USED FOR NATIVE ESM IMPORTS, ONLY FOR > import DECORATORS
      'import': async function (loadStatement, from, relpath, loaderType, forceReload = false) {
        // Check if the original dependency string contains the reload decorator
        if (!forceReload && Doh.ModulePromises[loadStatement]) return Doh.ModulePromises[loadStatement];
        if (IsLocalFileBrowser()) {
          from = '..' + from;
        }
        Doh.ModulePromises[loadStatement] = Doh.__load_esm_module(from, relpath, forceReload).then(module => Doh.__globalize_module_exports(module));
        // Doh.Loaded[dep] = Doh.ModulePromises[dep];
        return Doh.ModulePromises[loadStatement];
      },
      'pod': async function (loadStatement, from, relpath, loaderType, forceReload = false) {
        if (Doh.PodIsLoaded[from] && !forceReload) return Doh.PodIsLoaded[from];
        Doh.Loaded[loadStatement] = Doh.Loaded[loadStatement] || {};
        Doh.PodIsLoaded[from] = Doh.build_pod(from + (forceReload ? '?reload=' + forceReload : ''), Doh.Loaded[loadStatement]);
        return Doh.PodIsLoaded[from];
      },
      // these must be implemented in the environment sections below
      'file': async function (loadStatement, from, relpath, loaderType, forceReload = false) {
        return Promise.resolve(true);
      },
      'raw': async function (loadStatement, from, relpath, loaderType, forceReload = false) {
        return Promise.resolve(true);
      },
      'json': async function (loadStatement, from, relpath, loaderType, forceReload = false) {
        return Promise.resolve(true);
      },
      'yaml': async function (loadStatement, from, relpath, loaderType, forceReload = false) {
        return Promise.resolve(true);
      },
      'js': async function (loadStatement, from, relpath, loaderType, forceReload = false) {
        return Promise.resolve(true);
      },
      'css': async function (loadStatement, from, relpath, loaderType, forceReload = false) {
        return Promise.resolve(true);
      },
      // ... extend in environment sections below as needed
    },
    // LoaderTypesExtMap is a map of file extensions to loader types
    // this is used to determine the loader type for a given file extension
    // if a file extension is not in this map, then the default loader type MAY BE used...
    // HOWEVER, if an 'import x from y' statement is found, then the loader type system is IGNORED
    LoaderTypesExtMap: {
      'mjs': 'import',
      'cjs': 'import',
      'json': 'json',
      'md': 'file',
      'txt': 'file',
      'html': 'file',
      'yaml': 'yaml',
      'yml': 'yaml',
      'js': 'js',
      'css': 'css',
      'rawfile': 'raw',
      'default': 'doh'
    },
    manifests_are_loaded: false,
    load: async function (deps, relpath, module_name, forceReload = false) {
      if (!Doh.manifests_are_loaded) {
        try {
          await Doh.ingest_package_manifest();
        } catch (e) {
          console.warn('Doh: Error ingesting package manifest:', e);
        }
        Doh.manifests_are_loaded = true;
      }
      // if we are given nothing, check for Doh.pod, then Doh.pod.host_load, which should be a valid 'deps' argument
      if (!deps || deps === 'host_load') {
        if (Doh.pod && Doh.pod.host_load) {
          deps = Doh.pod.host_load;
        }
        // deps should only still be host_load here if the pod failed to load
        if (!deps || deps === 'host_load') {
          deps = ['doh_js'];
        } else if (IsString(deps)) {
          deps = [deps];
        } else if (deps.length === 0) {
          deps = ['doh_js'];
        }
        if (NotArray(deps)) {
          throw new Error('Doh.load requires an array of dependencies, but ended up with:', deps);
        }
      }
      // if we are given a string, make it an array
      if (IsString(deps)) {
        deps = [deps];
      }
      let promisechain = Promise.resolve();
      let waiting = false;
      let isAsync = false;
      const allDeps = [];
      if (deps.length > 1) {
        for (let dep of deps) {
          const loadStatement = dep;
          // determine if we need this dependency in this environment
          // this also cleans the dependency string of the condition
          dep = Doh.__parseAndFilterForLoadConditions(dep);
          if (!dep) {
            continue;
          }

          // at this point, we have a dependency that we need to load
          Doh.Loading[loadStatement] = Doh.parse_load_statement(loadStatement);
          Doh.Loading[loadStatement].loaded_by = module_name;

          // Doh.Loaded[loadStatement] = '';

          waiting = Doh.__parseAndFilterForAwaitStatement(dep);
          if (waiting) {
            dep = waiting;
            // if we are waiting, we need this promise to be added to the promisechain, not the all block
            promisechain = promisechain.then(async () => {
              let result = await Doh.__load_dependency(loadStatement, relpath, forceReload);
              Doh.Loaded[loadStatement] = result;
              return result;
            });
            continue;
          }

          isAsync = Doh.__parseAndFilterForAsyncStatement(dep);
          if (isAsync) {
            dep = isAsync;
            // if this is async, then start loading it right away and don't wait for it to finish
            let result = Doh.__load_dependency(loadStatement, relpath, forceReload);
            // in order to fix Loaded, we need to resolve it in a timeout so it doesn't block the chain
            setTimeout(async () => {
              Doh.Loaded[loadStatement] = await result;
            }, 0);
            continue;
          }

          // if we are not waiting, we can add this promise to the all block
          allDeps.push(loadStatement);
        }
        // add the async dependencies to the promise chain
        // use map so that the promises aren't even started until after the chain is done
        return promisechain.then(
          async () => await Promise.all(
            allDeps.map(
              loadStatement => {
                let result = Doh.__load_dependency(
                  loadStatement,
                  relpath,
                  forceReload
                );
                // in order to fix Loaded, we need to resolve it in a timeout so it doesn't block the chain
                setTimeout(async () => {
                  Doh.Loaded[loadStatement] = await result;
                }, 0);
                return result;
              }
            )
          )
        ).catch(e => {
          throw new Error(`Doh: Error loading (promise chain catch): ${relpath ? relpath + ' ' : ''}${module_name ? module_name + ' ' : ''}\nDEPS:\n${deps.join(', ')}\nALL DEPS:\n${allDeps.join(', ')}\n${e}`);
        });
      } else if (deps.length === 1) {
        let loadStatement = deps[0];
        // determine if we need this dependency in this environment
        // this also cleans the dependency string of the condition
        loadStatement = Doh.__parseAndFilterForLoadConditions(loadStatement);
        if (!loadStatement) {
          return true;
        }

        // at this point, we have a dependency that we need to load
        Doh.Loading[loadStatement] = Doh.parse_load_statement(loadStatement);
        Doh.Loading[loadStatement].loaded_by = module_name;

        Doh.Loaded[loadStatement] = await Doh.__load_dependency(loadStatement, relpath, forceReload);
        return Doh.Loaded[loadStatement];
      } else {
        // no deps left after conditions, return true
        return true;
      }
    },
    reload: async function (deps, relpath, module_name) {
      return Doh.load(deps, relpath, module_name, Date.now());
    },
    parse_load_statement: function (loadStatement) {
      let dep_obj;
      let dep = loadStatement;

      let decorators = {
        conditions: Doh.__parseLoadConditionsIntoArray(dep),
        optional: Doh.__parseAndFilterForOptionalStatement(dep) ? true : false,
        global: Doh.__parseAndFilterForGlobalStatement(dep) ? true : false,
        await: Doh.__parseAndFilterForAwaitStatement(dep) ? true : false,
        async: Doh.__parseAndFilterForAsyncStatement(dep) ? true : false,
      };

      dep = Doh.__parseAndFilterForLoadConditions(dep, true)

      if (Doh.__loadStatementIsNativeImport(dep)) {
        dep_obj = Doh.__parseImportStatement(dep);
      } else {
        dep_obj = Doh.__parseLoaderTypeStatement(dep);
      }
      return { ...decorators, ...dep_obj, statement: loadStatement };
    },
    expand_dependencies: function (dep, packages = Doh.Packages) {
      let all_conditions = false;
      // if the last argument is `true`, then we are to include all conditions
      if (IsTrue(arguments[arguments.length - 1])) {
        all_conditions = true;
      }
      if (NotObjectObject(packages)) packages = Doh.Packages;
      // given a starting dependency, make an array of all dependencies
      // this is a recursive function that will call itself for each dependency
      // it will also check if a dependency has already been added to the list
      const deps = [];
      const add_dep = function (dep) {
        dep = Doh.__parseAndFilterForLoadConditions(dep, all_conditions);
        if (!dep) return;
        dep = Doh.parseAndRemoveLoadDecorators(dep);
        if (!dep) return;
        if (deps.includes(dep)) return;
        if (!packages[dep]) return;
        deps.push(dep);
        const reqs = packages[dep].load;
        if (reqs) {
          for (let req of reqs) {
            add_dep(req);
          }
        }
      }
      add_dep(dep);
      return deps;
    },
    expand_loadables: function (dep, packages = Doh.Packages, all_conditions = false) {
      let filter = null;
      // if the last argument is `true`, then we are to include all conditions
      if (IsTrue(arguments[arguments.length - 1])) {
        all_conditions = true;
      } else if (IsObjectObjectAndNotEmpty(all_conditions)) {
        all_conditions = true;
      } else if (IsFunction(all_conditions)) {
        filter = all_conditions;
        // effectively disable conditions in favor of the filter function
        all_conditions = true;
      }
      if (NotObjectObject(packages)) packages = Doh.Packages;
      // given a starting dependency, make an array of all dependencies
      // this is a recursive function that will call itself for each dependency
      // it will also check if a dependency has already been added to the list
      const depsSet = new Set();
      const add_dep = function (dep) {
        if (filter && !filter(dep, packages)) return;
        dep = Doh.__parseAndFilterForLoadConditions(dep, all_conditions);
        if (!dep) return;
        let from, hadType;
        if (dep.includes('>')) {
          [from, hadType] = Doh.__parseLoaderTypeStatement(dep);
        }
        dep = Doh.parseAndRemoveLoadDecorators(dep);
        if (!dep) return;

        const fullDep = dep + (hadType ? ` > ${hadType}` : '');
        if (depsSet.has(fullDep)) return;
        depsSet.add(fullDep);

        if (!packages[dep]) return;
        const reqs = packages[dep].load;
        if (reqs) {
          for (let req of reqs) {
            add_dep(req);
          }
        }
      }

      // Handle both single dependency and array of dependencies
      if (IsArray(dep)) {
        for (const d of dep) {
          add_dep(d);
        }
      } else {
        add_dep(dep);
      }

      return Array.from(depsSet);
    },
    parseAndRemoveLoadDecorators: function (dep) {
      // Extracting package names
      if (!dep) {
        console.warn(colorize('Doh: parseAndRemoveLoadDecorators called with no dependency', warn_color));
        return dep;
      }
      let parts = [];
      if (dep.includes('??')) {
        parts = dep.split('??');
      } else {
        parts = [dep];
      }
      let match = parts.length > 1 ? parts[1].trim() : parts[0].trim();
      match = match.replace(/global\s/, '')
        .replace(/await\s/, '')
        .replace(/async\s/, '')
        .replace(/optional\s/, '')
        .replace(/\s>\s(.*?)$/, '');
      return match;
    },
    __loadStatementIsNativeImport: function (dep) {
      return dep.includes(' from ') || dep.startsWith('import ');
    },
    __load_dependency: async function (loadStatement, relpath, forceReload = false) {
      let dep = loadStatement;
      // determine if we need this dependency in this environment
      // this also cleans the dependency string of the condition
      if (dep.includes("??")) dep = Doh.__parseAndFilterForLoadConditions(dep);
      if (!dep) return true;

      let ignoreFailure = false;
      if (dep.includes('optional ')) ignoreFailure = dep = Doh.__parseAndFilterForOptionalStatement(dep);

      let toglobalThis = false;
      if (dep.includes('global ')) toglobalThis = dep = Doh.__parseAndFilterForGlobalStatement(dep);

      try {
        let loadPromise;
        if (Doh.__loadStatementIsNativeImport(dep)) {
          // if it's a full import statement
          const { deconst, from, loaderType } = Doh.__parseImportStatement(dep);
          if (loaderType === 'import') {
            loadPromise = Doh.__load_esm_module(from, relpath, forceReload).then(module => (Doh.__globalize_module_exports(module, deconst, toglobalThis)));
            Doh.ModulePromises[dep] = loadPromise;
            // in order to fix Loaded, we need to resolve it in a timeout so it doesn't block the chain
            setTimeout(async () => {
              // Doh.Loaded[loadStatement] = Doh.__get_module_exports_from_deconst(await (await loadPromise), deconst);
              Doh.Loaded[loadStatement] = await (await loadPromise);
              // Doh.ModulePromises[dep] = Doh.Loaded[loadStatement];
            }, 0);
            return loadPromise;
          } else {
            console.warn('This environment does not have a loader for: ' + dep);
            return false;
          }
        } else {
          // loaderType statements are shorthand for import statements handling routing to the correct loader type
          // loaderType does not allow for deconst statements
          const { from, loaderType } = Doh.__parseLoaderTypeStatement(dep);
          // process the loader type
          loadPromise = Doh.LoaderTypes[loaderType](loadStatement, from, relpath, loaderType, forceReload);
        }

        if (ignoreFailure) {
          // For optional decorated dependencies, catch any rejections and return a resolved promise instead
          return loadPromise.catch(error => {
            console.warn(`Doh: Ignoring failure loading optional dependency: ${dep}`, error.message || error);
            return false;
          });
        } else {
          return loadPromise;
        }
      } catch (error) {
        if (ignoreFailure) {
          // If using optional decorator and an immediate error occurs, log it but continue execution
          console.warn(`Doh: Ignoring failure loading optional dependency: ${dep}`, error.message || error);
          return false;
        } else {
          // For normal dependencies or ?? conditionals, propagate the error
          return Promise.reject(error);
        }
      }
    },
    __load_esm_module: function (src, relpath, forceReload = false) {
      // function stub to be overridden
      return Promise.reject('Doh: __load_esm_module is not implemented');
    },
    __preload_doh_package_files: function (dep, relpath, forceReload = false) {
      // given a starting dependency, make an array of all dependencies
      // this is a recursive function that will call itself for each dependency
      // it will also check if a dependency has already been added to the list

      const original_dep = dep;
      const check_package_for_file = function (dep) {

        dep = Doh.__parseAndFilterForLoadConditions(dep);
        if (!dep) return;

        dep = Doh.parseAndRemoveLoadDecorators(dep);

        if (forceReload && dep === original_dep) Doh.PreloadedPackages[dep] = undefined;

        if (Doh.PreloadedPackages[dep]) return;

        const _pack = Doh.Packages[dep];

        if (_pack) {
          if (_pack.file) {
            Doh.PreloadedPackages[dep] = Doh.__load_dependency(`${_pack.file} > import`, relpath, (forceReload && dep === original_dep) ? forceReload : false);
          }
          const reqs = _pack.load;
          if (reqs) {
            for (let req of reqs) {
              check_package_for_file(req);
            }
          }
        }
      }

      check_package_for_file(dep);
    },
    __get_module_exports_from_deconst: function (mod_obj, deconst) {
      // given the module object and deconst (including wildcard, default, and named imports), return the exports
      if (deconst) {
        if (deconst.default) {
          return mod_obj.default ? mod_obj.default : mod_obj;
        }
        if (deconst.wildcard) {
          return mod_obj;
        }
        let exports = {};
        for (let { name, alias } of deconst.namedImports) {
          exports[alias || name] = mod_obj[name];
        }
        return exports;
      } else {
        // if there's only one export, return it
        // if (Object.keys(mod_obj).length === 1) {
        //   return mod_obj[Object.keys(mod_obj)[0]];
        // }
        return mod_obj;
      }
    },
    __globalize_module_exports: function (mod_obj, deconst, toglobalThis = false) {
      if (deconst) {
        for (let { name, alias } of deconst.namedImports) {
          if (toglobalThis) {
            globalThis[alias || name] = mod_obj[name];
          }
          Doh.Globals[alias || name] = mod_obj[name];
        }
        if (deconst.default) {
          if (toglobalThis) {
            globalThis[deconst.default] = mod_obj.default;
          }
          Doh.Globals[deconst.default] = mod_obj.default;
        }
        if (deconst.wildcard) {
          if (toglobalThis) {
            globalThis[deconst.wildcard.alias] = mod_obj;
          }
          Doh.Globals[deconst.wildcard.alias] = mod_obj;
        }
      } else {
        // map each export to the window
        Doh.__globalize_keys(mod_obj, toglobalThis);
      }
      return Doh.__get_module_exports_from_deconst(mod_obj, deconst);
    },
    __globalize_keys: function (globals, toglobalThis = false) {
      const processKey = (key, value) => {
        if (
          Doh.Globals[key] &&
          typeof Doh.Globals[key] === 'object' &&
          typeof value === 'object' &&
          Doh.Globals[key] !== value
        ) {
          let newval = Doh.meld_objects(Doh.Globals[key], globalThis[key], value);
          Doh.Globals[key] = newval;
          if (toglobalThis) {
            globalThis[key] = newval;
          }

        } else {
          Doh.Globals[key] = value;
          if (toglobalThis) {
            globalThis[key] = value;
          }
        }
      };

      if (IsString(globals)) {
        processKey(globals, {});
      } else {
        const keys = IsArray(globals) ? globals : Object.keys(globals);
        keys.forEach(key => processKey(key, globals[key] || {}));
      }
    },
    __update_globals: function () {

      // go through Doh.Globals and update them with the latest values from globalThis, if available
      for (let key in Doh.Globals) {
        if (
          // carefully look for defined global values
          typeof globalThis[key] !== 'undefined' &&
          (
            (
              // if the Doh.Globals value is undefined,
              typeof Doh.Globals[key] === 'undefined' ||
              // an object,
              typeof Doh.Globals[key] === 'object' ||
              // or the same type as globalThis, 
              typeof Doh.Globals[key] === typeof globalThis[key]
              // and the value is different
            ) && Doh.Globals[key] !== globalThis[key]
          )
        ) {
          // then we can just use the globalThis value
          Doh.Globals[key] = globalThis[key];
        }
      }
    },

    //MARK: Parse Statements
    __parseAndFilterForLoadConditions: function (dohDepStatement, all_conditions = false) {
      let parts = [];
      if (dohDepStatement.includes('??')) {
        parts = dohDepStatement.split('?? ');
      } else {
        return dohDepStatement;
      }
      if (parts.length === 1) {
        // no condition statement, return the whole thing
        return parts[0];
      } else {
        if (all_conditions) {
          return parts[1];
        }
        // allow for multiple conditions to be separated by &&
        const conditions = parts[0].split('&&');
        // allow for each condition to be a Doh property that is Truthy
        // allow for each condition to be prefixed with a ! to negate it
        const conditionsToCheck = conditions.map(condition => {
          let negate = false;
          if (condition.startsWith('!')) {
            negate = true;
            condition = condition.slice(1);
          }
          let value;
          if (condition.includes('.')) {
            // only allow access to the globalThis object if the condition is a dot reference
            value = Doh.parse_reference(globalThis, condition);
          } else {
            // otherwise, try for a Doh property or a module that was requested
            // value = Doh[condition] || IsPromise(Doh.ModuleWasRequested[condition]);
            value = Doh[condition] || Doh.Packages[condition];
          }
          return negate ? !value : !!value;
        });
        // if all conditions are Truthy, return the dependency
        if (conditionsToCheck.every(condition => condition)) {
          return parts[1];
        }
      }
      return null;
    },
    __parseLoadConditionsIntoArray: function (dohDepStatement) {
      let parts = [];
      if (dohDepStatement.includes('??')) {
        parts = dohDepStatement.split('?? ');
      }
      if (parts.length === 1) {
        return null;
      } else if (parts.length === 2) {
        return parts[0].split('&&');
      }
      return null;
    },
    __parseAndFilterForKeyword: function (str, keyword) {
      const keywordWithSpace = keyword + ' ';
      if (!str.includes(keywordWithSpace)) return null;

      // Count occurrences to detect multiple instances
      const regex = new RegExp(keywordWithSpace, 'g');
      const matches = str.match(regex);
      if (matches && matches.length > 1) return null; // Error state for multiple occurrences

      return str.replace(keywordWithSpace, '');
    },
    __parseAndFilterForAwaitStatement: function (dohDepStatement) {
      return Doh.__parseAndFilterForKeyword(dohDepStatement, 'await');
    },
    __parseAndFilterForAsyncStatement: function (dohDepStatement) {
      return Doh.__parseAndFilterForKeyword(dohDepStatement, 'async');
    },
    __parseAndFilterForGlobalStatement: function (dohDepStatement) {
      return Doh.__parseAndFilterForKeyword(dohDepStatement, 'global');
    },
    __parseAndFilterForOptionalStatement: function (dohDepStatement) {
      return Doh.__parseAndFilterForKeyword(dohDepStatement, 'optional');
    },
    __parseLoaderTypeStatement: function (importStatement) {
      let [from, loaderType] = importStatement.split(' > ');
      from = from.trim();
      from = Doh.parseAndRemoveLoadDecorators(from);

      if (!loaderType) {
        // get the extension of the from, without using split
        let extension;
        if (from.includes('.')) {
          extension = from.slice(from.lastIndexOf('.') + 1);
        } else {
          extension = 'default';
        }
        loaderType = Doh.LoaderTypesExtMap[extension] || Doh.LoaderTypesExtMap['default'];
      } else {
        loaderType = loaderType.trim();
      }

      return { from, loaderType };
    },
    __parseImportStatement: function (importStatement) {
      importStatement = Doh.parseAndRemoveLoadDecorators(importStatement);
      // peel the `import ` off the front, if present
      importStatement = importStatement.replace(/^import\s+/, '');

      // check for a simple import statement
      const simpleImport = importStatement.match(/^["'](.*)["']$/);
      if (simpleImport) return { from: simpleImport[1], loaderType: 'import' }

      // check for a full import statement
      const importRegex = /(.*)\s+from\s+['"](.*)['"]/;
      const match = importStatement.match(importRegex);
      if (!match) {
        Doh.warn(colorize('Doh: invalid import statement:', importStatement, warn_color));
        return;
      }

      // parse the deconst statement
      const deconst = Doh.__parseDeconstStatement(match[1].trim());
      const from = match[2];

      // set the loader type
      const loaderType = 'import';
      return { deconst, from, loaderType };

    },
    __parseDeconstStatement: function (deconstStatement) {
      const parsedStatement = {
        default: null,
        wildcard: null,
        namedImports: [],
        scopeExposure: []
      };

      // Split the statement into tokens by commas
      const tokens = deconstStatement.split(/,\s*/);

      for (const token of tokens) {
        if (token.includes('{') || token.includes('}')) {
          // Named imports
          const namedImports = token.replace(/[{}]/g, '').split(/,\s*/);
          namedImports.forEach(item => {
            if (item.includes(' as ')) {
              // Named import with alias
              let [name, alias] = item.split(/\s+as\s+/);
              name = name.trim();
              alias = alias.trim();
              parsedStatement.namedImports.push({ name, alias });
              parsedStatement.scopeExposure.push(alias);
            } else {
              // Named import without alias
              parsedStatement.namedImports.push({ name: item.trim() });
              parsedStatement.scopeExposure.push(item.trim());
            }
          });
        } else if (token.includes('*')) {
          // Wildcard import
          let [, alias] = token.split(/\s+as\s+/);
          alias = alias.trim();
          parsedStatement.wildcard = { alias };
          parsedStatement.scopeExposure.push(alias);
        } else {
          // Default import
          parsedStatement.default = token.trim();
          parsedStatement.scopeExposure.push(token.trim());
        }
      }

      return parsedStatement;
    },
    reconstructDeconstStatement: function (parsedStatement) {
      let reconstructedStatement = '';

      if (!parsedStatement) return '';

      if (parsedStatement.default) {
        reconstructedStatement += parsedStatement.default;
      }

      if (parsedStatement.wildcard) {
        if (reconstructedStatement) reconstructedStatement += ', ';
        reconstructedStatement += `* as ${parsedStatement.wildcard.alias}`;
      }

      if (parsedStatement.namedImports.length > 0) {
        if (reconstructedStatement) reconstructedStatement += ', ';
        const namedImports = parsedStatement.namedImports.map(imp => {
          return imp.alias ? `${imp.name} as ${imp.alias}` : imp.name;
        });
        reconstructedStatement += `{ ${namedImports.join(', ')} }`;
      }

      return reconstructedStatement;
    },


    //MARK: Load Patterns
    load_pattern: async function (patterns, forceReload = false) {
      if (!patterns) throw new DohError('Doh.load_pattern() called with no patterns');
      // a string is a single pattern name
      if (IsString(patterns)) patterns = [patterns];
      await Doh.load();
      // an object is an inherits tree
      if (IsObjectObject(patterns)) {
        return Doh.__loadPatternInherits(patterns, forceReload);
      }
      // an array is a list of pattern names
      for (let pattern of patterns) {
        await Doh.__loadPatternModules(pattern, forceReload);
      }
    },
    reload_pattern: async function (patterns) {
      return Doh.load_pattern(patterns, Date.now());
    },
    __loadPatternModules: async function (patternName, forceReload = false) {
      // Check if the pattern is already loaded
      if (Doh.Patterns[patternName]) {
        return;
      }

      // Get the module name for this pattern
      const moduleName = Doh.PatternModule[patternName];
      if (!moduleName) {
        console.warn(colorize(`Module not found for pattern: ${patternName}`, warn_color));
        return;
      }

      // Load the module
      try {
        await Doh.load(moduleName, '', moduleName, forceReload);
      } catch (error) {
        console.error(colorize(`Failed to load module for pattern ${patternName}:`, error, error_color));
        return;
      }

      // If the pattern is still not loaded after module load, something went wrong
      if (!Doh.Patterns[patternName]) {
        console.error(colorize(`Pattern ${patternName} not found after loading its module`, error_color));
        return;
      }

      // Process inheritances
      const pattern = Doh.Patterns[patternName];
      if (pattern.inherits) {
        // don't force reload the inherits, this would cascade and reload the whole app
        await Doh.__loadPatternInherits(pattern.inherits);
      }
    },
    __loadPatternInherits: async function (inherits, forceReload = false) {
      const loadPromises = [];

      const processInherits = (inheritObj) => {
        for (const key in inheritObj) {
          if (typeof inheritObj[key] === 'object' && inheritObj[key] !== null) {
            processInherits(inheritObj[key]);
          } else if (typeof key === 'string' && key !== 'length') {
            loadPromises.push(Doh.__loadPatternModules(key, forceReload));
          }
        }
      };

      processInherits(inherits);

      // Wait for all patterns to be loaded
      await Promise.all(loadPromises);
    },

    //MARK: HotFix
    // allow stuff to be conditionally loaded between core and modules
    // this is generally used to declare DebugMode stuff
    HotFix: async function (condition, callback) {
      // if we didn't send a callback, then the condition is the callback
      // since a function as condition is Truthy and true is the default, carry on
      if (!callback) callback = condition;
      // if the condition is Truthy
      if (condition) {
        await Doh.load('doh_js', '', 'doh_js core');
        await callback();
      }
    },

    //MARK: Module
    // a method for running a named module, with requirements
    // always process requires, wait for Doh to load, then run callback
    Module: function (module_name, requires, callback, globals) {
      //console.log('Define module:',module_name);

      let reloadedButNotReRun = false;
      // mark the module as loading with explicit false
      if (Doh.ModuleIsLoaded[module_name] != undefined) {
        // console.error(colorize('FATAL: two Doh.Module definitions for the same module:', error_color), colorize(module_name, warn_color));
        // console.warn('Doh: Module:', module_name, 'reloaded BUT NOT RE-RUN!');
        reloadedButNotReRun = true;
      }

      if (Doh.Packages[module_name]?.file) {
        // update the ModuleFile list
        Doh.ModuleFile[Doh.Packages[module_name].file] = Doh.ModuleFile[Doh.Packages[module_name].file] || [];
        Doh.ModuleFile[Doh.Packages[module_name].file].push(module_name);
      }

      // if we haven't started the performance counter, start it now
      Doh.performance.start(module_name);

      let resolver = null, rejector = null, runonce = false;
      Doh.ModuleIsLoaded[module_name] = new Promise((resolve, reject) => {
        // expose the resolver so we can resolve the promise later
        resolver = async function () {
          // if we've already run the callback, don't run it again
          if (runonce) return;
          runonce = true;

          await Doh.__ready_to_load();
          const paramMap = {}, params = [], paramsAsMap = {};
          paramsDef = Doh.Packages[module_name]?.params;
          // for each paramDef, the value will either be a string name or an object with .name and .default
          // if the name is a string, then it's the key and value of paramMap
          // if the name is an object, then it's the key and the default is the value
          // once we have paramMap, we can map the params to the callback
          // for each param in paramMap, the value will be the string name of an export or global that we want mapped locally in the callback
          if (paramsDef) {
            for (let paramNum in paramsDef) {
              let name, value, paramDefVal = paramsDef[paramNum];
              if (IsString(paramDefVal)) {
                name = paramDefVal;
                value = paramDefVal;
              } else {
                name = paramDefVal.name;
                value = paramDefVal.defaultValue;
              }
              paramMap[name] = value;
            }
            for (let key in paramMap) {
              let varToFind = paramMap[key], foundRef;

              // we put in a special handler for $ as it's a special case
              if (varToFind === '$') {
                varToFind = 'jQuery';
              }

              // if the varToFind contains a . then it's an export name and property, we need to split it
              if (IsDefined(globalThis[varToFind])) {
                foundRef = Doh.Globals[varToFind] = globalThis[varToFind];
              } else if (IsDefined(Doh.Globals[varToFind])) {
                foundRef = Doh.Globals[varToFind];
              } else {
                console.error('Doh Module:', module_name, 'missing required param:', varToFind);
              }

              // find our jQuery version
              if (varToFind === 'jQuery' && foundRef && foundRef.fn && foundRef.fn.jquery && !Doh.jQuery) {
                Doh.jQuery = jQuery;
                console.log(colorize('Doh was given jQuery version: ', text_color), jQuery.fn.jquery);
              }
              if (varToFind === 'DohPath') {
                // if we're in a module, then we need to overload the DohPath with the module's url
                foundRef = DohPath.Overload(DohPath(Doh.Packages[module_name].file));
              }
              params.push(foundRef);
              paramsAsMap[varToFind] = foundRef;
            }
          }

          // run the callback
          let result = undefined;
          if (IsFunction(callback)) result = await callback(...params);
          if (reloadedButNotReRun) {
            console.warn('Doh: Reloaded and re-ran module:', module_name);
            reloadedButNotReRun = false;
          }

          // now, if the result is undefined, then we need to pass through the params as a map
          // this effectively exports this specific module's import scope as a map
          if (NotDefined(result)) {
            result = paramsAsMap;
          }  // otherwise, the result is the return value of the callback

          Doh.performance.end(module_name);
          // resolve the promise
          resolve(result);
        }
        // reject the promise if the callback throws an error
        rejector = reject;
      });

      // check if requires is a string, if so, make it an array
      if (IsString(requires)) {
        requires = [requires];
      }

      // localize the callback we will use
      if (NotArray(requires)) {
        // if we didn't send an array, then the second argument should be the callback to run onLoad
        globals = callback;
        callback = requires;
        requires = [];
      }

      // TODO: deprecate this globalization
      // allow Doh to manage new globals so they get automatically watched:
      if (globals) Doh.__globalize_keys(globals);

      // fancy new globalizer
      // this is where we first find and prepare import references
      let paramsDef, paramMap = {};
      paramsDef = Doh.Packages[module_name]?.params;
      if (paramsDef) {
        for (let paramNum in paramsDef) {
          let name, value, paramDefVal = paramsDef[paramNum];
          if (IsString(paramDefVal)) {
            name = paramDefVal;
            value = paramDefVal;
          } else {
            name = paramDefVal.name;
            value = paramDefVal.defaultValue;
          }
          paramMap[name] = value;
        }
        for (let key in paramMap) {
          let varToFind = paramMap[key];

          // if the varToFind contains a . then it's an export name and property, we need to split it
          if (varToFind.includes('.')) {
            let [varName, varProp] = varToFind.split('.');
            if (IsDefined(globalThis[varName])) {
              Doh.Globals[varName] = globalThis[varName]
              continue;
            } else if (IsDefined(Doh.Globals[varName])) {
              continue;
            } else {
              Doh.Globals[varName] = {};
            }
          } else if (IsDefined(globalThis[varToFind])) {
            Doh.Globals[varToFind] = globalThis[varToFind];
            continue;
          } else if (IsDefined(Doh.Globals[varToFind])) {
            continue;
          } else {
            // if we didn't find a global for a simple name, then we need to make a Doh.Globals entry for it and set it to {}
            Doh.Globals[varToFind] = {};
          }
        }
      }

      // store the requirements
      Doh.ModuleRequires[module_name] = requires;
      // report that module_name requires for each requirement to populate ModuleRequiredBy
      let i = '', required = '';
      for (i in requires) {
        if (i !== 'length') {
          required = Doh.parseAndRemoveLoadDecorators(requires[i]);
          Doh.ModuleRequiredBy[required] = Doh.ModuleRequiredBy[required] || [];
          Doh.ModuleRequiredBy[required].push(module_name);
        }
      }

      // store the resolver for the module so we can resolve it when it's depended on
      Doh.ModuleWasRequested[module_name] = () => setTimeout(resolver, 0);
    },

  });
  Doh.LoadNew = async function (pattern, ...args) {
    await Doh.load_pattern(pattern);
    //TODO: in order for this to work properly, we need to scan for buildables and load their patterns as well.
    return New(pattern, ...args);
  };
  Doh.ReloadNew = async function (pattern, ...args) {
    await Doh.reload_pattern(pattern);
    return New(pattern, ...args);
  };


  //MARK: loadstatus
  Doh.loadstatus = async function () {
    console.group('Doh Load Status');

    // Create collectors for different types
    const dohModules = [];
    const esmModules = [];
    const scripts = [];
    const styles = [];

    // Process each loadable
    for (const [key, state] of Object.entries(Doh.ModulePromises)) {
      const name = Doh.parseAndRemoveLoadDecorators(key);

      if (state instanceof Promise) {
        // Race the promise against a 1s timeout to detect stuck states
        const status = await Promise.race([
          state.then(result => ['resolved', result]),
          new Promise(r => setTimeout(() => r(['stuck']), 100))
        ]);

        const stuck = status[0] === 'stuck';
        const result = status[1];

        // Categorize based on type
        if (Doh.Packages[name]?.module_name) {
          dohModules.push({
            name,
            status: stuck ? 'stuck' : `loaded`
          });
        }
        else if (key.includes(' > import') || key.includes(' from ')) {
          // ok, for imports, we also want to know if it contains doh modules
          // we can look in Doh.ModuleFile to see which modules are in this file
          const dohModulesInFile = Doh.ModuleFile[name] || [];
          const exportInfo = [];
          if (Object.keys(result || {}).length) {
            exportInfo.push(`ESM exports: ${Object.keys(result).join(', ')}`);
          }
          if (dohModulesInFile.length) {
            exportInfo.push(`Doh modules: ${dohModulesInFile.join(', ')}`);
          }
          esmModules.push({
            name,
            status: stuck ? 'stuck' : (exportInfo.length ? `${exportInfo.join(' and ')}` : 'loaded')
          });
        }
        else if (name.endsWith('.js')) {
          scripts.push({
            name,
            status: stuck ? 'stuck' : 'loaded'
          });
        }
        else if (name.endsWith('.css')) {
          styles.push({
            name,
            status: stuck ? 'stuck' : 'loaded'
          });
        }
      }
      // Already resolved
      else {
        if (Doh.Packages[name]?.module_name) {
          dohModules.push({
            name,
            status: `${Number(state).toFixed(1)}ms`
          });
        }
        else if (key.includes(' > import') || key.includes(' from ')) {
          const dohModulesInFile = Doh.ModuleFile[name] || [];
          const exportInfo = [];
          if (Object.keys(result || {}).length) {
            exportInfo.push(`ESM exports: ${Object.keys(result).join(', ')}`);
          }
          if (dohModulesInFile.length) {
            exportInfo.push(`Doh modules: ${dohModulesInFile.join(', ')}`);
          }
          esmModules.push({
            name,
            status: exportInfo.length ? `${exportInfo.join(' and ')}` : 'loaded'
          });
        }
        else if (name.endsWith('.js')) {
          scripts.push({
            name,
            status: 'loaded'
          });
        }
        else if (name.endsWith('.css')) {
          styles.push({
            name,
            status: 'loaded'
          });
        }
      }
    }

    // Output each group
    if (dohModules.length) {
      console.group('Doh Modules');
      dohModules.forEach(mod => console.log(`(${mod.status}) ${mod.name}`));
      console.groupEnd();
    }

    if (esmModules.length) {
      console.group('ESM Modules');
      esmModules.forEach(mod => console.log(`${mod.name} (${mod.status})`));
      console.groupEnd();
    }

    if (scripts.length) {
      console.group('Scripts');
      scripts.forEach(script => console.log(`(${script.status}) ${script.name}`));
      console.groupEnd();
    }

    if (styles.length) {
      console.group('Styles');
      styles.forEach(style => console.log(`(${style.status}) ${style.name}`));
      console.groupEnd();
    }

    console.groupEnd();
  };
  Doh.load_status = Doh.loadstatus;


  //MARK: Object
  (function () {
    Doh.meld_objects(Doh, {


      //MARK: NewUUID
      NewUUID: function () {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
          var r = (Math.random() * 16) | 0,
            v = c == "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      },


      //MARK: Pattern
      /**
       *  @brief Create a pattern for use in object construction
       *
       *  @param [in] name     a string pattern name
       *  @param [in] inherits a string or array of patterns to inherit from, in order
       *  @param [in] idea     a prototype object
       *  @return the created pattern
       *
       *  @details Additionally sets the value of this.pattern to 'name'.
       *  Can be called as follows:
       *   Pattern(idea);                  *[object] requires the idea to define .pattern
       *   Pattern(name);                  *[string] creates an empty 'object' pattern at Patterns[name]
       *   Pattern(name, idea);            *[string], [object] inherits must be in the idea if needed
       *   Pattern(name, inherits, idea);  *[string], [string/array], [object]
       */
      Pattern: function (name, inherits, idea) {
        // find the arguments
        if (NotString(name)) {
          // the name is the idea
          // only allow this if the idea contains its own pattern name
          idea = name;
          if (IsString(idea.pattern)) name = idea.pattern;
          else Doh.debug('Doh.Pattern(' + idea + ') tried to make a pattern with no name');

          // inherits will be in the idea.inherits
          inherits = false;
        } else if (NotString(inherits) && NotArray(inherits) && !idea) {
          // inherits is the idea
          idea = inherits;
          // inherits will be in the idea
          inherits = false;
        }
        if (!idea) idea = {};
        // otherwise the arguments are as indicated

        // allow doh to watch the pattern name and replace it if needed
        if (Doh.ApplyFixes) {
          if (Doh.WatchedPatternNames[name]) {
            idea.pattern = name = Doh.look_at_pattern_name(name);
          }
          else idea.pattern = name
        } else {
          // every pattern must know it's own key on the Patterns object
          idea.pattern = name;
        }

        // clean up the various ways that inherits may be passed
        idea.inherits = Doh.meld_into_objectobject(idea.inherits, inherits);

        // if there still aren't any inherits, at least inherit object
        if (name !== 'object') {
          //if(IsEmptyObject(idea.inherits)) idea.inherits.object = true;
          // it must have one HARD inherit
          let hasOneHardInherit = false;
          for (let i in idea.inherits) {
            if (i === 'length') continue;
            if (idea.inherits[i] === true) {
              hasOneHardInherit = true;
              break;
            }
          }
          if (!hasOneHardInherit) {
            // stash the old inherits
            let holder = Doh.meld_objects({}, idea.inherits);
            // clear the inherits
            for (let i in idea.inherits) delete idea.inherits[i];
            // set the new inherits
            Doh.meld_objects(idea.inherits, { object: true }, holder);
          }
        }

        // now that we've normalized all the inherits, report our dependencies to each PatternInheritedBy
        for (var ancestor in idea.inherits) {
          Doh.PatternInheritedBy[ancestor] = Doh.PatternInheritedBy[ancestor] || [];
          Doh.PatternInheritedBy[ancestor].push(name);
        }
        // we need to default the .moc collection here.
        // this allows a shorthand declaration of moc types that demand defaults
        // Pattern('mypattern',{moc:{myprop:'object'}}) will produce a pattern with pattern.myprop = {}
        // only Doh.MeldedTypeDefault[meld_type_name] will be defaulted
        let meld_type_name, op_def;
        for (var prop_name in idea.moc) {
          meld_type_name = idea.moc[prop_name];
          if (IsObjectObject(meld_type_name)) meld_type_name = 'DEEP';
          // find out if there is a type mismatch between what .moc thinks the property SHOULD be and what IT IS.
          op_def = Doh.getMocOpDef(meld_type_name);
          if (op_def) {
            if (IsDefined(idea[prop_name]) && !op_def.match(idea[prop_name])) {
              Doh.debug('Doh.Pattern(', idea.pattern, ').', prop_name, ' was defined in the moc as a', meld_type_name, ' but is not a', meld_type_name, '.', idea[prop_name], idea);
            }
            if (op_def === 'STATIC' && Patterns[name]) {
              // if the property is static, then we need to ensure we aren't overwriting the current static property when we could be copying it
              idea[prop_name] = Patterns[name][prop_name];
              // Static properties contain special getter/setters that need to be copied over, the property itself is just a value
              // the getter/setters are defined in the pattern's defineProperty method
              if (Patterns[name][prop_name] !== undefined) {
                // Copy the property descriptor to preserve getters/setters
                const descriptor = Object.getOwnPropertyDescriptor(Patterns[name], prop_name);
                if (descriptor) {
                  Object.defineProperty(idea, prop_name, descriptor);
                } else {
                  idea[prop_name] = Patterns[name][prop_name];
                }
              }
            }
            idea[prop_name] = idea[prop_name] || op_def.default;
          }
        }

        // store the new pattern for the builder
        Patterns[name] = idea;

        // note the new pattern's load module, if present
        // Doh.PatternModule is an object whose keys are pattern names and values are the module that created them
        // Doh.ModuleCurrentlyRunning is deprecated, lookup the module name from Doh.PatternModule
        let containing_module = Doh.PatternModule[name];
        if (containing_module) {
          Doh.ModulePatterns[containing_module] = Doh.ModulePatterns[containing_module] || [];
          Doh.ModulePatterns[containing_module].push(name);
        } else {
          Doh.ModulePatterns['runtime'] = Doh.ModulePatterns['runtime'] || [];
          Doh.ModulePatterns['runtime'].push(name);
        }

        // ApplyFixes tells us to look at pattern creation
        if (Doh.ApplyFixes) {
          // just generates a bunch of warns and stuff with a few possible fixes. Should not be used in production.
          Doh.look_at_pattern_keys(idea);
        }

        // return the new pattern
        return idea;
      },

      //MARK: RegisterInheritRule
      /**
       *  @brief Inject a pattern into the inheritance chain of affected patterns based on a relation.
       *
       *  @param [in] pattern          [string] The name of the pattern to inject.
       *  @param [in] relation         [string] The type of injection to perform ('before', 'instead', 'after').
       *  @param [in] affectedPatterns [string|array] The pattern name(s) to inject relative to.
       *  @return void
       *
       *  @details This function registers a rule to inject `pattern` into the inheritance chain
       *           of any future object whenever one of the `affectedPatterns` is encountered.
       *           The injection happens based on the specified `relation` ('before', 'instead', 'after')
       *           relative to the `affectedPatterns`.
       */
      RegisterInheritRule: function(pattern, relation, affectedPatterns) {
        // Ensure affectedPatterns is an array
        if (IsString(affectedPatterns)) {
          affectedPatterns = [affectedPatterns];
        }

        // Validate the injection relation
        if (!['before', 'instead', 'after'].includes(relation)) {
          throw new DohError(`Invalid injection relation: ${relation}. Must be 'before', 'instead', or 'after'.`);
        }

        // Validate the pattern to be injected exists (or will exist)
        // Note: We might relax this check if rules can be defined before patterns
        if (!Patterns[pattern]) {
           // Doh.warn(`RegisterInheritRule: Pattern '${pattern}' not found at registration time. Ensure it's defined before use.`);
           // For now, let's keep the error to catch potential typos early.
           // If deferred definition is needed, this check should be moved or modified.
           // throw new DohError(`RegisterInheritRule: Pattern to inject ('${pattern}') not found.`);
           console.warn(`RegisterInheritRule: Pattern '${pattern}' not found at registration time. Ensure it's defined before use.`);
        }

        // Helper to ensure a registry entry for an affected pattern is fully formed
        const ensureRegistryStructure = (targetPattern) => {
          if (!Doh.PatternInheritRules[targetPattern]) {
            Doh.PatternInheritRules[targetPattern] = {
              before: new Set(),
              instead: new Set(),
              after: new Set()
            };
          }
          return Doh.PatternInheritRules[targetPattern];
        };

        // Register the injection rule for each affected pattern
        affectedPatterns.forEach(targetPattern => {
          // Ensure the registry for the target pattern exists and has the correct structure
          const registry = ensureRegistryStructure(targetPattern);
          // Add the injecting pattern to the appropriate set based on the relation
          registry[relation].add(pattern);
        });

      },

      //MARK: mixin_pattern
      /**
       *  @brief Mix a pattern from Patterns into destination
       *  
       *  @param [in] destination [object] the object to copy onto
       *  @param [in] pattern     [string] the name of a pattern to mixin
       *  @return destination
       *  
       *  @details This is used by the builder to a mix a pattern into a new instance of an object.
       *           NOTE: will also update_meld_methods for destination ONLY IF it is already a built DohObject
       *           NOTE: mixin_pattern will not inherit a pattern onto the same object twice.
       *           NOTE: mixin_pattern will properly meld the pattern onto destination, update .inherited,
       *                 and update all melded methods, BUT it will not run or re-run any phases.
       */
      mixin_pattern: function (destination, pattern) {
        // some checking for the pattern and double-mixing
        if (Doh.ApplyFixes) {
          pattern = Doh.look_at_pattern_name(pattern);
        }
        if (Patterns[pattern]) {
          // check for invalid mixin
          if (!InstanceOf(destination, pattern)) {
            if (Patterns[pattern].pre_mixin_phase) {
              Patterns[pattern].pre_mixin_phase.call(Patterns[pattern], destination);
            }
            Doh.meld_idea_onto_prototype(destination, Patterns[pattern]);
            // this mixin type is 
            destination.inherited[pattern] = Patterns[pattern];

            // this section is only run if we are mixing into an already built object
            if (destination.machine) {
              /*
              // before we update methods, lets find out about phases that have run
              let type;
              for(let prop_name in destination.moc){
                type = destination.moc[prop_name];
                if(type === 'phase'){
                  // meld_ideas validates moc types so we don't have to.
                  if(destination.inherited[pattern][prop_name]){
                    // the newly inherited pattern has a phase
                    if(destination.machine.completed[prop_name]){
                      // the machine has already run this phase
                      // NOTE: late mixins will ignore pre_ methods on phases that have already run
                      destination.inherited[pattern][prop_name].apply(this);
                    }
                    // otherwise, now that we are mixed in, we will participate in phases
                  }
                }
              }
              */
              // we only want to update melds if the object is already built
              // inherited is only present on instances, patterns don't have it
              // and neither do plain ideas
              Doh.update_meld_methods(destination);
            }
            // clean up after ourselves on the destination
            delete destination.pre_mixin_phase;
            delete destination.mixin_phase;

            if (Patterns[pattern].mixin_phase) {
              Patterns[pattern].mixin_phase.call(Patterns[pattern], destination);
            }
          }
        } else {
          Doh.debug('Doh.mixin_pattern(', destination, ',', pattern, ') did not find the pattern');
        }
        return destination;
      },

      //MARK: extend_inherits
      /**
       *  @brief Return a collection of all ancestor dependencies for [inherits]
       *  
       *  @param [in] inherits  [string/array/object] a name, list of names, or object whose keys are a list of things to inherit
       *  @param [in] skip_core [bool] remove core dependencies from the list? Default to false.
       *  @return object-list where keys are inherited patterns
       *  
       *  @details core dependencies refers to modules that come from core modules and are therefore
       *           considered universally available. In some cases it may be useful to know how dependant
       *           a given pattern is on external patterns, rather than core ones.
       */
      extend_inherits: function (inherits, skip_core = false) {
        var extended = {}, sub_inherits = {};
        inherits = Doh.meld_into_objectobject(inherits);
        for (var pattern_name in inherits) {

          //Doh.look_at_pattern_name(pattern_name);

          if (skip_core) {
            //console.log(Doh.PatternModule[pattern_name],'spawns',pattern_name,'from',inherits);
            if (pattern_name !== 'idea') if (Doh.CorePatterns.indexOf(pattern_name) > -1) {
              //console.log('Doh.extend_inherits() is skipping core and found a core pattern:', pattern_name, 'from module:', Doh.PatternModule[pattern_name]);
              // this is a core module because the string starts with /doh_js/
              //inherits[pattern_name] = null;
              delete inherits[pattern_name]
              continue;
            }
          }

          // if the pattern is hard inherited, we need to extend and resolve it's sub-inherits
          if (inherits[pattern_name] === true) {
            if (!Patterns[pattern_name]) Doh.debug('Doh.extend_inherits() did not find pattern:', pattern_name, 'from inherits list:', inherits); // CHRIS:  Andy added this error msg, is there a better way?

            // expand the sub_inherits object into a new reference
            sub_inherits = Doh.extend_inherits(Patterns[pattern_name].inherits, skip_core);
            // resolve the expanded sub_inherits hardening
            Doh.resolve_inherits_hardening(extended, sub_inherits, skip_core);
          }
        }
        // resolve the overall inherits hardening
        Doh.resolve_inherits_hardening(extended, inherits, skip_core);
        return extended;
      },
      resolve_inherits_hardening: function (extended, inherits, skip_core) {
        // we need to isolate the various possible systems and make decisions about them
        // 1. true means the pattern is HARD inherited and will be both included as well as depended on so that it is run before us
        // 2. false means the pattern is SOFT inherited and will only be depended on so that it runs before us IF it is HARD inherited by something else
        // 3. string means the pattern is SOFT inherited and should additionally HARD inherit the string if the SOFT inheritance is HARDEND by something else
        // 4. array means the pattern is SOFT inherited and should additionally HARD inherit the values of the array if the SOFT inheritance is HARDEND by something else
        // 5. object means the pattern is SOFT inherited and should additionally NEST inherits logic from the provided object if the SOFT inheritance is HARDEND by something else
        // if the pattern is HARD inherited in the extended object, then we need to look at the inherits object for soft inherits that need to be added
        // if the pattern is SOFT inherited in the extended object, then we need to look at the inherits object for soft inherits that need to be melded into the extended object
        // if the pattern is SOFT inherited in the extended object BUT HARD inherited in the inherits object, then we need to extend the SOFT inheritance from the extended object into the extended object
        // if the pattern is NOT inherited in the extended object, then we need to look at the inherits object for soft or hard inherits that need to be melded or added to the extended object
        for (var pattern_name in inherits) {
          // determine the type of inheritance
          let inherits_type = '';
          if (inherits[pattern_name] === true) inherits_type = 'hard';
          else {
            inherits_type = 'soft';
          }
          // if the pattern is already in the extended object
          if (extended[pattern_name]) {
            // if the pattern is HARD inherited in the extended object
            if (extended[pattern_name] === true) {
              // if the pattern is SOFT inherited in the inherits object
              if (inherits_type === 'soft') {
                // we need to extend the SOFT inheritance from the inherits sub-object into the extended object
                // this is because the extended object is HARD inheriting the pattern, so it will override the SOFT inheritance
                Doh.meld_objects(extended, Doh.extend_inherits(inherits[pattern_name], skip_core));
                continue;
              }
            } else {
              // the pattern is soft inherited in the extended object

              // if the pattern is HARD inherited in the inherits object
              if (inherits_type === 'hard') {
                // we need to expand the SOFT inherits in the extended object into the extended object, since the HARD inheritance will override it
                // first we need to store the extended object's SOFT inheritance
                let holder = Doh.meld_into_objectobject(extended[pattern_name], pattern_name);
                // then we need to meld the SOFT inherits from the inherits sub-object into the extended sub-object
                Doh.meld_objects(extended, Doh.extend_inherits(holder, skip_core));

                continue;
              } else {
                // if the pattern is SOFT inherited in both the extended and the inherits object
                // we need to meld the soft inherits from the inherits sub-object into the extended sub-object
                // this is because soft inheritance can stack until it is hard inherited
                let temp = Doh.extend_inherits(pattern_name, skip_core);
                Doh.meld_objects(temp, Doh.extend_inherits(inherits[pattern_name], skip_core));
                for (let i in temp) {
                  // mark the expanded soft inheritance as false in the outer inherits list to preserve inheritance order
                  if (!extended[i]) {
                    extended[i] = false;
                  }
                }
                Doh.meld_objects(extended[pattern_name], Doh.extend_inherits(inherits[pattern_name], skip_core));
              }
            }
          } else {
            // if the pattern is NOT already in the extended object

            // if the pattern is HARD inherited in the inherits object
            if (inherits_type === 'hard') {
              // we need to add the pattern to the extended object as a HARD inheritance
              extended[pattern_name] = true;
              continue;
            } else {
              // if the pattern is SOFT inherited in the inherits object
              // we need to add the pattern to the extended object as a SOFT inheritance
              let temp = Doh.extend_inherits(pattern_name, skip_core);
              Doh.meld_objects(temp, Doh.extend_inherits(inherits[pattern_name], skip_core));
              for (let i in temp) {
                // mark the expanded soft inheritance as false in the outer inherits list to preserve inheritance order
                if (!extended[i]) extended[i] = false;
              }
              extended[pattern_name] = temp;
              continue;
            }
          }
        }

        return extended;
      },

      //MARK: PrototypeConstructor
      // MANDATORY FOR OBJECTS TO BE SINGLETON CLASSES
      /*
      PrototypeConstructor: function(baseClass=function(){}, ...args){
        // Create the intermediary class to serve as the prototype layer
        const DohClass = class extends baseClass {};
      
        // Create the final dynamic class that inherits from the intermediary class
        const DohObject = class extends DohClass {};
      
        // Create an instance of the final dynamic class
        const instance = new DohObject(...args);
      
        // Return the instance
        return instance;
      },
      */
      ProxifyPrototype: function (instance) {
        // Create a ProxyHandler for the prototype
        const ProxyHandler = {};

        // Create a Proxy for the prototype
        const ProxiedPrototype = new Proxy(instance.constructor.prototype, ProxyHandler);

        // Set the handler for the instance to the ProxyHandler
        instance.__trap__ = ProxyHandler;

        // Set the prototype of the final instance to the Proxy
        Object.setPrototypeOf(instance, ProxiedPrototype);
      },
      PrototypeConstructor: function (baseClass = function () { }, ...args) {
        // Create the intermediary class to serve as the prototype layer
        const DohClass = class extends baseClass { };

        // Create the final dynamic class that inherits from the intermediary class
        const DohObject = class extends DohClass { };

        // Create a ProxyHandler for the prototype
        const instance = new DohObject(...args);

        // Proxify the prototype
        //Doh.ProxifyPrototype(instance);

        // Return the instance
        return instance;
      },


      //MARK: New
      /**
       *  @brief Build a new Doh Object.
       *
       *  @param [in] pattern     a string or array of patterns to inherit from, in order
       *  @param [in] idea        a prototype object
       *  @param [in] phase       a string of the phase to machine to after building
       *
       *  @return the created DohObject
       *
       *  @details
       *  Can be called as follows:
       *  
       *   New([DohObject], [string]); [e.g: New(DohObject, **'phase');]       sending an already built object through New will move it through the phases
       *                                                                       to 'phase' or **'final' if none is specified.
       *  
       *   New([object]);              [e.g: New(idea);]                       requires the idea to define .pattern, machine to 'final' phase.
       *  
       *   New([string], [object]);    [e.g: New('pat', idea);]                create a DohObject from 'somepattern' then meld idea to it, machine to 'final' phase.
       *  
       *   New([array], [object]);     [e.g: New(['pat1', 'pat2'], idea);]     add 'pattern1' then 'pattern2' to .inherits and set .pattern to 'idea' before creating object
       *                                                                       and machine to final phase.
       *  
       *   New(..., [string]);         [e.g: New('pat', idea, 'aphase');]      basically, if the last argument is a string then it will be the phase we are supposed to machine to.
       * 
       */
      New: function (pattern, idea, phase) {
        var i = '';
        if (IsString(pattern)) { // if the pattern is a string,
          // then everything is normal
          // make sure idea is an object
          idea = idea || {};
          // overwrite the idea's pattern?
          // if the idea already has a pattern, stuff it onto inherits before blowing it away.
          if (IsString(idea.pattern)) if (HasValue(idea.pattern)) if (pattern !== idea.pattern) {
            // warn about needing to do this for now, since it never happens
            Doh.warn('Doh.New(', pattern, ',', idea, ',', phase, ') was sent pattern:', pattern, 'AND different idea.pattern:', idea.pattern);
            // nest the if's for speed
            // HasValue means not undefined or null or a blank string
            if (HasValue(idea.inherits)) {
              // NotObjectObject means that we need to convert it. 
              if (NotObjectObject(idea.inherits)) {
                // convert inherits from whatever it is to an object so we can add to it.
                idea.inherits = Doh.meld_into_objectobject(idea.inherits);
              }
            } else {
              // it wasn't set to something unusable, so use it or create it here
              idea.inherits = idea.inherits || {};
            }
            // add our thing to it
            idea.inherits[idea.pattern] = true;
          }
          // now that we have handled possible collisions, the last pattern passed in was the argument 'pattern'
          // which means it should be the declared pattern of this idea.
          // NOTE: this means that the Pattern() definition may be different than the proported original idea.
          //       We may need to note this in some other ways.
          idea.pattern = pattern;

        } else if (IsArray(pattern)) { // if the pattern is an array,
          // make sure idea is an object
          idea = idea || {};
          // meld_into_objectobject() the passed-in inherits (string/array/object->object)
          idea.inherits = Doh.meld_into_objectobject(idea.inherits);
          // merge pattern into idea.inherits
          i = '';
          for (i in pattern) {
            if (i === 'length') continue;
            idea.inherits[pattern[i]] = true;
          }
          // make the pattern of this idea object because this is safe.
          // object inherits from nothing and is always at the bottom of the inherits stack by default
          idea.pattern = 'object';

        } else { // pattern is the idea
          // first, this will mean that the phase is actually in the 'idea'
          phase = idea;
          // now we can make the idea from the first argument: 'pattern'
          idea = pattern;
          // now, the idea may not have a pattern
          if (!IsStringAndHasValue(idea?.pattern)) idea.pattern = 'object';
        }
        // ensure that the idea object is at least blank
        // idea can still be undefined if we New();
        idea = idea || {};
        // either a specified phase or final. final works because it's reserved.
        // since there is no 'final' phase, the machine will always keep advancing
        // even if you add more phases after phase-time and run machine again.
        if (phase === false) {
          phase = false;
        }
        else phase = phase || 'final';
        // if the idea already has a machine, just run it to the specified or final phase

        if (idea.machine) {
          // machine always returns the object
          if (phase) return idea.machine(phase);
          else return idea;
        }
        if (idea.STATEFUL_GUID) {
          // we don't want to new an object, we want to apply an idea "mask" to an existing object
          if (idea.STATEFUL_GUID in Patterns.stateful.stateful_objects) {
            return Patterns.stateful.stateful_objects[idea.STATEFUL_GUID].rehydrate(idea);
          }
        }

        // meld passed-in inherits
        // this should now contain all patterns defined in the many places that things can be added to objects
        if (idea.inherits) idea.inherits = Doh.meld_into_objectobject(idea.inherits);

        if (Doh.ApplyFixes)
          idea.pattern = Doh.look_at_pattern_name(idea.pattern);

        // the builder requires at least one pattern
        if (IsEmptyObject(idea.inherits)) {
          if (!Patterns[idea.pattern]) {
            // we could not find at least one pattern
            // default to object
            Doh.debug('New idea had no inherits AND no pattern was found, default pattern to "object"', idea);

            idea.pattern = 'object';
          }
        }

        // now that we have all the patterns defined and passed in, get the patterns that all that stuff depend on
        // collect a list of patterns by recursively crawling the pattern .inherits
        var patterns = Doh.meld_objects(Doh.extend_inherits(Patterns[idea.pattern].inherits), Doh.extend_inherits(idea.inherits));

        // add the pattern last
        if (idea.pattern) patterns[idea.pattern] = true;

        i = '';
        let singleton_pattern = false;
        let prototype_constructor = Doh.PrototypeConstructor;
        let pre_melded_constructors = [], melded_constructors = [];
        for (i in patterns) {
          // for each pattern, look for a .is_singleton property
          if (Patterns[i].is_singleton) {
            // if we find the property being true, note that this was so-far the last pattern to define it as true
            singleton_pattern = i;
          } else if (Patterns[i].is_singleton === false) {
            // if we find the property being false, note that we have no singleton pattern
            singleton_pattern = false;
          }

          // for each pattern, look for a .prototype_constructor property
          // left assign since we only want the last one
          if (Patterns[i].prototype_constructor) {
            prototype_constructor = Patterns[i].prototype_constructor;
          }

          // for each pattern, look for a .melded_constructor property
          if (Patterns[i].pre_constructor) {
            pre_melded_constructors.push(Patterns[i].pre_constructor);
          }
          if (Object.hasOwn(Patterns[i], 'constructor')) {
            melded_constructors.push(Patterns[i].constructor);
          }

        }
        // if singleton_pattern is not false, then we have a singleton pattern
        if (singleton_pattern) {
          if (InstanceOf(Patterns[singleton_pattern].is_singleton, singleton_pattern)) {
            return Patterns[singleton_pattern].is_singleton;
          }
        }

        // start with a fresh object and the container for recording inheritence
        let object, constructor_args = [], test_args = null;


        // fill constructor_args by passing it through all the pre_melded_constructors
        for (let i = 0; i < pre_melded_constructors.length; i++) {
          test_args = pre_melded_constructors[i](constructor_args);
          if (test_args && IsIterable(test_args)) constructor_args = test_args;
          test_args = false;
        }
        if (idea.pre_constructor) {
          test_args = idea.pre_constructor(constructor_args);
          if (test_args && IsIterable(test_args)) constructor_args = test_args;
          test_args = false;
        }

        if (IsArray(prototype_constructor)) {
          constructor_args = [...prototype_constructor, ...constructor_args];
          prototype_constructor = Doh.PrototypeConstructor;
        }
        object = prototype_constructor(...constructor_args);
        //let obj_proto = Object.getPrototypeOf(object);

        //obj_proto.inherited = object.inherited || {};
        object.inherited = object.inherited || {};

        //object.inherited.prototype = getAllProperties(object);
        // now that we have the object, pass it through all the melded_constructors
        for (let i = 0; i < melded_constructors.length; i++) {
          melded_constructors[i].call(object, ...constructor_args);
        }
        if (Object.hasOwn(idea, 'constructor')) idea.constructor.call(object, ...constructor_args);

        // mixin each pattern
        i = '';
        for (i in patterns) {
          if (!Patterns[i]) {
            Doh.debug('Doh.New(' + idea.pattern + ') tried to inherit from "', i, '" but it was not found, skipping it entirely.');
          }
          // only mixin patterns that are true (hard inherits)
          if (patterns[i] === true) Doh.mixin_pattern(object, i);
          // clean up soft and conditional inherits (they never got inherited)
          else delete patterns[i];
        }

        // reset the inherits property
        //obj_proto.inherits = [];
        object.inherits = [];

        // make inherits an ordered list of inherited
        i = '';
        for (i in patterns) {
          object.inherits.push(i);
        }

        // setup some stuff for DebugMode
        // (we need these to exist, even if we don't do debug mode)
        // do we need a proxy?
        var proxy = false, watch,
          // stash a reference to the original object we started making
          originalObject = object,
          // a way for our us to tell the outer set and get traps that we care about a key
          // keys are keys we care about, values must be true;
          setters = {}, getters = {},
          // local storage for loop iterators
          keys, watcher,
          // when we find the functions that watch an object, push to stack so the melder will pick it up
          set_stack = [], get_stack = [];

        // this comes before melding the idea so we can catch watched keys on the way in to apply fixes consistently
        if (Doh.ApplyFixes)
          // just generates a bunch of warns and stuff with a few possible fixes. Should not be used in production.
          Doh.look_at_pattern_keys(idea);


        //MARK: DebugMode
        // Do stuff that only happens in DebugMode
        if (Doh.DebugMode) {
          // if already true, fine, otherwise only true if DebugMode is set to 'proxy'
          proxy = proxy || (Doh.DebugMode === 'proxy' ? true : false);
          if (proxy) {
            // we need the proxy reference early, but late-binding the handlers should be fine
            originalObject.__handler__ = {};
            originalObject.__handler__.setters = setters;
            originalObject.__handler__.getters = getters;
            // since we are proxying, add the ability to watch new things here
            //originalObject.watch = watch;
            // we replace object here so that the rest of the system will use it in their closures
            object = new Proxy(originalObject, originalObject.__handler__);
          }
        }


        //MARK: machine
        // attach the object machine
        //obj_proto.machine = function(phase){
        object.machine = function (phase) {
          // allow ApplyFixes to watch the machine activate phases
          if (Doh.ApplyFixes) {
            // track when we see phases so we can mute flooding the console
            Doh.SeenPhases = Doh.SeenPhases || {};
            let watched_phase, command, command_value;
            for (watched_phase in Doh.WatchedPhases) {
              if (watched_phase === phase) {
                // note that we have seen a phase ever on any object
                Doh.SeenPhases[watched_phase] = Doh.SeenPhases[watched_phase] || {};
                // find out if we are watching phases
                command = '';
                command_value = '';
                for (command in Doh.WatchedPhases[watched_phase]) {
                  command_value = Doh.WatchedPhases[watched_phase][command];
                  switch (command) {
                    case 'rename':
                      // simply rename a phase, notify once per pattern
                      if (!Doh.SeenPhases[watched_phase][object.pattern]) Doh.warn('Watched Phase:', watched_phase, 'has been renamed to:', command_value, object);
                      phase = command_value;
                      break;
                    case 'run':
                      // run a function if we see the phase, change phase to the return of the function, notify once per pattern
                      //if(!Doh.SeenPhases[watched_phase][object.pattern]) Doh.warn('Watched Phase:',watched_phase,'will run:',command_value,object);
                      phase = command_value(object, phase);
                      break;
                    case 'log':
                    case 'warn':
                    case 'error':
                    case 'throw':
                      Doh[command]('Watched Phase:', watched_phase, 'wants to', command, ':', command_value, object);
                      break;
                  }
                }
                // now that we've run all the commands once, we have "seen" it, so we don't need to blast the console
                /// notify once per pattern that we have encountered watched phases
                Doh.SeenPhases[watched_phase][object.pattern] = true;
              }
            }
          }

          // go through the phases to the one specified, or the last
          for (let phase_name of object.moc.__.phase_order()) {
            // as long as the phase hasn't been run
            if (!object.machine.completed[phase_name]) {
              // update the phase we are on
              object.machine.phase = phase_name;
              // mark it as false to indicate that it's running
              object.machine.completed[phase_name] = false;
              // run the phase
              object[phase_name].apply(object);
              // mark it as run
              object.machine.completed[phase_name] = true;
            }
            // if this is the phase we are building to, then exit here
            if (phase_name == phase) {
              // if we are leaving the machine, sync the MOC def of the melded object
              //object.moc.__.sync_own_keys();
              // always return the object. New() relies on this.
              return object;
            }
          }
          // if we are leaving the machine, sync the MOC def of the melded object
          //object.moc.__.sync_own_keys();
          // always return the object. New() relies on this.
          return object;
        };
        // allow the machine to cleanly track completed phases
        // object.machine.completed['phase'] === IsUndefined if the phase hasn't been started
        //                                       IsFalse if the phase has been started and is currently running
        //                                       IsTrue if the phase has completed successfully
        object.machine.completed = {};

        // stash idea's inherits if any. This keeps the inherits from being messed up by the meld_ideas call
        let stashed_inherits = false;
        if (idea.inherits) {
          stashed_inherits = idea.inherits;
          delete idea.inherits;
        }

        // add the idea to the object
        Doh.meld_idea_onto_prototype(object, idea);

        // restore the stashed inherits, it is possible that we need to add the 'idea' to the inherits
        if (stashed_inherits) {
          idea.inherits = stashed_inherits;
        }

        // always reset the pattern of the instance to be the last pattern in the inherits list
        object.pattern = object.inherits[object.inherits.length - 1];

        // mark the idea as inherited
        object.inherited.idea = idea;

        // update the meld methods to include the inherited idea we just added
        Doh.update_meld_methods(object);


        //MARK: debug=proxy
        // now we can add the debug handlers, since the object is finished being constructed and is ready to go through phases
        if (Doh.DebugMode) {
          if (proxy) {
            // use a fancy melded_method to apply our stack of setters to each set call
            originalObject.__handler__.melded_set = Doh.meld_method(originalObject, set_stack);
            // define the main set trap
            originalObject.__handler__.set = function (target, prop, value) {
              // if we try and set __original__, just return target to keep us from having circular loops when looking in from the proxy
              if (prop === '__original__') return target;
              // if we have been told that there is a setter for this property
              if (target.__handler__.setters[prop]) {
                //throw Doh.error('setter stuff:',object,target,prop,value);
                // run the melded_set. Each setter will check if this is the prop it cares about
                target.__handler__.melded_set(...arguments);
              }
              // no matter what happens, run the reflected set so that the object's behavior is unaltered.
              return Reflect.set(...arguments);
            };

            // use a fancy melded_method to apply our stack of setters to each set call
            originalObject.__handler__.melded_get = Doh.meld_method(originalObject, get_stack);
            // define the main get trap
            originalObject.__handler__.get = function (target, prop) {
              // if we try and get __original__, just return target to keep us from having circular loops when looking in from the proxy
              if (prop === '__original__') return target;
              // if we have been told that there is a getter for this property
              if (target.__handler__.getters[prop]) {
                //throw Doh.error('getter stuff:',object,target,prop,receiver);
                // run the melded_get. Each getter will check if this is the prop it cares about
                target.__handler__.melded_get(...arguments);
              }
              // no matter what happens, run the reflected set so that the object's behavior is unaltered.
              return Reflect.get(...arguments);
            };
          }
        }

        if (singleton_pattern) {
          Patterns[singleton_pattern].is_singleton = object;
        }

        // run the machine to the specified phase and return the object
        if (NotFalse(phase)) return object.machine(phase);
        return object;
      },


      //MARK: Watched
      // AA: Explain how to use / where you should set these things (maybe templates belong on Doh.HotFix?) 
      WatchedPatternNames: {
        /*'pattern_name':{
            log:'message',
            warn:'message',
            error:'message',
            throw:'message',
            run:function(idea, prop, new_value){},
            rename:'to_this',
          }*/
      },
      WatchedPhases: {
        /*'phase_name':{
            log:'message',
            warn:'message',
            error:'message',
            throw:'message',
            run:function(idea, prop, new_value){},
            rename:'to_this',
          }*/
      },
      WatchedKeys: {
        /*'key':{
            log:'message',
            warn:'message',
            error:'message',
            throw:'message',
            run:function(idea, prop, new_value){},
            rename:'to_this',
            remove:'literally anything',
          }*/
      },

      WatchedKeySetters: {
        /*
        'pattern1':{
          'key1':function(object, prop, value){},
          // accept a .watch argument set for this system so there is parity between the watchers
          'key2':[prop_name, type = 'set', value_condition = IsAnything, callback],
        },
        'pattern8':{
          'key1':function(object, prop, value){},
          'key2':function(object, prop, value){},
        },
        */
      },
      WatchedKeyGetters: {
        /*
        'pattern1':{
          'key1':function(target, prop, receiver){},
          // accept a .watch argument set for this system so there is parity between the watchers
          'key1':[prop_name, type = 'get', value_condition = IsAnything, callback],
        },
        'pattern4':{
          'key1':function(target, prop, receiver){},
          'key1':function(target, prop, receiver){},
        },
        */
      },


      //MARK: look_at_pattern_keys
      /**
       *  @brief inspect and alter keys of patterns and New ideas
       *  
       *  @param [in] idea [object] to inspect for keys that need changes
       *  @return nothing
       *  
       *  @details Used by Doh.Pattern and Doh.New to watch for changed or deprecated keys
       */
      look_at_pattern_keys: function (idea) {
        let logger_method = 'warn', pattern_prop, command, command_value;
        // track when we see keys so we can mute flooding the console
        Doh.SeenKeys = Doh.SeenKeys || {};
        for (pattern_prop in Doh.WatchedKeys) {
          //idea_prop = '';
          //idea_prop = pattern_prop;
          //for(idea_prop in idea){
          //Doh.perf_counter++;
          if (NotUndefined(idea[pattern_prop])) {
            //if(idea_prop === pattern_prop){
            // note that we have seen a key ever on any object
            Doh.SeenKeys[pattern_prop] = Doh.SeenKeys[pattern_prop] || {};
            command = '';
            command_value = '';
            for (command in Doh.WatchedKeys[pattern_prop]) {
              command_value = Doh.WatchedKeys[pattern_prop][command];
              switch (command) {
                case 'log':
                case 'warn':
                case 'error':
                case 'throw':
                  if (!Doh.SeenKeys[pattern_prop][idea.pattern]) Doh[command]('WatchedKeys:', pattern_prop, 'wants to', command, ':', command_value, (idea.idealize ? idea.idealize() : idea));
                  break;
                case 'run':
                  //if(!Doh.SeenKeys[pattern_prop][idea.pattern]) Doh[logger_method]('WatchedKeys:',pattern_prop,'will run a custom command');
                  command_value(idea);
                  break;
                case 'rename':
                  if (!Doh.SeenKeys[pattern_prop][idea.pattern]) Doh[logger_method]('WatchedKeys:', pattern_prop, 'has been renamed:', command_value, (idea.idealize ? idea.idealize() : idea));
                  if (idea.moc?.[pattern_prop]) {
                    idea.moc[command_value] = idea.moc[pattern_prop];
                    //idea.moc[pattern_prop] = null;
                    delete idea.moc[pattern_prop];
                  }
                  // make our new reference to the contents
                  idea[command_value] = idea[pattern_prop];
                  break;
                case 'remove':
                  if (!Doh.SeenKeys[pattern_prop][idea.pattern]) Doh[logger_method]('WatchedKeys:', pattern_prop, 'will be removed.', (idea.idealize ? idea.idealize() : idea));
                  if (idea.moc?.[pattern_prop]) {
                    //idea.moc[pattern_prop] = null;
                    delete idea.moc[pattern_prop];
                  }
                  //idea[pattern_prop] = null;
                  delete idea[pattern_prop];
                  break;
              }
            }
            // now that we've run all the commands once, we have "seen" it, so we don't need to blast the console
            Doh.SeenKeys[pattern_prop][idea.pattern] = true;
            // we found the thing we were looking for, just bail to the next pattern_prop
            //break;
            //}
          }
        }
        return idea;
      },


      //MARK: look_at_pattern_name
      /**
       *  @brief inspect and alter a passed-in pattern name
       *  
       *  @param [in] pattern_name [string] a pattern name to inspect
       *  @return nothing
       *  
       *  @details Used by Doh.Pattern and Doh.New to watch for changed or deprecated pattern names
       */
      look_at_pattern_name: function (pattern_name) {
        //return pattern_name;
        let rtn = pattern_name, logger_method = 'warn', watched_pattern_name, command, command_value;

        for (watched_pattern_name in Doh.WatchedPatternNames) {
          if (pattern_name === watched_pattern_name) {
            // this pattern_name is watched, log it and run the list of commands to try and fix it
            command = '';
            command_value = '';
            for (command in Doh.WatchedPatternNames[pattern_name]) {
              command_value = Doh.WatchedPatternNames[pattern_name][command];
              switch (command) {
                case 'log':
                case 'warn':
                case 'error':
                case 'throw':
                  Doh[command]('WatchedPatternNames:', pattern_name, 'wants to', command, ':', command_value);
                  break;
                case 'run':
                  //Doh[logger_method]('WatchedPatternNames:',pattern_name,'will run:',command_value);
                  rtn = command_value(pattern_or_name, pattern_name, pattern);
                  break;
                case 'rename':
                  Doh[logger_method]('WatchedPatternNames:', pattern_name, 'has been renamed:', command_value);
                  // make our new reference to the contents
                  rtn = command_value;
                  break;
              }
            }
            // we found the thing we were looking for, just bail to the next pattern_name
            break;
          }
        }
        return rtn;
        //*/
      },


      //MARK: collect_buildable
      perf_counter: 0,
      collect_buildable_ideas: function (object, moc, builder, parsable_reference_from_builder) {
        let prop_name, this_prop;
        // find properties of an object that could be built
        for (prop_name in moc.__.all_properties()) {
          if (prop_name === 'prototype' || prop_name === '__proto__') continue; // sometimes these pop up. iterating 'this' is dangerous for some reason
          if (prop_name === 'inherited' || prop_name === 'built' || prop_name === 'moc') continue; // we don't want to build inherited

          this_prop = object[prop_name];

          // only allow enumerable's to be auto-built
          if (NotEnumerable(this_prop)) continue;
          //Doh.cbi_counter++;
          // Check for properties that are themselves ideas waiting to be built
          // nest the if's for speed
          // it has to exist, have .pattern, not have .machine and not have .skip_being_built.
          // check existance, check for pattern, check for if we have been built already, check for wanting to be ignored
          let melded_def_name = prop_name;
          if (IsObjectObject(moc[melded_def_name]) || (NotSet(moc[melded_def_name]) && IsObjectObject(moc['*']))) {
            // this is a special moc object, we need the collector to recurse one more time
            let use_melded_prop_name = melded_def_name;
            if (NotSet(moc[melded_def_name])) {
              // there is no moc, so we need to use the wildcard
              use_melded_prop_name = '*';
            }
            Doh.collect_buildable_ideas(this_prop, Doh.get_empowered_moc(moc.__.nest(use_melded_prop_name), this_prop), builder, parsable_reference_from_builder ? parsable_reference_from_builder + '.' + prop_name : prop_name);

          } else if (this_prop && this_prop.pattern && this_prop.pattern !== 'idea' && !this_prop.machine && !this_prop.skip_being_built) {
            // only things that are builders should have this
            //let builder_proto = Object.getPrototypeOf(builder);
            //builder_proto.built = builder.built || {};
            //builder_proto.machine_built_to = builder.machine_built_to || 'builder_phase';

            builder.built = builder.built || {};
            builder.builtFrom = builder.builtFrom || {};
            builder.machine_built_to = builder.machine_built_to || 'builder_phase';

            // tell the thing how to reference itself from it's builder (thing.builder[thing.my_property_on_builder] === thing)
            let parsed_prop_name = parsable_reference_from_builder ? parsable_reference_from_builder + '.' + prop_name : prop_name;
            this_prop.my_property_on_builder = parsed_prop_name;

            // tell the thing that we are auto building it. this allows the thing to react to being built if needed
            this_prop.builder = builder;

            // for instance, auto_building only runs to object phase. if further or 'final' phase is desired, run .machine_built(phase)
            // don't build just yet, we need to control nesting so we don't hit max execution depth
            // object[prop_name] = New(this_prop, builder.machine_built_to);
            // add our name to built. this is used to know which properties are sub-objects
            builder.built[parsed_prop_name] = object[prop_name];

            // add the property name to the builtFrom. this is used to know where the property came from
            builder.builtFrom[parsed_prop_name] = object[prop_name];
          }
        }
      },
      super_function_composer: function (that, base_func, patternName, methodName) {
        let params = Function.parameters(base_func).join(', '),
          body = 'let Super = this.super.bind(this, \'' + patternName + '\', \'' + methodName + '\'); ' + Function.body(base_func) + '',
          func = new Function(params, body);
        return func.bind(that);
      },
    });
    /* **** Doh Object Ready **** */
    window.Patterns = Doh.Globals.Patterns = Doh.Patterns;
    window.Pattern = Doh.Globals.Pattern = Doh.Pattern;
    window.New = Doh.Globals.New = Doh.New;
    /**
     *  @brief determine if an object has had a pattern mixed into it
     *  
     *  @param [in] object    [object] to search pattern inheritence
     *  @param [in] pattern   [string] name of pattern to search for
     *  @return true if object inherited pattern, otherwise false
     *  
     *  @details 
     */
    window.InstanceOf = Doh.Globals.InstanceOf = Doh.InstanceOf = function (object, pattern) {
      pattern = pattern || 'object';
      if (object) if (object.inherited) if (object.inherited[pattern]) return true;
      return false;
    }

    //MARK: idea pattern
    /**
     *  The 'idea' pattern is a special ephemeral pattern that is used when filtering object.inherited.
     *  This empty pattern allows the final, anonymous idea sent into New() to be called 'idea' and added to object.inherited.
     *  Then, later, when validation or type checking are used to understand the final idea, it validates as a Pattern.
     *  This subsequently makes it possible to reference the final idea by it's pattern name of 'idea' in object.inherited, knowing
     *    that the pattern is not techincally a pattern, any mmore than a pattern is not techincally an idea. 
     *  
     *  In other words:
     *  
     *  - Patterns are really just validated ideas with a specific name in the Patterns collection (namespace).
     *  
     *  - An idea is just an anonymous pattern.
     *  
     *  - So the "idea" pattern is just an empty placeholder for the anonymous pattern that will be sent in at the last minute.
     *  
     *  NOTE: DO NOT INHERIT THIS PATTERN
     */
    Pattern('prototype');
    Pattern('idea');

    //MARK: object pattern
    /**
     *  set the prototype for the object constructor
     */
    Pattern('object', {
      pattern: 'object',
      // define the moc types of all objects of Doh
      moc: {
        object_phase: 'phase',
        builder_phase: 'phase',
      },
      // ensure that we are the base object phase
      object_phase: function () {
        this.melded = this.moc || {};
        Doh.mimic(this, 'melded', this, 'moc');
        Object.defineProperty(this, 'melded', { enumerable: false });

        let pattern;
        // object phase needs a final chance to loop over it's properties before everyone gets to go
        for (let prop_name in this.moc) {
          // check for static properties and connect them to their respective pattern statics
          if (this.moc[prop_name] === 'STATIC') {
            // someone wanted us to eventually sync with a pattern static
            pattern = '';
            for (pattern in this.inherited) {
              if (pattern === 'idea') {
                Doh.debug("You can't set static in an idea. Nothing else will follow it.");
                continue;
              }
              // this only works if the value is not undefined
              if (NotUndefined(this.inherited[pattern][prop_name])) {
                // make me mimic the pattern static
                Doh.mimic(this, prop_name, this.inherited[pattern], prop_name);
                // no need to carry on, there can only be one pattern to claim a static or exclusive
                break;
              }
            }
          }
        }

        // Object.defineProperty(this, '__trap__', {
        //   value: this.__trap__,
        //   writable: true,
        //   enumerable: false,
        //   configurable: true
        // });
      },

      builder_phase: function () {
        //let proto = Object.getPrototypeOf(this);
        // iterate over `this`, 
        // using `this.moc` as the moc, 
        // assign `this` as the `builder`, blank reference from `builder` because the first layer is directly attached to builder
        //                          obj,  moc,      builder, parsable_reference_from_builder
        Doh.collect_buildable_ideas(this, this.moc, this, '');

        // we are building stuff, we need to be able to support it:
        // if we are in a built-chain, we need these
        if (this.built || this.builder) {
          // walk from me up the builder chain to find the method
          this.builder_method = function (method_name) {
            let bld = this.builder;
            while (bld) {
              if (IsFunction(bld[method_name]))
                return bld[method_name].bind(bld);
              bld = bld.builder;
            }
            return function () { Doh.warn('no builder method:', method_name) };
          };
          // walk from me up the builder chain to find the property
          this.builder_property = function (prop_name) {
            let bld = this.builder;
            while (bld) {
              if (IsDefined(bld[prop_name]))
                return bld[prop_name];
              bld = bld.builder;
            }
            return function () { Doh.warn('no builder property:', prop_name) };
          };
        }

        // now do the actual building
        if (this.built) {
          // me as a builder phase
          this.machine_built = function (phase) {
            // loop through the built and attempt to machine them
            let deep_this, deep_prop_name;
            for (let prop_name in this.built) {
              if (prop_name === 'length') continue;

              if (NotUndefined(this[prop_name])) {
                // if we have a property that is a valid value, attempt to build it
                this.moc.__.base(prop_name)[prop_name] = this.built[prop_name] = New(this[prop_name], phase);
              } else if (prop_name.indexOf('.') !== -1) {
                // parse ref
                ({ container: deep_this, prop: deep_prop_name } = Doh.parse_ref(this, prop_name));
                //                              obj,  deep ref,  count_back from the last reference
                //deep_this = Doh.parse_reference(this, prop_name, -1);
                // true to get back the last reference in prop_name
                //deep_prop_name = Doh.parse_reference(true, prop_name);
                // the above lets us alter the deep reference to our newly built/machined value
                // TODO: check to see if we already new'd this property
                deep_this[deep_prop_name] = this.built[prop_name] = New(this.built[prop_name], phase);
              } else {
                //this.built[prop_name] = New(this.built[prop_name], phase);
                throw Doh.error('this.built found no idea to build for supposed auto-built property:', prop_name);
              }
            }
          };
          this.machine_built(this.machine_built_to);
        }

        if (Doh.ApplyFixes) {
          this.machine.completed.parenting_phase = true;
        }
      },

      super: function (currentPattern, methodName, ...args) {
        // find out where in the pattern inheritance we are
        let patternIndex = this.inherits.indexOf(currentPattern);
        // if the currentPattern is 'idea', then the patternIndex should be the last pattern +1
        // this is because the idea is always inherited last and is not listed in the inherits array
        // since the loop below starts at the patternIndex - 1, this will effectively start at the last pattern
        if (currentPattern === 'idea') patternIndex = this.inherits.length;
        if (currentPattern === 'runtime') {
          patternIndex = this.inherits.length;
          let patternName = 'idea',
            pattern = this.inherited[patternName],
            currentObject = Doh.parse_reference(pattern, methodName);
          if (IsFunction(currentObject)) {
            //return currentObject.apply(this, args);
            return Doh.super_function_composer(this, currentObject, patternName, methodName)(...args);
          }
        }
        // loop over the patterns prior to the currentPattern
        for (let i = patternIndex - 1; i >= 0; i--) {
          let patternName = this.inherits[i],
            pattern = this.inherited[patternName],
            // parse the reference to the method we are looking for and get the currentObject from the pattern
            currentObject = Doh.parse_reference(pattern, methodName);

          if (IsFunction(currentObject)) {
            //return currentObject.apply(this, args);
            return Doh.super_function_composer(this, currentObject, patternName, methodName)(...args);
          }
        }

        return '';
      },
      supercede: function (currentPattern, methodName, ...args) {
        // find out where in the pattern inheritance we are
        let patternIndex = this.inherits.indexOf(currentPattern);
        // if the currentPattern is 'idea', then the patternIndex should be the last pattern +1
        // this is because the idea is always inherited last and is not listed in the inherits array
        // since the loop below starts at the patternIndex - 1, this will effectively start at the last pattern
        if (currentPattern === 'idea') patternIndex = this.inherits.length;
        if (currentPattern === 'runtime') {
          patternIndex = this.inherits.length;
          let patternName = 'idea',
            pattern = this.inherited[patternName],
            currentObject = Doh.parse_reference(pattern, methodName);
          if (IsFunction(currentObject)) {
            return currentObject.apply(this, args);
            //return Doh.super_function_composer(this, currentObject, patternName, methodName)(...args);
          }
        }
        // loop over the patterns prior to the currentPattern
        for (let i = patternIndex - 1; i >= 0; i--) {
          let patternName = this.inherits[i],
            pattern = this.inherited[patternName],
            // parse the reference to the method we are looking for and get the currentObject from the pattern
            currentObject = Doh.parse_reference(pattern, methodName);

          if (IsFunction(currentObject)) {
            return currentObject.apply(this, args);
            //return Doh.super_function_composer(this, currentObject, patternName, methodName)(...args);
          }
        }

        return '';
      },


      //MARK: idealize
      /**
       *  @brief reduce an object to it's 'ideal' state based on a list of
       *         patterns it inherits from
       *  
       *  @param [in] inherits [string/array/object] string or list of inherits to filter for
       *  @param [in] active   [bool] default to false to get the initial values of each key for each pattern in inherits
       *  @return a new idea containing the filtered set of keys from this
       *  
       *  @details Differs from .perspective because the list of patterns MUST be in .inherited,
       *           functions will always be ignored, and values can be retrieved from the .inherited defaults or that active object
       */
      idealize: function (inherits, active) {
        let j, new_idea = {}, which_idea;
        // default to finding the original idea
        inherits = inherits || 'idea';
        // make sure that inherits is an array
        inherits = Object.keys(Doh.meld_into_objectobject(inherits));
        // for each filter idea
        for (let i = 0; i < inherits.length; i++) {
          which_idea = inherits[i];
          j = '';
          // loop over the idea and use it to add properties from the inherited.idea
          for (j in this.inherited[which_idea]) {
            // functions should only come from the inherited.idea
            if (typeof this.inherited[which_idea][j] === 'function') {
              if (which_idea === 'idea') {
                new_idea[j] = this.inherited.idea[j];
              }
              continue;
            }
            // if we are getting active values, get them from this
            if (which_idea === 'idea' || j !== 'inherits') {
              if (active) {
                new_idea[j] = this[j];
              } else if (this.inherited[which_idea][j] !== undefined) {

                new_idea[j] = this.inherited[which_idea][j];
              }
            }
          }
          // if the idea has a funtion for it's "ideal" state, run it
          if (Patterns[which_idea])
            if (typeof Patterns[which_idea].idealize === 'function') {
              Patterns[which_idea].idealize.call(this, inherits, active, new_idea);
            }
        }
        return new_idea;
      },
      toIdea: function (inherits) {
        // try to turn this into an idea
        // compile the inherited ideas into a gimped default object
        let new_idea = {}, prop_name, prop;

        inherits = Doh.extend_inherits(inherits || Object.keys(this.inherited), true);
        for (let pattern_name in inherits) {
          prop_name = '';
          for (prop_name in this.inherited[pattern_name]) {
            prop = this[prop_name];
            new_idea[prop_name] = prop;
          }
        }
        return new_idea;
      },

      /**
       *  @brief Show properties/methods/both of a doh object filtered by 
       *         an arbitrary list of patterns
       *  
       *  @param [in] patterns [string/array/object] list of patterns to filter for
       *  @param [in] methods  Description for methods
       *  @return a new idea containing the filtered set of keys from this
       *  
       *  @details Differs from .idealize because the list of patterns does not have to be from .inherited,
       *           values retrieved are always from this rather than .inherited,
       *           and methods can be optionally included, or selected exclusively
       */
      perspective: function (patterns, methods = false, skip_core_patterns = true) {
        let prop, new_idea = {}, which_idea, pattern_object, original_patterns = patterns;

        //console.log('Doh.perspective() was sent patterns:',patterns,'and methods:',methods);
        // default to finding the original idea
        patterns = patterns || 'idea';
        if (patterns === 'idea') {
          pattern_object = this.inherited.idea;
          /*
          * ideas can introduce patterns for inheritance in: .inherits, New('pattern_name', ...), and New(['pattern_1', 'pattern_2'], ...)
          * this is also the order of signifigance
          * so pattern_2 will be the last pattern inherited.
          */
          patterns = Doh.meld_into_objectobject(patterns, pattern_object.inherits, pattern_object.pattern);
        }
        //console.log('Doh.perspective() is using',patterns,'to extend inherits.');
        // default to expanding the pattern, but skip core patterns, cause we never need those
        patterns = Object.keys(Doh.extend_inherits(patterns, skip_core_patterns));
        //console.log('Doh.perspective() found:',patterns);
        // for each filter idea
        for (let i = 0; i < patterns.length; i++) {
          which_idea = patterns[i];
          if (which_idea === 'idea') {
            pattern_object = this.inherited.idea;
          } else {
            pattern_object = Patterns[which_idea];
          }
          prop = '';
          // loop over the pattern or idea and use it to add properties to new_idea
          for (prop in pattern_object) {
            //if(which_idea !== 'object'){
            if (!methods) {
              if (typeof this[prop] !== 'function') {
                new_idea[prop] = this[prop];
              }
            } else {
              if (methods === 'both') {
                new_idea[prop] = this[prop];
              } else if (typeof this[prop] === 'function') {
                new_idea[prop] = this[prop];
              }
            }
            //}
          }
          // if it's a pattern or the idea that has a function for it's "perspective" state, then run it
          // if (pattern_object)
          //   if (typeof pattern_object.perspective === 'function') {
          //     pattern_object.perspective.call(this, patterns, methods, which_idea, pattern_object, new_idea);
          //   }
        }
        return new_idea;
      },

    });

    // Get an array of parameter names from a function
    Function.parameters = function (f) {
      // Find the parameter list in f.toString()
      var m = /function[^\(]*\(([^\)]*)\)/.exec(f.toString());
      if (!m) {
        throw new TypeError("Invalid function in parameters");
      }

      var params = m[1].split(',');
      for (var i = 0; i < params.length; i++) {
        // trim possible spaces
        params[i] = params[i].replace(/^\s*|\s*$/g, '');
      }
      return params;
    };
    Function.body = function (f) {
      // Convert the function to a string
      var functionStr = f.toString();

      // Use a regular expression to find the function body
      var bodyMatch = /{([\s\S]*)}/.exec(functionStr);
      if (!bodyMatch) {
        throw new TypeError("Invalid function in body");
      }

      // Extract the body, trim the leading and trailing whitespace
      var body = bodyMatch[1].trim();

      // Remove the first and last character if they are curly braces
      if (body.startsWith('{') && body.endsWith('}')) {
        body = body.substring(1, body.length - 1).trim();
      }

      return body;
    };


    //MARK: parenting pattern
    // AA: talk about the relationship of this to html, the role of the children array
    Pattern('parenting', 'object', {
      // list of child objects to build
      children: [],
      // extend the children array
      moc: {
        children: 'array',
      },
      object_phase: function () {
        this.builder = this.builder || 'body';

        // we are basically deprecating parent by doing this.
        Object.defineProperty(this, 'parent', {
          configurable: true,
          writable: true,
          enumerable: false,
        });
        this.parent = this.builder;

        Doh.mimic(this, 'builder', this, 'parent');
      },
      pre_builder_phase: function () {
        //let proto = Object.getPrototypeOf(this);
        // loop through the children and add them to the builder
        let child = false; //, prop_name = false;
        for (const i in this.children) {
          if (i === 'length') continue;
          this.built = this.built || {};
          this.builtFrom = this.builtFrom || {};
          child = this.children[i];
          // make ourself the builder
          this.built['children.' + i] = Doh.meld_objects(child, { builder: this });
          this.builtFrom['children.' + i] = this.built['children.' + i];
        }
      },
    });
  })();


  Doh.performance.start('Core Startup');
  Doh.performance['Core Startup_Start'] = Doh.performance.Total_Start;


  //MARK: Node/Deno
  if (IsNode() || IsDeno()) {
    if (IsNode()) {
      // we need to set up the Doh object to work in nodejs
      Object.assign(Doh, {
        // Let Doh know that we are in a nodejs environment
        nodejs: true,
        node: true,
        // this is the way that we can tell if we are nodejs *compatible*
        env: 'nodejs',
      });
      // we may also be in a Bun environment
      if (IsBun()) {
        if (IsDohRuntime()) {
          // and further, we may even be in a DohRuntime(Bun) environment
          console.log(colorize('DohRuntime(Bun)', warn_color), colorize('is running', hidden_color), colorize('Doh', 'green'), colorize('in:', hidden_color));
          Doh.DohRuntime = true;
          Doh["DohRuntime(Bun)"] = true;
        } else {
          // we are just in a plain old Bun environment
          console.log(colorize('Bun', warn_color), colorize('is running', hidden_color), colorize('Doh', 'green'), colorize('in:', hidden_color));
        }
        Doh.bun = true;
      } else {
        console.log(colorize('Node.js', warn_color), colorize('is running', hidden_color), colorize('Doh', 'green'), colorize('in:', hidden_color));
      }
    }
    if (IsDeno()) {
      console.log(colorize('Deno', warn_color), colorize('is running', hidden_color), colorize('Doh', 'green'), colorize('in:', hidden_color));
      // we need to set up the Doh object to work in Deno, which is a superset of nodejs
      Object.assign(Doh, {
        // Let Doh know that we are in nodejs
        nodejs: true,
        node: true,
        deno: true,
        env: 'deno',
      });
    }

    let fs, fsp, path, fileURLToPath, pathToFileURL, axios, YAML;
    await import("node:fs").then(mod => { fs = mod.default; fsp = fs.promises; });
    await import("node:path").then(mod => { path = mod.default; });
    await import("node:url").then(mod => { fileURLToPath = mod.fileURLToPath; pathToFileURL = mod.pathToFileURL; });
    await import("axios").then(mod => { axios = mod.default; });
    await import("yaml").then(mod => { YAML = mod.default; });

    // provide our own filepathcleaner
    filepathcleaner = function (p) { return fileURLToPath(p); }

    let LoadDohFrom;
    // a subpath to load doh from
    globalThis.LoadDohFrom = LoadDohFrom = globalThis.LoadDohFrom || process.cwd();

    console.log(colorize('  ' + LoadDohFrom, hidden_color), '\n');
    // globalThis.doh_spinner.start();

    //TODO: remove this
    // this is a legacy paramater that needs to be properly deprecated
    globalThis.dir = '.';


    // MARK: DohLogger
    if (!Doh.logger) {
      // console.log(colorize('Loading DohLogger...', header_color));

      await import('./dohlogger.js').then(mod => {
        const DohLogger = mod.default;
        Doh.logger = new DohLogger();
      });
      Doh.logger.interceptConsole();
    }

    //MARK: Nodejs overrides
    // we need to set up the Doh object to work in nodejs
    Doh.meld_deep(Doh, {
      imitate_import_meta_url: function (package_name) {
        if (!package_name) {
          console.warn(colorize('No package name provided to imitate_import_meta_url', warn_color));
          return import.meta.url;
        }
        if (!Doh.Packages[package_name]) {
          console.warn(colorize('No package found for:', warn_color), colorize(package_name, info_color));
          return import.meta.url;
        }
        return DohPath.FileURL(Doh.Packages[package_name]?.packageFile || Doh.Packages[package_name]?.file);
      },

      // Function to fetch a pod from a URL or local file
      __fetch_pod: async function (podLocation, podType) {
        let podString = '';
        if (podLocation.startsWith('http:') || podLocation.startsWith('https:')) {
          podString = await axios.get(podLocation).then(res => res.data);
        } else if (podLocation.startsWith('data:') || podLocation.startsWith('json:') || podLocation.startsWith('yaml:')) {
          if (podLocation.startsWith('yaml:')) podType = 'yaml';
          podString = podLocation.substring(podLocation.indexOf(':') + 1);
        } else {
          // if the DohPath(from_pod) does not exist, then we are done
          if (fs.existsSync(DohPath(podLocation))) {
            podString = await fsp.readFile(DohPath(podLocation), 'utf8');
          }
        }
        if (podType === 'json') {
          return JSON.parse(podString);
        } else if (podType === 'yaml') {
          return YAML.parse(podString);
        }
        return podString;
      },
      save_pod: async function (podLocation, pod) {
        // determine the podtype from the location extension
        const podType = podLocation.split('.').pop();
        delete pod.inherited;
        // if the podlocation is in the inherits array, then we need to remove it from the array
        if (pod.inherits && pod.inherits.includes(podLocation)) {
          pod.inherits = pod.inherits.filter(p => p !== podLocation);
          if (pod.inherits.length === 0) delete pod.inherits;
        }
        if (podType === 'yaml') {
          await fsp.writeFile(DohPath(podLocation), YAML.stringify(pod));
        } else {
          await fsp.writeFile(DohPath(podLocation), JSON.stringify(pod));
        }
      },
      save_pod_sync: function (podLocation, pod) {
        // determine the podtype from the location extension
        const podType = podLocation.split('.').pop();
        delete pod.inherited;
        // if the podlocation is in the inherits array, then we need to remove it from the array
        if (pod.inherits && pod.inherits.includes(podLocation)) {
          pod.inherits = pod.inherits.filter(p => p !== podLocation);
          if (pod.inherits.length === 0) delete pod.inherits;
        }
        if (podType === 'yaml') {
          fs.writeFileSync(DohPath(podLocation), YAML.stringify(pod));
        } else {
          fs.writeFileSync(DohPath(podLocation), JSON.stringify(pod));
        }
      },
      load_host_pod: async function (args_pod, force_compile = true) {
        if (Doh.pod && !force_compile) return Doh.pod;

        let compiledPod;

        // If force_compile, or no compiled pod cache, or if always_compile_pod is set, compile the host pod
        if (force_compile || args_pod?.always_compile_pod) {
          compiledPod = await this.compile_host_pod();
        } else {
          // console.log(colorize('Loading Host Pod...', header_color));
          // Try to load the compiled pod cache
          try {
            const compiledPodPath = '/.doh/compiled.pod.yaml';
            compiledPod = await Doh.fetch_pod(compiledPodPath);
            // console.log(colorize(`  Loaded compiled pod from:`, text_color), DohPath.Relative(compiledPodPath));

          } catch (error) {
            // console.warn(colorize('  No compiled pod cache found or error loading it.', warn_color));
            compiledPod = await this.compile_host_pod();
          }

          if (!compiledPod || compiledPod?.always_compile_pod) {
            // we couldn't load the compiled pod, so we need to compile it
            compiledPod = await this.compile_host_pod();
          }
        }

        // Merge args_pod if provided
        if (args_pod) {
          Doh.meld_pods(compiledPod, args_pod);
          compiledPod.inherited['args'] = args_pod;
        }
        // console.log(colorize('  Inherited Pod File Order:', text_color));
        // console.log(compiledPod.inherits?.map(path => path.startsWith('data:') ? 'data:...' : path));

        Doh.pod = compiledPod;

        if (Doh.pod.browser_pod) {
          Doh.browser_pod = Doh.pod.browser_pod;
        }

        return compiledPod;
      },
      fingerprint_pod: function (pod) {
        // fingerprint the pod
        pod.fingerprint = Doh.NewUUID(pod);
        if (pod.browser_pod) {
          pod.browser_pod.fingerprint = pod.fingerprint;
        }
      },

      compile_host_pod: async function (existingPod = { inherited: {} }) {
        // console.log(colorize('Compiling Host Pod...', header_color));
        const compiledPod = { inherited: {} };

        // 1. Start with default.pod.yaml
        try {
          const defaultPod = await Doh.build_pod('/doh_js/default.pod.yaml', compiledPod);
          Doh.meld_pods(compiledPod, defaultPod);
          //compiledPod.inherited['/doh_js/default.pod.yaml'] = defaultPod;
        } catch (error) {
          throw console.error(colorize('  Fatal error loading /doh_js/default.pod.yaml. Aborting.', error_color), colorize(error.message, warn_color));
        }


        // 2. Load pod manifest
        try {
          await fsp.mkdir(DohPath('/.doh/manifests'), { recursive: true });
          const pod_manifest = JSON.parse(await fsp.readFile(DohPath('/.doh/manifests/pod_manifest.json'), 'utf8'));
          for (const module_name in pod_manifest) {
            Doh.meld_pods(compiledPod, pod_manifest[module_name]);
            compiledPod.inherited[`__module_${module_name}`] = pod_manifest[module_name];
          }
        } catch (error) {
          console.warn(colorize('  Non-fatal error loading /.doh/manifests/pod_manifest.json. Skipping.', warn_color), colorize(error.message, info_color));
        }


        // 3. Load base pod (optional)
        try {
          Doh.meld_pods(compiledPod, await Doh.build_pod('/boot.pod.yaml', compiledPod));
        } catch (error) {
          console.warn(colorize('  Non-fatal error loading /boot.pod.yaml. Skipping.', warn_color), colorize(error.message, info_color));
        }

        try {
          Doh.meld_pods(compiledPod, await Doh.build_pod('/pod.yaml', compiledPod));
        } catch (error) {
          console.warn(colorize('  Non-fatal error loading instance /pod.yaml. Skipping.', warn_color), colorize(error.message, info_color));
        }


        // console.log(colorize('  Pod Version:', text_color), colorize(compiledPod.pod_version || 'not set', number_color));

        // pods are loaded from the compiled pod, so we need to clean it up for deployment
        Doh.clean_pod(compiledPod);

        // Now that the pod has been compiled, we need to fingerprint it and save the fingerprint to the pod and browser_pod
        Doh.fingerprint_pod(compiledPod);

        // Write the compiled pod
        try {
          await fsp.mkdir(DohPath('/.doh'), { recursive: true });
          await fsp.writeFile(DohPath('/.doh/compiled.pod.yaml'), YAML.stringify(compiledPod));
          // console.log(colorize(`  Pod Compiled to:`, text_color), DohPath.Relative('/.doh/compiled.pod.yaml'));
        } catch (error) {
          console.error(colorize('  Failed to write compiled pod:', error_color), colorize(error.message, warn_color));
        }

        // Handle browser_pod
        try {
          await fsp.mkdir(DohPath('/doh_js/manifests'), { recursive: true });
          await fsp.writeFile(DohPath('/doh_js/manifests/browser_pod.json'), JSON.stringify(compiledPod.browser_pod || {}, null, 2));
          // console.log(colorize(`  Browser pod Compiled to:`, text_color), DohPath.Relative('/doh_js/manifests/browser_pod.json'));
        } catch (error) {
          console.error(colorize('  Failed to write browser pod:', error_color), colorize(error.message, warn_color));
        }

        return compiledPod;
      },

      // provide a way to load the package manifest
      // environment deployers should provide a way to load the package manifest relative to their environment
      // this function is automatically called by Doh as needed, UNLESS you run Doh.run_packager() first.
      ingest_package_manifest: async function (from = globalThis.LoadDohFrom) {
        await Doh.load_host_pod();

        // console.log(colorize('Loading manifests...', header_color));
        Object.assign(Doh.Packages, JSON.parse(await fsp.readFile(DohPath('/doh_js/manifests/package_manifest.json', from), 'utf8')));
        // the core patterns manifest is a filter for Doh to know which patterns come from the core.
        Object.assign(Doh.CorePatterns, JSON.parse(await fsp.readFile(DohPath('/doh_js/manifests/core_patterns_manifest.json', from), 'utf8')));
        // build the patternmodule object
        Object.assign(Doh.PatternModule, JSON.parse(await fsp.readFile(DohPath('/doh_js/manifests/patterns_manifest.json', from), 'utf8')));
        Doh.performance.endlog('Core Startup');
        //console.log('  Heap size after Core Startup:', Doh.memoryUsed());
        // console.log(' ');
        DohOptions.package_manifest_is_loading = false;
        // globalThis.doh_spinner.stop();
      },
      encodeDohballHostForDohPath: function (dohballHost) {
        return encodeURIComponent(dohballHost.replace(/[^a-zA-Z0-9]/g, '_'));
      },
      fetchRemoteManifests: async function () {
        if (!Doh.pod?.dohball_host) {
          await Doh.load_host_pod();
        }
        if (!Doh.pod?.dohball_host) {
          console.warn(colorize('No dohball_host defined in host pod (pod.yaml)', warn_color));
          return {};
        }
        const dohballHosts = Array.isArray(Doh.pod.dohball_host) ? Doh.pod.dohball_host : [Doh.pod.dohball_host];
        const manifestUri = '/doh_js/manifests/dohball_manifest.json';
        //const compiledManifest = {};
        // load compiled manifest from /.doh/package_manifest.json
        // console.log(colorize('Reading local Dohball manifest...', header_color));
        let compiledManifest = await Doh.readLocalManifest();
        // ok, now we need to merge in the local dohball manifest
        // (Dohballs that we are hosting ourself or through this repo)
        const localDohballManifest = await Doh.readLocalDohballManifest();
        Doh.meld_deep(compiledManifest, localDohballManifest);
        // console.log(`  ${DohPath.Relative('/doh_js/manifests/package_manifest.json')}`);

        // console.log(colorize('Reading remote Dohball manifests...', header_color));
        for (let i in dohballHosts) {
          if (i == 'length') continue;
          const dohballHost = dohballHosts[i];
          const cacheDir = DohPath(`/.doh/${Doh.encodeDohballHostForDohPath(dohballHost)}`);
          const manifestCachePath = path.join(cacheDir, 'dohball_manifest.json');
          const metaCachePath = path.join(cacheDir, 'install.meta.json');

          try {
            await fsp.mkdir(cacheDir, { recursive: true });

            const manifestData = (await axios.get(dohballHost + manifestUri)).data;

            // Process each package
            for (const [packageName, packageData] of Object.entries(manifestData)) {
              //const installManifest = await readInstallManifest(DohPath(packageData.path));
              let definedHost;
              if (Doh.pod.dohball_install_map && Doh.pod.dohball_install_map[packageName]) {
                definedHost = Doh.pod.dohball_install_map[packageName];
              }
              if (definedHost) {
                // if the defined host is a string, use it as the dohball_host
                if (IsString(definedHost)) {
                  packageData.dohball_host = definedHost;
                }
                else if (definedHost === true) {
                  packageData.dohball_host = dohballHost;
                }
              } else if (!packageData.dohball_host) {
                // otherwise, use the host from the manifest
                packageData.dohball_host = dohballHost;
              }
              compiledManifest[packageName] = compiledManifest[packageName] || {};
              Doh.meld_deep(compiledManifest[packageName], packageData);
            }

            // Cache the manifest
            await fsp.writeFile(manifestCachePath, JSON.stringify(manifestData, null, 2));

            // Update meta information
            const metaData = {
              last_updated: new Date().toISOString(),
              dohball_host: dohballHost
            };
            await fsp.writeFile(metaCachePath, YAML.stringify(metaData));

            // console.log(colorize(`  ${dohballHost + manifestUri}`, text_color));
          } catch (error) {
            console.warn(colorize(`  Non-fatal error fetching or caching manifest from ${dohballHost}:`, warn_color), colorize(error.message, info_color));
          }
        }

        // console.log(colorize('Compiling remote Dohball manifests...', header_color));
        // write the compiled manifest to /.doh/compiled_package_manifest.json
        await fsp.writeFile(DohPath('/.doh/compiled_dohball_manifest.json'), JSON.stringify(compiledManifest, null, 2));
        // console.log(' ', DohPath.Relative('/.doh/compiled_dohball_manifest.json'));

        return compiledManifest;
      },
      readLocalManifest: async function () {
        // allow this to fail silently, returning an empty object
        try {
          return JSON.parse(await fsp.readFile(DohPath('/doh_js/manifests/package_manifest.json'), 'utf8'));
        } catch (error) {
          return {};
        }
      },
      readLocalDohballManifest: async function () {
        try {
          return JSON.parse(await fsp.readFile(DohPath('/doh_js/manifests/dohball_manifest.json'), 'utf8'));
        } catch (error) {
          return {};
        }
      },
      readInstallManifest: async function (packagePath) {
        const metaPath = path.join(packagePath, 'dohball.json');
        try {
          const content = await fsp.readFile(metaPath, 'utf8');
          return JSON.parse(content);
        } catch (error) {
          return null;
        }
      },
      readAppsYaml: async function () {
        const appsYamlPath = DohPath('/apps.yaml');
        try {
          const appsYamlContent = await fsp.readFile(appsYamlPath, 'utf8');
          if (!appsYamlContent) return { apps: {} };
          return YAML.parse(appsYamlContent);
        } catch (error) {
          //console.warn('  Non-fatal error reading apps.yaml:', error.message);
        }
        return { apps: {} };
      },
      getModulesFromApps: function (apps) {
        let modules = [];
        for (const [path, config] of Object.entries(apps)) {
          if (config.modules) {
            modules = modules.concat(Array.isArray(config.modules) ? config.modules : [config.modules]);
          }
          if (config.nodejs_modules) {
            modules = modules.concat(Array.isArray(config.nodejs_modules) ? config.nodejs_modules : [config.nodejs_modules]);
          }
        }
        return [...new Set(modules)]; // Remove duplicates
      },

      // provide a way to trigger the packager, which will keep the package manifest from being loaded by instead generating it
      run_packager: async function (pod) {
        await Doh.load_host_pod(pod);
        Doh.args_pod = pod;
        await import(DohPath.FileURL('^/auto_packager.js')).catch(error => {
          throw console.error('Doh: Error running packager:', error);
        });
        Doh.performance.end('Core Startup');
        // globalThis.doh_spinner.stop();
      },

      // LoaderTypes is a map of loader types to functions that handle them
      LoaderTypes: {
        'file': async function (loadStatement, from, relpath, loaderType, forceReload = false) {
          if (!forceReload && Doh.FileIsLoaded[from]) return Doh.FileIsLoaded[from];
          Doh.FileIsLoaded[from] = fs.readFileSync(DohPath(from), 'utf8');
          return Doh.FileIsLoaded[from];
        },
        'raw': async function (loadStatement, from, relpath, loaderType, forceReload = false) {
          if (!forceReload && Doh.RawFileIsLoaded[from]) return Doh.RawFileIsLoaded[from];
          const cleanFrom = from.replace('.rawfile', '');
          Doh.RawFileIsLoaded[from] = fs.readFileSync(DohPath(cleanFrom), 'utf8');
          return Doh.RawFileIsLoaded[from];
        },
        'json': async function (loadStatement, from, relpath, loaderType, forceReload = false) {
          if (!forceReload && Doh.JSONIsLoaded[from]) return Doh.JSONIsLoaded[from];
          Doh.JSONIsLoaded[from] = JSON.parse(fs.readFileSync(DohPath(from), 'utf8'));
          return Doh.JSONIsLoaded[from];
        },
        'yaml': async function (loadStatement, from, relpath, loaderType, forceReload = false) {
          if (!forceReload && Doh.YAMLIsLoaded[from]) return Doh.YAMLIsLoaded[from];
          Doh.YAMLIsLoaded[from] = YAML.parse(fs.readFileSync(DohPath(from), 'utf8'));
          return Doh.YAMLIsLoaded[from];
        },
        'js': async function (loadStatement, from, relpath, loaderType, forceReload = false) {
          if (!forceReload && Doh.ScriptIsLoaded[from]) return Doh.ScriptIsLoaded[from];
          Doh.ScriptIsLoaded[from] = fs.readFileSync(DohPath(from), 'utf8');
          return Doh.ScriptIsLoaded[from];
        },
        'css': async function (loadStatement, from, relpath, loaderType, forceReload = false) {
          if (!forceReload && Doh.StylesheetIsLoaded[from]) return Doh.StylesheetIsLoaded[from];
          Doh.StylesheetIsLoaded[from] = fs.readFileSync(DohPath(from), 'utf8');
          return Doh.StylesheetIsLoaded[from];
        },
      },
      // provide a way to load an ESM module, relative to nodejs environments (node, doh, deno)
      __load_esm_module: function (src, relpath, forceReload = false) {
        //console.log('Loading:',src);
        let _src = src;
        // we only need to convert the path if it is not a file URL, http, or data URL already
        if (!_src.startsWith('file://') && !_src.startsWith('http://') && !_src.startsWith('https://') && !_src.startsWith('data:')) {
          // if the path is relative, convert it to an absolute path
          _src = DohPath(_src, relpath);
          // if the path is a file that exists, convert it to a file URL
          // while sometimes convoluted, this workflow is necessary to ensure that the path is correct in all edge cases and scenarios
          if (fs.existsSync(_src)) {
            _src = pathToFileURL(_src).href;
          }
        }
        // TODO: add a way to force reload a module on nodejs side
        // if (forceReload) {
        //   _src = `${_src}?reload=${forceReload}`;
        // }

        // while seemingly redundant, this is necessary to catch all edge cases and syntax errors
        return import(_src).catch(e => {
          // we catch and handle errors because the src file is not obvious in the stack trace
          throw console.error('Doh: Error loading (esm import in nodejs):', _src, '\n', e);
        });
      },

    });



  } else if (IsBrowser()) {

    //MARK: Browser
    if (IsLocalFileBrowser()) {
      // by this point, we know that ajax and fetch are not normally available for local/relative paths
      console.log(colorize('Browser is running Doh as a local file URL from:', header_color));
    } else {
      console.log(colorize('Browser is running Doh from:', header_color));
    }

    console.log(colorize('  ' + globalThis.LoadDohFrom, hidden_color), '\n');

    // we need to set up the Doh object to work in the browser
    Doh.meld_deep(Doh, {
      // Let Doh know that we are in browser
      browser: true,
      env: 'browser',
      // show more errors and warnings, allow debug logs to throw breakpoints and most importantly...
      // Proxy DohObjects.
      DebugMode: DohDebugMode,
      // allow Doh to try and fix patterns and objects from older code
      ApplyFixes: true,

      imitate_import_meta_url: function (package_name) {
        return DohPath.FileURL(Doh.Packages[package_name]?.packageFile || Doh.Packages[package_name]?.file);
      },

      // return a promise that resolves when the document is ready and jQuery is loaded
      __ready_to_load: async function () {
        Doh.__update_globals();
        /**
         * Returns a promise that resolves when the document is ready.
         */
        return new Promise(function (resolve) {

          // EARLY JAVASCRIPT DOM PROCESSING (non-JQuery)
          // Function to run as soon as the HTML is parsed and DOM rendered.
          function DOMStart(state) {
            if (state == null) {
              state = "Unknown";
            }
            //alert('DOM State: ' + state);
          };

          // FULLY LOADED WINDOW/DOCUMENT JAVASCRIPT PROCESSING, plus JQUERY CHECK
          // TEST IF JQUERY IS LOADED (without using JQuery)
          // Function to run as soon as all resources associated with the document are ready and JQuery script files are loaded.

          let tries = 0;
          function JQueryStart(state) {
            if (state == null) {
              state = "Unknown";
            }
            //console.log('JQuery State: ' + state);

            //if (typeof window.jQuery !== 'undefined') { // Alt. Version #2 check
            if (window.jQuery) {
              // jquery is loaded...
              // alert("JQuery is loaded.");

              // JQuery is downloaded. Now use JQuery to test if
              // the document object model is fully
              // loaded again from the point of view of JQuery.
              // In most cases it is based on logic below.
              // It is possible to load this function only when the
              // DOM is ready instead of the whole document and all
              // its files are ready and run a timer to detect when 
              // "window.jQuery" above is true. That would allow you
              // to know JQuery is downloaded prior to the DOM and 
              // utilize it earlier.

              $(document).ready(function () {
                Doh.__update_globals();

                // ======== Begin JQuery Scripts ======== 

                // Resolve the promise
                resolve();

              });
            } else {
              // JQuery did not load...
              //console.log("JQuery not yet loaded...");
              // Retry every 100ms for 5 seconds
              if (tries < 50) {
                setTimeout(() => JQueryStart("Retrying..."), 100);
                tries++;
              } else {
                console.error("JQuery failed to load after 5 seconds.");
              }
            }
          };


          // OLD BROWSER PAGE LOADER: This document loading check 
          // supports older browsers, including IE4+ and many older 
          // browsers like Firefox (2006), early Chrome (2010), etc.
          // Note: "interactive" is when the document has finished
          // loading and the document has been parsed and DOM is complete,
          // but sub-resources such as scripts, images, style sheets and
          // frames are still loading. "complete" is when all resources
          // are loaded and right before the "Window.load event fires.
          // Note: "document.onreadystatechange" has support in very old
          // browsers amd may have support from IE4+, It fires as each
          // state of the docuent load process changes below. IE 4-9 only
          // supported "readyState" of "complete".

          // If the document is already loaded and those events fired, run the JQuery function above.

          if (document.readyState) {
            if (document.readyState === "complete" // IE 4-9 only knows "complete"
              || document.readyState === "loaded") {
              JQueryStart("Document fully loaded (early)");
            } else {
              // New browsers should run scripts when the HTML is
              // parsed and the DOM built. Older IE browsers will
              // not support the "DOMContentLoaded" event and instead
              // fire when complete below. This allows newer browsers
              // to fire only when the HTML DOM is ready, which happens
              // right after the readyState=interactive fires.

              if (window.addEventListener) {
                // Listen for the "DOMContentLoaded" event, which occurs
                // after "interactive" but when the HTML DOM is complete.
                // This means the DOM is ready but other resources style 
                // sheets, other scripts, images, etc. may not be.

                window.addEventListener('load', function () {
                  JQueryStart("Window fully loaded (2)");
                }, false);
                window.addEventListener('DOMContentLoaded', function () {
                  DOMStart("DOM complete (early)");
                }, false);
              } else {

                // Run the older page "onreadystatechange" for older
                // browsers. Below, runs when page resources are not
                // yet fully loaded, so set up event listeners based
                // on needs of old/new web browsers script support.
                // This fires each time the document readyState changes,
                // except in IE 4-9 that only supports "complete". Below,
                // the DOM is loaded and parsed, but adding "interactive"
                // to the condition below means other resources like CSS, 
                // images, etc may not have completed yet.
                // Note: Add "interactive" below if needing to run early 
                // scripts as soon as the DOM is complete, and do not require 
                // styles sheets, script files, images, other resources, etc.
                // Note: "interactive" fires before "DOMContentLoaded", but in 
                // IE 9 - 11 fires too early before parsing.

                var isDone = false;
                document.onreadystatechange = function () {
                  if (document.readyState === "complete" // IE 4-9 only knows "complete"
                    || document.readyState === "loaded") {
                    if (!isDone) {
                      isDone = true;
                      JQueryStart("Document fully loaded");
                    }
                  }
                  else if (document.readyState === "interactive") {
                    DOMStart("Document interactive (early)");
                  }
                };
              }
            }
          } else {
            // This is a fallback event format that works well in many older browsers.
            window.onload = function () {
              JQueryStart("Window fully loaded (1)");
            };
          };
        });
      },

      // release jQuery globals, reset_all will prevent some jquery plugins from loading.
      // use AFTER all desired jquery plugins have loaded.
      no_conflict_jQuery: function (reset_all) {
        // return jquery globals to their previous owners
        Doh.jQuery.noConflict(reset_all);
        if (reset_all) console.log(colorize('Doh: returned jQuery to version: ', text_color), jQuery.fn.jquery);
      },

      // Function to fetch a pod from a URL or local file url
      __fetch_pod: async function (podLocation, podType) {
        let podString = '';
        if (podLocation.startsWith('http:') || podLocation.startsWith('https:')) {
          try {
            podString = await fetch(podLocation).then(async res => {
              if (res.ok && podType === 'json') {
                return res.json();
              } else if (res.ok && podType === 'yaml') {
                const YAML = await Doh.load('yaml');
                return YAML.parse(await res.text());
              } else {
                console.warn(`Failed to fetch pod: ${podLocation}`);
                return '';
              }
            });
            return podString;
          } catch (e) {
            console.warn('Doh: Error fetching pod:', podLocation, '\n', e);
          }
        } else if (podLocation.startsWith('data:') || podLocation.startsWith('json:') || podLocation.startsWith('yaml:')) {
          if (podLocation.startsWith('yaml:')) podType = 'yaml';
          podString = podLocation.split(':', 2).pop();
        } else {
          try {
            podString = await fetch(DohPath(podLocation)).then(async res => {
              if (res.ok && podType === 'json') {
                return res.json();
              } else if (res.ok && podType === 'yaml') {
                const YAML = await Doh.load('yaml');
                return YAML.parse(await res.text());
              } else {
                console.warn(`Failed to fetch pod: ${podLocation}`);
                return '';
              }
            });
            return podString;
          } catch (e) {
            console.warn('Doh: Error fetching pod:', podLocation, '\n', e);
          }
        }
        if (!podString) return '';
        if (podType === 'json') {
          return JSON.parse(podString);
        } else if (podType === 'yaml') {
          return YAML.parse(podString);
        }
        return podString;
      },


      load_browser_pod: async function (args_pod) {
        // console.log(colorize('Loading Browser Pod...', header_color));

        // Compile the final pod
        const compiledPod = { inherited: {} };

        // Read the pod.yaml file
        await Doh.build_pod('/doh_js/manifests/browser_pod.json', compiledPod);

        // console.log(colorize('  Pod Version:  ', text_color), (compiledPod.pod_version || '0.0.1'));

        if (args_pod) {
          Doh.meld_pods(compiledPod, args_pod);
          compiledPod.inherited['args'] = args_pod;
        }

        Doh.pod = compiledPod;
        Doh.browser_pod = compiledPod;

        if (Doh.pod.window) {
          Doh.meld_deep(window, Doh.pod.window);
        }

        return compiledPod;
      },
      // provide a way to load the package manifest IN THE BROWSER
      // environment deployers should provide a way to load the package manifest relative to their environment
      // this function is automatically called by Doh as needed
      ingest_package_manifest: async function (from = globalThis.LoadDohFrom) {
        if (DohOptions.package_manifest_is_loading) {
          return DohOptions.package_manifest_is_loading;
        }
        DohOptions.package_manifest_is_loading = (async () => {
          if (IsLocalFileBrowser()) {
            // we can't load things, if they don't exist by now, then we just warn as much
            Doh.browser_pod = DohOptions.browser_pod || DohOptions.pod || {};
            Doh.pod = Doh.browser_pod;
            if (DohOptions && DohOptions.Packages && DohOptions.CorePatterns && DohOptions.PatternModule) {
              console.log(colorize('  Successfully found embeded package manifest, core patterns, and pattern mapping', header_color));
            } else {
              console.warn('Doh: Failed to find embeded package manifest, core patterns, or pattern module');
            }
          }
          let importManifest = {};
          let promises = [];
          try {
            if (!IsLocalFileBrowser()) {
              promises.push(Doh.load_browser_pod());
              // console.log(colorize('Downloading manifests...', header_color));
              try {
                promises.push(
                  fetch(DohPath('/doh_js/manifests/browser_esm_manifest.json', from))
                    .then(response => response.json())
                    .then(manifest => {
                      importManifest = manifest;
                      if (DohPath('/') !== window.location.origin + '/') {
                        return fetch(DohPath('/dist/esm-bundles/remote-import-map.json'))
                          .then(response => response.json())
                          .then(remoteMap => {
                            importManifest = remoteMap.imports;
                          });
                      }
                    })
                );
              } catch (e) {
                console.warn('Doh: non-fatal error fetching import map:', from, '\n', e);
              }
            }
            Doh.ImportMap.imports = Doh.ImportMap.imports || {};
            Object.assign(Doh.ImportMap.imports, importManifest);
            importManifest = Doh.ImportMap.imports;
            // add the import map to the head, if it's not already there
            let importMap = document.head.querySelector('script[type="importmap"]');
            if (!importMap) {
              importMap = document.createElement('script');
              importMap.type = 'importmap';
              importMap.textContent = JSON.stringify(Doh.ImportMap);
              document.head.appendChild(importMap);
            } else {
              // update the import map by merging our imports on top of the existing imports
              // someday this may be entirely legal
              // let existingImports = JSON.parse(importMap.textContent).imports;
              // Object.assign(existingImports, importManifest);
              // importMap.textContent = JSON.stringify({ imports: existingImports });
            }

            if (!IsLocalFileBrowser()) {
              await Promise.all([
                ...promises,
                // Load package manifest
                fetch(DohPath('/doh_js/manifests/package_manifest.json', from))
                  .then(response => response.json())
                  .then(packageManifest => {
                    Object.assign(Doh.Packages, packageManifest);
                  })
                  .catch(e => {
                    console.warn('Doh: non-fatal error fetching package manifest:', from, '\n', e);
                  }),
                
                // Load core patterns manifest
                fetch(DohPath('/doh_js/manifests/core_patterns_manifest.json', from))
                  .then(response => response.json())
                  .then(corePatternsManifest => {
                    Object.assign(Doh.CorePatterns, corePatternsManifest);
                  })
                  .catch(e => {
                    console.warn('Doh: non-fatal error fetching core patterns manifest:', from, '\n', e);
                  }),
                
                // Load patterns manifest
                fetch(DohPath('/doh_js/manifests/patterns_manifest.json', from))
                  .then(response => response.json())
                  .then(patternsManifest => {
                    Object.assign(Doh.PatternModule, patternsManifest);
                  })
                  .catch(e => {
                    console.warn('Doh: non-fatal error fetching patterns manifest:', from, '\n', e);
                  })
              ]);
            }
            Doh.performance.endlog('Core Startup');
            //console.log('  Heap size after Core Startup:', Doh.memoryUsed());

            return true; // Successfully loaded manifests
          } catch (error) {
            console.error('Error loading package manifests:', error);
            // Clear the loading flag on error so it can be retried
            DohOptions.package_manifest_is_loading = null;
            //throw error;
          }
        })();

        return DohOptions.package_manifest_is_loading;
      },

      // LoaderTypes is a map of loader types to functions that handle them
      LoaderTypes: {
        'file': async function (loadStatement, from, relpath, loaderType, forceReload = false) {
          if (!forceReload && Doh.FileIsLoaded[from]) return Doh.FileIsLoaded[from];
          return fetch(from + (forceReload ? '?reload=' + forceReload : ''), { headers: { 'Accept': 'text/plain' } }).then(response => {
            Doh.FileIsLoaded[from] = response.text();
            return Doh.FileIsLoaded[from];
          });
        },
        'raw': async function (loadStatement, from, relpath, loaderType, forceReload = false) {
          if (!forceReload && Doh.RawFileIsLoaded[from]) return Doh.RawFileIsLoaded[from];
          return fetch(from + '.rawfile' + (forceReload ? '?reload=' + forceReload : ''), { headers: { 'Accept': 'text/plain' } }).then(response => {
            Doh.RawFileIsLoaded[from] = response.text();
            return Doh.RawFileIsLoaded[from];
          });
        },
        'json': async function (loadStatement, from, relpath, loaderType, forceReload = false) {
          if (!forceReload && Doh.JSONIsLoaded[from]) return Doh.JSONIsLoaded[from];
          return Doh.ajaxPromise(from + (forceReload ? '?reload=' + forceReload : '')).then(response => {
            Doh.JSONIsLoaded[from] = response.data;
            return Doh.JSONIsLoaded[from];
          });
        },
        'yaml': async function (loadStatement, from, relpath, loaderType, forceReload = false) {
          if (!forceReload && Doh.YAMLIsLoaded[from]) return Doh.YAMLIsLoaded[from];
          return Doh.ajaxPromise(from + (forceReload ? '?reload=' + forceReload : '')).then(async response => {
            const YAML = await Doh.load('yaml');
            Doh.YAMLIsLoaded[from] = YAML.parse(response.data);
            return Doh.YAMLIsLoaded[from];
          });
        },
        'js': async function (loadStatement, from, relpath, loaderType, forceReload = false) {
          if (IsLocalFileBrowser()) {
            if (DohOptions.PreloadedScripts.includes(from)) {
              return Promise.resolve({});
            }
          }
          // if the script is already loaded, return the promise
          if (!Doh.ScriptIsLoaded[from] || forceReload) {
            if (forceReload) {
              Doh.ScriptIsLoaded[from] = undefined;
              from = `${from}?reload=${forceReload}`;
            }
            Doh.ScriptIsLoaded[from] = new Promise((resolve, reject) => {
              const script = document.createElement('script');
              script.src = DohPath(from, relpath);
              script.async = true;
              script.crossOrigin = 'anonymous';
              script.onload = () => {
                resolve(script);
              };
              script.onerror = () => reject(new Error(`Failed to load script: ${from}`));
              document.head.appendChild(script);
            });
          }

          return Doh.ScriptIsLoaded[from];
        },
        'css': async function (loadStatement, from, relpath, loaderType, forceReload = false) {
          if (IsLocalFileBrowser()) {
            if (DohOptions.PreloadedStylesheets.includes(from)) {
              return Promise.resolve({});
            }
          }
          // if the css is already loaded, return the promise
          if (!Doh.StylesheetIsLoaded[from] || forceReload) {
            // Find the existing CSS link element
            const existingLink = document.querySelector(`link[href^="${DohPath(from, relpath)}"]`);
            if (forceReload) {
              Doh.StylesheetIsLoaded[from] = undefined;
              from = `${from}?reload=${forceReload}`;
            }
            Doh.StylesheetIsLoaded[from] = new Promise((resolve, reject) => {
              const link = document.createElement('link');
              link.rel = 'stylesheet';
              link.href = DohPath(from, relpath);
              link.crossOrigin = 'anonymous';
              link.onload = () => {
                let oldLink = existingLink;
                if (oldLink) {
                  oldLink.remove();
                }
                resolve(link);
              };
              link.onerror = () => reject(new Error(`Failed to load stylesheet: ${from}`));
              // this needs to append to the end of the head to ensure it loads after all other stylesheets
              // find the last stylesheet and append after it
              const lastStyleSheet = document.head.querySelector('link[rel="stylesheet"]:last-of-type');
              if (existingLink) {
                existingLink.after(link);
                existingLink.remove();
              } else if (lastStyleSheet) lastStyleSheet.after(link);
              else document.head.appendChild(link);
            });
          }

          return Doh.StylesheetIsLoaded[from];
        },
      },

      // currently used for loading resources in the browser
      __load_esm_module: async function (src, relpath, forceReload = false) {
        //console.log('Loading:',src);
        let _src = src;
        // if the _src is a bare specifier, namespace, or package name, then we need to look it up in the import map
        // if it's NOT in the import map, then we need to build an esm.sh url and use that
        // Check if this is a bare specifier (not a path-based import)
        // Bare specifiers don't start with /, ./, ../, or contain a protocol like http:
        if (!_src.startsWith('/') && !_src.startsWith('./') && !_src.startsWith('../') && !_src.match(/^[a-zA-Z][a-zA-Z0-9+\-.]*:/)) {
          // it's a bare specifier, namespace, or package name
          // we have to get the import map from the html head (It's a script tag with type="importmap")
          let importMap = document.head.querySelector('script[type="importmap"]')?.textContent;
          if (importMap) {
            importMap = JSON.parse(importMap);
            if (!importMap.imports[_src]) {
              // build an esm.sh url
              _src = 'https://esm.sh/' + _src;
            }
          } else {
            // build an esm.sh url
            _src = 'https://esm.sh/' + _src;
          }
        } else {
          // add LoadDohFrom to all paths when we are loading from a differnt path than our origin
          if (relpath || (window.location?.origin && window.location.origin !== globalThis.LoadDohFrom)) _src = DohPath(_src, relpath);
        }
        if (forceReload) {
          _src = `${_src}?reload=${forceReload}`;
        }

        // if we make it all the way here, BUT we are in the browser and the src is a local file URL,
        // then we need to see if the file is a relative path or a path that contains the LoadDohFrom
        if (IsLocalFileBrowser()) {
          if (_src.startsWith('./') || _src.startsWith('../') || _src.startsWith('file://') || _src.startsWith('/')) {
            // it's a relative path, so we need to convert it to a path that contains the LoadDohFrom
            //Doh.warn('Doh: Loading a local file URL as a relative path:', _src);
            // debugger;
            // return Promise.resolve({});
          }
        }
        return import(_src).catch(e => {
          console.error('Doh: Error loading (esm import):');
          throw e;
        });
      },

      // this function needs to exist, but it must be replaced with a live html differ
      live_html: async function (loadStatement) {
        // this must be replaced with a live html differ
      }

    });
  }

  // special null class
  class junk { };

  Doh.Globals.LoadDohFrom = globalThis.LoadDohFrom;

  // This has to be very early.
  Doh.ReduceWarnings = !Doh.DebugMode;

  Doh.Module('deploy', function () { });
}

export default Doh;