/** `host-return` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'host-return'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  action: '返回 {host}',
  channelsTab: '服务连接',
  channelsIntro: '统一管理飞书和企业微信账号。新建对话时选择需要使用的插件和账号。',
  feishuPlugin: '飞书连接',
  wecomPlugin: '企业微信消息读取',
  channelEnabled: '本对话已启用',
  channelDisabled: '本对话未启用',
  channelBound: '绑定账号：{name}',
  channelConfigured: '已配置 {count} 个账号',
  channelEmpty: '尚未配置账号',
  channelLoading: '正在读取账号状态…',
  channelStandalone: '请在 RAGFlow 工作台中查看账号状态',
  channelManage: '管理账号',
  channelReadOnly: '只读，不发送或修改消息',
  feishuScope: '集中管理应用身份和用户授权，按对话启用群聊、文档和多维表格读取。读取范围受飞书成员、共享和资源权限限制。',
  wecomScope: '读取开启保存后收到的文字消息，默认读取最近 30 天。不包含此前历史、发送的回复或企业完整会话存档。',
  greeting: '你好，我是「{agent}」',
  help: '有什么可以帮你？',
  knowledge: '知识来源',
  knowledgeView: '查看已绑定知识库',
  knowledgeDialogTitle: '已绑定知识库',
  knowledgeDialogHint: '当前对话可参考以下知识库',
  knowledgeNone: '未绑定知识库',
  knowledgeMore: '另有 {count} 个',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<HostReturnKey, string> = {
  action: 'Back to {host}',
  channelsTab: 'Connections',
  channelsIntro: 'Manage Feishu and enterprise WeChat accounts here. Select plugins and accounts when starting a new conversation.',
  feishuPlugin: 'Feishu connection',
  wecomPlugin: 'Enterprise WeChat message reader',
  channelEnabled: 'Enabled for this conversation',
  channelDisabled: 'Not enabled for this conversation',
  channelBound: 'Bound account: {name}',
  channelConfigured: '{count} configured accounts',
  channelEmpty: 'No configured account',
  channelLoading: 'Loading account status…',
  channelStandalone: 'View account status in the RAGFlow workbench',
  channelManage: 'Manage accounts',
  channelReadOnly: 'Read only; cannot send or modify messages',
  feishuScope: 'Manage application and user authorization, then select chats, documents and Base reads for each conversation. Feishu membership, sharing and resource permissions apply.',
  wecomScope: 'Read text messages received after storage was enabled, within the default 30-day read window. Earlier history, outgoing replies and company-wide archives are unavailable.',
  greeting: 'Hi, I am “{agent}”',
  help: 'How can I help?',
  knowledge: 'Knowledge sources',
  knowledgeView: 'View bound knowledge bases',
  knowledgeDialogTitle: 'Bound knowledge bases',
  knowledgeDialogHint: 'This conversation can refer to the following knowledge bases',
  knowledgeNone: 'No knowledge base selected',
  knowledgeMore: '{count} more',
}

/** Key domain of the host-return namespace. */
export type HostReturnKey = keyof typeof zh
