# 独立 DH 与 RAGFlow 连接器

[English](ragflow-connector.md) | 中文

增强版 DH 是独立应用。DH 管理自己的模型、会话、工作区和凭证；RAGFlow 管理知识库、索引和检索。RAGFlow 是一个原生连接器，沿用 DH 插件生命周期。连接器直接调用 RAGFlow 公开 REST API，不依赖内嵌页面、RAGFlow 智能体、MCP 或 Harness Runtime Gateway。知识库保留在 RAGFlow，实际检索证据会保存在使用它的 DH 对话中。

## 启动

单独启动现有 RAGFlow 服务，默认 API 地址为 `http://localhost:9380`。在增强版目录运行：

```bash
pnpm install --frozen-lockfile
pnpm run build:enhanced
pnpm run start:enhanced
```

打开 `http://127.0.0.1:3001`。启动入口使用独立且不纳入 Git 的 `.local/enhanced-home` 保存配置、凭证和会话。通过 `DSH_ENHANCED_HOME` 修改保存目录，通过 `DSH_ENHANCED_PORT` 修改端口。在 DH 设置中配置模型。启动入口不会从融合版导入模型或用户凭证。

## 连接

1. 在 RAGFlow 账号的 API 设置中获取 API Key。
2. 打开 DH 侧栏 → 插件 → RAGFlow 连接器。
3. 填写 RAGFlow 服务根地址和 API Key，勾选启用连接并保存。密钥由 DH 凭证服务保存，设置返回值和工具结果不含已保存的密钥明文。也可设置环境变量 `RAGFLOW_API_KEY`，此时页面中的密钥为只读。
4. 点开**允许检索的知识库**，滚动或搜索已加载的名称，勾选一个或多个知识库并保存。**加载更多**追加下一页，**刷新列表**重新读取名称。未选择时只能查看列表；选择后，智能体的列表和检索都限制在所选范围内。
5. 对 DH 说：“从已连接的 RAGFlow 知识库检索检验要求，注明文档名和 chunk ID。”原生工具详情展示实际结果。服务离线或密钥无效时显示连接器错误；DH 的普通对话可以独立运行。

此独立本地 DH 目录中的所有对话使用当前连接设置。修改知识库范围会影响后续调用，包括已有对话的调用。RAGFlow 自身的 API Key 权限继续生效。连接器只读，不创建知识库或上传文档。知识库列表分页返回，`has_more` 为真时可要求下一页。

修改服务地址或 API Key 后，请先保存再加载目录。设置选择器列出已保存 API Key 授权的所有知识库，包括当前检索范围以外的库。配置只保存所选 ID。尚未加载名称的已选 ID 仍保留选中状态并可取消；加载失败保留原有选择。

## 其他连接器

增强版启动器还挂载独立的[飞书和企业微信连接器](enterprise-connectors.zh.md)。在同一原生插件页配置各自凭据和发送者范围。它们可独立于 RAGFlow 运行；只有另行启用 RAGFlow 连接器时，远程任务才使用其知识服务。

实现决定见 [独立知识连接器](../../.agents/notes/implemented/feature/2026-10-09-standalone-ragflow-connector.zh.md)。
