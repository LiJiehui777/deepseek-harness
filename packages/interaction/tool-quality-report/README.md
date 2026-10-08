---
description: "@deepseek-ai/dsh-tool-quality-report"
kind: "package-bundle"
---

# @deepseek-ai/dsh-tool-quality-report

English | [中文](README.zh.md)

## Summary

Check quality-analysis drafts for missing information and unresolved evidence references. The optional bundle adds a native Web card; an authorized Agent preset grants the tool. Every result remains a draft awaiting human review. Structural checks do not authenticate sources or establish a root cause.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Install the built native bundle with `dsh plugin --profile web add <local-built-package-directory>`. Build both plugin packages first. The bundle contributes a Web card and an inert browser Host entry under ACP. Mount this package in an authorized Agent preset to grant the tool, supplying explicit `maxReportBytes` and `maxItems` limits.

<a id="model-experience"></a>
## Model Experience

### Report review

#### What the model sees

The generated [`quality_report_review` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-quality-report) and a logged JSON result containing draft status, structural issues and the supplied report. The tool accesses no files, networks or credentials.

#### Token effect

One tool schema is present on requests in the authorized composition. Arguments and bounded review results add data-dependent history tokens.

#### KV Cache effect

The schema stays stable within the pinned composition. Review results append to history.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Source authenticity and business conclusions require human review. No invariant companion is published: output and presentation derive from one persisted result, with no independent state to reconcile.

<a id="dev-note"></a>
### Dev Note

See [Native quality-report plugin](../../../.agents/notes/implemented/feature/2026-10-08-native-quality-report-plugin.md).
