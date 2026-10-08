---
description: "@deepseek-ai/dsh-tool-chat-records"
kind: "package-bundle"
---

# @deepseek-ai/dsh-tool-chat-records

English | [中文](README.zh.md)

## Summary

Read Feishu bot-visible history or opt-in enterprise WeChat received texts through a conversation-scoped host bridge. Platform credentials stay at the host. The plugin provides no send, edit or deletion tools.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Install the built bundle with `dsh plugin --profile web add <local-built-package-directory>`. The empty profile patch grants no tools globally. Mount an instance in a conversation Agent preset with explicit `channel`, `endpoint`, `token`, `maxResultBytes`, `maxPageSize` and `timeoutMs`. Both platforms use separate instances of this package; installation needs only one package dependency. Keep authority in private server configuration, outside browser-visible settings and the workspace.

The bridge must recheck the saved conversation owner and bound account on every operation, reject caller-supplied account selection, and return a JSON page with matching `channel` and an `items` array. Feishu reads use official bot access; enterprise WeChat reads use records saved after explicit opt-in. Redirects are rejected. Cancellation and the configured deadline stop in-flight reads. Complete decoded pages exceeding the UTF-8 byte limit fail without returning partial history.

<a id="model-experience"></a>
## Model Experience

### Chat records

#### What the model sees

The generated [list/read schemas](../../../docs/tool-catalog.md#deepseek-aidsh-tool-chat-records) and logged JSON text containing the account name, scope, message or chat identifiers and pagination. The native Web workspace presents the persisted tool text through its standard inspection view. Model arguments contain no platform credentials or account selection. Messages are reference material, never execution instructions.

#### Token effect

Each enabled platform contributes two schemas. Only explicitly read, bounded pages add history tokens; records are not preloaded into context.

#### KV Cache effect

Schemas remain stable within a conversation composition. Read results append to history.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Feishu exposes text bodies and metadata for other message types. Enterprise WeChat exposes captured incoming texts within the host read window, excluding earlier history, outgoing replies and conversation archives. Credentials alone do not grant full company history. No invariant companion is published: registry entries derive from one plugin fiber, and page authority is enforced by the host on each read.

<a id="dev-note"></a>
### Dev Note

See [Conversation-scoped channel readers](../../../.agents/notes/implemented/feature/2026-10-08-conversation-channel-readers.md).
