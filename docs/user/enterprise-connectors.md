---
kind: user-guide
description: "Install and authorize the official Feishu and WeCom plugins in the DH enhanced profile."
---
# Feishu and WeCom

English | [中文](enterprise-connectors.zh.md)

## Install and authorize

Open **Plugins** in the enhanced Web profile and install `@deepseek-ai/dsh-feishu` and `@deepseek-ai/dsh-wecom` as needed. Feishu links an app, then signs in with the CLI. WeCom binds a bot by scanning its QR code. The CLI tools store their authorization under the account running DH. WeCom officially supports macOS and Windows x64.

## Run a WeCom workflow

In **Workflow**, open the WeCom todo review template. The `wecom.todos.list` step reads the first page of pending todos through the connected bot, up to 10 items. Publish the workflow and select it in the chat composer if you want to start it from chat.

## Upgrade an existing profile

Keep the current DH home and follow the [upgrade guide](../upgrade-guide/v0.2.3-alpha.2/official-enterprise-connectors/guide.md). For account setup and CLI details, see the [official Feishu plugin](../../packages/connector/feishu/README.md) and [official WeCom plugin](../../packages/connector/wecom/README.md).
