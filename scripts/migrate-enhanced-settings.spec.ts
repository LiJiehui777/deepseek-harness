/** Upgrade preserves account permissions and unrelated legacy settings without contacting providers. */
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { migrateEnhancedSettings } from './migrate-enhanced-settings.ts'

it('preserves references, explicit denials, knowledge scope and a byte-for-byte backup, then becomes a no-op', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dh-settings-migration-'))
  try {
    const original = JSON.stringify({ 'feishu-connector': { enabled: false, secretRef: 'FEISHU_APP_SECRET', allowedChats: ['test'] },
      'wecom-connector': { enabled: true, sendEnabled: false }, 'wecom-office-connector': { todos: true, mail: false },
      'ragflow-connector': { datasetIds: ['quality'], apiKeyEnv: 'RAGFLOW_API_KEY' }, other: { keep: true } })
    await writeFile(join(home, 'settings.yaml'), original, { mode: 0o600 })
    expect(await migrateEnhancedSettings(home)).toBe(true)
    expect(JSON.parse(await readFile(join(home, 'settings.yaml'), 'utf8'))).toEqual({
      'enterprise-connectors': { feishu: { enabled: false, secretRef: 'FEISHU_APP_SECRET', allowedChats: ['test'] },
        wecom: { enabled: true, sendEnabled: false }, wecomOffice: { todos: true, mail: false } },
      'ragflow-connector': { datasetIds: ['quality'], apiKeyEnv: 'RAGFLOW_API_KEY' }, other: { keep: true },
    })
    const backups = (await readdir(home)).filter(name => name.startsWith('settings.before-enhanced'))
    expect(backups).toHaveLength(1)
    expect(await readFile(join(home, backups[0]!), 'utf8')).toBe(original)
    expect(await migrateEnhancedSettings(home)).toBe(false)
  } finally { await rm(home, { recursive: true, force: true }) }
})

it('refuses conflicting account documents before changing the source', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dh-settings-conflict-'))
  try {
    const original = JSON.stringify({ 'wecom-connector': { enabled: false }, 'enterprise-connectors': { wecom: { enabled: true } } })
    await writeFile(join(home, 'settings.yaml'), original)
    await expect(migrateEnhancedSettings(home)).rejects.toThrow('Conflicting saved values')
    expect(await readFile(join(home, 'settings.yaml'), 'utf8')).toBe(original)
    expect(await readdir(home)).toEqual(['settings.yaml'])
  } finally { await rm(home, { recursive: true, force: true }) }
})
