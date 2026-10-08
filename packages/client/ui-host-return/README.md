---
description: "Host-provided Agent identity and chat-service account management for the Web workspace."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-host-return

English | [中文](README.zh.md)

## Summary

Show the configured Agent name, sidebar identity, welcome message and browser title in an embedded Web workspace. Users can return to the host and inspect bound knowledge bases in a read-only popover. Optional host-owned New Session delegates resource selection before clearing the Session. Native Settings → Plugins → Chat services shows Feishu and enterprise WeChat account status and opens their account managers while retaining the Session and draft. Invalid configuration renders nothing.

## Table of Contents

- [Configuration](#configuration)
- [Extension points](#extension-points)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="configuration"></a>
## Configuration

```yaml
- id: ui-host-return
  config:
    returnUrl: http://localhost:9222/agents
    hostName: RAGFlow
    agentName: Product Knowledge Assistant
    workspaceName: Agent Workspace
    datasetNames: [Product Manual, FAQ]
```

`returnUrl` accepts only an absolute HTTP(S) URL without embedded credentials and is limited to 2048 characters. The embedding application remains responsible for choosing an authorized destination. `agentName` is required and becomes the primary identity. `hostName`, `workspaceName`, and `datasetNames` are display-only values; knowledge-source names are capped at 100 entries and 128 characters each.

An optional `newConversationUrl` delegates the New Session flow to the embedding host before any local Session is cleared or created. It must be an absolute HTTP(S) URL on the same origin as `returnUrl`. An iframe posts `{ type: 'ragflow.workbench.new-conversation' }` to that origin; the parent must validate the sender window and origin before opening its resource-selection dialog. A standalone page navigates to the configured destination instead. Omitting the value preserves native New Session behavior. No knowledge IDs, credentials or permissions travel in this notification.

An optional `channelManagementUrl` enables the Chat services tab. It follows the same URL and origin constraints as `newConversationUrl`. The embedded tab requests account metadata with `ragflow.workbench.channel-status-request`; the parent validates the sender and returns `ragflow.workbench.channel-status` with exactly two platform rows (channel, configured-account count, enabled state and optional bound-account name). The tab validates the parent window, host origin and bounded metadata. Clicking Manage accounts sends `ragflow.workbench.manage-channel` with only `feishu` or `wecom`; the host opens its existing authenticated account form as a modal without replacing the iframe. Closing the modal refreshes metadata and retains the current native Session and unsent draft. A standalone tab navigates to the configured URL with a `channel` query instead. No platform credentials or tool authority enter this projection. Select the plugin and its account when creating a new host-owned conversation; these settings do not silently rebind an existing conversation.

Static client entries are composed by package name rather than by copying Host Loader configuration into the browser Loader. This package therefore carries the validated value in a `webserver/index-inject` global row and samples it when the authenticated page boots.

<a id="extension-points"></a>
## Extension points

The plugin occupies `sidebar.brand.action`, `sidebar.brand.mark`, `sidebar.brand.name`, `conversation.hero.brand.mark`, `conversation.hero.identity`, and `shell.document-title`. When account management is configured it also registers the `chat-services` contribution in `settings.plugins.tab`. The return action appears before the Agent identity in the expanded brand row and navigates the top-level browser context, so it works when Web is embedded in an iframe. The Agent-name popover is presentation-only, closes on Escape or an outside pointer action, and never changes the host-owned binding. It declares no child slots and owns no persistent state.

<a id="model-experience"></a>
## Model Experience

None, as the identity chrome never changes model context or requests.

#### KV Cache effect

None; the plugin does not assemble or send provider requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Account status requires the authenticated embedding host; standalone pages provide navigation only.
- Branding is configured when the Web process starts. Changing it requires a Loader-row refresh or process restart.

<a id="dev-note"></a>
### Dev Note

The integration decision is recorded in the host-return Agent Note under `.agents/notes/implemented/feature`.

No invariant companion is published because this presentation owns no persistent state.
