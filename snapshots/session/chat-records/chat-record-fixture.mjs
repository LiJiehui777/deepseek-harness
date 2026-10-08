/** Scoped deterministic channel bridge for the real headless plugin composition. */
import * as Records from '@deepseek-ai/dsh-tool-chat-records'
import { applyLoopbackServerEffect } from '../loopback-fixture-server.mjs'

export const name = 'chat-record-fixture'
export const inject = ['tools']

/** Own the loopback bridge and both native plugin instances through the fixture fiber. */
export async function apply(ctx) {
  await applyLoopbackServerEffect(ctx, {
    label: name,
    requestListener: async (req, res) => {
      if (req.method !== 'POST' || req.url !== '/read' || req.headers.authorization !== 'Bearer fixture-only') {
        res.writeHead(403)
        res.end()
        return
      }
      try {
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (!['feishu', 'wecom'].includes(body.channel) || !['chats', 'messages'].includes(body.operation)
          || Object.keys(body).some(key => !['channel', 'operation', 'chat_id', 'page_size'].includes(key))
          || body.operation === 'messages' && body.chat_id !== `${body.channel}-room`) throw new Error('Invalid scoped read')
        const items = body.operation === 'chats'
          ? [{ chat_id: `${body.channel}-room`, name: 'Project room' }]
          : [{ chat_id: `${body.channel}-room`, message_id: `${body.channel}-m1`, sender_id: 'fixture-sender', text: '项目按计划推进' }]
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ channel: body.channel, account_name: 'Fixture account', scope: 'read_only_fixture', kind: body.operation, items, has_more: false, next_cursor: '' }))
      } catch {
        res.writeHead(400)
        res.end()
      }
    },
    onListening(address) {
      for (const channel of ['feishu', 'wecom']) {
        ctx.plugin(Records, { channel, endpoint: `http://127.0.0.1:${address.port}/read`, token: 'fixture-only', maxResultBytes: 4096, maxPageSize: 50, timeoutMs: 10000 })
      }
    },
    onCleanup() {},
  })
}
