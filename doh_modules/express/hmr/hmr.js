Doh.Install('hmr', [
  'npm:chokidar'
])

Doh.Pod('hmr', {
  // browser pod is down-mixed to the main pod
  // i.e.: Doh.pod.hmr.enabled is the same as Doh.pod.browser_pod.hmr.enabled
  browser_pod: {
    hmr:{
      enabled: false,
      autocss: true,
      debounceTime: 300,
      loaders: [],
      highlightBeforeApply: false
    }
  }
});

// packages are a lot like modules, but have no execution context
Doh.Package('hmr', {
  load:[
    // dependencies
    'browser&&Doh.pod.hmr.enabled?? hmr_browser',
    'nodejs&&Doh.pod.hmr.enabled?? hmr_node',
  ]
});

                                  // since HMR doesn't exist, Doh will create it as a Doh.Globals object to use as an interface
Doh.Module('hmr_common', ['dataforge'], function(HMR){
    
  // Locate the file path for a package
  HMR.findPackageFileFromName = function(packageName) {
    if (!Doh.Packages || !Doh.Packages[packageName]) {
      console.warn(`HMR: Cannot find package: ${packageName}`);
      return null;
    }

    return Doh.Packages[packageName].file || Doh.Packages[packageName].packagefile || null;
  }

  // Locate the file path for a loader
  HMR.findLoaderFileFromObject = function(loaderObject) {
    if (loaderObject.loaderType === 'doh' && Doh.Packages && Doh.Packages[loaderObject.from]) {
      return HMR.findPackageFileFromName(loaderObject.from);
    }

    // if it's not a doh loader, then the path may be http/s or file:// or a DohSlash path, or a ./ or ../ relative path
    // DohPath can handle most of these cases, we just need to filter for urls
    if (loaderObject.from.startsWith('http') || loaderObject.from.startsWith('file://')) {
      return false;
    }

    // otherwise, it's a relative path and we need to convert it to a DohSlash path
    return DohPath(loaderObject.from);
  }

  HMR.findLoaderFileFromStatement = function(statement) {
    return HMR.findLoaderFileFromObject(Doh.parse_load_statement(statement));
  }
});

