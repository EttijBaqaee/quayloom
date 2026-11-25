import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { randomBytes, createHash, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto'
import { createAccessStore } from './access.mjs'

export const capabilities = (overrides = {}) => ({ thinking: false, search: false, files: false, vision: false, speech: false, ...overrides })
const model = (id, name, caps = {}) => ({ id, name, capabilities: capabilities(caps), maxOutputTokens: 4096 })
export const PRESETS = [
  { id: 'deepseek', name: 'DeepSeek', type: 'deepseek', baseUrl: 'https://api.deepseek.com', models: [model('deepseek-flash', 'DeepSeek Flash', { thinking: true, search: true, files: true, vision: true, speech: true }), model('deepseek-v4-pro', 'DeepSeek V4 Pro', { thinking: true, search: true, files: true, vision: true, speech: true })] },
  { id: 'openai', name: 'OpenAI', type: 'openai', baseUrl: 'https://api.openai.com/v1', models: [] },
  { id: 'anthropic', name: 'Anthropic', type: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', models: [] },
  { id: 'openrouter', name: 'OpenRouter', type: 'openai', baseUrl: 'https://openrouter.ai/api/v1', models: [] },
  { id: 'ollama', name: 'Ollama（本机）', type: 'openai', baseUrl: 'http://127.0.0.1:11434/v1', allowPrivateNetwork: true, models: [] },
  { id: 'custom', name: '自定义兼容供应商', type: 'openai', baseUrl: '', models: [] },
]
export const hashToken = (value) => createHash('sha256').update(value).digest('hex')
const passwordHash = (password, salt) => scryptSync(password, salt, 64).toString('hex')
export function openStore(dataDir, { adminPassword, masterKey } = {}) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  const keyFile = path.join(dataDir, 'master.key')
  let key
  if (masterKey) {
    key = Buffer.from(masterKey, 'base64')
    if (key.length !== 32) throw new Error('STUDIO_MASTER_KEY must be a base64-encoded 32-byte key')
  } else {
    if (!existsSync(keyFile)) {
      if (existsSync(path.join(dataDir, 'studio.sqlite'))) throw new Error('master.key is missing for an existing database; restore its original key or supply STUDIO_MASTER_KEY')
      writeFileSync(keyFile, randomBytes(32), { mode: 0o600, flag: 'wx' })
    }
    key = readFileSync(keyFile)
    if (key.length !== 32) throw new Error('Invalid master.key; restore the original key from backup')
  }
  const db = new DatabaseSync(path.join(dataDir, 'studio.sqlite'))
  try {
  // This MVP has one owner process. Exclusive locking prevents a second instance
  // from treating live reservations as crashed requests and bypassing concurrency.
  db.exec(`PRAGMA locking_mode=EXCLUSIVE; PRAGMA busy_timeout=1000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; BEGIN EXCLUSIVE; COMMIT;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS providers (id TEXT PRIMARY KEY, config TEXT NOT NULL, secret TEXT);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY CHECK(id=1), snapshot TEXT NOT NULL, revision INTEGER NOT NULL);`)
  const getSetting = (name) => { const row = db.prepare('SELECT value FROM settings WHERE key=?').get(name); return row ? JSON.parse(row.value) : null }
  const setSetting = (name, value) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(name, JSON.stringify(value))
  const keyCheck = hashToken(key)
  const previousKeyCheck = getSetting('masterKeyCheck')
  if (previousKeyCheck && previousKeyCheck !== keyCheck) throw new Error('Master key does not match this database; restore the original key')
  if (!previousKeyCheck) setSetting('masterKeyCheck', keyCheck)
  let initialPassword
  if (!getSetting('password')) {
    initialPassword = adminPassword || randomBytes(18).toString('base64url')
    if (initialPassword.length < 12 || initialPassword.length > 1024) throw new Error('ADMIN_PASSWORD must contain 12–1024 characters')
    const salt = randomBytes(16).toString('hex')
    setSetting('password', { salt, hash: passwordHash(initialPassword, salt) })
  } else if (adminPassword) {
    const record = getSetting('password')
    if (!timingSafeEqual(Buffer.from(record.hash, 'hex'), Buffer.from(passwordHash(adminPassword, record.salt), 'hex'))) {
      throw new Error('ADMIN_PASSWORD differs from initialized password; use the password-reset command explicitly')
    }
  }
  const encrypt = (plain) => {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    return [iv, cipher.getAuthTag(), encrypted].map(b => b.toString('base64')).join('.')
  }
  const decrypt = (secret) => {
    if (!secret) return ''
    const [iv, tag, data] = secret.split('.').map(v => Buffer.from(v, 'base64'))
    const cipher = createDecipheriv('aes-256-gcm', key, iv); cipher.setAuthTag(tag)
    return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8')
  }
  const providers = () => db.prepare('SELECT * FROM providers ORDER BY rowid').all().map(row => ({ ...JSON.parse(row.config), hasApiKey: Boolean(row.secret) }))
  const provider = (id, secret = false) => {
    if (typeof id !== 'string' || id.length > 128) return null
    const row = db.prepare('SELECT * FROM providers WHERE id=?').get(id)
    return row ? { ...JSON.parse(row.config), hasApiKey: Boolean(row.secret), ...(secret ? { apiKey: decrypt(row.secret) } : {}) } : null
  }
  const reconcileDefault = () => {
    const list = providers(), current = getSetting('defaultModel')
    if (current && list.some(p => p.enabled && p.id === current.providerId && p.models.some(m => m.id === current.modelId))) return current
    const p = list.find(p => p.enabled && p.models.length)
    const value = p ? { providerId: p.id, modelId: p.models[0].id } : null
    setSetting('defaultModel', value); return value
  }
  const access = createAccessStore(db, { encrypt, decrypt })
  const sessionInfo = token => {
    if (typeof token !== 'string' || !token || token.length > 128) return null
    const row = db.prepare('SELECT principal FROM sessions WHERE token=? AND expires>?').get(hashToken(token), Date.now())
    if (!row) return null
    if (row.principal === 'admin') return { id: 'admin', role: 'admin', name: '管理员', expiresAt: null }
    const code = access.activeAccess(row.principal)
    return code ? { id: code.id, role: 'user', name: code.name, expiresAt: code.expiresAt } : null
  }
  return {
    ...access, sessionInfo,
    db, initialPassword, getSetting, setSetting, providers, provider, reconcileDefault,
    verifyPassword(password) {
      const record = getSetting('password')
      if (typeof password !== 'string' || password.length > 1024) return false
      return timingSafeEqual(Buffer.from(record.hash, 'hex'), Buffer.from(passwordHash(password, record.salt), 'hex'))
    },
    resetPassword(password) {
      if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw new Error('Password must contain 12–1024 characters')
      const salt = randomBytes(16).toString('hex')
      db.exec('BEGIN IMMEDIATE')
      try { setSetting('password', { salt, hash: passwordHash(password, salt) }); db.exec('DELETE FROM sessions; COMMIT') } catch (e) { db.exec('ROLLBACK'); throw e }
    },
    createSession(principal = 'admin') {
      const code = principal === 'admin' ? null : access.activeAccess(principal)
      if (principal !== 'admin' && !code) throw new Error('Access code is unavailable')
      const token = randomBytes(32).toString('base64url'), expires = Math.min(Date.now() + 7 * 86400000, code?.expiresAt ?? Infinity)
      db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now())
      db.prepare('INSERT INTO sessions(token,expires,principal) VALUES(?,?,?)').run(hashToken(token), expires, principal)
      return token
    },
    session(token) { return Boolean(sessionInfo(token)) },
    logout(token) { if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(hashToken(token)) },
    saveProvider(config, { apiKey, clearApiKey = false } = {}) {
      const previous = db.prepare('SELECT secret FROM providers WHERE id=?').get(config.id)
      const secret = clearApiKey ? null : apiKey ? encrypt(apiKey) : previous?.secret || null
      db.prepare('INSERT INTO providers(id,config,secret) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config, secret=excluded.secret').run(config.id, JSON.stringify(config), secret)
      reconcileDefault(); return provider(config.id)
    },
    deleteProvider(id) { db.prepare('DELETE FROM providers WHERE id=?').run(id); reconcileDefault() },
    history() { const row = db.prepare('SELECT snapshot,revision FROM history WHERE id=1').get(); return row ? { snapshot: JSON.parse(row.snapshot), revision: row.revision } : { snapshot: null, revision: 0 } },
    saveHistory(snapshot, revision) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const current = db.prepare('SELECT revision FROM history WHERE id=1').get()?.revision || 0
        if (revision !== current) { db.exec('ROLLBACK'); return null }
        const next = current + 1
        db.prepare('INSERT INTO history(id,snapshot,revision) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot,revision=excluded.revision').run(JSON.stringify(snapshot), next)
        db.exec('COMMIT'); return next
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
    close() { db.close() },
  }
  } catch (error) { db.close(); throw error }
}
