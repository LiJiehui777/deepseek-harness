# Agent Note: Opt-in ACP live assistant updates

Status: implemented

English | [中文](2026-09-15-opt-in-acp-live-assistant-updates.zh.md)

## Problem

ACP projects assistant text and reasoning from the committed `assistant/message` event. Interactive clients therefore wait for the complete model attempt even though the Agent publishes ordered `agent/assistant-stream` deltas while it runs. Simulating a typewriter after commit does not reduce that latency and misrepresents buffered output as model streaming.

## Decision

The ACP plugin exposes `liveAssistantUpdates`, defaulting to `false`. An enabled session maps non-empty `text-delta` and `reasoning-delta` frames from its exact owned Agent to standard `agent_message_chunk` and `agent_thought_chunk` updates. The existing per-session output chain serializes live deltas with tool, configuration, committed content, and usage updates, and prompt settlement still waits for that chain.

The session records whether text or reasoning for each turn and step reached the client. Its committed `assistant/message` projection omits only the corresponding blocks, while images and usage remain commit-time updates. Failed durable attempts clear the suppression state so later committed output is not lost. Standard ACP has no operation that retracts a delivered message prefix, so content from an abandoned or retried attempt remains provisional; deployments that cannot accept that presentation trade-off retain the default committed-only mode.

RAGFlow enables the option through its ACP profile overlay because its human chat client needs actual model-generation latency and treats live output as provisional until the run completes. The option changes transport timing only and adds no DSH presentation types or model-visible content.

## Alternatives considered

**Simulate typing after committed output arrives.** Rejected because the user still waits for the full model call and the animation falsely implies upstream incrementality.

**Make live deltas the ACP default.** Rejected because automation clients may parse each update as committed output and standard ACP cannot retract a failed attempt's prefix.

**Add a private RAGFlow stream protocol.** Rejected because standard ACP already represents text and thought chunks, and a second prompt transport would duplicate session, cancellation, tool, and permission lifecycles.

## Consequences

Interactive ACP deployments can render text and reasoning as the provider produces them, while existing clients retain committed-only behavior. Live delivery gives up rollback for an abandoned attempt and therefore requires provisional rendering. Focused ACP projection and prompt tests pin per-delta delivery, committed-block suppression, default behavior, output ordering, and prompt settlement.
