---
description: "在原生插件页面配置已保存的 RAGFlow、飞书和企业微信账号。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-connectors

[English](README.md) | 中文

## 概述

在插件页面选择 RAGFlow 知识库、授权飞书资源读取，或连接企微办公账号。账号控件保留暂存修改，直到用户明确保存；凭据保持只写。Host 提供相应账号配置时，才显示该页面。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

[中天覆盖配置](../../../apps/cli/config/examples/ztt/cordis.yml)启用本配套插件。账号权限、授权及资源范围仍由[企业连接器](../../interaction/enterprise-connectors/README.zh.md)及 [RAGFlow 连接器](../../interaction/tool-ragflow-connector/README.zh.md)管理。打开页面不会授予权限或发起授权。服务地址与凭据修改后，先保存再加载知识库目录；加载名称不会改变检索允许范围。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本配套插件通过插件页面插槽提供账号表单，并通过共享配置表单服务读取已保存设置。它拥有暂存草稿、账号状态轮询及凭据是否存在的投影。插件释放时移除页面、词典、订阅和未完成轮询。设置外壳不拥有连接器代码。平台图标使用可选的按条目标识查找的插槽，缺省时保留管理页面的内置图标。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [插件管理](../ui-plugin-manager/README.zh.md)——配置页面与账号图标。
- [共享配置表单](../ui-settings/README.zh.md)——带版本检查的写入及 Host 设置镜像。

-----

<a id="model-experience"></a>
## 模型体验

通过已保存账号设置间接影响后续连接器工具及资源范围；这些表单不创建模型请求。

#### KV 缓存影响

表单不组装模型请求。连接器配置可能改变后续请求可用的工具。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 一个 DH 数据目录共享账号配置。这些页面不提供按会话独立的账号，也不授予各平台已保存权限之外的访问能力。

<a id="dev-note"></a>
### 开发备注

无。
