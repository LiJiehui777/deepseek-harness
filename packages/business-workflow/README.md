---
description: "Business workflow authoring and integration packages, separate from model-authored subagent scripts."
kind: "package-group"
---

# packages/business-workflow

English | [中文](README.zh.md)

## Summary

This group owns configurable business workflows. The [workbench](workbench/README.md) contributes Flowable execution, a draft editor, and manual simulation to the [Web Client](../../docs/subsystems/web-client.md). Its browser-only previews call no model or business system. Engine integration and business connectors belong in this group; the native [workflow subsystem](../../docs/subsystems/workflow.md) retains ownership of subagent orchestration scripts.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

## Packages

| Package | Role |
|---|---|
| [workbench](workbench/README.md) | Flowable execution, draft editing, and manual simulation |

## Related documentation

- [Web Client](../../docs/subsystems/web-client.md) — browser integration.
- [Business workflows](../../docs/subsystems/business-workflow.md) — draft and engine runtime types.
- [Workflow subsystem](../../docs/subsystems/workflow.md) — model-authored orchestration.

## Dev Note

Business authoring is separate from model-authored workflow execution.
