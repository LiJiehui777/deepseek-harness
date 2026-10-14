# Agent Note: Standalone enterprise connectors

Status: implemented

English | [中文](2026-10-13-standalone-enterprise-connectors.zh.md)

## Problem

Independent DH needs both platform resource tools and remote task entry. The integrated Feishu and chat-record plugins depend on a RAGFlow host bridge, so installing them alone cannot authorize or receive platform messages.

## Decision

Feishu resource reads select app or user identity explicitly. The settings card uses a mutually exclusive radio group and shows only the selected identity's setup instructions. User-only controls contain consent and callback settings; both identities retain app credentials. Identity changes stay staged until save and retain any user grant and bot settings. The native authorization service owns attempt cancellation; a same-browser cookie, one-use state and PKCE bind consent to the initiating DH browser and saved account. A Host-only credential record owns user tokens and granted scopes. Atomic read-modify-write serializes refresh-token rotation across processes. User reads fail on absent or insufficient grants rather than substituting an application token. Bot transport and sends retain app identity. This grants one account to the DH home, including its admitted remote tasks; it does not add per-person identity isolation. A disconnect removes the local grant, while platform-side consent remains Feishu-owned.

An optional native bundle uses the official Feishu and WeCom SDKs. Independent settings cards own capability switches and sender/chat scopes; DH credentials own secrets. Long connections require no public inbound server. Applications start with both accounts disabled. Empty sender lists refuse all tasks; unauthorized text is not retained, while sender/chat IDs remain visible for explicit setup. Model-requested sends require an enabled switch, explicit destination and native one-shot approval.

Remote inputs enter the public SessionController prompt pipeline with provider-derived request IDs. Sender-scoped chat bindings retain native persistence, presets, tools and approvals. The connector owns SDK connections, bounded ingress queues and receipt-to-whole-Agent-idle reply watchers. It cancels its watchers on reconfiguration without taking over the Agent lifecycle. Replies use the latest assistant text in that interval, so local follow-ups can contribute; this is not per-message causal attribution.

Feishu application scopes and resource sharing authorize chat history and Docx/Wiki reads. WeCom intelligent-bot reads expose only the bounded process-local received-message buffer. Reconnection clears the buffer. Complete tool results are size bounded; HTTP reads reject redirects and obey cancellation. Provider failures expose sanitized messages, and ambiguous delivery never automatically retries.

## Alternatives considered

The host bridge retains dependence on integrated RAGFlow. Feishu OpenAPI MCP supplies broader tools and OAuth but does not replace bidirectional IM transport. The official WeCom OpenClaw adapter targets another plugin API. Community dsh-connect supplies Feishu messaging and richer IM controls, but does not cover this pair of providers and our native settings cards. Reusing official transports avoids owning authentication and reconnect protocols while preserving this checkout's SessionController path.

## Consequences

Real Loader tests exercise authentication, scopes, secret redaction, bounded results, credential rotation and unload. A full built Web scenario configures both accounts and drives official SDK long connections through local provider fixtures; remote tasks use a deterministic external model to read a Feishu document, send through both providers with mocked human approval, and persist native Session receipts. The settings ARIA and tool schemas pin public output. A real Web OAuth fixture verifies browser binding, one-use callbacks, user-token reads, atomic refresh and local disconnect. Real-account scopes and provider delivery still require configured credentials. Base/calendar actions, archive access, media and IM-side approvals remain absent. Setup and current constraints live in the [user guide](../../../../docs/user/enterprise-connectors.md).
