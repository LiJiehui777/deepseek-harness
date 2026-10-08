---
description: "由宿主提供的 Web 工作台智能体身份。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-host-return

[English](README.md) | 中文

## 概述

这个双端 Web 插件让宿主应用把具体智能体而不是底层运行时作为主要产品身份。它会在侧边栏品牌行添加紧凑的宿主返回按钮，替换侧边栏标记与名称，定制空白会话欢迎区和浏览器标题，并显示已选择的知识来源。点击侧边栏智能体名称会打开全部已绑定知识库的紧凑只读列表，不提供设置或编辑操作。Node 端校验 Loader 行配置并通过结构化 Web 启动表投射给页面，浏览器端在注册界面贡献前再次校验。配置不完整或无效时，插件不渲染任何内容。

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

静态客户端条目只按包名组装，并不会把 Host Loader 配置复制进浏览器 Loader。因此本包通过 `webserver/index-inject` 的全局数据行传递校验后的值，并在认证页面启动时读取。

<a id="extension-points"></a>
## 扩展点

插件占用 `sidebar.brand.action`、`sidebar.brand.mark`、`sidebar.brand.name`、`conversation.hero.brand.mark`、`conversation.hero.identity` 和 `shell.document-title`。返回按钮位于展开状态品牌行的智能体身份之前，并导航顶层浏览器上下文，因此 Web 嵌入 iframe 时也能正常返回。智能体名称浮层只负责展示，可通过 Esc 或点击外部关闭，且绝不会修改由宿主持有的绑定关系。它不声明子插槽，也不持有持久状态。

<a id="model-experience"></a>
## 模型体验

无，因为该身份界面不会改变模型上下文或请求。

#### KV Cache 影响

无。该插件不组装或发送提供方请求。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- 品牌信息在 Web 进程启动时配置；修改它需要刷新 Loader 行或重启进程。

<a id="dev-note"></a>
### 开发备注

集成决定记录在 `.agents/notes/implemented/feature` 下的 host-return Agent Note 中。

未发布不变量配套文档，因为这个展示插件不持有持久状态。
