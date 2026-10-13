---
description: "Manage the current profile's bundles and Loader entries through native Remote methods."
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-manager

English | [中文](README.zh.md)

## Summary

Manage the current profile's bundles and Loader entries through native Remote methods.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Open Plugins in the enhanced profile. Install a compatible npm package, Git source or local bundle; inspect its source and requested build scripts before approval. Bundles declare `dsh.bundle.patch`.

<a id="understand-the-implementation"></a>
## Understand the implementation

Profile manifests own bundle selection; user patches own row switches. Live profiles serialize edits and watched reloads, refresh module links and reconcile the root Include. Startup-only profiles report a required restart. Higher-priority overlays can override saved switches. Management dependencies cannot disable themselves. Failed installs restore the manifest and lockfile; downloaded files may remain.

<a id="model-experience"></a>
## Model Experience

### Management tool

#### What the model sees

The optional `plugin_manager` tool exported by `./tools` lists entries and bundles and returns profile change results. The enhanced management bundle mounts only the GUI service, so it adds no model tool by default.

#### Token effect

Mounting the optional tool adds its declaration; each call appends the returned inventory or change result.

#### KV Cache effect

Tool results append to the transcript. Enabling or disabling connector tools can change later tool declarations and cache reuse.


## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- This backport does not add upstream CLI plugin subcommands or upgrade the runtime. No invariant companion is published: requested disk state and observed Loader state can intentionally differ under overlays or startup-only profiles; change results expose that distinction.

<a id="dev-note"></a>
### Dev Note

See the [migration decision](../../../.agents/notes/implemented/feature/2026-10-13-native-plugin-management.md).
