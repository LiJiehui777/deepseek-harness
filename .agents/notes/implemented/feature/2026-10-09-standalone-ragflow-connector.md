# Agent Note: Standalone RAGFlow connector

Status: implemented

English | [中文](2026-10-09-standalone-ragflow-connector.zh.md)

## Problem

An embedded DH runtime gives the RAGFlow host ownership of DH launch, model and conversation binding. An independent DH application needs optional knowledge access while preserving its own model, plugin and session lifecycle.

## Decision

The enhanced checkout has a separate local home and Web launch entry. RAGFlow is a native tool plugin calling the public REST API; it contributes live settings and a card to DH's plugin page. DH credentials own its API Key, while a deployment allowlist restricts retrieval and returned chunks. Empty selection permits discovery only. Connection failures remain tool failures; they do not stop DH startup or ordinary conversations.

The direct REST path serves dataset discovery and cited retrieval without a Gateway or an MCP deployment. DH remains the application owner. Feishu and WeCom require their own independent authorization providers; host-managed channel bridges do not become standalone connectors merely by installing their packages.

## Alternatives considered

Embedding DH in RAGFlow preserves host control and cannot provide independent startup. Copying knowledge into DH duplicates indexing and access policy. Reusing a conversation bridge token would retain dependence on the integrated Gateway. The public API keeps RAGFlow independently deployable and its API Key permissions authoritative.

## Consequences

The native loader composition test reaches a real local HTTP fixture, pins tool schemas and cited results, and checks disposal. Other tests check scope denial, disabled state, credential rotation, response limits, redirects and malformed provider responses. Client tests check the native card and credential writes. One connection and allowlist are shared across the local home; per-conversation bindings and standalone channel authorization are deferred. The [user guide](../../../../docs/user/ragflow-connector.md) documents the shipped controls.
