import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { fail } from './validation.mjs'
import { normalizeQuota } from './quota.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
export function normalizeAccess(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Invalid access code policy')
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name || name.length > 100) fail(400, 'Access code name must contain 1–100 characters')
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') fail(400, 'enabled must be boolean')
  const expiresAt = input.expiresAt ?? null
  if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt < 1 || expiresAt > 8640000000000000)) fail(400, 'expiresAt must be null or a valid timestamp')
  if (!Array.isArray(input.allowedModels) || input.allowedModels.length < 1 || input.allowedModels.length > 500) fail(400, 'Select 1–500 allowed models')
  const keys = new Set()
  const allowedModels = input.allowedModels.map(item => {
    if (!item || typeof item.providerId !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(item.providerId) || typeof item.modelId !== 'string' || !item.modelId.trim() || item.modelId.length > 256) fail(400, 'Invalid allowed model')
    const key = JSON.stringify([item.providerId, item.modelId]); if (keys.has(key)) fail(400, 'Duplicate allowed model'); keys.add(key)
    return { providerId: item.providerId, modelId: item.modelId }
  })
  if (input.quota !== undefined) fail(400, 'Configure channelQuotas independently for each authorized channel')
  const providerIds = [...new Set(allowedModels.map(item => item.providerId))]
  const provided = input.channelQuotas ?? []
  if (!Array.isArray(provided) || provided.length > 500) fail(400, 'Invalid channel quota policy')
  const quotaMap = new Map()
  for (const item of provided) {
    if (!item || !providerIds.includes(item.providerId) || quotaMap.has(item.providerId)) fail(400, 'Channel quotas must uniquely match authorized channels')
    quotaMap.set(item.providerId, normalizeQuota(item.quota))
  }
  const channelQuotas = providerIds.map(providerId => ({ providerId, quota: quotaMap.get(providerId) ?? normalizeQuota() }))
  return { name, enabled: input.enabled ?? true, expiresAt, allowedModels, channelQuotas }
}
export const allowsModel = (access, providerId, modelId) => access.allowedModels.some(item => item.providerId === providerId && item.modelId === modelId)
export function createAccessStore(db, { encrypt, decrypt }) {
  db.exec('CREATE TABLE IF NOT EXISTS access_codes (id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, config TEXT NOT NULL, created INTEGER NOT NULL, secret TEXT)')
  if (!db.prepare('PRAGMA table_info(access_codes)').all().some(c => c.name === 'secret')) db.exec('ALTER TABLE access_codes ADD COLUMN secret TEXT')
  const columns = db.prepare('PRAGMA table_info(sessions)').all()
  if (!columns.some(c => c.name === 'principal')) db.exec("ALTER TABLE sessions ADD COLUMN principal TEXT NOT NULL DEFAULT 'admin'")
  const get = id => {
    if (typeof id !== 'string' || id.length > 128) return null
    const row = db.prepare('SELECT id,config,created FROM access_codes WHERE id=?').get(id)
    return row ? { ...JSON.parse(row.config), id: row.id, createdAt: row.created } : null
  }
  const valid = access => access && access.enabled && (access.expiresAt === null || access.expiresAt > Date.now())
  return {
    accessCode: get,
    accessCodes: () => db.prepare('SELECT id FROM access_codes ORDER BY created DESC,rowid DESC').all().map(row => get(row.id)),
    activeAccess(id) { const access = get(id); return valid(access) ? access : null },
    verifyAccessCode(code) {
      if (typeof code !== 'string' || !/^ql_[A-Za-z0-9_-]{32}$/.test(code)) return null
      const row = db.prepare('SELECT id FROM access_codes WHERE hash=?').get(hash(code))
      const access = row && get(row.id); return valid(access) ? access : null
    },
    createAccessCode(config) {
      const code = `ql_${randomBytes(24).toString('base64url')}`, id = randomUUID()
      db.prepare('INSERT INTO access_codes(id,hash,config,created,secret) VALUES(?,?,?,?,?)').run(id, hash(code), JSON.stringify(config), Date.now(), encrypt(code))
      return { accessCode: get(id), code }
    },
    revealAccessCode(id) {
      const row = db.prepare('SELECT secret FROM access_codes WHERE id=?').get(id)
      return row?.secret ? decrypt(row.secret) : null
    },
    updateAccessCode(id, config) {
      const previous = get(id)
      db.exec('BEGIN IMMEDIATE')
      try {
        db.prepare('UPDATE access_codes SET config=? WHERE id=?').run(JSON.stringify(config), id)
        if (!config.enabled || config.expiresAt !== null && config.expiresAt <= Date.now() || previous?.expiresAt !== null && previous?.expiresAt <= Date.now()) db.prepare('DELETE FROM sessions WHERE principal=?').run(id)
        else if (config.expiresAt !== null) db.prepare('UPDATE sessions SET expires=MIN(expires,?) WHERE principal=?').run(config.expiresAt, id)
        db.exec('COMMIT'); return get(id)
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
  }
}
