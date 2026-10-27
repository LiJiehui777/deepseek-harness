# Feishu and WeCom in independent DH

English | [中文](enterprise-connectors.zh.md)

This guide connects the enhanced DH application to Feishu and enterprise WeChat. DH owns execution, model settings and conversation history; the providers own account permissions. The connectors run without the integrated RAGFlow host. A separately configured [RAGFlow connector](ragflow-connector.md) remains available to remote tasks.

## Start and configure

Run `pnpm run start:enhanced` after installing dependencies and building the enhanced checkout. Keep DH running while receiving remote tasks. Open Plugins in the main sidebar. The **Feishu connector** and **WeCom connector** cards are independent and start disabled. Save edits before selecting **Connect / check saved account**. Secrets are written to DH credentials; reopening a card shows presence only. Configure a working model in DH before sending tasks.

## Connect Feishu

1. In the [Feishu developer console](https://open.feishu.cn/app), create a self-built application, enable its bot capability, and copy **App ID** and **App Secret** into the Feishu card. The default endpoint is mainland Feishu; for Lark use `https://open.larksuite.com` in Advanced settings.
2. For **Read identity → Application identity**, grant application permissions for the capabilities you use: listing chats, reading chat history, reading Docx/Wiki, and sending messages. [Message history](https://open.feishu.cn/document/server-docs/im-v1/message/list) has additional group-message permission requirements. Publish the application version and obtain administrator approval where required. Add the bot to the target group and share documents with the application. App credentials do not provide your personal account's visibility.
3. To receive tasks, select long-connection event delivery in the application's event settings and subscribe to `im.message.receive_v1` ([official event reference](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive)). Enable **Receive remote tasks from this platform** in DH, enable the connection, save, and check for **Connected**. Bot events do not need a public callback URL. User identity reads use a separate OAuth callback.
4. Send the bot a harmless setup message. In DH refresh the connection status, review the last sender/chat IDs, select **Add latest sender** and **Add latest chat**, then save. No task executes while the sender list is empty. In a group, mention this bot; direct messages also trigger tasks.
5. Try “Read this shared quality document and summarize the inspection requirements”, including a Docx/Wiki URL. In DH itself, try “List the Feishu chats I can access” or “Read recent messages from chat ID …”. The tool inspector shows actual results and failures.

To let DH initiate messages, enable **Allow DH to send messages** and explicitly add destination chat IDs. Ask “Send this summary to Feishu chat …”. Each model-requested send needs a one-time approval in DH. Replies to authorized incoming tasks return to the original chat without this extra approval. A failed send may already have reached the provider; inspect the chat before retrying.

## Authorize your Feishu account

Select **Read identity → User identity** to read using your account. Both identities need App ID and App Secret; enable the connection and save. User identity reveals the account-authorization controls; Application identity hides them and requires no personal login. Switching identities retains any saved user grant and bot messaging settings. In Feishu Open Platform, enable and publish the user permissions `im:chat:read`, `im:message:readonly` and `im:message.group_msg:get_as_user`. Copy the **Authorization callback URI** shown in DH into the app's Security settings → Redirect URLs. The local default is `http://127.0.0.1:3001/auth/feishu/callback`; the URI must match exactly, including host and port. HTTPS deployments set their own callback URI under Advanced settings.

Select **Authorize my Feishu account**, sign in to your account and confirm on the Feishu page in the same browser. A blocked popup leaves an **Open Feishu authorization page** link. DH displays **Account authorized** with your name when consent completes. Try “Read the recent messages in the group named …”. Platform API rules, your membership, user scopes and the configured allowed-chat list still restrict access. Listing a group does not itself grant message access.

Default consent requests group reading and `offline_access` for automatic token refresh. For Docx/Wiki reads, enable and publish `docx:document:readonly` and `wiki:wiki:readonly`, add them to **Requested user permissions**, save and authorize again. These permissions only enable existing read tools; the connector does not perform document edits. **Disconnect my account** removes the local grant; manage platform-side consent separately in Feishu. All users and admitted remote tasks sharing this DH home can use its configured read identity. Robot tasks and sends continue to use the app identity.

## Connect enterprise WeChat

1. Create an **intelligent bot** in enterprise WeChat, choose **API mode** and **long connection**, then copy **Bot ID** and **Secret** into the WeCom card. These are not a group webhook key or an enterprise application's Corp Secret. The [WorkBuddy setup guide](https://www.workbuddy.cn/docs/workbuddy/Wecom-Guide) describes the same provider-side account creation.
2. Enable the connection and remote-task reception, save, and connect. The default endpoint is `wss://openws.work.weixin.qq.com`. Add the bot to an allowed group or open its direct conversation.
3. Send a harmless setup message. Refresh DH status, review and add its sender/chat IDs, and save. Send a new task: “Search the connected RAGFlow knowledge bases for inspection requirements and return the sources.” This requires the RAGFlow connector to be configured separately. DH returns the result through the bot's original conversation.
4. For proactive delivery, enable the send switch and list exact destination chat IDs. Ask DH to send the exact text to that chat and approve the native send request.

A manual bot connection exposes only the chats and messages it captures in this process. The QR connection below also lists the bound bot’s recent server-side conversations. Neither mode lists all personal groups or grants arbitrary earlier history. They cannot fetch arbitrary earlier history or enterprise conversation archives. Reconnecting clears this bounded message buffer; executed tasks remain in native DH Session history.

## Connect office access by QR code

In **Office account**, select **Connect by QR code** and scan with enterprise WeChat. Follow the platform’s creation/binding confirmation. DH automatically uses the bound bot for office access and the message connection; no Bot ID, Secret, separate Save, capability switches or connection-check button is needed. A scan enables the implemented document, microdisk metadata, calendar and todo reads. Platform permission still determines what each operation can access. A connected account has one **Disconnect** action.

DH checks account identity and the fixed read interfaces automatically after confirmation. Discovery does not prove that every resource is readable. In a local DH conversation, try “Search my WeCom documents for quality inspection requirements”, then ask DH to read a returned ordinary document or smart-document page. The same connection supports microdisk file discovery, calendar queries and existing-todo queries. File discovery returns metadata, not arbitrary file contents. Successful resource reads establish access to those particular resources. Unsupported types, missing permissions and unavailable interfaces return failures without sample content.

**Bot conversations and sends:** ask DH to list this robot’s recent conversations. `wecom_list_chats` uses the same QR grant and returns at most 20 visible bot conversations; it is not a personal group directory. Sending to a returned conversation requires one-shot DH approval. Never automatically retry an uncertain send. **Incoming tasks:** the bot connects automatically, but the member allowlist remains empty until you explicitly allow someone. Send the bot a setup message, open **Task access permissions**, refresh, allow the latest sender and save. Only then send a new task. An optional chat allowlist further restricts those members. Captured-message reads include only messages from approved members received after connection.

One DH home shares one office binding. This is the official WeCom CLI authorization model, not Feishu-style personal OAuth or unrestricted account access. WeCom controls actual visibility. Enterprise remote tasks and their descendants cannot use this grant. If a code expires, cancel and start another scan. **Disconnect** stops owned calls and the QR bot connection, and removes the local binding; manage platform consent separately in WeCom. Office resource writes and chat archives are outside this connector. A real account scan and permitted document read remain necessary to confirm a particular enterprise's access.

## Execution and troubleshooting

Each provider/account/chat/sender combination uses a separate persistent DH conversation. Tasks from that binding are queued in order and use the configured Agent preset and workspace. View execution and approve tools in DH. The bot acknowledges a task and returns the latest assistant text from the task receipt until the whole Agent becomes idle; local follow-ups during that interval can contribute to the reply. Media transfer and approval buttons inside IM are not implemented.

**Connected** confirms transport/account authentication, not every resource permission. If no task runs, refresh status and check the sender/chat lists, receive switch, bot membership, Feishu mention and event subscription. A full queue is reported in status; retry after existing tasks finish. If execution fails, inspect the model configuration and DH conversation. If a resource read fails, check the application's scopes and sharing. Feishu Base/calendar actions and enterprise archive access require additional providers.

## Open-source basis

The implementation uses the MIT-licensed official [Feishu Node SDK](https://github.com/larksuite/node-sdk) and [WeCom AI bot SDK](https://github.com/WecomTeam/aibot-node-sdk). [Feishu OpenAPI MCP](https://github.com/larksuite/lark-openapi-mcp) offers broader tool/OAuth integration; the official [WeCom OpenClaw plugin](https://github.com/WecomTeam/wecom-openclaw-plugin) provides a host-specific adapter. [dsh-connect](https://github.com/IvanWu2015/dsh-connect) is a community DH messaging plugin for Feishu and other platforms. These provide useful extension references; the enhanced checkout uses its own native settings and session lifecycle with the official transports. See the [package reference](../../packages/interaction/enterprise-connectors/README.md) for current limits.
