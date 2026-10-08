---
description: "@deepseek-ai/dsh-client-ui-quality-report"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-quality-report

[English](README.md) | 中文

## 概述

从会话历史展示报告检查结果、草稿中填写的来源和假设验证计划。未知或失败的结果保留工具调用检查入口。界面不读取实时业务服务，也不影响模型请求。

## 目录

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## 使用本包

由质量报告组合包挂载，或在 Web 组装中加入本包的 Loader 行。`tool.call.toolview` 中的 `quality_report_review` 键拥有这张卡片；卸载插件会移除卡片和语言字典。

<a id="model-experience"></a>
## 模型体验

无，因为卡片只展示已有工具结果。

#### KV Cache effect

无；本包不组装提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 来源真实性和业务结论仍需人工审阅。结果和卡片取自同一份持久记录，没有需要协调的独立可变状态，因此不发布 invariant 伴生入口。

<a id="dev-note"></a>
### 开发备注

决策见 [Native quality-report plugin](../../../.agents/notes/implemented/feature/2026-10-08-native-quality-report-plugin.zh.md).
