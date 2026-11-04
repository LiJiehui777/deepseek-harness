---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-04-business-workflow-notices

English | [中文](2026-11-04-business-workflow-notices.zh.md)

## Summary

Declares workflow checkpoint notices in the producer-owned message-source union. The additional source kind reaches user and developer events, queued inbox messages, and recorded session-title request messages.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-04-business-workflow-notices
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-27-subagent-settlement-attribution"
    after: "e022a9943ebb43bde5bd731a92ed4e75983ff2d27d3b9a5b114aa955992ff5df"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-27-subagent-settlement-attribution"
    after: "9b4fbeb776fb02d1bec85d4d021e739c2dd6516063b6c16a1f0512f99280ef12"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-27-subagent-settlement-attribution"
    after: "eeaf6843c495e54b72866c1597b6ecd5e30d509fb636e9d6bdf55309df318371"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-27-subagent-settlement-attribution"
    after: "db9e139b03d429bb7f4e026996c06551a88588343ce3d39b8db9edd3a090096d"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The Session header, event envelopes, message roles and content remain unchanged at V4. New readers retain all existing source alternatives, including historical messages without workflow notices. Older native V4 readers admit a nonempty producer-owned source kind and preserve unknown JSON attribution without the workflow plugin; notice form and summary use the existing presentation contract. The recorded message content remains the model input. The kind alone neither starts a workflow nor grants approval or tool authority: execution still requires persisted ownership, manual binding and service-side checks. A reader without the workflow plugin cannot resume its automation, but can read the log without truncation or reinterpretation. Pre-V4 readers retain their existing unsupported-version refusal. No historical generation or accepted V4 checkpoint is changed.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/session/session-persistence-jsonl/tests/native-source-admission.spec.ts packages/session/session-title-llm/tests/llm.spec.ts: 2 files and 49 tests passed. Native source admission covers both compression modes, read and write handles, unknown producer metadata preservation without a producer, and rejection without file truncation. The preceding upgrade regression passed 502 tests, including workflow checkpoint waiting, durable follow restoration, cancellation and unchanged notice content; 12 built-browser scenarios also passed.

<a id="dev-note"></a>
## Dev Note

None.
