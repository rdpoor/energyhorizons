# Managed Site Module

The Managed Site module transforms a Doh instance into a remotely manageable agent for cloud-based administration. It provides secure cloud anchoring, persistent WebSocket connections, and remote command execution capabilities.

## Overview

This module enables Doh instances to connect securely to cloud management systems (like deploydoh.com) for remote administration. It implements a token-based authentication system with persistent connections for real-time command execution and monitoring.

## Core Features

- **Cloud Anchoring**: One-time credential exchange for persistent cloud connectivity
- **Token-Based Security**: Secure authentication tokens with restricted file storage
- **Persistent Connections**: WebSocket-based real-time communication with cloud managers
- **Remote Command Execution**: Comprehensive command system for remote instance management
- **Health Monitoring**: Real-time status reporting and heartbeat system
- **Admin Interface**: Web UI for cloud connection management
- **CLI Integration**: Command-line tools for cloud anchoring
- **Advanced File Transfer**: Chunked transfer system with integrity verification

## Installation & Configuration

### Auto-Loading

The module is automatically loaded via the pod configuration:

```yaml
host_load:
  - managed_site
```

### Configuration Options

```yaml
cloud:
  endpoint: 'https://deploydoh.com'          # Cloud manager endpoint
  token_storage_path: '/.doh/cloud_auth_token'  # Auth token location
  cloud_anchor_path: '/.doh/cloud-anchor.json'  # Persistent fingerprint storage
  connection_timeout: 30000                  # Connection timeout (30s)
  reconnect_interval: 5000                   # Reconnection interval (5s)
  heartbeat_interval: 60000                  # Heartbeat frequency (1m)
  
  file_sync:                                 # Advanced file transfer settings
    max_chunk_size: 1048576                  # 1MB chunks
    min_chunk_size: 65536                    # 64KB minimum
    max_concurrent_transfers: 3              # Concurrent transfers
    transfer_timeout: 3600000                # 1 hour timeout
    integrity_check: true                    # Enable checksums
    resume_support: true                     # Resumable transfers
    rate_limit: 10485760                     # 10MB/s rate limit
    retry_attempts: 3                        # Retry attempts
    retry_delay: 5000                        # Initial retry delay
    temp_dir: '/.doh/temp/transfers'         # Staging directory
    progress_interval: 1000                  # Progress updates (1s)
    cleanup_interval: 3600000                # Cleanup interval (1h)
    max_session_age: 86400000                # Max session age (24h)
```

## Cloud Anchoring

### Security Model

- **One-Time Credentials**: User credentials are used only once during anchoring
- **Token-Based Auth**: Long-lived authentication tokens stored securely
- **Memory Clearing**: Credentials immediately cleared from memory after use
- **File Permissions**: Tokens stored with 0600 permissions
- **JWT Support**: Supports JWT token validation and expiration checking

### Anchoring Methods

#### Web Interface
1. Navigate to `http://your-instance/admin/cloud-connect`
2. Enter your cloud manager credentials  
3. Click "Anchor Instance"

#### CLI Interface
```bash
# Anchor to your own account
doh cloud anchor

# Anchor to another user's account (requires manage:cloud_anchoring permission)
doh cloud anchor-as user@example.com
```

#### Programmatic Access
```javascript
// Check anchoring status
const isAnchored = await Doh.CloudAnchoring.isInstanceAnchored();

// Perform anchoring (to your own account)
const result = await Doh.CloudAnchoring.performCloudAnchoring(username, password);

// Perform anchoring on behalf of another user (requires manage:cloud_anchoring permission)
const result = await Doh.CloudAnchoring.performCloudAnchoringAs(
  requestingUsername, 
  requestingPassword, 
  targetUserEmail
);

// Clear anchoring
await Doh.CloudAnchoring.clearSiteAuthToken();
```

## API Reference

### Status Endpoint

**GET** `/api/managed_site/status`

Returns comprehensive instance status including cloud connection information.

**Response:**
```json
{
  "success": true,
  "status": "online",
  "fingerprint": "abc123",
  "pid": 12345,
  "memoryFormatted": "50.2 MB",
  "cpuFormatted": "15.3%",
  "memoryRaw": 52428800,
  "cpuRaw": { "user": 123456, "system": 78910 },
  "cloud": {
    "connected": true,
    "endpoint": "https://deploydoh.com",
    "lastHeartbeat": "2025-01-01T00:01:00.000Z",
    "lastCommunication": "2025-01-01T00:01:00.000Z",
    "reconnectAttempts": 0,
    "lastError": null,
    "friendlyError": null
  }
}
```

