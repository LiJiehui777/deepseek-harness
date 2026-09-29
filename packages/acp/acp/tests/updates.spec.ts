import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { LlmAttemptId, ToolCallId, MessageId } from '@deepseek-ai/dsh-llm'
import { SessionSeq, type Session, type SessionEvent } from '@deepseek-ai/dsh-session'
import { assistantUpdates, liveAssistantUpdate, toolCallUpdate, toolResultUpdate } from '../src/updates.ts'

/** Minimal committed assistant event for pure update projection tests. */
function assistantEvent(
  content: SessionEvent<'assistant/message'>['data']['message']['content'],
  usage?: SessionEvent<'assistant/message'>['data']['usage'],
): SessionEvent<'assistant/message'> {
  return {
    type: 'assistant/message',
    surfaceOp: 'append',
    seq: SessionSeq(0),
    time: 0,
    data: {
      stream: [],
      turn: 1,
      step: 1,
      message: {
        id: MessageId('message-1'),
        role: 'assistant',
        source: { kind: 'model', provider: 'mock', model: 'mock' },
        content,
      },
      ...usage === undefined ? {} : { usage },
    },
  }
}

describe('standard ACP update projection', () => {
  it('projects live text and reasoning deltas without exposing control chunks', () => {
    const frame = {
      type: 'chunk' as const,
      attemptId: LlmAttemptId('session:1'),
      revision: 2,
      index: 0,
      time: 1,
    }

    expect(liveAssistantUpdate({ ...frame, chunk: { type: 'text-delta', index: 0, text: 'a' } }))
      .toMatchObject({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'a' } })
    expect(liveAssistantUpdate({ ...frame, chunk: { type: 'reasoning-delta', index: 0, text: 'b' } }))
      .toMatchObject({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'b' } })
    expect(liveAssistantUpdate({ ...frame, chunk: { type: 'finish', reason: { kind: 'stop' } } }))
      .toBeUndefined()
  })

  it('omits empty reasoning, unsupported assistant blocks, and absent usage', async () => {
    const ctx = { get: () => undefined } as unknown as Context
    const session = { requestContext: () => undefined } as unknown as Session
    const event = assistantEvent([
      { type: 'reasoning', text: '' },
      { type: 'tool-call', id: ToolCallId('call-hidden'), name: 'hidden', arguments: '{}' },
    ])

    await expect(assistantUpdates(ctx, session, event)).resolves.toEqual([])
  })

  it('requires both measured usage and context capacity', async () => {
    const meter = { measure: vi.fn(() => ({ totalTokens: 7 })) }
    const withMeter = { get: (name: string) => name === 'tokenMeter' ? meter : undefined } as unknown as Context
    const withoutMeter = { get: () => undefined } as unknown as Context
    const withCapacity = { requestContext: () => ({ contextWindow: 100 }) } as unknown as Session
    const withoutCapacity = { requestContext: () => undefined } as unknown as Session
    const event = assistantEvent([{ type: 'text', text: 'done' }], { inputTokens: 1, outputTokens: 1 })

    expect((await assistantUpdates(withMeter, withoutCapacity, event)).map(update => update.sessionUpdate))
      .toEqual(['agent_message_chunk'])
    expect((await assistantUpdates(withoutMeter, withCapacity, event)).map(update => update.sessionUpdate))
      .toEqual(['agent_message_chunk'])
    expect(meter.measure).not.toHaveBeenCalled()
  })

  it('can omit committed text and reasoning after their live deltas were delivered', async () => {
    const ctx = { get: () => undefined } as unknown as Context
    const session = { requestContext: () => undefined } as unknown as Session
    const event = assistantEvent([
      { type: 'reasoning', text: 'thought' },
      { type: 'text', text: 'answer' },
    ])

    await expect(assistantUpdates(ctx, session, event, {
      includeText: false,
      includeReasoning: false,
    })).resolves.toEqual([])
  })

  it('preserves malformed tool input and projects a failed result without hidden content', async () => {
    const call = toolCallUpdate({
      type: 'tool/call',
      seq: SessionSeq(0),
      time: 0,
      data: { turn: 1, step: 1, callId: ToolCallId('call-bad'), name: 'broken', arguments: '{' },
    })
    const result = await toolResultUpdate({ get: () => undefined } as unknown as Context, {
      type: 'tool/result',
      surfaceOp: 'append',
      seq: SessionSeq(0),
      time: 0,
      data: {
        turn: 1,
        step: 1,
        message: {
          id: MessageId('tool-message'),
          role: 'user',
          source: { kind: 'tool', callId: ToolCallId('call-bad') },
          content: [{
            type: 'tool-result',
            toolCallId: ToolCallId('call-bad'),
            isError: true,
            content: [{ type: 'reasoning', text: 'hidden' }],
          }],
        },
      },
    })

    expect(call).toMatchObject({ rawInput: '{' })
    expect(result).toEqual({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call-bad',
      status: 'failed',
      content: [],
    })
  })
})
