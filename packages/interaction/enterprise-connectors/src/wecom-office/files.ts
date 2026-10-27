/** File transfers confined to the caller workspace and one private CLI invocation. */
import { constants } from 'node:fs'
import { mkdir, mkdtemp, open, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { OfficeError } from './runtime.ts'

function contains(root: string, path: string): boolean {
  const child = relative(root, path)
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`))
}

/** Files belong to one local conversation's workspace; private grants are never inputs. */
export class OfficeFiles {
  private output: string | undefined
  private count = 0
  private readonly delivered: Array<{ path: string; bytes: number }> = []

  /**
   * @param workspace - trusted Session cwd; absent workspaces cannot transfer files.
   * @param invocation - one CLI invocation's private working directory.
   * @param privateRoots - credential/settings directories excluded from transfers.
   * @param maximum - maximum bytes in each file.
   * @param maximumFiles - maximum transfers in this operation.
   * @param maximumText - maximum preview bytes for text attachments.
   * @param signal - execution lifetime.
   */
  constructor(private readonly workspace: string | undefined, private readonly invocation: string,
    private readonly privateRoots: readonly string[], private readonly maximum: number,
    private readonly maximumFiles: number, private readonly maximumText: number, private readonly signal: AbortSignal) {}

  /** Completed workspace artifacts, safe to pass to read_file, read_image or present. */
  get artifacts(): ReadonlyArray<{ path: string; bytes: number }> { return this.delivered }

  /**
   * Snapshot an upload or retain a downloaded artifact; arbitrary Host paths are refused.
   * @param path - schema-declared file path.
   * @param direction - request upload or response download.
   * @returns private staged upload path or workspace artifact metadata.
   */
  async transfer(path: string, direction: 'request' | 'response'): Promise<unknown> {
    this.signal.throwIfAborted()
    if (++this.count > this.maximumFiles) throw new OfficeError('too-large')
    if (!this.workspace || !isAbsolute(this.workspace)) throw new OfficeError('permission-denied')
    const workspace = await realpath(this.workspace)
    const candidate = resolve(direction === 'request' ? workspace : this.invocation, path)
    const canonical = await realpath(candidate)
    const allowed = await realpath(direction === 'request' ? workspace : this.invocation)
    if (!contains(allowed, canonical) || allowed === canonical) throw new OfficeError('permission-denied')
    if (direction === 'request') {
      for (const root of this.privateRoots) {
        let privateRoot = resolve(root)
        try { privateRoot = await realpath(privateRoot) }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
        if (contains(privateRoot, canonical)) throw new OfficeError('permission-denied')
      }
      if (canonical.split(sep).some(part => ['.git', '.ssh', '.encryption_key', 'credentials.enc'].includes(part)
        || /^\.env(?:\.|$)/.test(part))) throw new OfficeError('permission-denied')
    }
    const handle = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW)
    let bytes: Buffer
    try {
      const stat = await handle.stat()
      if (!stat.isFile()) throw new OfficeError('invalid-result')
      if (stat.size > this.maximum) throw new OfficeError('too-large')
      bytes = Buffer.alloc(stat.size + 1)
      let offset = 0
      while (offset < bytes.length) {
        this.signal.throwIfAborted()
        const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset)
        if (bytesRead === 0) break
        offset += bytesRead
      }
      if (offset > this.maximum || offset > stat.size) throw new OfficeError('too-large')
      bytes = bytes.subarray(0, offset)
    } finally { await handle.close() }
    this.signal.throwIfAborted()
    const name = `${this.count}-${basename(canonical).replace(/[^\p{L}\p{N}._-]/gu, '_').slice(-120) || 'file'}`
    if (direction === 'request') {
      const area = join(this.invocation, `upload-${this.count}`)
      await mkdir(area, { mode: 0o700 })
      const staged = join(area, basename(canonical))
      await writeFile(staged, bytes, { flag: 'wx', mode: 0o600, signal: this.signal })
      return staged
    }
    this.output ??= await mkdtemp(join(workspace, '.wecom-result-'))
    const destination = join(this.output, name)
    await writeFile(destination, bytes, { flag: 'wx', mode: 0o600, signal: this.signal })
    const artifact = { path: destination, bytes: bytes.length }
    this.delivered.push(artifact)
    const plain = /\.(?:txt|md|json|csv|tsv|html|xml|log)$/i.test(name)
    return { ...artifact, ...(plain ? { preview: new TextDecoder().decode(bytes.subarray(0, this.maximumText),
      { stream: bytes.length > this.maximumText }), truncated: bytes.length > this.maximumText } : {}) }
  }

  /** Remove unpublished downloads after a failed operation. */
  async rollback(): Promise<void> { if (this.output) await rm(this.output, { recursive: true, force: true }) }
}
