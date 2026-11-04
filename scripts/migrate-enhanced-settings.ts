/** Move enhanced account sections into the profile-backed settings layout before DH starts. */
import { constants } from 'node:fs'
import { copyFile, readFile, lstat, chmod } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import yaml from 'js-yaml'
import { writeFileAtomic, withFileLock } from '@deepseek-ai/dsh-atomic-write'

const sections = { 'feishu-connector': 'feishu', 'wecom-connector': 'wecom', 'wecom-office-connector': 'wecomOffice' } as const

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Preserve a private backup and merge only the three enhanced account sections.
 * @param home - DH data directory; never the repository root.
 * @returns whether a legacy document was rewritten. No account is contacted.
 * @throws if input is not a plain settings document, contains conflicting account values, or cannot be backed up.
 */
export async function migrateEnhancedSettings(home: string): Promise<boolean> {
  const file = join(home, 'settings.yaml')
  let stat
  try { stat = await lstat(file) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
  if (!stat.isFile() || stat.size > 1048576) throw new Error('Enhanced settings migration requires a regular settings.yaml smaller than 1 MiB.')
  return withFileLock(file, async () => {
    const original = await readFile(file)
    const document: unknown = yaml.load(original.toString('utf8'), { schema: yaml.JSON_SCHEMA })
    if (!object(document)) throw new Error('Enhanced settings migration requires a settings object.')
    const present = Object.keys(sections).filter(key => Object.hasOwn(document, key))
    if (!present.length) return false
    const existing = document['enterprise-connectors']
    if (existing !== undefined && !object(existing)) throw new Error('The enterprise-connectors settings entry must be an object.')
    const accounts: Record<string, unknown> = { ...existing }
    for (const [legacy, key] of Object.entries(sections)) {
      if (!Object.hasOwn(document, legacy)) continue
      const value = document[legacy]
      if (!object(value)) throw new Error(`The ${legacy} settings section must be an object.`)
      if (Object.hasOwn(accounts, key) && !isDeepStrictEqual(accounts[key], value)) {
        throw new Error(`Conflicting saved values for ${legacy}; resolve them before upgrading.`)
      }
      accounts[key] = value
    }
    const digest = createHash('sha256').update(original).digest('hex')
    const backup = join(home, `settings.before-enhanced-0.2.2.${digest}.yaml`)
    try { await copyFile(file, backup, constants.COPYFILE_EXCL) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (!original.equals(await readFile(backup))) throw new Error('The enhanced settings backup does not match the source document.')
    }
    await chmod(backup, 0o600)
    if (!original.equals(await readFile(file))) throw new Error('Saved settings changed during migration; restart after other writers stop.')
    for (const key of present) Reflect.deleteProperty(document, key)
    document['enterprise-connectors'] = accounts
    await writeFileAtomic(file, JSON.stringify(document, null, 2) + '\n', { mode: 0o600 })
    return true
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const home = process.argv[2]
  if (!home) throw new Error('A DH data directory is required.')
  if (await migrateEnhancedSettings(home)) console.log('Saved enhanced account settings migrated; a private backup was retained.')
}
