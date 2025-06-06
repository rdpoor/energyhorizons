# Dohballs: Folder-Based Code Sharing

![DohBalls]({{Package:deploydoh_home}}/images/dohballs.png?size=small)

A Dohball is *a content-addressed snapshot of one or more Doh packages that share the same folder root*, expressed as a self-extracting tarball whose only internal metadata is `dohball.json { version, removals[] }`. Everything else a Dohball "knows" about itself lives in the *Auto-Packager manifests* outside the archive.

This guide covers:
*   The role of Dohballs in **sharing reusable code** between projects.
*   How Dohballs complement Git for specific sharing scenarios.
*   Creating (**baking**) and managing Dohballs with the [Doh CLI](/docs/tools/cli).
*   Configuring Dohball settings in `pod.yaml`.
*   Understanding the Dohball sharing and update lifecycle.

## Why Use Dohballs for Sharing?

Dohballs address common pain points found in traditional module management when it comes to sharing code across project boundaries, especially within a cohesive ecosystem like Doh.

| Hidden pain in normal module managers                                                                   | How a Dohball solves it                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Path lock-in** – moving a package often breaks imports, relative assets, and manifest paths.          | Package names, not paths, are the installation contract. Relocating a folder just rebakes its Dohball; *no code change required in consuming projects.*                              |
| **Manifests in every package** – each module might own a private `package.json`, `tsconfig.json`, etc.    | A *single* project-level Auto-Packager manages manifests for every package. The Dohball itself is manifest-light, containing only essential versioning and cleanup info. The package itself stays oblivious. |
| **"One folder per module" dogma** – often prevents sharing a common asset folder or colocating micro-modules. | Multiple packages can live in the same folder and therefore share the same Dohball and version stream. If you later split them, they can inherit their last shared version and diverge naturally. |
| **Ship-vs-share confusion** – developers might mix up "bundle for prod" with "make this installable elsewhere."   | Dohballs are explicitly for *sharing* code between Doh installs. Application deployment to production environments has its own dedicated pipelines (Git, Doh Cloud, etc.).                 |

**Dohballs and Git:**

Git is your primary tool for source code versioning, branching, and collaboration within a single project repository. Dohballs complement Git by providing a mechanism to package a *specific state* of a folder (containing one or more packages) from one project repository into a portable, versioned unit that other Doh projects can easily consume as a dependency.

*   **Git:** Tracks history, enables collaboration on source code.
*   **Dohballs:** Package specific versions of code (from a Git repo) for easy sharing and consumption by *other* Doh projects.

## Key Concepts of Dohballs for Code Sharing

### 1. Folder-Based Architecture for Sharing
A Dohball represents an entire folder structure, making it a "Folder Repository" snapshot. It contains:
- One or more related Doh packages and modules
- All their assets and resources
- Relevant configuration files
- Sub-directories and their contents

This structure ensures that all related components are versioned and shared together, maintaining their internal relationships and dependencies when installed in another project.

### 2. Package-Centric Interface
Although Dohballs operate at the folder level for packaging, they are always accessed by consuming projects through the [Doh packages](/docs/core/packages) they contain:

```javascript
// You never reference a Dohball directly by its filename in consuming code.
// Instead, you request a package, and the Doh system handles finding and installing
// the Dohball that provides that package version.
Doh.load('MySharedUIComponents'); // 'MySharedUIComponents' is a package
```
This abstraction keeps the developer experience focused on logical code organization, while the system handles the physical distribution and installation of the underlying Dohball.

### 3. Content-Based Versioning and Minimal Metadata
Dohballs use a robust versioning system based on the **hash of the folder's contents**.
*   Identical folder content always results in the same Dohball version.
*   Any change to any file within the folder automatically triggers a new version upon baking.
The Dohball archive (`.tar.gz`) itself contains minimal metadata: a `dohball.json` file with:
    *   `version`: The content-hash version string.
    *   `removals[]`: An array of file paths that were removed since the previous version of this Dohball (used for cleanup on the installing side).
Crucially, detailed manifests like `package_manifest.json` or `dohball_manifest.json` (which maps packages to Dohballs) live *outside* the Dohball, typically in the `/doh_js/manifests/` directory of the *consuming project*, and are managed by the [Auto-Packager](/docs/core/auto_packager).

