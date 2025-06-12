/**
 * Managed Site Module
 * 
 * Provides cloud integration capabilities for Doh instances including:
 * - Cloud anchoring with secure token-based authentication
 * - Persistent WebSocket connections to Doh Cloud
 * - Remote command execution and monitoring
 * - Status API for health monitoring
 * - Admin UI for cloud connection management
 * - Automatic startup connection and recovery
 * 
 * Version: Updated with sync_folder command support
 */

// Managed Site Module for Doh Cloud Integration
// Provides cloud anchoring and remote management capabilities for Doh instances

// Pod configuration for managed site functionality
Doh.Pod('managed_site', {
  managed_site: {
    doc: 'Configuration for the managed server agent',
    moc: {
      // Add any future config options here
      // example_option: 'IsString'
    },
    // Default configuration values

  },
  cloud: {
    doc: 'Configuration for Doh Cloud anchoring and communication',
    moc: {
      endpoint: 'IsString',
      token_storage_path: 'IsString',
      cloud_anchor_path: 'IsString',
      connection_timeout: 'IsNumber',
      reconnect_interval: 'IsNumber',
      heartbeat_interval: 'IsNumber'
    },
    endpoint: 'https://deploydoh.com',
    token_storage_path: '/.doh/static/cloud_auth_token',
    cloud_anchor_path: '/.doh/static/cloud-anchor.json',
    connection_timeout: 30000, // 30 seconds
    reconnect_interval: 5000,  // 5 seconds
    heartbeat_interval: 60000,  // 1 minute
    file_sync: {
      doc: 'Configuration for advanced file synchronization',
      moc: {
        max_chunk_size: 'IsNumber',
        min_chunk_size: 'IsNumber',
        max_concurrent_transfers: 'IsNumber',
        transfer_timeout: 'IsNumber',
        integrity_check: 'IsBoolean',
        resume_support: 'IsBoolean',
        rate_limit: 'IsNumber',
        retry_attempts: 'IsNumber',
        retry_delay: 'IsNumber',
        temp_dir: 'IsString',
        progress_interval: 'IsNumber',
        cleanup_interval: 'IsNumber',
        max_session_age: 'IsNumber'
      },
      max_chunk_size: 1048576,      // 1MB chunks
      min_chunk_size: 65536,        // 64KB minimum
      max_concurrent_transfers: 3,   // Concurrent transfer limit
      transfer_timeout: 3600000,    // 1 hour for large files
      integrity_check: true,        // Enable checksums
      resume_support: true,         // Enable resumable transfers
      rate_limit: 10485760,        // 10MB/s max transfer rate
      retry_attempts: 3,           // Max retry attempts
      retry_delay: 5000,           // Initial retry delay (ms)
      temp_dir: '/.doh/temp/transfers',  // Staging directory
      progress_interval: 1000,     // Progress update interval (ms)
      cleanup_interval: 3600000,   // Session cleanup interval (1 hour)
      max_session_age: 86400000    // Max session age (24 hours)
    }
  },
  host_load: [
    // This module is auto-loaded because it's not meant to be turned off
    'managed_site'
  ]
});

Doh.Install('managed_site', {
  'npm:fs-extra': ''
});

