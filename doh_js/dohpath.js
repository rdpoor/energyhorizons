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
  const convertDotNotation = (str) => str.replace(/^(\.\/)/, '^/').replace(/^\./, '^');
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

/** CUT TO ABOVE HERE FOR DEPLOY.JS */

// this allows the module to be depended on, even though it's kinda pointless
// it stop minor errors that are really irrelevant
if(typeof Doh == 'object' && typeof Doh.Module === 'function') {
  Doh.Module('dohpath', [], function(DohPath) { });
}

export default DohPath;