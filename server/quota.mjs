import { randomUUID } from 'node:crypto'
import { fail } from './validation.mjs'
export const DEFAULT_QUOTA = { dailyRequestLimit: null, dailyTokenLimit: null, totalTokenLimit: null, concurrencyLimit: 4 }
export function normalizeQuota(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Invalid quota policy')
  const quota = {}
  for (const name of ['dailyRequestLimit', 'dailyTokenLimit', 'totalTokenLimit']) {
    const value = input[name] ?? null
    if (value !== null && (!Number.isSafeInteger(value) || value < 1 || value > 1000000000000)) fail(400, `${name} must be null or a positive integer up to 1000000000000`)
    quota[name] = value
  }
  const concurrent = input.concurrencyLimit ?? 4
  if (!Number.isInteger(concurrent) || concurrent < 1 || concurrent > 32) fail(400, 'concurrencyLimit must be between 1 and 32')
  return { ...quota, concurrencyLimit: concurrent }
}
export function createQuotaLedger(db, { timeZone = 'Asia/Shanghai' } = {}) {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const date = () => formatter.format(new Date())
  db.exec(`CREATE TABLE IF NOT EXISTS usage_requests (
    id TEXT PRIMARY KEY, provider TEXT NOT NULL, date TEXT NOT NULL,
    created INTEGER NOT NULL, tokens INTEGER NOT NULL DEFAULT 0,
    reserved INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active', model TEXT NOT NULL, principal TEXT
  ); CREATE INDEX IF NOT EXISTS usage_provider_date ON usage_requests(provider,date);`)
  if (!db.prepare('PRAGMA table_info(usage_requests)').all().some(c => c.name === 'principal')) db.exec('ALTER TABLE usage_requests ADD COLUMN principal TEXT')
  db.exec('CREATE INDEX IF NOT EXISTS usage_principal_provider_date ON usage_requests(principal,provider,date)')
  // A restart cannot recover upstream billing; conservatively retain the reservation.
  db.exec("UPDATE usage_requests SET tokens=reserved,reserved=0,active=0,status='interrupted-restart' WHERE active=1")
  const sums = (id, day = null, field = 'provider', providerId = null) => {
    const parameters = [id, ...(providerId ? [providerId] : []), ...(day ? [day] : [])]
    const row = db.prepare(`SELECT COUNT(*) AS requests,COALESCE(SUM(tokens),0) AS tokens,COALESCE(SUM(reserved),0) AS reservedTokens,COALESCE(SUM(active),0) AS activeRequests FROM usage_requests WHERE ${field}=?${providerId ? ' AND provider=?' : ''}${day ? ' AND date=?' : ''}`).get(...parameters)
    return { requests: row.requests, tokens: row.tokens, reservedTokens: row.reservedTokens, activeRequests: row.activeRequests }
  }
  const summary = (id, quota, field, providerId = null) => {
    const total = sums(id, null, field, providerId)
    return { quota: { ...DEFAULT_QUOTA, ...quota }, daily: sums(id, date(), field, providerId), total, activeRequests: total.activeRequests }
  }
  const check = (id, quotaInput, reserved, field, label, providerId = null) => {
    const quota = { ...DEFAULT_QUOTA, ...quotaInput }, daily = sums(id, date(), field, providerId), total = sums(id, null, field, providerId)
    if (total.activeRequests >= quota.concurrencyLimit) fail(429, label === 'Provider' ? '该渠道当前并发请求已达上限，请稍后重试' : `${label} concurrent request quota reached`)
    if (quota.dailyRequestLimit !== null && daily.requests >= quota.dailyRequestLimit) fail(429, `${label} daily request quota reached`)
    if (quota.dailyTokenLimit !== null && daily.tokens + daily.reservedTokens + reserved > quota.dailyTokenLimit) fail(429, `${label} daily token allowance is insufficient for this request; lower max output tokens or raise the quota`)
    if (quota.totalTokenLimit !== null && total.tokens + total.reservedTokens + reserved > quota.totalTokenLimit) fail(429, `${label} total token allowance is insufficient for this request`)
  }
  // Last-resort release retains the original conservative token charge. It is
  // idempotent and cannot overwrite a successful (or previously completed) settlement.
  const release = reservation => db.prepare("UPDATE usage_requests SET tokens=reserved,reserved=0,active=0,status='interrupted-estimated' WHERE id=? AND active=1").run(reservation.id)
  return {
    date, timeZone, release,
    list(providers) { return { date: date(), timeZone, providers: providers.map(p => ({ providerId: p.id, ...summary(p.id, p.quota, 'provider') })) } },
    accessUsage(access) { return { date: date(), timeZone, providers: access.channelQuotas.map(channel => ({ providerId: channel.providerId, ...summary(access.id, channel.quota, 'principal', channel.providerId) })) } },
    reserve(provider, model, body, { feature = false, access = null } = {}) {
      const day = date()
      // Conservative local allowance, not a claim about the vendor tokenizer or invoice.
      const inputBytes = Buffer.byteLength(JSON.stringify({ system: body.system || '', messages: body.messages || [], tools: body.tools || [] }), 'utf8')
      // Adapters cap the dispatched output to min(requested, configured). Reserve
      // that same bound; absent/invalid limits must never weaken the model cap.
      const outputTokens = Number.isSafeInteger(body.max_tokens) && body.max_tokens > 0
        ? Math.min(body.max_tokens, model.maxOutputTokens) : model.maxOutputTokens
      const reserved = feature ? 0 : inputBytes + (body.messages?.length || 0) * 32 + outputTokens
      db.exec('BEGIN IMMEDIATE')
      try {
        check(provider.id, provider.quota, reserved, 'provider', 'Provider')
        if (access) {
          const channel = access.channelQuotas.find(item => item.providerId === provider.id)
          if (!channel) fail(403, 'Access code is not authorized for this channel')
          check(access.id, channel.quota, reserved, 'principal', 'Access code channel', provider.id)
        }
        const id = randomUUID()
        db.prepare('INSERT INTO usage_requests(id,provider,date,created,reserved,model,principal) VALUES(?,?,?,?,?,?,?)').run(id, provider.id, day, Date.now(), reserved, model.id, access?.id ?? null)
        db.exec('COMMIT'); return { id, reserved }
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
    settle(reservation, usage, status = 'completed') {
      // Only a real usage frame with both counts can reduce the reservation. Unknown/aborted requests retain it.
      try {
        const valid = usage && Number.isSafeInteger(usage.input_tokens) && usage.input_tokens >= 0 && Number.isSafeInteger(usage.output_tokens) && usage.output_tokens >= 0
        const tokens = valid ? usage.input_tokens + usage.output_tokens + (Number.isSafeInteger(usage.cache_creation_input_tokens) && usage.cache_creation_input_tokens > 0 ? usage.cache_creation_input_tokens : 0) + (Number.isSafeInteger(usage.cache_read_input_tokens) && usage.cache_read_input_tokens > 0 ? usage.cache_read_input_tokens : 0) : reservation.reserved
        db.prepare('UPDATE usage_requests SET tokens=?,reserved=0,active=0,status=? WHERE id=? AND active=1').run(tokens, valid ? status : `${status}-estimated`, reservation.id)
      } finally { release(reservation) }
    },
  }
}
