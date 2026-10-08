---
description: "@deepseek-ai/dsh-tool-chat-records"
kind: "package-bundle"
---

# @deepseek-ai/dsh-tool-chat-records

[English](README.md) | 中文

## 概述

通过对话授权的宿主服务读取飞书机器人可见历史，或主动开启保存后的企业微信接收文字消息。平台凭证保存在宿主端。插件不提供发送、编辑或删除工具。

## 目录

- [使用此包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用此包

构建后通过 `dsh plugin --profile web add <local-built-package-directory>` 安装。空的配置补丁不会全局授予工具。在对话智能体预设中挂载实例，明确配置 `channel`、`endpoint`、`token`、`maxResultBytes`、`maxPageSize` 和 `timeoutMs`。两个平台分别使用此包的独立实例；安装只需要一个包依赖。授权信息存放于服务端私有配置，不进入浏览器可见设置或工作区。

宿主服务每次操作都必须重新检查已保存对话的所有者与绑定账号，拒绝调用方选择账号，并返回具有匹配 `channel` 和 `items` 数组的 JSON 分页。飞书使用官方机器人访问权限；企业微信读取明确开启保存后留存的消息。不允许重定向。取消与配置的超时会停止正在进行的读取。完整解码分页超过 UTF-8 字节上限时失败，不返回残缺历史。

<a id="model-experience"></a>
## 模型体验

### 聊天记录

#### 模型可见内容

生成的[列出与读取工具定义](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-chat-records)，以及包含账号名称、读取范围、消息或会话标识与分页信息的已记录 JSON 文本。原生 Web 工作区通过标准检查视图展示已持久化的工具文本。模型参数不包含平台凭证或账号选择。消息为参考资料，不是执行指令。

#### Token 影响

每个启用的平台贡献两个工具定义。只有明确读取且受大小限制的分页会增加历史 Token；消息不会预先加载至上下文。

#### KV Cache 影响

工具定义在同一对话组合中保持稳定。读取结果追加至历史。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 飞书提供文字正文及其他消息类型的元数据。企业微信提供宿主读取时间窗口内保存的接收文字消息，不包含开启前历史、发送的回复和会话存档。仅有凭证不会授予企业全部历史的权限。不发布 invariant 附件：工具注册来自同一插件 fiber，每次读取的分页授权由宿主执行。

<a id="dev-note"></a>
### 开发备注

参见[对话授权的渠道读取插件](../../../.agents/notes/implemented/feature/2026-10-08-conversation-channel-readers.zh.md)。
