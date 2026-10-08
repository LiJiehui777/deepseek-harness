# Agent Note: Native quality-report plugin

Status: implemented

English | [中文](2026-10-08-native-quality-report-plugin.zh.md)

## Problem

A business-method bundle can guide analysis but cannot register a native tool or replayable result card. Installation and per-Agent activation also require separate ownership.

## Decision

The optional [quality-report bundle](../../../../packages/interaction/tool-quality-report/README.md) contributes a [Web card](../../../../packages/client/ui-quality-report/README.md), while an authorized Agent preset mounts the tool. RAGFlow owns approved package selection and knowledge bindings; retrieval remains an MCP operation.

The tool checks draft completeness and local evidence references. It cannot authenticate model-supplied sources, establish a root cause or approve a report. Persisted tool-result metadata supplies all card data, so replay consults no mutable catalog or service.

## Alternatives considered

A skill alone cannot execute structural checks or register a native card. A process-global tool grants the capability to every Agent sharing the process, so the bundle separates browser presentation from preset tool registration.

## Consequences

Installation does not grant tool access. Every review remains a draft awaiting human review. The plugin copies no knowledge content and reads no credentials.
