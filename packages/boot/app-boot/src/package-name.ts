/** Package-name parsing for plugin metadata resources. */
import { isBuiltin } from 'node:module'
/**
 * Resolve the root package of a bare module specifier.
 * @param request - module specifier to inspect.
 * @returns the package name, or undefined for paths and URLs.
 */
export function barePackageName(request: string): string | undefined {
  if (!request || request[0] === '.' || request[0] === '/' || request[0] === '\\'
    || request[0] === '#' || request.includes(':') || isBuiltin(request)) return
  const first = request.indexOf('/')
  if (request[0] !== '@') return first < 0 ? request : request.slice(0, first)
  if (first < 0) return
  const second = request.indexOf('/', first + 1)
  return second < 0 ? request : request.slice(0, second)
}
