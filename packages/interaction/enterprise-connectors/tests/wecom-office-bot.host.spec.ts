/** Pinned CLI credential interoperability rejects tampering and external key paths. */
import { createCipheriv, randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { readQrBot } from '../src/wecom-office/bot.ts'

let directory: string | undefined
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); directory = undefined })
async function fixture(): Promise<string> {
  directory = await mkdtemp(join(tmpdir(), 'wecom-bot-credential-'))
  const key = randomBytes(32)
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const plain = Buffer.from(JSON.stringify({ bot: { id: 'qr_bot', secret: 'fixture-private-secret' }, token: 'not-an-sdk-credential' }))
  const bytes = Buffer.concat([nonce, cipher.update(plain), cipher.final(), cipher.getAuthTag()])
  await writeFile(join(directory, '.encryption_key'), key.toString('base64'))
  await writeFile(join(directory, 'credentials.enc'), bytes)
  return directory
}
it('reads the CLI AES-GCM bot without exposing its bearer token', async () => {
  const path = await fixture()
  expect(await readQrBot(path)).toEqual({ botId: 'qr_bot', secret: 'fixture-private-secret' })
})
it('rejects modified ciphertext, invalid keys and oversized files with credential-free errors', async () => {
  const path = await fixture()
  const encrypted = join(path, 'credentials.enc')
  const bytes = await readFile(encrypted)
  bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1
  await writeFile(encrypted, bytes)
  await expect(readQrBot(path)).rejects.toThrow('WeCom office operation failed (invalid-result).')
  await writeFile(join(path, '.encryption_key'), 'not-a-key')
  await expect(readQrBot(path)).rejects.toThrow('invalid-result')
  await writeFile(join(path, '.encryption_key'), randomBytes(32).toString('base64'))
  await writeFile(encrypted, Buffer.alloc(65537))
  await expect(readQrBot(path)).rejects.toThrow('invalid-result')
})
it.skipIf(process.platform === 'win32')('refuses a key symlink even when its target contains a valid key', async () => {
  const path = await fixture()
  const keyPath = join(path, '.encryption_key')
  const key = await readFile(keyPath)
  await rm(keyPath)
  await writeFile(join(path, 'external-key'), key)
  await symlink(join(path, 'external-key'), keyPath)
  await expect(readQrBot(path)).rejects.toThrow('invalid-result')
})
