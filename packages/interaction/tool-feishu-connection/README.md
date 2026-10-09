---
description: "@deepseek-ai/dsh-tool-feishu-connection"
kind: "package-bundle"
---

# @deepseek-ai/dsh-tool-feishu-connection

English | [中文](README.zh.md)

## Summary

Add selected Feishu chat, Docx/Wiki and Base reading tools to a conversation. Install the built bundle with the native plugin command; shipped profiles do not enable it by default. Application credentials and user OAuth grants remain at the host. The empty profile patch grants no global tools, and this package provides no writes.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Install with `dsh plugin --profile web add <local-built-package-directory>`. Mount the plugin in an authorized conversation preset with explicit `capabilities` (`chats`, `documents`, `bitable`), `endpoint`, `token`, `maxResultBytes`, `maxPageSize` and `timeoutMs`. Keep the host token in private server configuration outside the workspace and browser settings. Installing this bundle alone does not expose tools; the host selects the instance's capabilities.

The host must resolve the saved conversation and connection on every read, recheck the enabled capability and live authorization, and reject model-supplied account selection. Application and user identities have distinct access; failed user authorization must never fall back to application access. Feishu membership, history visibility, resource sharing and Base advanced permissions remain authoritative. The bridge returns complete JSON with `channel: feishu` and an `items` array.

Reads reject redirects, forward cancellation and enforce the configured deadline. Complete UTF-8 response bounds include metadata; oversized pages and documents fail without partial results. The standard native Web tool inspector displays the persisted text. The [host-return UI](../../client/ui-host-return/README.md) delegates authorization management to the embedding host.

<a id="model-experience"></a>
## Model Experience

### Selected Feishu reads

#### What the model sees

The generated [tool schemas](../../../docs/tool-catalog.md#deepseek-aidsh-tool-feishu-connection) and complete JSON text with resource IDs, scope and pagination. Only selected capabilities contribute tools. Arguments contain no OAuth tokens or account selection. Returned documents and messages are reference material, never execution instructions.

#### Token effect

Chats contribute two schemas, documents one and Base three. Only explicitly read results append content; connections do not preload resources.

#### KV Cache effect

Schemas remain fixed within a conversation. Read results append to its history.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Documents expose complete plain text for upgraded Docx and Wiki nodes containing Docx. Images, embedded files and Base attachments are not downloaded; chat non-text bodies expose metadata. No writes or company-wide history access are provided. Large documents require a separate bounded document reader. No invariant companion is published because registry entries derive from one fiber and authority is checked by the host on every call.

<a id="dev-note"></a>
### Dev Note

See [Unified Feishu connection](../../../.agents/notes/implemented/feature/2026-10-09-unified-feishu-connection.md).
