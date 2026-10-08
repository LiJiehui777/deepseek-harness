# Agent Note: 由宿主管理对话创建

Status: implemented

[English](2026-10-08-host-owned-conversation-creation.md) | 中文

## 问题

独立 RAGFlow 工作台需要逐对话选择参考知识库。原生新会话操作之前复用了运行中的 Web 进程及其固定绑定，绕过了资源选择。

## 决策

Workspace UI 在用户新会话导航前发出可选的类型化 bail 事件。配置了经过同源验证的 `newConversationUrl` 时，host-return 监听器接管操作并要求 iframe 父页面打开创建流程；独立页面则跳转到该地址。通知只携带操作名；宿主验证来源与发送窗口。

宿主创建私有对话记录，并启动各自隔离的 Web home。知识库 ID 与模型连接仍由服务端管理。初次连接 Workspace 不会被这个用户操作钩子拦截。独立工作台的 home 启用 `ui-workspace.resumeRecentSession`，重开对话时恢复最近的非空 Session；原生嵌入场景保留空会话启动。

## 考虑过的替代方案

共享 Web 进程不能通过仅用于展示的品牌信息安全地改变单个 Session 的知识范围。创建隐藏的 RAGFlow 智能体会保留原有依赖，并混淆对话归属。

## 影响

RAGFlow 可以将工作台放在首页旁，按对话绑定知识。现有嵌入方不提供可选地址时仍使用原生会话创建。Cordis 释放 owner 时注销监听器；取消宿主窗口时保留当前对话。此钩子既不持久化状态，也不修改模型上下文。
