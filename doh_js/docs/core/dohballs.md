# Dohballs: Folder-Based Code Sharing

![DohBalls]({{Package:deploydoh_home}}/images/dohballs.png?size=small)

A Dohball is an **automated snapshot of a folder's contents**, where that folder acts as a **container for one or more [Doh Packages](https://www.google.com/search?q=/docs/core/packages) or [Modules](https://www.google.com/search?q=/docs/core/modules)**. These snapshots are versioned using Doh's internal `dohver.js` incremental versioning system.

The primary purpose of Dohballs is to provide a **"management-less" way for a developer's Doh projects to act as internal repositories for each other.** 

---
This system excels at facilitating the seamless sharing, linear updating, and organic evolution of:

  * A **foundational internal toolkit**: your personal or team's collection of essential utilities, base Doh patterns (like `DohPath`), and custom modules.
  * Project-specific components that need to be shared across different parts of a larger Doh application or between closely related instances.

Think of Dohballs not as a replacement for NPM (for public libraries) or Git (for comprehensive source control), but as a specialized, complementary tool. They are particularly powerful for:

  * Cultivating your **evolving internal component library**. Let them grow from simple helpers into distinct modules, splitting and refactoring "like cells" as your needs dictate, without the typical packaging overhead for each internal iteration.
  * Ensuring consistency and easily propagating updates of your core utilities and architectural patterns across all your Doh projects.
  * Gracefully upgrading revisited projects with your latest foundational code.

