/**
 * Managed Site Command Handlers
 * 
 * Handles all command processing for cloud-managed Doh instances.
 * Extracted from managed_site.js for better code organization.
 */

Doh.Module('managed_site_command_handlers', [
  'nodejs?? import fsE from "fs-extra"',
  'nodejs?? CryptoAPI',
  'nodejs?? import { exec } from "child_process"',
  'managed_site_command_handlers_git'
], function (DohPath, fsE, CryptoAPI, exec, gitHandlers, managedSite) {
  const fs = fsE;
  let fsp = fs.promises;

  // --- Backup and Cleanup Management ---
  
  /**
   * Create a managed backup in .doh/backups/ with proper organization
   */
  async function createManagedBackup(originalPath) {
    try {
      const backupDir = DohPath('/.doh/backups');
      await fs.ensureDir(backupDir);
      
      // Create relative path for backup organization
      const projectRoot = DohPath('/');
      let relativePath = originalPath.replace(projectRoot, '');
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.substring(1);
      }
      
      // Replace path separators with underscores for flat storage
      const backupFileName = relativePath.replace(/[/\\]/g, '_');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = DohPath.Join(backupDir, `${backupFileName}.backup.${timestamp}`);
      
      // SIMPLIFIED: Remove any existing backup for this file (keep only one backup per file)
      if (fs.existsSync(backupDir)) {
        const existingBackups = await fsp.readdir(backupDir);
        const fileBackups = existingBackups.filter(backup => 
          backup.startsWith(`${backupFileName}.backup.`)
        );
        
        // Remove all existing backups for this file
        for (const oldBackup of fileBackups) {
          try {
            const oldBackupPath = DohPath.Join(backupDir, oldBackup);
            await fs.remove(oldBackupPath);
            // console.log(`[ManagedSite] Removed old backup: ${oldBackup}`);
          } catch (error) {
            console.warn(`[ManagedSite] Could not remove old backup ${oldBackup}: ${error.message}`);
          }
        }
      }
      
      // Create the new backup
      await fs.copy(originalPath, backupPath);
      
      return backupPath;
    } catch (error) {
      console.error(`[ManagedSite Error] Backup creation failed - File: ${originalPath}, Error: ${error.message}`);
      throw new Error(`Backup creation failed: ${error.message}`);
    }
  }
  
  /**
   * Clean up temporary files and old backups
   */
  async function cleanupTempAndBackups() {
    const results = {
      tempFilesRemoved: 0,
      backupsRemoved: 0,
      errors: []
    };
    
    try {
      // Clean up temp directory - MUCH more aggressive for large file operations
      const tempDir = DohPath('/.doh/temp');
      if (fs.existsSync(tempDir)) {
        const tempFiles = await fsp.readdir(tempDir);
        const cutoffTime = Date.now() - (2 * 60 * 60 * 1000); // Only 2 hours ago (was 24 hours)
        
        for (const file of tempFiles) {
          try {
            // For transfer files, be more aggressive - clean anything older than 2 hours
            // For ultra-large files, we can't afford to keep temp files around
            const filePath = DohPath.Join(tempDir, file);
            const stats = await fsp.stat(filePath);
            
            // FIXED: More conservative cleanup for active transfer temp files
            let shouldCleanup = false;
            
            if (file.includes('transfer_')) {
              // For transfer temp files, use longer threshold to avoid race conditions
              const transferCutoffTime = Date.now() - (30 * 60 * 1000); // 30 minutes for transfers
              shouldCleanup = stats.mtime.getTime() < transferCutoffTime;
            } else {
              // For other temp files, use the original 2-hour threshold
              shouldCleanup = stats.mtime.getTime() < cutoffTime;
            }
            
            if (shouldCleanup) {
              await fs.remove(filePath);
              results.tempFilesRemoved++;
              // console.log(`[ManagedSite] Removed stale temp file: ${file}`);
            }
          } catch (error) {
            results.errors.push(`Temp file cleanup error (${file}): ${error.message}`);
          }
        }
      }
      
      // SIMPLIFIED: Basic backup cleanup - ensure only one backup per file (safety check)
      const backupDir = DohPath('/.doh/backups');
      if (fs.existsSync(backupDir)) {
        const backupFiles = await fsp.readdir(backupDir);
        const backupsByOriginal = new Map();
        
        // Group backups by original file
        for (const backup of backupFiles) {
          if (backup.includes('.backup.')) {
            const originalFile = backup.substring(0, backup.indexOf('.backup.'));
            if (!backupsByOriginal.has(originalFile)) {
              backupsByOriginal.set(originalFile, []);
            }
            backupsByOriginal.get(originalFile).push(backup);
          }
        }
        
        // Safety check: remove extra backups if somehow there are multiple for the same file
        for (const [originalFile, backups] of backupsByOriginal) {
          if (backups.length > 1) {
            try {
              // Sort by timestamp (newest first) and keep only the newest
              backups.sort((a, b) => {
                const timestampA = a.substring(a.lastIndexOf('.backup.') + 8);
                const timestampB = b.substring(b.lastIndexOf('.backup.') + 8);
                return timestampB.localeCompare(timestampA);
              });
              
              // Remove all but the newest backup
              const toRemove = backups.slice(1);
              
              for (const backup of toRemove) {
                try {
                  const backupPath = DohPath.Join(backupDir, backup);
                  await fs.remove(backupPath);
                  results.backupsRemoved++;
                  // console.log(`[ManagedSite] Removed extra backup: ${backup}`);
                } catch (error) {
                  results.errors.push(`Backup cleanup error (${backup}): ${error.message}`);
                }
              }
            } catch (error) {
              results.errors.push(`Backup group cleanup error (${originalFile}): ${error.message}`);
            }
          }
        }
      }
      
      console.log(`[ManagedSite] Cleanup completed - Temp files: ${results.tempFilesRemoved}, Backups: ${results.backupsRemoved}, Errors: ${results.errors.length}`);
      
    } catch (error) {
      results.errors.push(`General cleanup error: ${error.message}`);
      console.error(`[ManagedSite Error] Cleanup failed:`, error);
    }
    
    return results;
  }
  
  /**
   * Immediately clean up temp files for completed operations
   */
  async function immediateCleanupTempFiles(operationId = null) {
    const results = {
      tempFilesRemoved: 0,
      errors: []
    };
    
    try {
      const tempDir = DohPath('/.doh/temp');
      if (fs.existsSync(tempDir)) {
        const tempFiles = await fsp.readdir(tempDir);
        
        for (const file of tempFiles) {
          try {
            // If operationId is specified, only clean files related to that operation
            if (operationId && !file.includes(operationId)) {
              continue;
            }
            
            const filePath = DohPath.Join(tempDir, file);
            
            // For immediate cleanup, remove any temp files not currently being used
            // (We'll be more conservative here and only remove files that are clearly finished)
            
            // FIXED: Much more conservative cleanup for transfer temp files
            const stats = await fsp.stat(filePath);
            const fileAge = Date.now() - stats.mtime.getTime();
            
            let cleanupThreshold = 30000; // Default 30 seconds
            
            // For transfer temp files (contain "transfer_"), use much longer threshold
            if (file.includes('transfer_')) {
              cleanupThreshold = 10 * 60 * 1000; // 10 minutes for active transfers
              
              // If this is a specific transfer cleanup (operationId provided), be more aggressive
              if (operationId && file.includes(operationId)) {
                cleanupThreshold = 60000; // 1 minute for completed transfers
              }
            }
            
            if (fileAge > cleanupThreshold) {
              await fs.remove(filePath);
              results.tempFilesRemoved++;
            }
          } catch (error) {
            results.errors.push(`Immediate temp cleanup error (${file}): ${error.message}`);
          }
        }
      }
      
      if (results.tempFilesRemoved > 0) {
        console.log(`[ManagedSite] Immediate cleanup completed - Temp files removed: ${results.tempFilesRemoved}`);
      }
      
    } catch (error) {
      results.errors.push(`Immediate cleanup error: ${error.message}`);
      console.error(`[ManagedSite Error] Immediate cleanup failed:`, error);
    }
    
    return results;
  }

  // --- Backup and Cleanup Management ---
  
  /**
   * Schedule automatic temp and backup cleanup (debounced)
   */
  let cleanupScheduled = false;
  function scheduleCleanup() {
    if (!cleanupScheduled) {
      cleanupScheduled = true;
      setTimeout(async () => {
        try {
          // Run cleanup for temp files and safety check for backups
          await cleanupTempAndBackups();
          await immediateCleanupTempFiles(); // Clean up any stale temp files too
        } catch (error) {
          console.error(`[ManagedSite Error] Scheduled cleanup failed:`, error);
        } finally {
          cleanupScheduled = false;
        }
      }, 1000); // Reduced from 5 seconds to 1 second for faster cleanup
    }
  }

  // Main command dispatcher
  async function executeCloudCommand(commandData, context) {
    const { type, payload, requestId } = commandData;
    const { transferSessions, activeChunks, auditLog } = context;

    // Only log non-chunk commands to reduce I/O during critical data transfer
    const isChunkCommand = type === 'upload_chunk' || type === 'download_chunk';
    if (!isChunkCommand) {
      console.log(`[ManagedSite] Executing cloud command: ${type} - RequestId: ${requestId}`);
    }

    // Audit log the command
    auditLog('command_received', {
      type,
      requestId,
      timestamp: new Date().toISOString(),
      payload: payload ? Object.keys(payload) : null
    });

    try {
      let result;

      switch (type) {
        case 'ping':
          result = await handlePingCommand(payload);
          break;

        case 'get_status':
          result = await handleGetStatusCommand(payload, context);
          break;

        case 'update_file':
          result = await handleUpdateFileCommand(payload);
          break;

        case 'sync_files':
          result = await handleSyncFilesCommand(payload);
          break;

        case 'sync_folder':
          result = await handleSyncFolderCommand(payload);
          break;

        case 'start_chunked_transfer':
          result = await handleStartChunkedTransferCommand(payload, context);
          break;

        case 'upload_chunk':
          result = await handleUploadChunkCommand(payload, context);
          break;

        case 'download_chunk':
          result = await handleDownloadChunkCommand(payload, context);
          break;

        case 'finalize_transfer':
          result = await handleFinalizeTransferCommand(payload, context);
          break;

        case 'get_transfer_status':
          result = await handleGetTransferStatusCommand(payload, context);
          break;

        case 'cancel_transfer':
          result = await handleCancelTransferCommand(payload, context);
          break;

        case 'resume_transfer':
          result = await handleResumeTransferCommand(payload, context);
          break;

        case 'enhanced_sync_files':
          result = await handleEnhancedSyncFilesCommand(payload);
          break;

        case 'restart_service':
          result = await handleRestartServiceCommand(payload);
          break;

        case 'get_logs':
          result = await handleGetLogsCommand(payload);
          break;

        case 'get_instance_info':
          result = await handleGetInstanceInfoCommand(payload, context);
          break;

        case 'get_available_folders':
          result = await handleGetAvailableFoldersCommand(payload);
          break;

        case 'get_browse':
          result = await handleGetBrowseCommand(payload);
          break;

        case 'sync_file':
          result = await handleSyncFileCommand(payload);
          break;

        case 'read_file_content':
          result = await handleReadFileContentCommand(payload);
          break;

        case 'get_recursive_files':
          result = await handleGetRecursiveFilesCommand(payload);
          break;

        case 'cleanup':
          result = await handleCleanupCommand(payload);
          break;

        case 'check_file_sync_status':
          result = await handleCheckFileSyncStatusCommand(payload, context);
          break;

        case 'update_sync_status_cache':
          result = await handleUpdateSyncStatusCacheCommand(payload, context);
          break;

        case 'get_instance_id':
          result = await handleGetInstanceIdCommand(payload, context);
          break;

        case 'execute_doh_operation': // Changed from execute_cli_command
          result = await handleExecuteDohOperationCommand(payload, context); // Renamed handler
          break;

        // Git command handlers
        case 'discover_git_repos':
          result = await gitHandlers.handleDiscoverGitReposCommand(payload);
          break;

        case 'get_git_status':
          result = await gitHandlers.handleGetGitStatusCommand(payload);
          break;

        case 'git_status_raw':
          result = await gitHandlers.handleGitStatusRawCommand(payload);
          break;

        case 'git_stage_files':
          result = await gitHandlers.handleGitStageFilesCommand(payload);
          break;

        case 'git_unstage_files':
          result = await gitHandlers.handleGitUnstageFilesCommand(payload);
          break;

        case 'git_commit':
          result = await gitHandlers.handleGitCommitCommand(payload);
          break;

        case 'git_pull':
          result = await gitHandlers.handleGitPullCommand(payload);
          break;

        case 'git_push':
          result = await gitHandlers.handleGitPushCommand(payload);
          break;

        case 'git_branch_list':
          result = await gitHandlers.handleGitBranchListCommand(payload);
          break;

        case 'git_diff':
          result = await gitHandlers.handleGitDiffCommand(payload);
          break;

        case 'git_init':
          result = await gitHandlers.handleGitInitCommand(payload);
          break;

        case 'get_git_audit_log':
          result = await gitHandlers.handleGetGitAuditLogCommand(payload);
          break;

        case 'clear_git_caches':
          result = await gitHandlers.handleClearGitCachesCommand(payload);
          break;

        default:
          throw new Error(`Unknown command type: ${type}`);
      }

      // Audit log successful execution
      auditLog('command_executed', {
        type,
        requestId,
        timestamp: new Date().toISOString(),
        success: true,
        result: typeof result === 'object' ? Object.keys(result) : result
      });

      // Only log completion for non-chunk commands
      if (!isChunkCommand) {
        console.log(`[ManagedSite] Command executed successfully: ${type} - RequestId: ${requestId}`);
      }

      return result;

    } catch (error) {
      // Audit log failed execution
      auditLog('command_failed', {
        type,
        requestId,
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message
      });

      // Always log errors, even for chunk commands
      console.error(`[ManagedSite Error] command_execution: ${error.message} - Type: ${type}, RequestId: ${requestId}`);

      throw error;
    }
  }

  // Command Handlers

  async function handlePingCommand(payload) {
    return {
      type: 'pong',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      echo: payload?.echo || null
    };
  }

  async function handleGetStatusCommand(payload, context) {
    const { isInstanceAnchored, getCloudConnectionStatus, getCloudFingerprint } = context;
    
    // Use existing status logic
    const fingerprint = await getCloudFingerprint();
    const memoryFormatted = Doh.memoryUsed ? Doh.memoryUsed() : 'N/A';
    const cpuFormatted = Doh.cpuUsage ? Doh.cpuUsage() : 'N/A';
    const memoryRaw = Doh.performance?.heapUsed ? Doh.performance.heapUsed() : null;
    const cpuRaw = Doh.performance?.cpuUsage ? Doh.performance.cpuUsage() : null;
    const isAnchored = await isInstanceAnchored();
    const cloudStatus = getCloudConnectionStatus();

    return {
      status: 'online',
      fingerprint,
      pid: process.pid,
      memoryFormatted,
      cpuFormatted,
      memoryRaw,
      cpuRaw,
      cloud: cloudStatus,
      uptime: process.uptime(),
      nodeVersion: process.version
    };
  }

  async function handleUpdateFileCommand(payload) {
    const { filePath, content, encoding = 'utf8', backup = true } = payload;

    if (!filePath || content === undefined) {
      throw new Error('Missing required parameters: filePath and content');
    }

    // Security: Validate file path is within project directory
    const resolvedPath = DohPath(filePath);
    const projectRoot = DohPath('/');
    
    if (!resolvedPath.startsWith(projectRoot)) {
      throw new Error('File path outside project directory is not allowed');
    }

    try {
      // Create backup if requested using proper backup directory
      if (backup && fs.existsSync(resolvedPath)) {
        await createManagedBackup(resolvedPath);
      }

      // Write the new content with appropriate encoding
      await fs.ensureDir(DohPath.Dirname(resolvedPath));
      
      if (encoding === 'base64') {
        // Handle base64 encoded binary content
        const buffer = Buffer.from(content, 'base64');
        await fsp.writeFile(resolvedPath, buffer);
      } else {
        // Handle text content
        await fsp.writeFile(resolvedPath, content, encoding);
      }

      return {
        success: true,
        filePath: resolvedPath,
        size: typeof content === 'string' ? content.length : content.byteLength || content.length,
        encoding: encoding,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      throw new Error(`File update failed: ${error.message}`);
    }
  }

  async function handleSyncFilesCommand(payload) {
    const { files } = payload;

    if (!Array.isArray(files)) {
      throw new Error('Files parameter must be an array');
    }

    const results = [];

    for (const fileData of files) {
      try {
        const result = await handleUpdateFileCommand(fileData);
        results.push({ ...result, path: fileData.filePath });
      } catch (error) {
        results.push({
          success: false,
          path: fileData.filePath,
          error: error.message
        });
      }
    }

    return {
      totalFiles: files.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  async function handleSyncFolderCommand(payload) {
    const { sourcePath, targetPath, options = {} } = payload;

    if (!sourcePath || !targetPath) {
      throw new Error('Missing required parameters: sourcePath and targetPath');
    }

    // Enhanced exclusion patterns for entire install sync
    const defaultExcludePatterns = ['.git', '.doh', 'node_modules', '.DS_Store'];
    const entireInstallExcludePatterns = [
      '.git', '.doh', 'node_modules', '.DS_Store', 
      // '.env', '.env.local', '.env.production', '.env.development',
      'logs', 'tmp', 'temp', 'cache', 'coverage', 
      '.nyc_output', '.pytest_cache', '__pycache__',
      'dist', 'build', '.next', '.nuxt', '.vuepress',
      '*.log', '*.pid', '*.seed', '*.pid.lock',
      'Thumbs.db', 'ehthumbs.db', 'Desktop.ini'
    ];

    const {
      recursive = true,
      includeHidden = false,
      excludePatterns = sourcePath === './' ? entireInstallExcludePatterns : defaultExcludePatterns,
      createBackups = true,
      verifyIntegrity = true
    } = options;

    // Security: Validate paths are within project directory
    const resolvedSourcePath = DohPath(sourcePath);
    const resolvedTargetPath = DohPath(targetPath);
    const projectRoot = DohPath('/');
    
    if (!resolvedSourcePath.startsWith(projectRoot) || !resolvedTargetPath.startsWith(projectRoot)) {
      throw new Error('Source or target path outside project directory is not allowed');
    }

    try {
      // Check if source exists and is a directory
      if (!fs.existsSync(resolvedSourcePath)) {
        throw new Error(`Source folder does not exist: ${sourcePath}`);
      }

      const sourceStats = await fsp.stat(resolvedSourcePath);
      if (!sourceStats.isDirectory()) {
        throw new Error(`Source path is not a directory: ${sourcePath}`);
      }

      // Ensure target directory exists
      await fs.ensureDir(resolvedTargetPath);

      // Read source folder contents with appropriate filtering
      const filesToSync = await readFolderContents(resolvedSourcePath, {
        recursive,
        includeHidden,
        excludePatterns,
        basePath: resolvedSourcePath
      });

      const syncType = sourcePath === './' ? 'entire Doh installation' : 'folder';

      // Prepare files for enhanced sync
      const filesForSync = [];
      for (const file of filesToSync) {
        try {
          // Detect if file is binary or text
          const isBinary = await isFileBinary(file.fullPath);
          let content;
          let encoding = 'utf8';

          if (isBinary) {
            // Read binary files as base64
            content = await fsp.readFile(file.fullPath, 'base64');
            encoding = 'base64';
          } else {
            // Read text files as UTF-8
            content = await fsp.readFile(file.fullPath, 'utf8');
            encoding = 'utf8';
          }
          
          // Calculate relative path and target path
          const relativePath = file.relativePath;
          const targetFilePath = DohPath.Join(targetPath, relativePath);

          filesForSync.push({
            filePath: targetFilePath,
            content: content,
            encoding: encoding,
            backup: createBackups,
            checksum: verifyIntegrity ? await calculateFileChecksum(file.fullPath) : null
          });
        } catch (error) {
          console.warn(`[ManagedSite] Skipping file due to error - File: ${file.relativePath}, Error: ${error.message}`);
        }
      }

      // Use enhanced sync to transfer all files
      const syncResult = await handleEnhancedSyncFilesCommand({
        files: filesForSync,
        options: {
          atomic: false, // Don't use atomic for large folder operations
          continueOnError: true,
          createBackups,
          verifyIntegrity
        }
      });

      const summary = {
        success: true,
        operation: sourcePath === './' ? 'sync_entire_install' : 'sync_folder',
        sourcePath,
        targetPath,
        totalFiles: filesToSync.length,
        successful: syncResult.successful,
        failed: syncResult.failed,
        filesProcessed: filesForSync.length,
        excludePatterns: excludePatterns,
        timestamp: new Date().toISOString()
      };

      // Immediate cleanup of temp files after successful sync operation
      try {
        await immediateCleanupTempFiles(sourcePath);
      } catch (cleanupError) {
        console.warn(`[ManagedSite] Immediate temp cleanup failed for sync ${sourcePath}: ${cleanupError.message}`);
      }

      return summary;

    } catch (error) {
      console.error(`[ManagedSite Error] folder_sync: ${error.message} - Source: ${sourcePath}, Target: ${targetPath}`);
      throw error;
    }
  }

  // Helper function to read folder contents recursively
  async function readFolderContents(folderPath, options = {}) {
    const {
      recursive = true,
      includeHidden = false,
      excludePatterns = [],
      basePath = folderPath
    } = options;

    const files = [];

    // Helper function to match patterns (including wildcards)
    function matchesExcludePattern(fileName, patterns) {
      return patterns.some(pattern => {
        // Handle wildcard patterns
        if (pattern.includes('*')) {
          const regexPattern = pattern
            .replace(/\./g, '\\.')    // Escape dots
            .replace(/\*/g, '.*');    // Convert * to .*
          const regex = new RegExp(`^${regexPattern}$`, 'i');
          return regex.test(fileName);
        }
        // Handle exact matches
        return fileName === pattern || fileName.includes(pattern);
      });
    }

    async function scanDirectory(currentPath, relativePath = '') {
      try {
        const entries = await fsp.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = DohPath.Join(currentPath, entry.name);
          const currentRelativePath = relativePath ? DohPath.Join(relativePath, entry.name) : entry.name;

          // IMPORTANT: Use the SAME filtering logic as handleGetBrowseCommand for consistency
          // Skip hidden files and system directories (SAME as browse command)
          if (entry.name.startsWith('.') || 
              entry.name === 'node_modules' || 
              entry.name === 'dist' || 
              entry.name === 'build') {
            continue;
          }

          // Skip excluded patterns (check both filename and relative path)
          if (matchesExcludePattern(entry.name, excludePatterns) || 
              matchesExcludePattern(currentRelativePath, excludePatterns)) {
            continue;
          }

          if (entry.isFile()) {
            files.push({
              name: entry.name,
              fullPath: fullPath,
              relativePath: currentRelativePath,
              size: (await fsp.stat(fullPath)).size
            });
          } else if (entry.isDirectory() && recursive) {
            await scanDirectory(fullPath, currentRelativePath);
          }
        }
      } catch (error) {
        console.warn(`[ManagedSite] Error scanning directory - Path: ${currentPath}, Error: ${error.message}`);
      }
    }

    await scanDirectory(folderPath);
    return files;
  }

  // Helper function to detect if a file is binary
  async function isFileBinary(filePath) {
    try {
      // Read the first chunk of the file to analyze
      const sampleSize = 8192; // 8KB sample
      const buffer = Buffer.alloc(sampleSize);
      const fileHandle = await fsp.open(filePath, 'r');
      
      let bytesRead = 0;
      try {
        const result = await fileHandle.read(buffer, 0, sampleSize, 0);
        bytesRead = result.bytesRead;
      } finally {
        await fileHandle.close();
      }

      // If file is empty, consider it text
      if (bytesRead === 0) {
        return false;
      }

      // Check for common binary file extensions first
      const binaryExtensions = [
        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg',
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
        '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
        '.exe', '.dll', '.so', '.dylib',
        '.mp3', '.mp4', '.avi', '.mov', '.wmv',
        '.woff', '.woff2', '.ttf', '.otf', '.eot'
      ];

      const ext = DohPath.Basename(filePath).toLowerCase();
      const fileExtension = ext.substring(ext.lastIndexOf('.'));
      
      if (binaryExtensions.includes(fileExtension)) {
        return true;
      }

      // Check for null bytes (common indicator of binary content)
      const sample = buffer.slice(0, bytesRead);
      for (let i = 0; i < bytesRead; i++) {
        if (sample[i] === 0) {
          return true;
        }
      }

      // Check for high percentage of non-printable characters
      let nonPrintableCount = 0;
      for (let i = 0; i < bytesRead; i++) {
        const byte = sample[i];
        // Consider non-printable if not ASCII printable (except common whitespace)
        if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
          nonPrintableCount++;
        } else if (byte > 126) {
          nonPrintableCount++;
        }
      }

      // If more than 30% non-printable characters, consider it binary
      const nonPrintableRatio = nonPrintableCount / bytesRead;
      return nonPrintableRatio > 0.3;

    } catch (error) {
      console.warn(`[ManagedSite] Error detecting file type - File: ${filePath}, Error: ${error.message}`);
      // Default to text if we can't determine
      return false;
    }
  }

  // File integrity verification functions
  async function calculateFileChecksum(filePath, algorithm = 'sha256') {
    return new Promise((resolve, reject) => {
      const hash = CryptoAPI.createHash(algorithm);
      const stream = fs.createReadStream(filePath);

      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async function calculateBufferChecksum(buffer, algorithm = 'sha256') {
    const hash = CryptoAPI.createHash(algorithm);
    hash.update(buffer);
    return hash.digest('hex');
  }

  // Transfer session command handlers
  async function handleStartChunkedTransferCommand(payload, context) {
    const { operation, files, options = {} } = payload;
    const { transferSessions, activeChunks, createTransferSession, getOptimalChunkSize } = context;

    if (!operation || !files || !Array.isArray(files)) {
      throw new Error('Missing required parameters: operation and files array');
    }

    // Validate operation type
    if (!['upload', 'download', 'sync'].includes(operation)) {
      throw new Error('Invalid operation type. Must be upload, download, or sync');
    }

    // Generate unique transfer ID
    const transferId = CryptoAPI.randomUUID();

    // Validate and prepare files
    const preparedFiles = [];
    for (const file of files) {
      if (!file.path) {
        throw new Error('Invalid file data: path is required');
      }

      // Security: Validate file path is within project directory
      const resolvedPath = DohPath(file.path);
      const projectRoot = DohPath('/');
      
      if (!resolvedPath.startsWith(projectRoot)) {
        throw new Error(`File path outside project directory: ${file.path}`);
      }

      let fileSize = file.size;
      
      // For download operations, determine actual file size if not provided or is 0
      if (operation === 'download' && (!fileSize || fileSize === 0)) {
        try {
          const stats = await fsp.stat(resolvedPath);
          fileSize = stats.size;
        } catch (error) {
          throw new Error(`Cannot access file for download: ${file.path} - ${error.message}`);
        }
      } else if (!fileSize && fileSize !== 0) {
        throw new Error(`Invalid file data: size is required for ${operation} operations`);
      }

      // For upload operations with ensureDirectory option, create target directory structure
      if (operation === 'upload' && options.ensureDirectory) {
        try {
          const targetDir = DohPath.Dirname(resolvedPath);
          if (targetDir && targetDir !== '/' && targetDir !== '.') {
            await fs.ensureDir(targetDir);
          }
        } catch (error) {
          console.warn(`[ManagedSite] Warning: Could not ensure target directory for ${file.path}: ${error.message}`);
          // Continue anyway - finalize_transfer will also try to create directories
        }
      }

      // Capture source file metadata for sync tracking
      let sourceMtime = null;
      let sourceSize = fileSize;
      let sourceInstanceId = null;
      
      // If source metadata is provided in file data, use it
      if (file.sourceMtime) {
        sourceMtime = file.sourceMtime;
      }
      if (file.sourceSize) {
        sourceSize = file.sourceSize;
      }
      if (file.sourceInstanceId) {
        sourceInstanceId = file.sourceInstanceId;
      }
      
      // For download operations, get source metadata from the actual file
      if (operation === 'download') {
        try {
          const sourceStats = await fsp.stat(resolvedPath);
          sourceMtime = sourceStats.mtime.toISOString();
          sourceSize = sourceStats.size;
          
          // Get current instance ID as source instance for downloads
          const fingerprintData = context.fingerprintData || {};
          const userId = fingerprintData.userId || 'unknown';
          const fingerprint = fingerprintData.fingerprint || 'unknown';
          sourceInstanceId = `${userId}_${fingerprint}`;  // Use underscore format consistently
        } catch (error) {
          console.warn(`[ManagedSite] Could not get source metadata for download ${file.path}: ${error.message}`);
        }
      }

      preparedFiles.push({
        path: file.path,
        resolvedPath,
        size: fileSize,
        encoding: file.encoding || 'binary',
        checksum: file.checksum || null,
        // Source metadata for sync tracking
        sourceMtime,
        sourceSize,
        sourceInstanceId
      });
    }

    // Create transfer session
    const session = createTransferSession(transferId, operation, preparedFiles);
    transferSessions.set(transferId, session);
    activeChunks.set(transferId, new Set());

    // Ensure temp directory exists
    const tempDir = DohPath('/.doh/temp');
    await fs.ensureDir(tempDir);

    // ENHANCED: Pre-create temp file paths for upload operations to avoid race conditions
    if (operation === 'upload') {
      for (let fileIndex = 0; fileIndex < preparedFiles.length; fileIndex++) {
        const file = session.files[fileIndex];
        
        // Pre-create temp file path - same logic as in handleUploadChunkCommand
        const safePath = file.path.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/^_+|_+$/g, '');
        file.tempPath = DohPath.Join(tempDir, `transfer_${transferId}_${fileIndex}_${safePath}`);
        
        // Ensure the temp file directory structure exists
        await fs.ensureDir(DohPath.Dirname(file.tempPath));
        
        // Initialize chunk tracking
        file.chunkStatus = {
          lastLoggedChunk: -1,
          lastLoggedPercent: -1,
          startTime: Date.now(),
          chunksPerSecond: 0,
          tempPathCreated: true
        };
        
        // Log source metadata for debugging
        if (file.sourceMtime) {
          // console.log(`[ManagedSite] Source metadata captured - File: ${file.path}, SourceMtime: ${file.sourceMtime}, SourceInstanceId: ${file.sourceInstanceId || 'N/A'}`);
        }
      }
    }

    // FIXED: Calculate actual chunk arrays for each file instead of just optimal chunk sizes
    const fileChunkArrays = preparedFiles.map(file => {
      const optimalChunkSize = getOptimalChunkSize(file.size);
      const totalChunks = Math.ceil(file.size / optimalChunkSize);
      
      // Create array with actual chunk sizes (last chunk may be smaller)
      const chunkSizes = [];
      for (let i = 0; i < totalChunks; i++) {
        const isLastChunk = (i === totalChunks - 1);
        const chunkSize = isLastChunk ? 
          (file.size - (i * optimalChunkSize)) : // Last chunk gets remainder
          optimalChunkSize; // Normal chunks get optimal size
        chunkSizes.push(chunkSize);
      }
      
      return chunkSizes;
    });

    return {
      success: true,
      transferId,
      operation,
      totalFiles: preparedFiles.length,
      totalBytes: session.progress.totalBytes,
      chunkSizes: fileChunkArrays[0] || [], // For streaming, we expect single file, so return first file's chunks
      message: 'Transfer session created successfully'
    };
  }

  async function handleUploadChunkCommand(payload, context) {
    const { transferId, fileIndex, chunkIndex, chunkData, chunkChecksum } = payload;
    const { transferSessions, updateTransferProgress } = context;

    if (!transferId || fileIndex === undefined || chunkIndex === undefined || !chunkData) {
      throw new Error('Missing required parameters: transferId, fileIndex, chunkIndex, chunkData');
    }

    const session = transferSessions.get(transferId);
    if (!session) {
      throw new Error('Transfer session not found');
    }

    if (session.status === 'cancelled') {
      throw new Error('Transfer has been cancelled');
    }

    if (fileIndex >= session.files.length) {
      throw new Error('Invalid file index');
    }

    const file = session.files[fileIndex];
    const expectedChunks = file.chunks;

    if (chunkIndex >= expectedChunks) {
      throw new Error('Invalid chunk index');
    }

    // DEBUG: Track chunk upload activity
    // if (chunkIndex === 0) {
    //   console.log(`[ManagedSite] 🔄 Starting chunk upload for ${file.path} (Transfer: ${transferId})`);
    // }

    // Initialize chunk tracking for this file if not exists (fallback if not pre-created)
    if (!file.chunkStatus) {
      file.chunkStatus = {
        lastLoggedChunk: -1,
        lastLoggedPercent: -1,
        startTime: Date.now(),
        chunksPerSecond: 0,
        tempPathCreated: false
      };
      console.log(`[ManagedSite] ⚠️  Chunk tracking not pre-initialized for ${file.path} - creating fallback`);
    }

    // Convert base64 chunk data to buffer with better error handling
    let chunkBuffer;
    try {
      if (typeof chunkData !== 'string') {
        throw new Error('Chunk data must be a base64 string');
      }
      chunkBuffer = Buffer.from(chunkData, 'base64');
      
      // Validate that we got some data
      if (chunkBuffer.length === 0) {
        throw new Error('Chunk data is empty after base64 decoding');
      }
    } catch (error) {
      throw new Error(`Invalid chunk data format for chunk ${chunkIndex}: ${error.message}`);
    }

    // Verify chunk integrity if checksum provided
    if (Doh.pod.cloud.file_sync.integrity_check && chunkChecksum) {
      const calculatedChecksum = await calculateBufferChecksum(chunkBuffer);
      if (calculatedChecksum !== chunkChecksum) {
        throw new Error(`Chunk integrity verification failed for chunk ${chunkIndex}`);
      }
    }

    // Set up temp file path if not exists - ensure this persists across chunks (fallback)
    if (!file.tempPath) {
      const tempDir = DohPath('/.doh/temp');
      // Make temp filename more unique and safer
      const safePath = file.path.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/^_+|_+$/g, '');
      file.tempPath = DohPath.Join(tempDir, `transfer_${transferId}_${fileIndex}_${safePath}`);
      await fs.ensureDir(DohPath.Dirname(file.tempPath));
      // This is a fallback - should have been pre-created
      console.log(`[ManagedSite] ⚠️  Fallback temp path creation for ${file.path}: ${file.tempPath}`);
      file.chunkStatus.tempPathCreated = false;
    }

    // Write chunk to temp file at correct position
    const chunkOffset = chunkIndex * file.chunkSize;

    try {
      let fileHandle;
      
      // For first chunk, always create new file. For subsequent chunks, append/update existing file
      if (chunkIndex === 0) {
        // First chunk - create new file
        fileHandle = await fsp.open(file.tempPath, 'w+');
      } else {
        // Subsequent chunks - open existing file or create if somehow missing
        try {
          fileHandle = await fsp.open(file.tempPath, 'r+');
        } catch (openError) {
          console.warn(`[ManagedSite] Temp file missing for chunk ${chunkIndex}, recreating: ${file.tempPath}`);
          fileHandle = await fsp.open(file.tempPath, 'w+');
        }
      }

      // Write the chunk at the correct offset
      await fileHandle.write(chunkBuffer, 0, chunkBuffer.length, chunkOffset);
      await fileHandle.close();

      // Verify the file exists after writing
      if (!fs.existsSync(file.tempPath)) {
        throw new Error(`Temp file disappeared after writing chunk ${chunkIndex}: ${file.tempPath}`);
      }

      // Track transferred chunk
      file.transferredChunks.add(chunkIndex);

      // Update progress
      updateTransferProgress(transferId, chunkBuffer.length);

      // Update session status
      session.status = 'transferring';
      session.updated = new Date().toISOString();

      // Efficient progress logging - only log every 20 chunks OR every 10% progress OR on completion
      const currentPercent = Math.floor((file.transferredChunks.size / expectedChunks) * 100);
      const shouldLogProgress = (
        chunkIndex === 0 ||  // Always log first chunk
        file.transferredChunks.size === expectedChunks ||  // Always log completion
        (chunkIndex - file.chunkStatus.lastLoggedChunk) >= 20 ||  // Every 20 chunks
        (currentPercent - file.chunkStatus.lastLoggedPercent) >= 10  // Every 10% progress
      );

      if (shouldLogProgress) {
        // Calculate transfer rate
        const elapsedSeconds = (Date.now() - file.chunkStatus.startTime) / 1000;
        const chunksPerSecond = elapsedSeconds > 0 ? (file.transferredChunks.size / elapsedSeconds).toFixed(1) : 0;
        

        
        file.chunkStatus.lastLoggedChunk = chunkIndex;
        file.chunkStatus.lastLoggedPercent = currentPercent;
      }

      return {
        success: true,
        transferId,
        fileIndex,
        chunkIndex,
        totalChunks: expectedChunks,
        transferredChunks: file.transferredChunks.size,
        fileComplete: file.transferredChunks.size === expectedChunks,
        progress: session.progress
      };

    } catch (error) {
      console.error(`[ManagedSite Error] chunk_upload: ${error.message} - TransferId: ${transferId}, Chunk: ${chunkIndex}/${expectedChunks}, TempPath: ${file.tempPath || 'none'}`);
      throw new Error(`Chunk upload failed for chunk ${chunkIndex}: ${error.message}`);
    }
  }

  async function handleDownloadChunkCommand(payload, context) {
    const { transferId, chunkIndex } = payload;
    const { transferSessions, getOptimalChunkSize } = context;

    if (!transferId || chunkIndex === undefined) {
      throw new Error('Missing required parameters: transferId, chunkIndex');
    }

    const session = transferSessions.get(transferId);
    if (!session) {
      throw new Error('Transfer session not found');
    }

    if (session.status === 'cancelled') {
      throw new Error('Transfer has been cancelled');
    }

    if (session.operation !== 'download') {
      throw new Error('Invalid operation type for download_chunk');
    }

    // For download operations, we assume single file transfers
    if (session.files.length === 0) {
      throw new Error('No files in transfer session');
    }

    const file = session.files[0];
    const filePath = file.resolvedPath;

    try {
      // Ensure file exists and get stats
      const stats = await fsp.stat(filePath);
      const fileSize = stats.size;
      const chunkSize = getOptimalChunkSize(fileSize);
      const totalChunks = Math.ceil(fileSize / chunkSize);

      if (chunkIndex >= totalChunks) {
        throw new Error(`Invalid chunk index: ${chunkIndex}/${totalChunks}`);
      }

      // Calculate chunk position and size
      const startPos = chunkIndex * chunkSize;
      const endPos = Math.min(startPos + chunkSize, fileSize);
      const actualChunkSize = endPos - startPos;

      // Read chunk from source file
      const fileHandle = await fsp.open(filePath, 'r');
      const buffer = Buffer.alloc(actualChunkSize);
      const { bytesRead } = await fileHandle.read(buffer, 0, actualChunkSize, startPos);
      await fileHandle.close();

      if (bytesRead !== actualChunkSize) {
        throw new Error(`Read size mismatch: expected ${actualChunkSize}, got ${bytesRead}`);
      }

      // Convert buffer to base64 for transmission
      const chunkData = buffer.toString('base64');

      // Calculate checksum for this chunk
      const chunkChecksum = await calculateBufferChecksum(buffer);

      // Track sent chunk (for download operations, this represents chunks sent out)
      file.transferredChunks.add(chunkIndex);

      // Update session progress
      session.progress.chunksTransferred++;
      session.progress.bytesTransferred += bytesRead;

      return {
        success: true,
        transferId,
        chunkIndex,
        totalChunks,
        chunkSize: bytesRead,
        chunkData,
        chunkChecksum,
        encoding: 'base64',
        progress: {
          bytesTransferred: session.progress.bytesTransferred,
          totalBytes: fileSize,
          chunksTransferred: session.progress.chunksTransferred,
          totalChunks,
          percentComplete: Math.round((session.progress.bytesTransferred / fileSize) * 100)
        }
      };

    } catch (error) {
      console.error(`[ManagedSite Error] download_chunk: ${error.message} - TransferId: ${transferId}, Chunk: ${chunkIndex}`);
      throw new Error(`Failed to download chunk: ${error.message}`);
    }
  }

  async function handleFinalizeTransferCommand(payload, context) {
    const { transferId, verifyIntegrity = true } = payload;
    const { transferSessions, cleanupTransferSession, cloudSocket } = context;

    if (!transferId) {
      throw new Error('Missing required parameter: transferId');
    }

    const session = transferSessions.get(transferId);
    if (!session) {
      throw new Error('Transfer session not found');
    }

    if (session.status === 'cancelled') {
      throw new Error('Transfer has been cancelled');
    }

    // ENHANCED: Debug session state before processing
    // console.log(`[ManagedSite] 🔍 Finalizing transfer ${transferId} - Operation: ${session.operation}, Files: ${session.files.length}`);
    
    try {
      const results = [];

      // Handle download operations differently - they don't use temp files
      if (session.operation === 'download') {
        // For downloads, we just need to verify all chunks were sent successfully
        for (let fileIndex = 0; fileIndex < session.files.length; fileIndex++) {
          const file = session.files[fileIndex];
          
          // console.log(`[ManagedSite] 🔍 Download File ${fileIndex}: ${file.path}`);
          // console.log(`[ManagedSite] 🔍   Expected chunks: ${file.chunks}, Sent: ${file.transferredChunks.size}`);
          
          // Check if all chunks were sent
          if (file.transferredChunks.size !== file.chunks) {
            const missingChunks = file.chunks - file.transferredChunks.size;
            throw new Error(`Incomplete download for file ${file.path}: ${file.transferredChunks.size}/${file.chunks} chunks sent (${missingChunks} missing)`);
          }

          // Verify the source file still exists and get final stats
          let finalChecksum = null;
          let finalSize = file.size;
          
          if (fs.existsSync(file.resolvedPath)) {
            const stats = await fsp.stat(file.resolvedPath);
            finalSize = stats.size;
            
            if (verifyIntegrity && Doh.pod.cloud.file_sync.integrity_check) {
              finalChecksum = await calculateFileChecksum(file.resolvedPath);
            }
          } else {
            console.warn(`[ManagedSite] Source file no longer exists: ${file.resolvedPath}`);
          }

          file.status = 'completed';
          file.checksum = finalChecksum;

          results.push({
            path: file.path,
            size: finalSize,
            checksum: finalChecksum,
            chunks: file.chunks,
            status: 'completed',
            operation: 'download'
          });
        }
        
        console.log(`[ManagedSite] ✅ DOWNLOAD COMPLETED - All ${session.files.length} file(s) sent successfully`);
        
      } else {
        // Handle upload operations with temp file processing (existing logic)
        for (let fileIndex = 0; fileIndex < session.files.length; fileIndex++) {
          const file = session.files[fileIndex];
          
          // ENHANCED: Detailed file debug info
          // console.log(`[ManagedSite] 🔍 Upload File ${fileIndex}: ${file.path}`);
          // console.log(`[ManagedSite] 🔍   Expected chunks: ${file.chunks}, Received: ${file.transferredChunks.size}`);
          // console.log(`[ManagedSite] 🔍   Temp path: ${file.tempPath || 'NOT_SET'}`);
          // console.log(`[ManagedSite] 🔍   Chunk status: ${file.chunkStatus ? 'EXISTS' : 'NOT_SET'}`);
          // if (file.tempPath) {
          //   console.log(`[ManagedSite] 🔍   Temp file exists: ${fs.existsSync(file.tempPath)}`);
          // }

          // Check if all chunks received
          if (file.transferredChunks.size !== file.chunks) {
            // Provide more detailed error information
            const missingChunks = file.chunks - file.transferredChunks.size;
            throw new Error(`Incomplete transfer for file ${file.path}: ${file.transferredChunks.size}/${file.chunks} chunks received (${missingChunks} missing). This usually indicates network issues or timeouts during upload.`);
          }

          // Ensure temp path exists before proceeding
          if (!file.tempPath) {
            // ENHANCED: Better diagnostics for missing temp path
            const tempDir = DohPath('/.doh/temp');
            const existingTempFiles = fs.existsSync(tempDir) ? await fsp.readdir(tempDir) : [];
            const transferTempFiles = existingTempFiles.filter(f => f.includes(transferId));
            
            const diagnosticInfo = {
              transferId,
              fileIndex,
              filePath: file.path,
              sessionFileCount: session.files.length,
              tempDirExists: fs.existsSync(tempDir),
              totalTempFiles: existingTempFiles.length,
              transferTempFiles: transferTempFiles.length,
              transferTempFileNames: transferTempFiles,
              chunkStatusExists: !!file.chunkStatus,
              chunksReceivedSize: file.transferredChunks.size,
              expectedChunks: file.chunks
            };
            
            console.error(`[ManagedSite Error] Missing temp path diagnostic:`, diagnosticInfo);
            
            throw new Error(`No temporary file found for ${file.path} - transfer may not have started properly. This can happen if no chunks were successfully uploaded or if temp files were cleaned up prematurely. TransferId: ${transferId}, Chunks received: ${file.transferredChunks.size}/${file.chunks}`);
          }

          // Additional safety check - ensure temp file actually exists on disk
          if (!fs.existsSync(file.tempPath)) {
            // ENHANCED: Better diagnostics for missing temp file
            const tempDir = DohPath('/.doh/temp');
            const existingTempFiles = fs.existsSync(tempDir) ? await fsp.readdir(tempDir) : [];
            const similarTempFiles = existingTempFiles.filter(f => f.includes(transferId) || f.includes(file.path.replace(/[^a-zA-Z0-9.-]/g, '_')));
            
            const diagnosticInfo = {
              expectedTempPath: file.tempPath,
              tempDirExists: fs.existsSync(tempDir),
              similarTempFiles,
              fileChunksReceived: file.transferredChunks.size,
              expectedChunks: file.chunks,
              chunkStatusExists: !!file.chunkStatus,
              tempPathCreatedFlag: file.chunkStatus?.tempPathCreated
            };
            
            console.error(`[ManagedSite Error] Missing temp file diagnostic:`, diagnosticInfo);
            
            throw new Error(`Temporary file missing from disk: ${file.tempPath}. This may indicate a cleanup race condition, disk space issue, or chunks were not properly written. TransferId: ${transferId}, Expected chunks: ${file.chunks}, Received: ${file.transferredChunks.size}`);
          }

          // Verify file integrity if enabled
          let finalChecksum = null;
          if (verifyIntegrity && Doh.pod.cloud.file_sync.integrity_check) {
            finalChecksum = await calculateFileChecksum(file.tempPath);

            if (file.checksum && finalChecksum !== file.checksum) {
              throw new Error(`File integrity verification failed for ${file.path}`);
            }
          }

          // Create backup if file exists
          if (fs.existsSync(file.resolvedPath)) {
            const backupPath = await createManagedBackup(file.resolvedPath);
          }

          // Ensure target directory exists
          await fs.ensureDir(DohPath.Dirname(file.resolvedPath));

          // Move temp file to final location
          await fs.move(file.tempPath, file.resolvedPath, { overwrite: true });

          file.status = 'completed';
          file.checksum = finalChecksum;

          results.push({
            path: file.path,
            size: file.size,
            checksum: finalChecksum,
            chunks: file.chunks,
            status: 'completed',
            operation: 'upload'
          });
        }
        
        console.log(`[ManagedSite] ✅ UPLOAD COMPLETED - All ${session.files.length} file(s) received and moved to final location`);
      }

      // Update session
      session.status = 'completed';
      session.updated = new Date().toISOString();
      session.progress.percentage = 100;

      // Emit completion event
      if (cloudSocket && cloudSocket.connected) {
        cloudSocket.emit('transfer_completed', {
          transferId,
          operation: session.operation,
          files: results,
          timestamp: session.updated
        });
      }

      // Schedule cleanup
      setTimeout(() => cleanupTransferSession(transferId, true), 60000); // 1 minute

      // Immediate cleanup of temp files after successful transfer
      try {
        await immediateCleanupTempFiles(transferId);
      } catch (cleanupError) {
        console.warn(`[ManagedSite] Immediate temp cleanup failed for transfer ${transferId}: ${cleanupError.message}`);
      }

      // Mark transfer as completed
      session.status = 'completed';
      session.completedAt = new Date();

      // Save summary stats for logging
      // const totalChunks = session.files.reduce((sum, f) => sum + f.chunks, 0);
      // const totalTimeSeconds = (Date.now() - session.progress.startTime) / 1000;
      // const transferRateMBps = ((session.progress.totalBytes / 1024 / 1024) / totalTimeSeconds).toFixed(2);
      // const chunksPerSecond = (totalChunks / totalTimeSeconds).toFixed(1);
      
      // Update sync status cache for uploaded files to track their current state
      if (session.operation === 'upload') {
        try {
          // Get instance ID for cache key
          const fingerprintData = context.fingerprintData || {};
          const userId = fingerprintData.userId || 'unknown';
          const fingerprint = fingerprintData.fingerprint || 'unknown';
          const instanceId = `${userId}_${fingerprint}`;  // Use underscore format consistently
          
          // Update cache for each uploaded file
          for (const file of session.files) {
            if (file.status === 'completed') {
              try {
                // Get the final local file stats
                const localStats = await fsp.stat(file.resolvedPath);
                
                // Capture source file information if available in the file metadata
                let sourceStats = null;
                let sourceInstanceId = null;
                
                if (file.sourceMtime) {
                  // Create a source stats object from metadata
                  sourceStats = {
                    mtime: new Date(file.sourceMtime),
                    size: file.sourceSize || file.size
                  };
                }
                
                if (file.sourceInstanceId) {
                  sourceInstanceId = file.sourceInstanceId;
                }
                
                // Update sync status cache with both local and remote information
                await updateSyncStatusCacheEntry(instanceId, file.path, localStats, sourceStats, sourceInstanceId);
                
                console.log(`[ManagedSite] Updated sync cache for ${file.path} - LocalMtime: ${localStats.mtime.toISOString()}, RemoteMtime: ${sourceStats?.mtime?.toISOString() || 'N/A'}`);
              } catch (statError) {
                console.warn(`[ManagedSite] Could not update sync cache for ${file.path}:`, statError.message);
              }
            }
          }
        } catch (cacheError) {
          console.warn('[ManagedSite] Error updating sync status cache after upload:', cacheError.message);
        }
      }

      return {
        success: true,
        transferId,
        operation: session.operation,
        files: results,
        totalBytes: session.progress.totalBytes,
        transferTime: Date.now() - session.progress.startTime,
        averageSpeed: session.progress.speed,
        message: `Transfer completed successfully - ${session.operation}`
      };

    } catch (error) {
      session.status = 'failed';
      session.error = error.message;
      session.updated = new Date().toISOString();

      // Clean up on failure
      cleanupTransferSession(transferId, false);

      console.error(`[ManagedSite Error] transfer_finalize: ${error.message} - TransferId: ${transferId}`);
      
      // Immediate cleanup of temp files after failure
      try {
        await immediateCleanupTempFiles(transferId);
      } catch (cleanupError) {
        console.warn(`[ManagedSite] Immediate temp cleanup failed for failed transfer ${transferId}: ${cleanupError.message}`);
      }
      
      throw error;
    }
  }

  async function handleGetTransferStatusCommand(payload, context) {
    const { transferId } = payload;
    const { transferSessions } = context;

    if (!transferId) {
      throw new Error('Missing required parameter: transferId');
    }

    const session = transferSessions.get(transferId);
    if (!session) {
      throw new Error('Transfer session not found');
    }

    const fileStatuses = session.files.map((file, index) => ({
      index,
      path: file.path,
      size: file.size,
      chunks: file.chunks,
      transferredChunks: file.transferredChunks.size,
      status: file.status,
      progress: file.transferredChunks.size / file.chunks * 100
    }));

    return {
      success: true,
      transferId,
      operation: session.operation,
      status: session.status,
      progress: session.progress,
      files: fileStatuses,
      created: session.created,
      updated: session.updated,
      error: session.error
    };
  }

  async function handleCancelTransferCommand(payload, context) {
    const { transferId } = payload;
    const { transferSessions, cleanupTransferSession, cloudSocket } = context;

    if (!transferId) {
      throw new Error('Missing required parameter: transferId');
    }

    const session = transferSessions.get(transferId);
    if (!session) {
      throw new Error('Transfer session not found');
    }

    if (session.status === 'completed') {
      throw new Error('Cannot cancel completed transfer');
    }

    // Update session status
    session.status = 'cancelled';
    session.updated = new Date().toISOString();

    // Emit cancellation event
    if (cloudSocket && cloudSocket.connected) {
      cloudSocket.emit('transfer_cancelled', {
        transferId,
        timestamp: session.updated
      });
    }

    // Clean up session
    await cleanupTransferSession(transferId, false);

    console.log(`[ManagedSite] Transfer cancelled - TransferId: ${transferId}`);

    // Immediate cleanup of temp files after cancellation
    try {
      await immediateCleanupTempFiles(transferId);
      console.log(`[ManagedSite] Immediate temp cleanup completed for cancelled transfer: ${transferId}`);
    } catch (cleanupError) {
      console.warn(`[ManagedSite] Immediate temp cleanup failed for cancelled transfer ${transferId}: ${cleanupError.message}`);
    }

    return {
      success: true,
      transferId,
      message: 'Transfer cancelled successfully'
    };
  }

  async function handleResumeTransferCommand(payload, context) {
    const { transferId } = payload;
    const { transferSessions, cloudSocket } = context;

    if (!transferId) {
      throw new Error('Missing required parameter: transferId');
    }

    const session = transferSessions.get(transferId);
    if (!session) {
      throw new Error('Transfer session not found');
    }

    if (session.status === 'completed') {
      throw new Error('Cannot resume completed transfer');
    }

    if (session.status === 'cancelled') {
      throw new Error('Cannot resume cancelled transfer');
    }

    // Analyze current state and prepare resume information
    const resumeInfo = {
      transferId,
      operation: session.operation,
      files: []
    };

    for (let fileIndex = 0; fileIndex < session.files.length; fileIndex++) {
      const file = session.files[fileIndex];
      const missingChunks = [];

      // Identify missing chunks
      for (let chunkIndex = 0; chunkIndex < file.chunks; chunkIndex++) {
        if (!file.transferredChunks.has(chunkIndex)) {
          missingChunks.push(chunkIndex);
        }
      }

      resumeInfo.files.push({
        fileIndex,
        path: file.path,
        size: file.size,
        totalChunks: file.chunks,
        chunkSize: file.chunkSize,
        transferredChunks: file.transferredChunks.size,
        missingChunks,
        complete: missingChunks.length === 0
      });
    }

    // Update session status
    session.status = 'resuming';
    session.updated = new Date().toISOString();

    // Emit resuming event
    if (cloudSocket && cloudSocket.connected) {
      cloudSocket.emit('transfer_resuming', {
        transferId,
        resumeInfo,
        timestamp: session.updated
      });
    }

    console.log(`[ManagedSite] Transfer resume analysis complete - TransferId: ${transferId}, Missing chunks: ${resumeInfo.files.reduce((sum, f) => sum + f.missingChunks.length, 0)}`);

    return {
      success: true,
      transferId,
      resumeInfo,
      totalMissingChunks: resumeInfo.files.reduce((sum, f) => sum + f.missingChunks.length, 0),
      message: 'Transfer resume information prepared'
    };
  }

  async function handleEnhancedSyncFilesCommand(payload) {
    const { files, options = {} } = payload;

    if (!Array.isArray(files)) {
      throw new Error('Files parameter must be an array');
    }

    const {
      atomic = true,
      continueOnError = false,
      createBackups = true,
      verifyIntegrity = true
    } = options;

    // Generate transaction ID for atomic operations
    const transactionId = CryptoAPI.randomUUID();
    const backupPaths = [];
    const processedFiles = [];



    try {
      // Phase 1: Validation and preparation
      for (let i = 0; i < files.length; i++) {
        const fileData = files[i];

        if (!fileData.filePath || fileData.content === undefined) {
          throw new Error(`File ${i}: Missing required parameters filePath and content`);
        }

        // Security: Validate file path is within project directory
        const resolvedPath = DohPath(fileData.filePath);
        const projectRoot = DohPath('/');
        
        if (!resolvedPath.startsWith(projectRoot)) {
          throw new Error(`File ${i}: Path outside project directory - ${fileData.filePath}`);
        }

        processedFiles.push({
          index: i,
          originalPath: fileData.filePath,
          resolvedPath,
          content: fileData.content,
          encoding: fileData.encoding || 'utf8',
          backup: fileData.backup !== false && createBackups,
          expectedChecksum: fileData.checksum || null
        });
      }

      // Phase 2: Create backups (if atomic mode)
      if (atomic && createBackups) {
        for (const file of processedFiles) {
          if (file.backup && fs.existsSync(file.resolvedPath)) {
            const backupPath = await createManagedBackup(file.resolvedPath);
            backupPaths.push({ original: file.resolvedPath, backup: backupPath });


          }
        }
      }

      // Phase 3: Process files
      const results = [];
      let hasErrors = false;

      for (const file of processedFiles) {
        try {
          // Create directory if needed
          await fs.ensureDir(DohPath.Dirname(file.resolvedPath));

          // Write content
          await fsp.writeFile(file.resolvedPath, file.content, file.encoding);

          // Verify integrity if required
          let actualChecksum = null;
          if (verifyIntegrity) {
            actualChecksum = await calculateFileChecksum(file.resolvedPath);

            if (file.expectedChecksum && actualChecksum !== file.expectedChecksum) {
              throw new Error(`Integrity verification failed - Expected: ${file.expectedChecksum}, Actual: ${actualChecksum}`);
            }
          }

          results.push({
            index: file.index,
            path: file.originalPath,
            resolvedPath: file.resolvedPath,
            size: file.content.length,
            checksum: actualChecksum,
            success: true,
            timestamp: new Date().toISOString()
          });



        } catch (error) {
          hasErrors = true;
          const fileError = {
            index: file.index,
            path: file.originalPath,
            resolvedPath: file.resolvedPath,
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
          };

          results.push(fileError);
          console.error(`[ManagedSite Error] File processing failed - Path: ${file.originalPath}, Error: ${error.message}`);

          // In atomic mode, fail fast
          if (atomic && !continueOnError) {
            throw new Error(`Atomic operation failed at file ${file.index}: ${error.message}`);
          }
        }
      }

      // Phase 4: Handle results
      if (atomic && hasErrors && !continueOnError) {
        // Rollback: restore from backups
        await performRollback(backupPaths, transactionId);
        throw new Error('Atomic batch operation failed - all changes rolled back');
      }

      // Phase 5: Cleanup successful transaction
      if (atomic) {
        await cleanupBackups(backupPaths);
      }

      const summary = {
        success: !hasErrors || continueOnError,
        transactionId,
        totalFiles: files.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        atomic,
        continueOnError,
        results,
        timestamp: new Date().toISOString()
      };



      // Immediate cleanup of temp files after successful sync operation
      try {
        await immediateCleanupTempFiles(transactionId);
        // console.log(`[ManagedSite] Immediate temp cleanup completed for sync: ${transactionId}`);
      } catch (cleanupError) {
        console.warn(`[ManagedSite] Immediate temp cleanup failed for sync ${transactionId}: ${cleanupError.message}`);
      }

      return summary;

    } catch (error) {
      // Rollback on any critical error
      if (atomic && backupPaths.length > 0) {
        try {
          await performRollback(backupPaths, transactionId);
          console.log(`[ManagedSite] Rollback completed - TransactionId: ${transactionId}`);
        } catch (rollbackError) {
          console.error(`[ManagedSite Error] Rollback failed - TransactionId: ${transactionId}, Error: ${rollbackError.message}`);
        }
      }

      console.error(`[ManagedSite Error] Enhanced sync failed - TransactionId: ${transactionId}, Error: ${error.message}`);
      throw error;
    }
  }

  // Rollback function for atomic operations
  async function performRollback(backupPaths, transactionId) {
    const rollbackErrors = [];

    for (const backup of backupPaths) {
      try {
        if (fs.existsSync(backup.backup)) {
          await fs.copy(backup.backup, backup.original, { overwrite: true });
        }
      } catch (error) {
        rollbackErrors.push(`Failed to restore ${backup.original}: ${error.message}`);
        console.error(`[ManagedSite Error] Rollback failed for file - File: ${backup.original}, Error: ${error.message}`);
      }
    }

    // Clean up backup files after rollback
    await cleanupBackups(backupPaths);

    if (rollbackErrors.length > 0) {
      throw new Error(`Rollback partially failed: ${rollbackErrors.join('; ')}`);
    }
  }

  // Cleanup backup files
  async function cleanupBackups(backupPaths) {
    for (const backup of backupPaths) {
      try {
        if (fs.existsSync(backup.backup)) {
          await fs.remove(backup.backup);
        }
      } catch (error) {
        console.error(`[ManagedSite Error] Backup cleanup failed - Backup: ${backup.backup}, Error: ${error.message}`);
      }
    }
  }

  async function handleRestartServiceCommand(payload) {
    const { service = 'doh' } = payload;

    // For now, we'll just log this - actual restart would need more careful implementation
    console.log(`[ManagedSite] Restart request received for service: ${service}`);
    console.log(`[ManagedSite] Attempting to restart service by exiting process...`);

    // Exit the process - relying on a process manager (like PM2) to restart it.
    // Use a non-zero exit code to indicate an intentional restart.
    // set a timeout to 3 seconds to exit the process.
    setTimeout(() => {
      process.exit(1);
    }, 3000);

    // This part will not be reached if process.exit() is successful
    return {
      success: true,
      message: `Restart request logged for service: ${service}`, // This message might not be sent if exit is too fast
      timestamp: new Date().toISOString(),
      note: 'Restart initiated. If the process does not come back up, check your process manager.'
    };
  }

  async function handleGetLogsCommand(payload) {
    const { lines = 100, type = 'doh' } = payload;

    try {
      let logPath;

      switch (type) {
        case 'doh':
          logPath = DohPath('/.doh/logs/doh.log');
          break;
        default:
          throw new Error(`Unknown log type: ${type}`);
      }

      if (fs.existsSync(logPath)) {
        const logContent = await fsp.readFile(logPath, 'utf8');
        const logLines = logContent.split('\n');
        const recentLines = logLines.slice(-lines);

        return {
          type,
          lines: recentLines.length,
          content: recentLines.join('\n'),
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          type,
          lines: 0,
          content: '',
          message: 'Log file not found',
          timestamp: new Date().toISOString()
        };
      }

    } catch (error) {
      throw new Error(`Failed to retrieve logs: ${error.message}`);
    }
  }

  async function handleGetInstanceInfoCommand(payload, context) {
    return await gatherInstanceInfo(context);
  }

  async function handleGetAvailableFoldersCommand(payload) {
    const { basePath = '/', recursive = false } = payload;

    if (recursive) {
      // For recursive listing, we'll implement a depth-limited scan
      const allFolders = [];
      const maxDepth = 3; // Limit recursion depth

      async function scanRecursive(currentPath, depth = 0) {
        if (depth >= maxDepth) return;

        try {
          const folders = await getAvailableFolders(currentPath);
          for (const folder of folders) {
            allFolders.push({
              ...folder,
              depth: depth + 1,
              parentPath: currentPath
            });

            // Recursively scan this folder
            await scanRecursive(folder.path, depth + 1);
          }
        } catch (error) {
          // Skip folders we can't scan
          console.warn(`[ManagedSite] Cannot scan ${currentPath}:`, error.message);
        }
      }

      await scanRecursive(basePath);
      return allFolders;
    } else {
      return await getAvailableFolders(basePath);
    }
  }

  // Get available folders for sync (directories only, filtered)
  async function getAvailableFolders(basePath = '/') {
    const folders = [];

    try {
      const resolvedPath = DohPath(basePath);
      const stats = await fsp.stat(resolvedPath);

      if (!stats.isDirectory()) {
        throw new Error('Base path is not a directory');
      }

      // Add special "./" option for entire install sync (only at root level)
      if (basePath === '/') {
        folders.push({
          name: './ (Entire Install)',
          path: './',
          fullPath: DohPath('./'),
          lastModified: stats.mtime.toISOString(),
          isDirectory: true,
          isSpecial: true,
          description: 'Sync the entire Doh installation (excluding system directories)'
        });
      }

      const entries = await fsp.readdir(resolvedPath, { withFileTypes: true });

      // Filter and process directories
      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Skip system and hidden directories
          if (entry.name.startsWith('.') ||
            entry.name === 'node_modules' ||
            entry.name === 'dist' ||
            entry.name === 'build') {
            continue;
          }

          const folderPath = DohPath.Join(basePath, entry.name);
          const fullPath = DohPath(folderPath);

          try {
            const folderStats = await fsp.stat(fullPath);
            folders.push({
              name: entry.name,
              path: folderPath,
              fullPath: fullPath,
              lastModified: folderStats.mtime.toISOString(),
              isDirectory: true
            });
          } catch (error) {
            // Skip folders we can't access
            console.warn(`[ManagedSite] Cannot access folder ${folderPath}:`, error.message);
          }
        }
      }

      // Sort folders alphabetically (special entries remain at top)
      const specialFolders = folders.filter(f => f.isSpecial);
      const regularFolders = folders.filter(f => !f.isSpecial).sort((a, b) => a.name.localeCompare(b.name));
      
      return [...specialFolders, ...regularFolders];

    } catch (error) {
      console.error('[ManagedSite] Error listing folders:', error);
      throw error;
    }
  }

  // Gather comprehensive instance identification information
  async function gatherInstanceInfo(context = {}) {
    const { getCloudFingerprint } = context;
    
    try {
      const fingerprint = getCloudFingerprint ? await getCloudFingerprint() : (Doh.pod.fingerprint || 'unknown');
      
      // Get CPU and Memory info similar to handleGetStatusCommand
      const memoryFormatted = Doh.memoryUsed ? Doh.memoryUsed() : 'N/A';
      const cpuFormatted = Doh.cpuUsage ? Doh.cpuUsage() : 'N/A';
      const memoryRaw = Doh.performance?.heapUsed ? Doh.performance.heapUsed() : null;
      const cpuRaw = Doh.performance?.cpuUsage ? Doh.performance.cpuUsage() : null;

      const instanceInfo = {
        fingerprint: fingerprint,
        basePath: DohPath('/'),
        podName: Doh.pod.cloud?.name || Doh.pod.name || 'unnamed-instance',
        hostname: Doh.pod.express_config?.hostname || 'localhost',
        port: Doh.pod.express_config?.port || 3000,
        sslPort: Doh.pod.express_config?.ssl_port || null,
        protocol: Doh.pod.express_config?.ssl_port ? 'https' : 'http',
        localIP: null,
        os: null,
        platform: null,
        nodeVersion: process.version,
        dohVersion: Doh.version || 'unknown',
        // Add CPU and Memory data
        memoryFormatted,
        cpuFormatted,
        memoryRaw,
        cpuRaw,
        uptime: process.uptime(), // Also include uptime here for consistency
        pid: process.pid // Include PID
      };

      // Get local IP address
      try {
        const { networkInterfaces } = await import('os');
        const nets = networkInterfaces();

        // Find the first non-internal IPv4 address
        for (const name of Object.keys(nets)) {
          for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
              instanceInfo.localIP = net.address;
              break;
            }
          }
          if (instanceInfo.localIP) break;
        }
      } catch (error) {
        console.error('[ManagedSite] Error getting local IP:', error);
      }

      // Get OS information
      try {
        const os = await import('os');
        instanceInfo.os = `${os.type()} ${os.release()}`;
        instanceInfo.platform = os.platform();
      } catch (error) {
        console.error('[ManagedSite] Error getting OS info:', error);
      }

      // Create display name using best available information
      instanceInfo.displayName = instanceInfo.podName !== 'unnamed-instance'
        ? instanceInfo.podName
        : `${instanceInfo.hostname}:${instanceInfo.port}`;

      return instanceInfo;
    } catch (error) {
      console.error('[ManagedSite] Error gathering instance info:', error);
      const fallbackFingerprint = getCloudFingerprint ? 'unknown' : (Doh.pod.fingerprint || 'unknown');
      return {
        fingerprint: fallbackFingerprint,
        basePath: DohPath('/'),
        displayName: 'Unknown Instance',
        error: error.message
      };
    }
  }

  async function handleGetBrowseCommand(payload) {
    const { path = '/', includeFiles = true } = payload;

    try {
      const resolvedPath = DohPath(path);
      const projectRoot = DohPath('/');

      // Security: Validate path is within project directory
      if (!resolvedPath.startsWith(projectRoot)) {
        throw new Error('Path outside project directory is not allowed');
      }

      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Path does not exist: ${path}`);
      }

      const stats = await fsp.stat(resolvedPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${path}`);
      }

      const items = [];
      const entries = await fsp.readdir(resolvedPath, { withFileTypes: true });

      for (const entry of entries) {
        // Skip hidden files and system directories
        if (entry.name.startsWith('.') || 
            entry.name === 'node_modules' || 
            entry.name === 'dist' || 
            entry.name === 'build') {
          continue;
        }

        const itemPath = DohPath.Join(path, entry.name);
        const absoluteFullPath = DohPath.Join(resolvedPath, entry.name);

        try {
          const itemStats = await fsp.stat(absoluteFullPath);
          const itemLStats = await fsp.lstat(absoluteFullPath); // For symlink detection
          
          const item = {
            name: entry.name,
            path: itemPath,
            fullPath: DohPath.DohSlash(absoluteFullPath), // Convert absolute path to DohSlash format
            projectPath: DohPath.DohSlash(itemPath), // Add normalized project path for sync cache lookup
            isDirectory: entry.isDirectory(),
            isSymlink: itemLStats.isSymbolicLink(),
            size: entry.isFile() ? itemStats.size : 0,
            lastModified: formatSafeTimestamp(itemStats.mtime),
            mtime: formatSafeTimestamp(itemStats.mtime), // FIXED: Add mtime field that browser expects
            permissions: itemStats.mode,
            uid: itemStats.uid,
            gid: itemStats.gid,
            dev: itemStats.dev,
            ino: itemStats.ino,
            nlink: itemStats.nlink
          };

          // For directories, add content analysis
          if (entry.isDirectory()) {
            try {
              const directoryContents = await analyzeFolderContents(absoluteFullPath);
              item.folderContents = directoryContents;
              item.contentHash = directoryContents.contentHash;
              item.lastContentModified = directoryContents.newestMtime;
            } catch (error) {
              console.warn(`[ManagedSite] Cannot analyze folder contents for ${itemPath}:`, error.message);
              item.folderContents = { fileCount: 0, folderCount: 0, totalSize: 0 };
              item.contentHash = null;
              item.lastContentModified = item.lastModified;
            }
          }

          // For symlinks, get the target
          if (item.isSymlink) {
            try {
              item.symlinkTarget = await fsp.readlink(absoluteFullPath);
            } catch (error) {
              item.symlinkTarget = null;
            }
          }

          // Include files only if requested
          if (entry.isDirectory() || includeFiles) {
            items.push(item);
          }
        } catch (error) {
          console.warn(`[ManagedSite] Cannot access item ${itemPath}:`, error.message);
        }
      }

      // Sort: folders first, then files, both alphabetically
      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      return {
        success: true,
        path: path,
        items: items,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`[ManagedSite Error] browse: ${error.message} - Path: ${path}`);
      throw error;
    }
  }

  async function handleSyncFileCommand(payload) {
    const { sourcePath, targetPath, options = {} } = payload;

    if (!sourcePath || !targetPath) {
      throw new Error('Missing required parameters: sourcePath and targetPath');
    }

    const {
      backup = true,
      verifyIntegrity = true,
      encoding = 'auto'
    } = options;

    // Security: Validate paths are within project directory
    const resolvedSourcePath = DohPath(sourcePath);
    const resolvedTargetPath = DohPath(targetPath);
    const projectRoot = DohPath('/');
    
    if (!resolvedSourcePath.startsWith(projectRoot) || !resolvedTargetPath.startsWith(projectRoot)) {
      throw new Error('Source or target path outside project directory is not allowed');
    }



    try {
      // Check if source file exists
      if (!fs.existsSync(resolvedSourcePath)) {
        throw new Error(`Source file does not exist: ${sourcePath}`);
      }

      const sourceStats = await fsp.stat(resolvedSourcePath);
      if (!sourceStats.isFile()) {
        throw new Error(`Source path is not a file: ${sourcePath}`);
      }

      // Ensure target directory exists
      await fs.ensureDir(DohPath.Dirname(resolvedTargetPath));

      // Create backup if requested and target exists
      if (backup && fs.existsSync(resolvedTargetPath)) {
        const backupPath = await createManagedBackup(resolvedTargetPath);
        console.log(`[ManagedSite] Backup created - Target: ${resolvedTargetPath}, Backup: ${backupPath}`);
      }

      // Determine encoding
      let fileEncoding = encoding;
      if (encoding === 'auto') {
        const isBinary = await isFileBinary(resolvedSourcePath);
        fileEncoding = isBinary ? 'base64' : 'utf8';
      }

      // Read source file
      let content;
      if (fileEncoding === 'base64') {
        content = await fsp.readFile(resolvedSourcePath, 'base64');
      } else {
        content = await fsp.readFile(resolvedSourcePath, fileEncoding);
      }

      // Calculate source checksum if verification is enabled
      let sourceChecksum = null;
      if (verifyIntegrity) {
        sourceChecksum = await calculateFileChecksum(resolvedSourcePath);
      }

      // Write target file
      if (fileEncoding === 'base64') {
        const buffer = Buffer.from(content, 'base64');
        await fsp.writeFile(resolvedTargetPath, buffer);
      } else {
        await fsp.writeFile(resolvedTargetPath, content, fileEncoding);
      }

      // Verify integrity if enabled
      let targetChecksum = null;
      if (verifyIntegrity) {
        targetChecksum = await calculateFileChecksum(resolvedTargetPath);
        
        if (sourceChecksum !== targetChecksum) {
          throw new Error(`File integrity verification failed - Source: ${sourceChecksum}, Target: ${targetChecksum}`);
        }
      }

      const summary = {
        success: true,
        operation: 'sync_file',
        sourcePath,
        targetPath,
        size: sourceStats.size,
        encoding: fileEncoding,
        checksum: targetChecksum,
        timestamp: new Date().toISOString()
      };



      return summary;

    } catch (error) {
      console.error(`[ManagedSite Error] file_sync: ${error.message} - Source: ${sourcePath}, Target: ${targetPath}`);
      throw error;
    }
  }

  async function handleReadFileContentCommand(payload) {
    const { filePath, options = {} } = payload;

    if (!filePath) {
      throw new Error('Missing required parameter: filePath');
    }

    const {
      encoding = 'auto',
      includeMetadata = true,
      maxSize = 100 * 1024 * 1024 // 100MB limit
    } = options;

    // Security: Validate path is within project directory
    const resolvedPath = DohPath(filePath);
    const projectRoot = DohPath('/');
    
    if (!resolvedPath.startsWith(projectRoot)) {
      throw new Error('File path outside project directory is not allowed');
    }

    console.log(`[ManagedSite] Reading file content - Path: ${resolvedPath}`);

    try {
      // Check if file exists
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File does not exist: ${filePath}`);
      }

      const stats = await fsp.stat(resolvedPath);
      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${filePath}`);
      }

      // Check file size limit
      if (stats.size > maxSize) {
        throw new Error(`File too large: ${stats.size} bytes (limit: ${maxSize} bytes)`);
      }

      // Determine encoding
      let fileEncoding = encoding;
      if (encoding === 'auto') {
        const isBinary = await isFileBinary(resolvedPath);
        fileEncoding = isBinary ? 'base64' : 'utf8';
      }

      // Read file content
      let content;
      if (fileEncoding === 'base64') {
        content = await fsp.readFile(resolvedPath, 'base64');
      } else {
        content = await fsp.readFile(resolvedPath, fileEncoding);
      }

      // Calculate checksum for integrity
      const checksum = await calculateFileChecksum(resolvedPath);

      const result = {
        success: true,
        filePath,
        content,
        encoding: fileEncoding,
        size: stats.size,
        checksum,
        timestamp: new Date().toISOString()
      };

      // Include metadata if requested
      if (includeMetadata) {
        result.metadata = {
          lastModified: stats.mtime.toISOString(),
          permissions: stats.mode,
          uid: stats.uid,
          gid: stats.gid,
          isSymlink: false
        };

        // Check if it's a symlink
        try {
          const lstat = await fsp.lstat(resolvedPath);
          if (lstat.isSymbolicLink()) {
            result.metadata.isSymlink = true;
            result.metadata.symlinkTarget = await fsp.readlink(resolvedPath);
          }
        } catch (error) {
          // Ignore symlink detection errors
        }
      }

      console.log(`[ManagedSite] File content read successfully - Path: ${filePath}, Size: ${stats.size}, Encoding: ${fileEncoding}`);

      return result;

    } catch (error) {
      console.error(`[ManagedSite Error] read_file_content: ${error.message} - Path: ${filePath}`);
      throw error;
    }
  }

  async function handleGetRecursiveFilesCommand(payload) {
    const { path = '/', includeFiles = true, excludePatterns = ['.git', '.doh', 'node_modules', '.DS_Store'] } = payload;

    try {
      const resolvedPath = DohPath(path);
      const projectRoot = DohPath('/');

      // Security: Validate path is within project directory
      if (!resolvedPath.startsWith(projectRoot)) {
        throw new Error('Path outside project directory is not allowed');
      }

      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Path does not exist: ${path}`);
      }

      const stats = await fsp.stat(resolvedPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${path}`);
      }

      // Use the existing readFolderContents function to get all files recursively
      const allFiles = await readFolderContents(resolvedPath, {
        recursive: true,
        includeHidden: false,
        excludePatterns: excludePatterns,
        basePath: resolvedPath
      });

      console.log(`[ManagedSite] Found ${allFiles.length} files recursively in ${path}`);

      // Convert file objects to use proper project-relative DohSlash paths
      const items = allFiles.map(file => {
        // Convert absolute path to project-relative DohSlash path
        const projectRelativePath = DohPath.DohSlash(file.fullPath);
        
        return {
          name: file.name,
          relativePath: file.relativePath, // Keep the relative path from scan base
          projectPath: projectRelativePath, // Project-relative DohSlash path
          fullPath: file.fullPath, // Absolute path (only for reading file content)
          isDirectory: false, // These are all files from readFolderContents
          isSymlink: false,
          size: file.size,
          lastModified: new Date().toISOString(), // We'll get this if needed
          permissions: null,
          uid: null,
          gid: null
        };
      });

      return {
        success: true,
        path: path,
        items: items,
        totalFiles: allFiles.length,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`[ManagedSite Error] get_recursive_files: ${error.message} - Path: ${path}`);
      throw error;
    }
  }

  async function handleCleanupCommand(payload) {
    const { types = ['temp', 'backups'], force = false, immediate = false, operationId = null } = payload;

    try {
      let results;
      
      if (immediate && types.includes('temp')) {
        // For immediate cleanup, use the faster immediate cleanup function
        results = await immediateCleanupTempFiles(operationId);
        
        // Also run regular cleanup for backups if requested
        if (types.includes('backups')) {
          const backupResults = await cleanupTempAndBackups();
          results.backupsRemoved = backupResults.backupsRemoved;
          results.errors.push(...backupResults.errors);
        }
      } else {
        // Regular cleanup
        results = await cleanupTempAndBackups();
      }
      
      const summary = {
        success: true,
        operation: immediate ? 'immediate_cleanup' : 'cleanup',
        tempFilesRemoved: results.tempFilesRemoved,
        backupsRemoved: results.backupsRemoved || 0,
        errors: results.errors,
        operationId: operationId,
        timestamp: new Date().toISOString()
      };

      return summary;

    } catch (error) {
      console.error(`[ManagedSite Error] ${immediate ? 'Immediate' : 'Manual'} cleanup failed: ${error.message}`);
      throw error;
    }
  }

  // Helper function to format timestamps safely
  function formatSafeTimestamp(mtime) {
    try {
      // Check for invalid timestamps (Unix epoch 0 or negative values)
      const timestamp = mtime instanceof Date ? mtime.getTime() : new Date(mtime).getTime();
      
      // Unix epoch is January 1, 1970. Anything before 1971 is likely invalid for file systems
      const minValidTimestamp = new Date('1971-01-01').getTime();
      
      if (timestamp < minValidTimestamp || isNaN(timestamp)) {
        // Return current timestamp for invalid folder mtimes
        return new Date().toISOString();
      }
      
      return mtime instanceof Date ? mtime.toISOString() : new Date(mtime).toISOString();
    } catch (error) {
      // Fallback to current timestamp for any conversion errors
      return new Date().toISOString();
    }
  }

  // Helper function to analyze folder contents recursively
  async function analyzeFolderContents(folderPath, maxDepth = 3, currentDepth = 0) {
    const analysis = {
      fileCount: 0,
      folderCount: 0,
      totalSize: 0,
      newestMtime: new Date(0).toISOString(), // Start with very old date
      contentHash: null,
      files: [] // List of files with their mtimes for comparison
    };

    try {
      if (currentDepth >= maxDepth) {
        return analysis;
      }

      const entries = await fsp.readdir(folderPath, { withFileTypes: true });
      const hashInputs = []; // For creating a content-based hash

      for (const entry of entries) {
        // Skip hidden files and common ignored directories
        if (entry.name.startsWith('.') || 
            entry.name === 'node_modules' || 
            entry.name === 'dist' || 
            entry.name === 'build' ||
            entry.name === 'logs' ||
            entry.name === 'tmp' ||
            entry.name === 'temp') {
          continue;
        }

        const entryPath = DohPath.Join(folderPath, entry.name);
        
        try {
          const stats = await fsp.stat(entryPath);
          const mtime = formatSafeTimestamp(stats.mtime);
          
          if (entry.isFile()) {
            analysis.fileCount++;
            analysis.totalSize += stats.size;
            
            // FIXED: Include path information needed for sync cache lookups
            const relativePath = entryPath.replace(folderPath, '').replace(/^[/\\]/, '');
            const projectPath = DohPath.DohSlash(entryPath);
            
            analysis.files.push({
              name: entry.name,
              size: stats.size,
              mtime: mtime,
              path: projectPath,        // Add path field for cache lookup
              projectPath: projectPath  // Add projectPath field for cache lookup
            });
            
            // Update newest mtime if this file is newer
            if (new Date(mtime) > new Date(analysis.newestMtime)) {
              analysis.newestMtime = mtime;
            }
            
            // Add to hash input: filename + size + mtime
            hashInputs.push(`${entry.name}:${stats.size}:${mtime}`);
            
          } else if (entry.isDirectory()) {
            analysis.folderCount++;
            
            // Recursively analyze subdirectory
            const subAnalysis = await analyzeFolderContents(entryPath, maxDepth, currentDepth + 1);
            analysis.fileCount += subAnalysis.fileCount;
            analysis.folderCount += subAnalysis.folderCount;
            analysis.totalSize += subAnalysis.totalSize;
            analysis.files.push(...subAnalysis.files);
            
            // Update newest mtime if subdirectory has newer files
            if (new Date(subAnalysis.newestMtime) > new Date(analysis.newestMtime)) {
              analysis.newestMtime = subAnalysis.newestMtime;
            }
            
            // Add folder to hash input with its content hash
            hashInputs.push(`${entry.name}:folder:${subAnalysis.contentHash || 'empty'}`);
          }
        } catch (error) {
          console.warn(`[ManagedSite] Cannot analyze ${entryPath}:`, error.message);
        }
      }

      // Create content hash based on folder structure and file metadata
      if (hashInputs.length > 0) {
        const hash = CryptoAPI.createHash('md5');
        hash.update(hashInputs.sort().join('|')); // Sort for consistent hashing
        analysis.contentHash = hash.digest('hex').substring(0, 16); // Use first 16 chars
      } else {
        analysis.contentHash = 'empty';
      }

    } catch (error) {
      console.warn(`[ManagedSite] Cannot read folder contents ${folderPath}:`, error.message);
    }

    return analysis;
  }

  // === SYNC STATUS CACHE SYSTEM ===
  // Each instance maintains its own sync status cache for efficient mtime-based checking
  // Key format: "instanceId/project/path/to/file" -> { localMtime, remoteMtime, sourceInstanceId, size, lastChecked }
  
  let syncStatusCache = {}; // In-memory cache
  
  async function loadSyncStatusCache() {
    try {
      const cacheFilePath = DohPath('/.doh/sync_file_status.json');
      
      if (await fsp.access(cacheFilePath).then(() => true).catch(() => false)) {
        const cacheContent = await fsp.readFile(cacheFilePath, 'utf8');
        syncStatusCache = JSON.parse(cacheContent);
      } else {
        syncStatusCache = {};
      }
    } catch (error) {
      console.error('[ManagedSite] Error loading sync status cache:', error);
      syncStatusCache = {};
    }
  }
  
  async function saveSyncStatusCache() {
    try {
      const cacheFilePath = DohPath('/.doh/sync_file_status.json');
      const dohDir = DohPath('/.doh');
      
      // Ensure .doh directory exists
      await fsp.mkdir(dohDir, { recursive: true });
      
      await fsp.writeFile(cacheFilePath, JSON.stringify(syncStatusCache, null, 2), 'utf8');
    } catch (error) {
      console.error('[ManagedSite] Error saving sync status cache:', error);
    }
  }
  
  function generateInstanceCacheKey(instanceId, projectPath) {
    // IMPORTANT: Use DohPath.DohSlash() for consistent path normalization
    // Key format: "instanceId|/normalized/path/to/file"
    const normalizedPath = DohPath.DohSlash(projectPath);
    return `${instanceId}|${normalizedPath}`;
  }
  
  async function updateSyncStatusCacheEntry(instanceId, projectPath, localStats, sourceStats = null, sourceInstanceId = null) {
    await loadSyncStatusCache();
    
    // IMPORTANT: Normalize the project path using DohPath.DohSlash for consistency
    const normalizedPath = DohPath.DohSlash(projectPath);
    const cacheKey = generateInstanceCacheKey(instanceId, normalizedPath);
    
    const entry = {
      localMtime: localStats.mtime.toISOString(),
      localSize: localStats.size,
      isDirectory: localStats.isDirectory(),
      lastUpdated: new Date().toISOString()
    };
    
    // Add source/remote information if provided
    if (sourceStats && sourceInstanceId) {
      entry.remoteMtime = sourceStats.mtime.toISOString();
      entry.remoteSize = sourceStats.size;
      entry.sourceInstanceId = sourceInstanceId;
    }
    
    syncStatusCache[cacheKey] = entry;
    await saveSyncStatusCache();
    
    console.log(`[ManagedSite] Updated sync cache entry: ${cacheKey}`);
  }
  
  function getSyncStatusCacheEntry(instanceId, projectPath) {
    // IMPORTANT: Normalize the project path using DohPath.DohSlash for consistency
    const normalizedPath = DohPath.DohSlash(projectPath);
    const cacheKey = generateInstanceCacheKey(instanceId, normalizedPath);
    return syncStatusCache[cacheKey] || null;
  }
  
  async function checkFileSyncStatus(instanceId, projectPath) {
    await loadSyncStatusCache();
    
    // IMPORTANT: Normalize the project path using DohPath.DohSlash for consistency
    const normalizedPath = DohPath.DohSlash(projectPath);
    
    try {
      // Get current file stats
      const fullPath = DohPath(normalizedPath);
      const stats = await fsp.stat(fullPath);
      
      // Get cached entry
      const cacheEntry = getSyncStatusCacheEntry(instanceId, normalizedPath);
      
      if (!cacheEntry) {
        return {
          status: 'unknown',
          reason: 'No sync history found',
          currentMtime: stats.mtime.toISOString(),
          cachedMtime: null,
          remoteMtime: null
        };
      }
      
      const currentMtime = stats.mtime.getTime();
      const cachedMtime = new Date(cacheEntry.localMtime).getTime();
      
      // Check if file has been modified since last sync
      if (Math.abs(currentMtime - cachedMtime) > 1000) { // Allow 1 second tolerance
        return {
          status: 'modified',
          reason: 'File modified since last sync',
          currentMtime: stats.mtime.toISOString(),
          cachedMtime: cacheEntry.localMtime,
          remoteMtime: cacheEntry.remoteMtime
        };
      }
      
      return {
        status: 'synced',
        reason: 'File matches last sync state',
        currentMtime: stats.mtime.toISOString(),
        cachedMtime: cacheEntry.localMtime,
        remoteMtime: cacheEntry.remoteMtime,
        sourceInstanceId: cacheEntry.sourceInstanceId
      };
      
    } catch (error) {
      return {
        status: 'error',
        reason: `Cannot check file: ${error.message}`,
        currentMtime: null,
        cachedMtime: null,
        remoteMtime: null
      };
    }
  }

  async function handleCheckFileSyncStatusCommand(payload, context) {
    const { instanceId, projectPath } = payload;
    
    if (!instanceId || !projectPath) {
      throw new Error('Missing required parameters: instanceId, projectPath');
    }
    
    // IMPORTANT: Normalize path using DohPath.DohSlash for consistency
    const normalizedPath = DohPath.DohSlash(projectPath);
    const result = await checkFileSyncStatus(instanceId, normalizedPath);
    
    return {
      success: true,
      ...result
    };
  }
  
  async function handleUpdateSyncStatusCacheCommand(payload, context) {
    const { instanceId, projectPath, localStats, sourceStats = null, sourceInstanceId = null } = payload;
    
    if (!instanceId || !projectPath || !localStats) {
      throw new Error('Missing required parameters: instanceId, projectPath, localStats');
    }
    
    // IMPORTANT: Normalize path using DohPath.DohSlash for consistency  
    const normalizedPath = DohPath.DohSlash(projectPath);
    
    // Create local stats object from payload data
    const fileLocalStats = {
      mtime: new Date(localStats.mtime),
      size: localStats.size,
      isDirectory: () => localStats.isDirectory
    };
    
    // Create source stats object if provided
    let fileSourceStats = null;
    if (sourceStats) {
      fileSourceStats = {
        mtime: new Date(sourceStats.mtime),
        size: sourceStats.size
      };
    }
    
    // Update the cache entry
    await updateSyncStatusCacheEntry(instanceId, normalizedPath, fileLocalStats, fileSourceStats, sourceInstanceId);
    
    return {
      success: true,
      message: 'Sync status cache updated successfully'
    };
  }
  
  async function handleGetInstanceIdCommand(payload, context) {
    // Return the proper instance ID format that matches what's used throughout the system
    const { fingerprintData } = context;
    const userId = fingerprintData?.userId || 'unknown';
    const fingerprint = fingerprintData?.fingerprint || 'unknown';
    
    // FIXED: Make sure we return the exact same format that gets stored during transfers
    // The cloud manager stores instance IDs as "user@site.com_fingerprint" format
    // We need to return the same format to ensure cache lookups work
    const instanceId = `${userId}_${fingerprint}`;
    
    // console.log(`[ManagedSite] get_instance_id returning: ${instanceId} (userId: ${userId}, fingerprint: ${fingerprint})`);
    
    return {
      success: true,
      instanceId,
      userId,
      fingerprint
    };
  }

  // Command handler for executing specific Doh CLI operations
  async function handleExecuteDohOperationCommand(payload, context) {
    const { operation } = payload;
    const { auditLog } = context;

    if (!operation) {
      throw new Error('Missing required parameter: operation');
    }

    const allowedOperations = {
      'upgrade': 'doh upgrade --confirm-all',
      'update': 'doh update --confirm-all',
      'clear-all': 'doh clear-all --confirm-all'
    };

    const commandToExecute = allowedOperations[operation];

    if (!commandToExecute) {
      auditLog('execute_doh_operation_denied', {
        operation,
        timestamp: new Date().toISOString()
      });
      throw new Error(`Disallowed Doh operation: ${operation}`);
    }

    // Log the command execution attempt
    console.log(`[ManagedSite] Attempting to execute Doh operation: ${operation} (Command: ${commandToExecute})`);
    auditLog('execute_doh_operation_attempt', {
      operation,
      command: commandToExecute,
      timestamp: new Date().toISOString()
    });

    return new Promise((resolve, reject) => {
      exec(commandToExecute, { cwd: DohPath('/') }, (error, stdout, stderr) => {
        if (error) {
          console.error(`[ManagedSite Error] Doh operation execution failed: ${commandToExecute} - ${error.message}`);
          auditLog('execute_doh_operation_failed', {
            operation,
            command: commandToExecute,
            error: error.message,
            stdout,
            stderr,
            timestamp: new Date().toISOString()
          });
          reject(new Error(`Doh operation execution failed: ${error.message}. Stderr: ${stderr || 'empty'}`));
          return;
        }

        console.log(`[ManagedSite] Doh operation executed successfully: ${commandToExecute}`);
        auditLog('execute_doh_operation_success', {
          operation,
          command: commandToExecute,
          stdout,
          stderr,
          timestamp: new Date().toISOString()
        });

        resolve({
          success: true,
          operation,
          command: commandToExecute,
          stdout: stdout || 'empty',
          stderr: stderr || 'empty',
          message: 'Doh operation executed successfully'
        });
      });
    });
  }

  // Export all command handlers for use by the main managed_site module
  managedSite.CommandHandlers = {
    executeCloudCommand,
    handlePingCommand,
    handleGetStatusCommand,
    handleUpdateFileCommand,
    handleSyncFilesCommand,
    handleSyncFolderCommand,
    handleStartChunkedTransferCommand,
    handleUploadChunkCommand,
    handleDownloadChunkCommand,
    handleFinalizeTransferCommand,
    handleGetTransferStatusCommand,
    handleCancelTransferCommand,
    handleResumeTransferCommand,
    handleEnhancedSyncFilesCommand,
    handleRestartServiceCommand,
    handleGetLogsCommand,
    handleGetInstanceInfoCommand,
    handleGetAvailableFoldersCommand,
    handleGetBrowseCommand,
    handleSyncFileCommand,
    handleReadFileContentCommand,
    handleGetRecursiveFilesCommand,
    handleCleanupCommand,
    readFolderContents,
    isFileBinary,
    performRollback,
    cleanupBackups,
    createManagedBackup,
    cleanupTempAndBackups,
    immediateCleanupTempFiles,
    scheduleCleanup,
    loadSyncStatusCache,
    saveSyncStatusCache,
    generateInstanceCacheKey,
    updateSyncStatusCacheEntry,
    getSyncStatusCacheEntry,
    checkFileSyncStatus,
    handleCheckFileSyncStatusCommand,
    handleUpdateSyncStatusCacheCommand,
    handleGetInstanceIdCommand,
    handleExecuteDohOperationCommand // Renamed export
  };

}); 