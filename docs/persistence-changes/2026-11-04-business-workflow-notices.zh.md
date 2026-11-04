---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-04-business-workflow-notices

[English](2026-11-04-business-workflow-notices.md) | 中文

## 概述

在生产方拥有的消息来源联合类型中声明工作流检查点通知。新增来源影响用户和开发者事件、收件箱排队消息以及会话标题请求中保存的消息。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

会话头、事件封装、消息角色和正文保持不变，继续使用 V4。新版读取方保留所有已有来源分支，包括没有工作流通知的历史消息。较早的原生 V4 读取方接受非空的生产方来源 kind；即使未安装工作流插件，也会保留未知的 JSON 来源元数据，notice 形式和 summary 沿用既有展示约定。记录的正文仍是模型输入。来源 kind 本身不启动流程，也不授予审批或工具权限；执行仍依赖持久化归属、手动绑定及服务端校验。未安装工作流插件的读取方不能恢复其自动化，但可以读取日志，不截断或重新解释数据。V4 之前的读取方仍沿用已有的不支持版本拒绝机制。未改动历史数据代际或已接受的 V4 检查点。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/session/session-persistence-jsonl/tests/native-source-admission.spec.ts packages/session/session-title-llm/tests/llm.spec.ts：2 个文件、49 项测试通过。原生来源读取覆盖两种压缩模式、读写句柄、未安装生产方时保留未知元数据，以及拒绝读取时不截断文件。此前升级回归的 502 项测试通过，包含工作流检查点等待、持久化跟进恢复、取消及通知正文保持；12 个构建后浏览器场景也通过。

<a id="dev-note"></a>
## 开发备注

无。
