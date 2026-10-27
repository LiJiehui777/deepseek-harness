# Agent Note: Schema-guided WeCom office operations

Status: implemented

English | [中文](2026-10-27-wecom-office-operations.zh.md)

## Problem

A connected office account needs contacts, meeting and mail operations plus document, spreadsheet, calendar, todo and microdisk changes. A small read-only adapter cannot expose the official method catalog without duplicating its parameter definitions or admitting arbitrary commands.

## Decision

The [QR account decision](2026-10-27-wecom-office-qr-connection.md) retains credential ownership, trusted local Session ancestry and bot sender permissions. A fixed reviewed method inventory classifies every operation by category and read/write mode. Capability discovery, parameter discovery, reads and writes use separate native tools. Newly discovered methods require a code change. The Host fetches the selected official schema, validates arguments without coercion, and projects declared response fields while removing credential and identity context. Schema descriptions and resource content remain reference material.

The mutation executor requests native one-shot approval itself, after argument validation and file snapshots. Alternate callers cannot bypass it. A denied, missing or cancelled answer performs no mutation. Account and category permissions are checked again before submission and before publication. Ambiguous write outcomes never retry automatically. Message destinations must appear in the bound bot’s recent-session list.

New contact, meeting, mail and chat permissions default to disabled. Existing accounts explicitly enable office extensions; a new QR connection opts into the listed capabilities. File uploads snapshot regular files inside the trusted local workspace, excluding the DH private home, account directory and credential files. Downloads must originate inside the invocation directory and are retained in a new workspace directory. Byte, item, file-count and time limits apply; failed calls remove unpublished downloads. The ordinary DH file tools own subsequent local spreadsheet analysis and editing.

## Alternatives considered

- Exposing arbitrary CLI commands would admit authentication commands and newly added mutations without review.
- Registering every provider method as a separate native tool duplicates discovery and increases the permanent model schema cost.
- Treating a successful QR scan as verification of all business permissions hides resource and ownership restrictions.

## Consequences

Method discovery proves parameter compatibility, not access to a particular resource. Provider errors and per-item failures remain possible after approval. WeCom controls ownership, chat-history availability and enterprise policy. Local filesystem transfers require a local workspace. The [connector package](../../../../packages/interaction/enterprise-connectors/README.md) owns execution limits and remaining unsupported behavior. Loader tests exercise the official-schema adapter against external fixtures; a keyless Web Session records discovery, reads and the native mutation approval.
