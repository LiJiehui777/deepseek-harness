# 中天质量智能体 / DH Enhanced

English | [中文](README.zh.md)

The `dev` branch runs our enhanced DeepSeek Harness: independent chat, Flowable workflow execution, human review, enterprise connectors, and optional RAGFlow retrieval. This guide starts that deployment from source.

The model, Sessions, workspaces and credentials belong to DH. RAGFlow is an optional external knowledge service; it is not required to start DH or the built-in Flowable connection check.

<a id="requirements"></a>

## Requirements

DH can run in native Windows or WSL 2; WSL 2 is optional. Existing Windows deployments can retain their environment. Keep the checkout, Node.js and dependencies in the same operating system environment, and install dependencies separately for each environment. See the [development guide](docs/development.md) for platform setup.

The examples below use Bash, and the current `build:enhanced` and `start:enhanced` scripts also require Bash. Native Windows users need a Bash environment that invokes Windows Node.js, or adapted build and startup scripts; the repository does not provide a dedicated PowerShell entry point. The enhanced startup procedure has not been fully validated on native Windows.

| Component | Requirement | When needed |
|---|---|---|
| Node.js | **24.9.0 or newer**; prefer the 24.x series | DH and builds |
| pnpm | **11.28.5**, as pinned in `package.json` | Dependency installation and commands |
| Git | 2.26 or newer | Clone and development hooks |
| Native build tools | C/C++ compiler, `make`, and Node development headers; macOS uses Xcode Command Line Tools | Source build and native dependencies |
| Python 3 | Available when a dependency falls back to a node-gyp build | Conditional native dependency builds |
| Docker and Compose v2 | A working Docker engine and `docker compose`; the repository pins Flowable 8.0.0 | Real workflow execution |
| Model access | A valid model account/API key and access to its service | Chat and DH analysis nodes |
| Enterprise/RAGFlow accounts | Configure only the services you intend to use | Optional connectors |

Check that Node supports native TypeScript loading; do not set `--no-experimental-strip-types` in `NODE_OPTIONS`. Source builds locate `include/node/node_api.h` next to the Node installation, so a standalone Node executable without its development headers is insufficient.

```bash
node --version
pnpm --version
git --version
```

<a id="run"></a>

<a id="quick-start"></a>

## Quick start

Run the following steps from a new checkout. Existing deployments should retain their data directory and skip the initialization when it already exists.

<a id="run-from-source"></a>

<a id="clone"></a>

### 1. Clone dev

```bash
git clone --branch dev --single-branch https://github.com/LiJiehui777/deepseek-harness.git deepseek-harness-enhanced
cd deepseek-harness-enhanced
```

<a id="install-and-build"></a>

### 2. Install and build

```bash
pnpm install --frozen-lockfile
pnpm run build:enhanced
```

The enhanced build prepares the native, Host, Client and Web outputs with the quality-agent identity. Rebuild after source updates; ordinary restarts can reuse the outputs.

<a id="initialize-profile"></a>

### 3. Initialize the enhanced profile once

`enhanced` is a custom profile. A new DH data directory needs its first copy of the shipped Web template. The guard below leaves an existing profile untouched. `--from-default-profile` replaces the target profile, so do not remove that guard and rerun it against an existing deployment.

```bash
export DSH_ENHANCED_HOME="$PWD/.local/enhanced-home"
if [ ! -d "$DSH_ENHANCED_HOME/profiles/enhanced" ]; then
  DSH_HOME="$DSH_ENHANCED_HOME" pnpm dsh --profile enhanced --from-default-profile web --dump-config > /dev/null
fi
```

Before the first start, open `.local/enhanced-home/profiles/enhanced/package.json` (or the equivalent path under your selected home). The Web template selects only the first two bundles below. Append the three enhanced bundles to `dsh.profile.bundles` so the new profile has this list. Keep the other manifest fields and any additional bundles already used by an existing deployment.

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

### 4. Prepare and start Flowable

Real workflows need Flowable. Create a private local password once, then use the same file for the container and DH. Existing files retain their password. For ordinary chat alone, skip this step and run the DH start command without loading the engine file.

```bash
mkdir -p .local/flowable
if [ ! -f .local/flowable/engine.env ]; then
  (umask 077; node -e 'console.log("DH_FLOWABLE_PASSWORD=" + require("node:crypto").randomBytes(24).toString("hex"))' > .local/flowable/engine.env)
fi
docker compose --project-name dh-flowable --env-file .local/flowable/engine.env -f packages/business-workflow/workbench/engine/compose.yml up -d
```

The engine exposes REST at `http://127.0.0.1:8082/flowable-rest/` with user `dh-workflow`. Its database stays in the named Compose volume. DH reads the address, user and tenant from the [enhanced overlay](apps/cli/config/examples/ztt/cordis.yml); changing the engine port also requires updating its `baseUrl`.

