/** Workspace navigation configuration shared by Host and Client. */

/** Authenticated index-page global carrying Workspace navigation policy. */
export const WORKSPACE_BOOTSTRAP_GLOBAL = '__DSH_WORKSPACE__'

/** Loader-row configuration for initial Workspace navigation. */
export interface WorkspaceConfig {
  /** Restore the most recently updated non-blank, unarchived Workspace Session. Defaults to false. */
  resumeRecentSession?: boolean
}

/** Read the optional Host-injected initial navigation policy.
 * @param target - browser global containing the authenticated boot projection.
 * @returns true only for an explicit boolean opt-in.
 */
export function readResumeRecentSession(target: typeof globalThis): boolean {
  const value = (target as typeof globalThis & Record<string, unknown>)[WORKSPACE_BOOTSTRAP_GLOBAL]
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && (value as WorkspaceConfig).resumeRecentSession === true
}
