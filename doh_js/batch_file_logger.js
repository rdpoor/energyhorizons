// batch_file_logger.js
import fs from 'node:fs';
import path from 'node:path';
//import { Transform } from 'stream';
import { setTimeout as sleep } from 'node:timers/promises';

const stream_module = await import('node:stream');
const { Transform } = stream_module;

// Define default max log file size (10MB)
const DEFAULT_MAX_LOG_FILE_SIZE = 10 * 1024 * 1024;

class BatchFileLogger {
  constructor(options = {}) {
    this.options = {
      batchDelay: 100,         // How long to wait before writing a batch (ms)
      maxBatchSize: 1000,      // Maximum number of log entries per batch
      maxQueueSize: 10000,     // Maximum number of entries in queue before force-writing
      retryDelay: 1000,        // Delay between write retries (ms)
      maxRetries: 3,           // Maximum number of retry attempts
      maxLogFileSize: DEFAULT_MAX_LOG_FILE_SIZE, // Maximum log file size before rotation
      ...options
    };

    this.queue = [];
    this.writing = false;
    this.timer = null;
    this.writeStream = null;
    this.writePromise = Promise.resolve();
    this.filePath = null; // Store the file path

    // Create a transform stream for preprocessing log entries
    if(!Transform) return false;
    this.transform = new Transform({
      objectMode: true,
      transform: (chunk, encoding, callback) => {
      // Strip ANSI color codes and ensure line ending
      const processed = chunk.toString()
        .replace(/\u001b\[\d+m/g, '')
        .replace(/\r/g, '')
        .trim() + '\n';
        callback(null, processed);
      }
    });
  }

  async initialize(filePath) {
    if(!this.transform) return false;
    this.filePath = filePath; // Store filePath
    try {
      // Ensure the directory exists
      const dir = path.dirname(filePath);
      await fs.promises.mkdir(dir, { recursive: true });

      // Create or open the write stream
      this.writeStream = fs.createWriteStream(filePath, {
        flags: 'a',    // Append mode
        encoding: 'utf8'
      });

      // Pipe the transform stream to the write stream
      this.transform.pipe(this.writeStream);

      // Handle stream errors
      this.writeStream.on('error', this.handleError.bind(this));
      this.transform.on('error', this.handleError.bind(this));

      return true;
    } catch (error) {
      console.error('Failed to initialize BatchFileLogger:', error);
      return false;
    }
  }

  async write(data) {
    // Add to queue
    this.queue.push(data);

    // If queue exceeds max size, force a write
    if (this.queue.length >= this.options.maxQueueSize) {
      this.processQueue(true);
      return;
    }

    // Clear existing timer
    if (this.timer) {
      clearTimeout(this.timer);
    }

    // Set new timer for batch processing
    this.timer = setTimeout(() => {
      this.processQueue();
    }, this.options.batchDelay);
  }

  async processQueue(force = false) {
    // If already writing or queue is empty, skip
    if (this.writing || this.queue.length === 0) return;

    this.writing = true;

    try {
      while (this.queue.length > 0) {
        // Get batch of items to write
        const batch = this.queue.splice(0, this.options.maxBatchSize);

        // Process and write the batch
        await this.writeBatch(batch);

        // If not forced and queue is within limits, break
        if (!force && this.queue.length < this.options.maxQueueSize) {
          break;
        }

        // Small delay between batches to prevent overwhelming the stream
        await sleep(10);
      }
    } finally {
      this.writing = false;

      // If there are still items in the queue, schedule next batch
      if (this.queue.length > 0) {
        this.timer = setTimeout(() => {
          this.processQueue();
        }, this.options.batchDelay);
      }
    }
  }

  async writeBatch(batch, retryCount = 0) {
    return new Promise((resolve, reject) => {
      // Skip empty batches
      if (batch.length === 0) {
        resolve();
        return;
      }

      // Create a single string from the batch
      const data = batch.join('');

      // Check file size and rotate if necessary BEFORE writing the batch
      this.checkAndRotateLog()
        .then(() => {
          // Write to transform stream
          const canContinue = this.transform.write(data, 'utf8', (error) => {
            if (error) {
              this.handleBatchError(error, batch, retryCount).then(resolve).catch(reject);
            } else {
              resolve();
            }
          });

          // Handle backpressure
          if (!canContinue) {
            this.transform.once('drain', () => {
              resolve(); // Resolve after drain if write returned false initially
            });
          }
          // else { // If write returned true, resolve immediately (already handled by the write callback)
          //   resolve();
          // }
        })
        .catch(reject); // Catch errors from checkAndRotateLog
    });
  }

  async handleBatchError(error, batch, retryCount) {
    console.error(`BatchFileLogger write error (attempt ${retryCount + 1}/${this.options.maxRetries}):`, error);

    // If we haven't exceeded max retries, wait and try again
    if (retryCount < this.options.maxRetries) {
      await sleep(this.options.retryDelay);
      return this.writeBatch(batch, retryCount + 1);
    }

    // If we've exceeded retries, add back to front of queue
    this.queue.unshift(...batch);
    throw error;
  }

  handleError(error) {
    console.error('BatchFileLogger stream error:', error);

    // Attempt to gracefully handle stream errors
    if (this.writeStream && !this.writeStream.destroyed) {
      this.writeStream.end();
    }

    // Attempt to recreate streams after a delay
    setTimeout(() => {
      if (this.writeStream && !this.writeStream.destroyed) {
        this.transform.unpipe(this.writeStream);
        this.writeStream.destroy();
      }

      this.writeStream = fs.createWriteStream(this.filePath, {
        flags: 'a',
        encoding: 'utf8'
      });

      this.transform.pipe(this.writeStream);
    }, this.options.retryDelay);
  }

  async flush() {
    // Clear any pending timer
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Force process any remaining items in queue
    await this.processQueue(true);

    // Wait for transform stream to finish
    return new Promise((resolve) => {
      this.transform.end(() => {
        // Wait for write stream to finish
        this.writeStream.end(() => {
          resolve();
        });
      });
    });
  }

  // Renamed from destroy to avoid conflict with stream.destroy
  async close() {
    // Ensure flush completes before destroying streams
    await this.flush();

    return new Promise((resolve, reject) => {
      if (this.writeStream && !this.writeStream.destroyed) {
        this.transform.unpipe(this.writeStream);

        // Use 'finish' event for graceful close, 'close' for definitive end
        this.writeStream.once('finish', () => {
           this.writeStream.destroy(); // Ensure it's destroyed
           this.transform.destroy();
           resolve();
        });
         this.writeStream.once('error', (err) => {
           console.error("Error closing write stream:", err);
           this.writeStream.destroy();
           this.transform.destroy();
           reject(err); // Reject on error during close
        });
        this.writeStream.end(); // Signal end of writes

      } else {
        if (this.transform && !this.transform.destroyed) {
          this.transform.destroy();
        }
        resolve(); // Resolve immediately if streams are already gone
      }
    }).catch(error => {
        console.error("Error during BatchFileLogger close:", error);
        // Attempt to destroy anyway if error occurs
        if (this.writeStream && !this.writeStream.destroyed) this.writeStream.destroy();
        if (this.transform && !this.transform.destroyed) this.transform.destroy();
        throw error; // Re-throw the error after attempting cleanup
    });
  }

  async checkAndRotateLog() {
    if (!this.filePath || !this.writeStream || this.writeStream.destroyed) {
      return; // Cannot rotate if stream/path is not setup or stream is closed
    }

    try {
      const stats = await fs.promises.stat(this.filePath);
      if (stats.size >= this.options.maxLogFileSize) {
        // File size exceeds limit, rotate
        await this.rotateLogFile();
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, no need to rotate
        return;
      }
      console.error('Error checking log file size:', error);
      // Decide if you want to proceed without rotation or handle differently
    }
  }

  async rotateLogFile() {
    if (!this.filePath) return; // Ensure filePath is set

    console.log(`Rotating log file: ${this.filePath}`);
    // 1. Close the current stream
    await this.flush(); // Ensure queue is flushed before rotating
    await new Promise((resolve, reject) => {
        if (this.writeStream && !this.writeStream.destroyed) {
            this.transform.unpipe(this.writeStream);
            this.writeStream.once('close', resolve); // Wait for the stream to fully close
            this.writeStream.once('error', reject);
            this.writeStream.end();
        } else {
            resolve(); // Already closed or non-existent
        }
    });
    this.writeStream = null; // Nullify the closed stream reference

    // 2. Rename the current log file (e.g., to .old)
    const oldLogPath = this.filePath + '.old';
    try {
      // Remove existing .old file if it exists
       try {
           await fs.promises.unlink(oldLogPath);
       } catch (unlinkError) {
           if (unlinkError.code !== 'ENOENT') { // Ignore "file not found" errors
               throw unlinkError; // Re-throw other unlink errors
           }
       }
       // Rename current log to .old
       await fs.promises.rename(this.filePath, oldLogPath);
       console.log(`Log file rotated to: ${oldLogPath}`);
    } catch (renameError) {
        if (renameError.code === 'ENOENT') {
            // Original file didn't exist, maybe it was deleted? Log warning and continue.
            console.warn(`Log file ${this.filePath} not found during rotation attempt.`);
        } else {
            console.error('Error rotating log file:', renameError);
            // Attempt to re-initialize logging even if rename failed
        }
    }


    // 3. Re-initialize the logger with the original file path (creates a new file)
    await this.initialize(this.filePath);
    console.log(`New log file started: ${this.filePath}`);
  }
}

export default BatchFileLogger;