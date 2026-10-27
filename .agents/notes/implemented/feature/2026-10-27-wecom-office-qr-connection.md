# Agent Note: WeCom office QR connection

Status: implemented

English | [中文](2026-10-27-wecom-office-qr-connection.zh.md)

## Problem

Intelligent bots deliver messages and tasks but do not grant office document, calendar or todo visibility. Independent DH needs explicit office authorization without exposing that account to remote bot conversations.

## Decision

The WeCom card hosts independent office and message-robot sections. Office QR uses pinned official CLI 1.3.4 through native authorization and subprocess services. The robot retains the [enterprise connector rules](2026-10-13-standalone-enterprise-connectors.md). Eight fixed reads cover documents, smart-document pages, microdisk metadata, schedules and existing todos. Executors enforce saved capability switches and trusted Session ancestry. Enterprise task IDs, descendants, cyclic ancestry and unresolved parents are denied.

Each consent attempt owns a private generation directory. The CLI keeps encrypted credentials there; the native grant stores only a home-bound directory reference. The adapter removes inherited CLI overrides, suppresses raw diagnostics and bounds output. Reads serialize against the saved account, use private output directories and project selected fields. Document files must resolve inside the invocation directory. Cancellation, replacement, disconnect and unload await process cleanup; late consent cannot commit a replaced binding.

Method discovery marks interface availability only. Resource access is verified after a successful read. Authorizer and organization names appear only when recognized provider fields exist. One DH home shares this office account. The official CLI QR model is not a personal OAuth token interchangeable with Feishu user identity.

## Alternatives considered

- Reusing Bot ID and Secret conflates message delivery with office permission and does not supply office interfaces.
- Arbitrary CLI commands expose write operations beyond the approved read set.
- Exporting this grant to remote tasks lets admitted bot senders inherit the local office account. Separate remote-office permission and approval rules are required first.
- Copying office documents into RAGFlow introduces synchronization and retention duties. Reads remain references in DH conversations and RAGFlow stays an independent connector.

## Consequences

The exact-version CLI dependency and one-account-per-home limit remain deployment requirements. This connection does not edit resources, download arbitrary files or expose chat archives. Disconnect deletes local credentials without revoking platform consent. Provider capabilities vary by enterprise: simulated transport tests validate DH integration, while real QR consent and a permitted document read establish account access. Loader tests cover cancellation and read isolation; native-page tests cover staged settings, QR cancellation and local Agent execution.
