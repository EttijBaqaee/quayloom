import { createHash } from 'node:crypto'
import { fail, validateChat } from './validation.mjs'
import { allowsModel } from './access.mjs'
import { performance } from 'node:perf_hooks'
import { createRunStatistics, interruptedStatistics } from './statistics.mjs'
import { isOpaqueReasoning, safeAdapterDiagnostic } from './adapters.mjs'
import { isResponsesContext, mergeResponsesContexts } from './responses-context.mjs'
import { deriveSessionFallback, normalizeSessionTitle } from './titles.mjs'
import { createResponsesRoundQuota } from './chat-quota.mjs'

const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value)
const summary = ({ id, title, createdAt, updatedAt, revision }) => ({ id, title, createdAt, updatedAt, revision })
const validateModelSelection = value => {
  if (value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['providerId', 'modelId'].includes(key)) ||
    !['providerId', 'modelId'].every(key => typeof value[key] === 'string' && value[key].length > 0 && value[key].length <= 512)) fail(400, 'Invalid model selection')
  return { providerId: value.providerId, modelId: value.modelId }
}
export function validateSession(value) {
  if (!value || !validId(value.id) || typeof value.title !== 'string' || value.title.length > 1000 || !Number.isSafeInteger(value.createdAt) || !Number.isSafeInteger(value.updatedAt) || !Array.isArray(value.messages) || value.messages.length > 10000) fail(400, 'Invalid conversation')
  if (value.modelSelection !== undefined) validateModelSelection(value.modelSelection)
  const ids = new Set()
  for (const message of value.messages) {
    if (!message || !validId(message.id) || ids.has(message.id) || !Number.isSafeInteger(message.createdAt)) fail(400, 'Invalid message')
    ids.add(message.id)
    if (message.role === 'user') {
      if (typeof message.content !== 'string' || !Array.isArray(message.files) || message.files.length > 100) fail(400, 'Invalid user message')
      for (const file of message.files) if (!file || !validId(file.id) || typeof file.name !== 'string' || !Number.isSafeInteger(file.size) || file.size < 0 || typeof file.isImage !== 'boolean' || typeof file.mimeType !== 'string' || file.serverId !== null && typeof file.serverId !== 'string') fail(400, 'Invalid attachment')
    } else if (message.role === 'assistant') {
      if (!Array.isArray(message.blocks) || !['pending', 'streaming', 'done', 'stopped', 'error'].includes(message.status)) fail(400, 'Invalid assistant message')
      let contextSeen = false
      for (const block of message.blocks) {
        if (!block || typeof block.type !== 'string' || block.type === 'text' && typeof block.text !== 'string' || block.type === 'thinking' && typeof block.thinking !== 'string') fail(400, 'Invalid reply block')
        if (block.opaqueReasoning !== undefined && (block.type !== 'thinking' || !isOpaqueReasoning(block.opaqueReasoning) || block.opaqueReasoning.provider_id !== message.providerId || block.opaqueReasoning.model_id !== message.model)) fail(400, 'Invalid opaque reasoning provenance')
        if (block.responsesContext !== undefined) {
          if (contextSeen || block.type !== 'thinking' || block.thinking !== '' || block.signature !== undefined && block.signature !== '' || block.opaqueReasoning !== undefined || !isResponsesContext(block.responsesContext) || block.responsesContext.provider_id !== message.providerId || block.responsesContext.model_id !== message.model) fail(400, 'Invalid Responses context provenance')
          contextSeen = true
        }
      }
    } else fail(400, 'Invalid message role')
  }
  for (const message of value.messages) for (const key of ['parentId', 'selectedChildId']) if (message[key] != null && !ids.has(message[key])) fail(400, 'Invalid message branch')
  const messages = new Map(value.messages.map(message => [message.id, message])), checked = new Set()
  for (const message of value.messages) {
    if (message.selectedChildId && messages.get(message.selectedChildId)?.parentId !== message.id) fail(400, 'Inconsistent message branch')
    const path = new Set(); let current = message
    while (current && !checked.has(current.id)) {
      if (path.has(current.id)) fail(400, 'Circular message branch')
      path.add(current.id); current = messages.get(current.parentId)
    }
    for (const id of path) checked.add(id)
  }
  if (value.rootMessageId != null && (!ids.has(value.rootMessageId) || messages.get(value.rootMessageId).parentId != null)) fail(400, 'Invalid conversation root')
  if (Buffer.byteLength(JSON.stringify(value)) > 4 * 1024 * 1024) fail(413, 'Conversation exceeds 4 MiB')
  const { revision: _revision, ...session } = value
  return session
}
const finishReply = (reply, status, error) => ({ ...reply, status, ...(error ? { error } : { error: undefined }), blocks: reply.blocks.filter(b => reply.stopReason !== 'refusal' || !['text', 'thinking'].includes(b.type)).map(b => b.type === 'thinking' && b.startedAt !== undefined && b.endedAt === undefined ? { ...b, endedAt: Date.now() } : b) })
export function projectEvent(reply, event, indexes, now = Date.now()) {
  const next = { ...reply, status: 'streaming' }
  if (event.type === 'message_start') next.usage = event.message?.usage ?? next.usage
  if (event.type === 'message_delta') { next.stopReason = event.delta?.stop_reason; next.stopDetails = event.delta?.stop_details; next.usage = event.usage_incomplete === true ? undefined : event.usage ?? next.usage }
  if (event.type === 'content_block_start') {
    indexes.delete(event.index)
    const block = event.content_block
    if (block?.responsesContext !== undefined) {
      const incoming = block.responsesContext
      if (block.type !== 'thinking' || block.thinking !== '' || block.signature !== undefined && block.signature !== '' || block.opaqueReasoning !== undefined || !isResponsesContext(incoming)) throw new Error('Invalid Responses context anchor')
      if (incoming.provider_id !== next.providerId || incoming.model_id !== next.model) throw new Error('Invalid Responses context provenance')
      const anchors = next.blocks.flatMap((part, index) => part.type === 'thinking' && part.responsesContext !== undefined ? [{ block: part, index }] : [])
      if (anchors.length > 1) throw new Error('Multiple Responses context anchors')
      const previous = anchors[0]
      if (previous) {
        if (previous.block.thinking !== '' || previous.block.signature !== undefined && previous.block.signature !== '' || previous.block.opaqueReasoning !== undefined) throw new Error('Invalid Responses context anchor')
        const responsesContext = mergeResponsesContexts(previous.block.responsesContext, incoming)
        indexes.set(event.index, previous.index)
        next.blocks = next.blocks.map((part, index) => index === previous.index ? { ...part, responsesContext } : part)
        return next
      }
    }
    if (['text', 'thinking', 'server_tool_use', 'web_search_tool_result', 'web_fetch_tool_result'].includes(block?.type)) {
      indexes.set(event.index, next.blocks.length)
      next.blocks = [...next.blocks, { ...block, ...(block.type === 'thinking' ? { startedAt: now } : {}) }]
    } else if (block?.type === 'tool_use') next.prefix = false
  }
  const index = indexes.get(event.index), block = next.blocks[index]
  if (block && event.type === 'content_block_delta') {
    const delta = event.delta; let updated = block
    if (block.type === 'text' && delta?.type === 'text_delta') updated = { ...block, text: block.text + delta.text }
    if (block.type === 'thinking' && delta?.type === 'thinking_delta') updated = { ...block, thinking: block.thinking + delta.thinking }
    if (block.type === 'thinking' && delta?.type === 'signature_delta') updated = { ...block, signature: (block.signature || '') + delta.signature }
    if (block.type === 'text' && delta?.type === 'citations_delta') updated = { ...block, citations: [...(block.citations || []), delta.citation] }
    next.blocks = next.blocks.map((b, i) => i === index ? updated : b)
  }
  if (block && event.type === 'content_block_stop') {
    indexes.delete(event.index)
    if (block.type === 'thinking') next.blocks = next.blocks.map((b, i) => i === index ? { ...b, endedAt: now } : b)
  }
  return next
}

