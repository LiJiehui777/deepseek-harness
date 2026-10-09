# Agent Note: Unified Feishu connection

Status: implemented

English | [中文](2026-10-09-unified-feishu-connection.zh.md)

## Problem

Bot-channel credentials do not express document or Base access, user authorization, or per-conversation feature selection.

## Decision

The optional [Feishu connection bundle](../../../../packages/interaction/tool-feishu-connection/README.md) adds only the selected chat, document and Base read tools through a private conversation preset. Its empty profile patch grants no global tools. RAGFlow owns application credentials, per-user encrypted OAuth grants and capability selection; each read resolves the current saved connection and authorization. Model arguments cannot select another account. User identity failures never fall back to application identity.

The native Settings Plugins Connections tab delegates management to RAGFlow. User authorization requests are owner-bound, application-bound, single-use and expire after ten minutes. Refresh leases and grant revisions prevent concurrent refresh rotation and prevent disconnect from being overwritten. Resource links are parsed into identifiers; only fixed official API hosts are contacted. Feishu sharing and membership rules still apply.

## Alternatives considered

Copying provider tokens into browser settings or model arguments would expose authority. Enabling every tool in the process would widen unrelated conversations. Frozen chat-reader conversation bundles remain unchanged because existing homes pin artifact digests; new conversations use the unified connection.

## Consequences

Selected capability schemas remain fixed in a conversation, while current host authorization can revoke execution. Docx/Wiki and Base results use standard persisted tool text; attachments and writes are absent. Application scopes and user scopes must be enabled and published in the Feishu console. Real tenant consent and resource access require manual verification with an authorized account.

## Verification

The Loader composition pins six tool schemas, capability omission, unload behavior and complete-result failures with full source coverage. The keyless [Feishu connection session](../../../../snapshots/session/feishu-connection/snapshot.yml) executes document, table, field and record reads through the shipped headless profile. Built Web expectations pin the connection-management tab and preserved drafts. Gateway installation smoke verifies the official native plugin command and private preset selection.
