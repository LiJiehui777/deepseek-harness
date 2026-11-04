# Agent Note: Manual workflow selection before conversation starts

Status: implemented

English | [中文](2026-11-03-manual-workflow-selection.zh.md)

## Problem

The conversation selector labels an unbound Session as ordinary chat, but retaining its start capability lets the Agent launch a workflow from a conversational request. Users need manual selection to distinguish discussing a workflow from authorizing its use.

## Decision

A conversation must hold a user-selected published workflow/version before its Agent can start an instance. This replaces the unbound-start behavior in the [Flowable integration](2026-11-02-flowable-business-execution.md). Ordinary chat keeps discovery for recommendations and status/cancel for existing owned instances. It hides the start schema and receives a logged instruction to ask for manual selection. The registry guard rejects hidden start calls; the tool executor independently requires an exact selection, and serialized start acceptance checks it again.

The selector remains an explicit authenticated UI operation and does not itself start execution. Selection and the workbench's two start entry points reject Agent-attributed calls, so an alternate service invocation cannot self-select or use an operator start to bypass the conversation rule. Deliberate workbench tests remain operator actions. Other ordinary-chat tools retain their existing permissions.

Clearing a binding prevents future conversation starts without canceling accepted engine instances or changing review authority. The existing [conversation waiting mechanism](2026-11-03-conversation-workflow-waiting.md) continues to follow accepted runs. No storage format or Agent-loop change is required.

## Alternatives considered

**Prompt-only selection advice.** A model can still call a visible or previously known start tool. The accepting operations enforce the rule.

**Disable every ordinary-chat tool.** The user's requested distinction concerns starting business workflows; unrelated conversation capabilities remain useful.

## Consequences

Users select a workflow before requesting execution. Ordinary chat can recommend a published workflow and direct the user to the selector. UI copy and model-visible snapshots describe this behavior. Executor tests prove that missing and mismatched selections produce no start, even without the prompt policy. The built browser case verifies no engine instance from an ordinary-chat request, rejection of direct and alternate entry calls, a successful manually bound run through review, and denial after returning to ordinary chat.
