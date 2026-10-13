---
description: "通过原生 Remote 方法管理当前配置中的插件包及 Loader 条目。"
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-manager

[English](README.md) | 中文

## 概述

通过原生 Remote 方法管理当前配置中的插件包及 Loader 条目。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制及后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

在增强版配置中打开「插件」。可安装兼容的 npm 包、Git 源码或本地插件包；批准前查看来源及请求运行的构建脚本。插件包须声明 `dsh.bundle.patch`。

<a id="understand-the-implementation"></a>
## 理解实现

配置清单保存插件包选择，用户补丁保存条目开关。实时配置串行执行编辑及监听重载，刷新模块链接并重新组合根 Include。仅启动时应用的配置提示需要重启。更高优先级覆盖层可覆盖已保存开关，管理依赖不能禁用自身。安装失败恢复清单及锁文件，已下载文件可能保留。

<a id="model-experience"></a>
## 模型体验

### 管理工具

#### 模型看到什么

`./tools` 导出的可选 `plugin_manager` 工具列出条目及插件包并返回配置变更结果。增强版管理组合包仅挂载 GUI 服务，默认不新增模型工具。

#### Token 影响

挂载可选工具会增加工具声明，每次调用追加返回的清单或变更结果。

#### KV 缓存影响

工具结果追加到会话记录，连接器工具的启停可能改变后续工具声明及缓存复用。


## 已知限制及后续工作

<a id="known-limitations-and-deferred-work"></a>

- 本次迁移不增加上游 CLI 插件子命令，也不升级整个运行时。不提供不变量伴随插件：覆盖层或仅启动时应用的配置可使磁盘期望状态与 Loader 实际状态有意不同，变更结果展示这种差异。

<a id="dev-note"></a>
### 开发备注

参见[迁移决策](../../../.agents/notes/implemented/feature/2026-10-13-native-plugin-management.zh.md)。
