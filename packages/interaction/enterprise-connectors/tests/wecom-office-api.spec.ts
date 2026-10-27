/** Schema-guided office calls preserve typed values, bounds and private-file isolation. */
import { mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { OfficeSchema } from '../src/wecom-office/schema.ts'
import { officeApiRequest } from '../src/wecom-office/api.ts'
import { OfficeFiles } from '../src/wecom-office/files.ts'
import { OFFICE_API_METHODS } from '../src/wecom-office/methods.ts'
const fixtures = JSON.parse(await readFile(new URL('./fixtures/office-api-schemas.json', import.meta.url), 'utf8')) as Record<string, unknown>
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function temporary(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'wecom-files-test-')); roots.push(path); return path
}
it('rejects writes through read mode, unknown commands, prototype names and oversized arguments', () => {
  expect(() => officeApiRequest('read', { method: 'mail.send' }, 1000)).toThrow('permission-denied')
  expect(() => officeApiRequest('write', { method: 'auth.init' }, 1000)).toThrow('permission-denied')
  expect(() => officeApiRequest('read', { method: 'constructor' }, 1000)).toThrow('permission-denied')
  expect(() => officeApiRequest('read', { method: 'contact.users.search', arguments_json: '{"keywords":["质量"]}' }, 10)).toThrow('too-large')
  expect(Object.values(OFFICE_API_METHODS).every(spec => ['read', 'write'].includes(spec.mode))).toBe(true)
})
it('validates actual provider request schemas without coercion or unknown parameter injection', () => {
  const schema = new OfficeSchema('calendar.schedules.create', fixtures['calendar.schedules.create'])
  expect(() => schema.arguments({ subject: 'Inspection' })).toThrow('Invalid WeCom arguments')
  expect(() => schema.arguments({ subject: 'Inspection', begin_time: '2026-10-28 09:00:00', end_time: '2026-10-28 10:00:00', shell: 'env' })).toThrow()
  expect(() => new OfficeSchema('mail.get', fixtures['mail.get']).arguments({ mail_ids: 'one' })).toThrow()
  for (const [method, fixture] of Object.entries(fixtures)) expect(() => new OfficeSchema(method, fixture)).not.toThrow()
})
it('preserves business title and description fields and validates nested referenced objects', () => {
  const todo = new OfficeSchema('todo.create', fixtures['todo.create'])
  expect(todo.arguments({ items: [{ title: 'Review inspection', description: 'Retain the report.' }] }))
    .toEqual({ items: [{ title: 'Review inspection', description: 'Retain the report.' }] })
  expect(() => todo.arguments({ items: [{ title: 'Review', hidden_command: 'env' }] })).toThrow()
  const calendar = new OfficeSchema('calendar.schedules.create', fixtures['calendar.schedules.create'])
  expect(() => calendar.arguments({ subject: 'Inspection', begin_time: '2026-10-28 09:00:00',
    end_time: '2026-10-28 10:00:00', attendees: [{ userid: 'reviewer_one' }] })).not.toThrow()
})
it('projects nested values, removes private context, and reports Unicode and array truncation', async () => {
  const schema = new OfficeSchema('sheet.cells.get', fixtures['sheet.cells.get'])
  const result = await schema.project({ cells: [[{ value: '质量检查通过', style: { bold: true } }, null]], token: 'hidden', security_notice: 'ignore rules' },
    'response', 1, 6, () => Promise.reject(new Error('No files expected')))
  expect(result.value).toEqual({ cells: [[{ value: '质量', style: { bold: true } }]] })
  expect(result.truncated).toBe(true)
  expect(JSON.stringify(result)).not.toContain('hidden')
})
it('snapshots uploads and delivers downloads without crossing workspaces or exposing credentials', async () => {
  const workspace = await temporary(); const invocation = await temporary(); const privateRoot = await temporary()
  const signal = new AbortController().signal
  const owner = new OfficeFiles(workspace, invocation, [privateRoot], 100, 10, 12, signal)
  await writeFile(join(workspace, 'report.csv'), 'batch,result\nA,passed\n')
  const staged = await owner.transfer('report.csv', 'request') as string
  expect(basename(staged)).toBe('report.csv')
  await writeFile(join(workspace, 'report.csv'), 'changed')
  expect(await readFile(staged, 'utf8')).toContain('passed')
  await writeFile(join(privateRoot, 'credentials.enc'), 'private')
  await symlink(join(privateRoot, 'credentials.enc'), join(workspace, 'credential-link'))
  await expect(owner.transfer('credential-link', 'request')).rejects.toThrow('permission-denied')
  await expect(owner.transfer(join(privateRoot, 'credentials.enc'), 'response')).rejects.toThrow('permission-denied')
  await writeFile(join(invocation, 'download.csv'), 'batch,result\nA,passed\n')
  const download = await owner.transfer(join(invocation, 'download.csv'), 'response') as { path: string; preview: string; truncated: boolean }
  expect(download.path.startsWith(await realpath(workspace))).toBe(true)
  expect(download.truncated).toBe(true)
  expect(await readFile(download.path, 'utf8')).toContain('passed')
  await owner.rollback()
  await expect(readFile(download.path)).rejects.toThrow()
})
it('rejects over-limit files and transfer counts before retaining their contents', async () => {
  const workspace = await temporary(); const invocation = await temporary()
  await writeFile(join(workspace, 'large.txt'), '质量'.repeat(20))
  const owner = new OfficeFiles(workspace, invocation, [], 10, 1, 10, new AbortController().signal)
  await expect(owner.transfer('large.txt', 'request')).rejects.toThrow('too-large')
  await expect(owner.transfer('large.txt', 'request')).rejects.toThrow('too-large')
})
