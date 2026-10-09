---
description: "@deepseek-ai/dsh-tool-feishu-connection"
kind: "package-bundle"
---

# @deepseek-ai/dsh-tool-feishu-connection

[English](README.md) | 中文

## 概述

为对话添加按需启用的飞书群聊、Docx/Wiki 和多维表格读取工具。通过原生插件命令安装构建后的插件包；默认部署配置不启用它。应用凭据与用户 OAuth 授权保留在宿主。空的部署补丁不提供全局工具，本插件不提供写操作。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

使用 `dsh plugin --profile web add <local-built-package-directory>` 安装。在获准的对话预设中挂载插件，并显式配置 `capabilities`（`chats`、`documents`、`bitable`）、`endpoint`、`token`、`maxResultBytes`、`maxPageSize` 和 `timeoutMs`。宿主令牌保留在私有服务端配置中，不放入工作区或浏览器设置。仅安装插件包不会暴露工具，宿主选择实例启用的能力。

宿主在每次读取时必须解析已保存的对话与连接，重新检查启用的能力和有效授权，并拒绝模型指定账号。应用身份与用户身份有不同访问范围；用户授权失败不能回退到应用身份。飞书成员关系、历史可见性、资源共享和多维表格高级权限继续生效。桥接服务返回带有 `channel: feishu` 和 `items` 数组的完整 JSON。

读取拒绝重定向，传递取消信号并执行配置的截止时间。完整 UTF-8 结果大小限制包含元数据；过大的页面和文档直接失败，不返回部分结果。原生 Web 标准工具查看器展示保存的文字。[宿主返回界面](../../client/ui-host-return/README.zh.md)将授权管理交由内嵌宿主处理。

<a id="model-experience"></a>
## 模型体验

### 选定的飞书读取能力

#### 模型能看到什么

生成的[工具 schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-feishu-connection)，以及带资源 ID、范围和分页的完整 JSON 文字。只有选定的能力提供工具。参数不包含 OAuth 令牌或账号选择。文档和消息只是参考资料，不能作为执行指令。

#### Token 影响

群聊提供两个 schema，文档一个，多维表格三个。只有显式读取的结果追加内容；连接不会预先加载资源。

#### KV Cache 影响

对话内的 schema 保持固定。读取结果追加到其历史中。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 文档只提供新版 Docx 与包含 Docx 的 Wiki 节点的完整纯文本。不下载图片、内嵌文件或多维表格附件；非文字聊天消息只返回元数据。不提供写操作或全公司历史访问。超大文档需要独立的分段读取能力。不发布 invariant companion：注册项由同一 fiber 派生，每次调用的权限由宿主检查。

<a id="dev-note"></a>
### 开发备注

参见[统一飞书连接](../../../.agents/notes/implemented/feature/2026-10-09-unified-feishu-connection.zh.md)。
