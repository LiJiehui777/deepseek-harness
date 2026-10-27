/** External CLI fixture: the real DH subprocess owner still runs and cancels every command. */
import { appendFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'

const [control, ...args] = process.argv.slice(2)
const credentials = process.env.WECOM_CLI_CONFIG_DIR
const calls = join(control, 'calls.ndjson')
appendFileSync(calls, JSON.stringify({ args, pid: process.pid, credentials, event: 'start' }) + '\n')
process.on('exit', () => { appendFileSync(calls, JSON.stringify({ pid: process.pid, event: 'exit' }) + '\n') })
process.on('SIGTERM', () => { process.exit(0) })
const emit = value => { process.stdout.write(JSON.stringify(value)); process.exit(0) }
const exists = async path => { try { await readFile(path); return true } catch { return false } }
if (args[0] === '--version') { console.log('wecom-cli 1.3.4 (fixture)'); process.exit(0) }
if (args[0] === 'auth' && args[1] === 'show') {
  console.log(await exists(join(credentials, 'credentials.enc')) ? 'authorized' : 'unauthorized')
  process.exit(0)
}
if (args[0] === 'auth' && args[1] === 'init') {
  const output = args[args.indexOf('--output-qrcode') + 1]
  await writeFile(output, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64'))
  console.log('fixture authorization output contains fixture-secret and is never returned to the browser')
  while (!await exists(join(control, 'approve'))) await setTimeout(20)
  await mkdir(credentials, { recursive: true })
  await writeFile(join(credentials, 'credentials.enc'), 'fixture-encrypted-account')
  process.exit(0)
}
if (await exists(join(control, 'fail'))) { emit({ error: { code: 853006, message: 'fixture-secret must not escape' } }) }
if (args[0] === 'identity') emit({ authorizer: { name: 'Quality user', userid: 'fixture-user-id' }, corporation: { name: 'Quality organization' }, token: 'fixture-secret' })
if (args[0] === 'schema') emit({ method: args[2], request: { type: 'object' }, response: { type: 'object' }, schemas: {} })
const payload = args.includes('--json') ? JSON.parse(args[args.indexOf('--json') + 1]) : {}
if (args[0] === 'doc' && args[1] === 'search') emit({ docs: [
  { docid: 'doc_quality', doc_name: 'Quality inspection requirements', doc_type: 'doc', url: 'https://doc.weixin.qq.com/doc/doc_quality', secret: 'fixture-secret' },
  { docid: 'a1_quality', doc_name: 'Quality smart document', doc_type: 'smartpage', url: 'https://doc.weixin.qq.com/smartpage/a1_quality' },
], has_more: true, next_cursor: 'page_two' })
if (args[0] === 'doc' && args[1] === 'contents') {
  if (payload.docid === 'outside') emit({ name: 'Outside', file_path: join(control, 'outside.txt') })
  if (payload.docid === 'large') {
    const file = join(process.cwd(), 'document.md')
    await writeFile(file, '质量要求'.repeat(40000))
    emit({ name: 'Long quality document', file_path: file, url: 'https://doc.weixin.qq.com/doc/large' })
  }
  emit({ name: 'Quality inspection requirements', content: 'Inspect every incoming batch and retain the test report.', url: 'https://doc.weixin.qq.com/doc/doc_quality', token: 'fixture-secret' })
}
if (args[0] === 'smartpage') emit({ doc_title: 'Quality smart document', pages: [
  { page_id: 'quality_page', page_title: 'Inspection', parent_id: '', ...(payload.page_id ? { content_file_inner: 'Retain inspection evidence.' } : {}) },
] })
if (args[0] === 'disk') {
  const file = { id: 'quality_file', file_name: 'Quality report.pdf', type: 'file', file_size: 2048, space_name: 'Quality', path: '/Quality/Quality report.pdf' }
  emit(args[2] === 'get' ? { file } : { files: [file], has_more: false })
}
if (args[0] === 'calendar') emit({ schedule_list: [{ schedule_id: 'quality_review', subject: 'Quality review', begin_time: '2026-10-27 09:00:00', end_time: '2026-10-27 10:00:00', attendees: [{ name: 'Reviewer', userid: 'hidden-user' }] }] })
if (args[0] === 'todo') emit({ items: [{ todo_id: 'td_quality', title: 'Review inspection report', status: 'proceed', deadline: { type: 'date', value: '2026-10-28' }, secret: 'fixture-secret' }], has_more: false })
emit({ error: { code: 853006 } })
