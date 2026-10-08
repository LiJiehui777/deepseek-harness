# Agent Note: Host-owned conversation creation

Status: implemented

English | [中文](2026-10-08-host-owned-conversation-creation.zh.md)

## Problem

An independent RAGFlow workbench selects reference knowledge bases for each conversation. Native New Session actions previously reused the running Web process and its fixed bindings, bypassing that selection.

## Decision

The Workspace UI emits an optional typed bail event before user New Session navigation. A host-return listener with a validated, same-origin `newConversationUrl` claims it and asks the iframe parent to open its creation flow. In a standalone page it navigates to that destination. The notification carries only its operation name; the host validates both origin and sender.

The host creates a private conversation record and launches its own isolated Web home. Knowledge IDs and model connections remain server-owned. Initial Workspace connection cannot be intercepted by this user-action hook. Independent workbench homes opt in to `ui-workspace.resumeRecentSession` so reopening a conversation restores its latest non-blank Session; native embeddings retain blank startup.

## Alternatives considered

A shared Web process cannot change one Session's knowledge scope safely through display-only branding. Creating a hidden RAGFlow Agent would preserve the old dependency and confuse conversation ownership.

## Consequences

RAGFlow can place the workbench beside Home and bind knowledge per conversation. Existing embeddings omit the optional destination and retain native Session creation. Cordis disposal releases the host listener; cancelling the host dialog leaves the current conversation intact. This hook neither persists state nor changes model context.
