---
description: "@deepseek-ai/dsh-client-ui-quality-report"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-quality-report

English | [中文](README.zh.md)

## Summary

Review draft status, reported sources and hypothesis verification plans in the native Web workspace. The card reads persisted tool results, so history remains viewable without a live report service. Unsupported results retain an inspection action. This optional presentation does not change model requests.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Mount this package through the quality-report bundle or a Web Loader row. The `quality_report_review` key in `tool.call.toolview` selects the card. Unloading the plugin removes the card and dictionaries.

<a id="model-experience"></a>
## Model Experience

None, as the card only presents existing tool results.

#### KV Cache effect

None; this package assembles no provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Source authenticity and business conclusions require human review. No invariant companion is published: output and presentation derive from one persisted result, with no independent state to reconcile.

<a id="dev-note"></a>
### Dev Note

See [Native quality-report plugin](../../../.agents/notes/implemented/feature/2026-10-08-native-quality-report-plugin.md).
