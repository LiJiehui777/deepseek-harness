/** Locale bundles for the plugin configuration section and its plugin cards. */

/** Locale keys these surfaces render. */
export type PluginsSettingsLocaleKey =
  | 'wecomOfficeReconnect'
  | 'wecomOfficeAdvanced'
  | 'wecomOfficeTitle'
  | 'wecomOfficeHint'
  | 'wecomOfficeEnabled'
  | 'wecomOfficeCapabilities'
  | 'wecomOfficeDocuments'
  | 'wecomOfficeFiles'
  | 'wecomOfficeCalendar'
  | 'wecomOfficeTodos'
  | 'wecomOfficeSave'
  | 'wecomOfficeSaveFirst'
  | 'wecomOfficeLocalOnly'
  | 'wecomOfficeScan'
  | 'wecomOfficeCheck'
  | 'wecomOfficeCancel'
  | 'wecomOfficeDisconnect'
  | 'wecomOfficeAuthorized'
  | 'wecomOfficeDisabled'
  | 'wecomOfficeNotAuthorized'
  | 'wecomOfficePending'
  | 'wecomOfficeChecking'
  | 'wecomOfficePreparingQr'
  | 'wecomOfficeQrAlt'
  | 'wecomOfficeQrHint'
  | 'wecomOfficeAuthorizer'
  | 'wecomOfficeCorporation'
  | 'wecomOfficeIdentityUnknown'
  | 'wecomOfficeCapabilityUnknown'
  | 'wecomOfficeCapabilityDiscoverable'
  | 'wecomOfficeCapabilityVerified'
  | 'wecomOfficeCapabilityError'
  | 'wecomOfficeRuntimeUnavailable'
  | 'wecomOfficeVersionMismatch'
  | 'wecomOfficePermissionDenied'
  | 'wecomOfficeUnavailable'
  | 'wecomOfficeInvalidResult'
  | 'wecomOfficeTooLarge'
  | 'wecomOfficeTimeout'
  | 'wecomOfficeCancelled'
  | 'wecomOfficeConnectionFailed'
  | 'wecomBotMessaging'
  | 'feishuReadIdentity'
  | 'feishuBotStatus'
  | 'feishuBotMessagingHint'
  | 'feishuBotMessaging'
  | 'feishuUserAuthorization'
  | 'feishuAppReadHint'
  | 'feishuCredentialsHint'
  | 'feishuIdentityUserHint'
  | 'feishuIdentityUser'
  | 'feishuIdentityAppHint'
  | 'feishuIdentityApp'
  | 'feishuIdentityHint'
  | 'feishuUserHint'
  | 'feishuAuthorize'
  | 'feishuRevoke'
  | 'feishuAuthorized'
  | 'feishuUnauthorized'
  | 'feishuPending'
  | 'feishuAuthFailed'
  | 'feishuAuthCancelled'
  | 'feishuAuthLink'
  | 'feishuCallback'
  | 'feishuCallbackHint'
  | 'feishuRedirectURI'
  | 'feishuRedirectHint'
  | 'feishuUserScopes'
  | 'feishuUserScopesHint'
  | 'feishuTitle'
  | 'wecomTitle'
  | 'feishuDescription'
  | 'wecomDescription'
  | 'feishuAppId'
  | 'wecomBotId'
  | 'feishuSecret'
  | 'wecomSecret'
  | 'feishuSetupHint'
  | 'wecomSetupHint'
  | 'enterpriseSecretHint'
  | 'enterpriseSecretSet'
  | 'enterpriseMissingSecret'
  | 'enterpriseOpenConsole'
  | 'enterpriseEnable'
  | 'enterpriseRead'
  | 'wecomHistoryHint'
  | 'enterpriseReceive'
  | 'enterpriseReceiveHint'
  | 'enterpriseSenders'
  | 'enterpriseSendersHint'
  | 'enterpriseChats'
  | 'enterpriseChatsHint'
  | 'enterpriseSend'
  | 'enterpriseSendHint'
  | 'enterpriseAdvanced'
  | 'enterpriseEndpoint'
  | 'feishuEndpointHint'
  | 'wecomEndpointHint'
  | 'enterpriseWorkspace'
  | 'enterpriseWorkspaceHint'
  | 'enterprisePreset'
  | 'enterprisePresetHint'
  | 'enterpriseConnected'
  | 'enterpriseConnecting'
  | 'enterpriseDisabled'
  | 'enterpriseConnectionFailed'
  | 'enterpriseTaskFailed'
  | 'enterpriseQueueFull'
  | 'enterpriseLastSender'
  | 'enterpriseLastChat'
  | 'enterpriseReconnect'
  | 'enterpriseRefresh'
  | 'enterpriseAllowSender'
  | 'enterpriseAllowChat'
  | 'enterpriseSaveFirst'
  | 'enterpriseInvalid'
  | 'ragflowTitle' | 'ragflowDescription' | 'ragflowApiKey' | 'ragflowApiKeyHint' | 'ragflowApiKeySet' | 'ragflowApiKeyUnset' | 'ragflowBaseUrl' | 'ragflowBaseUrlHint' | 'ragflowDatasets' | 'ragflowDatasetsHint' | 'ragflowEnabled' | 'ragflowInvalidUrl' | 'ragflowInvalidDatasets'
  | 'ragflowChooseDatasets' | 'ragflowSearchDatasets' | 'ragflowDatasetUnknown' | 'ragflowCatalogLoading'
  | 'ragflowCatalogFailed' | 'ragflowCatalogEmpty' | 'ragflowCatalogRefresh' | 'ragflowCatalogMore' | 'ragflowCatalogSaveFirst'
  | 'nav' | 'title' | 'intro' | 'tabs' | 'configurableTab' | 'empty'
  | 'overridden' | 'reset' | 'readOnly' | 'expand' | 'collapse'
  | 'save' | 'saving' | 'discard' | 'unsaved' | 'saveFailed' | 'invalidNumber'
  | 'bashTitle' | 'bashDescription' | 'bashTimeoutMs' | 'bashTimeoutMsHint'
  | 'bashMaxOutputBytes' | 'bashMaxOutputBytesHint'
  | 'agentLoopTitle' | 'agentLoopDescription' | 'agentLoopMaxParallel' | 'agentLoopMaxParallelHint'
  | 'webSearchTitle' | 'webSearchDescription'
  | 'webSearchApiKey' | 'webSearchApiKeyHint' | 'webSearchApiKeySet' | 'webSearchApiKeyUnset'
  | 'webSearchBaseUrl' | 'webSearchBaseUrlHint' | 'webSearchMaxUses' | 'webSearchMaxUsesHint'
  | 'subagentModelSelectionTitle' | 'subagentModelSelectionDescription'
  | 'subagentModelSelectionToggle' | 'subagentModelSelectionChoose' | 'subagentModelSelectionAllowed'
  | 'subagentModelSelectionLoading' | 'subagentModelSelectionLoadFailed' | 'subagentModelSelectionRetry'
  | 'subagentModelSelectionPartial' | 'subagentModelSelectionUnavailable'
  | 'subagentModelSelectionUnavailableGroup' | 'subagentModelSelectionEmpty'
  | 'subagentModelSelectionRequired' | 'subagentModelSelectionConflict' | 'subagentModelSelectionOff'

