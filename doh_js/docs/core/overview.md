# Doh.js Core Architecture Overview

This document provides a high-level overview of how the core components of Doh.js interact, from build-time analysis to runtime execution and reactivity. Understanding these relationships is key to effectively using and debugging Doh.js applications.

## Core Architectural Layers & Interactions

Doh's architecture is best understood as a series of interconnected layers, each building upon the last to provide a cohesive development and runtime environment.

*   **1. Resolution Order**: This is the **unifying algorithm** at the heart of Doh. It governs inheritance, dependency resolution, and conditional logic consistently across all major components including **Packages**, **Modules**, **Patterns**, and **Pods**. Its principles (e.g., multiple inheritance, last-wins priority, conditional inclusion) ensure predictable behavior throughout the framework. [See Resolution Order Details](/docs/core/resolution_order)
*   **2. DohPath**: This layer provides **environment-aware path resolution**, creating a stable coordinate system for locating resources across browsers, Node.js, Bun, and the Virtual File System (VFS) in exported applications. It is fundamental to the **Auto-Packager** and **Load System**. [See DohPath Details](/docs/core/dohpath)
*   **3. Auto-Packager & Manifests**: Functioning as Doh's "compiler pass," the **Auto-Packager** is a **build-time tool** that analyzes your project (including `Packages` and `Modules`). It uses **`DohPath`** to find files and applies **`Resolution Order`** to understand dependencies, ultimately generating **`Manifests`**. These JSON manifests are pre-computed blueprints of the application (dependency graphs, file lists, pattern maps) that the **Load System** consumes for fast runtime initialization. [See Auto-Packager Details](/docs/core/auto_packager) & [Manifests Details](/docs/core/manifests)
*   **4. Load System (`Doh.load()`) & `Doh.Loaded`**: The **runtime engine** responsible for all resource management. `Doh.load()` uses **`Manifests`** and **`Resolution Order`** to fetch and sequence resources (JavaScript, CSS, Patterns, `Modules`, `Packages`, etc.). These are populated into **`Doh.Loaded`**, an in-memory **runtime cache** or virtual filesystem. `Doh.Loaded` serves as the single source of truth for all loaded content, crucial for the **Pattern Engine** and **HMR/HVFS**. [See Load System Details](/docs/core/load)
*   **5. Reactive Nervous System: Data Binding & HVFS**: This layer enables real-time updates and reactive programming. The **Hot Virtual File System (HMR/HVFS)** monitors file changes, updates the **`Doh.Loaded`** cache, and then leverages **`Data Binding`** (`observe`/`mimic`) to propagate these changes into live application objects and UI elements without requiring a page refresh. Data Binding can also be used independently for state synchronization. [See HMR/HVFS Details](/docs/core/hmr) & [Data Binding Details](/docs/core/data-binding)
*   **6. Compositional Language: Pattern Engine**: The **Pattern Engine** provides a human-facing DSL for leveraging **`Resolution Order`** to build reusable components. **Patterns** are object templates with multiple inheritance, melded properties, and defined lifecycles. Instantiated via `New()`, they form the primary building blocks of application logic and UI, using resources from `Doh.Loaded`. [See Patterns Overview](/docs/patterns/patterns)
*   **7. Governance Layer: Pods**: **Pods** offer **hierarchical configuration** management for your application. They use the same **`Resolution Order`** principles for inheritance, allowing settings to be defined and overridden at various levels (e.g., environment, tenant). Configuration is accessed at runtime via `Doh.pod`. [See Pods Details](/docs/core/pods)
*   **8. Distribution Loop: Dohballs (Code Sharing)**: This layer addresses inter-project code sharing. **Dohballs** are content-addressed, versioned archives of folders (containing one or more Doh packages) from a project. They are created by build tooling leveraging the **Auto-Packager** and are designed to be easily consumed by *other Doh projects* as dependencies, distinct from primary application deployment mechanisms like Git or Doh Cloud. [See Dohballs: Folder-Based Code Sharing](/docs/core/dohballs)

## Conceptual Flow Through Doh's Architecture

The interaction between these layers can be visualized as a flow from initial project setup to runtime operation and deployment:

1.  **Foundation & Discovery (Build-Time & Pre-Runtime):**
    *   `DohPath` provides a consistent view of the file system, enabling reliable resource location.
    *   The `Auto-Packager` scans project files (including `Packages` and `Modules`) using `DohPath`.
    *   `Resolution Order` is applied by the `Auto-Packager` to interpret dependencies and inheritance.
    *   This process culminates in `Manifests` – optimized blueprints for the runtime.
    *   Separately, `Pods` configuration is structured, also adhering to `Resolution Order` for its hierarchy.

2.  **Runtime Initialization & Execution:**
    *   The `Load System` (`Doh.load()`) uses `Manifests` and `Resolution Order` to load resources (code from `Modules`, `Patterns`, assets) into the `Doh.Loaded` cache.
    *   `Pods` are loaded, making configuration available globally via `Doh.pod`.
    *   The `Pattern Engine` facilitates the creation (`New()`) and operation of `Patterns`. These components, defined within `Modules`, utilize resources from `Doh.Loaded` and configuration from `Doh.pod` to execute application logic.

3.  **Runtime Reactivity & Updates (Primarily Development):**
    *   `HVFS` monitors the file system for changes.
    *   When a file is modified, `HVFS` updates the corresponding resource in `Doh.Loaded`.
    *   `Data Binding` mechanisms (`observe`/`mimic`) then propagate these changes from `Doh.Loaded` to active parts of the application (e.g., UI, stateful objects), often without a full page reload.

4.  **Packaging & Sharing (Inter-Project Focus):**
    *   For sharing code between Doh projects, `Dohballs` are generated. These are versioned, deployable snapshots of specific project folders (containing packages), created by the `Auto-Packager` and build utilities. They are designed for consumption by other Doh projects, differing from the deployment of a full application to production (which would typically involve Git-based workflows or dedicated deployment tools).

This overview helps you understand how changes flow through the system and how components depend on each other. Reference this map when exploring more detailed documentation about specific features. 