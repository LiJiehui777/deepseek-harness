# Agent Note: Wait for business workflow review in the initiating conversation

Status: implemented

English | [中文](2026-11-03-conversation-workflow-waiting.zh.md)

## Problem

The start tool returns an instance id immediately, allowing the initiating Agent turn to finish before human review. The engine continues after approval, but the conversation does not automatically receive the result. A review card alone does not preserve the pending user request.

## Decision

Business workflow starts attach the accepted instance to its initiating Session. The successful start result uses the native `concludesTurn` marker to stop further model steps. A package-owned listener uses the existing `agent/turn-stopping` extension to keep that Agent turn open while Flowable runs or waits. It polls engine facts using the configured interval and performs no model requests while suspended. Approval continues native engine execution, including restricted DH analysis nodes. Completion, termination, or a blocked node steers a logged plugin notice into the same Agent so it reports saved results without a new user message.

Follow ownership lives in the separate `business_workflow_follows` version 1 domain. It stores only process, Session, and tenant identities. The engine remains authoritative for execution and review. Reopening an attached local Session wakes an idle Agent and resumes the existing instance. Explicit UI attachment supports older instances. Queued user input releases the stop boundary so it can be processed; non-disposal cancellation detaches follows without canceling the process. Disposal preserves ownership, aborts polling, drains callbacks, and closes storage.

The completion notice is flushed to the Session log before its follow record is deleted. Outputs and then optional details are omitted to bound the full model-visible message below 64 KiB. A crash between that flush and deletion can repeat a notice; there is no cross-store exactly-once claim. Notices identify their plugin source and collapse in the transcript. They carry reference data, not authority to approve or bypass nodes. Tool permissions and human decision checks remain unchanged.

The existing conversation card displays execution and waiting phases and offers explicit resumption for older or stopped conversations. The native Stop control stops following; engine termination remains an explicit workflow action. The implementation stays in the business-workflow package.

## Alternatives considered

**Keep the detached start receipt.** It leaves the user's request appearing complete while approval and results are outstanding.

**Make the start tool await a human decision.** A long-lived tool call would couple review duration to tool deadlines and transport lifetime. The existing turn-stop extension suspends the conversation after the start tool has completed.

**Ask the model to poll progress.** Repeated model requests consume tokens during an otherwise deterministic wait. The Host reads engine state and resumes the model only when it has new work.

**Move workflow control into the Agent loop.** The existing extension already supports keeping a turn open and steering continuation, so core loop changes add no required behavior.

## Consequences

Normal execution remains one open initiating turn through review, followed by automatic final feedback. Host restart can require a new turn in the same Session because the old process is gone; follow ownership still targets the accepted instance. Reopening a persisted follow may spend one acknowledgement request. User cancellation preserves the engine process, and uncertain external operations remain subject to existing engine failure policy.

Owner tests cover suspension, bounded delivery, persistence and reopening, queued input, user cancellation, disposal, outages, ownership, termination, and blocked steps. The built browser scenario verifies an open initiating turn before approval, unchanged model-call count during waiting, refresh recovery, and automatic saved-result feedback in that same conversation after approval. Stable model-facing notices have owner-local snapshots.
