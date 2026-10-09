# Independent DH with RAGFlow

English | [中文](ragflow-connector.zh.md)

The enhanced checkout runs DH as an independent application. DH owns its models, sessions, workspace and credentials; RAGFlow owns knowledge bases, indexing and retrieval. RAGFlow is one native connector, with the same plugin lifecycle as other DH capabilities. The connector calls the public RAGFlow REST API and does not require an iframe, a RAGFlow Agent, MCP or the Harness Runtime Gateway. Knowledge stays at RAGFlow; retrieved evidence is retained in the DH conversation that uses it.

## Start

Start your existing RAGFlow service separately. Its default API base is `http://localhost:9380`. In this enhanced checkout, run:

```bash
pnpm install --frozen-lockfile
pnpm run build:enhanced
pnpm run start:enhanced
```

Open `http://127.0.0.1:3001`. This launcher uses its own ignored `.local/enhanced-home` for profiles, credentials and sessions. `DSH_ENHANCED_HOME` changes the home and `DSH_ENHANCED_PORT` changes the port. Configure the DH model in DH settings. The launcher does not import model or user credentials from the integrated application.

## Connect

1. Obtain an API Key from your RAGFlow account's API settings.
2. Open DH Settings → Plugins → Plugin configuration → RAGFlow connector.
3. Enter the RAGFlow service base URL and API Key, enable the connection, and save. The key uses DH's credential service; settings and tool results contain no saved key literal. A process-supplied `RAGFLOW_API_KEY` is also supported and is read-only in the card.
4. Ask DH to list the RAGFlow knowledge bases. Copy the required dataset IDs into the card's allowed knowledge base IDs and save. Empty selection permits listing only. When selection is nonempty, lists and retrieval are restricted to it.
5. Ask DH: “Search the connected RAGFlow knowledge bases for the inspection requirements, and cite the document names and chunk IDs.” The native tool inspector shows the actual result. An unavailable service or invalid key produces a connector error; ordinary DH conversations can run without RAGFlow.

All conversations in this independent local DH home use the current connection settings. Changing the allowlist affects subsequent calls, including calls from existing conversations. RAGFlow's own API Key permissions still apply. The connector is read-only and does not create knowledge bases or ingest documents. Dataset discovery is paginated, so ask for the next page when `has_more` is true.

## Other connectors

Feishu and enterprise WeChat require independent credential and authorization providers before their tools can run without the integrated RAGFlow host. The enhanced RAGFlow connector does not enable those host-dependent channel plugins. Add providers through native DH plugins, reuse the DH credential service and plugin settings, and register bounded tools for each service. Each service remains independently deployable.

The implementation decision is recorded in [Standalone knowledge connector](../../.agents/notes/implemented/feature/2026-10-09-standalone-ragflow-connector.md).
