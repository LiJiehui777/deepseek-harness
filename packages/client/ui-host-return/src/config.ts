/** Host-return configuration shared by the Node and browser package faces. */

export const HOST_RETURN_BOOTSTRAP_GLOBAL = '__DSH_HOST_RETURN__'

/** Loader-row configuration supplied by an embedding host application. */
export interface HostReturnConfig {
  /** Absolute HTTP(S) URL opened in the current tab. Omit to hide the action. */
  returnUrl?: string
  /** Human-readable host application name interpolated into localized copy. */
  hostName?: string
  /** RAGFlow Agent name shown as the primary product identity. */
  agentName?: string
  /** Secondary label describing the embedded work surface. */
  workspaceName?: string
  /** Selected RAGFlow knowledge-base names shown in the welcome state. */
  datasetNames?: string[]
}

/** Validated value injected into the authenticated Web boot document. */
export interface HostReturnBootstrap {
  returnUrl: string
  hostName: string
  agentName: string
  workspaceName: string
  datasetNames: string[]
}

/** Resolve a configured HTTP(S) destination.
 * @param value - untrusted configured URL.
 * @returns the normalized destination, or undefined when invalid.
 */
export function normalizeHostReturnUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return undefined
  try {
    const url = new URL(value)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username !== '' || url.password !== '') {
      return undefined
    }
    return url.href
  } catch {
    return undefined
  }
}

/** Validate and normalize the Host-to-browser payload.
 * @param value - untrusted Loader configuration.
 * @returns validated branding, or undefined when incomplete or invalid.
 */
export function resolveHostReturnBootstrap(value: unknown): HostReturnBootstrap | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const config = value as HostReturnConfig
  const returnUrl = normalizeHostReturnUrl(config.returnUrl)
  if (returnUrl === undefined) return undefined
  const configuredName = typeof config.hostName === 'string' ? config.hostName.trim() : ''
  const agentName = typeof config.agentName === 'string' ? config.agentName.trim() : ''
  const workspaceName = typeof config.workspaceName === 'string' ? config.workspaceName.trim() : ''
  const datasetNames = normalizeDatasetNames(config.datasetNames)
  if (agentName === '' || agentName.length > 255 || workspaceName.length > 80 || datasetNames === undefined) {
    return undefined
  }
  return {
    returnUrl,
    hostName: configuredName === '' ? 'RAGFlow' : configuredName.slice(0, 80),
    agentName,
    workspaceName: workspaceName === '' ? 'Agent Workspace' : workspaceName,
    datasetNames,
  }
}

function normalizeDatasetNames(value: unknown): string[] | undefined {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 100) return undefined
  const names = value.map(item => typeof item === 'string' ? item.trim() : '')
  if (names.some(name => name === '' || name.length > 128)) return undefined
  return [...new Set(names)]
}

/** Read and revalidate Host-injected branding.
 * @param target - browser global containing the bootstrap projection.
 * @returns validated branding, or undefined when unavailable or invalid.
 */
export function readHostReturnBootstrap(target: typeof globalThis): HostReturnBootstrap | undefined {
  return resolveHostReturnBootstrap(
    (target as typeof globalThis & Record<string, unknown>)[HOST_RETURN_BOOTSTRAP_GLOBAL],
  )
}
