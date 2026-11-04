---
description: "Flowable business workflow editing, durable execution, local review, and restricted DH analysis in the enhanced Web UI."
kind: "package-reference"
---

# @deepseek-ai/dsh-business-workflow-workbench

English | [中文](README.zh.md)

## Summary

Design business workflows inside DH and execute pinned revisions through Flowable. Configure nodes and data references, inspect durable instances, handle human tasks, and deliver explicit wait confirmations. DH analysis runs with no tools. MES, SDCC, and EIP actions remain waiting until their connectors are implemented. Save drafts to the server and publish them for DH to discover and start from a conversation. Published versions and engine runs survive reload.

## Table of Contents

- [Use this package](#use-this-package)
- [Execution semantics](#execution-semantics)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Use this package

The [ZTT overlay](../../../apps/cli/config/examples/ztt/cordis.yml) enables the sidebar panel and supplies all Host configuration. The generic Web bundle leaves the package disabled. Browser operations use the authenticated DH Typert Remote namespace `businessWorkflows`; engine credentials stay on the Host and resolve through `passwordEnv` per request.

The local engine [Compose file](engine/compose.yml) pins Flowable 8.0.0, binds port 8082 to loopback, and stores its H2 database in a named volume. Set `DH_FLOWABLE_PASSWORD` in a private environment file and make the same credential reference available to DH; run `docker compose --project-name dh-flowable --env-file .local/flowable/engine.env -f packages/business-workflow/workbench/engine/compose.yml up -d` from the repository. Do not delete the volume to restart the engine.

Host configuration requires `baseUrl`, `username`, `passwordEnv`, `tenantId`, `requestTimeoutMs`, `pollIntervalMs`, `analysisTimeoutMs`, `lockDurationMs`, and `maxTemplates`. The lease must exceed the analysis deadline plus three REST deadlines. Remote engines require HTTPS. Each deployment uses a dedicated tenant and tenant-specific external-job topics. The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-business-workflow-workbench) owns field validation.

Use the Flowable integration-check template to exercise built-in data passing, human review, receive waits, and conditions. `core.echo` passes selected input without external operations. Configure startup inputs as a JSON object. Conditions compare the selected input field with a JSON scalar (`eq` or `neq`) or test field existence. The default integration-check condition reads the startup `approved` field. User text never becomes a script or EL expression.

The WeCom todo review template reads pending todos, passes them to DH for recommendations, and stops at human review. Enable and authorize the existing office connector with todo permission first. The fixed `wecom.todos.list` action requests the first 10 pending items; startup data does not change its query. It reuses `wecom_office_list_todos` through the guarded tool executor in a private local scope, without a model request. Existing account and ancestry checks still apply. The result retains pagination and truncation facts; this example creates no todos or messages and completes none. Missing connection or permission stops the node with a settings hint.

The separate **WeCom todo risk review (simulated)** template has eight nodes and requires a `scenario` input: `risk` supplies four samples, including overdue and missing-evidence facts; `routine` supplies two ordinary samples. The fixed reference date is 2026-11-03. Its `demo.wecom.todos` action creates labeled fixture data without credentials, connector access, or model calls. A Boolean derived from deadlines and evidence flags controls risk review; model prose does not control routing. Risk review precedes the DH brief, and both routes require final human confirmation. The demo performs no WeCom mutation.

Select a node to edit its grouped basic, execution, input, condition, and routing fields. The inspector scrolls independently and keeps deletion in its footer. Start and end nodes cannot be deleted. After removing a referenced node, correct downstream inputs and validate the draft before saving or publishing; accepted engine instances retain their pinned graph.

Open a sample, save it to the server, and select Publish for DH. Declare up to 16 scalar startup fields with names, descriptions, types, and required flags. Publishing validates the graph and deploys an exact engine definition; saving later edits leaves that publication unchanged. Unpublish prevents future starts while accepted instances continue. Revision conflicts require reopening the saved draft before saving again. Manually select the WeCom todo review workflow in the conversation, then request execution. DH fills declared inputs, starts asynchronously, and returns a run id. Inspect progress in the workflow page and review from the conversation card or the workflow page.

Select Workflow beside the composer permission control to bind the current local conversation to one published version. The menu includes a refresh action; hover over the button for binding guidance. Selection does not start a run; an execution request does. The binding survives refresh and Host restart. The selector reloads on opening and reconnection; stale revisions reject changes. Ordinary chat discusses and recommends workflows but cannot start a new instance; manually select a published version first. Switch to Ordinary chat to remove the binding without canceling accepted runs. Workflow selection requires native-facing workflow tools; PTC-only conversations keep their mode and reject selection.

Pending human tasks appear above the initiating conversation's composer, including runs from earlier workflow bindings. Each instance groups its workflow identity and status above indented current steps; review buttons belong to those steps, and each step name appears once. Open a card to review the exact pinned node input and expandable upstream evidence in DH. Approval continues the same Flowable task; rejection terminates its run. The existing workflow-page entry remains available. Both entries refresh engine state, and a detail already open for a finished task never switches to the next approval. The card shows the oldest 30 pending tasks and their full count; later tasks appear as earlier ones finish. Reload and reconnection restore tasks from the engine.

Starting from an Agent tool attaches the run to its initiating conversation. The successful start result uses the native conclusion marker to stop further model steps; the existing `agent/turn-stopping` extension keeps that turn pending while Flowable executes or waits for human input. Waiting makes no model requests. Human approval lets the engine run subsequent nodes; completion, termination, or a blocked step delivers bounded saved evidence into the original Session and resumes its Agent for a final response. The card displays this wait and later execution. Use Continue with DH to attach an older run explicitly. Stop cancels conversation following; it does not cancel the engine process.

## Execution semantics

The Host compiles an acyclic draft into a restricted BPMN subset and deploys it before starting an instance by exact definition id. The submitted draft and startup data are stored as engine variables. Changing the editor leaves existing instances unchanged. Same-key concurrent starts on one Host share creation, and later same-key delivery looks up engine history; this is not a distributed exactly-once guarantee. Mutating REST calls are never automatically retried.

Flowable creates external jobs for analysis, supported actions, and condition evaluation. One serialized DH worker handles supported topics. Analysis uses the current default DH model in a private one-turn Session. Its scoped tool visibility is empty, presentation is native, and a monotonic execution guard rejects every tool call. Only a completed turn with non-empty output completes its engine job. The Session id is persisted before analysis or WeCom access; a previous uncertain attempt is failed rather than automatically rerun after a Host restart. Step errors are persisted with zero retries and require operator intervention or a new corrected run.

Human review is a Flowable user task assigned to `dh-local-operator`. The authenticated local DH operator may approve it or reject and terminate the instance. A wait is a receive task: its confirmation records a local-operator receipt and passes through its input. The API checks the process tenant, DH business key, and current task kind before any review or wait action. It exposes no generic complete-node endpoint. Enterprise role names in drafts are descriptive, not identity authorization.

Node inputs reference a prior output field, or startup data when the source is empty. Start, built-in pass, review, wait, and analysis outputs use a `result` field. Missing required inputs stop execution. Conditions support a dedicated existence check. The UI separates durable engine instances and human tasks from browser-only manual previews.

Active follow ownership is stored separately in `business_workflow_follows` version 1. Reopening its local owner resumes an attached run without restarting it. Plugin messages use logged notice contexts; engine results are reference data and never authorize approval or tool access. A late crash between persisting a completion notice and deleting its follow can repeat that notice after restart.

Saved drafts, publication pointers, and conversation bindings use the DH storage domain `business_workflows`; unsaved edits and manual previews remain browser-owned. Version 1 JSON imports accept 2–64 uniquely identified nodes and default absent condition settings to equality against `true`. Graph validation reports invalid targets, cycles, unreachable nodes, missing configuration, and non-upstream references. JSON export excludes engine credentials and run history.

## Model Experience

### Workflow tools

#### What the model sees

Four fixed tools discover current publications, start a selected version, inspect a conversation-owned run, and cancel it. Discovery returns purposes and declared fields in bounded pages; starts reject undeclared or mistyped inputs. Tool results are logged through the normal Agent loop. Human approval, event confirmation, editing, and publication have no workflow tool. Admission rejects remote enterprise sessions and their descendants, including persisted ancestry; the executor derives owner and delivery identity from trusted call metadata. A bound conversation receives a logged dynamic context naming its selected id and version. Prompt assembly exposes only the four workflow tools. A monotonic registry guard also denies unrelated calls, including late scope-owned tools; start checks the selected id and version again at acceptance, and status/cancel check workflow identity. Selection changes run as Agent idle maintenance, so a queued message cannot begin before the binding write settles. Ordinary conversations hide the workflow start tool, and both the registry and start executor reject unbound calls; other tools remain available. Read-only discovery supports recommendations, and existing runs can be inspected or explicitly canceled. Selection and workbench-start entry points reject Agent-attributed calls to prevent bypassing manual selection.

##### Conversation workflow instruction

```markdown
This conversation is bound to the selected published business workflow. Use business_workflow_list to inspect its declared inputs, then business_workflow_start when the user requests execution. Ask for missing required inputs. Selecting a workflow alone does not request execution. For progress questions, query the runId already returned; do not start again. Starting suspends further model steps. The conversation remains pending without model polling while the workflow runs or waits for human review. Approval resumes engine execution automatically; saved completion or failure evidence resumes this conversation for a final response. Human review is available from this conversation's review card or the workflow page and requires the user's explicit UI action. Event confirmation stays in the workflow page. If the selected version is unavailable, ask the user to reselect it. Only the user can change this binding or return to ordinary chat through the workflow selector.
```

##### Ordinary chat instruction

```markdown
This conversation is in ordinary chat mode. You may discuss or recommend published business workflows, but cannot start one. Ask the user to manually select a workflow in the conversation workflow selector before requesting execution. Do not change the selection or use another tool or service to bypass it. Existing runs remain active; use their returned runId for progress questions.
```

#### Token effect

Ordinary chat includes a fixed selection-requirement context. Discovery and status results enter the initiating conversation. Each result is bounded to 64 KiB; oversized status outputs are omitted with an explicit flag. The start tool returns immediately, while the initiating turn remains pending. Waiting spends no model calls; resuming a reopened Session and reporting a settled workflow each add a model-facing notice. Settlement notices omit oversized outputs, then optional step details, to keep the full message below 64 KiB.

#### KV Cache effect

Fixed tool descriptions and schemas stay stable across publication changes. Current catalog entries and run data appear only in tool results.

### Workflow analysis

#### What the model sees

A logged user message contains the node task and its selected JSON input; `agent` nodes see no executable tools. The package-owned prefix is stable.

##### Analysis task prefix

```markdown
Analyze the supplied business data and return findings, evidence, and uncertainty. You cannot execute system operations.
```

#### Token effect

One analysis node creates one private DH turn; token use depends on its instruction, input, and selected model output. Built-in passing, simulated todo generation, the fixed WeCom read, human review, waits, and routing create no model requests.

#### KV Cache effect

The stable prefix is shared across analysis messages. Each private Session has its own input; cross-node cache reuse is provider-dependent.

## Known Limitations and Deferred Work

- MES, SDCC, EIP, ledger, and report connector actions have no implementation here and stay waiting. The analysis worker cannot perform their operations.
- Human roles and wait confirmations use DH local authentication; enterprise identities, role membership, and authenticated upstream callbacks require separate integration.
- Failed or uncertain jobs do not automatically retry. Workflow tools admit only local conversations and query or cancel only runs started by that exact conversation. Distributed start deduplication, bounded loops, arbitrary BPMN import, and structured model-output mappings remain separate work.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The [Flowable decision](../../../.agents/notes/implemented/feature/2026-11-02-flowable-business-execution.md) owns execution and tool restrictions. The older [workbench decision](../../../.agents/notes/implemented/feature/2026-11-02-business-workflow-workbench.md) owns module placement and manual previews. Tools read the authoritative catalog per call and register no per-publication cache. The engine accepts the stored exact definition id; no independently cached runtime projection requires an invariant companion.

Owner-local tests cover drafts and lifecycle disposal. Opt-in real-engine tests use an isolated tenant. The built browser scenario replays an existing model recording, verifies empty analysis tools, handles engine tasks, and reloads history. Set `DSH_FLOWABLE_TEST_URL` and `DSH_FLOWABLE_TEST_PASSWORD` to run those cases; they skip without a real engine. The deterministic preview scenario uses an intentionally unconfigured credential reference.

</details>
