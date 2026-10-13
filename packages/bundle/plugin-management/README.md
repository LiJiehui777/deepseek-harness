---
description: "Compose native plugin management for enhanced DH."
kind: "package-bundle"
---

# @deepseek-ai/dsh-plugin-management

English | [中文](README.zh.md)

## Summary

Compose native plugin management for enhanced DH.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Start `pnpm run start:enhanced` to use the enhanced profile. It composes this bundle, the Web application, RAGFlow and enterprise connectors.

<a id="understand-the-implementation"></a>
## Understand the implementation

This bundle contains composition rows only. The same DH home retains settings, credentials, workspaces and conversations. The enhanced profile owns its own bundle selection and row overrides. Existing Web profile files remain intact. RAGFlow continues running as an independent API.

<a id="model-experience"></a>
## Model Experience

### Composition

#### What the model sees

The `cordis.patch.yml` bundle adds management controls, with no tools or model instructions of its own. Connector behavior belongs to the connector packages.

#### Token effect

The composition itself contributes no model tokens.

#### KV Cache effect

Cache effects belong to the plugins enabled or disabled through management.


## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Headless profiles mount management explicitly if required. No invariant companion is published because this package owns no runtime state.

<a id="dev-note"></a>
### Dev Note

See the [migration decision](../../../.agents/notes/implemented/feature/2026-10-13-native-plugin-management.md).
