---
description: "@deepseek-ai/dsh-tool-quality-report"
kind: "package-bundle"
---

# @deepseek-ai/dsh-tool-quality-report

[English](README.md) | 中文

## 概述

为智能体提供质量报告草稿结构检查，并在原生 Web 工作台中展示待补充内容和报告所填写的来源。组合包由服务端安装，工具由获准的 Agent preset 挂载。检查结果始终是待人工审阅的草稿，不核验来源真实性，也不确认根因。

## 目录

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## 使用本包

通过 `dsh plugin --profile web add <本地构建包目录>` 安装原生组合包。工作区必须先构建两端插件。组合包为 Web 提供卡片，在 ACP 下只有空浏览器宿主条目。实际工具由获准的 preset 挂载本包，并明确配置 `maxReportBytes` 与 `maxItems`。

<a id="model-experience"></a>
## 模型体验

### Report review

#### What the model sees

模型看到生成的 [`quality_report_review` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-quality-report)，以及记录草稿状态、结构问题和原报告的 JSON 结果。工具不访问文件、网络或凭据。

#### Token effect

获准组装的请求包含一个工具 schema。参数和受大小限制的结果增加随数据变化的历史 token。

#### KV Cache effect

固定组装中的 schema 保持稳定。检查结果追加到历史中。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 来源真实性和业务结论仍需人工审阅。结果和卡片取自同一份持久记录，没有需要协调的独立可变状态，因此不发布 invariant 伴生入口。

<a id="dev-note"></a>
### 开发备注

决策见 [Native quality-report plugin](../../../.agents/notes/implemented/feature/2026-10-08-native-quality-report-plugin.zh.md).