Doh.Module('hmr_browser', [
  // dependencies
  'hmr_common',
  'ajax',
  'html_differ',
             // Expose or attach to the global HMR interface (Doh Module params are automatically exposed)
], function (HMR) {
  // Skip HMR setup if disabled in pod config
  if (!Doh.pod.hmr?.enabled) {
    console.log('HMR is disabled. Set hmr.enabled to true in pod config to enable.');
    return;
  }
  
  // Track connected status and active loaders
  HMR.connected = false;
  HMR.activeLoaders = new Set();
  HMR.loaderHandlers = new Map();
  
  // Cache for original HTML sources for virtual DOM comparison
  HMR.htmlSourceCache = new Map();
  
  // Generate unique client ID for update tracking
  HMR.clientId = 'client_' + Math.random().toString(36).substring(2, 15);
  
  // Track update status to prevent loops
  HMR.updatingFiles = new Set();
  HMR.updateDebounceTimers = new Map();
  
  // Extend our HMR API
  Doh.meld_objects(HMR, {
    /**
     * Subscribe to updates for a specific loader
     * @param {string} loadStatement - Load statement to subscribe to
     * @param {function} handler - Callback function that receives update data
     * @returns {function} - Unsubscribe function
     */
    subscribe: function(loadStatement, handler = function() {}) {

      console.log(`HMR: Subscribing to updates for ${loadStatement}`);
      
      // Create handlers collection for this module if it doesn't exist
      if (!HMR.loaderHandlers.has(loadStatement)) {
        HMR.loaderHandlers.set(loadStatement, new Set());
      }
      
      HMR.loaderHandlers.get(loadStatement).add(handler);
      
      // Add the loader to watch list if it's not already there
      if (!HMR.activeLoaders.has(loadStatement)) {
        HMR.activeLoaders.add(loadStatement);
        // Notify server to add this loader if not already watching
        if (HMR.connected) {
          Doh.emit('hmr:add', {loaders: [loadStatement]});
        }
      }
      
      // Return unsubscribe function
      return () => {
        if (HMR.loaderHandlers.has(loadStatement)) {
          HMR.loaderHandlers.get(loadStatement).delete(handler);
          
          // If no more handlers for this loader, remove it from active loaders
          if (HMR.loaderHandlers.get(loadStatement).size === 0) {
            HMR.loaderHandlers.delete(loadStatement);
            HMR.activeLoaders.delete(loadStatement);
          }
        }
      };
    },
    
    _mimic_load: async function(loadStatement, callback) {
      if (!HMR.connected) {
        console.warn('HMR: Not connected to server, mimic_load may not work properly');
      }
      
      // Find the actual file path
      const filePath = HMR.findLoaderFileFromStatement(loadStatement);
      if (!filePath) {
        console.error(`HMR: Could not find file path for ${loadStatement}`);
        return null;
      }
      
      // Convert to DohSlash format for consistent cross-environment references
      const dohSlashPath = DohPath.DohSlash(filePath);
      
      // Create a mirror object to hold the content
      const mirror = { 
        content: null,
        _updating: false,
        _loadStatement: loadStatement,
        _filePath: dohSlashPath  // Use DohSlash path for consistent reference
      };
      
      // Load the file first if not already loaded
      try {
        await Doh.load(loadStatement);
        
        // Initialize mirror with current content
        mirror.content = Doh.Loaded[loadStatement];
        
        // Set up subscription for server updates
        HMR.subscribe(loadStatement, (updateData) => {
          // Ignore updates initiated by this client
          if (updateData.sourceId === HMR.clientId) {
            return;
          }
          
          // Flag that we're updating from server to prevent loops
          mirror._updating = true;
          
          try {
            // Update the mirror with server content
            mirror.content = Doh.Loaded[loadStatement];
            
            // Call the callback if provided
            if (callback) {
              callback(mirror.content);
            }
          } finally {
            // Clear the updating flag
            mirror._updating = false;
          }
        });
        
        // Set up observer for client-side edits
        Doh.observe(mirror, 'content', function(obj, prop, newValue) {
          // Skip if we're currently updating from server
          if (mirror._updating) return;
          
          // Skip if the value hasn't actually changed
          // if (newValue === Doh.Loaded[loadStatement]) return;
          
          // Debounce the update to prevent rapid changes
          if (HMR.updateDebounceTimers.has(loadStatement)) {
            clearTimeout(HMR.updateDebounceTimers.get(loadStatement));
          }
          
          HMR.updateDebounceTimers.set(loadStatement, setTimeout(() => {
            HMR.updateDebounceTimers.delete(loadStatement);
            
            console.log(`HMR: Sending file update for ${loadStatement} (${dohSlashPath})`);
            
            // Convert content to base64 with UTF-8 support
            const base64Content = btoa(unescape(encodeURIComponent(newValue)));
            
            // Send update to server
            if (Doh.socket) {
              Doh.socket.emit('hmr:updateFile', {
                filePath: dohSlashPath,  // Use DohSlash path for cross-environment consistency
                content: base64Content,
                sourceId: HMR.clientId
              });
            } else {
              console.error('HMR: Socket not available for sending updates');
            }
          }, Doh.pod.hmr?.debounceTime || 300));
        });
        
      } catch (error) {
        console.error(`HMR: Error loading ${loadStatement}:`, error);
      }
      
      return mirror;
    },
    
    /**
     * Check if HMR is connected to the server
     * @returns {boolean} - Connection status
     */
    isConnected: function() {
      return HMR.connected;
    },
    
    /**
     * Get list of active loaders being watched
     * @returns {Array<string>} - Array of loaders
     */
    getActiveLoaders: function() {
      if (!Doh.pod.hmr?.enabled) {
        return [];
      }
      return Array.from(HMR.activeLoaders);
    },

    pause: function() {
      if (!Doh.pod.hmr?.enabled) {
        return;
      }
      Doh.pod.hmr = Doh.pod.hmr || {};
      Doh.pod.hmr.enabled = false;
    },

    resume: function() {
      Doh.pod.hmr.enabled = true;
    },
    
    /**
     * Force a full page reload
     * @param {string} reason - Optional reason for the reload
     */
    forceReloadPage: function(reason = 'Manual reload') {
      console.log(`HMR: Forcing page reload. Reason: ${reason}`);
      window.location.reload();
    }
  });

  Doh.live_load = async function(loadStatement, callback) {
    if(IsString(loadStatement)) {
      await Doh.load(loadStatement);
      HMR.subscribe(loadStatement);
      Doh.observe(Doh.Loaded, loadStatement, function(obj, prop, value) {
        if(IsFunction(callback) && IsString(value)) callback(value);
      });
    } else {
      console.error('HMR: live_load requires a string load statement');
    }
  }
  
  /**
   * Create a two-way binding for a file that allows both receiving and sending updates
   * @param {string} loadStatement - The load statement for the file to bind
   * @param {function} [callback] - Optional callback function when the file is updated from the server
   * @returns {object} - An object with a content property that can be updated to change the file
   */
  Doh.mimic_load = async function(loadStatement, callback) {
    if(IsString(loadStatement)) {
      if(!Doh.pod.hmr?.enabled) {
        console.warn('HMR: mimic_load requires hmr.enabled to be true in pod config');
        // if hmr is disabled, just load the file and return the content
        await Doh.load(loadStatement);
        return Doh.Loaded[loadStatement];
      }
      
      return HMR._mimic_load(loadStatement, callback);
    } else {
      console.error('HMR: mimic_load requires a string load statement');
      return null;
    }
  }
  
  Doh.mimic_html = async function(loadStatement, callback) {
    if (Doh.pod.hmr?.enabled) {
      await Doh.load('html_differ');
      
      // Create a mirror that will update the file when changed
      const htmlMirror = await Doh.mimic_load(loadStatement, function(newHtmlString) {
        // This is called when the server updates the file
        
        // Apply HTML diff if we have previous HTML to compare against
        if (HMR.htmlSourceCache.has(loadStatement)) {
          const htmlDiffer = New('HtmlDiffer');
          const originalHtmlString = HMR.htmlSourceCache.get(loadStatement);
          
          // Determine the best target selector based on the HTML content
          const targetSelector = htmlDiffer._determineTargetSelector(newHtmlString, 'body');
          
          // Apply changes using compare between original and new HTML
          htmlDiffer.applyChanges(originalHtmlString, newHtmlString, targetSelector, {
            highlightBeforeApply: Doh.pod.hmr?.highlightBeforeApply || false,
          });
        }
        
        // Update the cache with the new HTML source for future comparisons
        HMR.htmlSourceCache.set(loadStatement, newHtmlString);
        
        // Call user callback if provided
        if (callback) {
          callback(newHtmlString);
        }
      });
      
      // Store the initial HTML source in our cache
      if (!HMR.htmlSourceCache.has(loadStatement)) {
        HMR.htmlSourceCache.set(loadStatement, htmlMirror.content);
      }
      
      return htmlMirror;
    } else {
      console.error('HMR: mimic_html requires hmr.enabled to be true in pod config');
      return null;
    }
  }
  
  Doh.live_html = async function(loadStatement, handlebarsUsed) {
    if (Doh.pod.hmr?.enabled) {
      await Doh.load('html_differ');
      
      // First load the HTML file
      await Doh.load(loadStatement);
      
      // Store the initial HTML source in our cache
      if (!HMR.htmlSourceCache.has(loadStatement)) {
        HMR.htmlSourceCache.set(loadStatement, Doh.Loaded[loadStatement]);
      }
      
      // Set up subscription for future updates
      Doh.live_load(loadStatement, function(newHtmlString) {
        const htmlDiffer = New('HtmlDiffer');
        const originalHtmlString = HMR.htmlSourceCache.get(loadStatement);
        
        // Determine the best target selector based on the HTML content
        const targetSelector = htmlDiffer._determineTargetSelector(newHtmlString, 'body');
        
        // Apply changes using compare between original and new HTML
        htmlDiffer.applyChanges(originalHtmlString, newHtmlString, targetSelector, {
          highlightBeforeApply: Doh.pod.hmr?.highlightBeforeApply || false,
          // reloadStylesheetsOnChange: false
        });
        
        // Update the cache with the new HTML source for future comparisons
        HMR.htmlSourceCache.set(loadStatement, newHtmlString);
      });
      // if handlebarsUsed is provided, then we need to live_load the handlebarsUsed if they 
      if(IsArray(handlebarsUsed)) {
        handlebarsUsed.forEach(hb => {
          if(hb.includes(':')) {
            const [protocol, value] = hb.split(':');
            if (Doh.Patterns.HandlebarProtocolHandler.handlers.hasOwnProperty(protocol)) {
              Doh.Patterns.HandlebarProtocolHandler.handlers[protocol](value, loadStatement);
            }
          }
        });
      }
    } else {
      console.error('HMR: live_html requires hmr.enabled to be true in pod config');
    }
  }
  
  // Initialize socket connection
  console.log('HMR: Enabled - Socket connection for monitoring will be established');
  
  // Initialize when the module loads
  initHMR();
  
  // Handle update notifications from server
  function notifyLoaderHandlers(updateData) {
    // Check if any loaders in updateData have handlers
    const loaders = Object.keys(updateData.loaders || {});
    const activeLoaders = HMR.getActiveLoaders();
    const hasHandlers = loaders.some(loader => activeLoaders.includes(loader));
    
    if (!hasHandlers) {
      console.log('HMR: No handlers found for any loaders in update');
      return;
    }
    
    console.log(`HMR: Updated ${updateData.from}`);
    
    // Call all registered handlers for this loader
    loaders.forEach(loader => {
      const handlers = HMR.loaderHandlers.get(loader);
      if(IsArray(handlers)) {
        handlers.forEach(handler => {
          try {
            handler(updateData);
        } catch (err) {
            console.error(`HMR: Error in handler for ${loader}:`, err);
          }
        });
      }
    });
  }
  
  // Create a visual indicator for reconnection status
  function showReconnectionIndicator(disconnected, reconnected = false) {
    // Remove any existing indicator
    const existingIndicator = document.getElementById('hmr-connection-indicator');
    if (existingIndicator) {
      existingIndicator.remove();
    }
    
    // If we're not in a state that needs an indicator, just return
    if (!disconnected && !reconnected) return;
    
    // Create new indicator
    const indicator = document.createElement('div');
    indicator.id = 'hmr-connection-indicator';
    
    // Set styles based on connection state
    const styles = {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      padding: '10px 15px',
      borderRadius: '4px',
      color: 'white',
      fontFamily: 'Arial, sans-serif',
      fontSize: '14px',
      fontWeight: 'bold',
      zIndex: '10000',
      transition: 'opacity 0.3s ease',
      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)'
    };
    
    if (disconnected) {
      styles.backgroundColor = '#e74c3c'; // Red for disconnected
      indicator.textContent = 'Server disconnected. Waiting for reconnection...';
    } else if (reconnected) {
      styles.backgroundColor = '#2ecc71'; // Green for reconnected
      indicator.textContent = 'Server reconnected. Page will reload momentarily...';
    }
    
    // Apply styles
    Object.assign(indicator.style, styles);
    
    // Add to document
    document.body.appendChild(indicator);
  }
  
  // Initialize HMR connection
  function initHMR() {
    // Track server reconnection
    HMR.wasDisconnected = false;
    
    // Set up socket connection for HMR updates
    Doh.upgradeConnection(
      // onDisconnect handler
      () => {
        HMR.connected = false;
        HMR.wasDisconnected = true;
        console.log('HMR: Disconnected from server');
        showReconnectionIndicator(true);
      },
      // onError handler
      (error) => {
        console.error('HMR: Socket connection error:', error);
      },
      // onConnect/Reconnect handler
      async () => {
        HMR.connected = true;
        console.log('HMR: Connected to server');

        // await new Promise(resolve => setTimeout(resolve, 100));

        if(!Doh.socket) {
          console.error('HMR: Connected to server but socket not initialized');
          return;
        }
        
        // If this is a reconnection, reload the entire page because server cache has been reset
        if (HMR.wasDisconnected) {
          if(Doh.pod.hmr?.enabled) {
            console.log('HMR: Server reconnected after disconnect - reloading page due to server cache reset');
            showReconnectionIndicator(false, true);
            // Delay reload to show the message to the user
            setTimeout(() => {
              window.location.reload();
            }, Math.min(Doh.pod.hmr?.debounceTime, 300));
            return;
          } else {
            console.log('HMR: Server reconnected after disconnect - but HMR is disabled');
            showReconnectionIndicator(false, false);
          }
        } else {
          // Normal connection, hide indicator if exists
          showReconnectionIndicator(false, false);
        }
        
        // Subscribe to HMR updates
        Doh.socket.emit('hmr:subscribe');
        
        // Listen for HMR updates from server
        // IMPORTANT: there is a single update FOR EACH FILE, not one for each loader
        Doh.socket.on('hmr:update', (updateData) => {
          if(!Doh.pod.hmr?.enabled) {
            console.log('HMR: Received update but HMR is disabled');
            return;
          }
          const { from, loaders } = updateData;
          //console.log(`HMR: Received update for loaders`, loaders);
          // Get all loader keys and filter for those that have been loaded on this page
          const loaderKeys = Object.keys(loaders).filter(loader => {
            // Check if this loader has been loaded on the current page
            return Doh.Loading[loader] !== undefined;
          });
          
          if (loaderKeys.length === 0) {
            console.log('HMR: No loaded loaders found for this update');
          }
          
          if (loaderKeys.length > 0) {
            // Reload the loaders, the sub-systems handle caching and debouncing
            Doh.reload(loaderKeys).then(async () => {
              // Forward to appropriate handlers
              notifyLoaderHandlers(updateData);
            });
          }
        });
        
        // Listen for server requrested reload
        Doh.socket.on('hmr:reloadPage', () => {
          console.log('HMR: Received server requested page reload');
          HMR.forceReloadPage();
        });
      }
    );

    // overload the Doh.load function to add the loader to the watch list if it's a css loaderType and relative path or the origin is the same as the current page
    // Process all loaded CSS files for HMR watching
    function processLoadedCssFiles() {
      // keep track of the files we've already processed to avoid duplicates
      const processedFiles = new Set();
      Object.keys(Doh.Loading).forEach(loaderStatement => {
        const loader = Doh.Loading[loaderStatement];
        if (loader.loaderType === 'css') {
          // Only watch CSS files that are from our own origin or relative paths
          const from = DohPath(loader.from);
          // Check for absolute paths, relative paths with prefixes, full URLs from same origin,
          // or simple filenames without slashes (which are also relative paths)
          if (from.startsWith('/') || 
              from.startsWith('./') || 
              from.startsWith('../') || 
              (from.startsWith(window.location.origin)) ||
              (!from.includes('/') && !from.includes('://'))) {
            if (!processedFiles.has(from)) {
              HMR.subscribe(loaderStatement);
              processedFiles.add(from);
            }
          }
        }
      });
      // also watch any other css files that are on the page
      const cssFiles = document.querySelectorAll('link[rel="stylesheet"]');
      cssFiles.forEach(cssFile => {
        let from = DohPath(cssFile.href);
        // Check for absolute paths, relative paths with prefixes, full URLs from same origin,
        // or simple filenames without slashes (which are also relative paths)
        if (from.startsWith('/') || 
            from.startsWith('./') || 
            from.startsWith('../') || 
            (from.startsWith(window.location.origin)) ||
            (!from.includes('/') && !from.includes('://'))) {
          // ok, in this case, we need to figure out the relative path to the file
          // in order for this to work, we effectively need to resolve the path to the file
          // basically, DohPath can handle this except for the case where the path is just the filename
          // detect this case and add a ./ to the front of the path, then use DohPath to resolve it
          if(!from.includes('/')) {
            from = './' + from;
          }
          if (!processedFiles.has(from)) {
            const slashPath = DohPath.DohSlash(from);
            Doh.Loading[slashPath] = Doh.parse_load_statement(slashPath);
            Doh.Loaded[slashPath] = cssFile;
            HMR.subscribe(slashPath);
            processedFiles.add(from);
          }
        }
      });
    }

    // Process existing loaded CSS files
    if(Doh.pod.hmr?.autocss) {
      processLoadedCssFiles();
    }
    
  }
});

