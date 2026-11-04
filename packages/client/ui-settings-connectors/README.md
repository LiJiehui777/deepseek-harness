---
description: "Configure saved RAGFlow, Feishu and WeCom accounts in the native Plugins page."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-connectors

English | [中文](README.zh.md)

## Summary

Open the Plugins page to select RAGFlow knowledge bases, authorize Feishu resource reads, or connect a WeCom office account. Account controls preserve staged edits until an explicit save; credentials remain write-only. Each page appears while its account configuration is available from the Host.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The [ZTT overlay](../../../apps/cli/config/examples/ztt/cordis.yml) enables this companion. Account permissions, authorization and resource scopes remain owned by the [enterprise connectors](../../interaction/enterprise-connectors/README.md) and [RAGFlow connector](../../interaction/tool-ragflow-connector/README.md). Opening a page does not grant permissions or start authorization. Save endpoint and credential changes before loading the knowledge-base directory; loading names does not change the retrieval allowlist.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The companion contributes account forms through the Plugins page slots and reads saved settings through the shared configuration-form service. It owns transient drafts, account-status polling and credential-presence projections. Disposing the plugin removes pages, dictionaries, subscriptions and pending polling. The Settings shell does not own connector code. Platform artwork uses the optional keyed item-icon slot with the manager's built-in artwork as fallback.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Plugin manager](../ui-plugin-manager/README.md) — configuration pages and account artwork.
- [Shared configuration forms](../ui-settings/README.md) — revision-fenced writes and the Host settings mirror.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through saved account settings that can change later connector tools and resource scopes; these forms create no model requests.

#### KV Cache effect

The forms do not assemble model requests. Connector configuration can change a later request's available tools.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Account configuration is shared within one DH home. These pages do not provide per-conversation accounts or grant access beyond each platform's saved permissions.

<a id="dev-note"></a>
### Dev Note

None.
