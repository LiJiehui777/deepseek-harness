---
kind: upgrade-guide
description: "Enhanced enterprise-account pages read nested profile entries instead of independent settings sections."
---

# Enhanced account configuration

English | [中文](guide.zh.md)

## Change

Enhanced deployments configure Feishu, WeCom messaging and WeCom office access under the `enterprise-connectors` profile entry, in `feishu`, `wecom` and `wecomOffice`. The native Plugins page retains independent account forms. The `ui-settings-connectors` companion owns those forms; the generic Settings shell contains no connector implementation. RAGFlow keeps the `ragflow-connector` entry and its saved dataset IDs. The runtime requires Node.js 24.9 or later and the repository-pinned pnpm version.

## Migration

1. Stop the application using the target data directory. Keep a complete copy of that directory and the Flowable data volume. Validate the upgrade in a separate directory and Flowable tenant before replacing a running deployment.
2. Use Node.js 24.9 or later, install the locked dependencies and build the enhanced client with `pnpm run build:enhanced`.
3. Run `bash scripts/start-enhanced.sh` with the same `DSH_ENHANCED_HOME`. Before DH starts, the script moves the three enhanced sections from `settings.yaml` into the nested enterprise entry. It retains a private backup identified by the original content hash and refuses conflicting saved account values. The native settings importer then stores the resulting entries in the profile. Credential references and the RAGFlow allowlist are preserved.
4. Use the shipped `enterprise-connectors` and `ragflow-connector` entry IDs and enable the `ui-settings-connectors` row, as in the [ZTT overlay](../../../../apps/cli/config/examples/ztt/cordis.yml). Confirm account permissions and selected knowledge bases in Plugins, then verify ordinary chat cannot start workflows and a manually selected test workflow waits for review and continues after approval.

If `settings.yaml` has already been imported by another version, recover the enhanced sections from its retained copy in an isolated directory before starting. Do not reset an existing profile from a default template: that operation replaces its files.
