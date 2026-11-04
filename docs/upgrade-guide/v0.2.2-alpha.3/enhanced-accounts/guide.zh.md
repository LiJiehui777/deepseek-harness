---
kind: upgrade-guide
description: "增强版企业账号页面改为读取嵌套的插件配置条目，不再使用独立设置分节。"
---

# 增强版账号配置

[English](guide.md) | 中文

## 变更

增强版在 `enterprise-connectors` 插件配置条目的 `feishu`、`wecom` 和 `wecomOffice` 中配置飞书、企微消息及企微办公访问。原生插件页面保留独立账号表单。`ui-settings-connectors` 配套插件拥有这些表单；通用设置外壳不包含连接器实现。RAGFlow 保留 `ragflow-connector` 条目及已保存的知识库 ID。运行环境要求 Node.js 24.9 或更高版本，以及仓库固定的 pnpm 版本。

## 迁移

1. 停止使用目标数据目录的应用。完整备份该目录与 Flowable 数据卷。先使用独立目录及 Flowable 租户验证升级，再替换运行中的部署。
2. 使用 Node.js 24.9 或更高版本，安装锁定依赖，并通过 `pnpm run build:enhanced` 构建增强版客户端。
3. 设置原来的 `DSH_ENHANCED_HOME`，运行 `bash scripts/start-enhanced.sh`。DH 启动前，脚本将 `settings.yaml` 中三个增强版分节移入嵌套的企业条目。它按原始内容哈希保留私有备份，并在账号保存值冲突时拒绝迁移。随后原生设置导入器将结果存入插件配置。凭据引用与 RAGFlow 允许检索范围保持不变。
4. 使用随部署提供的 `enterprise-connectors`、`ragflow-connector` 条目标识，并启用 `ui-settings-connectors`，参见[中天覆盖配置](../../../../apps/cli/config/examples/ztt/cordis.yml)。在插件页面核对账号权限和知识库选择，再验证普通聊天不能启动工作流，手动选择的测试流程能等待审核并在通过后继续。

如果其他版本已导入 `settings.yaml`，先在隔离目录中从保留副本恢复增强版分节，再启动。不要用默认模板重置现有插件配置目录：该操作会替换其中的文件。