Doh.Module('hmr_node', [
  // dependencies
  'express_router',
  'import chokidar from "chokidar"',
  'hmr_common',
  'import fs from "fs"', // Add fs for file operations
                                       // Expose HMR interface globally (Doh Module params are automatically exposed)
], function (io, chokidar, HMR, fs) {
  // Skip HMR setup if disabled in pod config
  if (!Doh.pod.hmr?.enabled) {
    console.log('HMR is disabled. Set hmr.enabled to true in pod config to enable.');
    return;
  }

  // Create HMR namespace and rooms
  HMR.Room = 'hmr_updates';
  
  // Track file watchers to prevent duplicate watchers
  HMR.watchers = new Map();  // key is absolute filepath, value is watcher object
  HMR.watchedLoaders = new Map();  // key is loader statement, DohSlash filepath
  
  HMR.broadcastHooks = new Set(); // set of functions to call when an update is pushed out to the clients

  // Add debouncing for file changes to prevent multiple rapid updates
  HMR.debounceTime = Doh.pod.hmr?.debounceTime || 300;
  HMR.pendingUpdates = new Map();  // key is absolute filepath, value is timeout id
  
  // Track updates to prevent loops
  HMR.recentUpdates = new Map(); // key is filepath, value is {sourceId, timestamp}

  // Initialize HMR system
  function initHMR() {
    console.log('Initializing HMR file watch system...');
    
    // Set up socket event handling for HMR
    // This is always set up if HMR is enabled, even if no loaders are watched
    io.on('connection', (socket) => {
      // Handle client subscribing to HMR updates
      socket.on('hmr:subscribe', () => {
        console.log(`Client ${socket.id} subscribed to HMR updates`);
        socket.join(HMR.Room);
        
        // Send initial list of watched loaders
        // socket.emit('hmr:init', Array.from(HMR.watchedLoaders.entries()));
      });
      
      // Handle client unsubscribing
      socket.on('hmr:unsubscribe', () => {
        console.log(`Client ${socket.id} unsubscribed from HMR updates`);
        socket.leave(HMR.Room);
      });

      socket.on('hmr:add', (data) => {
        let { loaders } = data;
        if (loaders) {
          loaders.forEach(loader => {
            HMR.addLoaderToWatch(loader);
          });
        } else {
          let { from } = data;
          HMR.addLoaderToWatch(from);
        }
      });
      
      // Handle file updates from clients
      socket.on('hmr:updateFile', async (data) => {
        const { filePath, content, sourceId } = data;
        
        // Validate inputs
        if (!filePath || !content) {
          console.error('HMR: Invalid update data', { filePath, hasContent: !!content });
          return;
        }
        
        // Ensure we're getting a DohSlash path (starting with /)
        if (!filePath.startsWith('/')) {
          console.error(`HMR: Invalid DohSlash path: ${filePath}`);
          return;
        }
        
        // TODO: Add permission checks here
        if (!socket.user || !await Doh.permit(socket.user, 'write:file', {path: filePath})) {
          console.error(`HMR: Client ${socket.id} does not have permission to modify ${filePath}`);
          return;
        }
        
        try {
          // Convert DohSlash path to absolute system path
          const absolutePath = DohPath(filePath);
          console.log(`HMR: Client ${socket.id} updating file ${absolutePath}`);
          
          // Track this update to prevent loops
          HMR.recentUpdates.set(absolutePath, {
            sourceId,
            timestamp: Date.now()
          });
          
          // Decode base64 content and write to file
          const fileContent = Buffer.from(content, 'base64').toString('utf-8');
          fs.writeFileSync(absolutePath, fileContent);
          
          // The file change will be detected by the watcher
          // and broadcast to all clients including the source
          // The source client will filter out its own updates
          console.log(`HMR: File ${absolutePath} updated by client ${sourceId}`);
        } catch (error) {
          console.error(`HMR: Error updating file ${filePath}:`, error);
        }
      });
    });
    
    // Start watching loaders defined in pod config
    setupWatchers();
  }

  
  // Setup file watchers for loadStatements in Doh.pod.hmr.loaders
  function setupWatchers() {
    const loaders = Doh.pod.hmr?.loaders || [];

    // find watchables
    loaders.forEach(loader => {
      if (IsString(loader)) {
        HMR.addLoaderToWatch(loader);
      }
    });
  }
  
  // Watch a specific file for changes
  function watchFile(filePath) {
    filePath = DohPath(filePath);
    if (HMR.watchers.has(filePath)) {
      console.log(`HMR: [Already watching] ${filePath}`);
      return;
    }
    
    console.log(  `HMR: [Setting watcher]  ${filePath}`);
    
    try {
      // Use chokidar for reliable file watching
      const watcher = chokidar.watch(filePath, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 100
        }
      });
      
      watcher.on('change', (path) => HMR.handleFileChange(path));
      watcher.on('error', (error) => console.error(`HMR: Error watching ${filePath}:`, error));
      
      HMR.watchers.set(filePath, {
        watcher,
      });
    } catch (error) {
      console.error(`HMR: Failed to watch ${filePath}:`, error);
    }
  }
  
  // Handle file changes with debouncing
  HMR.handleFileChange = function(filePath) {
    // Clear any pending updates for this module
    if (HMR.pendingUpdates.has(filePath)) {
      clearTimeout(HMR.pendingUpdates.get(filePath));
    }
    
    // Debounce updates to prevent rapid successive updates
    HMR.pendingUpdates.set(filePath, setTimeout(() => {
      HMR.pendingUpdates.delete(filePath);
      
      // console.log(`HMR: File changed ${filePath}`);
      
      // Check if this change was initiated by a client
      const recentUpdate = HMR.recentUpdates.get(filePath);
      let sourceId = null;
      
      if (recentUpdate && (Date.now() - recentUpdate.timestamp < HMR.debounceTime * 2)) {
        sourceId = recentUpdate.sourceId;
        HMR.recentUpdates.delete(filePath); // Clean up after using
      }
      
      // Broadcast the update to all clients in the HMR room
      broadcastUpdate({
        from: DohPath.DohSlash(filePath),
        timestamp: Date.now(),
        sourceId: sourceId // Include source ID to help clients filter their own updates
      });
    }, HMR.debounceTime));
  }
  
  // Broadcast updates to connected clients
  function broadcastUpdate(updateData) {
    console.log(`HMR: Broadcasting update for ${updateData.from} to ${HMR.Room}`);
    
    if (!io) {
      console.error('HMR: Socket.IO not initialized in Router');
      return;
    }
    // loaders can be defined in many ways, so we need to find all the loaders that are watching this file
    // store them in an object with the loader statement as the key and the filepath as the value
    const loaders = {};
    HMR.watchedLoaders.forEach((filepath, loader) => {
      const slashPath = DohPath.DohSlash(filepath);
      if (slashPath === updateData.from) {
        loaders[loader] = slashPath;
      }
    });

    const updateObject = {
      ...updateData,
      loaders
    };
    
    // now emit the update with loader statements attached
    HMR.broadcastHooks.forEach(hook => hook(updateObject));
    io.to(HMR.Room).emit('hmr:update', updateObject);
  }
  
  // Add a module to watch dynamically
  HMR.addLoaderToWatch = function(loadStatement) {
    const filePath = HMR.findLoaderFileFromStatement(loadStatement);
    if (HMR.watchedLoaders.has(loadStatement)) {
      //console.log(`HMR: File ${filePath} is already being watched`);
      return;
    }

    if (!filePath) return;
    HMR.watchedLoaders.set(loadStatement, filePath);
    watchFile(filePath);
  }
  
  // Initialize HMR system
  initHMR();
});
