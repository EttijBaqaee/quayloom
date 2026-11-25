import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const host = process.env.HOST || '127.0.0.1'
const port = Number(process.env.PORT || 9810)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
const publicOrigin = process.env.PUBLIC_ORIGIN
if (publicOrigin && (new URL(publicOrigin).origin !== publicOrigin || !/^https?:\/\//.test(publicOrigin))) throw new Error('PUBLIC_ORIGIN must be an exact http(s) origin without a trailing slash')
if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !publicOrigin) throw new Error('Remote bindings require PUBLIC_ORIGIN. Use HTTPS in production.')
if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD_FILE) throw new Error('Use only one administrator password source')
const adminPassword = process.env.ADMIN_PASSWORD || (process.env.ADMIN_PASSWORD_FILE ? readFileSync(process.env.ADMIN_PASSWORD_FILE, 'utf8').replace(/\r?\n$/, '') : undefined)
const app = createApp({ dataDir: process.env.DATA_DIR || path.join(root, 'data'), adminPassword, masterKey: process.env.STUDIO_MASTER_KEY, secureCookies: process.env.COOKIE_SECURE === 'true', publicOrigin, bindHost: host, quotaTimeZone: process.env.QUOTA_TIME_ZONE || 'Asia/Shanghai', basePath: process.env.BASE_PATH || '' })
app.server.on('error', error => { console.error(error.message); process.exitCode = 1; app.store.close() })
app.server.listen(port, host, () => {
  console.log(`Quayloom: ${publicOrigin || `http://${host.includes(':') ? `[${host}]` : host}:${port}`}${process.env.BASE_PATH || ''}/`)
  console.log(`Management page: ${process.env.BASE_PATH || ''}/admin`)
  if (app.store.initialPassword && !adminPassword) console.log(`Initial administrator password (shown only on first initialization): ${app.store.initialPassword}`)
  if (app.store.initialPassword && adminPassword) console.log('Administrator password initialized from the configured secret source.')
  console.log('API keys stay on this server. No DSH profile or account credentials are used.')
})
let closing = false
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { if (closing) return; closing = true; await app.close(); process.exit(0) })
