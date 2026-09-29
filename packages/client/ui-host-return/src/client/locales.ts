/** `host-return` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'host-return'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  action: '返回 {host}',
  greeting: '你好，我是「{agent}」',
  help: '有什么可以帮你？',
  knowledge: '知识来源',
  knowledgeView: '查看已绑定知识库',
  knowledgeDialogTitle: '已绑定知识库',
  knowledgeDialogHint: '当前智能体可检索以下知识库',
  knowledgeNone: '未绑定知识库',
  knowledgeMore: '另有 {count} 个',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<HostReturnKey, string> = {
  action: 'Back to {host}',
  greeting: 'Hi, I am “{agent}”',
  help: 'How can I help?',
  knowledge: 'Knowledge sources',
  knowledgeView: 'View bound knowledge bases',
  knowledgeDialogTitle: 'Bound knowledge bases',
  knowledgeDialogHint: 'This Agent can search the following knowledge bases',
  knowledgeNone: 'No knowledge base selected',
  knowledgeMore: '{count} more',
}

/** Key domain of the host-return namespace. */
export type HostReturnKey = keyof typeof zh
