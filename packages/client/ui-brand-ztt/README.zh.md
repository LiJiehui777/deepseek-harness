---
description: "独立增强版 Web 应用的中天质量智能体品牌。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-ztt

[English](README.md) | 中文

## 概述

本展示插件在侧边栏、新建对话首页和浏览器标题中提供中天（ZTT）身份。增强版启动覆盖配置启用它并禁用官方品牌。它无需 RAGFlow 或嵌入宿主即可工作。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

在增强版目录运行 `pnpm run build:enhanced`，再运行 `pnpm run start:enhanced`。构建选择公开客户端配置 `ztt` 和标题 `中天质量智能体`，包含面向质量工作的首次使用说明和输入提示。Web 公共目录提供 `ztt-mark.svg` 和 `ztt.webmanifest`；企业图案来自融合版 RAGFlow 目录。通用构建保留现有身份和首次使用说明。

界面支持中英文、跟随当前主题并保留对话标题。品牌通过现有插槽安装，随插件或声明插槽卸载而移除。词典属于 `ztt-brand` 命名空间。本包不存储设置或凭证。

<a id="model-experience"></a>
## 模型体验

无，因为本包只提供浏览器展示，不注册模型上下文。

#### KV 缓存影响

无。不会改变提供方请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 首页任务描述预期用途，并非单独实现的工作流。相应能力需要配置模型及已授权的 RAGFlow 连接。
- 应用外壳必须包含配套企业图案资源。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景——点击展开</summary>

插件不保留可变运行时状态，因此不发布运行时不变量。质量工作提示不会修改模型提示词、启用连接器或授予知识访问权限。

</details>
