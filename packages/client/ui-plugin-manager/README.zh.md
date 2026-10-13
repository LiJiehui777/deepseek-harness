---
description: "从主侧栏打开「插件」，安装、切换及配置插件。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-plugin-manager

[English](README.md) | 中文

## 概述

从主侧栏打开「插件」，安装、切换及配置插件。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制及后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

增强版配置包含此页面。RAGFlow、飞书及企业微信通过 `plugins.item` 提供既有表单。设置中保留内置插件清单用于查看运行状态。插件可通过 `plugins.item.icon` 按 `plugins.item` 的 id 提供装饰图标；列表卡片和详情共用图标，未提供时使用内置图标。

<a id="understand-the-implementation"></a>
## 理解实现

浏览器跟随原生插件清单及管理事件更新。插槽还支持插件包、条目配置页、激活控制及详情。`configForms` 适配器复用共享设置镜像。已保存凭据及飞书授权仍由 Host 管理。嵌入应用可提供可选统计回调，普通网页启动不提供此回调。

<a id="model-experience"></a>
## 模型体验

### 浏览器控制

#### 模型看到什么

`plugins.item` 配置页面不新增模型输入，打开配置不会执行连接器业务操作。

#### Token 影响

无；此浏览器页面不组装或发送模型请求。

#### KV 缓存影响

页面自身不改变提供方前缀，已保存的配置编辑可能改变其他插件提供的工具。


## 已知限制及后续工作

<a id="known-limitations-and-deferred-work"></a>

- 当前布局在返回插件页面时保留最近打开的详情。菜单、提示及终端输出沿用既有基础组件。不提供不变量伴随插件：浏览器拥有临时视图状态，Host 拥有持久化变更。

<a id="dev-note"></a>
### 开发备注

参见[迁移决策](../../../.agents/notes/implemented/feature/2026-10-13-native-plugin-management.zh.md)。
