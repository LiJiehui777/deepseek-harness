---
description: "独立飞书和企业微信授权、原生工具与远程 DH 任务。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-enterprise-connectors

[English](README.md) | 中文

## 概述

独立 DH 的可选企业连接，使用 MIT 许可的官方[飞书 SDK](https://github.com/larksuite/node-sdk) 和[企业微信 SDK](https://github.com/WecomTeam/aibot-node-sdk)。[工具子系统](../../../docs/subsystems/tools.zh.md)维护生成的 API 参考；[用户指南](../../../docs/user/enterprise-connectors.zh.md)维护账号配置步骤。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用本包

组合包挂载一个 Host 服务，安装独立的 `feishu-connector` 和 `wecom-connector` 设置区。两个账号默认禁用。密钥通过 `ctx.credentials` 解析；设置和 Remote 响应只包含引用及是否已配置的信息。原生插件页面暂存修改，并提供已保存账号的连接检查。SDK 诊断日志关闭，避免原始错误包含凭据。飞书 HTTP 请求拒绝重定向，支持取消，并在发布工具结果前限制响应字节数。

飞书使用企业自建应用的 App ID 和 App Secret。工具列出 API 可见会话、读取文本消息历史和 Docx/Wiki 文档，并向明确允许的会话发送消息。平台成员关系、资源分享和 API 权限继续生效。企业微信使用智能机器人的 Bot ID 和 Secret，通过官方 WebSocket 协议连接。读取工具仅提供本次连接接收并在内存中限量保留的消息，不提供企业全部存档或更早的群历史。

`receiveEnabled` 仅允许 `allowedSenders` 中的用户派发任务；发送者列表为空时拒绝全部任务。可选 `allowedChats` 进一步限制接收和读取范围。私聊及飞书中明确 @当前机器人的消息可触发任务。状态展示最近发送者和会话 ID，便于显式授权，不保留未授权消息正文。每个平台会话按发送者绑定独立 DH 对话和专用工作目录；标准智能体预设沿用模型、知识库、沙箱和确认行为。原生请求 ID 防止已接收消息重复执行。回复选取从消息进入会话到整个智能体空闲期间的最后助手文本；这一期间的本地追问也可能影响结果。

模型主动发送必须同时启用 `sendEnabled` 并明确列出目标会话，且需要 DH 单次确认。已授权任务的回复返回原会话。无法确定投递结果的发送失败不会自动重试。消息字节数、保留消息数、等待任务数、HTTP 请求和任务等待均有部署上限。重新配置会取消旧连接代次；卸载停止 SDK 连接并等待已有任务结束。取消回复等待不会改变普通 DH 智能体原有的生命周期。

<a id="model-experience"></a>

飞书的 `readIdentity` 选择应用身份或用户身份读取。用户授权使用原生授权服务、同一浏览器的启动 cookie、一次性 state 和 PKCE S256。宿主将授权凭证保存在 `ctx.credentials`，通过 `modifyRecord` 串行轮换刷新令牌。用户授权缺失、过期或权限不足时会报错，不会回退为应用身份。账号变更会取消未完成的授权和读取；解除授权删除本地凭证。同一个 DH 主目录共享这份用户授权，包括已获准的远程任务。机器人接收、回复和主动发送仍使用应用身份。

## 模型体验

### 企业工具与远程任务

#### 模型看到什么

七个固定原生工具定义（包括 `feishu_read_document`）提供飞书会话/文档读取、企业微信已接收消息读取，以及两个平台的发送操作。资源结果是参考资料，不是执行指令。远程输入包含平台、会话和发送者 ID，并进入原生用户消息记录流程。凭据不会进入工具参数或结果。

#### Token 影响

只有显式请求且有大小上限的资源内容进入工具结果。远程消息成为普通会话输入；SDK 心跳和连接状态不消耗模型 Token。

#### KV Cache 影响

工具定义保持固定。读取和任务回复通过普通 Session 事件追加；账号设置不会重写已有会话内容。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- 每个 DH 数据目录对每个平台共享一个账号。多维表格/日历写入、媒体传输和 IM 内确认按钮延期。应用凭据不会获得个人账号全部可见范围。企微历史限量保存在内存中，重连时清除；企业会话存档需要单独授权的提供方。连接状态只用于提示，不是独立授权来源，因此不发布 invariant companion。

### 开发备注

参见[独立企业连接器](../../../.agents/notes/implemented/feature/2026-10-13-standalone-enterprise-connectors.zh.md)。