### 4. Sharing Lifecycle: Bake, Host, Install
```
 ┌───────────────────────────────┐
 │ Your project sources (a folder) │  <-- Developer works here
 │   ├─ pkgA  (Doh.Package)      │
 │   ├─ pkgB  (Doh.Module)       │
 │   └─ assets/                  │
 └──────────────┬────────────────┘
                │  Auto-Packager scans this folder
                ▼
    ┌───────────────────────────────┐
    │ Bake Dohball (content hash V) │  doh bake
    │   • makes  /dohballs/...tar.gz│  (or uploads to dohball_host)
    │   • archive has dohball.json  │
    │     { version, removals[] }   │
    └──────────────┬────────────────┘
                   │ Host / Sync (local or remote)
                   ▼
    ┌───────────────────────────────┐
    │ Other Doh projects            │  Doh.load('pkgA')
    │  (consuming projects)         │  doh install pkgA
    └───────────────────────────────┘
```

1.  **Baking**: Creating a compressed archive (`.tar.gz`) of a folder. The [Auto-Packager](/docs/core/auto_packager), knowing the project's file structure and `dohball_deployment` settings, handles this.
2.  **Hosting**: Storing the baked Dohball. This can be a local `/dohballs/` directory (for local sharing/testing) or a remote server specified in the *consuming project's* `pod.yaml` (`dohball_host`).
3.  **Installation**: When a consuming project requests a package (e.g., via `Doh.load('pkgA')`), the Doh system checks its `dohball_manifest.json` (managed by its own Auto-Packager). If the package is from a Dohball not yet installed, it's downloaded from a configured `dohball_host` and extracted.
4.  **Verification & Cleanup**: Ensures integrity and removes obsolete files (listed in `dohball.json` -> `removals`) from previous versions during updates.

## Operational Flow for Sharing Code via Dohballs

For most application development, your primary deployment method to production environments will involve Git-based workflows, CI/CD pipelines, or dedicated services like Doh Cloud.

**Dohballs come into play when you need to expose your project, or specific folders within it, as a reusable code library for other Doh.js projects to consume.** This is where their manifest-light, easily installable nature shines for managing inter-project dependencies.

The typical workflow for a developer sharing code using Dohballs is:

1.  **Develop Freely:** Create or modify your packages, modules, and assets within their shared folder. You can co-locate micro-packages that belong together. You generally don't need to manually manage manifests for the purpose of Dohball creation.
2.  **`doh bake` (Prepare for Sharing):**
    *   Run `doh bake` in the project containing the code you want to share.
    *   The Auto-Packager identifies folders eligible for Dohball creation based on your `pod.yaml` (`dohball_deployment` settings).
    *   It groups packages by their common ancestor folder.
    *   For each such folder, it computes a content hash. If the hash is new (meaning content changed) or if using `doh rebake`, it creates/updates the Dohball `.tar.gz` archive in the local `/dohballs/` directory or uploads it if a *baking-specific* host is configured (less common for this command).
    *   The archive includes the `dohball.json` with the new version and any file removals since the previous version of *that specific Dohball lineage*.
3.  **Host the Dohball:**
    *   Make the baked `.tar.gz` file accessible to other projects. This could be:
        *   Committing it to a shared location if your team uses one for local Dohballs.
        *   Manually copying it to a known local path accessible by consuming projects.
        *   Uploading it to a URL specified in the `dohball_host` entries of the *consuming projects'* `pod.yaml` files.
4.  **Install/Consume in Another Doh Project:**
    *   In a different Doh.js project that needs to use the shared code:
        *   Simply call `Doh.load('packageName')` for a package contained in the Dohball.
        *   Or, explicitly run `doh install packageName`.
    *   The consuming project's Doh runtime (guided by its own Auto-Packager and manifests, and `dohball_host` settings) will:
        *   Determine which Dohball provides the requested package and version.
        *   Download it if not present locally.
        *   Extract it to the correct relative path (maintaining the shared folder structure).
        *   Update its own manifests to incorporate the newly available packages.
5.  **Update & Clean-Up in Consuming Projects:**
    *   When a consuming project runs `doh upgrade` or `doh update` (which can trigger upgrades), it checks configured `dohball_host`s for newer versions of installed Dohballs.
    *   If a newer version is found and installed, the `removals` list from its `dohball.json` is processed to delete stale files and empty directories left by the previous version, ensuring a clean installation.

## Working with Dohballs: CLI and Configuration

