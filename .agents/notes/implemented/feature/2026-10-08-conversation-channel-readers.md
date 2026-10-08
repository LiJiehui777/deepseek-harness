# Agent Note: Conversation-scoped channel readers

Status: implemented

English | [中文](2026-10-08-conversation-channel-readers.zh.md)

## Problem

Messaging-channel credentials connect bots but do not register model tools or grant access to all historical messages. Sharing an unrestricted bot identity across conversations also obscures record ownership.

## Decision

The optional [chat-record bundle](../../../../packages/interaction/tool-chat-records/README.md) is installed through the native plugin command. Its empty profile patch grants no process-global tools; separate Feishu and enterprise WeChat instances are mounted by an authorized conversation preset. A host-issued token names the saved conversation and owner. Each bridge read resolves the live account binding and permissions, so changing tool arguments cannot widen account access and disabling storage revokes further reads.

Platform credentials stay in RAGFlow. Feishu uses official app access and bot-visible history. Enterprise WeChat captures opt-in received text messages independently of ordinary assistant replies; complete enterprise archives require a separate integration. Persisted tool text supplies the standard Web inspection view.

## Alternatives considered

Copying app secrets into model arguments or browser settings exposes authority. Treating received callbacks as full history misrepresents the provider's access. A global tool would grant access to unrelated conversations.

## Consequences

A conversation chooses one account per enabled platform. Read-only tools carry stable schemas and bounded pages, cancellation and deadlines. Loader-composition snapshots pin schemas and visible records; disposing a row removes both tools. A keyless recorded session through the shipped headless profile runs all four read-only tools and preserves their complete results in durable history.

The host-return plugin contributes a Chat services tab to native Settings → Plugins through `settings.plugins.tab`. Account metadata crosses only a validated parent-window/origin bridge; credentials stay in the host. Managing either account opens the existing host form in a modal and preserves the iframe, native Session and unsent draft. Creating a conversation separately selects its enabled plugin and account.