/** English copy. */
export const en: Record<PluginsSettingsLocaleKey, string> = {
  wecomOfficeAdvanced: 'Read permissions and advanced settings',
  wecomOfficeReconnect: 'Scan again',
  wecomOfficeTitle: 'Office account',
  wecomOfficeHint: 'Connect by scanning with WeCom. The first connection enables authorized document reads; adjust other capabilities in Advanced settings.',
  wecomOfficeEnabled: 'Enable office access',
  wecomOfficeCapabilities: 'Read-only capabilities',
  wecomOfficeDocuments: 'Search and read documents',
  wecomOfficeFiles: 'Locate microdisk files',
  wecomOfficeCalendar: 'Read calendar schedules',
  wecomOfficeTodos: 'Read existing todos',
  wecomOfficeSave: 'Save office settings',
  wecomOfficeSaveFirst: 'Save office settings before connecting or checking the account.',
  wecomOfficeLocalOnly: 'Office access is available to local DH conversations. Enterprise remote tasks cannot use this authorization. File discovery returns metadata; arbitrary file contents and chat archives are not included.',
  wecomOfficeScan: 'Connect by QR code',
  wecomOfficeCheck: 'Check office account and capabilities',
  wecomOfficeCancel: 'Cancel',
  wecomOfficeDisconnect: 'Disconnect',
  wecomOfficeAuthorized: 'Office account connected',
  wecomOfficeDisabled: 'Not connected',
  wecomOfficeNotAuthorized: 'Office account needs authorization. Connect by QR code.',
  wecomOfficePending: 'Waiting for WeCom QR confirmation',
  wecomOfficeChecking: 'Checking office access',
  wecomOfficePreparingQr: 'Preparing the authorization QR code…',
  wecomOfficeQrAlt: 'Scan with WeCom to connect office access',
  wecomOfficeQrHint: 'Scan and confirm in WeCom. If the code expires, cancel this attempt and start again.',
  wecomOfficeAuthorizer: 'Authorized by',
  wecomOfficeCorporation: 'Organization',
  wecomOfficeIdentityUnknown: 'The connection is saved. Check the account to retrieve the authorizer name if WeCom provides it.',
  wecomOfficeCapabilityUnknown: 'Not checked',
  wecomOfficeCapabilityDiscoverable: 'Interface found; resource access not verified',
  wecomOfficeCapabilityVerified: 'A resource read succeeded',
  wecomOfficeCapabilityError: 'Check failed; retry the account check',
  wecomOfficeRuntimeUnavailable: 'The official WeCom runtime is unavailable. Check this deployment.',
  wecomOfficeVersionMismatch: 'This connector requires the pinned WeCom CLI 1.3.4.',
  wecomOfficePermissionDenied: 'WeCom denied this capability or resource. Check the account permissions and sharing.',
  wecomOfficeUnavailable: 'This operation is not available for the current connection.',
  wecomOfficeInvalidResult: 'The office response is not compatible with this connector. Check the resource type or update the deployment.',
  wecomOfficeTooLarge: 'The result is too large. Request a smaller page or one document page.',
  wecomOfficeTimeout: 'Office authorization or the request timed out. Retry the connection.',
  wecomOfficeCancelled: 'This office authorization was cancelled.',
  wecomOfficeConnectionFailed: 'Office connection failed. Check network access and try again.',
  wecomBotMessaging: 'Message robot connection',
  feishuBotStatus: 'Bot connection status',
  feishuBotMessagingHint: 'Receiving tasks and sending messages always use the application bot, independently of the read identity above.',
  feishuBotMessaging: 'Bot messaging · application identity',
  feishuUserAuthorization: 'User account authorization',
  feishuAppReadHint: 'Enable and publish the required application read permissions. Add the bot to the target chats and share documents with the app.',
  feishuCredentialsHint: 'Both identities need the app credentials below. User identity also requires your account authorization.',
  feishuIdentityUserHint: 'Sign in to read chats and documents visible to your account, within the user permissions granted to this app.',
  feishuIdentityUser: 'User identity',
  feishuIdentityAppHint: 'Read chats the bot belongs to and documents shared with the app. No personal sign-in is required.',
  feishuIdentityApp: 'Application identity',
  feishuIdentityHint: 'Choose whose permissions DH uses to read chats and documents.',
  feishuReadIdentity: 'Read identity',
  feishuUserHint: 'Enable and publish the required user permissions, save your settings, then authorize below. Admitted remote tasks can also use this read identity.',
  feishuAuthorize: 'Authorize my Feishu account',
  feishuRevoke: 'Disconnect my account',
  feishuAuthorized: 'Account authorized',
  feishuUnauthorized: 'Account not authorized',
  feishuPending: 'Waiting for Feishu consent',
  feishuAuthFailed: 'Authorization failed or expired. Check the callback URI and published user permissions, then retry.',
  feishuAuthCancelled: 'Authorization cancelled.',
  feishuAuthLink: 'Open Feishu authorization page',
  feishuCallback: 'Authorization callback URI',
  feishuCallbackHint: "Copy this URI into the app's Security settings > Redirect URLs. It is an automatic return address, not an authorization entry. Start with the button below in the same browser.",
  feishuRedirectURI: 'Custom callback URI',
  feishuRedirectHint: 'Leave blank for the local Web server. HTTPS deployments must use their public /auth/feishu/callback URL.',
  feishuUserScopes: 'Requested user permissions',
  feishuUserScopesHint: 'Default: group reads and token refresh. For documents, also enable docx:document:readonly and wiki:wiki:readonly in Feishu, add them here, save and authorize again.',

  feishuTitle: 'Feishu connector',
  wecomTitle: 'WeCom connector',
  feishuDescription: 'Read authorized messages and documents; send and receive DH tasks.',
  wecomDescription: 'Connect office access by QR code and an optional message robot.',
  feishuAppId: 'App ID',
  wecomBotId: 'Bot ID',
  feishuSecret: 'App Secret',
  wecomSecret: 'Bot Secret',
  feishuSetupHint: 'Find App ID and App Secret in your Feishu application credentials. Enable bot capability if you use bot messaging.',
  wecomSetupHint: 'Create an intelligent bot in API / long-connection mode. This is not a group webhook key.',
  enterpriseSecretHint: 'Stored by DH credentials, never returned to the browser. Blank keeps the saved secret.',
  enterpriseSecretSet: 'Secret configured.',
  enterpriseMissingSecret: 'Secret not configured.',
  enterpriseOpenConsole: 'Open platform console',
  enterpriseEnable: 'Enable this connection',
  enterpriseRead: 'Allow reading visible chats and documents',
  wecomHistoryHint: 'Only text received by this bot since connecting is available; arbitrary group history is not available.',
  enterpriseReceive: 'Receive remote tasks from this platform',
  enterpriseReceiveHint: 'Direct messages and bot mentions start DH tasks. Existing model, knowledge and approval settings apply.',
  enterpriseSenders: 'Allowed sender IDs',
  enterpriseSendersHint: 'Comma-separated IDs. Empty denies all remote tasks. Send a message, refresh status, then add the latest sender.',
  enterpriseChats: 'Allowed chat IDs',
  enterpriseChatsHint: 'Empty permits visible reads and authorized-sender tasks. Proactive sending requires an explicitly listed chat.',
  enterpriseSend: 'Allow DH to send messages',
  enterpriseSendHint: 'Every model-requested send requires DH approval. Authorized task replies return to their original conversation.',
  enterpriseAdvanced: 'Advanced connection settings',
  enterpriseEndpoint: 'Platform endpoint',
  feishuEndpointHint: 'Feishu: https://open.feishu.cn; Lark: https://open.larksuite.com.',
  wecomEndpointHint: 'Public cloud: wss://openws.work.weixin.qq.com.',
  enterpriseWorkspace: 'Remote task folder',
  enterpriseWorkspaceHint: 'Blank uses a dedicated folder inside the DH home. An explicit path must be absolute.',
  enterprisePreset: 'Agent preset',
  enterprisePresetHint: 'Uses a DH preset; standard keeps the configured model and tools.',
  enterpriseConnected: 'Connected',
  enterpriseConnecting: 'Connecting…',
  enterpriseDisabled: 'Connection disabled',
  enterpriseConnectionFailed: 'Connection failed. Check credentials, mode, permissions and network.',
  enterpriseQueueFull: 'The remote-task queue is full. Retry after existing tasks finish.',
  enterpriseTaskFailed: 'A remote task failed. Check model configuration and execution history in DH.',
  enterpriseLastSender: 'Latest sender ID',
  enterpriseLastChat: 'Latest chat ID',
  enterpriseReconnect: 'Connect / check saved account',
  enterpriseRefresh: 'Refresh status',
  enterpriseAllowSender: 'Add latest sender',
  enterpriseAllowChat: 'Add latest chat',
  enterpriseSaveFirst: 'Save changes before connecting.',
  enterpriseInvalid: 'Enter a valid value within the stated scope.',

  ragflowTitle: 'RAGFlow connector',
  ragflowDescription: 'Connect an independent RAGFlow service for knowledge retrieval.',
  ragflowApiKey: 'RAGFlow API Key',
  ragflowApiKeyHint: 'Stored by DH credentials; never returned to the browser. Blank keeps the current key.',
  ragflowApiKeySet: 'API Key configured.',
  ragflowApiKeyUnset: 'API Key not configured.',
  ragflowBaseUrl: 'RAGFlow service address',
  ragflowBaseUrlHint: 'Example: http://localhost:9380. Enter the service base, without /api/v1.',
  ragflowDatasets: 'Allowed knowledge bases',
  ragflowDatasetsHint: 'Select up to 100 knowledge bases by name. Save to apply. An empty selection permits listing only.',
  ragflowChooseDatasets: 'Choose knowledge bases',
  ragflowSearchDatasets: 'Search loaded knowledge bases',
  ragflowDatasetUnknown: 'Selected knowledge base; name not loaded',
  ragflowCatalogLoading: 'Loading knowledge bases…',
  ragflowCatalogFailed: 'Could not load knowledge bases. Check the saved connection and retry. Your selection is retained.',
  ragflowCatalogEmpty: 'No matching knowledge bases on the loaded pages.',
  ragflowCatalogRefresh: 'Refresh list',
  ragflowCatalogMore: 'Load more',
  ragflowCatalogSaveFirst: 'Save the service address and API Key before loading knowledge bases.',
  ragflowEnabled: 'Enable RAGFlow connection',
  ragflowInvalidUrl: 'Enter an HTTP(S) service base without credentials, query or fragment.',
  ragflowInvalidDatasets: 'Select at most 100 valid knowledge bases.',

  nav: 'Plugins',
  title: 'Plugins',
  intro: 'Configure and inspect the plugins installed in this deployment.',
  tabs: 'Plugin views',
  configurableTab: 'Plugin configuration',
  empty: 'This deployment exposes no plugin settings.',
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  expand: 'Show settings',
  collapse: 'Hide settings',
  save: 'Save',
  saving: 'Saving…',
  discard: 'Discard',
  unsaved: 'Unsaved',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  invalidNumber: 'Enter a number, or leave blank to use the default.',
  bashTitle: 'Shell',
  bashDescription: 'Limits every command the agent runs.',
  bashTimeoutMs: 'Command timeout (ms)',
  bashTimeoutMsHint: 'How long one command may run before it is terminated.',
  bashMaxOutputBytes: 'Output cap per stream (bytes)',
  bashMaxOutputBytesHint: 'Output beyond this spills to a temporary file rather than being lost.',
  agentLoopTitle: 'Agent loop',
  agentLoopDescription: 'How the agent dispatches tool calls.',
  agentLoopMaxParallel: 'Parallel tool calls',
  agentLoopMaxParallelHint: 'Upper bound on parallel-safe calls running at once within one step.',
  webSearchTitle: 'Web search',
  webSearchDescription: 'The DeepSeek search provider.',
  webSearchApiKey: 'API key',
  webSearchApiKeyHint: 'Stored outside the settings file. Leave blank to keep the current key.',
  webSearchApiKeySet: 'A key is configured.',
  webSearchApiKeyUnset: 'No key is configured; search is unavailable until one is.',
  webSearchBaseUrl: 'Endpoint',
  webSearchBaseUrlHint: 'Leave blank to use the provider default.',
  webSearchMaxUses: 'Max searches per request',
  webSearchMaxUsesHint: 'How many times one request may search before it must answer.',
  subagentModelSelectionTitle: 'Subagent',
  subagentModelSelectionDescription: 'Control which models agents may choose for subagents.',
  subagentModelSelectionToggle: 'Allow agents to choose models for subagents',
  subagentModelSelectionChoose: 'When enabled, agents can choose a provider, model, and reasoning effort for each subagent from the authorized models below. Applies only to new sessions.',
  subagentModelSelectionAllowed: 'Models agents may choose',
  subagentModelSelectionLoading: 'Loading models…',
  subagentModelSelectionLoadFailed: 'Models could not be loaded.',
  subagentModelSelectionRetry: 'Retry',
  subagentModelSelectionPartial: 'Some model providers could not be loaded; saved choices remain removable.',
  subagentModelSelectionUnavailable: 'Currently unavailable',
  subagentModelSelectionUnavailableGroup: 'Saved but currently unavailable',
  subagentModelSelectionEmpty: 'No model provider currently advertises a model.',
  subagentModelSelectionRequired: 'Select at least one model before saving.',
  subagentModelSelectionConflict: 'Settings changed elsewhere. Discard your draft and try again.',
  subagentModelSelectionOff: 'Subagents use configured defaults or inherit the parent agent\'s model. Saved model choices are retained.',
}

