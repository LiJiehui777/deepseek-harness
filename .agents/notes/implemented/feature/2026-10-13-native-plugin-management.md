# Agent Note: Native plugin management backport

Status: implemented

English | [中文](2026-10-13-native-plugin-management.zh.md)

## Problem

The standalone enhanced distribution needs the latest native plugin management entry while retaining its connectors, account grants and conversation data.

## Decision

Backport official plugin-manager and ui-plugin-manager sources pinned to upstream `d743267388` (0.2.1-alpha.2). Preserve package inspection, cancellation, registry selection, explicit build-script approval, compatibility checks and protected management dependencies. Adapt profile serialization, root Include reconciliation, shared configuration forms, localization and primitives to this runtime. The enhanced profile composes the new bundle and existing connectors. A separate ZTT-only launch overlay keeps application identity independent of connector composition. Connector-owned artwork registers through the keyed `plugins.item.icon` slot, shared by cards and detail pages without teaching the manager provider-specific ids. Feishu credentials and OAuth keep their existing owner. Optional analytics uses an explicit embedding callback, absent from ordinary Web launches.

## Alternatives considered

A full upstream merge replaces large unrelated runtime and Session surfaces. A visual-only list cannot control the Loader. Selective migration retains native behavior without changing the standalone architecture.

## Consequences

Settings, credentials and conversations remain in the existing DH home. The enhanced profile selects bundles independently from the old Web profile. RAGFlow remains an independent API service. This backport adds no CLI plugin subcommands and does not satisfy external plugins' newer runtime requirements automatically.

## Validation

Retain upstream package, registry, patch, lifecycle and browser controller tests. Built Web coverage opens all three forms, saves credential references, checks named knowledge selection, refreshes settings and verifies actual tool unload/reload through the Loader. Existing RAGFlow picker and Feishu OAuth tests remain regression coverage. The enhanced composition verifies ZTT identity and browser artwork; native connector cards and details verify their platform marks.
