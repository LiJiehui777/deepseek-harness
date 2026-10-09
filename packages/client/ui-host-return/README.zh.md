---
description: "由宿主提供的 Web 工作台智能体身份与服务连接账号管理。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-host-return

[English](README.md) | 中文

## 概述

在内嵌 Web 工作台显示配置的智能体名称、侧边栏身份、欢迎信息与浏览器标题。用户可以返回宿主，并在只读浮层查看已绑定知识库。可选的宿主新建会话流程会在清空 Session 前交由宿主选择资源。原生「设置 → 插件 → 服务连接」显示飞书和企业微信账号状态，并在保留 Session 和草稿的同时打开账号管理。配置无效时不渲染内容。

## 目录

- [Configuration](#configuration)
- [Extension points](#extension-points)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="configuration"></a>
## 配置

```yaml
- id: ui-host-return
  config:
    returnUrl: http://localhost:9222/agents
    hostName: RAGFlow
    agentName: Product Knowledge Assistant
    workspaceName: Agent Workspace
    datasetNames: [Product Manual, FAQ]
```

`returnUrl` 只接受不含内嵌凭据、长度不超过 2048 字符的绝对 HTTP(S) 地址。嵌入方仍负责选择有权限的目标地址。`agentName` 必填并成为主要身份；`hostName`、`workspaceName` 和 `datasetNames` 仅用于显示。知识来源最多 100 个，每个名称最多 128 个字符。

可选的 `newConversationUrl` 会在清空或创建本地 Session 前，将新会话流程交给嵌入方。它必须是与 `returnUrl` 同源的绝对 HTTP(S) 地址。iframe 会向该源发送 `{ type: 'ragflow.workbench.new-conversation' }`；父页面必须验证发送窗口和来源，再打开资源选择窗口。独立页面则跳转到配置的地址。不提供此值时保留原生新会话行为；通知不携带知识库 ID、凭据或权限。

可选的 `channelManagementUrl` 启用「服务连接」标签页，URL 与同源限制和 `newConversationUrl` 相同。内嵌标签页通过 `ragflow.workbench.channel-status-request` 请求账号元数据；父页面验证发送方后，以 `ragflow.workbench.channel-status` 返回恰好两个平台条目，包括渠道、已配置账号数量、启用状态和可选的绑定账号名称。标签页验证父窗口、宿主来源与有界元数据。点击「管理账号」会发送 `ragflow.workbench.manage-channel`，仅包含 `feishu` 或 `wecom`；宿主以浮层打开已有认证账号表单，不替换 iframe。关闭浮层会刷新元数据，保留当前原生 Session 和未发送草稿。独立页面则跳转至配置地址并附加 `channel` 查询参数。这个投射不包含平台凭据或工具授权。新建宿主对话时选择插件及账号；设置不会静默修改已有对话的绑定。

静态客户端条目只按包名组装，并不会把 Host Loader 配置复制进浏览器 Loader。因此本包通过 `webserver/index-inject` 的全局数据行传递校验后的值，并在认证页面启动时读取。

<a id="extension-points"></a>
## 扩展点

插件占用 `sidebar.brand.action`、`sidebar.brand.mark`、`sidebar.brand.name`、`conversation.hero.brand.mark`、`conversation.hero.identity` 和 `shell.document-title`。配置账号管理时，还会在 `settings.plugins.tab` 注册 `chat-services` 贡献。返回按钮位于展开状态品牌行的智能体身份之前，并导航顶层浏览器上下文，因此 Web 嵌入 iframe 时也能正常返回。智能体名称浮层只负责展示，可通过 Esc 或点击外部关闭，且绝不会修改由宿主持有的绑定关系。它不声明子插槽，也不持有持久状态。

<a id="model-experience"></a>
## 模型体验

无，因为该身份界面不会改变模型上下文或请求。

#### KV Cache 影响

无。该插件不组装或发送提供方请求。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- 账号状态需要已认证的嵌入方；独立页面仅提供导航。
- 品牌信息在 Web 进程启动时配置；修改它需要刷新 Loader 行或重启进程。

<a id="dev-note"></a>
### 开发备注

集成决定记录在 `.agents/notes/implemented/feature` 下的 host-return Agent Note 中。

未发布不变量配套文档，因为这个展示插件不持有持久状态。
