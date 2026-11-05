# 中天质量智能体 / DH Enhanced

[English](README.md) | 中文

`dev` 分支运行我们当前的增强版 DeepSeek Harness，提供独立对话、Flowable 工作流、人工审核、企业连接器和可选的 RAGFlow 检索。本指南说明这套系统的环境要求和源码启动方式。

模型、会话、工作区和凭证由 DH 管理。RAGFlow 是按需连接的外部知识服务，启动 DH 和运行内置 Flowable 接入验证不需要先部署 RAGFlow。

<a id="requirements"></a>

## 环境要求

DH 可以在 Windows 原生环境或 WSL 2 中运行，WSL 2 是可选项，已有 Windows 部署可以继续使用原环境。请将仓库、Node.js 和依赖保存在同一个操作系统环境内，并为不同环境分别安装依赖。平台准备详见[开发指南](docs/development.zh.md)。

下面的示例使用 Bash，当前 `build:enhanced` 和 `start:enhanced` 脚本也依赖 Bash。Windows 原生用户需使用能够调用 Windows Node.js 的 Bash 环境，或适配构建和启动脚本；仓库尚未提供专用 PowerShell 入口。增强版完整启动流程尚未在原生 Windows 上验证。

| 组件 | 要求 | 什么时候需要 |
|---|---|---|
| Node.js | **24.9.0 或更高**；建议使用 24.x 系列 | DH 运行与构建 |
| pnpm | **11.28.5**，以 `package.json` 固定版本为准 | 安装依赖与运行命令 |
| Git | 2.26 或更高 | 拉取代码和开发钩子 |
| 原生构建工具 | C/C++ 编译器、`make` 及 Node 开发头文件；macOS 使用 Xcode Command Line Tools | 源码构建与原生依赖 |
| Python 3 | 依赖回退到 node-gyp 编译时需要可用 | 按需编译原生依赖 |
| Docker 与 Compose v2 | Docker 引擎可用，并能执行 `docker compose`；仓库固定 Flowable 8.0.0 | 工作流真实执行 |
| 模型访问 | 有效的模型账号/API Key，并能访问相应服务 | 对话和 DH 分析节点 |
| 企业/RAGFlow 账号 | 按实际需要配置对应服务 | 可选连接器 |

Node 必须支持原生 TypeScript 加载，不要在 `NODE_OPTIONS` 中设置 `--no-experimental-strip-types`。源码构建会查找 Node 安装目录下的 `include/node/node_api.h`，只复制一个 Node 可执行文件而没有开发头文件还不够。

```bash
node --version
pnpm --version
git --version
```

<a id="run"></a>

<a id="quick-start"></a>

## 首次安装与启动

新机器按以下步骤操作。已有部署继续使用原数据目录，已存在的配置不要重新初始化。

<a id="run-from-source"></a>

<a id="clone"></a>

### 1. 拉取 dev 分支

```bash
git clone --branch dev --single-branch https://github.com/LiJiehui777/deepseek-harness.git deepseek-harness-enhanced
cd deepseek-harness-enhanced
```

<a id="install-and-build"></a>

### 2. 安装依赖并构建增强版

```bash
pnpm install --frozen-lockfile
pnpm run build:enhanced
```

增强版构建会准备原生模块、Host、Client 和 Web 产物，并使用质量智能体标识。更新源码后重新构建；日常重启可以复用已有产物。

<a id="initialize-profile"></a>

### 3. 首次初始化 enhanced 配置

`enhanced` 是自定义配置。全新的 DH 数据目录需要先从内置 Web 模板复制一次。下面的判断会保留已有配置。`--from-default-profile` 会替换目标配置，因此不要去掉判断后对已有部署反复执行。

```bash
export DSH_ENHANCED_HOME="$PWD/.local/enhanced-home"
if [ ! -d "$DSH_ENHANCED_HOME/profiles/enhanced" ]; then
  DSH_HOME="$DSH_ENHANCED_HOME" pnpm dsh --profile enhanced --from-default-profile web --dump-config > /dev/null
fi
```

首次启动前，打开 `.local/enhanced-home/profiles/enhanced/package.json`（自定义目录时使用对应位置）。Web 模板只有下面前两项，请在 `dsh.profile.bundles` 中追加后三个增强版包，使新配置包含以下列表。保留文件中的其他字段；已有部署还要保留自己已使用的其他包。

```json
[
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "@deepseek-ai/dsh-plugin-management",
  "@deepseek-ai/dsh-tool-ragflow-connector",
  "@deepseek-ai/dsh-enterprise-connectors"
]
```

<a id="start-flowable"></a>

### 4. 配置并启动 Flowable

工作流真实执行需要 Flowable。首次生成一份本地私有密码文件，容器和 DH 使用同一份密码；已有文件会保留原密码。只体验普通聊天时可跳过本步，直接启动 DH，不必加载引擎密码文件。

```bash
mkdir -p .local/flowable
if [ ! -f .local/flowable/engine.env ]; then
  (umask 077; node -e 'console.log("DH_FLOWABLE_PASSWORD=" + require("node:crypto").randomBytes(24).toString("hex"))' > .local/flowable/engine.env)
fi
docker compose --project-name dh-flowable --env-file .local/flowable/engine.env -f packages/business-workflow/workbench/engine/compose.yml up -d
```

引擎的 REST 地址为 `http://127.0.0.1:8082/flowable-rest/`，用户名为 `dh-workflow`，数据库保存在 Compose 命名卷中。DH 的地址、用户名和租户由[增强版覆盖配置](apps/cli/config/examples/ztt/cordis.yml)提供；更改引擎端口时也要同步修改其中的 `baseUrl`。

