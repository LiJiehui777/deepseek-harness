# Agent Note: 原生质量报告插件

Status: implemented

[English](2026-10-08-native-quality-report-plugin.md) | 中文

## 问题

业务方法包能指导分析，但不能注册原生工具或可回放结果卡片。平台还需要将安装和单个智能体的启用分开。

## 决策

可选的 [quality-report bundle](../../../../packages/interaction/tool-quality-report/README.zh.md) 提供 [Web card](../../../../packages/client/ui-quality-report/README.zh.md), 实际工具由获准的 Agent preset 挂载。RAGFlow 管理允许的插件与知识库绑定，检索继续走 MCP。

工具检查草稿完整性和内部证据编号，不核验模型提供的来源、不确认根因、不批准报告。卡片全部数据来自持久工具结果，回放不查询可变目录或业务服务。

## 考虑过的替代方案

单独的技能无法执行结构检查或注册原生卡片。进程全局工具会将能力授予共享进程的所有智能体，因此组合包将浏览器展示与 preset 工具注册分开。

## 影响

安装不会自动授予工具能力。检查结果一直是待人工审阅的草稿。插件不复制知识库内容，也不读取凭据。
