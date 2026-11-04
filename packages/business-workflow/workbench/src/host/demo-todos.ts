/** Explicitly simulated office data; this action has no connector or model dependency. */

/**
 * Build one fixed presentation case and derive its deterministic review flag.
 * @param scenario - required published input: risk or routine.
 * @returns labeled simulated todos and rule evidence, with no external operations.
 */
export function createDemoTodos(scenario: unknown) {
  if (scenario !== 'risk' && scenario !== 'routine') throw new Error('DEMO_TODO_SCENARIO_INVALID')
  const referenceDate = '2026-11-03'
  const items = scenario === 'risk' ? [
    { id: 'DEMO-Q01', title: '批次 Q20261103-01 检验报告补齐', category: '质量', deadline: '2026-11-02',
      missing_evidence: true, note: '模拟：检验报告缺失，出库前需要质量人员核实。' },
    { id: 'DEMO-Q02', title: '今日出库批次资料复核', category: '交付', deadline: '2026-11-03',
      missing_evidence: false, note: '模拟：核对已提供的出库资料，不代表已经放行。' },
    { id: 'DEMO-Q03', title: '供应商资质有效期确认', category: '供应商', deadline: '2026-11-05',
      missing_evidence: false, note: '模拟：按现有资质清单准备核对。' },
    { id: 'DEMO-Q04', title: '工艺培训材料归档准备', category: '内部管理', deadline: '2026-11-10',
      missing_evidence: false, note: '模拟：整理培训材料目录，尚未执行归档。' },
  ] : [
    { id: 'DEMO-N01', title: '例行质量会议资料整理', category: '内部管理', deadline: '2026-11-05',
      missing_evidence: false, note: '模拟：资料齐备，准备会议提纲。' },
    { id: 'DEMO-N02', title: '月度培训材料目录核对', category: '内部管理', deadline: '2026-11-10',
      missing_evidence: false, note: '模拟：资料齐备，按计划核对目录。' },
  ]
  const overdueIds = items.filter(item => item.deadline < referenceDate).map(item => item.id)
  const missingEvidenceIds = items.filter(item => item.missing_evidence).map(item => item.id)
  return { result: { simulation: true, source: 'simulated-wecom-todos', scenario, reference_date: referenceDate, items,
    total: items.length, overdue_ids: overdueIds, missing_evidence_ids: missingEvidenceIds,
    requires_review: overdueIds.length > 0 || missingEvidenceIds.length > 0, has_more: false, truncated: false } }
}
