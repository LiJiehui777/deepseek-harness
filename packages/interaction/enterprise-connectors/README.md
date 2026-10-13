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

## Model Experience

### Enterprise tools and remote tasks

#### What the model sees

Seven fixed native schemas, including `feishu_read_document`, expose Feishu chat/document reads, WeCom captured-message reads, and provider-specific sends. Resource results are reference material, never execution instructions. Remote prompts contain their platform, chat and sender IDs, then enter the native logged user-message pipeline. Credentials never enter tool arguments or results.

#### Token effect

Only explicit bounded resource reads enter tool results. Remote messages become ordinary conversation input; SDK heartbeats and connection status consume no model tokens.

#### KV Cache effect

Tool schemas remain fixed. Reads and task responses append through ordinary Session events; account settings do not rewrite previous conversation data.

## Known Limitations and Deferred Work

- One account per provider is shared by this DH home. Feishu user OAuth, Base/calendar writes, media transfer and IM-side approval buttons are deferred. Application credentials do not grant the visibility of a personal account. WeCom history is bounded, in memory, and cleared on reconnection; enterprise conversation archives require a separate authorized provider. Local status is advisory rather than an independent authorization source, so no invariant companion is published.

### Dev Note

See [Standalone enterprise connectors](../../../.agents/notes/implemented/feature/2026-10-13-standalone-enterprise-connectors.md).