<a id="start-dh"></a>

### 5. Start DH

From the repository root, export the private engine password before starting DH. Docker Compose reading an env file does not export its values into this terminal.

```bash
set -a
source .local/flowable/engine.env
set +a
pnpm run start:enhanced
```

DH listens on `http://127.0.0.1:3001/`. Open the complete URL printed by the terminal on first access; it contains the local access credential. The launcher keeps running in the foreground and does not automatically open a browser.

<a id="configure-model-and-connectors"></a>

### 6. Configure a model and optional connectors

On first entry, select a local workspace directory, then complete the model setup before sending a chat request or running an analysis node. API keys are managed by the native credential service. You can also provide `DEEPSEEK_API_KEY` through a private environment; no model key is needed for the built-in data-transfer/approval connection check.

The enhanced bundle list above selects plugin management and both connector packages. Open Plugins to configure their saved-account pages; individual account connections remain disabled until configured and enabled. Selecting a bundle alone does not authorize an account.

- [Feishu and WeCom](docs/user/enterprise-connectors.md): configure their own accounts and resource/ingress permissions.
- [RAGFlow](docs/user/ragflow-connector.md): provide an independently running service, an API key and selected knowledge bases.

<a id="verify-workflow"></a>

## Verify a workflow

Start with the connection-check template, then configure a model for the simulated risk demonstration. Workflow reviews are handled inside DH.

1. Open Workflow and use the Flowable connection-check template to verify the engine, data transfer, review and waiting steps.
2. To let Agent start a workflow, save and publish the draft first, then manually select that published version in the conversation input area.
3. Send the execution request. Selection alone does not start a run; ordinary chat cannot start a new workflow.
4. Review the exact saved inputs in the initiating conversation or Workflow page. DH waits without model polling and continues after approval.
5. The simulated WeCom risk template requires `scenario=risk` or `scenario=routine`. It does not access WeCom, but its DH analysis nodes still need a model.

See the [workflow reference](packages/business-workflow/workbench/README.md) for the full behavior. MES, SDCC and EIP business actions still require connector implementations; a template is not a delivered integration with those systems.

<a id="daily-use-and-data"></a>

## Daily use and data

Restart with the password export and `pnpm run start:enhanced` above. Use the same data directory; do not repeat the initialization or rebuild unless the source changed. After source updates, install the locked dependencies and rebuild the enhanced artifacts.

| Item | Default |
|---|---|
| DH Web | `127.0.0.1:3001` |
| Flowable REST | `127.0.0.1:8082/flowable-rest/` |
| DH profiles, credentials and history | `.local/enhanced-home/` |
| Private engine password | `.local/flowable/engine.env` |
| Workflow engine database | Compose named volume `dh-flowable_engine-data` |

The launcher accepts `DSH_ENHANCED_PORT` for the DH port, `DSH_ENHANCED_HOME` for its data directory and `DSH_ENHANCED_NODE` for a supported Node executable. Initialization uses `DSH_HOME`, so initialize the same directory that the launcher will use. A project-local `.local/runtime/node`, when present, takes precedence over the default Node unless explicitly overridden.

Ctrl+C stops the foreground DH process. Stop the engine with the following command; its database volume is retained.

```bash
docker compose --project-name dh-flowable --env-file .local/flowable/engine.env -f packages/business-workflow/workbench/engine/compose.yml stop
```

Back up the DH directory, private engine env file and engine volume together before an upgrade or machine move. Do not delete the volume or regenerate an existing database password. These data and credentials are not included in Git.

<a id="troubleshooting"></a>

## Troubleshooting

| Symptom | Check |
|---|---|
| Node version or native build failure | Node >=24.9, C/C++ tools and the matching Node development headers |
| `profile "enhanced" does not exist` | Complete the guarded initialization in the same DH data directory |
| Flowable unavailable or unauthorized | Docker engine/container, port 8082, and the same exported `DH_FLOWABLE_PASSWORD` in DH and Compose |
| Model requests fail | Model selection, account/API key and service access; opening DH is not a model connectivity test |
| Missing account cards | Check that the enhanced bundle list contains plugin management and both connector packages |
| Browser access refused | Use the full terminal launch URL and check whether another process owns port 3001 |

<a id="development"></a>

<a id="contributing"></a>

## Development

- Follow [AGENTS.md](AGENTS.md) and the [technical iteration record](技术迭代记录.md); continue development on `dev`.
- Use the project skill [dsh-build-connector](.agents/skills/dsh-build-connector/SKILL.md) when adding a connector.
- Read the [architecture](docs/architecture.md) and [development guide](docs/development.md) for general DH development.

<a id="license"></a>

## Attribution and license

Built on the open-source [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) and Cordis plugin architecture. This remains a developer preview; review the [safety notice](SAFETY.md). The project uses the [MIT license](LICENSE); dependency notices remain in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