/** Single-process owner; HTTP subscribers never own or abort these tasks. */
export function createServerChat({ store, adapters, ledger, controllers, accessControllers, images, documents, statisticsFactory = createRunStatistics }) {
  const db = store.db, running = new Map(), tasks = new Set(), liveStatistics = new Map()
  db.exec(`CREATE TABLE IF NOT EXISTS chat_sessions(owner TEXT NOT NULL,id TEXT NOT NULL,title TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,revision INTEGER NOT NULL,snapshot TEXT NOT NULL,PRIMARY KEY(owner,id));
    CREATE TABLE IF NOT EXISTS chat_jobs(owner TEXT NOT NULL,id TEXT NOT NULL,session_id TEXT NOT NULL,reply_id TEXT NOT NULL,status TEXT NOT NULL,request_hash TEXT NOT NULL,metrics TEXT,PRIMARY KEY(owner,id));
    CREATE INDEX IF NOT EXISTS chat_jobs_session ON chat_jobs(owner,session_id);
    CREATE UNIQUE INDEX IF NOT EXISTS chat_jobs_active ON chat_jobs(owner,session_id) WHERE status='running';`)
  if (!db.prepare('PRAGMA table_info(chat_jobs)').all().some(column => column.name === 'metrics')) db.exec('ALTER TABLE chat_jobs ADD COLUMN metrics TEXT')
  if (!db.prepare('PRAGMA table_info(chat_sessions)').all().some(column => column.name === 'title_manual')) db.exec('ALTER TABLE chat_sessions ADD COLUMN title_manual INTEGER NOT NULL DEFAULT 0')
  const load = (owner, id) => { const row = db.prepare('SELECT snapshot,revision FROM chat_sessions WHERE owner=? AND id=?').get(owner, id); return row ? { ...JSON.parse(row.snapshot), revision: row.revision } : null }
  const put = (owner, session) => {
    const revision = (load(owner, session.id)?.revision || 0) + 1
    const { revision: _revision, ...snapshot } = session
    db.prepare(`INSERT INTO chat_sessions(owner,id,title,created_at,updated_at,revision,snapshot) VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET title=excluded.title,updated_at=excluded.updated_at,revision=excluded.revision,snapshot=excluded.snapshot`).run(owner, session.id, session.title, session.createdAt, session.updatedAt, revision, JSON.stringify(snapshot))
    return revision
  }
  // A process restart cannot safely replay an already billed upstream request.
  for (const job of db.prepare("SELECT * FROM chat_jobs WHERE status='running'").all()) {
    const session = load(job.owner, job.session_id)
    if (session) { session.messages = session.messages.map(m => m.id === job.reply_id ? finishReply(m, 'error', { kind: 'interrupted', message: '服务器已重启，生成已中断；已保存收到的内容。请手动重试。' }) : m); put(job.owner, session) }
    const interrupted = interruptedStatistics(job.metrics ? JSON.parse(job.metrics) : null)
    db.prepare("UPDATE chat_jobs SET status='error',metrics=? WHERE owner=? AND id=?").run(interrupted ? JSON.stringify(interrupted) : null, job.owner, job.id)
  }
  const statistics = (owner, sessionId, url) => {
    if (!load(owner, sessionId)) fail(404, 'Conversation not found')
    const pageNumber = (name, fallback, maximum) => {
      const raw = url.searchParams.get(name)
      if (raw === null) return fallback
      if (!/^\d+$/.test(raw)) fail(400, 'Invalid statistics pagination')
      const value = Number(raw)
      if (!Number.isSafeInteger(value) || value < (name === 'limit' ? 1 : 0)) fail(400, 'Invalid statistics pagination')
      return Math.min(value, maximum)
    }
    const limit = pageNumber('limit', 100, 100), offset = pageNumber('offset', 0, Number.MAX_SAFE_INTEGER)
    // Old jobs without metrics remain idempotent, but have no invented historical measurements.
    const total = db.prepare("SELECT COUNT(*) AS n FROM chat_jobs WHERE owner=? AND session_id=? AND metrics IS NOT NULL AND metrics!='null'").get(owner, sessionId).n
    const rows = db.prepare("SELECT id,status,metrics FROM chat_jobs WHERE owner=? AND session_id=? AND metrics IS NOT NULL AND metrics!='null' ORDER BY rowid DESC LIMIT ? OFFSET ?").all(owner, sessionId, limit, offset)
    const runs = rows.map(row => {
      const live = liveStatistics.get(owner + ':' + row.id)
      const metrics = live ? live.snapshot() : JSON.parse(row.metrics)
      return { ...metrics, status: row.status }
    })
    return { runs, total, limit, offset, hasMore: offset + limit < total }
  }
  const jobFor = (owner, id) => db.prepare('SELECT * FROM chat_jobs WHERE owner=? AND id=?').get(owner, id)
  const active = (owner, id) => db.prepare("SELECT id FROM chat_jobs WHERE owner=? AND session_id=? AND status='running'").get(owner, id)
  const assertRevision = (owner, id, revision) => { if (!Number.isSafeInteger(revision) || revision !== (load(owner, id)?.revision || 0)) fail(409, '会话已在其他页面更新，请刷新后重试') }
  const responseFor = (job, after) => { const session = load(job.owner, job.session_id); return { id: job.id, sessionId: job.session_id, replyId: job.reply_id, status: job.status, ...(session && String(session.revision) !== after ? { session } : {}) } }
  const run = async (job, provider, model, body, access, controller, metrics, outcome, reservation) => {
    let reply = load(job.owner, job.session_id).messages.find(m => m.id === job.reply_id)
    const indexes = new Map(); let usage, usageDelta = false, completed = false, checkpoint = 0, size = 0
    let status = 'error', checkpointTimer, finalMetrics
    const outputLimit = Math.max(0, Math.min(3 * 1024 * 1024, 4 * 1024 * 1024 - Buffer.byteLength(JSON.stringify(load(job.owner, job.session_id))) - 65536))
    const persist = (inTransaction = false) => {
      const session = load(job.owner, job.session_id)
      if (!session) return
      session.messages = session.messages.map(m => m.id === reply.id ? reply : m)
      session.updatedAt = Date.now()
      if (!inTransaction) db.exec('BEGIN IMMEDIATE')
      try {
        put(job.owner, session)
        db.prepare('UPDATE chat_jobs SET metrics=? WHERE owner=? AND id=?').run(JSON.stringify(finalMetrics || metrics.snapshot()), job.owner, job.id)
        if (!inTransaction) db.exec('COMMIT')
      } catch (error) { if (!inTransaction) db.exec('ROLLBACK'); throw error }
      checkpoint = performance.now()
    }
    const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(600000, access?.expiresAt ? access.expiresAt - Date.now() : Infinity)))
    try {
      metrics.startModel()
      for await (const event of adapters.streamChat(provider, model, body, { signal: controller.signal, webToolsConfig: store.webToolsConfig?.(true), responsesRound: createResponsesRoundQuota({ store, ledger, reservation, provider, model, access }) })) {
        controller.signal.throwIfAborted()
        size += Buffer.byteLength(JSON.stringify(event)); if (size > outputLimit) throw Error('生成内容超过会话大小限制')
        if (event.type === 'error') throw Error(event.error?.message || 'Upstream stream failed')
        if (event.type === 'message_start' && event.message?.usage) usage = { ...event.message.usage }
        if (event.type === 'message_delta' && event.usage_incomplete === true) { usage = undefined; usageDelta = false }
        else if (event.type === 'message_delta' && event.usage) { usage = { ...usage, ...event.usage }; usageDelta = true }
        if (event.type === 'message_stop') completed = true
        metrics.observe(event)
        reply = projectEvent(reply, event, indexes)
        if (event.type === 'message_delta' && body.title?.enabled && !controller.manualTitle && typeof event.delta?.title === 'string') {
          const title = normalizeSessionTitle(event.delta.title)
          const session = title && load(job.owner, job.session_id)
          // A native provider title may replace this job's fallback, never a rename.
          if (session && (!session.title || session.title === controller.fallbackTitle)) {
            session.title = title; put(job.owner, session); controller.fallbackTitle = undefined
          }
        }
        if (performance.now() - checkpoint >= 200) { clearTimeout(checkpointTimer); checkpointTimer = undefined; persist() }
        else if (!checkpointTimer) checkpointTimer = setTimeout(() => {
          checkpointTimer = undefined
          try { persist() } catch { console.error('Server chat checkpoint failed'); controller.abort() }
        }, 200 - (performance.now() - checkpoint))
      }
      controller.signal.throwIfAborted()
      if (!completed) throw Error('上游流在完成之前结束，已保存收到的内容')
      status = 'done'; reply = finishReply(reply, 'done')
    } catch (error) {
      status = controller.signal.aborted ? 'stopped' : 'error'
      const message = access ? '该渠道暂时无法完成请求，请稍后重试或联系管理员' : String(error?.message || '生成失败').split(provider.apiKey || '\0').join('[REDACTED]').replace(/\b(Bearer\s+)[^\s"']+/gi, '$1[REDACTED]').slice(0, 2000)
      const diagnostic = !access && status === 'error' ? safeAdapterDiagnostic(error) : undefined
      reply = finishReply(reply, status, status === 'error' ? { kind: 'stream', message, ...(diagnostic ? { diagnostic } : {}) } : undefined)
    } finally {
      clearTimeout(timer); clearTimeout(checkpointTimer)
      outcome.completed = completed; outcome.usage = completed && usageDelta ? usage : undefined
      finalMetrics = metrics.finish(status, reply.error)
      db.exec('BEGIN IMMEDIATE')
      try { persist(true); db.prepare('UPDATE chat_jobs SET status=? WHERE owner=? AND id=?').run(status, job.owner, job.id); db.exec('COMMIT') } catch (error) { db.exec('ROLLBACK'); throw error }
    }
  }
  const start = (principal, input, providerId) => {
    const startedAt = Date.now(), monotonicStart = performance.now()
    if (!input || !validId(input.id) || !validId(input.replyId)) fail(400, 'Invalid task identity')
    if (input.trigger !== undefined && !['send', 'regenerate', 'continue'].includes(input.trigger)) fail(400, 'Invalid task trigger')
    const session = validateSession(input.session)
    let body = validateChat(input.request)
    const hash = createHash('sha256').update(JSON.stringify({ session, body, providerId, replyId: input.replyId, ...(input.trigger === undefined ? {} : { trigger: input.trigger }) })).digest('hex')
    const existing = jobFor(principal.id, input.id)
    if (existing) { if (existing.request_hash !== hash) fail(409, 'Task identity was already used for different input'); return responseFor(existing) }
    if (active(principal.id, session.id)) fail(409, '该会话已有正在运行的任务，请刷新恢复')
    assertRevision(principal.id, session.id, input.revision)
    if (!load(principal.id, session.id) && db.prepare('SELECT COUNT(*) AS n FROM chat_sessions WHERE owner=?').get(principal.id).n >= 2000) fail(400, 'At most 2000 conversations are supported per identity')
    const reply = session.messages.find(m => m.id === input.replyId)
    if (!reply || reply.role !== 'assistant' || reply.status !== 'pending' || reply.providerId !== providerId || reply.model !== body.model) fail(400, 'Task reply does not match request')
    const provider = store.provider(providerId, true)
    if (!provider?.enabled) fail(400, 'Select an enabled provider')
    const model = provider.models.find(m => m.id === body.model)
    if (!model) fail(400, 'Model is not configured for this provider')
    const access = principal.role === 'user' ? store.activeAccess(principal.id) : null
    if (principal.role === 'user' && !access) fail(401, '使用码已过期或已禁用')
    if (access) {
      if (!allowsModel(access, provider.id, model.id)) fail(403, '此使用码未获准使用该模型')
      const textOnly = content => typeof content === 'string' || (Array.isArray(content) && content.every(b => b && (b.type === 'text' && typeof b.text === 'string' || b.type === 'thinking' && typeof b.thinking === 'string' && (b.opaqueReasoning === undefined || isOpaqueReasoning(b.opaqueReasoning)))))
      if (body.messages.some(m => !textOnly(m.content)) || body.system !== undefined && !textOnly(body.system) || body.tools?.length || body.tool_choice || session.messages.some(m => m.role === 'user' && m.files.length)) fail(403, '使用码当前仅支持文本与推理聊天')
    }
    body = images?.resolve(principal.id, provider, body) ?? body
    body = documents?.resolve(principal.id, provider, body) ?? body
    adapters.validateChatRequest?.(provider, model, body, { webToolsConfig: store.webToolsConfig?.(true) })
    const controller = new AbortController(), job = { owner: principal.id, id: input.id, session_id: session.id, reply_id: reply.id, status: 'running', request_hash: hash }
    const previous = load(principal.id, session.id)
    controller.manualTitle = Boolean(db.prepare('SELECT title_manual FROM chat_sessions WHERE owner=? AND id=?').get(principal.id, session.id)?.title_manual)
    if (controller.manualTitle && body.title?.enabled) body = { ...body, title: { ...body.title, enabled: false } }
    const earlierReplyJob = db.prepare('SELECT 1 FROM chat_jobs WHERE owner=? AND session_id=? AND reply_id=?').get(principal.id, session.id, reply.id)
    const hasPrefix = previous?.messages.some(m => m.id === reply.id && m.blocks?.length) && reply.blocks.length > 0
    const hasSibling = session.messages.some(m => m.role === 'assistant' && m.id !== reply.id && m.parentId === reply.parentId)
    const trigger = input.trigger ?? (earlierReplyJob || hasPrefix ? 'continue' : hasSibling ? 'regenerate' : 'send')
    const sequence = db.prepare('SELECT COUNT(*) AS n FROM chat_jobs WHERE owner=? AND session_id=?').get(principal.id, session.id).n + 1
    const metrics = statisticsFactory({ job, provider, model, body, sequence, trigger, startedAt, monotonicStart })
    const reservation = ledger.reserve(provider, model, adapters.chatQuotaBody?.(provider, model, body) ?? body, { access })
    try {
      // Persist DSH-style first-human fallback before starting any upstream work.
      if (body.title?.enabled && !controller.manualTitle && !session.title) {
        const fallback = deriveSessionFallback(session)
        if (fallback) { session.title = fallback; controller.fallbackTitle = fallback }
      }
      db.exec('BEGIN IMMEDIATE')
      try { put(principal.id, session); db.prepare('INSERT INTO chat_jobs(owner,id,session_id,reply_id,status,request_hash,metrics) VALUES(?,?,?,?,?,?,?)').run(job.owner, job.id, job.session_id, job.reply_id, job.status, hash, JSON.stringify(metrics.snapshot())); db.exec('COMMIT') } catch (error) { db.exec('ROLLBACK'); throw error }
    } catch (error) {
      try { ledger.settle(reservation, undefined, 'interrupted') } finally { ledger.release?.(reservation) }
      throw error
    }
    controllers.add(controller); if (access) accessControllers.set(controller, access.id)
    running.set(job.owner + ':' + job.id, controller); liveStatistics.set(job.owner + ':' + job.id, metrics)
    // Start after persistence, independent of the response socket or browser lifetime.
    const task = Promise.resolve().then(async () => {
      const outcome = { completed: false, usage: undefined }
      try {
        await run(job, provider, model, body, access, controller, metrics, outcome, reservation)
      } catch (error) {
        // Metrics/checkpoint/initialization failures must not leave a permanently
        // running job. Never replay upstream, and never expose an internal error.
        db.exec('BEGIN IMMEDIATE')
        try {
          const saved = load(job.owner, job.session_id)
          if (saved) {
            saved.messages = saved.messages.map(message => message.id === job.reply_id ? finishReply(message, 'error', { kind: 'server', message: '服务器保存生成结果失败，已保留收到的内容，请手动重试。' }) : message)
            put(job.owner, saved)
          }
          db.prepare("UPDATE chat_jobs SET status='error' WHERE owner=? AND id=?").run(job.owner, job.id)
          db.exec('COMMIT')
        } catch (checkpointError) { db.exec('ROLLBACK'); throw checkpointError }
        throw error
      } finally {
        try { ledger.settle(reservation, outcome.usage, outcome.completed ? 'completed' : 'interrupted') }
        finally {
          try { ledger.release?.(reservation) }
          finally { controllers.delete(controller); accessControllers.delete(controller); running.delete(job.owner + ':' + job.id); liveStatistics.delete(job.owner + ':' + job.id) }
        }
      }
    })
    tasks.add(task); void task.catch(() => console.error('[chat] Failed to checkpoint a server task')).finally(() => tasks.delete(task))
    return responseFor(job)
  }
  return {
    async handle(req, res, pathname, url, principal, authorizedJson, json) {
      if (pathname === '/api/admin/chat/statistics') {
        if (principal.role !== 'admin') fail(403, '仅管理员可以查看使用码统计')
        if (req.method !== 'GET') fail(405, '管理员统计接口为只读')
        const owner = url.searchParams.get('owner'), sessionId = url.searchParams.get('sessionId')
        if (!validId(owner) || !validId(sessionId)) fail(400, 'Invalid statistics identity')
        if (!store.accessCode(owner)) fail(404, '使用码不存在')
        json(res, 200, statistics(owner, sessionId, url)); return true
      }
      if (pathname.startsWith('/api/admin/conversations')) {
        if (principal.role !== 'admin') fail(403, '仅管理员可以查看使用码对话')
        if (req.method !== 'GET') fail(405, '管理员对话查看接口为只读')
        if (pathname === '/api/admin/conversations') {
          const codes = store.accessCodes().map(code => ({ id: code.id, name: code.name, enabled: code.enabled, expiresAt: code.expiresAt }))
          const owner = url.searchParams.get('owner')
          if (owner && !codes.some(code => code.id === owner)) fail(404, '使用码不存在')
          const sessions = owner ? db.prepare('SELECT id,title,created_at AS createdAt,updated_at AS updatedAt,revision FROM chat_sessions WHERE owner=? ORDER BY updated_at DESC').all(owner) : []
          const jobs = owner ? db.prepare("SELECT id,session_id AS sessionId,reply_id AS replyId FROM chat_jobs WHERE owner=? AND status='running'").all(owner) : []
          json(res, 200, { codes, sessions, jobs }); return true
        }
        const match = pathname.match(/^\/api\/admin\/conversations\/([a-zA-Z0-9_-]{1,128})\/([a-zA-Z0-9_-]{1,128})$/)
        if (match && store.accessCode(match[1])) {
          const session = load(match[1], match[2]); if (!session) fail(404, 'Conversation not found')
          json(res, 200, { session, running: Boolean(active(match[1], match[2])) }); return true
        }
        fail(404, 'Conversation not found')
      }
      if (!pathname.startsWith('/api/chat/')) return false
      const owner = principal.id
      if (pathname === '/api/chat/sessions' && req.method === 'GET') {
        const sessions = db.prepare('SELECT id,title,created_at AS createdAt,updated_at AS updatedAt,revision FROM chat_sessions WHERE owner=? ORDER BY updated_at DESC').all(owner)
        const jobs = db.prepare("SELECT id,session_id AS sessionId,reply_id AS replyId FROM chat_jobs WHERE owner=? AND status='running'").all(owner)
        json(res, 200, { sessions: sessions.map(summary), jobs }); return true
      }
      if (pathname === '/api/chat/sessions/replace' && req.method === 'PUT') {
        const input = await authorizedJson(req, principal, 40 * 1024 * 1024)
        if (!Array.isArray(input?.sessions) || input.sessions.length > 2000) fail(400, 'Invalid history replacement')
        const sessions = input.sessions.map(validateSession)
        if (new Set(sessions.map(s => s.id)).size !== sessions.length) fail(400, 'Duplicate conversations')
        if (db.prepare("SELECT 1 FROM chat_jobs WHERE owner=? AND status='running'").get(owner)) fail(409, '请先停止正在运行的任务，再替换历史')
        db.exec('BEGIN IMMEDIATE')
        try { db.prepare('DELETE FROM chat_jobs WHERE owner=?').run(owner); db.prepare('DELETE FROM chat_sessions WHERE owner=?').run(owner); for (const session of sessions) put(owner, session); db.exec('COMMIT') } catch (error) { db.exec('ROLLBACK'); throw error }
        json(res, 200, { ok: true }); return true
      }
      const statisticsMatch = pathname.match(/^\/api\/chat\/sessions\/([a-zA-Z0-9_-]{1,128})\/statistics$/)
      if (statisticsMatch) {
        if (req.method !== 'GET') fail(405, '统计接口为只读')
        json(res, 200, statistics(owner, statisticsMatch[1], url)); return true
      }
      const sessionMatch = pathname.match(/^\/api\/chat\/sessions\/([a-zA-Z0-9_-]{1,128})$/)
      if (sessionMatch) {
        const id = sessionMatch[1]
        if (req.method === 'GET') { const session = load(owner, id); if (!session) fail(404, 'Conversation not found'); json(res, 200, { session }); return true }
        if (req.method === 'PATCH') {
          const input = await authorizedJson(req, principal, 4096), session = load(owner, id)
          if (!session) fail(404, 'Conversation not found')
          // Narrow owner-scoped metadata update: never replace messages, pin a title, or restart a job.
          // Missing revision means field-level last-write-wins; supplied revisions retain normal CAS.
          if (input && Object.hasOwn(input, 'modelSelection')) {
            if (Object.keys(input).some(key => !['modelSelection', 'revision'].includes(key))) fail(400, 'Invalid model selection update')
            const selection = validateModelSelection(input.modelSelection)
            if (input.revision !== undefined) assertRevision(owner, id, input.revision)
            session.modelSelection = selection
            put(owner, session)
            json(res, 200, { session: load(owner, id) }); return true
          }
          if (typeof input?.title !== 'string' || input.title.length > 1000) fail(400, 'Invalid conversation title')
          // Explicit, owner-scoped repair only; GET never changes existing history.
          if (input.ifEmpty !== undefined && typeof input.ifEmpty !== 'boolean') fail(400, 'Invalid conditional title update')
          if (input.revision !== undefined || input.ifEmpty === true) assertRevision(owner, id, input.revision)
          if (input.ifEmpty === true && session.title) fail(409, 'Conversation already has a title')
          session.title = input.title
          const job = active(owner, id), controller = job && running.get(owner + ':' + job.id)
          db.exec('BEGIN IMMEDIATE')
          try {
            put(owner, session)
            db.prepare('UPDATE chat_sessions SET title_manual=1 WHERE owner=? AND id=?').run(owner, id)
            db.exec('COMMIT')
          } catch (error) { db.exec('ROLLBACK'); throw error }
          if (controller) controller.manualTitle = true
          json(res, 200, { session: load(owner, id) }); return true
        }
        if (req.method === 'DELETE') {
          if (active(owner, id)) fail(409, '请先停止生成再删除会话')
          db.exec('BEGIN IMMEDIATE'); try { db.prepare('DELETE FROM chat_jobs WHERE owner=? AND session_id=?').run(owner, id); db.prepare('DELETE FROM chat_sessions WHERE owner=? AND id=?').run(owner, id); db.exec('COMMIT') } catch (error) { db.exec('ROLLBACK'); throw error }
          json(res, 200, { ok: true }); return true
        }
        if (req.method === 'PUT') {
          const input = await authorizedJson(req, principal), session = validateSession(input.session)
          if (session.id !== id) fail(400, 'Conversation identity mismatch')
          if (input.migrate === true && load(owner, id)) { json(res, 200, { session: load(owner, id) }); return true }
          if (active(owner, id)) fail(409, '服务端正在生成，请等待完成后再修改会话')
          if (!load(owner, id) && db.prepare('SELECT COUNT(*) AS n FROM chat_sessions WHERE owner=?').get(owner).n >= 2000) fail(400, 'At most 2000 conversations are supported per identity')
          assertRevision(owner, id, input.revision); put(owner, session); json(res, 200, { session: load(owner, id) }); return true
        }
      }
      if (pathname === '/api/chat/jobs' && req.method === 'POST') { const input = await authorizedJson(req, principal, 8 * 1024 * 1024); json(res, 202, start(principal, input, req.headers['x-studio-provider'])); return true }
      const jobMatch = pathname.match(/^\/api\/chat\/jobs\/([a-zA-Z0-9_-]{1,128})(\/stop)?$/)
      if (jobMatch) {
        const job = jobFor(owner, jobMatch[1]); if (!job) fail(404, 'Task not found')
        if (!jobMatch[2] && req.method === 'GET') { json(res, 200, responseFor(job, url.searchParams.get('after'))); return true }
        if (jobMatch[2] && req.method === 'POST') { running.get(owner + ':' + job.id)?.abort(); json(res, 200, { ok: true }); return true }
      }
      fail(404, 'Chat endpoint not found')
    },
    async close() { for (const controller of running.values()) controller.abort(); await Promise.allSettled([...tasks]) },
  }
}
