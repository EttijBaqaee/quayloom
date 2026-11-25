// SPDX-License-Identifier: AGPL-3.0-only
import { fail } from './validation.mjs'

const DAY = 86400000, SHANGHAI_OFFSET = 8 * 3600000
export const MAX_ANALYTICS_RETAINED_JOBS = 50000
const displayName = value => typeof value === 'string' ? value.replace(/\b(?:ql_[A-Za-z0-9_-]{32}|sk-[A-Za-z0-9_-]{8,})\b/g, '[已隐藏]').replace(/(?:Bearer|Basic)\s+\S+|(?:api[_-]?key|authorization|token|password|secret)["']?\s*[=:]\s*["']?[^\s,"'}]+/gi, '[已隐藏]').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/[A-Za-z0-9+/=_-]{80,}/g, '[已隐藏]').replace(/\s+/g, ' ').trim().slice(0, 80) : ''
const fields = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheCreationTokens']
const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : null
const identifier = value => typeof value === 'string' && /^[^\s\x00-\x1f\x7f]{1,256}$/.test(value) ? value : null
const dateString = milliseconds => new Date(milliseconds + SHANGHAI_OFFSET).toISOString().slice(0, 10)
function midnight(value) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value || '')) fail(400, '日期须为 2000–2099 年的 YYYY-MM-DD')
  const utc = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== value) fail(400, '日期无效')
  // Asia/Shanghai has no DST in the explicitly supported 2000–2099 interval.
  return utc - SHANGHAI_OFFSET
}
export function parseAnalyticsQuery(params = new URLSearchParams(), now = Date.now()) {
  const allowed = new Set(['range', 'start', 'end', 'providerId', 'modelId', 'owner', 'limit', 'offset'])
  for (const key of params.keys()) if (!allowed.has(key) || params.getAll(key).length !== 1) fail(400, '分析查询参数无效')
  const range = params.get('range') ?? '7'
  if (!['7', '30', 'custom'].includes(range)) fail(400, '请选择近 7 天、30 天或自定义日期')
  if (range !== 'custom' && (params.has('start') || params.has('end'))) fail(400, '自定义日期须使用 custom 范围')
  const end = range === 'custom' ? params.get('end') : dateString(now)
  const endUtc = midnight(end)
  const start = range === 'custom' ? params.get('start') : dateString(endUtc - (Number(range) - 1) * DAY)
  const startUtc = midnight(start), endExclusiveUtc = endUtc + DAY
  const days = (endExclusiveUtc - startUtc) / DAY
  if (days < 1 || days > 366) fail(400, '日期范围须为 1–366 天（含首尾日期）')
  const number = (key, fallback, min, max) => {
    const raw = params.get(key)
    if (raw === null) return fallback
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < min || Number(raw) > max) fail(400, '分析分页参数无效')
    return Number(raw)
  }
  const query = { range, start, end, startUtc, endExclusiveUtc, days, limit: number('limit', 25, 1, 100), offset: number('offset', 0, 0, 1000000) }
  for (const key of ['providerId', 'modelId', 'owner']) {
    const raw = params.get(key)
    if (raw !== null && !identifier(raw)) fail(400, '分析过滤参数无效')
    query[key] = raw
  }
  return query
}
function aggregate(rows) {
  const counts = { requests: rows.length, success: 0, failed: 0, interrupted: 0, running: 0, unknownStatus: 0 }
  for (const row of rows) counts[row.status === 'done' ? 'success' : row.status === 'error' ? 'failed' : row.status === 'interrupted' ? 'interrupted' : row.status === 'running' ? 'running' : 'unknownStatus']++
  const terminal = rows.filter(row => row.actualUsageEligible)
  const actualUsage = { terminalRequests: terminal.length }
  for (const field of fields) {
    let total = 0, known = 0, overflow = false
    for (const row of terminal) if (row[field] !== null) { known++; total += row[field]; if (!Number.isSafeInteger(total)) overflow = true }
    actualUsage[field] = { total: known && !overflow ? total : null, known, missing: terminal.length - known, coverage: terminal.length ? known / terminal.length : null, overflow }
  }
  // A weighted ratio over the SAME paired observations, never an average of per-job ratios.
  const pairs = terminal.filter(row => row.inputTokens !== null && row.cacheReadTokens !== null && row.cacheReadTokens <= row.inputTokens)
  const input = pairs.reduce((sum, row) => sum + row.inputTokens, 0), read = pairs.reduce((sum, row) => sum + row.cacheReadTokens, 0)
  actualUsage.cacheHitRate = { value: input > 0 && Number.isSafeInteger(input) && Number.isSafeInteger(read) ? read / input : null, known: pairs.length, missing: terminal.length - pairs.length, inputTokens: Number.isSafeInteger(input) && pairs.length ? input : null, cacheReadTokens: Number.isSafeInteger(read) && pairs.length ? read : null }
  return { ...counts, actualUsage }
}
function groups(rows, keys) {
  const buckets = new Map()
  for (const row of rows) {
    const key = JSON.stringify(keys.map(name => row[name]))
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(row)
  }
  return [...buckets.values()].map(items => ({ ...Object.fromEntries(keys.map(key => [key, items[0][key]])), ...aggregate(items) }))
    .sort((a, b) => b.requests - a.requests || JSON.stringify(keys.map(key => a[key])).localeCompare(JSON.stringify(keys.map(key => b[key]))))
}

