/** Host-only interoperability with the pinned official CLI encrypted bot credentials. */
import { createDecipheriv } from 'node:crypto'
import { constants } from 'node:fs'
import { open, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { OfficeError } from './runtime.ts'

/**
 * Read the bot bound by CLI 1.3.4 for the official WebSocket SDK, without copying secrets to settings.
 * @param directory - saved connection's private credentials directory.
 * @returns bot identity and secret for a Host-owned SDK lifetime.
 */
export async function readQrBot(directory: string): Promise<{ botId: string; secret: string }> {
  const read = async (name: string, maximum: number) => {
    const root = await realpath(directory)
    const path = join(root, name)
    if (await realpath(path) !== path) throw new OfficeError('invalid-result')
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const info = await file.stat()
      if (!info.isFile() || info.size > maximum) throw new OfficeError('invalid-result')
      const bytes = Buffer.alloc(maximum + 1)
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
      if (bytesRead > maximum) throw new OfficeError('invalid-result')
      return bytes.subarray(0, bytesRead)
    } finally { await file.close() }
  }
  try {
    // The pinned CLI always persists this file fallback, including on systems with a keyring.
    const encoded = (await read('.encryption_key', 128)).toString('utf8').trim()
    const key = Buffer.from(encoded, 'base64')
    if (key.byteLength !== 32 || key.toString('base64') !== encoded) throw new OfficeError('invalid-result')
    const encrypted = await read('credentials.enc', 65536)
    if (encrypted.byteLength < 28) throw new OfficeError('invalid-result')
    let plain: Buffer | undefined
    try {
      const cipher = createDecipheriv('aes-256-gcm', key, encrypted.subarray(0, 12))
      cipher.setAuthTag(encrypted.subarray(-16))
      plain = Buffer.concat([cipher.update(encrypted.subarray(12, -16)), cipher.final()])
      const value = z.object({ bot: z.object({ id: z.string().min(1).max(256), secret: z.string().min(1).max(4096) }) }).parse(JSON.parse(plain.toString('utf8')))
      return { botId: value.bot.id, secret: value.bot.secret }
    } finally { key.fill(0); plain?.fill(0) }
  } catch { throw new OfficeError('invalid-result') }
}
