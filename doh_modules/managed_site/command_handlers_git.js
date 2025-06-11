/**
 * Git Command Handlers for Managed Site
 * 
 * Provides secure remote access to Git repositories discovered in projects.
 * Extends managed site cloud commands with Git operations.
 * 
 * Security Features:
 * - Path validation and sandboxing
 * - Repository discovery with permission checks
 * - Secure Git command execution using simple-git
 * - Audit logging for all Git operations
 * 
 * Supported Commands:
 * - discover_git_repos: Find all Git repositories in project
 * - get_git_status: Get status for a specific repository
 * - git_stage_files: Stage files for commit
 * - git_unstage_files: Unstage files
 * - git_commit: Commit staged changes
 * - git_pull: Pull changes from remote
 * - git_push: Push changes to remote
 * - git_branch_list: List branches
 * - git_checkout: Checkout branch or commit
 * - git_diff: Get file differences
 * - git_log: Get commit history
 * - git_remote_list: List remote repositories
 */

Doh.Install('managed_site_command_handlers_git', [
  'npm:simple-git'
]);

Doh.Module('managed_site_command_handlers_git', [
  'nodejs?? import fsE from "fs-extra"',
  'nodejs?? import simpleGit from "simple-git"',
  'nodejs?? CryptoAPI'
], function(DohPath, fsE, simpleGit, CryptoAPI, gitHandlers) {
  const fs = fsE;
  const fsp = fs.promises;

  // Git repository cache for performance
  const gitRepoCache = new Map(); // path -> repo info
  const gitStatusCache = new Map(); // repoPath -> { status, lastUpdate }
  const CACHE_TTL = 30000; // 30 seconds

  // Git operation audit log
  const gitAuditLog = [];
  const MAX_AUDIT_ENTRIES = 1000;

  /**
   * Get simple-git instance for a repository path with validation
   */
  function getGitForDirectory(repoPath) {
    // Validate repository path
    const resolvedRepoPath = DohPath(repoPath);
    const projectRoot = DohPath('/');
    
    if (!resolvedRepoPath.startsWith(projectRoot)) {
      throw new Error(`Repository path outside project directory: ${repoPath}`);
    }

    // Ensure repository exists and is a Git repository
    const gitDir = DohPath.Join(resolvedRepoPath, '.git');
    if (!fs.existsSync(gitDir)) {
      throw new Error(`Not a Git repository: ${repoPath}`);
    }

    return simpleGit(resolvedRepoPath);
  }

  /**
   * Log Git operations for audit trail
   */
  function logGitOperation(repoPath, operation, success, error = null, details = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      repoPath,
      operation,
      success,
      error: error || null,
      details: details || {}
    };

    gitAuditLog.push(logEntry);
    
    // Keep log size manageable
    if (gitAuditLog.length > MAX_AUDIT_ENTRIES) {
      gitAuditLog.shift();
    }

    // Log to console for debugging (in development)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Git Audit] ${operation} in ${repoPath}: ${success ? 'SUCCESS' : 'FAILED'}${error ? ` - ${error}` : ''}`);
    }
  }

  /**
   * Execute Git operation safely with error handling and audit logging
   */
  async function executeGitOperation(repoPath, operation, gitFunction) {
    try {
      const git = getGitForDirectory(repoPath);
      const result = await gitFunction(git);
      logGitOperation(repoPath, operation, true, null, { result });
      return result;
    } catch (error) {
      logGitOperation(repoPath, operation, false, error.message);
      throw error;
    }
  }

  /**
   * Discover Git repositories in the project
   */
  async function handleDiscoverGitReposCommand(payload) {
    try {
      const { basePath = '/', maxDepth = 5, includeSubmodules = false } = payload;
      
      // Validate and resolve base path
      const resolvedBasePath = DohPath(basePath);
      const projectRoot = DohPath('/');
      
      if (!resolvedBasePath.startsWith(projectRoot)) {
        throw new Error(`Base path outside project directory: ${basePath}`);
      }

      // Check cache first
      const cacheKey = `repos_${resolvedBasePath}_${maxDepth}`;
      const cached = gitRepoCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return {
          success: true,
          repositories: cached.repositories,
          basePath: resolvedBasePath,
          cached: true
        };
      }

      const repositories = [];
      
      // First, check if the base path itself is a Git repository
      const baseGitDir = DohPath.Join(resolvedBasePath, '.git');
      if (fs.existsSync(baseGitDir)) {
        try {
          console.log(`[Git Discovery] Found Git repository at base path: ${resolvedBasePath}`);
          const baseRepoInfo = await getRepositoryInfo(resolvedBasePath);
          const baseRepoName = DohPath.Basename(resolvedBasePath) || 'project-root';
          
          repositories.push({
            path: resolvedBasePath,
            relativePath: DohPath.Relative(projectRoot, resolvedBasePath) || '.',
            name: baseRepoName,
            isProjectRoot: true, // Mark this as the project root repository
            ...baseRepoInfo
          });
          
          console.log(`[Git Discovery] Added base repository: ${baseRepoName} at ${resolvedBasePath}`);
        } catch (error) {
          console.warn(`[Git Discovery] Failed to get info for base repository ${resolvedBasePath}: ${error.message}`);
          // Add basic entry even if we can't get full info
          repositories.push({
            path: resolvedBasePath,
            relativePath: DohPath.Relative(projectRoot, resolvedBasePath) || '.',
            name: DohPath.Basename(resolvedBasePath) || 'project-root',
            isProjectRoot: true,
            error: error.message
          });
        }
      }
      
      async function scanForRepos(currentPath, depth = 0) {
        if (depth > maxDepth) return;

        try {
          const entries = await fsp.readdir(currentPath, { withFileTypes: true });
          
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            
            const entryPath = DohPath.Join(currentPath, entry.name);
            
            // Skip node_modules and other common directories
            if (entry.name.startsWith('.') && entry.name !== '.git') continue;
            if (['node_modules', 'vendor', 'dist', 'build', 'out'].includes(entry.name)) continue;
            
            // Check if this is a Git repository
            const gitDir = DohPath.Join(entryPath, '.git');
            if (fs.existsSync(gitDir)) {
              try {
                // Get basic repository information
                const repoInfo = await getRepositoryInfo(entryPath);
                repositories.push({
                  path: entryPath,
                  relativePath: DohPath.Relative(projectRoot, entryPath),
                  name: entry.name,
                  isSubdirectory: true, // Mark as subdirectory repository
                  ...repoInfo
                });
                
                console.log(`[Git Discovery] Found subdirectory repository: ${entry.name} at ${entryPath}`);
                
                // Don't scan inside Git repositories (unless looking for submodules)
                if (!includeSubmodules) continue;
              } catch (error) {
                console.warn(`[Git Discovery] Failed to get info for repository ${entryPath}: ${error.message}`);
                // Add basic entry even if we can't get full info
                repositories.push({
                  path: entryPath,
                  relativePath: DohPath.Relative(projectRoot, entryPath),
                  name: entry.name,
                  isSubdirectory: true,
                  error: error.message
                });
                continue;
              }
            }
            
            // Recursively scan subdirectories
            await scanForRepos(entryPath, depth + 1);
          }
        } catch (error) {
          console.warn(`[Git Discovery] Failed to scan directory ${currentPath}: ${error.message}`);
        }
      }

      // Only scan subdirectories if we're not already at maxDepth=0 or if we want to include submodules
      if (maxDepth > 0 || includeSubmodules) {
        await scanForRepos(resolvedBasePath);
      }

      // Cache the results
      gitRepoCache.set(cacheKey, {
        repositories,
        timestamp: Date.now()
      });

      // Format output for display
      const repoOutput = repositories.map(repo => {
        const status = repo.error ? '✗' : '✓';
        const changes = repo.hasChanges ? ` (${repo.changedFiles} changes)` : ' (clean)';
        return `${status} ${repo.relativePath} - ${repo.currentBranch || 'unknown'}${changes}`;
      }).join('\n');

      return {
        success: true,
        repositories,
        basePath: resolvedBasePath,
        scanned: true,
        count: repositories.length,
        message: `Found ${repositories.length} Git repositories`,
        output: repoOutput,
        stdout: repoOutput,
        stderr: ''
      };

    } catch (error) {
      console.error(`[Git Discovery Error] ${error.message}`);
      throw new Error(`Failed to discover Git repositories: ${error.message}`);
    }
  }

  /**
   * Get basic repository information using simple-git
   */
  async function getRepositoryInfo(repoPath) {
    try {
      const git = getGitForDirectory(repoPath);

      // Get current branch
      const branches = await git.branch();
      const currentBranch = branches.current || 'main';

      // Get remote URL (if any)
      let remoteUrl = null;
      try {
        const remotes = await git.getRemotes(true);
        if (remotes.length > 0) {
          remoteUrl = remotes[0].refs.fetch || remotes[0].refs.push;
        }
      } catch (error) {
        // Remote might not exist, which is fine
      }

      // Get basic status info
      const status = await git.status();
      const hasChanges = status.files.length > 0;
      const changedFiles = status.files.length;

      return {
        currentBranch,
        remoteUrl,
        hasChanges,
        changedFiles,
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      return {
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  }

  /**
   * Get detailed Git status for a repository
   */
  async function handleGetGitStatusCommand(payload) {
    try {
      const { repoPath } = payload;
      
      if (!repoPath) {
        throw new Error('Repository path is required');
      }

      // Check cache first
      const cached = gitStatusCache.get(repoPath);
      if (cached && (Date.now() - cached.lastUpdate) < CACHE_TTL) {
        return {
          success: true,
          ...cached.status,
          cached: true
        };
      }

      // Get comprehensive Git status using simple-git
      const status = await executeGitOperation(repoPath, 'get_status', async (git) => {
        return await getGitStatusDetailed(git, repoPath);
      });
      
      // Cache the result
      gitStatusCache.set(repoPath, {
        status,
        lastUpdate: Date.now()
      });

      return {
        success: true,
        ...status
      };

    } catch (error) {
      console.error(`[Git Status Error] ${error.message}`);
      throw new Error(`Failed to get Git status: ${error.message}`);
    }
  }

  /**
   * Get detailed Git status information using simple-git
   */
  async function getGitStatusDetailed(git, repoPath) {
    // Get current branch and tracking info
    const status = await git.status();
    const branches = await git.branch(['-vv']);
    
    const currentBranch = status.current || 'main';
    let tracking = null;
    let ahead = status.ahead || 0;
    let behind = status.behind || 0;

    // Get tracking branch info
    if (branches.current && branches.branches[branches.current]) {
      const branchInfo = branches.branches[branches.current];
      if (branchInfo.tracking) {
        tracking = branchInfo.tracking;
      }
    }

    // Parse file changes from simple-git status
    const files = status.files.map(file => ({
      path: file.path,
      index: file.index || ' ', // Staged status
      working_dir: file.working_dir || ' ' // Working directory status
    }));

    const staged = status.staged || [];

    // Get remote information
    let remotes = [];
    try {
      const gitRemotes = await git.getRemotes(true);
      remotes = gitRemotes.map(remote => ({
        name: remote.name,
        url: remote.refs.fetch || remote.refs.push,
        type: 'fetch' // simple-git doesn't distinguish fetch/push in the same way
      }));
    } catch (error) {
      // Remotes might not exist
    }

    // Get recent commits
    let recentCommits = [];
    try {
      const log = await git.log({ maxCount: 10 });
      recentCommits = log.all.map(commit => ({
        hash: commit.hash,
        message: commit.message,
        author: commit.author_name,
        date: commit.date
      }));
    } catch (error) {
      // Repository might not have any commits yet
    }

    return {
      repoPath,
      isGitRepo: true,
      branch: {
        current: currentBranch,
        tracking,
        ahead,
        behind
      },
      status: {
        files,
        staged,
        total: files.length,
        staged_count: staged.length,
        unstaged_count: files.length - staged.length
      },
      remotes,
      recentCommits,
      lastUpdate: new Date().toISOString()
    };
  }

  /**
   * Stage files for commit using simple-git
   */
  async function handleGitStageFilesCommand(payload) {
    try {
      const { repoPath, files } = payload;
      
      if (!repoPath) {
        throw new Error('Repository path is required');
      }
      
      if (!files || !Array.isArray(files) || files.length === 0) {
        throw new Error('Files array is required and must not be empty');
      }

      const result = await executeGitOperation(repoPath, 'stage_files', async (git) => {
        // Stage each file
        const results = [];
        for (const file of files) {
          try {
            await git.add(file);
            results.push({ file, success: true });
          } catch (error) {
            results.push({ file, success: false, error: error.message });
          }
        }
        return results;
      });

      // Clear status cache for this repository
      gitStatusCache.delete(repoPath);

      const successCount = result.filter(r => r.success).length;
      const failed = result.filter(r => !r.success);

      return {
        success: true,
        stagedFiles: result.filter(r => r.success).map(r => r.file),
        failed,
        message: `Staged ${successCount} of ${files.length} files`,
        stdout: `Staged ${successCount} of ${files.length} files`,
        stderr: failed.map(r => r.error).join('\n')
      };

    } catch (error) {
      console.error(`[Git Stage Error] ${error.message}`);
      throw new Error(`Failed to stage files: ${error.message}`);
    }
  }

  /**
   * Unstage files using simple-git
   */
  async function handleGitUnstageFilesCommand(payload) {
    try {
      const { repoPath, files } = payload;
      
      if (!repoPath) {
        throw new Error('Repository path is required');
      }
      
      if (!files || !Array.isArray(files) || files.length === 0) {
        throw new Error('Files array is required and must not be empty');
      }

      const result = await executeGitOperation(repoPath, 'unstage_files', async (git) => {
        // Unstage each file using git reset
        const results = [];
        for (const file of files) {
          try {
            await git.reset(['HEAD', file]);
            results.push({ file, success: true });
          } catch (error) {
            results.push({ file, success: false, error: error.message });
          }
        }
        return results;
      });

      // Clear status cache for this repository
      gitStatusCache.delete(repoPath);

      const successCount = result.filter(r => r.success).length;
      const failed = result.filter(r => !r.success);

      return {
        success: true,
        unstagedFiles: result.filter(r => r.success).map(r => r.file),
        failed,
        message: `Unstaged ${successCount} of ${files.length} files`,
        stdout: `Unstaged ${successCount} of ${files.length} files`,
        stderr: failed.map(r => r.error).join('\n')
      };

    } catch (error) {
      console.error(`[Git Unstage Error] ${error.message}`);
      throw new Error(`Failed to unstage files: ${error.message}`);
    }
  }

  /**
   * Commit staged changes using simple-git
   */
  async function handleGitCommitCommand(payload) {
    try {
      const { repoPath, message, author } = payload;
      
      if (!repoPath) {
        throw new Error('Repository path is required');
      }
      
      if (!message || message.trim().length === 0) {
        throw new Error('Commit message is required');
      }

      const result = await executeGitOperation(repoPath, 'commit', async (git) => {
        const commitOptions = {};
        
        // Add author if specified
        if (author) {
          commitOptions['--author'] = author;
        }

        return await git.commit(message.trim(), [], commitOptions);
      });

      // Clear status cache for this repository
      gitStatusCache.delete(repoPath);

      // Extract commit hash from simple-git result
      const commitHash = result.commit || null;

      return {
        success: true,
        commitHash,
        message: `Committed changes: ${message.trim()}`,
        output: `[${commitHash?.substring(0, 7) || 'unknown'}] ${message.trim()}`,
        stdout: `[${commitHash?.substring(0, 7) || 'unknown'}] ${message.trim()}`,
        stderr: ''
      };

    } catch (error) {
      console.error(`[Git Commit Error] ${error.message}`);
      throw new Error(`Failed to commit: ${error.message}`);
    }
  }

  /**
   * Pull changes from remote using simple-git
   */
  async function handleGitPullCommand(payload) {
    try {
      const { repoPath, remote = 'origin', branch } = payload;
      
      if (!repoPath) {
        throw new Error('Repository path is required');
      }

      const result = await executeGitOperation(repoPath, 'pull', async (git) => {
        if (branch) {
          return await git.pull(remote, branch);
        } else {
          return await git.pull(remote);
        }
      });

      // Clear status cache for this repository
      gitStatusCache.delete(repoPath);

      // Format result for display
      const summary = result.summary || {};
      const output = `Pull completed: ${summary.changes || 0} changes, ${summary.insertions || 0} insertions(+), ${summary.deletions || 0} deletions(-)`;

      return {
        success: true,
        message: 'Pull completed successfully',
        output,
        stdout: output,
        stderr: ''
      };

    } catch (error) {
      console.error(`[Git Pull Error] ${error.message}`);
      throw new Error(`Failed to pull: ${error.message}`);
    }
  }

  /**
   * Push changes to remote using simple-git
   */
  async function handleGitPushCommand(payload) {
    try {
      const { repoPath, remote = 'origin', branch, force = false } = payload;
      
      if (!repoPath) {
        throw new Error('Repository path is required');
      }

      const result = await executeGitOperation(repoPath, 'push', async (git) => {
        const pushOptions = {};
        if (force) {
          pushOptions['--force'] = null;
        }

        if (branch) {
          return await git.push(remote, branch, pushOptions);
        } else {
          return await git.push(remote, pushOptions);
        }
      });

      // Format result for display
      const output = 'Push completed successfully';

      return {
        success: true,
        message: 'Push completed successfully',
        output,
        stdout: output,
        stderr: ''
      };

    } catch (error) {
      console.error(`[Git Push Error] ${error.message}`);
      throw new Error(`Failed to push: ${error.message}`);
    }
  }

  /**
   * List branches using simple-git
   */
  async function handleGitBranchListCommand(payload) {
    try {
      const { repoPath, includeRemote = true } = payload;
      
      if (!repoPath) {
        throw new Error('Repository path is required');
      }

      const result = await executeGitOperation(repoPath, 'list_branches', async (git) => {
        const branchOptions = includeRemote ? ['-a'] : [];
        return await git.branch(branchOptions);
      });

      // Convert simple-git branch result to expected format
      const branches = [];
      
      // Add local branches
      Object.entries(result.branches).forEach(([name, info]) => {
        if (name !== result.current) {
          branches.push({
            name,
            current: false,
            remote: name.startsWith('remotes/')
          });
        }
      });

      // Add current branch first
      if (result.current) {
        branches.unshift({
          name: result.current,
          current: true,
          remote: false
        });
      }

      const output = branches.map(b => {
        const indicator = b.current ? '*' : ' ';
        return `${indicator} ${b.name}`;
      }).join('\n');

      return {
        success: true,
        branches,
        message: `Listed ${branches.length} branches`,
        output,
        stdout: output,
        stderr: ''
      };

    } catch (error) {
      console.error(`[Git Branch Error] ${error.message}`);
      throw new Error(`Failed to list branches: ${error.message}`);
    }
  }

  /**
   * Get file diff using simple-git
   */
  async function handleGitDiffCommand(payload) {
    try {
      const { repoPath, filePath, staged = false, commitHash } = payload;
      
      if (!repoPath) {
        throw new Error('Repository path is required');
      }

      const result = await executeGitOperation(repoPath, 'diff', async (git) => {
        const diffOptions = [];
        
        if (staged) {
          diffOptions.push('--staged');
        }
        
        if (commitHash) {
          diffOptions.push(commitHash);
        }
        
        if (filePath) {
          return await git.diff([...diffOptions, '--', filePath]);
        } else {
          return await git.diff(diffOptions);
        }
      });

      return {
        success: true,
        diff: result,
        filePath: filePath || null,
        staged,
        stdout: result,
        stderr: ''
      };

    } catch (error) {
      console.error(`[Git Diff Error] ${error.message}`);
      throw new Error(`Failed to get diff: ${error.message}`);
    }
  }

  /**
   * Initialize a new Git repository using simple-git
   */
  async function handleGitInitCommand(payload) {
    try {
      const { repoPath } = payload;
      
      if (!repoPath) {
        throw new Error('Repository path is required');
      }

      // Validate path is within project
      const resolvedPath = DohPath(repoPath);
      const projectRoot = DohPath('/');
      
      if (!resolvedPath.startsWith(projectRoot)) {
        throw new Error(`Repository path outside project directory: ${repoPath}`);
      }

      // Ensure directory exists
      await fs.ensureDir(resolvedPath);

      const result = await executeGitOperation(resolvedPath, 'init', async (git) => {
        return await git.init();
      });

      // Clear repository cache
      gitRepoCache.clear();

      return {
        success: true,
        message: 'Git repository initialized successfully',
        repoPath: resolvedPath,
        output: 'Initialized empty Git repository',
        stdout: 'Initialized empty Git repository',
        stderr: ''
      };

    } catch (error) {
      console.error(`[Git Init Error] ${error.message}`);
      throw new Error(`Failed to initialize repository: ${error.message}`);
    }
  }

  /**
   * Get Git audit log
   */
  async function handleGetGitAuditLogCommand(payload) {
    try {
      const { limit = 50, repoPath } = payload;
      
      let filteredLog = gitAuditLog;
      
      // Filter by repository if specified
      if (repoPath) {
        filteredLog = gitAuditLog.filter(entry => entry.repoPath === repoPath);
      }

      // Get recent entries
      const recentLog = filteredLog
        .slice(-limit)
        .reverse(); // Most recent first

      // Format audit log for display
      const auditOutput = recentLog.map(entry => {
        const status = entry.success ? '✓' : '✗';
        const timestamp = new Date(entry.timestamp).toLocaleString();
        return `${status} [${timestamp}] ${entry.operation} in ${entry.repoPath}${entry.error ? ` - ${entry.error}` : ''}`;
      }).join('\n');

      return {
        success: true,
        auditLog: recentLog,
        totalEntries: filteredLog.length,
        message: `Retrieved ${recentLog.length} audit log entries`,
        output: auditOutput,
        stdout: auditOutput,
        stderr: ''
      };

    } catch (error) {
      console.error(`[Git Audit Error] ${error.message}`);
      throw new Error(`Failed to get audit log: ${error.message}`);
    }
  }

  /**
   * Clear Git caches
   */
  async function handleClearGitCachesCommand(payload) {
    try {
      gitRepoCache.clear();
      gitStatusCache.clear();

      return {
        success: true,
        message: 'Git caches cleared successfully',
        stdout: 'Git caches cleared successfully',
        stderr: ''
      };

    } catch (error) {
      console.error(`[Git Cache Error] ${error.message}`);
      throw new Error(`Failed to clear caches: ${error.message}`);
    }
  }

  // Raw Git Status Command (for display purposes)
  async function handleGitStatusRawCommand(payload) {
    try {
      const { repoPath } = payload;
      
      if (!repoPath) {
        throw new Error('Repository path is required');
      }

      const result = await executeGitOperation(repoPath, 'status_raw', async (git) => {
        const status = await git.status();
        // Format similar to raw git status output
        const lines = [];
        
        lines.push(`On branch ${status.current || 'main'}`);
        
        if (status.ahead || status.behind) {
          if (status.ahead && status.behind) {
            lines.push(`Your branch and 'origin/${status.current}' have diverged,`);
            lines.push(`and have ${status.ahead} and ${status.behind} different commits each, respectively.`);
          } else if (status.ahead) {
            lines.push(`Your branch is ahead of 'origin/${status.current}' by ${status.ahead} commit${status.ahead > 1 ? 's' : ''}.`);
          } else if (status.behind) {
            lines.push(`Your branch is behind 'origin/${status.current}' by ${status.behind} commit${status.behind > 1 ? 's' : ''}.`);
          }
        } else if (status.tracking) {
          lines.push(`Your branch is up to date with '${status.tracking}'.`);
        }
        
        if (status.staged.length > 0) {
          lines.push('');
          lines.push('Changes to be committed:');
          status.staged.forEach(file => {
            lines.push(`\t${file}`);
          });
        }
        
        if (status.modified.length > 0) {
          lines.push('');
          lines.push('Changes not staged for commit:');
          status.modified.forEach(file => {
            lines.push(`\tmodified:   ${file}`);
          });
        }
        
        if (status.not_added.length > 0) {
          lines.push('');
          lines.push('Untracked files:');
          status.not_added.forEach(file => {
            lines.push(`\t${file}`);
          });
        }
        
        if (status.files.length === 0) {
          lines.push('');
          lines.push('nothing to commit, working tree clean');
        }
        
        return lines.join('\n');
      });
      
      return {
        success: true,
        message: 'Status retrieved successfully',
        output: result,
        stdout: result,
        stderr: ''
      };

    } catch (error) {
      console.error(`[Git Status Raw Error] ${error.message}`);
      throw new Error(`Failed to get raw Git status: ${error.message}`);
    }
  }

  // Export the Git command handlers
  return Object.assign(gitHandlers, {
    // Git repository discovery and management
    handleDiscoverGitReposCommand,
    handleGetGitStatusCommand,
    handleGitStatusRawCommand,
    handleClearGitCachesCommand,
    
    // Git file operations
    handleGitStageFilesCommand,
    handleGitUnstageFilesCommand,
    handleGitCommitCommand,
    
    // Git branch and remote operations
    handleGitPullCommand,
    handleGitPushCommand,
    handleGitBranchListCommand,
    
    // Git information and diff
    handleGitDiffCommand,
    handleGitInitCommand,
    
    // Audit and monitoring
    handleGetGitAuditLogCommand,
    
    // Utility functions
    getGitForDirectory,
    executeGitOperation,
    getRepositoryInfo,
    getGitStatusDetailed,
    
    // Cache management
    gitRepoCache,
    gitStatusCache
  });
}); 