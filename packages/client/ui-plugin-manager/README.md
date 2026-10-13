---
description: "Open Plugins in the main sidebar to install, switch and configure plugins."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-plugin-manager

English | [中文](README.zh.md)

## Summary

Open Plugins in the main sidebar to install, switch and configure plugins.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

The enhanced profile includes this page. RAGFlow, Feishu and WeCom contribute existing forms through `plugins.item`. Settings retains the built-in inventory for runtime inspection. Plugins can contribute decorative artwork through `plugins.item.icon`, keyed by their `plugins.item` id; the page uses it on both cards and details, with built-in artwork as fallback.

<a id="understand-the-implementation"></a>
## Understand the implementation

The browser follows native inventory and plugin-manager events. Slots also support bundle and row configuration pages, activation controls and details. The `configForms` adapter reuses the shared settings mirror. Saved credentials and Feishu grants remain Host-owned. Embedders may supply an optional analytics callback; ordinary Web launches omit it.

<a id="model-experience"></a>
## Model Experience

### Browser controls

#### What the model sees

The `plugins.item` configuration page adds no model input. Opening configuration does not execute connector business operations.

#### Token effect

None; this browser page does not assemble or send a model request.

#### KV Cache effect

The page itself changes no provider prefix. A saved profile edit may change the tools supplied by another plugin.


## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The current layout retains the last plugin detail when returning to the panel. Existing primitives provide menus, tooltips and terminal output. No invariant companion is published: the browser owns transient view state; the Host owns durable changes.

<a id="dev-note"></a>
### Dev Note

See the [migration decision](../../../.agents/notes/implemented/feature/2026-10-13-native-plugin-management.md).