Dohballs are designed for largely transparent operation, automated by the [Auto-Packager](https://www.google.com/search?q=/docs/core/auto_packager) and the `dohball_host` module. They are distinct from real-time file synchronization systems; Dohballs provide a more deliberate, version-incremented way to update shared codebases. In essence, a Dohball is more akin to a **versioned "fork" of a shared code segment** than a traditional package version. Future enhancements may even allow "melding" these forks.

## The "Why": Simplifying Your Internal Code Lifecycle

Dohballs address the desire to manage an internal suite of shared code with maximum flexibility and minimal administrative burden:

  * **Frictionless Tool Evolution:** Your internal tools can mature without needing to publish a formal package at each step.
  * **Eliminating Repetitive Setup:** Avoids manual copying of shared code or complex sub-module configurations.
  * **Reduced Management Overhead:** No need to maintain individual manifests for every small shared utility for internal use. The Auto-Packager handles this project-wide.
  * **Streamlined Updates:** Consuming projects can update to your latest "good code" with a simple `doh upgrade`.

**Dohballs & Git: A Crucial Partnership**

  * **Git:** Remains your fundamental tool for source code history and version control.
  * **Committing Baked Artifacts for Transport & History:**
      * The `dohball.json` file (containing the `dohver.js`-managed version) resides in the *source folder* of the packages being baked. The `doh bake` command updates this file. **Users never edit or create `dohball.json` files manually; `doh bake` handles this.**
      * The actual baked Dohball `.tar.gz` files (created in `project_root/dohballs/`) are also intended to be **committed to your Git repository** alongside your source code and the updated source `dohball.json` files.
        This practice serves two main purposes:
        1.  It provides a Git-tracked history of your baked artifacts.
        2.  For remote/team sharing, Git acts as the **transport mechanism** to get these baked artifacts onto the file system of the Doh instance that will host them.

## Core Concepts - How Dohballs Work

  * **Folders as Package Containers:** A Dohball is a `.tar.gz` archive of a specific folder's state, containing source files where Doh Packages/Modules are defined.
  * **Package-Centric Interaction:** You always interact with shared code via Doh Package names (e.g., `Doh.load('MyCustomUtility')`).
  * **Versioning with `dohver.js`:**
      * The `version` in a package's source `dohball.json` is an incremental string like `0.0.1a`, managed by `dohver.js`. **This is not a content hash.**
      * `doh bake` uses `dohver.js` to update this version in the source `dohball.json` if changes warrant.
      * This indicates a **linear progression of updates**. Access to *specific* older versions relies on Git history.
  * **Minimal Internal Archive Metadata (`dohball.json` inside the `.tar.gz`):**
      * `version`: The `dohver.js`-generated version, copied from the source `dohball.json`.
      * `removals[]`: An array of file paths no longer present, for cleanup by the consumer.
  * **Consumer's Auto-Packager Manages Full Manifests:** Detailed manifests are *not* in the Dohball. The **consuming project's Auto-Packager** analyzes installed Dohball contents and updates its *own local manifests*.

## Working with Dohballs: Practical Workflows & Configuration

The `dohball_host` system is networkable. A Doh instance can consume from multiple hosts (via `http://` or `https://` URLs in `pod.yaml`'s `dohball_host` list) and can be both a host and a consumer, enabling "lazy push/pull" of code between isolated monorepos or instances.

### Fine-Tuning Dohball Contents: The Ignore System

Control what gets included using these `pod.yaml` settings:

1.  **Global `packager_ignore`:** Dohballs respect global `packager_ignore` settings (e.g., for `node_modules`, `.git`).
2.  **Dohball-Specific Ignores (in `dohball_deployment` section):**
      * `ignore_paths`: List directory paths (relative to project root) never to include in any Dohball, nor whose packages should trigger Dohball creation for that path.
      * `ignore_packages`: List specific Doh Package names. These packages won't be "exposed," and their containing folders won't be baked *on their behalf*. (Often, `expose_packages: '*'` is used, with these ignores providing refinement.)
3.  **Implicit Exclusion of Nested Dohball Containers:** If Folder A (being baked) contains Sub-folder B, and B is itself a root for packages forming their own separate Dohball, B's contents are excluded from A's Dohball.

### A. Local Toolkit Synchronization (Your Internal Component Library)

**Goal:** Effortlessly keep your foundational utilities and custom Doh patterns consistent across all your local Doh projects.

**One-Time Setup:**

1.  **Your "Toolkit Monorepo" Project (`pod.yaml`):**
      * Set `dohball_deployment.expose_packages: '*'`.
      * Ensure `dohball_deployment.compile_manifest: true`.
      * Add the `dohball_host` module to `host_load`.
2.  **Each *Consuming* Local Project (`pod.yaml`):**
      * Add your Monorepo (when running) as a `dohball_host`:
        `dohball_host: ['http://localhost:PORT_OF_MONOREPO']` (e.g., `http://localhost:3001`).

**Ongoing Workflow:**

  * **I. Update Your Toolkit Monorepo:**

    1.  **Edit & Refine Tools.**
    2.  **Bake:** In the Monorepo, run `doh bake`.
          * *What this does:* Updates `dohver.js` versions in source `dohball.json` files and creates/updates `.tar.gz` archives in `/dohballs/`. Commit these changes to Git.
    3.  **Run Monorepo as Host:** In the Monorepo, `doh run`.
          * *What this does:* Starts the Monorepo's `dohball_host` module. Its public manifest is rebuilt, ready to serve updates.

  * **II. Update a Consuming Local Project:**

    1.  **Upgrade:** In the consuming project, `doh upgrade`.
          * *What this does:* Contacts your Monorepo host, sees newer `dohver.js` versions, downloads, and installs.
    2.  **Reboot (if needed):** `doh run` in the consuming project.

### B. Team Sharing / Remote Host Updates (Git-Mediated Artifact Transport)

**Goal:** Use Git to transport *baked Dohball artifacts* to a shared Doh instance (e.g., team server), which then acts as the `dohball_host` for other consumers. This facilitates team management of a shared component library where "build artifacts" become installable.

**Steps (Sharer/Developer - On Local Machine):**

1.  **Develop & Bake:** Make code changes, run `doh bake`.
      * *What this does:* Updates source `dohball.json` versions and refreshes `.tar.gz` files in `/dohballs/`.
2.  **Commit & Push Artifacts to Git:** Commit source code, updated source `dohball.json` files, and the `/dohballs/` directory. Push to your remote Git repo.
      * *What this does:* Git now holds the specific "build artifacts" (Dohballs and their versioned source `dohball.json`s), ready for the hosting instance.

**Steps (Remote Hosting Instance - e.g., Central Team Server):**

1.  **Pull Artifacts from Git:** On the server, `git pull`.
      * *What this does:* Updates the server's local file system with the new `.tar.gz` files in its `/dohballs/` and the source `dohball.json` files.
2.  **Reboot Service:** Restart the Doh application on this host (e.g., `doh pm2 restart`).
      * *What this does:* The host (running `dohball_host` module with `compile_manifest: true`) regenerates its public manifest, reflecting the now-updated Dohballs it can serve.

**Steps (Consuming Instance - Team Member's Project, CI, etc.):**

1.  **Configure Host:** Ensure its `pod.yaml` lists the remote host.
2.  **Upgrade Consumer:** Run `doh upgrade`.
      * *What this does:* Fetches the host's updated public manifest, compares `dohver.js` versions, and `doh install`s newer Dohballs.
3.  **Reboot (if needed):** Restart its Doh application.

## 6\. FAQ

| Question                                                              | Answer                                                                                                                                                                                                                                                                                                                                                                                                                   |
| :-------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Q: Can I mix npm deps & Dohballs?** | Absolutely. Doh’s NPM bridge works seamlessly alongside Dohballs.                                                                                                                                                                                                                                                                                                                    |
| **Q: What if two hosts offer a package with the same name?** | The order of `dohball_host` declarations in the consumer's `pod.yaml` is the **sole decider**. The first host in the list that provides the package "wins" for that package. `dohver.js` versions are used to determine if an update is needed *from that chosen host*, but not to select between hosts.                                                                   |
| **Q: How do I "un-install" a Dohball from a consumer?** | There isn't a formal `doh uninstall-dohball` command. Dohballs are designed for flexibility. If you no longer need packages from a specific Dohball: 1. Remove `Doh.load()` calls or dependency listings for its packages from your source. 2. You can manually delete the installed folder (typically found under a path mirroring its origin within your project, or in `/.doh/dohballs/` if managed there by older installers). Doh itself does **not** automatically prune these package files or manage this aspect of the lifecycle. Its "package management-like" systems are for discovery, installation, and linear updates of these "fork-like" code snapshots, not full lifecycle management. |
| **Q: Do Dohballs work for binary assets?** | Yes—images, shaders, WASM, etc. If it’s in the folder tree that gets baked, it’s in the tarball.                                                                                                                                                                                                                                                                                          |

## 7\. Design Philosophy Recap

**Source remains sacred; builds remain ephemeral artifacts.**
Dohballs embody this by snapshotting folders *as-is* and letting every consuming Doh instance re-interpret their contents through its own Auto-Packager. The `dohver.js` system provides a simple, linear way to track updates. You trade the complexity of semantic versioning and manual publishing for teleport-grade portability and the freedom to organically evolve hundreds of interconnected components within your own Doh ecosystem.

Happy baking—and even happier *not thinking about it most of the time*\!