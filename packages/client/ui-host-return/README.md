---
description: "Host-provided Agent identity for the Web workspace."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-host-return

English | [中文](README.zh.md)

## Summary

This dual-face Web plugin lets an embedding application make one Agent—not the underlying runtime—the primary product identity. It adds a compact host-return action to the sidebar brand row, replaces the sidebar mark and name, personalizes the blank-session welcome identity and browser title, and shows the selected knowledge-source names. The Node half validates Loader-row configuration and projects it through the structured Web boot table, while the browser half revalidates it before registering UI contributions. Without a complete valid configuration the plugin renders nothing.

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

Static client entries are composed by package name rather than by copying Host Loader configuration into the browser Loader. This package therefore carries the validated value in a `webserver/index-inject` global row and samples it when the authenticated page boots.

## Extension points

The plugin occupies `sidebar.brand.action`, `sidebar.brand.mark`, `sidebar.brand.name`, `conversation.hero.brand.mark`, `conversation.hero.identity`, and `shell.document-title`. The return action appears before the Agent identity in the expanded brand row and navigates the top-level browser context, so it works when Web is embedded in an iframe. It declares no child slots and owns no persistent state.

## Model Experience

None, as the identity chrome never changes model context or requests.

#### KV Cache effect

None; the plugin does not assemble or send provider requests.

## Known Limitations and Deferred Work

- Branding is configured when the Web process starts. Changing it requires a Loader-row refresh or process restart.

### Dev Note

The integration decision is recorded in the host-return Agent Note under `.agents/notes/implemented/feature`.
