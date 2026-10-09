---
description: "@deepseek-ai/dsh-tool-ragflow-connector"
kind: "package-bundle"
---

# @deepseek-ai/dsh-tool-ragflow-connector

[English](README.md) | 中文

## 概述

用于独立部署 RAGFlow 服务的可选原生知识连接器。

## 目录

- [使用此包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>

## 使用此包

通过公开的 `/api/v1/datasets` 和 `/api/v1/retrieval` API 将独立 DH 连接到 RAGFlow。原生包挂载连接器，设置默认关闭。[用户说明](../../../docs/user/ragflow-connector.zh.md)介绍启动和配置。`baseURL`、`apiKeyEnv`、`datasetIds`、`enabled`、`maxChunks`、`maxPageSize`、`maxResultBytes`、`timeoutMs` 都由配置模式校验。每次调用通过 `ctx.credentials` 解析凭证，插件配置和工具参数不接受密钥明文。

服务端执行时重新检查知识库范围，空选择只允许列出知识库。请求拒绝重定向，传递取消信号和超时，隐藏提供方错误详情，并限制完整 HTTP 响应和最终 UTF-8 结果。列表只暴露 ID 和名称，检索只投射内容和引用标识。返回越界片段时拒绝整个结果。原生工具详情展示已记录文本，插件卸载时移除注册。

<a id="model-experience"></a>

## 模型体验

### 知识工具

#### 模型看到什么

`ragflow_list_datasets` 列出知识库，`ragflow_retrieval` 检索证据。结果含文档名和片段 ID，检索文本是参考资料，不是执行指令。API Key 不暴露给模型。

#### Token 影响

两个固定工具模式，以及明确请求且有大小限制的结果进入模型上下文。

#### KV Cache 影响

工具模式保持稳定，知识证据通过原生工具结果记录流程追加到历史。

<a id="known-limitations-and-deferred-work"></a>

## 已知限制与后续工作

- 一个本地 DH 数据目录中的所有对话共享实时连接和知识库范围。按对话选择、多 RAGFlow 账号和知识写入留待后续。知识库列表先分页再进行本地过滤。不发布不变量配套插件，因为工具和实时配置由一个所有者管理，每次调用先校验外部响应再发布证据。飞书和企业微信独立授权属于其他提供方。

### 开发备注

见 [独立 RAGFlow 连接器](../../../.agents/notes/implemented/feature/2026-10-09-standalone-ragflow-connector.zh.md)。
