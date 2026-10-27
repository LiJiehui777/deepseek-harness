---
description: "Standalone Feishu and WeCom authorization, native tools, and remote DH tasks."
kind: "package-bundle"
---

# @deepseek-ai/dsh-enterprise-connectors

English | [中文](README.zh.md)

## Summary

Optional enterprise connections for independent DH, using the official MIT-licensed [Feishu SDK](https://github.com/larksuite/node-sdk) and [WeCom SDK](https://github.com/WecomTeam/aibot-node-sdk). The [tools subsystem](../../../docs/subsystems/tools.md) owns the generated API reference; the [user guide](../../../docs/user/enterprise-connectors.md) owns account setup.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Use this package

The bundle mounts one Host service and installs independent `feishu-connector` and `wecom-connector` settings sections. Both accounts default to disabled. Secrets resolve through `ctx.credentials`; settings and Remote responses contain only references and presence metadata. The native plugin page stages changes and offers a saved-account connection check. SDK diagnostic logging is suppressed because raw provider errors can carry credentials. Feishu HTTP requests reject redirects, honor cancellation, and cap response bytes before publishing tool results.

Feishu uses a self-built application's App ID and App Secret. Its tools list API-visible chats, read text-message history and Docx/Wiki documents, and send messages to explicitly allowed chats. Platform membership, sharing and API scopes remain authoritative. WeCom uses an intelligent bot's Bot ID and Secret with the official WebSocket protocol. Its read tools expose only the bounded in-memory messages received by this connection; they do not expose company-wide archives or earlier group history.

`receiveEnabled` admits remote tasks only from `allowedSenders`; an empty sender list denies every task. An optional `allowedChats` narrows ingress and reads. Direct messages and Feishu mentions of the configured bot can trigger tasks. Status exposes the latest sender/chat IDs for explicit account setup without retaining unauthorized text. Sender-scoped chat bindings use independent DH Sessions and a dedicated workspace; the standard Agent preset retains ordinary model, knowledge, sandbox and approval behavior. The native prompt request ID prevents duplicate execution after receipt commitment. Replies select the latest assistant text from the receipt-to-whole-Agent-idle interval; local follow-ups in that interval can contribute to it.

`sendEnabled` and an explicitly listed destination are both required for model-initiated sends, which additionally request one-shot DH approval. Authorized task replies use the original conversation. An ambiguous send failure never triggers automatic retry. Message bytes, retained messages, pending tasks, HTTP requests and task waiting have deployment bounds. Reconfiguration cancels the previous connection generation; unloading stops SDK connections and drains owned tasks. Cancelling a reply watcher leaves the ordinary DH Agent under its existing lifecycle.

Feishu `readIdentity` selects application or user reads. User consent uses the native authorization service, a same-browser start cookie, single-use state and PKCE S256. The Host stores the grant in `ctx.credentials` and serializes refresh-token rotation through `modifyRecord`. Missing, expired or insufficient user grants fail without application fallback. Account changes cancel pending consent and reads; disconnect removes the local grant. One DH home shares that user's grant, including its admitted remote tasks. Bot ingress, replies and proactive sends retain application identity.

WeCom office access uses the pinned official [CLI](https://github.com/WecomTeam/wecom-cli) 1.3.4 and its QR flow. The independent `wecom-office-connector` settings default to disabled; the native scan action opts into the listed office categories, while saved capability settings remain enforced. Office access adds fixed convenience reads plus capability discovery, official parameter discovery, reads and approved writes. Contacts, meetings, mail and chat queries require explicit opt-in on existing accounts. The reviewed method inventory covers document, sheet, smart table, smart document, slide, calendar, todo, mail, microdisk and media operations; unknown methods are refused. Uploads snapshot workspace files before native approval, and downloads remain workspace artifacts. The mutation executor requests one-shot approval directly and never automatically retries uncertain results. Each executor checks saved permissions and trusted Session ancestry: enterprise tasks, their descendants and unresolved ancestry cannot use this local office account. Managed subprocesses use generation-private directories, scrub inherited CLI overrides and project bounded reference data. The native grant stores a directory binding; encrypted CLI credentials remain private to this DH home. The Host reads the pinned CLI AES-GCM bot record for the official message SDK without copying secrets to settings or Remote APIs. QR commit and disconnect reconnect or stop that same bot. Incoming tasks still require explicit sender approval; an empty allowlist refuses every sender. The QR bot lists up to twenty recent visible conversations through the CLI and can send only to a returned conversation after native approval. Cancel, timeout, replacement, disconnect and unload stop owned work before cleanup. Method discovery does not prove resource permission. See the [office decision](../../../.agents/notes/implemented/feature/2026-10-27-wecom-office-qr-connection.md) for identity and isolation limits.

The [office-operation decision](../../../.agents/notes/implemented/feature/2026-10-27-wecom-office-operations.md) defines method review, approval enforcement and file isolation.

## Model Experience

### Enterprise tools and remote tasks

#### What the model sees

Four Feishu schemas and three WeCom message schemas, including `feishu_read_document`, expose Feishu chat/document reads, WeCom captured-message reads, and provider-specific sends. The WeCom message schemas appear while either the QR connection or the manual bot connection is enabled. QR conversation lists come from the bound bot; message-history reads remain limited to approved messages captured by the SDK. Resource results are reference material, never execution instructions. Remote prompts contain their platform, chat and sender IDs, then enter the native logged user-message pipeline. Credentials never enter tool arguments or results.

#### Token effect

Only explicit bounded resource operations enter tool results. Official schemas are loaded on demand rather than registered as hundreds of permanent native tools. Remote messages become ordinary conversation input; SDK heartbeats and connection status consume no model tokens.

#### KV Cache effect

Either WeCom connection enables the three message schemas; the office switch adds its convenience reads and schema-guided office tools. Reads and task responses append through ordinary Session events; account settings do not rewrite previous conversation data.

## Known Limitations and Deferred Work

- One account per provider is shared by this DH home. Feishu Base/calendar writes and IM-side approval buttons are deferred. WeCom office operations use their separate native authorization. Application credentials do not grant the visibility of a personal account. The captured WeCom message buffer is bounded, in memory, and cleared on reconnection; official office chat queries have separate provider permissions; enterprise conversation archives require a separate authorized provider. Local spreadsheets use DH filesystem/shell tools and installed processing libraries; dedicated workbook editing and formula recalculation are not provided by this package. Meeting summaries and action items are derived from readable meeting resources; unavailable recordings cannot be synthesized. Local status is advisory rather than an independent authorization source, so no invariant companion is published.

### Dev Note

See [Standalone enterprise connectors](../../../.agents/notes/implemented/feature/2026-10-13-standalone-enterprise-connectors.md).
