# Agent Note: Isolated business workflow workbench

Status: implemented

English | [中文](2026-11-02-business-workflow-workbench.zh.md)

## Problem

Business processes need a configurable editor inside DH without spreading MES, SDCC, or EIP concerns through the Agent loop and existing client packages. The first integration needs to expose ordering and review steps before a production engine or connector is available.

## Decision

Keep the feature in `packages/business-workflow/workbench`. Register a main panel and sidebar contribution through existing slots. The generic Web bundle includes the disabled plugin; the ZTT overlay enables it. The registration-owned store holds page-local drafts and immutable preview copies. JSON import/export preserves drafts across page reloads.

A grouped node inspector separates basic information, execution parameters, input references, conditions, and successor paths. Its body scrolls independently while its header and deletion footer remain outside that scroll area. This prevents long prompts or condition forms from hiding node identity and removal. It edits the existing draft fields and retains start/end protection; deleting a node can leave downstream references for validation rather than silently changing their meaning. The layout draws on the variable/condition grouping in the [Dify If-Else panel](https://docs.dify.ai/en/use-dify/nodes/ifelse), while using the DH theme and form primitives.

Previews advance through explicit simulated actions. Human and wait nodes reject ordinary advancement, and terminal previews cannot resume. No preview calls a model, connector, or workflow engine; simulated approval grants no business permission. The interface states those limits. Real execution is owned separately by the [Flowable decision](2026-11-02-flowable-business-execution.md).

This decision does not supersede [dynamic workflows](../../../../packages/workflow/workflow/README.md): that feature owns model-driven workflow execution, while this package owns business authoring and simulation.

## Alternatives considered

Adding business controls to the chat or existing workflow service couples authoring to model execution. A separate hosted prototype does not exercise DH panel registration. Integrating Flowable immediately combines interface review with engine deployment and connector access that are outside this first step.

## Consequences

Business UI and its tests stay together; external edits register the package in compiler, bundle, overlay, and browser-test configuration. Draft validation covers supported acyclic graphs and upstream references, not runtime business conditions. Drafts survive panel remounts but require export before page reload. Preview history is limited to twenty entries.

Owner-local tests cover import validation, graph edits, preview transitions, and registration disposal. The built Web scenario exercises the shipped Loader composition with the ZTT overlay, borrows an existing recorded model turn, and owns its workflow UI expectations. Engine execution, persistence, and analysis tool restrictions are verified by the Flowable integration; live connectors and enterprise approval identity remain separate work.