### Cloud Anchoring Endpoints

**POST** `/admin/cloud-connect`

Anchor instance to cloud manager.

**Request:**
```json
{
  "username": "user@example.com",
  "password": "your-password"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Instance successfully anchored to Doh Cloud account",
  "anchored": true
}
```

**POST** `/admin/cloud-connect/clear`

Clear cloud anchoring.

**Response:**
```json
{
  "success": true,
  "message": "Cloud anchoring and persistent fingerprint cleared successfully"
}
```

**GET** `/admin/cloud-connect`

Returns HTML interface for cloud anchoring management.

## Remote Command System

The module supports a comprehensive set of remote commands executed via WebSocket connections:

### Core Commands

| Command | Description | Security Level |
|---------|-------------|----------------|
| `ping` | Connectivity test | Low |
| `get_status` | System status | Low |
| `update_file` | File modification | High |
| `sync_files` | Bulk file updates | High |
| `sync_folder` | Folder synchronization | High |
| `restart_service` | Service restart | High |
| `get_logs` | Log retrieval | Medium |

### Advanced Transfer Commands

| Command | Description | Features |
|---------|-------------|----------|
| `start_chunked_transfer` | Initialize transfer session | Progress tracking, checksums |
| `upload_chunk` | Upload file chunk | Resume support, integrity check |
| `download_chunk` | Download file chunk | Rate limiting, concurrent transfers |
| `finalize_transfer` | Complete transfer | Verification, cleanup |
| `get_transfer_status` | Transfer progress | Real-time status updates |
| `cancel_transfer` | Cancel transfer | Safe cleanup |
| `resume_transfer` | Resume transfer | From last checkpoint |

### Command Execution Flow

1. **Reception**: Commands received via authenticated WebSocket
2. **Validation**: Type and payload validation
3. **Security**: Path validation and permission checks
4. **Execution**: Command execution with error handling
5. **Response**: Result transmission with success/failure status
6. **Audit**: Operation logging for security

## Connection Management

### Connection States

- **disconnected**: No cloud connection
- **connecting**: Attempting connection
- **connected**: Socket connected
- **authenticating**: Token authentication in progress
- **authenticated**: Ready for commands
- **reconnecting**: Attempting reconnection
- **error**: Connection error state

### Automatic Reconnection

The module implements exponential backoff for connection recovery:

```javascript
const delay = Math.min(
  baseInterval * Math.pow(2, attemptNumber),
  maxDelay // 5 minutes maximum
);
```

### Health Monitoring

- **Heartbeat**: Regular status updates every minute
- **Health Checks**: System monitoring every 2 minutes
- **Auto-Recovery**: Automatic reconnection attempts
- **Error Tracking**: Recent error analysis and patterns

## Error Handling

### Error Classification

- **NETWORK**: Connection and DNS issues
- **AUTH**: Authentication and token errors
- **FILESYSTEM**: File operation errors
- **CORRUPTION**: Data integrity issues
- **TIMEOUT**: Operation timeouts
- **PERMISSION**: Access denied errors
- **RESOURCE**: System resource issues

### Circuit Breaker System

The module implements circuit breakers for different operation types:

- **Network Operations**: 5 failure threshold, 1 minute recovery
- **File Operations**: 3 failure threshold, 30 second recovery  
- **Auth Operations**: 3 failure threshold, 2 minute recovery

### User-Friendly Messages

Common errors are translated to actionable messages:

- **ENOTFOUND**: "Unable to connect to Doh Cloud. Please check your internet connection."
- **Authentication failed**: "Your Doh Cloud credentials are invalid. Please re-anchor your instance."
- **Token expired**: "Your authentication token has expired. Please re-anchor your instance."

## CLI Commands

### Available Commands

```bash
# Set cloud endpoint URL
doh cloud endpoint <url>

# Anchor instance to your cloud account
doh cloud anchor

# Anchor instance on behalf of another user (requires manage:cloud_anchoring permission)
doh cloud anchor-as <user@example.com>

# View available cloud commands  
doh cloud
```

### CLI Features

- Interactive credential prompts using @clack/prompts
- Beautiful UI with spinners and progress indicators
- Support for re-anchoring with different credentials
- Support for anchor-as functionality with permission validation
- Comprehensive error handling and guidance
- Automatic token validation and clearing

## Global Functions

The module exports functions to `global.managedSite` and `Doh.CloudAnchoring`:

