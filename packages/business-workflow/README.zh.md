---
description: "业务工作流编排与集成包，与模型编写的子智能体脚本分开组织。"
kind: "package-group"
---

# packages/business-workflow

[English](README.md) | 中文

## 概述

本组负责可配置业务工作流。[工作台](workbench/README.zh.md)向 [Web Client](../../docs/subsystems/web-client.zh.md) 提供 Flowable 执行、草稿编辑器与手动模拟，浏览器预览不调用模型或业务系统。流程引擎适配及业务连接器归本组；原生[工作流子系统](../../docs/subsystems/workflow.zh.md)继续负责子智能体编排脚本。

## 目录

- [包列表](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

<a id="packages"></a>
## 包列表

| 包 | 职责 |
|---|---|
| [workbench](workbench/README.zh.md) | Flowable 执行、业务流程草稿编辑与手动模拟 |

<a id="related-documentation"></a>
## 相关文档

- [Web Client](../../docs/subsystems/web-client.zh.md) — 浏览器集成。
- [业务工作流](../../docs/subsystems/business-workflow.zh.md) — 草稿与引擎运行时类型。
- [工作流子系统](../../docs/subsystems/workflow.zh.md) — 模型编写的编排脚本。

<a id="dev-note"></a>
## 开发备注

业务流程编排与模型编写的工作流执行保持独立。
