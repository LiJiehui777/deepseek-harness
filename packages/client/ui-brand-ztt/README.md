---
description: "ZTT Quality Assistant identity for the standalone enhanced Web application."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-ztt

English | [中文](README.zh.md)

## Summary

This presentation plugin supplies the Zhongtian (ZTT) identity in the sidebar, new-conversation hero and browser title. The enhanced launch overlay enables it and disables the official brand. It does not require RAGFlow or an embedding host.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Use this package

Run `pnpm run build:enhanced` followed by `pnpm run start:enhanced` from the enhanced checkout. The build selects public client profile `ztt` and title `中天质量智能体`, including quality-specific onboarding and composer guidance. The Web public directory supplies `ztt-mark.svg` and `ztt.webmanifest`; the company artwork comes from the integrated RAGFlow checkout. Generic builds retain their existing identity and onboarding.

The interface supports Chinese and English, follows the current theme, and preserves conversation titles. Branding is installed through existing slots and removed when the plugin or declaring slots unload. Its dictionaries belong to namespace `ztt-brand`. No settings or credentials are stored by this package.

## Model Experience

None, as this package contributes browser presentation only and registers no model context.

#### KV Cache effect

None. No provider request is changed.

## Known Limitations and Deferred Work

- The welcome tasks describe intended uses, not separately implemented workflows. Model configuration and an authorized RAGFlow connection are required for corresponding capabilities.
- The application shell must ship the paired company assets.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

No runtime invariant is published because the plugin retains no mutable runtime state. Quality guidance does not change model prompts, enable connectors or grant knowledge access.

</details>
