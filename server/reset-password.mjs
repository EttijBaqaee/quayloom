import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openStore } from './store.mjs'
const password = process.env.RESET_ADMIN_PASSWORD
if (!password || password.length < 12) throw new Error('Set RESET_ADMIN_PASSWORD to a new password of at least 12 characters; stop the server before resetting.')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const store = openStore(process.env.DATA_DIR || path.join(root, 'data'), { masterKey: process.env.STUDIO_MASTER_KEY })
try { store.resetPassword(password); console.log('Administrator password reset; all sessions revoked. Update ADMIN_PASSWORD in .env if configured, then restart.') } finally { store.close() }
