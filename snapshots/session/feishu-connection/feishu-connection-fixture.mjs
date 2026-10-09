/** Deterministic read-only Feishu resources for the shipped headless composition. */
import * as Connection from '@deepseek-ai/dsh-tool-feishu-connection'
import { applyLoopbackServerEffect } from '../loopback-fixture-server.mjs'
export const name = 'feishu-connection-fixture'
export const inject = ['tools']
export async function apply(ctx) {
  await applyLoopbackServerEffect(ctx, {
    label: name,
    requestListener: async (req, res) => {
      if (req.method !== 'POST' || req.url !== '/read' || req.headers.authorization !== 'Bearer fixture-only') { res.writeHead(403); res.end(); return }
      try {
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (body.channel !== 'feishu' || !['document', 'tables', 'fields', 'records'].includes(body.operation)
          || body.resource !== (body.operation === 'document' ? 'DocA' : 'BaseA')
          || ['fields', 'records'].includes(body.operation) && body.table_id !== 'tblA'
          || Object.keys(body).some(key => !['channel', 'operation', 'resource', 'table_id', 'page_size'].includes(key))) throw new Error('Invalid selected read')
        const items = body.operation === 'document' ? [{ document_id: 'DocA', text: '项目按计划推进' }]
          : body.operation === 'tables' ? [{ table_id: 'tblA', name: 'Projects' }]
          : body.operation === 'fields' ? [{ field_id: 'fldA', field_name: 'Status', type: 1 }]
          : [{ record_id: 'recA', fields: { Status: 'On schedule' } }]
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ channel: 'feishu', account_name: 'Fixture connection', scope: 'read_only_fixture', kind: body.operation, items, ...(body.operation === 'document' ? {} : { has_more: false, next_cursor: '' }) }))
      } catch { res.writeHead(400); res.end() }
    },
    onListening(address) {
      ctx.plugin(Connection, { capabilities: ['chats', 'documents', 'bitable'], endpoint: `http://127.0.0.1:${address.port}/read`, token: 'fixture-only', maxResultBytes: 4096, maxPageSize: 50, timeoutMs: 10000 })
    },
    onCleanup() {},
  })
}