### Dohball Creation (`doh bake`)
Leverages the [Auto-Packager](/docs/core/auto_packager).
*   **`doh bake` / `doh rebake` (no arguments):** Checks *all* packages eligible for exposure (per `pod.yaml`'s `dohball_deployment`) and bakes/rebakes those whose content has changed (or all for `rebake`).
*   **`doh bake [pkg1]...` / `doh rebake [pkg1]...`:** Checks *only the specified packages* (if they are eligible) and bakes/rebakes.

```bash
# Bake all eligible packages from this project (if their content changed)
doh bake

# Force rebake of specific eligible packages from this project
doh rebake core_ui data_module
```
The output `.tar.gz` files are typically placed in your project's local `/.doh/dohballs/` directory, from where they can be hosted.

### Configuration (`pod.yaml`)

**In the Project *Creating/Baking* Dohballs:**
```yaml
# pod.yaml of the project WHOSE CODE IS BEING SHARED

# Specify which packages from THIS project to make available via Dohballs
dohball_deployment:
  expose_packages: '*'        # Expose all packages in this project as Dohballs
  # or expose_packages: ['sharedLib1', 'sharedUtility']
  ignore_packages:            # Optionally, except these
    - private_package
  ignore_paths:               # And anything in these paths (won't be in any Dohball)
    - .git
    - node_modules
    - secret_folder
    - test_data
```

**In the Project *Consuming* Dohballs:**
```yaml
# pod.yaml of the project USING THE SHARED DOHBALLS

# Define Dohball hosts (in resolution order) for fetching remote Dohballs
# These are the URLs where the .tar.gz files are hosted.
dohball_host:
  - https://my-company.dohball.host/main
  - file:///path/to/local/shared/dohballs # For local sharing

# Control automatic update behavior when Doh.load() encounters a package from a Dohball
always_upgrade_dohballs: false # If true, Doh.load checks host for newer version
always_reinstall_dohballs: false # If true, Doh.load always redownloads/installs
```

### Installation, Management, and Updates in Consuming Projects

When a package contained within a Dohball is requested (e.g. `Doh.load('someSharedPackage')`), the Doh system in the *consuming project* handles finding, downloading, and extracting the Dohball automatically if needed.

**Manual Management (CLI in Consuming Project):**
```bash
# View status of installed Dohballs and the packages they provide
doh status
doh status verbose

# Run packager (includes Dohball checks against dohball_host)
doh update

# Upgrade installed Dohballs to latest compatible versions from configured hosts
doh upgrade

# Reinstall all Dohballs (clears local cache first, then fetches from hosts)
doh reinstall
```

## Edge Scenarios & How They Behave

| Scenario                                                                 | What happens                                                                                                     |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Two packages share a folder, then you split them into separate dirs.** | Each new folder starts its own Dohball lineage. If they were previously in one Dohball, that lineage for the old combined folder effectively ends. Consumers would need to update to depend on the new, separate Dohballs if desired. |
| **A package moves to a different folder within the same project.**       | Its *identity* is still the package name. If the new folder is baked as a Dohball, consuming projects will find the package provided by this new Dohball upon next update/install. The old Dohball (if no longer baked or empty of unique packages) might become obsolete. |
| **Forking a project to make a private mod of its shared code.**          | You can bake Dohballs from your forked project and host them on a private `dohball_host`. Consuming projects just add your private host to their `dohball_host` list (typically with higher priority). |

## Common Confusion Points Clarified

### "Why not just use Git for sharing code between projects?"
Git is excellent for managing the source code *within* a single repository. For sharing versioned, ready-to-consume code *between separate Doh projects* (especially when you don't want consumers to clone the entire source repo or deal with its build process), Dohballs offer a more direct and cleaner dependency mechanism. They provide a stable, packaged "release" of a folder's content.

### "Why version folders instead of individual packages?"
By versioning folders (which may contain multiple packages):
1.  All related components and their relative asset paths stay in sync.
2.  Internal compatibility within that shared folder is guaranteed for that version.
3.  Sharing a coherent set of related micro-packages becomes simpler.

### "How do I know which packages are in which Dohball?"
In the *consuming project*, the `dohball_manifest.json` (auto-generated in its `/doh_js/manifests/` directory) maps package names to the Dohballs that provide them and their versions. You can also use `doh status verbose` in the consuming project. The developer *sharing* the code defines what gets into a Dohball via `dohball_deployment` settings, implicitly by folder structure.