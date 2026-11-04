# Agent Note: Conversation workflow review

Status: implemented

English | [中文](2026-11-03-conversation-workflow-review.zh.md)

## Problem

A user who starts a workflow from chat must find the correct instance in the workflow page before reviewing its output. Reusing an open detail after another entry handles its task can also confuse one approval with its successor.

## Decision

The business-workflow plugin contributes a Session-scoped card above the composer and opens a DH review dialog. The card queries native Flowable human tasks by deployment tenant, local assignee, and exact initiating Session; it does not depend on the current workflow binding or the newest-run window. It shows the oldest 30 tasks and the total count. It groups tasks and followed checkpoints by process identity: the workflow name, status, and instance id form the parent header, while indented current steps carry their own review buttons. A task name appears once. A run without active following uses its instance identity until detail supplies its name. Selection never approves a task.

Authenticated conversation APIs check local Session admission and exact process ownership before reading review evidence or submitting a decision. Details display the pinned human node's selected input plus stored upstream results. The dialog retains its exact task id; when that task ends, it cannot silently approve the next one. The existing workbench and conversation APIs share the same review operation, which rejects overlapping review attempts for one process in the same Host. Approval completes the native user task; rejection retains the existing terminate-run behavior. Agent tools gain no approval operation.

The registration owns polling and serialized reads and decisions. Session disposal stops polling and drains accepted decisions. Replaced selections ignore late detail responses. Engine outages return the deployment polling interval for recovery; both entries read the engine rather than maintaining independent approval records. Cards are a live operator view, not model messages or fabricated transcript events.

## Alternatives considered

**Keep only the workflow page.** This preserves the interruption and instance lookup that motivated the change.

**Let the Agent interpret an approval message.** This would add model authority over a human decision and make the target task ambiguous. Explicit UI actions carry the exact task identity.

**Create a separate chat approval record.** A second record could disagree with the existing engine task. Both entries therefore use the same Flowable task and operator operation.

## Consequences

Implementation stays in the existing business-workflow package. The card survives ordinary-chat selection, page reload, and reconnection through engine reads. Local operator authentication remains the only approval identity; enterprise reviewer assignment and return-for-edit branches remain deferred. The oldest-task window bounds each response without hiding the full pending count. This Host's overlap guard is not a distributed review transaction.

Controller tests cover coalesced reads, repeated clicks, replaced details, ended tasks, outage recovery, and disposal during a queued decision. The built WeCom/Flowable scenario covers conversation cards, exact content, reload, ordinary-chat switching, foreign-Session denial, approval, stale resubmission, and an external rejection reflected in an already-open dialog. Owner-local aria snapshots pin the card and detail presentation.
