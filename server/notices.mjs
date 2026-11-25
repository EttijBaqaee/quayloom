// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto'
import { fail } from './validation.mjs'

export const NOTICE_LIMITS = Object.freeze({ maxNotices: 1000, defaultPageSize: 50, maxPageSize: 100, maxTargets: 1000, titleLength: 120, bodyLength: 20000 })
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/** In-process SQLite owner. No timers, external delivery or background jobs. */
export function createNotices({ store }) {
  const db = store.db
  db.exec(`CREATE TABLE IF NOT EXISTS studio_notices (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
    audience TEXT NOT NULL CHECK(audience IN ('all','selected')),
    created_at INTEGER NOT NULL, withdrawn_at INTEGER);
    CREATE INDEX IF NOT EXISTS studio_notices_date ON studio_notices(created_at DESC,id DESC);
    CREATE TABLE IF NOT EXISTS studio_notice_targets (
      notice_id TEXT NOT NULL REFERENCES studio_notices(id) ON DELETE CASCADE,
      code_id TEXT NOT NULL, PRIMARY KEY(notice_id,code_id));
    CREATE TABLE IF NOT EXISTS studio_notice_reads (
      notice_id TEXT NOT NULL REFERENCES studio_notices(id) ON DELETE CASCADE,
      owner TEXT NOT NULL, read_at INTEGER NOT NULL, PRIMARY KEY(notice_id,owner));`)
  const transaction = action => {
    db.exec('BEGIN IMMEDIATE')
    try { const result = action(); db.exec('COMMIT'); return result } catch (error) { db.exec('ROLLBACK'); throw error }
  }
  const principalOwner = principal => {
    if (!principal || !validId(principal.id) || !['admin', 'user', 'code'].includes(principal.role)) fail(401, '请先登录')
    return `${principal.role === 'admin' ? 'admin' : 'code'}:${principal.id}`
  }
  const codes = () => store.accessCodes().map(code => ({ id: code.id, name: code.name, enabled: code.enabled === true }))
  const targetIds = id => db.prepare('SELECT code_id FROM studio_notice_targets WHERE notice_id=? ORDER BY code_id').all(id).map(row => row.code_id)
  const project = (row, admin = false) => ({ id: row.id, title: row.title, body: row.body, createdAt: row.created_at,
    ...(admin ? { audience: row.audience, codeIds: targetIds(row.id), withdrawnAt: row.withdrawn_at } : { readAt: row.read_at ?? null }) })
  const visibility = principal => principal.role === 'admin'
    ? { sql: 'n.withdrawn_at IS NULL', args: [] }
    : { sql: "n.withdrawn_at IS NULL AND (n.audience='all' OR EXISTS(SELECT 1 FROM studio_notice_targets t WHERE t.notice_id=n.id AND t.code_id=?))", args: [principal.id] }
  const page = url => {
    const read = (name, fallback, max, min = 0) => {
      const value = url.searchParams.get(name)
      if (value === null) return fallback
      if (!/^\d{1,6}$/.test(value) || Number(value) < min || Number(value) > max) fail(400, '公告分页参数无效')
      return Number(value)
    }
    return { limit: read('limit', NOTICE_LIMITS.defaultPageSize, NOTICE_LIMITS.maxPageSize, 1), offset: read('offset', 0, NOTICE_LIMITS.maxNotices) }
  }
  const listUser = (principal, owner, pagination) => {
    const visible = visibility(principal), { limit, offset } = pagination
    const total = db.prepare(`SELECT COUNT(*) AS count FROM studio_notices n WHERE ${visible.sql}`).get(...visible.args).count
    const unreadCount = db.prepare(`SELECT COUNT(*) AS count FROM studio_notices n LEFT JOIN studio_notice_reads r ON r.notice_id=n.id AND r.owner=? WHERE ${visible.sql} AND r.read_at IS NULL`).get(owner, ...visible.args).count
    const rows = db.prepare(`SELECT n.*,r.read_at FROM studio_notices n LEFT JOIN studio_notice_reads r ON r.notice_id=n.id AND r.owner=? WHERE ${visible.sql} ORDER BY n.created_at DESC,n.id DESC LIMIT ? OFFSET ?`).all(owner, ...visible.args, limit, offset)
    return { notices: rows.map(row => project(row)), unreadCount, total, limit, offset, hasMore: offset + rows.length < total }
  }
  const emptyBody = async (req, principal, authorizedJson) => {
    const body = await authorizedJson(req, principal, 1024)
    if (!plainObject(body) || Object.keys(body).length) fail(400, '此操作只接受空对象')
  }
  return {
    async handle(req, res, pathname, url, principal, authorizedJson, json) {
      const isAdminRoute = pathname === '/api/admin/notices' || pathname.startsWith('/api/admin/notices/')
      const isUserRoute = pathname === '/api/notices' || pathname.startsWith('/api/notices/')
      if (!isAdminRoute && !isUserRoute) return false
      const owner = principalOwner(principal)
      if (isAdminRoute && principal.role !== 'admin') fail(403, '仅管理员可以发布和撤回公告')
      if (pathname === '/api/admin/notices' && req.method === 'GET') {
        const { limit, offset } = page(url)
        const total = db.prepare('SELECT COUNT(*) AS count FROM studio_notices').get().count
        const rows = db.prepare('SELECT * FROM studio_notices ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?').all(limit, offset)
        json(res, 200, { notices: rows.map(row => project(row, true)), codes: codes(), total, limit, offset, hasMore: offset + rows.length < total, limits: NOTICE_LIMITS }); return true
      }
      if (pathname === '/api/admin/notices' && req.method === 'POST') {
        const input = await authorizedJson(req, principal, 256 * 1024)
        if (!plainObject(input) || Object.keys(input).some(key => !['title', 'body', 'audience', 'codeIds'].includes(key))) fail(400, '公告字段无效')
        if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > NOTICE_LIMITS.titleLength) fail(400, '标题须为 1–120 字符')
        if (typeof input.body !== 'string' || !input.body.trim() || input.body.length > NOTICE_LIMITS.bodyLength) fail(400, '正文须为 1–20000 字符纯文本')
        if (!['all', 'selected'].includes(input.audience) || !Array.isArray(input.codeIds) || input.codeIds.length > NOTICE_LIMITS.maxTargets || input.codeIds.some(id => !validId(id)) || new Set(input.codeIds).size !== input.codeIds.length) fail(400, '公告接收范围无效')
        if (input.audience === 'all' && input.codeIds.length || input.audience === 'selected' && !input.codeIds.length) fail(400, '请明确选择全部或指定使用码')
        const notice = transaction(() => {
          if (db.prepare('SELECT COUNT(*) AS count FROM studio_notices').get().count >= NOTICE_LIMITS.maxNotices) fail(409, '公告存量已达 1000 条上限（含已撤回），请由部署管理员安排归档维护')
          const known = new Set(codes().map(code => code.id))
          if (input.codeIds.some(id => !known.has(id))) fail(400, '指定使用码不存在')
          const id = randomUUID(), now = Date.now()
          db.prepare('INSERT INTO studio_notices(id,title,body,audience,created_at) VALUES(?,?,?,?,?)').run(id, input.title.trim(), input.body, input.audience, now)
          const insert = db.prepare('INSERT INTO studio_notice_targets(notice_id,code_id) VALUES(?,?)')
          for (const codeId of input.codeIds) insert.run(id, codeId)
          return project(db.prepare('SELECT * FROM studio_notices WHERE id=?').get(id), true)
        })
        json(res, 201, { notice }); return true
      }
      const withdraw = pathname.match(/^\/api\/admin\/notices\/([a-zA-Z0-9_-]{1,128})\/withdraw$/)
      if (withdraw && req.method === 'POST') {
        await emptyBody(req, principal, authorizedJson)
        const notice = transaction(() => {
          const row = db.prepare('SELECT * FROM studio_notices WHERE id=?').get(withdraw[1])
          if (!row) fail(404, '公告不存在')
          db.prepare('UPDATE studio_notices SET withdrawn_at=COALESCE(withdrawn_at,?) WHERE id=?').run(Date.now(), row.id)
          return project(db.prepare('SELECT * FROM studio_notices WHERE id=?').get(row.id), true)
        })
        json(res, 200, { notice }); return true
      }
      if (pathname === '/api/notices' && req.method === 'GET') {
        json(res, 200, listUser(principal, owner, page(url))); return true
      }
      if (pathname === '/api/notices/read-all' && req.method === 'POST') {
        await emptyBody(req, principal, authorizedJson)
        const markedCount = transaction(() => {
          const visible = visibility(principal)
          return db.prepare(`INSERT OR IGNORE INTO studio_notice_reads(notice_id,owner,read_at) SELECT n.id,?,? FROM studio_notices n WHERE ${visible.sql}`).run(owner, Date.now(), ...visible.args).changes
        })
        json(res, 200, { ok: true, markedCount }); return true
      }
      const read = pathname.match(/^\/api\/notices\/([a-zA-Z0-9_-]{1,128})\/read$/)
      if (read && req.method === 'POST') {
        await emptyBody(req, principal, authorizedJson)
        const readAt = transaction(() => {
          const visible = visibility(principal)
          const row = db.prepare(`SELECT n.id FROM studio_notices n WHERE n.id=? AND (${visible.sql})`).get(read[1], ...visible.args)
          if (!row) fail(404, '公告不存在或不可见')
          db.prepare('INSERT OR IGNORE INTO studio_notice_reads(notice_id,owner,read_at) VALUES(?,?,?)').run(row.id, owner, Date.now())
          return db.prepare('SELECT read_at FROM studio_notice_reads WHERE notice_id=? AND owner=?').get(row.id, owner).read_at
        })
        json(res, 200, { ok: true, readAt }); return true
      }
      fail(404, '公告接口不存在')
    },
  }
}
