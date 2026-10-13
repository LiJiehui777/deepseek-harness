---
description: "为增强版 DH 组合原生插件管理功能。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-plugin-management

[English](README.md) | 中文

## 概述

为增强版 DH 组合原生插件管理功能。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制及后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

运行 `pnpm run start:enhanced` 使用增强版配置，组合本插件包、Web 应用、RAGFlow 连接器及企业协作连接器。

<a id="understand-the-implementation"></a>
## 理解实现

本插件包仅包含组合条目。同一 DH 主目录保留设置、凭据、工作区及对话。增强版配置单独保存插件包选择及条目覆盖，既有 Web 配置文件保持不变。RAGFlow 继续作为独立 API 运行。

<a id="model-experience"></a>
## 模型体验

### 组合

#### 模型看到什么

`cordis.patch.yml` 组合包新增管理控件，自身不增加工具或模型指令。连接器行为由连接器包负责。

#### Token 影响

本组合自身不增加模型 token。

#### KV 缓存影响

缓存影响由管理功能启用或禁用的具体插件负责。


## 已知限制及后续工作

<a id="known-limitations-and-deferred-work"></a>

- 无界面配置如需管理功能须显式挂载。不提供不变量伴随插件，因为本包不拥有运行时状态。

<a id="dev-note"></a>
### 开发备注

参见[迁移决策](../../../.agents/notes/implemented/feature/2026-10-13-native-plugin-management.zh.md)。
