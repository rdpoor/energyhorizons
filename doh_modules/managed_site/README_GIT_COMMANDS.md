# Git Commands for Managed Site

This document describes the Git command integration added to the Doh managed site module, enabling secure remote access to Git repositories in managed projects.

## Overview

The Git command handlers extend the managed site's cloud commands with comprehensive Git operations. This allows remote management of Git repositories through the Doh Cloud connection while maintaining strict security controls.

## Security Features

- **Path Validation**: All repository paths are validated to ensure they're within the project directory
- **Command Whitelisting**: Only approved Git commands are allowed to execute
- **Audit Logging**: All Git operations are logged for security and debugging
- **Repository Validation**: Operations only work on valid Git repositories
- **Timeout Controls**: Network operations have appropriate timeouts
- **Error Classification**: Advanced error handling with recovery patterns

## Available Commands

### Repository Discovery and Management

#### `discover_git_repos`
Finds all Git repositories within the project directory.

**Payload:**
```json
{
  "basePath": "/", 
  "maxDepth": 5,
  "includeSubmodules": false
}
```

**Response:**
```json
{
  "success": true,
  "repositories": [
    {
      "path": "/path/to/repo",
      "relativePath": "path/to/repo",
      "name": "repo",
      "currentBranch": "main",
      "remoteUrl": "https://github.com/user/repo.git",
      "hasChanges": true,
      "changedFiles": 3
    }
  ],
  "count": 1
}
```

#### `get_git_status`
Gets detailed Git status for a specific repository.

**Payload:**
```json
{
  "repoPath": "/path/to/repo"
}
```

**Response:**
```json
{
  "success": true,
  "repoPath": "/path/to/repo",
  "isGitRepo": true,
  "branch": {
    "current": "main",
    "tracking": "origin/main",
    "ahead": 0,
    "behind": 0
  },
  "status": {
    "files": [
      {
        "path": "file.js",
        "index": "M",
        "working_dir": " "
      }
    ],
    "staged": ["file.js"],
    "total": 1,
    "staged_count": 1,
    "unstaged_count": 0
  },
  "remotes": [
    {
      "name": "origin",
      "url": "https://github.com/user/repo.git",
      "type": "fetch"
    }
  ],
  "recentCommits": [
    {
      "hash": "abc123",
      "message": "Initial commit",
      "author": "User",
      "date": "2023-01-01T12:00:00Z"
    }
  ]
}
```

### File Operations

#### `git_stage_files`
Stage files for commit.

**Payload:**
```json
{
  "repoPath": "/path/to/repo",
  "files": ["file1.js", "file2.js"]
}
```

#### `git_unstage_files`
Unstage files.

**Payload:**
```json
{
  "repoPath": "/path/to/repo", 
  "files": ["file1.js", "file2.js"]
}
```

#### `git_commit`
Commit staged changes.

**Payload:**
```json
{
  "repoPath": "/path/to/repo",
  "message": "Commit message",
  "author": "User Name <user@example.com>"
}
```

### Remote Operations

#### `git_pull`
Pull changes from remote repository.

**Payload:**
```json
{
  "repoPath": "/path/to/repo",
  "remote": "origin",
  "branch": "main"
}
```

#### `git_push`
Push changes to remote repository.

**Payload:**
```json
{
  "repoPath": "/path/to/repo",
  "remote": "origin", 
  "branch": "main",
  "force": false
}
```

### Branch Operations

#### `git_branch_list`
List all branches in the repository.

**Payload:**
```json
{
  "repoPath": "/path/to/repo",
  "includeRemote": true
}
```

### Information Commands

#### `git_diff`
Get file differences.

**Payload:**
```json
{
  "repoPath": "/path/to/repo",
  "filePath": "optional/specific/file.js",
  "staged": false,
  "commitHash": "optional-commit-hash"
}
```

#### `git_init`
Initialize a new Git repository.

**Payload:**
```json
{
  "repoPath": "/path/to/new/repo"
}
```

### Audit and Management

#### `get_git_audit_log`
Get Git operation audit log.

**Payload:**
```json
{
  "limit": 50,
  "repoPath": "/path/to/repo"
}
```

#### `clear_git_caches`
Clear Git repository and status caches.

**Payload:**
```json
{}
```

## Implementation Details

### File Structure
- `command_handlers_git.js` - Git command handlers module
- `command_handlers.js` - Main command handlers with Git integration
- `managed_site.js` - Main module that loads the command handlers

### Caching
- Repository discovery results are cached for 30 seconds
- Git status results are cached for 30 seconds  
- Caches can be manually cleared using `clear_git_caches`

### Error Handling
- Circuit breaker pattern for operation reliability
- Exponential backoff retry strategy
- Comprehensive error classification and user-friendly messages
- Audit logging of all operations for debugging

### Performance Considerations
- Chunked repository discovery to avoid timeouts
- Cached results to reduce Git command overhead
- Async operations with appropriate timeouts
- Staggered requests to avoid overwhelming the server

## Usage via Doh Cloud

These commands are available through the Doh Cloud connection when a site is anchored. They can be called remotely through the cloud interface or programmatically via the cloud API.

## Security Notes

- All operations are restricted to the project directory
- Only whitelisted Git commands are allowed
- Sensitive data (tokens, passwords) is filtered from audit logs
- Operations require valid Git repositories
- Network operations have timeouts to prevent hanging

## Future Enhancements

The UI component for these Git commands will be implemented separately, providing a web-based interface for managing Git repositories in managed Doh instances. 