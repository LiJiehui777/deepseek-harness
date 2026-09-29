# Agent Note: Configurable host-return action

Status: implemented

English | [中文](2026-09-28-configurable-host-return-action.zh.md)

## Problem

An application can launch the native DeepSeek Harness Web surface and hand the browser over to it, but the assembled page has no product-owned way back. Browser history is unreliable after authentication redirects and does not communicate that Harness is one surface inside a larger host flow.

## Decision

Add `@deepseek-ai/dsh-client-ui-host-return`, a dual-face Web plugin on the root-scoped `sidebar.brand.action` seat. The Web bundle mounts the package without configuration, which renders nothing. An embedding overlay may supply an absolute HTTP(S) `returnUrl` and a display-only `hostName`; the Host half projects the validated value through a structured `webserver/index-inject` global row, and the browser half then renders a localized icon before the Agent identity in the expanded sidebar. The link targets the top-level browser context so the host replaces the complete embedded workspace rather than navigating only the iframe.

The explicit boot projection is required because the static client manifest composes browser Loader rows by package name only; Host Loader-row configuration is not implicitly copied into those browser rows. The browser revalidates the projected value rather than treating the page global as trusted input.

The client rejects missing, oversized, relative, credential-bearing, and non-HTTP(S) destinations. This is defense in depth rather than an authorization boundary: the embedding application owns the Loader-row configuration and must authorize the destination before it reaches the browser.

RAGFlow supplies its current `/agents` URL and display-only Agent identity in the per-agent Web overlay. That keeps the integration independent of the development port and deployment hostname while avoiding a return to the agent detail route that would immediately launch Harness again. In the expanded sidebar, the Agent name is a separate interaction from the New Session mark: selecting the name opens a read-only popover of the bound knowledge-base names, with no link into complex settings and no mutation path.

## Alternatives considered

**Rely on browser Back.** Authentication redirects make the history chain variable, and the action is invisible to users who do not already know the integration boundary.

**Hard-code the RAGFlow development URL.** This works only for one hostname and port and breaks LAN, HTTPS, proxy, and alternate local configurations.

**Put the action in the sidebar footer.** The exit remains visible, but separates host navigation from the Agent identity and uses persistent vertical space. A dedicated optional brand-row seat keeps the shell generic while placing the embedding action beside the identity it governs.

## Consequences

Standalone Harness Web remains unchanged because an absent URL contributes no boot value or slot occupant. Embedded deployments gain an explicit exit and a lightweight knowledge-binding view inside the workspace chrome, allowing the embedding host to omit its own duplicate header. The action and Agent-name popover trigger are hidden with the brand row while the sidebar is collapsed; users can reveal them by expanding the rail. A changed destination or knowledge binding requires restarting the Web process because the Host value is sampled into each authenticated boot document.