Doh.Module('managed_site', [
  'express_router_as_library', // Dependency for API routes
  'nodejs?? import fsE from "fs-extra"',       // For secure file operations
  'nodejs?? CryptoAPI',     // For file integrity verification
  'socketio_client',  // WebSocket client
  'managed_site_command_handlers',  // Command handlers sub-module
  'user_host?? user_host'
], function (DohPath, Router, fsE, CryptoAPI, ioClient, managedSite, Users) {
  const fs = fsE;
  let fsp = fs.promises;

  // look for the old cloud_auth_token and cloud-anchor.json files and move them to the new location
  const oldTokenPath = DohPath('/.doh/cloud_auth_token');
  const oldAnchorPath = DohPath('/.doh/cloud-anchor.json');
  fsE.ensureDirSync(DohPath('/.doh/static'));
  if (fs.existsSync(oldTokenPath)) {
    fs.renameSync(oldTokenPath, DohPath('/.doh/static/cloud_auth_token'));
  }
  if (fs.existsSync(oldAnchorPath)) {
    fs.renameSync(oldAnchorPath, DohPath('/.doh/static/cloud-anchor.json'));
  }

  // --- Status API Route ---
  Router.AddRoute('/api/managed_site/status', [], async function (data, req, res, cb) {
    try {
      // Get both cloud fingerprint and current pod fingerprint
      const cloudFingerprint = await getCloudFingerprint();
      const currentFingerprint = Doh.pod?.fingerprint || null;
      const originalFingerprint = (await loadCloudAnchor())?.originalFingerprint || null;
      
      // Use CURRENT pod fingerprint for server_manager compatibility
      // Server_manager needs to verify against the current build fingerprint, not the historical one
      const responseFingerprint = currentFingerprint;
      
      const memoryFormatted = Doh.memoryUsed ? Doh.memoryUsed() : 'N/A';
      const cpuFormatted = Doh.cpuUsage ? Doh.cpuUsage() : 'N/A';
      // Get raw performance data if available
      const memoryRaw = Doh.performance?.heapUsed ? Doh.performance.heapUsed() : null;
      const cpuRaw = Doh.performance?.cpuUsage ? Doh.performance.cpuUsage() : null;

      // Check cloud anchoring status
      const isAnchored = await isInstanceAnchored();
      const cloudStatus = getCloudConnectionStatus();

      Router.SendJSON(res, {
        success: true,
        status: 'online',
        fingerprint: responseFingerprint, // Current pod fingerprint for server_manager compatibility
        pid: process.pid,
        memoryFormatted: memoryFormatted, // UI-friendly string
        cpuFormatted: cpuFormatted,     // UI-friendly string
        memoryRaw: memoryRaw,           // Raw heap used bytes
        cpuRaw: cpuRaw,                 // Raw CPU usage object
        cloud: {
          ...cloudStatus,              // Cloud anchoring and connection status
          cloudFingerprint: cloudFingerprint, // Separate cloud fingerprint for cloud operations
          originalFingerprint: originalFingerprint // Include original for reference
        }
      }, cb);
    } catch (error) {
      console.error(`[ManagedSite Error] api_status: ${error.message} - Route: /api/managed_site/status`);
      // Use a distinct status code for server errors on the managed site
      Router.SendJSON(res, { success: false, error: 'Failed to get status' }, 500, cb);
    }
  });
  // --- End Status API Route ---

  // --- Cloud Anchoring Token Storage Utilities ---

  // Store Site Authentication Token securely
  async function storeSiteAuthToken(token) {
    try {
      const tokenPath = DohPath(Doh.pod.cloud.token_storage_path);
      const tokenDir = DohPath.Dirname(tokenPath);

      // Ensure .doh directory exists
      await fs.ensureDir(tokenDir);

      // Store token securely with restricted permissions
      await fsp.writeFile(tokenPath, token, { mode: 0o600 });
      return true;
    } catch (error) {
      console.error(`[ManagedSite Error] token_storage: ${error.message} - TokenPath: ${Doh.pod.cloud.token_storage_path}`);
      return false;
    }
  }

  // Load Site Authentication Token
  async function loadSiteAuthToken() {
    try {
      const tokenPath = DohPath(Doh.pod.cloud.token_storage_path);
      if (fs.existsSync(tokenPath)) {
        const token = await fsp.readFile(tokenPath, 'utf8');
        return token.trim();
      }
      return null;
    } catch (error) {
      console.error(`[ManagedSite Error] token_loading: ${error.message} - TokenPath: ${Doh.pod.cloud.token_storage_path}`);
      return null;
    }
  }

  // Clear Site Authentication Token
  async function clearSiteAuthToken() {
    try {
      const tokenPath = DohPath(Doh.pod.cloud.token_storage_path);
      if (fs.existsSync(tokenPath)) {
        await fs.remove(tokenPath);
      }
      return true;
    } catch (error) {
      console.error(`[ManagedSite Error] token_clear: ${error.message} - TokenPath: ${Doh.pod.cloud.token_storage_path}`);
      return false;
    }
  }

  // --- End Cloud Anchoring Token Storage Utilities ---

  // --- Cloud Anchor File Management ---

  // Load Cloud Anchor data (persistent fingerprint)
  async function loadCloudAnchor() {
    try {
      const anchorPath = DohPath(Doh.pod.cloud.cloud_anchor_path);
      if (fs.existsSync(anchorPath)) {
        const anchorData = await fsp.readFile(anchorPath, 'utf8');
        const parsed = JSON.parse(anchorData);
        
        // Validate required fields
        if (parsed.fingerprint && parsed.created) {
          return parsed;
        } else {
          console.warn(`[ManagedSite] Invalid cloud anchor format - AnchorPath: ${anchorPath}`);
          return null;
        }
      }
      return null;
    } catch (error) {
      console.error(`[ManagedSite Error] cloud_anchor_load: ${error.message} - AnchorPath: ${Doh.pod.cloud.cloud_anchor_path}`);
      return null;
    }
  }

  // Store Cloud Anchor data (persistent fingerprint)
  async function storeCloudAnchor(fingerprint, originalFingerprint = null) {
    try {
      const anchorPath = DohPath(Doh.pod.cloud.cloud_anchor_path);
      const anchorDir = DohPath.Dirname(anchorPath);

      // Ensure directory exists
      await fs.ensureDir(anchorDir);

      const anchorData = {
        fingerprint: fingerprint,
        created: new Date().toISOString(),
        originalFingerprint: originalFingerprint || Doh.pod?.fingerprint || null,
        lastUsed: new Date().toISOString()
      };

      // Store with restricted permissions
      await fsp.writeFile(anchorPath, JSON.stringify(anchorData, null, 2), { mode: 0o600 });
      
      return true;
    } catch (error) {
      console.error(`[ManagedSite Error] cloud_anchor_store: ${error.message} - AnchorPath: ${Doh.pod.cloud.cloud_anchor_path}`);
      return false;
    }
  }

  // Clear Cloud Anchor data (forces regeneration)
  async function clearCloudAnchor() {
    try {
      const anchorPath = DohPath(Doh.pod.cloud.cloud_anchor_path);
      if (fs.existsSync(anchorPath)) {
        await fs.remove(anchorPath);
      }
      return true;
    } catch (error) {
      console.error(`[ManagedSite Error] cloud_anchor_clear: ${error.message} - AnchorPath: ${Doh.pod.cloud.cloud_anchor_path}`);
      return false;
    }
  }

  // Get or create persistent cloud fingerprint
  async function getCloudFingerprint() {
    try {
      // Try to load existing cloud anchor
      const existingAnchor = await loadCloudAnchor();
      if (existingAnchor && existingAnchor.fingerprint) {
        // Update last used time
        await storeCloudAnchor(existingAnchor.fingerprint, existingAnchor.originalFingerprint);
        return existingAnchor.fingerprint;
      }

      // No existing anchor, create new persistent fingerprint
      const currentFingerprint = Doh.pod?.fingerprint || null;
      let persistentFingerprint;

      if (currentFingerprint) {
        // Use current fingerprint as base but make it persistent
        persistentFingerprint = currentFingerprint;
      } else {
        // Generate new UUID-based fingerprint
        persistentFingerprint = CryptoAPI.randomUUID();
      }

      // Store the new persistent fingerprint
      const stored = await storeCloudAnchor(persistentFingerprint, currentFingerprint);
      if (stored) {
        return persistentFingerprint;
      } else {
        // Fallback to current fingerprint if storage fails
        console.warn(`[ManagedSite] Failed to store cloud anchor, using current fingerprint - Fingerprint: ${currentFingerprint}`);
        return currentFingerprint;
      }
    } catch (error) {
      console.error(`[ManagedSite Error] get_cloud_fingerprint: ${error.message}`);
      // Fallback to current fingerprint
      return Doh.pod?.fingerprint || 'fallback-' + Date.now();
    }
  }

  // --- End Cloud Anchor File Management ---

  // --- Cloud Anchoring API Call Functionality ---

  // Node.js-compatible HTTP request function
  async function makeHttpRequest(url, data = null, options = {}) {
    // Check if fetch is available (Node.js 18+ or browser)
    if (typeof fetch === 'undefined') {
      throw new Error('fetch is not available. Please use Node.js 18+ or install node-fetch.');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

    try {
      const fetchOptions = {
        method: data ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        signal: controller.signal
      };

      if (data) {
        fetchOptions.body = JSON.stringify(data);
      }

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      const responseData = await response.json();

      return {
        status: response.status,
        statusText: response.statusText,
        data: responseData
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  // Perform cloud anchoring with user credentials
  async function performCloudAnchoring(username, password) {
    try {
      const anchorEndpoint = `${Doh.pod.cloud.endpoint}/api/cloud/request-anchor-token`;

      // Make secure API call to Doh Cloud (credentials used only once)
      const response = await makeHttpRequest(anchorEndpoint, {
        username: username,
        password: password,
        instance_info: {
          fingerprint: await getCloudFingerprint(),
          pid: process.pid,
          timestamp: new Date().toISOString()
        }
      }, {
        timeout: Doh.pod.cloud.connection_timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Clear credentials from memory immediately
      username = null;
      password = null;

      if (response.status === 200 && response.data && response.data.siteAuthToken) {
        // Store the Site Authentication Token securely
        const stored = await storeSiteAuthToken(response.data.siteAuthToken);
        if (stored) {
          return {
            success: true,
            message: 'Instance successfully anchored to Doh Cloud account',
            anchored: true
          };
        } else {
          return {
            success: false,
            message: 'Failed to store authentication token securely'
          };
        }
      } else {
        // Enhanced error handling for different response scenarios
        let errorMessage = response.data?.error || 'Invalid response from Doh Cloud';

        // Provide specific guidance based on error type
        if (response.status === 401) {
          errorMessage = 'Invalid credentials. Please check your cloud username and password.';
        } else if (response.status === 403) {
          errorMessage = 'Access denied. Your account may not have permission to anchor instances.';
        } else if (response.status === 429) {
          errorMessage = 'Too many authentication attempts. Please wait a few minutes before trying again.';
        } else if (response.status >= 500) {
          errorMessage = 'Doh Cloud server error. Please try again later.';
        }

        return {
          success: false,
          message: errorMessage,
          statusCode: response.status
        };
      }

    } catch (error) {
      // Clear credentials from memory on error
      username = null;
      password = null;

      console.error(`[ManagedSite Error] cloud_anchoring: ${error.message} - Endpoint: ${Doh.pod.cloud.endpoint}`);

      // Use user-friendly error message
      const friendlyMessage = getUserFriendlyErrorMessage(error);

      return {
        success: false,
        message: friendlyMessage
      };
    }
  }

  // Perform cloud anchoring on behalf of another user (anchor-as)
  async function performCloudAnchoringAs(requestingUsername, requestingPassword, targetUserEmail) {
    try {
      const anchorAsEndpoint = `${Doh.pod.cloud.endpoint}/api/cloud/request-anchor-token-as`;

      // Make secure API call to Doh Cloud (credentials used only once)
      const response = await makeHttpRequest(anchorAsEndpoint, {
        requestingUsername: requestingUsername,
        requestingPassword: requestingPassword,
        targetUserEmail: targetUserEmail,
        instance_info: {
          fingerprint: await getCloudFingerprint(),
          pid: process.pid,
          timestamp: new Date().toISOString()
        }
      }, {
        timeout: Doh.pod.cloud.connection_timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Clear credentials from memory immediately
      requestingUsername = null;
      requestingPassword = null;

      if (response.status === 200 && response.data && response.data.siteAuthToken) {
        // Store the Site Authentication Token securely (token is for target user)
        const stored = await storeSiteAuthToken(response.data.siteAuthToken);
        if (stored) {
          return {
            success: true,
            message: `Instance successfully anchored to ${targetUserEmail}'s Doh Cloud account`,
            anchored: true,
            targetUser: targetUserEmail
          };
        } else {
          return {
            success: false,
            message: 'Failed to store authentication token securely'
          };
        }
      } else {
        // Enhanced error handling for different response scenarios
        let errorMessage = response.data?.error || 'Invalid response from Doh Cloud';

        // Provide specific guidance based on error type
        if (response.status === 401) {
          errorMessage = 'Invalid credentials. Please check your cloud username and password.';
        } else if (response.status === 403) {
          errorMessage = 'Access denied. You may not have permission to anchor instances on behalf of other users. You need the "manage:cloud_anchoring" permission.';
        } else if (response.status === 404) {
          errorMessage = `Target user "${targetUserEmail}" not found on the cloud manager.`;
        } else if (response.status === 429) {
          errorMessage = 'Too many authentication attempts. Please wait a few minutes before trying again.';
        } else if (response.status >= 500) {
          errorMessage = 'Doh Cloud server error. Please try again later.';
        }

        return {
          success: false,
          message: errorMessage,
          statusCode: response.status
        };
      }

    } catch (error) {
      // Clear credentials from memory on error
      requestingUsername = null;
      requestingPassword = null;

      console.error(`[ManagedSite Error] cloud_anchoring_as: ${error.message} - Endpoint: ${Doh.pod.cloud.endpoint}, TargetUser: ${targetUserEmail}`);

      // Use user-friendly error message
      const friendlyMessage = getUserFriendlyErrorMessage(error);

      return {
        success: false,
        message: friendlyMessage
      };
    }
  }

  // Check if instance is already anchored
  async function isInstanceAnchored() {
    const token = await loadSiteAuthToken();
    return token !== null;
  }

  // Validate and refresh token if needed
  async function validateAndRefreshToken() {
    const token = await loadSiteAuthToken();
    if (!token) {
      return { valid: false, reason: 'no_token' };
    }

    try {
      // Try to decode the token to check expiration (if it's a JWT)
      const parts = token.split('.');
      if (parts.length === 3) {
        // It's a JWT token, check expiration
        const payload = JSON.parse(atob(parts[1]));
        const now = Math.floor(Date.now() / 1000);

        if (payload.exp && payload.exp < now) {
          // Token is expired, attempt to refresh
          console.error(`[ManagedSite Error] token_validation: Site authentication token has expired - ExpiredAt: ${new Date(payload.exp * 1000).toISOString()}`);

          // For now, we don't have a refresh mechanism for site tokens
          // In a full implementation, this would call a refresh endpoint
          return { valid: false, reason: 'expired', needsReauth: true };
        }

        return { valid: true, token, expiresAt: payload.exp };
      }

      // Not a JWT token, assume it's valid (legacy format)
      return { valid: true, token };

    } catch (error) {
      console.error(`[ManagedSite Error] token_validation: ${error.message}`);
      return { valid: false, reason: 'invalid_format' };
    }
  }

  // --- End Cloud Anchoring API Call Functionality ---

  // --- Persistent Cloud Connection Management ---

  let cloudSocket = null;
  let cloudConnectionStatus = {
    connected: false,
    lastHeartbeat: null,
    lastCommunication: null,
    lastError: null,
    reconnectAttempts: 0
  };
  let reconnectTimer = null;
  let heartbeatTimer = null;

  // --- Advanced File Transfer Session Management ---

  // Active transfer sessions storage
  const transferSessions = new Map(); // transferId -> session data
  const activeChunks = new Map(); // transferId -> Set of active chunk indices

  // Transfer session structure
  function createTransferSession(transferId, operation, files) {
    return {
      transferId,
      operation, // 'upload', 'download', 'sync'
      files: files.map(file => ({
        ...file,
        chunks: Math.ceil(file.size / getOptimalChunkSize(file.size)),
        chunkSize: getOptimalChunkSize(file.size),
        status: 'pending',
        transferredChunks: new Set(),
        checksum: null,
        tempPath: file.tempPath || null, // Preserve existing tempPath if set, otherwise null
        chunkStatus: file.chunkStatus || null // Preserve existing chunkStatus if set, otherwise null
      })),
      progress: {
        totalBytes: files.reduce((sum, file) => sum + file.size, 0),
        transferredBytes: 0,
        percentage: 0,
        speed: 0,
        eta: null,
        startTime: Date.now(),
        lastUpdateTime: Date.now()
      },
      status: 'pending', // 'pending', 'transferring', 'completed', 'failed', 'cancelled'
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      error: null
    };
  }

  // Determine optimal chunk size based on file size
  function getOptimalChunkSize(fileSize) {
    const config = Doh.pod.cloud.file_sync;
    const minChunk = config.min_chunk_size;
    const maxChunk = config.max_chunk_size;

    // Adaptive chunk sizing based on file size
    if (fileSize < 10 * 1024 * 1024) { // < 10MB
      return Math.max(minChunk, 64 * 1024); // 64KB
    } else if (fileSize < 100 * 1024 * 1024) { // < 100MB
      return Math.max(minChunk, 256 * 1024); // 256KB
    } else if (fileSize < 1024 * 1024 * 1024) { // < 1GB
      return Math.max(minChunk, 512 * 1024); // 512KB
    } else {
      return maxChunk; // 1MB for very large files
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

  // Progress tracking and reporting
  function updateTransferProgress(transferId, bytesTransferred) {
    const session = transferSessions.get(transferId);
    if (!session) return;

    const now = Date.now();
    const timeDiff = now - session.progress.lastUpdateTime;

    session.progress.transferredBytes += bytesTransferred;
    session.progress.percentage = (session.progress.transferredBytes / session.progress.totalBytes) * 100;
    session.progress.lastUpdateTime = now;

    // Calculate transfer speed (bytes per second)
    const totalTimeDiff = now - session.progress.startTime;
    if (totalTimeDiff > 0) {
      session.progress.speed = session.progress.transferredBytes / (totalTimeDiff / 1000);

      // Calculate ETA
      const remainingBytes = session.progress.totalBytes - session.progress.transferredBytes;
      if (session.progress.speed > 0) {
        session.progress.eta = Math.ceil(remainingBytes / session.progress.speed);
      }
    }

    session.updated = new Date().toISOString();

    // Emit progress update via WebSocket if connected
    if (cloudSocket && cloudSocket.connected) {
      cloudSocket.emit('transfer_progress', {
        transferId,
        progress: session.progress,
        timestamp: session.updated
      });
    }
  }

  // Session cleanup functions
  async function cleanupTransferSession(transferId, success = false) {
    const session = transferSessions.get(transferId);
    if (!session) return;

    try {
      // Clean up temporary files for each file in the session
      for (const file of session.files) {
        if (file.tempPath && fs.existsSync(file.tempPath)) {
          await fs.remove(file.tempPath);
        }
      }

      // Clean up chunk tracking
      activeChunks.delete(transferId);

      // Update session status
      session.status = success ? 'completed' : 'failed';
      session.updated = new Date().toISOString();

      // Keep session record for a short time for status queries
      setTimeout(() => {
        transferSessions.delete(transferId);
      }, 300000); // 5 minutes

    } catch (error) {
      console.error(`[ManagedSite Error] transfer_cleanup: ${error.message} - TransferId: ${transferId}`);
    }
  }

  // Periodic cleanup of old sessions
  setInterval(() => {
    const now = Date.now();
    const maxAge = Doh.pod.cloud.file_sync.max_session_age;

    for (const [transferId, session] of transferSessions) {
      const sessionAge = now - new Date(session.created).getTime();
      if (sessionAge > maxAge) {
        cleanupTransferSession(transferId, false);
      }
    }
  }, Doh.pod.cloud.file_sync.cleanup_interval);

  // --- End Advanced File Transfer Session Management ---

  // Establish persistent connection to Doh Cloud
  async function establishCloudConnection() {
    try {
      // Validate token before attempting connection
      const tokenValidation = await validateAndRefreshToken();
      if (!tokenValidation.valid) {
        if (tokenValidation.needsReauth) {
          console.error(`[ManagedSite Error] cloud_connection: Site authentication token expired - re-anchoring required - Reason: ${tokenValidation.reason}`);
        }
        return false;
      }

      const token = tokenValidation.token;
      
      // Pre-compute fingerprint for authentication
      const cloudFingerprint = await getCloudFingerprint();

      // Node.js context - use Socket.IO client directly
      const cloudEndpoint = Doh.pod.cloud.endpoint;
      cloudSocket = ioClient(cloudEndpoint, {
        transports: ['websocket'],
        reconnection: false, // We'll handle reconnection manually
        timeout: Doh.pod.cloud.connection_timeout
      });

      // Connection event handlers
      cloudSocket.on('connect', () => {
        // Only log if not in CLI mode (when process.argv doesn't contain 'cloud')
        if (!process.argv.some(arg => arg === 'cloud')) {
          console.log('[ManagedSite] Socket connected to cloud manager');
        }
        cloudConnectionStatus.connected = true;
        cloudConnectionStatus.lastCommunication = new Date().toISOString();
        cloudConnectionStatus.reconnectAttempts = 0;
        cloudConnectionStatus.lastError = null;

        // Authenticate with cloud immediately after connection
        if (!process.argv.some(arg => arg === 'cloud')) {
          console.log('[ManagedSite] Sending authentication request to cloud manager');
        }
        
        // Set a timeout for authentication to prevent hanging
        const authTimeout = setTimeout(() => {
          console.error('[ManagedSite Error] cloud_auth: Authentication timeout - no response from cloud manager');
          cloudSocket.disconnect();
        }, 10000); // 10 second timeout
        
        cloudSocket.emit('cloud:authenticate', {
          siteAuthToken: token,
          instanceInfo: {
            fingerprint: cloudFingerprint,
            pid: process.pid,
            timestamp: new Date().toISOString()
          }
        }, (response) => {
          clearTimeout(authTimeout);
          
          if (response && response.success) {
            // Only log if not in CLI mode
            if (!process.argv.some(arg => arg === 'cloud')) {
              console.log('[ManagedSite] Successfully authenticated with cloud manager');
            }
            
            // Set up command listeners after successful authentication
            setupCommandListeners();

            // Note: No longer starting automatic heartbeats - cloud manager now pings us when needed
          } else {
            console.error(`[ManagedSite Error] cloud_auth: Authentication failed - ${response?.message || 'No response'}`);
            cloudSocket.disconnect();
          }
        });
      });

      cloudSocket.on('disconnect', (reason) => {
        // Only log if not in CLI mode  
        if (!process.argv.some(arg => arg === 'cloud')) {
          console.log(`[ManagedSite] Socket disconnected from cloud manager - Reason: ${reason}`);
        }
        cloudConnectionStatus.connected = false;
        cloudConnectionStatus.lastError = reason;

        // Schedule reconnection if not intentional
        if (reason !== 'io client disconnect') {
          if (!process.argv.some(arg => arg === 'cloud')) {
            console.log(`[ManagedSite] Scheduling reconnection after disconnect - Reason: ${reason}`);
          }
          scheduleReconnection();
        }
      });

      cloudSocket.on('connect_error', (error) => {
        const delay = handleConnectionError(error, 'cloud_connection');
        scheduleReconnection();
      });

      // Heartbeat response
      cloudSocket.on('heartbeat_response', (data) => {
        cloudConnectionStatus.lastHeartbeat = new Date().toISOString();
        cloudConnectionStatus.lastCommunication = new Date().toISOString();
      });

      return true;

    } catch (error) {
      const delay = handleConnectionError(error, 'cloud_connection_init');
      scheduleReconnection();
      return false;
    }
  }

  // Set up command listeners after successful authentication
  function setupCommandListeners() {
    if (!cloudSocket) {
      console.error('[ManagedSite Error] command_setup: No cloud socket available for command listeners');
      return;
    }

    // Handle ping requests from cloud manager (new active verification system)
    cloudSocket.on('ping', (pingData, callback) => {
      try {
        const response = {
          success: true,
          pingId: pingData.pingId,
          timestamp: new Date().toISOString(),
          status: 'connected',
          health: {
            memory: Doh.performance?.heapUsed ? Doh.performance.heapUsed() : null,
            cpu: Doh.performance?.cpuUsage ? Doh.performance.cpuUsage() : null,
            uptime: process.uptime()
          }
        };
        
        if (callback && typeof callback === 'function') {
          callback(response);
        }
        
        // Update connection status
        cloudConnectionStatus.lastHeartbeat = new Date().toISOString();
        cloudConnectionStatus.lastCommunication = new Date().toISOString();
        
      } catch (error) {
        console.error(`[ManagedSite Error] ping_response: ${error.message}`);
        if (callback && typeof callback === 'function') {
          callback({ success: false, error: error.message });
        }
      }
    });

    // Command reception (primary event for managed instances)
    cloudSocket.on('command', async (commandData, callback) => {
      try {
        const result = await executeCloudCommand(commandData);
        if (callback) {
          callback({ success: true, result });
        }
      } catch (error) {
        console.error(`[ManagedSite Error] command_execution: ${error.message} - CommandType: ${commandData.type}, RequestId: ${commandData.requestId}`);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    // Handle cloud commands with cloud: prefix (fallback for browser instances)
    cloudSocket.on('cloud:command', async (commandData, callback) => {
      try {
        const result = await executeCloudCommand(commandData);
        if (callback) {
          callback({ success: true, result });
        }
      } catch (error) {
        console.error(`[ManagedSite Error] command_execution: ${error.message} - CommandType: ${commandData.type}, RequestId: ${commandData.requestId}`);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });
  }

  // Disconnect from Doh Cloud
  function disconnectFromCloud() {
    clearReconnectionTimer();

    if (cloudSocket) {
      cloudSocket.disconnect();
      cloudSocket = null;
    }

    cloudConnectionStatus.connected = false;
    cloudConnectionStatus.lastCommunication = null;
  }

  // Schedule reconnection attempt
  function scheduleReconnection() {
    if (reconnectTimer) {
      if (!process.argv.some(arg => arg === 'cloud')) {
        console.log('[ManagedSite] Reconnection already scheduled, skipping duplicate request');
      }
      return; // Already scheduled
    }

    const delay = Math.min(
      Doh.pod.cloud.reconnect_interval * Math.pow(2, cloudConnectionStatus.reconnectAttempts),
      60000 // Max 1 minute delay
    );

    if (!process.argv.some(arg => arg === 'cloud')) {
      console.log(`[ManagedSite] Scheduling reconnection in ${delay}ms - Attempt: ${cloudConnectionStatus.reconnectAttempts + 1}`);
    }

    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      cloudConnectionStatus.reconnectAttempts++;

      try {
        // Only attempt reconnection if we still have a token
        const token = await loadSiteAuthToken();
        if (token) {
          // Clean up the old socket before reconnecting
          if (cloudSocket) {
            cloudSocket.removeAllListeners();
            cloudSocket.disconnect();
            cloudSocket = null;
          }
          await establishCloudConnection();
        } else {
          if (!process.argv.some(arg => arg === 'cloud')) {
            console.log('[ManagedSite] No authentication token available, skipping reconnection');
          }
        }
      } catch (error) {
        console.error(`[ManagedSite Error] reconnection_attempt: ${error.message}`);
      }
    }, delay);
  }

  // Clear reconnection timer
  function clearReconnectionTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  // --- Legacy heartbeat functions (replaced by ping-based system) ---
  // Note: These functions are kept for reference but no longer used.
  // The cloud manager now actively pings instances for verification instead 
  // of instances continuously sending heartbeats.
  
  function startHeartbeat() {
    // No longer used - cloud manager now pings us when verification is needed
    console.log('[ManagedSite] Heartbeat system disabled - using ping-based verification');
  }

  function stopHeartbeat() {
    // No longer used - no continuous heartbeat timer to stop
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  // Get current cloud connection status
  function getCloudConnectionStatus() {
    const status = {
      ...cloudConnectionStatus,
      endpoint: Doh.pod.cloud.endpoint
    };

    // Add user-friendly error message if there's an error
    if (cloudConnectionStatus.lastError) {
      status.friendlyError = getUserFriendlyErrorMessage({
        message: cloudConnectionStatus.lastError,
        code: cloudConnectionStatus.lastError
      });
    }

    return status;
  }

  // --- End Persistent Cloud Connection Management ---

  // --- Cloud Command Reception and Execution (Step 8) ---

  // Execute commands received from Doh Cloud using the command handlers sub-module
  async function executeCloudCommand(commandData) {
    // Get fingerprint data for context - use provided fingerprintData if available from cloud manager
    let fingerprintData;
    
    if (commandData.fingerprintData) {
      // Use the fingerprintData provided by the cloud manager (contains correct userId)
      fingerprintData = commandData.fingerprintData;
      // console.log(`[ManagedSite] Using fingerprintData from cloud manager - userId: ${fingerprintData.userId}, fingerprint: ${fingerprintData.fingerprint}`);
    } else {
      // Fallback to local fingerprint (for backward compatibility or direct access)
      const cloudFingerprint = await getCloudFingerprint();
      fingerprintData = {
        userId: cloudFingerprint, // Fallback when no cloud manager context
        fingerprint: cloudFingerprint
      };
      // console.log(`[ManagedSite] Using local fingerprint data - userId: ${fingerprintData.userId}, fingerprint: ${fingerprintData.fingerprint}`);
    }
    
    // Create context object for command handlers
    const context = {
      transferSessions,
      activeChunks,
      auditLog,
      isInstanceAnchored,
      getCloudConnectionStatus,
      getCloudFingerprint,
      createTransferSession,
      getOptimalChunkSize,
      updateTransferProgress,
      cleanupTransferSession,
      cloudSocket,
      fingerprintData
    };

    // Delegate to command handlers sub-module
    return await managedSite.CommandHandlers.executeCloudCommand(commandData, context);
  }

  // Audit logging function
  function auditLog(action, data) {
    // Only log important command events
    if (action === 'command_received') {
      // Silent for now - could be enabled for debugging
    }
  }

  // --- End Cloud Command Reception and Execution ---

  // --- Permission System Setup for Cloud Anchoring ---
  
  // Define cloud anchoring permission context
  if (typeof Doh.definePermissionContext === 'function') {
    Doh.definePermissionContext('cloud_anchoring', (user, context) => {
      // Context applies when we have cloud anchoring operations on the local instance
      return context && context.operation && context.instanceFingerprint;
    });
    
    // Define cloud manager group for users who can manage cloud connections
    Doh.definePermissionGroup('cloud_manager', {
      assignable: true,
      permissions: [
        'manage:cloud_anchoring',    // Can anchor/unanchor instances
        'view:cloud_anchoring'       // Can view cloud connection interface
      ]
    });
    
    // Define instance admin group (for backwards compatibility and local administration)
    Doh.definePermissionGroup('instance_admin', {
      assignable: true,
      permissions: [
        'manage:cloud_anchoring',    // Can manage cloud connections
        'view:cloud_anchoring'       // Can view cloud connection interface
      ]
    });
  }

  // --- Cloud Anchoring Admin UI Route ---

  // Combined endpoint - Handle both GET (display interface) and POST (process anchoring)
  Router.AddRoute('/admin/cloud-connect', [], async function (data, req, res, cb) {
    try {
      // Check if user authentication is available - if not, deny access completely
      if (typeof Doh.permit !== 'function') {
        return Router.SendJSON(res, { 
          success: false, 
          error: 'Cloud connection management requires user authentication. Please use the CLI command: doh cloud anchor' 
        }, 403, cb);
      }
      
      // Check authentication
      if (!req.user) {
        return Router.SendJSON(res, { 
          success: false, 
          error: 'Authentication required to access cloud connection management' 
        }, 401, cb);
      }
      
      // Create context for permission checking
      const cloudAnchoringContext = {
        operation: req.method === 'POST' ? 'anchor' : 'view',
        instanceFingerprint: await getCloudFingerprint(),
        endpoint: Doh.pod.cloud.endpoint
      };
      
      // Check permissions based on operation
      const requiredPermission = req.method === 'POST' ? 'manage:cloud_anchoring' : 'view:cloud_anchoring';
      
      if (!(await Doh.permit(req.user, requiredPermission, cloudAnchoringContext))) {
        return Router.SendJSON(res, { 
          success: false, 
          error: 'Insufficient permissions to access cloud connection management. Contact an administrator to be granted cloud_manager or instance_admin permissions.' 
        }, 403, cb);
      }
      
      if (req.method === 'POST') {
        // Handle POST - cloud anchoring request
        try {
          const { username, password } = data;

          if (!username || !password) {
            Router.SendJSON(res, {
              success: false,
              message: 'Username and password are required'
            }, 400, cb);
            return;
          }

          // Perform cloud anchoring
          const result = await performCloudAnchoring(username, password);

          Router.SendJSON(res, result, cb);

        } catch (error) {
          console.error(`[ManagedSite Error] api_cloud_connect_post: ${error.message} - Route: /admin/cloud-connect, Method: POST`);
          Router.SendJSON(res, {
            success: false,
            message: 'Internal server error during cloud anchoring'
          }, 500, cb);
        }
      } else {
        // Handle GET - display cloud anchoring interface
        try {
          const isAnchored = await isInstanceAnchored();
          const cloudEndpoint = Doh.pod.cloud.endpoint;
          const endpointUrl = new URL(cloudEndpoint);
          const endpointHost = endpointUrl.hostname;

        const htmlContent = `
            <div class="container">
              <div class="card">
                <div class="header">
                  <h1>🌩️ Doh Cloud Anchoring</h1>
                  <p>Connect your local Doh instance to Doh Cloud for remote management</p>
                </div>
                
                <div class="status ${isAnchored ? 'anchored' : 'not-anchored'}">
                  ${isAnchored ?
              '✅ This instance is anchored to Doh Cloud' :
              '⚠️ This instance is not anchored to Doh Cloud'
            }
                </div>

                <div class="endpoint-info">
                  <strong>Cloud Endpoint:</strong> ${endpointHost}
                </div>
                
                <div class="info">
                  <strong>How it works:</strong> Your cloud credentials will be used once 
                  to obtain a secure Site Authentication Token. Your credentials are never stored 
                  on this instance.
                </div>
                
                <form id="anchorForm">
                  <div class="form-group">
                    <label for="username">Cloud Username:</label>
                    <input type="text" id="username" name="username" required 
                           placeholder="Enter your cloud username">
                  </div>
                  
                  <div class="form-group">
                    <label for="password">Cloud Password:</label>
                    <input type="password" id="password" name="password" required 
                           placeholder="Enter your cloud password">
                  </div>
                  
                  <button type="submit" class="btn" id="anchorBtn">
                    ${isAnchored ? 'Re-anchor Instance' : 'Anchor Instance'}
                  </button>
                  
                  ${isAnchored ? `
                    <button type="button" class="btn danger" id="clearBtn">
                      Clear Anchoring
                    </button>
                  ` : ''}
                </form>
                
                <div class="spinner" id="spinner">
                  <p><span class="icon">🔄</span>Connecting to Doh Cloud...</p>
                </div>
                
                <div class="message" id="message"></div>
              </div>
            </div>
            
            <script>
              const form = document.getElementById('anchorForm');
              const btn = document.getElementById('anchorBtn');
              const clearBtn = document.getElementById('clearBtn');
              const spinner = document.getElementById('spinner');
              const message = document.getElementById('message');
              
              function showMessage(text, type) {
                message.textContent = text;
                message.className = 'message ' + type;
                message.style.display = 'block';
              }
              
              function hideMessage() {
                message.style.display = 'none';
              }
              
              form.addEventListener('submit', async (e) => {
                e.preventDefault();
                hideMessage();
                
                const username = document.getElementById('username').value;
                const password = document.getElementById('password').value;
                
                if (!username || !password) {
                  showMessage('Please enter both username and password', 'error');
                  return;
                }
                
                btn.disabled = true;
                spinner.style.display = 'block';
                
                try {
                  const response = await fetch('/admin/cloud-connect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                  });
                  
                  const result = await response.json();
                  
                  if (result.success) {
                    showMessage(result.message, 'success');
                    setTimeout(() => location.reload(), 2000);
                  } else {
                    showMessage(result.message, 'error');
                  }
                } catch (error) {
                  showMessage('Network error: ' + error.message, 'error');
                } finally {
                  btn.disabled = false;
                  spinner.style.display = 'none';
                  // Clear form
                  document.getElementById('password').value = '';
                }
              });
              
              if (clearBtn) {
                clearBtn.addEventListener('click', async () => {
                  if (!confirm('Are you sure you want to clear the cloud anchoring?')) return;
                  
                  try {
                    const response = await fetch('/admin/cloud-connect/clear', { method: 'POST' });
                    const result = await response.json();
                    
                    if (result.success) {
                      showMessage('Cloud anchoring cleared successfully', 'success');
                      setTimeout(() => location.reload(), 1500);
                    } else {
                      showMessage(result.message, 'error');
                    }
                  } catch (error) {
                    showMessage('Error clearing anchoring: ' + error.message, 'error');
                  }
                });
              }
            </script>
        `;

        // res.setHeader('Content-Type', 'text/html');
        // res.send(htmlContent);
        Router.SendContent(res, htmlContent, {
          title: 'Doh Cloud Anchoring',
          dependencies: [
            DohPath.DohSlash('^/cloud_connect_styles.css')
          ]
        });

        } catch (error) {
          console.error(`[ManagedSite Error] api_cloud_connect_get: ${error.message} - Route: /admin/cloud-connect, Method: GET`);
          Router.SendJSON(res, { success: false, error: 'Failed to load cloud connect interface' }, 500, cb);
        }
      }
      
    } catch (error) {
      console.error(`[ManagedSite Error] api_cloud_connect: ${error.message} - Route: /admin/cloud-connect`);
      Router.SendJSON(res, { success: false, error: 'Failed to process cloud connection request' }, 500, cb);
    }
  });

  // Clear cloud anchoring endpoint
  Router.AddRoute('/admin/cloud-connect/clear', [], async function(data, req, res, cb) {
    if (req.method !== 'POST') return;
    
    try {
      // Check if user authentication is available - if not, deny access completely
      if (typeof Doh.permit !== 'function') {
        return Router.SendJSON(res, { 
          success: false, 
          error: 'Cloud connection management requires user authentication. Please use the CLI command: doh cloud anchor' 
        }, 403, cb);
      }
      
      // Check authentication
      if (!req.user) {
        return Router.SendJSON(res, { 
          success: false, 
          error: 'Authentication required to clear cloud connection' 
        }, 401, cb);
      }
      
      // Create context for permission checking
      const cloudAnchoringContext = {
        operation: 'clear',
        instanceFingerprint: await getCloudFingerprint(),
        endpoint: Doh.pod.cloud.endpoint
      };
      
      // Check manage permissions (clearing requires manage permission)
      if (!(await Doh.permit(req.user, 'manage:cloud_anchoring', cloudAnchoringContext))) {
        return Router.SendJSON(res, { 
          success: false, 
          error: 'Insufficient permissions to clear cloud connection. Contact an administrator to be granted cloud_manager or instance_admin permissions.' 
        }, 403, cb);
      }
      
      // Clear the authentication token and cloud anchor
      const tokenCleared = await clearSiteAuthToken();
      const anchorCleared = await clearCloudAnchor();
      
      if (tokenCleared && anchorCleared) {
        // Disconnect from cloud if connected
        disconnectFromCloud();
        
        Router.SendJSON(res, {
          success: true,
          message: 'Cloud anchoring cleared successfully'
        }, cb);
      } else {
        Router.SendJSON(res, {
          success: false,
          message: 'Failed to clear cloud anchoring completely'
        }, 500, cb);
      }
      
    } catch (error) {
      console.error(`[ManagedSite Error] api_cloud_connect_clear: ${error.message} - Route: /admin/cloud-connect/clear`);
      Router.SendJSON(res, {
        success: false,
        message: 'Internal server error while clearing cloud anchoring'
      }, 500, cb);
    }
  });

  // --- End Cloud Anchoring Admin UI Route ---

  // --- Startup Sequence Enhancement (Step 7) ---

  // Initialize cloud connection on module startup
  async function initializeCloudConnection() {
    // Load sync status cache for efficient file sync checking
    managedSite.CommandHandlers.loadSyncStatusCache().catch(error => {
      console.error('[ManagedSite] Error loading sync status cache:', error);
    });
    
    try {
      const isAnchored = await isInstanceAnchored();
      if (isAnchored) {
        const connected = await establishCloudConnection();
      }

    } catch (error) {
      console.error(`[ManagedSite Error] startup: ${error.message} - Context: cloud_connection_initialization`);
    }
  }

  // Graceful shutdown handling
  function setupGracefulShutdown() {
    const cleanup = () => {
      disconnectFromCloud();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  // Initialize on startup
  setupGracefulShutdown();

  // Start health monitoring
  setInterval(performHealthCheck, 120000); // Every 2 minutes

  // Delay initialization to ensure all modules are loaded
  setTimeout(initializeCloudConnection, 1000);

  // --- End Startup Sequence Enhancement ---

  // --- Comprehensive Error Handling and Logging (Step 10) ---

  // Determine if error is critical
  function isCriticalError(error) {
    const criticalCodes = ['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'];
    const criticalMessages = ['authentication failed', 'token invalid', 'permission denied'];

    return criticalCodes.includes(error.code) ||
      criticalMessages.some(msg => error.message.toLowerCase().includes(msg));
  }

  // Enhanced connection error recovery
  function handleConnectionError(error, context = 'connection') {
    console.error(`[ManagedSite Error] ${context}: ${error.message} - CloudEndpoint: ${Doh.pod.cloud.endpoint}, ReconnectAttempts: ${cloudConnectionStatus.reconnectAttempts}`);

    // Update connection status
    cloudConnectionStatus.connected = false;
    cloudConnectionStatus.lastError = error.message;

    // Implement exponential backoff for reconnection
    const baseDelay = Doh.pod.cloud.reconnect_interval;
    const maxDelay = 300000; // 5 minutes max
    const attempt = cloudConnectionStatus.reconnectAttempts;

    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

    return delay;
  }

  // Health check and recovery
  async function performHealthCheck() {
    try {
      const status = {
        cloudConnection: cloudSocket?.connected || false,
        authToken: await isInstanceAnchored(),
        lastHeartbeat: cloudConnectionStatus.lastHeartbeat,
        lastError: cloudConnectionStatus.lastError,
        reconnectAttempts: cloudConnectionStatus.reconnectAttempts
      };

      // Auto-recovery logic
      if (status.authToken && !status.cloudConnection && cloudConnectionStatus.reconnectAttempts < 10) {
        await establishCloudConnection();
      }

      return status;

    } catch (error) {
      console.error(`[ManagedSite Error] health_check: ${error.message}`);
      return { error: error.message };
    }
  }

  // Enhanced user-friendly error messages
  function getUserFriendlyErrorMessage(error) {
    const errorMap = {
      'ENOTFOUND': 'Unable to connect to Doh Cloud. Please check your internet connection.',
      'ECONNREFUSED': 'Doh Cloud server is not responding. Please try again later.',
      'ETIMEDOUT': 'Connection to Doh Cloud timed out. Please check your network.',
      'ECONNRESET': 'Connection was interrupted. Attempting to reconnect...',
      'authentication failed': 'Your Doh Cloud credentials are invalid. Please re-anchor your instance.',
      'token invalid': 'Your authentication token has expired. Please re-anchor your instance.'
    };

    const errorKey = Object.keys(errorMap).find(key =>
      error.code === key || error.message.toLowerCase().includes(key.toLowerCase())
    );

    return errorKey ? errorMap[errorKey] : 'An unexpected error occurred. Please check the logs for details.';
  }

  // --- End Comprehensive Error Handling and Logging ---

  // --- Advanced Error Handling and Recovery Patterns (Step 7) ---

  // Error classification system
  const ErrorTypes = {
    NETWORK: 'network',
    AUTH: 'authentication',
    FILESYSTEM: 'filesystem',
    CORRUPTION: 'corruption',
    TIMEOUT: 'timeout',
    PERMISSION: 'permission',
    RESOURCE: 'resource'
  };

  // Circuit breaker for network operations
  class CircuitBreaker {
    constructor(name, options = {}) {
      this.name = name;
      this.failureThreshold = options.failureThreshold || 5;
      this.recoveryTimeout = options.recoveryTimeout || 60000; // 1 minute
      this.monitoringPeriod = options.monitoringPeriod || 300000; // 5 minutes

      this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
      this.failureCount = 0;
      this.lastFailureTime = 0;
      this.successCount = 0;
      this.requests = [];
    }

    async execute(operation) {
      if (this.state === 'OPEN') {
        if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
          this.state = 'HALF_OPEN';
          this.successCount = 0;
        } else {
          throw new Error(`Circuit breaker ${this.name} is OPEN - operation blocked`);
        }
      }

      try {
        const result = await operation();
        this.onSuccess();
        return result;
      } catch (error) {
        this.onFailure();
        throw error;
      }
    }

    onSuccess() {
      this.failureCount = 0;
      if (this.state === 'HALF_OPEN') {
        this.successCount++;
        if (this.successCount >= 3) { // Require 3 successes to close
          this.state = 'CLOSED';
        }
      }
    }

    onFailure() {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
      }
    }

    getStatus() {
      return {
        name: this.name,
        state: this.state,
        failureCount: this.failureCount,
        lastFailureTime: this.lastFailureTime,
        successCount: this.successCount
      };
    }
  }

  // Circuit breakers for different operation types
  const circuitBreakers = {
    fileOperations: new CircuitBreaker('fileOperations', { failureThreshold: 3, recoveryTimeout: 30000 }),
    networkOperations: new CircuitBreaker('networkOperations', { failureThreshold: 5, recoveryTimeout: 60000 }),
    authOperations: new CircuitBreaker('authOperations', { failureThreshold: 3, recoveryTimeout: 120000 })
  };

  // Exponential backoff retry strategy
  class RetryStrategy {
    constructor(options = {}) {
      this.maxRetries = options.maxRetries || 3;
      this.baseDelay = options.baseDelay || 1000;
      this.maxDelay = options.maxDelay || 30000;
      this.backoffFactor = options.backoffFactor || 2;
      this.jitter = options.jitter || true;
    }

    async execute(operation, context = {}) {
      let lastError;

      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          return await operation();
        } catch (error) {
          lastError = error;

          // Don't retry on certain error types
          const errorType = classifyError(error);
          if (!this.shouldRetry(errorType, attempt)) {
            throw error;
          }

          if (attempt < this.maxRetries) {
            const delay = this.calculateDelay(attempt);
            console.log(`[ManagedSite] Retry attempt ${attempt + 1}/${this.maxRetries} after ${delay}ms - Context: ${context.operation || 'unknown'}, Error: ${error.message}`);
            await this.delay(delay);
          }
        }
      }

      throw lastError;
    }

    shouldRetry(errorType, attempt) {
      // Don't retry authentication or permission errors
      if (errorType === ErrorTypes.AUTH || errorType === ErrorTypes.PERMISSION) {
        return false;
      }

      // Don't retry corruption errors (data integrity issues)
      if (errorType === ErrorTypes.CORRUPTION) {
        return false;
      }

      return attempt < this.maxRetries;
    }

    calculateDelay(attempt) {
      let delay = this.baseDelay * Math.pow(this.backoffFactor, attempt);
      delay = Math.min(delay, this.maxDelay);

      // Add jitter to prevent thundering herd
      if (this.jitter) {
        delay = delay * (0.5 + Math.random() * 0.5);
      }

      return Math.floor(delay);
    }

    async delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  // Error classification function
  function classifyError(error) {
    const message = error.message.toLowerCase();

    if (message.includes('enotfound') || message.includes('econnrefused') ||
      message.includes('econnreset') || message.includes('etimedout')) {
      return ErrorTypes.NETWORK;
    }

    if (message.includes('authentication') || message.includes('unauthorized') ||
      message.includes('token')) {
      return ErrorTypes.AUTH;
    }

    if (message.includes('enoent') || message.includes('eacces') ||
      message.includes('emfile') || message.includes('enospc')) {
      return ErrorTypes.FILESYSTEM;
    }

    if (message.includes('checksum') || message.includes('integrity') ||
      message.includes('corruption')) {
      return ErrorTypes.CORRUPTION;
    }

    if (message.includes('timeout') || message.includes('timed out')) {
      return ErrorTypes.TIMEOUT;
    }

    if (message.includes('permission') || message.includes('access denied')) {
      return ErrorTypes.PERMISSION;
    }

    if (message.includes('out of memory') || message.includes('enospc') ||
      message.includes('resource')) {
      return ErrorTypes.RESOURCE;
    }

    return ErrorTypes.NETWORK; // Default to network error
  }

  // Enhanced error recovery for file operations
  async function executeWithRecovery(operation, options = {}) {
    const {
      operationType = 'file',
      context = {},
      useCircuitBreaker = true,
      retryOptions = {}
    } = options;

    const retryStrategy = new RetryStrategy(retryOptions);
    const circuitBreaker = circuitBreakers[operationType + 'Operations'] || circuitBreakers.fileOperations;

    const wrappedOperation = async () => {
      if (useCircuitBreaker) {
        return await circuitBreaker.execute(operation);
      } else {
        return await operation();
      }
    };

    try {
      return await retryStrategy.execute(wrappedOperation, context);
    } catch (error) {
      // Enhanced error reporting
      const errorType = classifyError(error);
      const enhancedError = new Error(error.message);
      enhancedError.type = errorType;
      enhancedError.context = context;
      enhancedError.circuitBreakerStatus = circuitBreaker.getStatus();
      enhancedError.originalError = error;

      console.error(`[ManagedSite Error] Operation failed after recovery attempts - Type: ${errorType}, Context: ${JSON.stringify(context)}, CircuitBreaker: ${circuitBreaker.getStatus().state}`);

      throw enhancedError;
    }
  }

  // Convenience function for retry with exponential backoff
  async function retryWithBackoff(operation, options = {}) {
    const retryStrategy = new RetryStrategy(options);
    return await retryStrategy.execute(operation, options.context || {});
  }

  // Health monitoring and automatic recovery
  async function performAdvancedHealthCheck() {
    const healthStatus = {
      timestamp: new Date().toISOString(),
      cloudConnection: cloudSocket?.connected || false,
      fileSystem: await checkFileSystemHealth(),
      circuitBreakers: {},
      transferSessions: {
        active: transferSessions.size,
        oldestSession: getOldestSessionAge()
      },
      errors: {
        recent: getRecentErrors(),
        patterns: analyzeErrorPatterns()
      }
    };

    // Check circuit breaker states
    for (const [name, breaker] of Object.entries(circuitBreakers)) {
      healthStatus.circuitBreakers[name] = breaker.getStatus();
    }

    // Attempt auto-recovery for certain issues
    await attemptAutoRecovery(healthStatus);

    return healthStatus;
  }

  // Cloud connection health check
  async function checkCloudConnectionHealth() {
    return {
      connected: cloudSocket?.connected || false,
      lastHeartbeat: cloudConnectionStatus.lastHeartbeat,
      reconnectAttempts: cloudConnectionStatus.reconnectAttempts,
      lastError: cloudConnectionStatus.lastError
    };
  }

  // File system health check
  async function checkFileSystemHealth() {
    try {
      const tempDir = DohPath(Doh.pod.cloud.file_sync.temp_dir);
      await fs.ensureDir(tempDir);

      // Test write capability
      const testFile = DohPath.Join(tempDir, 'health_check.tmp');
      await fsp.writeFile(testFile, 'health_check');
      await fs.remove(testFile);

      return { status: 'healthy', writable: true };
    } catch (error) {
      return { status: 'unhealthy', error: error.message, writable: false };
    }
  }

  // Get age of oldest transfer session
  function getOldestSessionAge() {
    if (transferSessions.size === 0) return 0;

    let oldest = Date.now();
    for (const session of transferSessions.values()) {
      const sessionTime = new Date(session.created).getTime();
      if (sessionTime < oldest) {
        oldest = sessionTime;
      }
    }

    return Date.now() - oldest;
  }

  // Recent error tracking
  const recentErrors = [];
  const maxRecentErrors = 100;

  function logError(error, context = {}) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      message: error.message,
      type: classifyError(error),
      context,
      stack: error.stack
    };

    recentErrors.push(errorEntry);
    if (recentErrors.length > maxRecentErrors) {
      recentErrors.shift();
    }
  }

  function getRecentErrors(minutes = 30) {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    return recentErrors.filter(error =>
      new Date(error.timestamp).getTime() > cutoff
    );
  }

  function analyzeErrorPatterns() {
    const recent = getRecentErrors();
    const patterns = {};

    for (const error of recent) {
      const key = `${error.type}_${error.context.operation || 'unknown'}`;
      patterns[key] = (patterns[key] || 0) + 1;
    }

    return patterns;
  }

  // Auto-recovery attempts
  async function attemptAutoRecovery(healthStatus) {
    // Restart cloud connection if needed
    if (!healthStatus.cloudConnection.connected && healthStatus.circuitBreakers.authOperations?.state !== 'OPEN') {
      try {
        await establishCloudConnection();
      } catch (error) {
        logError(error, { operation: 'auto_recovery_cloud_connection' });
      }
    }

    // Clean up stale transfer sessions
    const maxSessionAge = Doh.pod.cloud.file_sync.max_session_age;
    if (healthStatus.transferSessions.oldestSession > maxSessionAge * 2) {
      try {
        await cleanupStaleTransferSessions();
      } catch (error) {
        logError(error, { operation: 'auto_recovery_cleanup_sessions' });
      }
    }
  }

  // Cleanup stale transfer sessions
  async function cleanupStaleTransferSessions() {
    const now = Date.now();
    const maxAge = Doh.pod.cloud.file_sync.max_session_age;
    const cleanedSessions = [];

    for (const [transferId, session] of transferSessions) {
      const sessionAge = now - new Date(session.created).getTime();
      if (sessionAge > maxAge && ['pending', 'failed', 'cancelled'].includes(session.status)) {
        await cleanupTransferSession(transferId, false);
        cleanedSessions.push(transferId);
      }
    }

    if (cleanedSessions.length > 0) {
      console.log(`[ManagedSite] Auto-recovery cleaned ${cleanedSessions.length} stale transfer sessions`);
    }
  }

  // --- End Advanced Error Handling and Recovery Patterns ---

  // console.log('[ManagedSite] Agent module loaded with cloud anchoring functionality enabled');

  // --- Export Functions to Global Scope (After All Definitions) ---

  // Export functions to global scope for CLI and other modules
  Object.assign(managedSite, {
    storeSiteAuthToken,
    loadSiteAuthToken,
    clearSiteAuthToken,
    performCloudAnchoring,
    performCloudAnchoringAs,
    isInstanceAnchored,
    validateAndRefreshToken,
    establishCloudConnection,
    disconnectFromCloud,
    getCloudConnectionStatus,
    executeCloudCommand,

    // Cloud anchor management
    loadCloudAnchor,
    storeCloudAnchor,
    clearCloudAnchor,
    getCloudFingerprint,

    // Advanced file transfer capabilities
    getTransferSessions: () => Array.from(transferSessions.values()),
    getTransferSession: (transferId) => transferSessions.get(transferId),
    createTransferSession,
    cleanupTransferSession,
    calculateFileChecksum,
    calculateBufferChecksum,
    getOptimalChunkSize,

    // Error handling and recovery
    executeWithRecovery,
    classifyError,
    logError,
    getRecentErrors,
    analyzeErrorPatterns,

    // Health monitoring
    performAdvancedHealthCheck,
    checkCloudConnectionHealth,
    checkFileSystemHealth,

    // Circuit breaker access
    getCircuitBreakerStatus: (type) => circuitBreakers[type + 'Operations']?.getStatus(),
    getAllCircuitBreakers: () => Object.fromEntries(
      Object.entries(circuitBreakers).map(([key, breaker]) => [key, breaker.getStatus()])
    ),
    retryWithBackoff,
    classifyError,

    // Advanced error handling and recovery
    circuitBreakers: {
      network: circuitBreakers.networkOperations,
      transfer: circuitBreakers.fileOperations,
      auth: circuitBreakers.authOperations
    }
  });

  // Also make them available on Doh object for consistency
  Doh.CloudAnchoring = managedSite;

  // console.log('[ManagedSite] All functions exported to global scope successfully');

});

// --- CLI Command Registration ---
Doh.Package('cloud', {
  install: {
    'npm:fs-extra': ''
  },
  load: [
    'managed_site'
  ],
})

// Register the cloud anchoring CLI command
Doh.CLI('cloud', {
  'cloud': {
    'file': '^/cloud_anchor_cli.js',
    'help': 'Cloud management commands: doh cloud endpoint <url> - Set cloud endpoint, doh cloud anchor [url] - Anchor instance to cloud account'
  }
}); 