/** Simplified Chinese copy. */
export const zh: Record<PluginsSettingsLocaleKey, string> = {
  wecomOfficeAdvanced: '读取范围与高级设置',
  wecomOfficeReconnect: '重新扫码',
  wecomOfficeTitle: '办公账号',
  wecomOfficeHint: '使用企业微信扫码即可连接。首次默认开启授权范围内的文档读取，其他能力可在高级设置中调整。',
  wecomOfficeEnabled: '启用办公能力',
  wecomOfficeCapabilities: '只读办公能力',
  wecomOfficeDocuments: '搜索与读取文档',
  wecomOfficeFiles: '定位微盘文件',
  wecomOfficeCalendar: '查询日程',
  wecomOfficeTodos: '查询已有待办',
  wecomOfficeSave: '保存办公设置',
  wecomOfficeSaveFirst: '请先保存办公设置，再扫码连接或检查账号。',
  wecomOfficeLocalOnly: '办公授权仅供本地 DH 对话使用，企微、飞书远程任务不能使用。微盘定位只返回文件信息，暂不包含任意文件正文或聊天存档。',
  wecomOfficeScan: '扫码连接',
  wecomOfficeCheck: '检查办公账号与能力',
  wecomOfficeCancel: '取消',
  wecomOfficeDisconnect: '断开连接',
  wecomOfficeAuthorized: '办公账号已连接',
  wecomOfficeDisabled: '未连接',
  wecomOfficeNotAuthorized: '办公账号尚未授权或授权已失效，请扫码连接。',
  wecomOfficePending: '等待企业微信扫码确认',
  wecomOfficeChecking: '正在检查办公连接',
  wecomOfficePreparingQr: '正在获取授权二维码…',
  wecomOfficeQrAlt: '使用企业微信扫描此二维码，连接办公能力',
  wecomOfficeQrHint: '请使用企业微信扫码并确认。二维码过期后，取消本次扫码再重新连接。',
  wecomOfficeAuthorizer: '授权人',
  wecomOfficeCorporation: '企业',
  wecomOfficeIdentityUnknown: '连接已保存；可检查账号获取授权人姓名。平台未提供时不会推测身份。',
  wecomOfficeCapabilityUnknown: '尚未检查',
  wecomOfficeCapabilityDiscoverable: '接口可用，资源权限待验证',
  wecomOfficeCapabilityVerified: '已成功读取资源',
  wecomOfficeCapabilityError: '检查失败，请重试',
  wecomOfficeRuntimeUnavailable: '企业微信办公运行组件不可用，请检查部署。',
  wecomOfficeVersionMismatch: '办公连接器需要配套的企业微信 CLI 1.3.4。',
  wecomOfficePermissionDenied: '当前能力或资源无权访问，请检查企微授权与共享范围。',
  wecomOfficeUnavailable: '当前连接暂不提供此项操作。',
  wecomOfficeInvalidResult: '办公接口返回内容不兼容，请检查资源类型或更新部署。',
  wecomOfficeTooLarge: '结果过大，请缩小查询范围或指定文档页面。',
  wecomOfficeTimeout: '办公授权或请求超时，请重新连接。',
  wecomOfficeCancelled: '本次办公授权已取消。',
  wecomOfficeConnectionFailed: '办公连接失败，请检查网络后重试。',
  wecomBotMessaging: '机器人消息连接',
  feishuBotStatus: '机器人连接状态',
  feishuBotMessagingHint: '接收任务和发送消息始终使用应用机器人，与上方选择的读取身份独立。',
  feishuBotMessaging: '机器人收发消息 · 应用身份',
  feishuUserAuthorization: '用户账号授权',
  feishuAppReadHint: '请为应用开通并发布所需的读取权限，将机器人加入目标群聊，并将文档共享给应用。',
  feishuCredentialsHint: '两种身份都需要填写下方的飞书应用凭证；用户身份还需完成个人账号授权。',
  feishuIdentityUserHint: '登录授权后，读取你的账号可访问的群聊和文档，范围受已授予的用户权限限制。',
  feishuIdentityUser: '用户身份',
  feishuIdentityAppHint: '读取机器人所在群聊和共享给应用的文档，无需个人账号登录授权。',
  feishuIdentityApp: '应用身份',
  feishuIdentityHint: '选择 DH 读取群聊和文档时使用谁的权限。',
  feishuReadIdentity: '读取身份',
  feishuUserHint: '请开通并发布所需的用户权限，保存设置后在下方授权。已获准的远程任务也可使用这份读取身份。',
  feishuAuthorize: '授权我的飞书账号',
  feishuRevoke: '解除账号授权',
  feishuAuthorized: '账号已授权',
  feishuUnauthorized: '账号尚未授权',
  feishuPending: '等待飞书授权',
  feishuAuthFailed: '授权失败或已过期。请检查回调地址及已发布的用户权限后重试。',
  feishuAuthCancelled: '已取消授权。',
  feishuAuthLink: '打开飞书授权页',
  feishuCallback: '授权回调地址',
  feishuCallbackHint: '将此地址添加到飞书应用「安全设置 → 重定向 URL」。它用于授权后自动返回，不能直接打开来授权；请在同一浏览器点击下方按钮。',
  feishuRedirectURI: '自定义回调地址',
  feishuRedirectHint: '本机使用留空即可；HTTPS 部署请填写公网地址，路径为 /auth/feishu/callback。',
  feishuUserScopes: '申请的用户权限',
  feishuUserScopesHint: '默认申请群聊读取和自动续期。需要读取文档时，请在飞书开通 docx:document:readonly、wiki:wiki:readonly，并在此添加、保存后重新授权。',

  feishuTitle: '飞书连接器',
  wecomTitle: '企业微信连接器',
  feishuDescription: '读取授权消息与文档，收发消息并联动 DH 任务。',
  wecomDescription: '扫码连接办公能力，并按需启用机器人消息与 DH 任务。',
  feishuAppId: 'App ID',
  wecomBotId: 'Bot ID',
  feishuSecret: 'App Secret',
  wecomSecret: '机器人 Secret',
  feishuSetupHint: '在飞书开放平台的应用凭证中获取 App ID 和 App Secret。需要机器人收发消息时，再启用机器人能力。',
  wecomSetupHint: '创建智能机器人，选择 API 模式和使用长连接；这里填写 Bot ID，不是群机器人 Webhook。',
  enterpriseSecretHint: '由 DH 凭证服务保存，保存后不返回浏览器。留空保留原密钥。',
  enterpriseSecretSet: '已保存密钥。',
  enterpriseMissingSecret: '尚未配置密钥。',
  enterpriseOpenConsole: '打开平台管理后台',
  enterpriseEnable: '启用此连接',
  enterpriseRead: '允许读取可见群聊和文档',
  wecomHistoryHint: '仅能查询本次连接后机器人已接收的文本，不能读取任意群的全部历史消息。',
  enterpriseReceive: '接收平台消息并执行 DH 任务',
  enterpriseReceiveHint: '私聊或群内 @机器人可启动 DH 任务，沿用现有模型、知识库和确认设置。',
  enterpriseSenders: '允许派任务的用户 ID',
  enterpriseSendersHint: '多个 ID 用逗号分隔；留空时拒绝所有远程任务。先给机器人发消息，再刷新状态并添加最近发送者。',
  enterpriseChats: '允许的会话 ID',
  enterpriseChatsHint: '留空允许可见资源读取及已授权用户派任务；主动发送时，目标会话必须填写在此处。',
  enterpriseSend: '允许 DH 主动发送消息',
  enterpriseSendHint: '模型主动发送每条消息时需要 DH 确认；已授权任务的回复返回原会话。',
  enterpriseAdvanced: '高级连接设置',
  enterpriseEndpoint: '平台服务地址',
  feishuEndpointHint: '飞书：https://open.feishu.cn；Lark：https://open.larksuite.com。',
  wecomEndpointHint: '公有云：wss://openws.work.weixin.qq.com。',
  enterpriseWorkspace: '远程任务目录',
  enterpriseWorkspaceHint: '留空使用 DH 数据目录中的独立任务文件夹；自定义时填写绝对路径。',
  enterprisePreset: '智能体预设',
  enterprisePresetHint: '使用 DH 已有预设；standard 沿用配置的模型和工具。',
  enterpriseConnected: '已连接',
  enterpriseConnecting: '正在连接…',
  enterpriseDisabled: '连接未启用',
  enterpriseConnectionFailed: '连接失败，请检查凭据、接入模式、权限和网络。',
  enterpriseQueueFull: '远程任务队列已满，请在当前任务结束后重试。',
  enterpriseTaskFailed: '远程任务执行失败，请在 DH 检查模型配置和执行记录。',
  enterpriseLastSender: '最近发送者 ID',
  enterpriseLastChat: '最近会话 ID',
  enterpriseReconnect: '连接 / 检查已保存账号',
  enterpriseRefresh: '刷新状态',
  enterpriseAllowSender: '添加最近发送者',
  enterpriseAllowChat: '添加最近会话',
  enterpriseSaveFirst: '请先保存修改，再检查连接。',
  enterpriseInvalid: '请输入符合说明的有效配置。',

  ragflowTitle: 'RAGFlow 连接器',
  ragflowDescription: '连接独立运行的 RAGFlow 服务，读取知识库并检索内容。',
  ragflowApiKey: 'RAGFlow API Key',
  ragflowApiKeyHint: '由 DH 凭证服务保存，保存后不返回浏览器。留空保留已有密钥。',
  ragflowApiKeySet: '已配置 API Key。',
  ragflowApiKeyUnset: '尚未配置 API Key。',
  ragflowBaseUrl: 'RAGFlow 服务地址',
  ragflowBaseUrlHint: '例如 http://localhost:9380，填写服务根地址，不含 /api/v1。',
  ragflowDatasets: '允许检索的知识库',
  ragflowDatasetsHint: '按名称选择知识库，可多选，最多 100 个。保存后生效；未选择时仅可查看知识库列表。',
  ragflowChooseDatasets: '选择知识库',
  ragflowSearchDatasets: '搜索已加载的知识库',
  ragflowDatasetUnknown: '已选知识库，名称尚未加载',
  ragflowCatalogLoading: '正在加载知识库…',
  ragflowCatalogFailed: '知识库加载失败，请检查已保存的连接后重试。原有选择已保留。',
  ragflowCatalogEmpty: '已加载的列表中没有匹配的知识库。',
  ragflowCatalogRefresh: '刷新列表',
  ragflowCatalogMore: '加载更多',
  ragflowCatalogSaveFirst: '请先保存服务地址和 API Key，再加载知识库。',
  ragflowEnabled: '启用 RAGFlow 连接',
  ragflowInvalidUrl: '请填写 HTTP(S) 服务地址，不含账号密码、查询参数或锚点。',
  ragflowInvalidDatasets: '请选择有效的知识库，最多 100 个。',

  nav: '插件',
  title: '插件',
  intro: '配置和查看本部署已安装的插件。',
  tabs: '插件视图',
  configurableTab: '插件配置',
  empty: '本部署没有开放任何插件设置。',
  overridden: '已覆盖',
  reset: '恢复默认',
  readOnly: '本部署的设置为只读。',
  expand: '展开设置',
  collapse: '收起设置',
  save: '保存',
  saving: '保存中…',
  discard: '放弃修改',
  unsaved: '未保存',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
  invalidNumber: '请填数字；留空表示使用默认值。',
  bashTitle: '终端',
  bashDescription: '限制 agent 运行的每一条命令。',
  bashTimeoutMs: '命令超时（毫秒）',
  bashTimeoutMsHint: '单条命令允许运行多久，超时即终止。',
  bashMaxOutputBytes: '单流输出上限（字节）',
  bashMaxOutputBytesHint: '超出部分会转存到临时文件，而不是被丢弃。',
  agentLoopTitle: 'Agent 循环',
  agentLoopDescription: 'Agent 如何派发工具调用。',
  agentLoopMaxParallel: '并行工具调用数',
  agentLoopMaxParallelHint: '同一步内最多同时运行多少个可并行的调用。',
  webSearchTitle: '网页搜索',
  webSearchDescription: 'DeepSeek 搜索提供方。',
  webSearchApiKey: 'API Key',
  webSearchApiKeyHint: '不写入设置文件。留空表示保持当前密钥。',
  webSearchApiKeySet: '已配置密钥。',
  webSearchApiKeyUnset: '未配置密钥；配置之前搜索不可用。',
  webSearchBaseUrl: '接口地址',
  webSearchBaseUrlHint: '留空则使用提供方默认地址。',
  webSearchMaxUses: '单次请求最多搜索次数',
  webSearchMaxUsesHint: '一次请求在必须作答前最多可以搜索多少次。',
  subagentModelSelectionTitle: 'Subagent',
  subagentModelSelectionDescription: '控制 Agent 为 Subagent 选择模型的权限。',
  subagentModelSelectionToggle: '允许 Agent 为 Subagent 选择模型',
  subagentModelSelectionChoose: '开启后，Agent 可以从下方授权模型中，为每个 Subagent 选择提供方、模型和推理强度。仅影响新会话。',
  subagentModelSelectionAllowed: 'Agent 可选择的模型',
  subagentModelSelectionLoading: '正在加载模型…',
  subagentModelSelectionLoadFailed: '无法加载模型。',
  subagentModelSelectionRetry: '重试',
  subagentModelSelectionPartial: '部分模型提供方暂时无法加载；已保存的选择仍可移除。',
  subagentModelSelectionUnavailable: '当前不可用',
  subagentModelSelectionUnavailableGroup: '已保存但当前不可用',
  subagentModelSelectionEmpty: '当前没有模型提供方公布模型。',
  subagentModelSelectionRequired: '保存前请至少选择一个模型。',
  subagentModelSelectionConflict: '设置已在其他位置更新。请放弃修改后重试。',
  subagentModelSelectionOff: '关闭后，Subagent 使用配置的默认模型或继承父 Agent 的模型；已选模型会保留。',
}
