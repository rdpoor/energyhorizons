// dohlogger.js
import util from 'util';
import BatchFileLogger from './batch_file_logger.js';

// polyfill DohPath
import DohPath from './dohpath.js';

// polyfill IsStringAndHasValue
if (!globalThis.IsStringAndHasValue) {
  globalThis.IsStringAndHasValue = function (value) {
    return typeof value === 'string' && value.length > 0;
  };
}

// polyfill IsBrowser
// if (!globalThis.IsBrowser) {
//   globalThis.IsBrowser = function () {
//     return (typeof top !== 'undefined' && typeof top.window !== 'undefined');
//   };
// }

// polyfill colorize
const colorize = (text, color) => {
  // Early return for browser environment - no colors needed
  //if (IsBrowser()) return text;
  const colors = colorize.colors;
  return `${colors[color]}${text}${colors.reset}`;
};
// Terminal colors for Node environment
colorize.colors = {
  black: '\x1b[30m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  grey: '\x1b[90m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

export class DohLogger {
  constructor(options = {}) {
    this.logs = [];
    this.maxLogs = options.maxLogs || 1000;
    this.indentLevel = 0;
    this.timers = new Map();
    this.logfile = options.logfile || DohPath('/.doh/logs/doh.log'); // false for no logfile
    this.dashboard = options.dashboard;

    // Create the BatchFileLogger
    this.fileLogger = new BatchFileLogger({
      batchDelay: options.batchDelay || 50,      // 50ms delay between batches
      maxBatchSize: options.maxBatchSize || 100,    // Write up to 100 logs per batch
      maxQueueSize: options.maxQueueSize || 1000,    // Force write if queue exceeds 1000 entries
      maxLogFileSize: options.maxLogFileSize || undefined // Pass max size, BatchFileLogger has default
    });

    // Store original console methods
    this.originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
      group: console.group,
      groupEnd: console.groupEnd,
      time: console.time,
      timeEnd: console.timeEnd
    };

    this.categories = {
      system: { prefix: '[System]', color: 'cyan' },
      info: { prefix: '[Info] ', color: '' },
      warn: { prefix: '[Warn] ', color: 'yellow' },
      error: { prefix: '[Error]', color: 'red' },
      debug: { prefix: '[Debug]', color: 'blue' },
      success: { prefix: '[OK]   ', color: 'green' }
    };

    this.counters = {
      total: 0,
      info: 0,
      warn: 0,
      error: 0,
      debug: 0
    };

    // Set up error handling for uncaught exceptions
    this.setupErrorHandling();
  }

  // safe to run multiple times, changes the logfile if provided
  async setupFileLogging(logfile) {
    // if the logfile is provided, use it
    if (IsStringAndHasValue(logfile)) {
      this.logfile = logfile;
    }
    if (!this.logfile) return;
    try {
      await this.fileLogger.initialize(this.logfile);

      // Log the session start
      const sessionStart = `\n=== Session Started at ${new Date().toISOString()} ===\n`;
      this.fileLogger.write(sessionStart);

    } catch (error) {
      // If we can't set up file logging, log to original console
      this.originalConsole.error('Failed to set up file logging:', error);
    }
  }

  async setupErrorHandling() {
    await this.setupFileLogging();
    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      try {
        const errorMsg = `\n=== Uncaught Exception at ${new Date().toISOString()} ===\n${error.stack}\n`;
        this.fileLogger.write(errorMsg);
      } finally {
        // Ensure the process exits after logging
        process.exit(1);
      }
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
      try {
        const errorMsg = `\n=== Unhandled Rejection at ${new Date().toISOString()} ===\n${reason.stack || reason}\n`;
        this.fileLogger.write(errorMsg);
      } catch (error) {
        this.originalConsole.error('Failed to log unhandled rejection:', error);
      }
    });
  }

  formatMessage(args) {
    return args
      .map((arg) => {
        let str;
        if (typeof arg === 'string') str = arg;
        else if (arg instanceof Error) {
          str = arg.stack || arg.message;
        } else if (typeof arg === 'object' || typeof arg === 'function') {
          str = util.inspect(arg, {
            depth: null,
            maxArrayLength: 100,
            breakLength: 80,
            colors: true // Disable colors for file logging
          });
        } else if (IsStringAndHasValue(arg)) {
          str = arg;
        } else if (typeof arg?.toString === 'function') {
          str = arg.toString();
        } else if (arg === null) {
          str = 'null';
        } else if (arg === undefined) {
          str = 'undefined';
        } else {
          str = 'Unknown object type';
        }


        // Remove carriage returns
        str = str.replace(/\r/g, '');
        return str;
      })
      .join(' ');
  }

  formatLogEntry(category, message, timestamp = new Date()) {
    const categoryInfo = this.categories[category] || this.categories.info;
    const time = timestamp.toLocaleTimeString('en-US', { hour12: true });

    // Create both plain and formatted versions
    let plainEntry = `${time} ${message}`;
    if (category === 'error' || category === 'warn') {
      plainEntry = `${time} ${categoryInfo.prefix}${message}`;
    }
    let coloredEntry;
    if (categoryInfo.color) {
      coloredEntry = `{grey-fg}${time}{/} {${categoryInfo.color}-fg}${message}{/}`;
      // make the plain entry the same as the colored entry, but with terminal colors, rather than tags
      //plainEntry = `${time} ${colorize(message, categoryInfo.color)}`;
    } else {
      coloredEntry = `{grey-fg}${time}{/} ${message}`;
    }

    return { plainEntry, coloredEntry };
  }


  //MARK: Add Log
  addLog(category, ...args) {
    try {
      // Map console methods to categories
      const categoryMap = {
        log: 'info',
        info: 'info',
        warn: 'warn',
        error: 'error',
        debug: 'debug'
      };

      const mappedCategory = categoryMap[category] || category;

      // Increment counters
      this.counters.total++;
      if (this.counters[mappedCategory] !== undefined) {
        this.counters[mappedCategory]++;
      }

      // Format the message
      const message = this.formatMessage(args);
      const lines = message.split('\n');
      const timestamp = new Date();

      // Process each line
      for (const line of lines) {
        if (!line) continue; // Skip empty lines

        const { plainEntry, coloredEntry } = this.formatLogEntry(mappedCategory, line, timestamp);

        // Add to memory logs for dashboard
        this.logs.push({
          timestamp,
          category: mappedCategory,
          message: line,
          formatted: coloredEntry
        });

        // Write to file logger (non-blocking)
        if (this.logfile) {
          this.fileLogger.write(plainEntry + '\n');
        }


        // Trim logs if exceeding maxLogs
        if (this.logs.length > this.maxLogs) {
          this.logs.shift();
        }
      }

      Doh?.sendToParent('messageStats', {
        messageCount: this.counters.total,
        errorCount: this.counters.error,
        warningCount: this.counters.warn
      });

      if (!this.dashboard) {
        // log to the console, but add the timestamp with category color
        const categoryInfo = this.categories[mappedCategory] || this.categories.info;
        const timestamp12 = timestamp.toLocaleTimeString('en-US', { hour12: true });
        const color = categoryInfo.color ? categoryInfo.color : '';
        if (color) {
          this.originalConsole[mappedCategory](colorize(timestamp12, color), colorize.colors[color], ...args);
        } else {
          this.originalConsole[mappedCategory](colorize(timestamp12, 'grey'), ...args);
        }
      } else {
        const { coloredEntry } = this.formatLogEntry(mappedCategory, message, timestamp);
        // the dashlogbox only has a content property, so we need to add the formatted string to it as a new line
        this.dashboard.dashLogBox.setContent(this.dashboard.dashLogBox.getContent() + '\n' + coloredEntry);
      }


    } catch (error) {
      // If logging fails, use original console
      this.originalConsole.error('Logging failed:', error);
    }
  }

  resetCounters() {
    this.counters = {
      total: 0,
      info: 0,
      warn: 0,
      error: 0,
      debug: 0
    };
  }

  //MARK: Intercept Console
  interceptConsole() {
    if (this.intercepted) return;
    this.intercepted = true;
    // Replace console methods
    console.log = (...args) => this.addLog('info', ...args);
    console.info = (...args) => this.addLog('info', ...args);
    console.warn = (...args) => this.addLog('warn', ...args);
    console.error = (...args) => this.addLog('error', ...args);
    console.debug = (...args) => this.addLog('debug', ...args);

    // Group handling
    console.group = (...args) => {
      if (args.length) this.addLog('info', ...args);
      this.indentLevel++;
    };

    console.groupEnd = () => {
      this.indentLevel = Math.max(0, this.indentLevel - 1);
    };

    // Timer handling
    console.time = (label) => {
      this.timers.set(label, process.hrtime());
    };

    console.timeEnd = (label) => {
      const startTime = this.timers.get(label);
      if (startTime) {
        const [seconds, nanoseconds] = process.hrtime(startTime);
        const duration = seconds * 1000 + nanoseconds / 1e6;
        this.timers.delete(label);
        this.addLog('info', `${label}: ${duration.toFixed(3)}ms`);
      }
    };
  }

  restoreConsole() {
    // Restore original console methods
    Object.assign(console, this.originalConsole);

    // Close the log file stream
    if (this.logStream) {
      this.logStream.end('\n=== Session Ended at ' + new Date().toISOString() + ' ===\n');
    }
  }

  clear() {
    this.logs = [];
  }

  searchLogs(searchTerm) {
    return this.logs.filter((log) =>
      log.message.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  filterByCategory(category) {
    return this.logs.filter((log) => log.category === category);
  }

  // Renamed from destroy to prevent conflicts and better reflect action
  async close() {
    // Restore original console methods first to prevent logging during shutdown
    this.restoreConsole();

    // Flush and close the file logger
    if (this.fileLogger) {
      try {
        await this.fileLogger.close(); // Use the renamed close method
      } catch (error) {
         // Use original console since ours is restored
         this.originalConsole.error('Error closing file logger:', error);
      }
    }
    // No need to clear process listeners here, they are standard Node.js practice
    // If they *were* causing issues, removing them would be done carefully
    // e.g., process.removeListener('uncaughtException', ...)
    // but it's usually better to let the process exit naturally or via process.exit()
  }
}

export default DohLogger;
