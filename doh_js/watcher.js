// doh_js/watcher.js
// File watcher with lifecycle hooks and state persistence

// Install needed dependencies
Doh.Install('FileWatcher', {
  'npm:chokidar': '^4.0.3'
});

// Define pod configuration for FileWatcher
Doh.Pod('FileWatcher', {
  FileWatcher: {
    // Enable or disable the watcher
    enabled: true,
    
    // Default file patterns to ignore
    ignored: [
    ],
    
    // State persistence
    statePersistence: {
      enabled: true,
      path: '.doh/watcher_state.json',
      debounceTime: 1000, // Debounce saves to once per second
      atomicWrites: true  // Use atomic writes for safety
    }
  }
});

// Main FileWatcher module
Doh.Module('FileWatcher', [
  // Core dependencies
  'nodejs?? import chokidar from "chokidar"',
  'nodejs?? import fs from "fs"',
  'nodejs?? import path from "path"',
  'DohPath',
  
  // Optional utility for glob matching
  'nodejs?? import { minimatch } from "minimatch"'
], async function(chokidar, fs, path, DohPath, minimatch, watcher) {
  // Skip setup if disabled
  if (!Doh.pod.FileWatcher?.enabled) {
    console.log('FileWatcher is disabled. Set FileWatcher.enabled to true in pod config to enable.');
    return;
  }
  
  // Class to handle file watching and state management
  class FileWatcher {
    constructor(options = {}) {
      this.options = {
        ...options,
        // Default configuration
        ignored: Doh.pod.FileWatcher?.ignored || [],
        persistent: true,
        ignoreInitial: false,
        awaitWriteFinish: {
          stabilityThreshold: 300,
          pollInterval: 100
        }
      };
      
      // State management
      this.fileStates = new Map(); // path -> {mtime, status, etc}
      this.subscriptions = new Map(); // pattern -> [callbacks]
      this.initialized = false;
      this.watcher = null;
      this.dirtyState = false;
      this.saveTimer = null;
      this.saveDebounceTimeout = null;
      
      // State persistence configuration
      this.statePersistence = {
        enabled: Doh.pod.FileWatcher?.statePersistence?.enabled ?? true,
        path: Doh.pod.FileWatcher?.statePersistence?.path || '.doh/watcher_state.json',
        debounceTime: Doh.pod.FileWatcher?.statePersistence?.debounceTime || 1000,
        atomicWrites: Doh.pod.FileWatcher?.statePersistence?.atomicWrites ?? true
      };
      
      // Bind methods
      this.handleAdd = this.handleAdd.bind(this);
      this.handleChange = this.handleChange.bind(this);
      this.handleUnlink = this.handleUnlink.bind(this);
      this.saveState = this.saveState.bind(this);
      this.debouncedSaveState = this.debouncedSaveState.bind(this);
    }
    
    /**
     * Initialize the watcher and load saved state
     */
    async init() {
      if (this.initialized) return;
      
      console.log('Initializing FileWatcher...');
      
      // Load existing state if enabled
      if (this.statePersistence.enabled) {
        await this.loadState();
      }
      
      // Initialize chokidar watcher
      this.watcher = chokidar.watch('.', {
        ...this.options,
        // Use DohPath to resolve paths
        cwd: DohPath('/', undefined, true)
      });
      
      // Set up event handlers
      this.watcher
        .on('add', this.handleAdd)
        .on('change', this.handleChange)
        .on('unlink', this.handleUnlink)
        .on('ready', () => {
          console.log('Initial scan complete. File watcher ready.');
        });
      
      this.initialized = true;
    }
    
    /**
     * Handle 'add' events from chokidar
     */
    handleAdd(filePath) {
      try {
        const stats = fs.statSync(filePath);
        const state = {
          path: filePath,
          mtime: stats.mtimeMs,
          status: 'added',
          size: stats.size,
          lastSeen: Date.now()
        };
        
        this.fileStates.set(filePath, state);
        this.dirtyState = true;
        
        // Trigger debounced state save
        if (this.statePersistence.enabled) {
          this.debouncedSaveState();
        }
        
        // Notify subscribers
        this.notifySubscribers('add', state);
      } catch (err) {
        console.error(`Error handling add event for ${filePath}:`, err);
      }
    }
    
    /**
     * Handle 'change' events from chokidar
     */
    handleChange(filePath) {
      try {
        const stats = fs.statSync(filePath);
        const existingState = this.fileStates.get(filePath) || {};
        
        const state = {
          ...existingState,
          path: filePath,
          mtime: stats.mtimeMs,
          status: 'modified',
          size: stats.size,
          lastSeen: Date.now()
        };
        
        this.fileStates.set(filePath, state);
        this.dirtyState = true;
        
        // Trigger debounced state save
        if (this.statePersistence.enabled) {
          this.debouncedSaveState();
        }
        
        // Notify subscribers
        this.notifySubscribers('change', state);
      } catch (err) {
        console.error(`Error handling change event for ${filePath}:`, err);
      }
    }
    
    /**
     * Handle 'unlink' events from chokidar
     */
    handleUnlink(filePath) {
      try {
        const existingState = this.fileStates.get(filePath) || {};
        
        const state = {
          ...existingState,
          path: filePath,
          status: 'removed',
          lastSeen: Date.now()
        };
        
        this.fileStates.set(filePath, state);
        this.dirtyState = true;
        
        // Trigger debounced state save
        if (this.statePersistence.enabled) {
          this.debouncedSaveState();
        }
        
        // Notify subscribers
        this.notifySubscribers('unlink', state);
      } catch (err) {
        console.error(`Error handling unlink event for ${filePath}:`, err);
      }
    }
    
    /**
     * Debounce the save state operation
     */
    debouncedSaveState() {
      // Clear any existing timeout
      if (this.saveDebounceTimeout) {
        clearTimeout(this.saveDebounceTimeout);
      }
      
      // Set a new timeout
      this.saveDebounceTimeout = setTimeout(() => {
        this.saveState().catch(err => {
          console.error('Error saving file watcher state:', err);
        });
        this.saveDebounceTimeout = null;
      }, this.statePersistence.debounceTime);
    }
    
    /**
     * Notify subscribers of file events
     */
    notifySubscribers(eventType, fileState) {
      const filePath = fileState.path;
      
      // Check each subscription pattern
      for (const [pattern, callbacks] of this.subscriptions.entries()) {
        // Check if the file path matches the pattern
        let matches = false;
        
        if (pattern === '*' || pattern === '**') {
          // Wildcard pattern, matches everything
          matches = true;
        } else if (pattern === filePath) {
          // Exact file path match
          matches = true;
        } else if (pattern.startsWith('/') || pattern.startsWith('./')) {
          // Directory pattern
          const dirPath = pattern.endsWith('/') ? pattern : `${pattern}/`;
          if (filePath.startsWith(dirPath)) {
            matches = true;
          }
        } else if (minimatch) {
          // Glob pattern
          matches = minimatch(filePath, pattern);
        }
        
        // If it matches, notify all callbacks
        if (matches) {
          const event = {
            type: eventType,
            path: filePath,
            state: fileState,
            timestamp: Date.now()
          };
          
          for (const callback of callbacks) {
            try {
              callback(event);
            } catch (err) {
              console.error(`Error in file watcher subscription callback for ${pattern}:`, err);
            }
          }
        }
      }
    }
    
    /**
     * Load saved state from disk
     */
    async loadState() {
      try {
        const statePath = DohPath(this.statePersistence.path);
        
        if (!fs.existsSync(statePath)) {
          console.log('No saved state found for FileWatcher.');
          return;
        }
        
        const data = await fs.promises.readFile(statePath, 'utf8');
        const state = JSON.parse(data);
        
        if (state && state.files) {
          // Convert the state back to a Map
          this.fileStates = new Map(Object.entries(state.files));
          console.log(`Loaded state for ${this.fileStates.size} files.`);
        }
      } catch (err) {
        console.error('Error loading FileWatcher state:', err);
      }
    }
    
    /**
     * Save current state to disk
     */
    async saveState() {
      if (!this.dirtyState) return;
      
      try {
        const statePath = DohPath(this.statePersistence.path);
        const stateDir = path.dirname(statePath);
        
        // Ensure the directory exists
        if (!fs.existsSync(stateDir)) {
          fs.mkdirSync(stateDir, { recursive: true });
        }
        
        // Convert file states Map to a plain object for serialization
        const state = {
          timestamp: Date.now(),
          files: Object.fromEntries(this.fileStates)
        };
        
        const stateJson = JSON.stringify(state, null, 2);
        
        if (this.statePersistence.atomicWrites) {
          // Atomic write: write to temp file first, then rename
          const tempPath = `${statePath}.tmp`;
          await fs.promises.writeFile(tempPath, stateJson, 'utf8');
          await fs.promises.rename(tempPath, statePath);
        } else {
          // Direct write
          await fs.promises.writeFile(statePath, stateJson, 'utf8');
        }
        
        this.dirtyState = false;
        
      } catch (err) {
        console.error('Error saving FileWatcher state:', err);
      }
    }
    
    /**
     * Subscribe to file events
     * @param {string} pattern - File pattern to match (glob, directory, or exact path)
     * @param {function} callback - Function to call when matching events occur
     * @returns {function} Unsubscribe function
     */
    subscribe(pattern, callback) {
      if (!this.initialized) {
        this.init().catch(err => {
          console.error('Error initializing FileWatcher:', err);
        });
      }
      
      // Get or create the callback array for this pattern
      let callbacks = this.subscriptions.get(pattern);
      if (!callbacks) {
        callbacks = [];
        this.subscriptions.set(pattern, callbacks);
      }
      
      // Add the callback
      callbacks.push(callback);
      
      // Return an unsubscribe function
      return () => {
        const callbackList = this.subscriptions.get(pattern);
        if (callbackList) {
          const index = callbackList.indexOf(callback);
          if (index !== -1) {
            callbackList.splice(index, 1);
            
            // Clean up empty subscription arrays
            if (callbackList.length === 0) {
              this.subscriptions.delete(pattern);
            }
          }
        }
      };
    }
    
    /**
     * Get the current state of a file
     * @param {string} filePath - Path to the file
     * @returns {object|null} File state or null if not found
     */
    getFileState(filePath) {
      return this.fileStates.get(filePath) || null;
    }
    
    /**
     * Get all tracked files that match a pattern
     * @param {string} pattern - File pattern to match
     * @returns {Array} Array of file states
     */
    getFiles(pattern) {
      const results = [];
      
      for (const [path, state] of this.fileStates.entries()) {
        if (pattern === '*' || pattern === '**') {
          // Wildcard pattern
          results.push(state);
        } else if (pattern === path) {
          // Exact match
          results.push(state);
        } else if (pattern.startsWith('/') || pattern.startsWith('./')) {
          // Directory pattern
          const dirPath = pattern.endsWith('/') ? pattern : `${pattern}/`;
          if (path.startsWith(dirPath)) {
            results.push(state);
          }
        } else if (minimatch) {
          // Glob pattern
          if (minimatch(path, pattern)) {
            results.push(state);
          }
        }
      }
      
      return results;
    }
    
    /**
     * Stop watching and save final state
     */
    async close() {
      // Clear debounce timeout
      if (this.saveDebounceTimeout) {
        clearTimeout(this.saveDebounceTimeout);
        this.saveDebounceTimeout = null;
      }
      
      // Save final state
      if (this.dirtyState && this.statePersistence.enabled) {
        await this.saveState();
      }
      
      // Close the chokidar watcher
      if (this.watcher) {
        await this.watcher.close();
        this.watcher = null;
      }
      
      this.initialized = false;
      console.log('FileWatcher closed.');
    }
  }
  
  // Create and initialize the watcher instance to overload the global and local variables
  Doh.Globals.watcher = watcher = new FileWatcher();
  
  // Start the watcher
  await watcher.init();
  
  // Handle process exit to ensure clean shutdown
  process.on('exit', () => {
    watcher.close().catch(err => {
      console.error('Error closing FileWatcher:', err);
    });
  });
  
  // Handle signals for cleaner shutdown
  process.on('SIGINT', () => {
    console.log('Received SIGINT. Closing FileWatcher...');
    watcher.close().then(() => {
      process.exit(0);
    }).catch(err => {
      console.error('Error closing FileWatcher:', err);
      process.exit(1);
    });
  });
  
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Closing FileWatcher...');
    watcher.close().then(() => {
      process.exit(0);
    }).catch(err => {
      console.error('Error closing FileWatcher:', err);
      process.exit(1);
    });
  });
});
