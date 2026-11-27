type RuntimeDocument = { querySelector(selector: string): { getAttribute(name: string): string | null } | null }
export type RuntimePaths = { basePath: string; apiOrigin: string }

/** The server only injects ASCII path segments; an empty content explicitly means root. */
export const isSafeBasePath = (value: unknown): value is string =>
  typeof value === 'string' && (value === '' || /^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.exec(value)?.[0] === value)

/** Missing meta alone preserves legacy Android/file builds and their custom API origin. */
const compiledFallback = (): RuntimePaths => {
  const basePath = typeof __BASE_PATH__ === 'string' ? __BASE_PATH__ : ''
  const apiOrigin = typeof __API_ORIGIN__ === 'string' ? __API_ORIGIN__ : `${basePath}/api`
  return { basePath, apiOrigin }
}

export function readRuntimePaths(page: RuntimeDocument | null = typeof document === 'undefined' ? null : document): RuntimePaths {
  const meta = page?.querySelector('meta[name="quayloom-base-path"]')
  if (!meta) { return compiledFallback() }
  const basePath = meta.getAttribute('content')
  // A present but malformed meta is not legacy: fail closed instead of requesting another mount.
  if (!isSafeBasePath(basePath)) { throw new Error('Invalid quayloom-base-path runtime metadata') }
  return { basePath, apiOrigin: `${basePath}/api` }
}

export const runtimeBasePath = (): string => readRuntimePaths().basePath
export const runtimeApiOrigin = (): string => readRuntimePaths().apiOrigin