/** Read retained measurements only. No quota ledger, conversation snapshot, key or code secret is read. */
export function createUsageAnalytics({ db }) {
  const json = "CASE WHEN json_valid(metrics) THEN metrics ELSE '{}' END"
  // Whitelist projection deliberately excludes summary, tool calls, names and arbitrary errors.
  const numeric = field => `CASE WHEN json_type(${json},'$.${field}') IN ('integer','real') AND json_extract(${json},'$.${field}') BETWEEN 0 AND 9007199254740991 THEN json_extract(${json},'$.${field}') ELSE NULL END AS ${field}`
  const sizeAll = db.prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM chat_jobs LIMIT ${MAX_ANALYTICS_RETAINED_JOBS + 1})`)
  const sizeOwner = db.prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM chat_jobs WHERE owner=? LIMIT ${MAX_ANALYTICS_RETAINED_JOBS + 1})`)
  const config = "CASE WHEN json_valid(config) THEN config ELSE '{}' END"
  const providerLabels = db.prepare(`SELECT id,json_extract(${config},'$.name') AS name FROM providers`)
  const ownerLabels = db.prepare(`SELECT id,json_extract(${config},'$.name') AS name FROM access_codes`)
  const modelLabels = db.prepare(`SELECT p.id AS providerId,json_extract(m.value,'$.id') AS id,json_extract(m.value,'$.name') AS name FROM providers p,json_each(CASE WHEN json_valid(p.config) THEN p.config ELSE '{}' END,'$.models') m WHERE m.type='object'`)
  const projection = `SELECT owner,id,status,
    ${numeric('startedAt')},
    json_extract(${json},'$.providerId') AS providerId,
    json_extract(${json},'$.modelId') AS modelId,
    ${fields.map(numeric).join(',')},
    CASE WHEN json_extract(${json},'$.error.kind')='interrupted' THEN 1 ELSE 0 END AS restarted
    FROM chat_jobs`
  const measurementsAll = db.prepare(projection), measurementsOwner = db.prepare(`${projection} WHERE owner=?`)
  return {
    query(params, now = Date.now()) {
      const query = parseAnalyticsQuery(params, now)
      // A date/page bound alone cannot bound JSON parsing in this legacy schema.
      // Refuse the whole query instead of silently truncating totals or claiming completeness.
      const candidateCount = query.owner ? sizeOwner.get(query.owner).n : sizeAll.get().n
      if (candidateCount > MAX_ANALYTICS_RETAINED_JOBS) fail(422, '留存任务超过 50000 条，请按身份筛选或归档后再查询')
      const retained = query.owner ? measurementsOwner.all(query.owner) : measurementsAll.all()
      const providerNames = new Map(providerLabels.all().map(item => [item.id, displayName(item.name)]))
      const ownerNames = new Map(ownerLabels.all().map(item => [item.id, displayName(item.name)]))
      const modelNames = new Map(modelLabels.all().map(item => [JSON.stringify([item.providerId, item.id]), displayName(item.name)]))
      let undatedRetainedJobs = 0
      const dated = []
      for (const row of retained) {
        const startedAt = integer(row.startedAt)
        if (startedAt === null || startedAt >= 4102444800000) { undatedRetainedJobs++; continue }
        if (startedAt < query.startUtc || startedAt >= query.endExclusiveUtc) continue
        const status = row.status === 'stopped' || row.status === 'error' && row.restarted ? 'interrupted' : ['done', 'error', 'running'].includes(row.status) ? row.status : 'unknown'
        const actualUsageEligible = ['done', 'error', 'interrupted'].includes(status)
        dated.push({ id: identifier(row.id), owner: identifier(row.owner), providerId: identifier(row.providerId), modelId: identifier(row.modelId), startedAt, date: dateString(startedAt), status, actualUsageEligible, ...Object.fromEntries(fields.map(field => [field, actualUsageEligible ? integer(row[field]) : null])) })
      }
      const options = key => [...new Set(dated.map(row => row[key]).filter(value => value !== null))].sort().map(id => ({ id, name: key === 'owner' ? id === 'admin' ? '管理员' : ownerNames.get(id) || '已删除使用码' : providerNames.get(id) || '已删除渠道' }))
      const filters = { providers: options('providerId'), models: [...new Map(dated.filter(row => row.providerId && row.modelId).map(row => [JSON.stringify([row.providerId, row.modelId]), { providerId: row.providerId, id: row.modelId, name: modelNames.get(JSON.stringify([row.providerId, row.modelId])) || '未配置模型' }])).values()].sort((a, b) => a.providerId.localeCompare(b.providerId) || a.id.localeCompare(b.id)), owners: options('owner') }
      const rows = dated.filter(row => (!query.providerId || row.providerId === query.providerId) && (!query.modelId || row.modelId === query.modelId))
      const byDate = new Map()
      for (const row of rows) { if (!byDate.has(row.date)) byDate.set(row.date, []); byDate.get(row.date).push(row) }
      const daily = Array.from({ length: query.days }, (_, index) => { const date = dateString(query.startUtc + index * DAY); return { date, ...aggregate(byDate.get(date) || []) } })
      rows.sort((a, b) => b.startedAt - a.startedAt || String(a.owner).localeCompare(String(b.owner)) || String(a.id).localeCompare(String(b.id)))
      return {
        timeZone: 'Asia/Shanghai', generatedAt: now,
        range: { kind: query.range, start: query.start, end: query.end, startUtc: query.startUtc, endExclusiveUtc: query.endExclusiveUtc, days: query.days },
        scope: { source: 'retained-chat-jobs-metrics', active: 'persisted-snapshot', actualUsage: 'terminal-only', billingComplete: false, undatedRetainedJobs, maxRetainedJobs: MAX_ANALYTICS_RETAINED_JOBS },
        filters, selected: { providerId: query.providerId, modelId: query.modelId, owner: query.owner },
        overview: aggregate(rows), daily,
        groups: { providers: groups(rows, ['providerId']), models: groups(rows, ['providerId', 'modelId']), owners: groups(rows, ['owner']) },
        details: { items: rows.slice(query.offset, query.offset + query.limit), total: rows.length, limit: query.limit, offset: query.offset, hasMore: query.offset + query.limit < rows.length },
      }
    },
  }
}
