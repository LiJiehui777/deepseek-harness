# Agent Note: ZTT quality application identity

Status: implemented

English | [中文](2026-10-09-ztt-quality-brand.zh.md)

## Problem

The independent enhanced application presents a developer-oriented Harness identity even though its intended users work with Zhongtian quality knowledge and inspection records.

## Decision

The enhanced overlay enables a dedicated presentation plugin through the existing sidebar, conversation hero and document-title slots. It disables the official brand occupant. The `build:enhanced` entry selects public client profile `ztt`, quality-oriented onboarding and composer copy, company favicon and application manifest. Other build profiles retain their copy. Company artwork is copied from the user-owned integrated RAGFlow public assets.

## Alternatives considered

Editing the generic shell's brand fallbacks would couple every composition to one deployment. Reusing the embedding host-return plugin would require an unrelated host bootstrap and return action. A dedicated slot occupant lets the independent application own its identity without depending on RAGFlow availability.

## Consequences

The plugin owns localized presentation only, not credentials, sessions or model prompts. Its occupants follow declaration removal and reactivation. A real Loader browser scenario verifies identity, image loading, responsive layout, sidebar navigation and access to native connector settings. Quality task descriptions do not install workflows or connector credentials. The shell's public assets and the enhanced build profile must be shipped together.
