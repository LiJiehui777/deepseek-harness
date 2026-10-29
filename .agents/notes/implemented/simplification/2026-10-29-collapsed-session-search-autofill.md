# Agent Note: Collapsed Session search ignores autofill

Status: implemented

English | [中文](2026-10-29-collapsed-session-search-autofill.zh.md)

## Problem

The sidebar retains its search input while collapsed. Browser or password-manager autofill can change that invisible field when a connector exposes credential controls. A non-empty query replaces Workspace groups with search results, leaving users with an apparently empty sidebar and no visible query.

## Decision

The collapsed field is disabled and requests `autocomplete="off"`. Its change handler accepts values only while search is expanded. Opening search enables ordinary editing; clearing it restores browsing. The existing query and request cancellation semantics remain intact across sidebar collapse and expansion.

## Alternatives considered

**Autocomplete alone** is a browser hint and cannot reject an input event. **Unmounting the field** changes its existing focus and transition lifecycle. **Clearing search on plugin navigation** also discards intentional searches and leaves other credential forms exposed to the same issue.

## Consequences

Connector configuration cannot activate a hidden Session filter through this field. Explicit search still works on global plugin pages. The fix changes presentation only and does not mutate Workspace membership or Session storage. Component regression coverage reproduces the empty-sidebar symptom with an autofill-style change; built Web coverage opens connector details and checks that existing Workspace rows and membership remain available.