<a id="start-dh"></a>

### 5. 启动 DH

在仓库根目录把引擎密码加载到当前终端，再启动 DH。Docker Compose 读取环境文件不会自动把变量导出给当前终端。

```bash
set -a
source .local/flowable/engine.env
set +a
pnpm run start:enhanced
```

DH 监听 `http://127.0.0.1:3001/`。首次访问请打开终端打印的完整地址，其中包含本机访问凭据。启动命令会持续在前台运行，不会自动打开浏览器。

<a id="configure-model-and-connectors"></a>

### 6. 配置模型与可选连接器

首次进入时先选择一个本地工作区目录，再完成模型配置，然后发送对话请求或运行分析节点。API Key 由原生凭证服务管理，也可以通过私有环境提供 `DEEPSEEK_API_KEY`。内置的数据传递和人工确认接入验证不需要模型密钥。

上面的增强版列表包含插件管理和两类连接器包。启动后在「插件」页配置对应账号；各账号连接在配置并开启前仍保持关闭。选中插件包本身不等于完成账号授权。

- [飞书与企业微信](docs/user/enterprise-connectors.zh.md)：分别配置账号，以及资源和消息来源权限。
- [RAGFlow](docs/user/ragflow-connector.zh.md)：准备单独运行的服务、API Key 和需要检索的知识库。

<a id="verify-workflow"></a>

## 验证工作流

先使用接入验证模板，再配置模型体验模拟待办风控演示。人工审核在 DH 内完成。

1. 打开「工作流」，使用「Flowable 接入验证」模板检查引擎、数据传递、人工审核和等待步骤。
2. 如需由 Agent 启动，先保存草稿并发布，再在会话输入框附近手动选择这个发布版本。
3. 发送执行需求。选择本身不启动实例，普通聊天不能启动新工作流。
4. 在发起会话或工作流页面核对该节点保存的准确输入并审核。DH 等待期间不轮询模型，通过后继续执行。
5. 「企业微信待办风控演示（模拟）」需要 `scenario=risk` 或 `scenario=routine`；它不访问企微，但 DH 分析节点仍需可用模型。

完整行为见[工作流说明](packages/business-workflow/workbench/README.zh.md)。MES、SDCC、EIP 的实际业务动作仍需实现连接器，模板不等于已经打通这些系统。

<a id="daily-use-and-data"></a>

## 日常使用与数据位置

重启时加载上述密码文件并执行 `pnpm run start:enhanced`，继续使用同一个数据目录。源码没有变化时无需重复初始化或构建；更新源码后安装锁定依赖并重新构建增强版产物。

| 项目 | 默认值 |
|---|---|
| DH Web | `127.0.0.1:3001` |
| Flowable REST | `127.0.0.1:8082/flowable-rest/` |
| DH 配置、凭证与会话历史 | `.local/enhanced-home/` |
| 引擎私有密码文件 | `.local/flowable/engine.env` |
| 工作流引擎数据库 | Compose 命名卷 `dh-flowable_engine-data` |

启动器支持 `DSH_ENHANCED_PORT` 修改 DH 端口、`DSH_ENHANCED_HOME` 修改数据目录、`DSH_ENHANCED_NODE` 指定支持的 Node 可执行文件。初始化命令使用 `DSH_HOME`，请确保初始化的目录与启动器一致。若存在项目私有的 `.local/runtime/node`，且没有显式指定 Node，启动器会优先使用它。

按 Ctrl+C 停止前台 DH 进程。停止引擎使用下面的命令，数据库卷会保留。

```bash
docker compose --project-name dh-flowable --env-file .local/flowable/engine.env -f packages/business-workflow/workbench/engine/compose.yml stop
```

升级或迁移机器前，一并备份 DH 数据目录、引擎密码文件和引擎数据卷。不要删除数据卷或重新生成已有数据库的密码。这些数据和凭证不随 Git 仓库分发。

<a id="troubleshooting"></a>

## 常见问题

| 现象 | 检查项 |
|---|---|
| Node 版本或原生模块构建失败 | Node >=24.9、C/C++ 工具和匹配的 Node 开发头文件 |
| `profile "enhanced" does not exist` | 在同一个 DH 数据目录完成带判断保护的首次初始化 |
| Flowable 不可用或鉴权失败 | Docker 引擎/容器、8082 端口，以及 DH 与 Compose 是否使用相同且已导出的 `DH_FLOWABLE_PASSWORD` |
| 模型请求失败 | 模型选择、账号/API Key 和服务可访问性；页面能打开不等于模型已连通 |
| 找不到账号卡片 | 检查增强版包列表是否包含插件管理和两类连接器包 |
| 浏览器无法访问 | 使用终端打印的完整启动地址，检查 3001 端口是否被其他进程占用 |

<a id="development"></a>

<a id="contributing"></a>

## 开发入口

- 遵循 [AGENTS.md](AGENTS.md) 和[技术迭代记录](技术迭代记录.md)，后续开发继续使用 `dev`。
- 新增连接器时调用项目技能 [dsh-build-connector](.agents/skills/dsh-build-connector/SKILL.md)。
- DH 通用开发说明见[架构](docs/architecture.zh.md)与[开发指南](docs/development.zh.md)。

<a id="license"></a>

## 项目来源与许可

基于开源 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 和 Cordis 插件架构开发，当前仍为开发预览，请阅读[安全说明](SAFETY.zh.md)。项目采用 [MIT 许可](LICENSE)，依赖声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
