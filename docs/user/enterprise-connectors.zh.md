---
kind: user-guide
description: "在 DH 增强版配置中安装和授权飞书、企业微信官方插件。"
---
# 飞书与企业微信

[English](enterprise-connectors.md) | 中文

## 安装与授权

在增强版 Web 界面的**插件**页，按需安装 `@deepseek-ai/dsh-feishu` 和 `@deepseek-ai/dsh-wecom`。飞书先关联应用，再通过 CLI 登录。企业微信扫描二维码绑定机器人。CLI 的授权保存在运行 DH 的系统账号下。企微官方支持 macOS 和 Windows x64。

## 运行企业微信工作流

在**工作流**中打开「企业微信待办整理」模板。`wecom.todos.list` 节点通过已绑定的机器人读取第一页未完成待办，最多 10 项。若从聊天发起，先发布流程，再在输入区手动选择。

## 升级现有配置

沿用当前 DH 数据目录，并按[升级说明](../upgrade-guide/v0.2.3-alpha.2/official-enterprise-connectors/guide.zh.md)调整。授权步骤及 CLI 细节见[飞书官方插件](../../packages/connector/feishu/README.zh.md)和[企业微信官方插件](../../packages/connector/wecom/README.zh.md)。
