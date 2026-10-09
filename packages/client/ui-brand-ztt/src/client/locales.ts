/** Namespace for standalone ZTT product presentation. */
export const NS = 'ztt-brand'

/** Chinese product copy and key domain. */
export const zh = {
  name: '中天质量智能体',
  company: '中天科技 · 质量工作台',
  tagline: '连接企业知识，辅助质量工作',
  tasks: '质量知识检索 · 检验资料整理 · 报告辅助编写',
} as const

/** Translation keys owned by the ZTT brand. */
export type ZttBrandKey = keyof typeof zh

/** English product copy with the same keys. */
export const en: Record<ZttBrandKey, string> = {
  name: 'ZTT Quality Assistant',
  company: 'ZTT · Quality workspace',
  tagline: 'Connect enterprise knowledge to quality work',
  tasks: 'Knowledge retrieval · Inspection records · Report drafting',
}
