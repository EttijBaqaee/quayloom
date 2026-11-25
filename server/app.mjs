import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stat, readFile } from 'node:fs/promises'
import { once } from 'node:events'
import { openStore, PRESETS } from './store.mjs'
import { HttpError, fail, validateProvider, validateChat } from './validation.mjs'
import * as defaultAdapters from './adapters.mjs'
import { createQuotaLedger } from './quota.mjs'
import { normalizeAccess, allowsModel } from './access.mjs'
import { createServerChat } from './chat.mjs'
import { createNotices } from './notices.mjs'
import { createImages } from './images.mjs'
import { createUsageAnalytics } from './analytics.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const JSON_LIMIT = 4 * 1024 * 1024
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json' }
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)) }
async function readBody(req, limit = JSON_LIMIT) {
  if (Number(req.headers['content-length']) > limit) fail(413, 'Request body is too large')
  let size = 0; const chunks = []
  for await (const chunk of req) { size += chunk.length; if (size > limit) fail(413, 'Request body is too large'); chunks.push(chunk) }
  return Buffer.concat(chunks)
}
async function readJson(req, limit) {
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) fail(415, 'Expected application/json')
  try { return JSON.parse((await readBody(req, limit)).toString('utf8')) } catch (error) { if (error instanceof HttpError) throw error; fail(400, 'Invalid JSON') }
}
function cookie(req) { return (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('studio_session='))?.slice(15) || '' }
const cleanMessage = (error, secret = '') => {
  let message = String(error?.message || 'Request failed')
  if (secret) message = message.split(secret).join('[REDACTED]')
  return message.replace(/\b(Bearer\s+)[^\s"']+/gi, '$1[REDACTED]').slice(0, 2000)
}
export function createApp(options = {}) {
  const basePath = options.basePath || ''
  if (basePath && !/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(basePath)) throw new Error('Invalid BASE_PATH')
  const store = openStore(options.dataDir || path.join(ROOT, 'data'), options)
  const adapters = options.adapters || defaultAdapters
  const attempts = new Map(), controllers = new Set(), accessControllers = new Map()
  const catalogFor = access => store.providers().filter(p => p.enabled).map(({ id, name, type, models }) => ({ id, name, type, models: models.filter(m => !access || allowsModel(access, id, m.id)).map(m => access ? { ...m, capabilities: { ...m.capabilities, files: false, vision: false, speech: false, search: false } } : m) })).filter(p => p.models.length)
  const validateAllowed = config => {
    for (const item of config.allowedModels) {
      const provider = store.provider(item.providerId)
      if (!provider?.enabled || !provider.models.some(m => m.id === item.modelId)) fail(400, 'Allowed models must belong to enabled configured providers')
    }
  }
  const ledger = createQuotaLedger(store.db, { timeZone: options.quotaTimeZone || 'Asia/Shanghai' })
  const images = createImages({ store })
  const chat = createServerChat({ store, adapters, ledger, controllers, accessControllers, images })
  const notices = createNotices({ store })
  const analytics = createUsageAnalytics({ db: store.db })
  const usageFor = code => {
    const usage = ledger.accessUsage(code)
    return { ...usage, providers: usage.providers.map(item => {
      const provider = store.provider(item.providerId)
      return { ...item, name: provider?.name || '已删除渠道', available: Boolean(provider?.enabled && provider.models.some(model => allowsModel(code, provider.id, model.id))) }
    }) }
  }
  const authorizedJson = async (req, principal, limit) => {
    const body = await readJson(req, limit)
    if (store.sessionInfo(cookie(req))?.id !== principal.id) fail(401, '会话已失效，请重新登录')
    return body
  }
  const secure = options.secureCookies === true
  const cookieValue = (token, age = 604800) => `studio_session=${token}; HttpOnly; SameSite=Strict; Path=${basePath || '/'}; Max-Age=${age}${secure ? '; Secure' : ''}`
  const dist = options.distDir || path.join(ROOT, 'dist')
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'same-origin')
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")
    let secret = '', privateUpstream = false
    try {
      const host = req.headers.host
      if (!host || /[\s/@\\]/.test(host)) fail(400, 'Invalid Host')
      const localPort = server.address()?.port
      const allowed = options.publicOrigin ? [new URL(options.publicOrigin).host] : [`localhost:${localPort}`, `127.0.0.1:${localPort}`, `[::1]:${localPort}`, ...(options.bindHost && !['0.0.0.0', '::'].includes(options.bindHost) ? [`${options.bindHost}:${localPort}`] : [])]
      if (!allowed.includes(host)) fail(403, 'Host is not allowed; configure PUBLIC_ORIGIN for remote access')
      const origin = options.publicOrigin ? new URL(options.publicOrigin).origin : `${secure ? 'https' : 'http'}://${host}`
      const url = new URL(req.url, origin)
      let pathname = url.pathname
      if (basePath) {
        if (pathname === basePath && ['GET', 'HEAD'].includes(req.method)) { res.writeHead(308, { Location: basePath + '/' }); res.end(); return }
        if (!pathname.startsWith(basePath + '/')) fail(404, 'Path is outside this application')
        pathname = pathname.slice(basePath.length)
      }
      if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== origin) fail(403, 'Origin does not match this application')
      if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Cross-site access is not permitted')
      if (pathname === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true })
      if (pathname === '/api/source.zip' && ['GET', 'HEAD'].includes(req.method)) {
        const archivePath = options.sourceArchive || path.join(ROOT, 'source', 'quayloom-source.zip')
        let info
        try { info = await stat(archivePath) } catch (error) { if (error.code === 'ENOENT') fail(404, 'Corresponding source is not packaged in this development build'); throw error }
        if (!info.isFile() || info.size > 16 * 1024 * 1024) fail(503, 'Source archive is unavailable')
        const body = req.method === 'HEAD' ? undefined : await readFile(archivePath)
        res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="Quayloom-source.zip"', 'Content-Length': body?.length ?? info.size, 'Cache-Control': 'no-store' })
        res.end(body); return
      }
      if (pathname === '/api/auth/login' && req.method === 'POST') {
        const body = await readJson(req, 4096)
        const ip = `${body?.mode === 'code' ? 'code' : 'admin'}:${req.socket.remoteAddress || 'unknown'}`, now = Date.now()
        if (attempts.size > 10000) for (const [key, value] of attempts) if (value.until < now) attempts.delete(key)
        // No await between reading and updating the limiter; slow concurrent bodies cannot overwrite it.
        const state = attempts.get(ip)
        if (state && state.until > now && state.count >= 8) { res.setHeader('Retry-After', Math.ceil((state.until - now) / 1000)); fail(429, 'Too many login attempts; try again in 15 minutes') }
        attempts.set(ip, { count: (state && state.until > now ? state.count : 0) + 1, until: state && state.until > now ? state.until : now + 900000 })
        let principal = 'admin'
        if (body?.mode === 'code') {
          const access = store.verifyAccessCode(body.code)
          if (!access) fail(401, '使用码无效、已过期或已禁用')
          principal = access.id
        } else {
          if (body?.mode !== undefined && body.mode !== 'admin') fail(400, 'Invalid login mode')
          if (!store.verifyPassword(body?.password)) fail(401, '管理员密码不正确')
        }
        attempts.delete(ip)
        store.logout(cookie(req))
        const token = store.createSession(principal)
        res.setHeader('Set-Cookie', cookieValue(token))
        return json(res, 200, { authenticated: true, principal: store.sessionInfo(token) })
      }
      if (pathname.startsWith('/api/')) {
        const principal = store.sessionInfo(cookie(req))
        if (!principal) fail(401, 'Please sign in')
        if (req.headers['x-studio-principal'] && req.headers['x-studio-principal'] !== principal.id) fail(401, '登录身份已变化，请重新加载页面')
        const access = principal.role === 'user' ? store.activeAccess(principal.id) : null
        if (pathname === '/api/auth/session' && req.method === 'GET') return json(res, 200, { authenticated: true, principal })
        if (pathname === '/api/auth/logout' && req.method === 'POST') { store.logout(cookie(req)); res.setHeader('Set-Cookie', cookieValue('', 0)); return json(res, 200, { ok: true }) }
        if (pathname.startsWith('/api/admin/') && principal.role !== 'admin') fail(403, '仅管理员可以访问管理接口')
        if (pathname === '/api/admin/analytics') {
          if (req.method !== 'GET') fail(405, 'Method not allowed')
          try { return json(res, 200, analytics.query(url.searchParams)) } catch (error) {
            if (error instanceof HttpError) throw error
            fail(500, '用量分析暂不可用')
          }
        }
        if (await notices.handle(req, res, pathname, url, principal, authorizedJson, json)) return
        if (await chat.handle(req, res, pathname, url, principal, authorizedJson, json)) return
        if (pathname === '/api/catalog' && req.method === 'GET') {
          const providers = catalogFor(access), candidate = store.reconcileDefault()
          const defaultModel = candidate && providers.some(p => p.id === candidate.providerId && p.models.some(m => m.id === candidate.modelId)) ? candidate : providers[0] ? { providerId: providers[0].id, modelId: providers[0].models[0].id } : null
          return json(res, 200, { providers, defaultModel })
        }
        if (pathname === '/api/me/usage' && req.method === 'GET') {
          if (!access) fail(403, 'Use the administrator usage page')
          return json(res, 200, { ...usageFor(access), name: access.name, expiresAt: access.expiresAt })
        }
        if (pathname === '/api/admin/access-codes') {
          if (req.method === 'GET') return json(res, 200, { accessCodes: store.accessCodes().map(code => ({ ...code, usage: usageFor(code) })) })
          if (req.method === 'POST') {
            if (store.accessCodes().length >= 1000) fail(400, 'At most 1000 access codes are supported')
            const config = normalizeAccess(await authorizedJson(req, principal)); validateAllowed(config)
            return json(res, 201, store.createAccessCode(config))
          }
        }
        const revealMatch = pathname.match(/^\/api\/admin\/access-codes\/([a-zA-Z0-9-]+)\/secret$/)
        if (revealMatch && req.method === 'POST') {
          const code = store.revealAccessCode(revealMatch[1]); if (!code) fail(404, 'Access code secret is unavailable')
          return json(res, 200, { code })
        }
        const codeMatch = pathname.match(/^\/api\/admin\/access-codes\/([a-zA-Z0-9-]+)$/)
        if (codeMatch && req.method === 'PUT') {
          const previous = store.accessCode(codeMatch[1]); if (!previous) fail(404, 'Access code not found')
          const body = await authorizedJson(req, principal), config = normalizeAccess({ ...previous, ...body })
          if (Object.hasOwn(body, 'allowedModels')) validateAllowed(config)
          const code = store.updateAccessCode(previous.id, config)
          for (const [controller, id] of accessControllers) if (id === code.id) controller.abort()
          return json(res, 200, { accessCode: code })
        }
        if (pathname === '/api/admin/usage' && req.method === 'GET') return json(res, 200, ledger.list(store.providers()))
        if (pathname === '/api/admin/providers') {
          if (req.method === 'GET') return json(res, 200, { providers: store.providers(), presets: PRESETS, defaultModel: store.reconcileDefault() })
          if (req.method === 'POST') {
            const body = await authorizedJson(req, principal), config = validateProvider(body, undefined, adapters.validateBaseUrl)
            return json(res, 201, { provider: store.saveProvider(config, body) })
          }
        }
        const match = pathname.match(/^\/api\/admin\/providers\/([a-zA-Z0-9-]+)(?:\/(test|discover))?$/)
        if (match) {
          const [, id, action] = match, provider = store.provider(id, true)
          if (!provider) fail(404, 'Provider not found')
          secret = provider.apiKey
          if (!action && req.method === 'PUT') {
            const body = await authorizedJson(req, principal), config = validateProvider(body, id, adapters.validateBaseUrl)
            return json(res, 200, { provider: store.saveProvider(config, body) })
          }
          if (!action && req.method === 'DELETE') { store.deleteProvider(id); return json(res, 200, { ok: true }) }
          if (action && req.method === 'POST') {
            const start = performance.now(), models = await adapters.discoverModels(provider, { signal: AbortSignal.timeout(30000) })
            return json(res, 200, action === 'test' ? { ok: true, latencyMs: Math.round(performance.now() - start), models: models.map(m => m.id), scope: 'model-listing-only' } : { models })
          }
        }
        if (pathname === '/api/admin/default-model' && req.method === 'PUT') {
          const body = await authorizedJson(req, principal), provider = store.provider(body?.providerId)
          if (!provider?.enabled || !provider.models.some(m => m.id === body?.modelId)) fail(400, 'Select an enabled provider and configured model')
          store.setSetting('defaultModel', { providerId: provider.id, modelId: body.modelId }); return json(res, 200, { ok: true })
        }
        if (pathname === '/api/history') {
          if (principal.role !== 'admin') fail(403, '使用码不能访问管理员历史快照，请使用个人会话接口')
          if (req.method === 'GET') return json(res, 200, store.history())
          if (req.method === 'PUT') {
            const body = await authorizedJson(req, principal, 40 * 1024 * 1024)
            if (!body || !Number.isSafeInteger(body.revision) || body.revision < 0 || !Object.hasOwn(body, 'snapshot')) fail(400, 'Expected snapshot and nonnegative integer revision')
            const revision = store.saveHistory(body.snapshot, body.revision)
            if (revision === null) fail(409, 'Server history changed; fetch the latest snapshot before saving again')
            return json(res, 200, { revision })
          }
        }
        if (pathname === '/api/models' && req.method === 'GET') return json(res, 200, { data: catalogFor(access).flatMap(p => p.models.map(m => ({ id: m.id, object: 'model', provider: p.id }))) })
        if (pathname === '/api/anthropic/v1/messages' && req.method === 'POST') {
          let body = validateChat(await authorizedJson(req, principal))
          const provider = store.provider(req.headers['x-studio-provider'], true)
          if (!provider?.enabled) fail(400, 'Select an enabled provider')
          secret = provider.apiKey
          const model = provider.models.find(m => m.id === body.model)
          if (!model) fail(400, 'Model is not configured for this provider')
          const requestAccess = access ? store.activeAccess(access.id) : null
          if (access && !requestAccess) fail(401, '使用码已过期或已禁用')
          if (requestAccess) {
            if (!allowsModel(requestAccess, provider.id, model.id)) fail(403, '此使用码未获准使用该模型')
            const textOnly = content => typeof content === 'string' || (Array.isArray(content) && content.every(block => block && (block.type === 'text' && typeof block.text === 'string' || block.type === 'thinking' && typeof block.thinking === 'string')))
            if (body.messages.some(message => !textOnly(message.content)) || body.system !== undefined && !textOnly(body.system) || body.tools?.length || body.tool_choice) fail(403, '使用码当前仅支持文本与推理聊天，不支持文件、语音或工具')
          }
          body = images.resolve(principal.id, provider, body)
          adapters.validateChatRequest?.(provider, model, body)
          const reservation = ledger.reserve(provider, model, body, { access: requestAccess })
          privateUpstream = Boolean(requestAccess)
          let usage, completed = false, usageDelta = false
          const controller = new AbortController(); controllers.add(controller)
          if (requestAccess) accessControllers.set(controller, requestAccess.id)
          const abort = () => controller.abort(); res.on('close', abort)
          const timer = setTimeout(abort, Math.max(1, Math.min(10 * 60000, requestAccess?.expiresAt ? requestAccess.expiresAt - Date.now() : Infinity)))
          try {
            const iterator = adapters.streamChat(provider, model, body, { signal: controller.signal })
            // Validate upstream and capabilities before committing the SSE status.
            const first = await iterator.next()
            if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
            res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' }); res.flushHeaders()
            const emit = async (event) => {
              if (event.type === 'message_start' && event.message?.usage) usage = { ...event.message.usage }
              if (event.type === 'message_delta' && event.usage) { usage = { ...usage, ...event.usage }; usageDelta = true }
              if (event.type === 'message_stop') completed = true
              if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
              if (!res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)) await once(res, 'drain', { signal: controller.signal })
            }
            if (!first.done) await emit(first.value)
            for await (const event of iterator) await emit(event)
            res.end()
          } finally {
            clearTimeout(timer); controllers.delete(controller); accessControllers.delete(controller); res.off('close', abort)
            ledger.settle(reservation, completed && usageDelta ? usage : undefined, completed ? 'completed' : 'interrupted')
          }
          return
        }
        if (pathname === '/api/images' || pathname.startsWith('/api/images/')) {
          if (principal.role !== 'admin') fail(403, '使用码暂不支持图片上传')
          const provider = store.provider(req.headers['x-studio-provider'])
          if (!provider?.enabled || provider.type !== 'openai') fail(400, 'Select an enabled OpenAI-compatible provider')
          if (pathname === '/api/images') {
            if (req.method !== 'POST') fail(405, 'Method not allowed')
            const model = provider.models.find(m => m.id === req.headers['x-studio-model'])
            if (!model?.capabilities.vision) fail(400, 'Select a configured vision model')
            const bytes = await readBody(req, 3 * 1024 * 1024)
            if (store.sessionInfo(cookie(req))?.id !== principal.id) fail(401, '会话已失效，请重新登录')
            let name
            try { name = decodeURIComponent(req.headers['x-studio-filename'] || 'image') } catch { fail(400, 'Invalid image filename') }
            return json(res, 201, images.upload(principal.id, provider, model, { bytes, mediaType: req.headers['content-type'], name }))
          }
          const id = pathname.slice('/api/images/'.length)
          if (req.method === 'GET') return json(res, 200, images.metadata(principal.id, provider.id, id))
          if (req.method === 'DELETE') { images.delete(principal.id, provider.id, id); return json(res, 200, { ok: true }) }
          fail(405, 'Method not allowed')
        }
        if (pathname.startsWith('/api/anthropic/v1/files') || /^\/api\/audio\/(asr|tts)$/.test(pathname)) {
          if (principal.role !== 'admin') fail(403, '使用码暂不支持文件或语音接口')
          if (!['GET', 'POST', 'DELETE'].includes(req.method)) fail(405, 'Method not allowed')
          const provider = store.provider(req.headers['x-studio-provider'], true)
          if (!provider?.enabled) fail(400, 'Select an enabled provider')
          secret = provider.apiKey
          const model = provider.models.find(m => m.id === req.headers['x-studio-model'])
          if (!model) fail(400, 'Select a configured model with x-studio-model')
          const controller = new AbortController(); controllers.add(controller)
          const abort = () => controller.abort(); res.on('close', abort)
          const timer = setTimeout(abort, 120000)
          let reservation
          try {
            const buffer = ['GET', 'DELETE'].includes(req.method) ? undefined : await readBody(req, 32 * 1024 * 1024)
            if (store.sessionInfo(cookie(req))?.role !== 'admin') fail(401, '会话已失效，请重新登录')
            reservation = ledger.reserve(provider, model, {}, { feature: true })
            const upstream = await adapters.proxyFeature(provider, pathname.slice(4), { method: req.method, headers: { 'content-type': req.headers['content-type'] || 'application/octet-stream' }, body: buffer, signal: controller.signal, model })
            if (!upstream.ok) fail(upstream.status, 'Upstream feature request failed')
            const type = upstream.headers.get('content-type') || 'application/octet-stream'
            if (pathname === '/api/anthropic/v1/files' && req.method === 'POST') {
              const file = await upstream.json(); return json(res, 200, { ...file, provider_id: provider.id })
            }
            res.writeHead(upstream.status, { 'Content-Type': type, 'Cache-Control': 'no-store' })
            if (upstream.body) for await (const chunk of upstream.body) if (!res.write(chunk)) await once(res, 'drain', { signal: controller.signal })
            res.end()
          } finally {
            clearTimeout(timer); controllers.delete(controller); res.off('close', abort)
            if (reservation) ledger.settle(reservation, { input_tokens: 0, output_tokens: 0 }, 'feature')
          }
          return
        }
        fail(404, 'API endpoint not found')
      }
      if (!['GET', 'HEAD'].includes(req.method)) fail(405, 'Method not allowed')
      let relative
      try { relative = decodeURIComponent(pathname) } catch { fail(400, 'Invalid path') }
      if (relative.includes('\0') || relative.includes('\\')) fail(400, 'Invalid path')
      let target = path.resolve(dist, `.${relative}`)
      if (target !== dist && !target.startsWith(dist + path.sep)) fail(403, 'Path is not allowed')
      if (relative === '/' || relative === '/admin') target = path.join(dist, 'index.html')
      try {
        const info = await stat(target)
        if (!info.isFile()) fail(404, 'Not found')
        const body = await readFile(target)
        res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream', 'Cache-Control': target.endsWith('index.html') ? 'no-cache' : 'public,max-age=31536000,immutable', 'Content-Length': body.length })
        res.end(req.method === 'HEAD' ? undefined : body)
      } catch (error) { if (error.code === 'ENOENT') fail(404, 'Frontend not built. Run pnpm build first.'); throw error }
    } catch (error) {
      if (res.destroyed || error?.name === 'AbortError') { if (!res.destroyed) res.end(); return }
      const status = Number.isInteger(error.status || error.statusCode) && (error.status || error.statusCode) >= 400 && (error.status || error.statusCode) < 600 ? error.status || error.statusCode : 500
      const message = privateUpstream ? `该渠道暂时无法完成请求，请稍后重试或联系管理员（${status}）` : status === 500 ? 'Internal server error' : cleanMessage(error, secret)
      if (res.headersSent) { res.end(`event: error\ndata: ${JSON.stringify({ error: { message } })}\n\n`) }
      else json(res, status, { error: { message } })
    }
  })
  server.requestTimeout = 120000; server.headersTimeout = 15000; server.maxHeadersCount = 64
  return { server, store, ledger, async close() { for (const c of controllers) c.abort(); server.closeAllConnections(); if (server.listening) await new Promise(resolve => server.close(resolve)); await chat.close(); store.close() } }
}
