import { runtimeBasePath } from './runtimePaths.js'

/** Public mount point injected by the running server, with legacy build fallback. */
export const appPath = (path = '/') => `${runtimeBasePath()}${path}`