### Core Functions
- `storeSiteAuthToken(token)` - Store authentication token securely
- `loadSiteAuthToken()` - Load stored authentication token
- `clearSiteAuthToken()` - Clear stored authentication token
- `performCloudAnchoring(username, password)` - Perform cloud anchoring to your account
- `performCloudAnchoringAs(requestingUsername, requestingPassword, targetUserEmail)` - Anchor instance on behalf of another user
- `isInstanceAnchored()` - Check if instance is anchored
- `validateAndRefreshToken()` - Validate and refresh token
- `establishCloudConnection()` - Establish cloud connection
- `disconnectFromCloud()` - Disconnect from cloud
- `getCloudConnectionStatus()` - Get detailed connection status

### Advanced Functions
- `getTransferSessions()` - Get active transfer sessions
- `createTransferSession(id, operation, files)` - Create transfer session
- `calculateFileChecksum(path, algorithm)` - Calculate file checksum
- `executeWithRecovery(operation, options)` - Execute with retry logic
- `performAdvancedHealthCheck()` - Comprehensive health monitoring

## Troubleshooting

### Common Issues

#### Instance Not Connecting
1. Check anchoring status at `/admin/cloud-connect`
2. Verify cloud endpoint in pod configuration
3. Test network connectivity to cloud endpoint
4. Check token validity and expiration

#### Authentication Failures  
1. Verify credentials are correct
2. Check if account requires email verification
3. Wait if account is temporarily locked
4. Re-anchor with valid credentials

#### Commands Not Executing
1. Verify WebSocket connection is established
2. Check command format and payload
3. Ensure proper file permissions
4. Review instance logs for specific errors

### Debug Commands

```bash
# Check instance status
curl http://localhost:3000/api/managed_site/status

# View instance logs
tail -f .doh/logs/doh.log | grep ManagedSite

# Test cloud connectivity (normal anchoring)
curl -X POST https://deploydoh.com/api/cloud/request-anchor-token \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test","instance_info":{}}'

# Test anchor-as functionality (requires permissions)
curl -X POST https://deploydoh.com/api/cloud/request-anchor-token-as \
  -H "Content-Type: application/json" \
  -d '{
    "requestingUsername":"admin",
    "requestingPassword":"password",
    "targetUserEmail":"target@example.com",
    "instance_info":{}
  }'
```

## Development

### Module Dependencies

```javascript
Doh.Module('managed_site', [
  'express_router_as_library',     // API routes
  'nodejs?? import fsE from "fs-extra"',  // File operations
  'nodejs?? CryptoAPI',            // Cryptographic functions
  'socketio_client',               // WebSocket client
  'managed_site_command_handlers'  // Command execution
], function (DohPath, Router, fsE, CryptoAPI, ioClient, managedSite) {
  // Module implementation
});
```

### Adding Custom Commands

Extend the command system in the command handlers:

```javascript
// In command_handlers.js
case 'custom_command':
  result = await handleCustomCommand(payload);
  break;

async function handleCustomCommand(payload) {
  // Validate payload
  // Execute command
  // Return result
}
```

### Health Monitoring Integration

Access health monitoring from other modules:

```javascript
// Get comprehensive health status
const health = await global.managedSite.performAdvancedHealthCheck();

// Check specific subsystems
const cloudHealth = await global.managedSite.checkCloudConnectionHealth();
const fsHealth = await global.managedSite.checkFileSystemHealth();
```

## File Structure

```
doh_modules/managed_site/
├── managed_site.js              # Main module implementation
├── command_handlers.js          # Remote command execution
├── cloud_anchor_cli.js          # CLI command implementation  
├── README.md                    # This documentation
└── upguides/
    ├── cloud-anchoring.upguide  # Implementation plan
    └── real-auth-system.upguide # Authentication details
```

## Security Considerations

### Credential Handling
- User credentials are immediately cleared from memory after use
- No persistent storage of user passwords
- Authentication tokens stored with restricted file permissions

### Network Security
- All communications over HTTPS/WSS
- Token-based authentication for persistent connections
- No sensitive information in error messages

### File Operations
- Path validation against project directory boundaries
- Automatic backup creation before modifications
- Comprehensive audit logging of all operations

### Error Security
- Error messages don't reveal system internals
- Circuit breakers prevent resource exhaustion
- Rate limiting on authentication attempts

## Related Documentation

- [Cloud Manager Module](../cloud_manager/README.md)
- [Authentication System Guide](../cloud_manager/upguides/real-auth-system.upguide)
- [Cloud Anchoring Implementation](./upguides/cloud-anchoring.upguide)

---

**Status**: ✅ **Production Ready** - Complete implementation with enterprise-grade security and comprehensive remote management capabilities.