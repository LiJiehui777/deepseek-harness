---
kind: upgrade-guide
description: "将已有增强版部署切换至飞书、企业微信官方插件。"
---
# 切换至飞书和企业微信官方插件

[English](guide.md) | 中文

## 变更

飞书和企业微信改用 DH 官方插件及其 CLI 授权方式。Flowable 企微节点沿用原动作标识及工作流输出结构。增强版自研连接器此前的机器人入站消息触发 DH 会话功能随之移除。

## 迁移

1. 备份增强版配置下的 `package.json` 和自定义 Cordis 覆盖配置。沿用原 DH 数据目录，以保留会话、工作流和其他设置。
2. 若配置的 bundle 列表里有 `@deepseek-ai/dsh-enterprise-connectors`、`@deepseek-ai/dsh-tool-feishu-connection` 或 `@deepseek-ai/dsh-tool-chat-records`，删除相应条目。移除自定义覆盖配置中指向这些旧包的条目，常见名称是 `enterprise-connectors` 和 `enterprise-authorization`。
3. 启动增强版，在**插件**页安装两个官方插件并分别完成 CLI 授权。此前的旧连接器账号需要重新授权。
4. 运行「企业微信待办整理」模板，确认第一页未完成待办能进入人工审核。
