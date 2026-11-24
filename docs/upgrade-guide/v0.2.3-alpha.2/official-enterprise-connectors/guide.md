---
kind: upgrade-guide
description: "Switch an enhanced deployment to the official Feishu and WeCom plugins."
---
# Switch to the official Feishu and WeCom plugins

English | [中文](guide.zh.md)

## Change

Feishu and WeCom now use the official DH plugins and their CLI account flows. The Flowable WeCom action keeps its action ID and workflow result shape. Incoming bot messages no longer start DH sessions through the enhanced connectors.

## Migration

1. Back up the enhanced profile’s `package.json` and custom Cordis overlays. Continue using the same DH data directory, which holds conversations, workflows and other settings.
2. Remove `@deepseek-ai/dsh-enterprise-connectors`, `@deepseek-ai/dsh-tool-feishu-connection`, and `@deepseek-ai/dsh-tool-chat-records` from the profile’s bundle list if present. Remove any manually configured rows for these old packages from custom overlays, typically `enterprise-connectors` and `enterprise-authorization`.
3. Start the enhanced profile. Install the two official plugins in **Plugins** and authorize each CLI account. The old connector credentials require a new authorization.
4. Run the WeCom todo review template and verify that the first page of pending tasks reaches the review screen.
