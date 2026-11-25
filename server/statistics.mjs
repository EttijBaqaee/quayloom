import { performance } from 'node:perf_hooks'

const token = value => Number.isSafeInteger(value) && value >= 0 ? value : null
const elapsed = (end, start) => Number.isFinite(end) && Number.isFinite(start) && end >= start ? end - start : null
export function safeStatisticsText(value, provider = {}, maximum = 160) {
  let text = typeof value === 'string' ? value : ''
  if (provider.apiKey) for (const secret of [provider.apiKey, encodeURIComponent(provider.apiKey), Buffer.from(provider.apiKey).toString('base64')]) text = text.split(secret).join('[REDACTED]')
  return text.replace(/data:[^\s]+/gi, '[attachment]').replace(/[A-Za-z0-9+/=_-]{128,}/g, '[binary]').replace(/(?:(?:Bearer|Basic)\s+|(?:api[_-]?key|authorization|token|password)["']?\s*[=:]\s*["']?)[^\s,"'}]+/gi, '[REDACTED]').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum)
}

/** Optional cache fields are absent in some native APIs. Absence is NOT a cache hit of zero. */
export function statisticsUsage(usage) {
  const input = token(usage?.input_tokens), outputTokens = token(usage?.output_tokens)
  const read = usage?.cache_read_input_tokens === undefined ? 0 : token(usage.cache_read_input_tokens)
  const creation = usage?.cache_creation_input_tokens === undefined ? 0 : token(usage.cache_creation_input_tokens)
  const total = input !== null && read !== null && creation !== null ? input + read + creation : null
  const inputTokens = token(total)
  const reported = usage?.cache_read_input_tokens_reported !== false && usage?.cache_read_input_tokens !== undefined
  const cacheReadTokens = reported ? token(usage.cache_read_input_tokens) : null
  const creationReported = usage?.cache_creation_input_tokens_reported !== false && usage?.cache_creation_input_tokens !== undefined
  const cacheCreationTokens = creationReported ? token(usage.cache_creation_input_tokens) : null
  return { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, cacheHitRate: inputTokens > 0 && cacheReadTokens !== null && cacheReadTokens <= inputTokens ? cacheReadTokens / inputTokens : null }
}

export function createRunStatistics({ job, provider, model, body, sequence, trigger, startedAt = Date.now(), monotonicStart = performance.now(), clock = () => performance.now() }) {
  const lastUser = [...body.messages].reverse().find(m => m.role === 'user')
  const text = typeof lastUser?.content === 'string' ? lastUser.content : Array.isArray(lastUser?.content) ? lastUser.content.filter(b => b?.type === 'text' && typeof b.text === 'string').map(b => b.text).join(' ') : ''
  const contextWindowTokens = token(model.contextWindowTokens) > 0 && model.contextWindowTokens <= 1e9 ? model.contextWindowTokens : null
  const run = { id: job.id, sessionId: job.session_id, replyId: job.reply_id, sequence, status: 'running', trigger, summary: safeStatisticsText(text, provider), providerId: provider.id, providerName: safeStatisticsText(provider.name || provider.id, provider), modelId: model.id, modelName: safeStatisticsText(model.name || model.id, provider), startedAt, firstTokenAt: null, lastTokenAt: null, decodeDurationMs: null, endedAt: null, inputTokens: null, outputTokens: null, outputCharacters: 0, cacheReadTokens: null, cacheCreationTokens: null, cacheHitRate: null, contextWindowTokens, contextUsageRatio: null, ttftMs: null, modelDurationMs: null, totalDurationMs: null, toolDurationMs: null, outputTokensPerSecond: null, outputCharactersPerSecond: null, toolCalls: [], timingComplete: false }
  let modelStart = null, modelEnd = null, first = null, last = null, finished = false, usage, outputCountCurrent = false
  let firstCharacter = null, lastCharacter = null
  const trailingHighSurrogates = new Map()
  const characterKey = (index, kind) => `${index ?? 'unindexed'}:${kind}`
  const observeCharacters = (value, kind, index, observedAt) => {
    if (typeof value !== 'string' || !value.length) return
    const key = characterKey(index, kind)
    // Count codepoints, not UTF-16 units. A high surrogate already counted in the
    // previous chunk and its matching leading low surrogate together remain one.
    let count = 0
    for (const point of value) count++
    const leading = value.charCodeAt(0), trailing = value.charCodeAt(value.length - 1)
    if (trailingHighSurrogates.get(key) && leading >= 0xdc00 && leading <= 0xdfff) count--
    trailingHighSurrogates.set(key, trailing >= 0xd800 && trailing <= 0xdbff)
    run.outputCharacters += count
    if (firstCharacter === null) firstCharacter = observedAt
    lastCharacter = observedAt
  }
  const snapshot = () => {
    const now = clock()
    Object.assign(run, statisticsUsage(usage))
    if (!outputCountCurrent) run.outputTokens = null
    run.contextUsageRatio = contextWindowTokens && run.inputTokens !== null ? run.inputTokens / contextWindowTokens : null
    run.ttftMs = first === null || modelStart === null ? null : elapsed(first, modelStart)
    run.modelDurationMs = modelStart === null ? null : elapsed(modelEnd ?? now, modelStart)
    if (!finished) run.totalDurationMs = elapsed(now, monotonicStart)
    const duration = first === null || last === null ? null : elapsed(last, first)
    run.decodeDurationMs = duration > 0 ? duration : null
    run.outputTokensPerSecond = duration > 0 && run.outputTokens !== null ? run.outputTokens / (duration / 1000) : null
    // Character observations have their own clock: starts count here without
    // changing the established delta-only TTFT/token decode rules above.
    const characterSpan = firstCharacter === null || lastCharacter === null ? null : elapsed(lastCharacter, firstCharacter)
    const characterDuration = firstCharacter === null ? null : elapsed(finished ? lastCharacter : now, firstCharacter)
    run.outputCharactersPerSecond = characterSpan > 0 && characterDuration > 0 ? run.outputCharacters / (characterDuration / 1000) : null
    return { ...run, toolCalls: run.toolCalls.map(tool => ({ ...tool })) }
  }
  return {
    startModel() { if (!finished) modelStart = clock() },
    observe(event) {
      if (finished) return
      if (event.type === 'message_start' && event.message?.usage) { usage = { ...event.message.usage }; outputCountCurrent = token(usage.output_tokens) !== null }
      if (event.type === 'message_delta' && event.usage) {
        usage = { ...usage, ...event.usage }
        if (Object.hasOwn(event.usage, 'output_tokens')) outputCountCurrent = token(event.usage.output_tokens) !== null
      }
      const delta = event.type === 'content_block_delta' && event.delta
      if (delta && (delta.type === 'text_delta' && typeof delta.text === 'string' && delta.text.length || delta.type === 'thinking_delta' && typeof delta.thinking === 'string' && delta.thinking.length)) {
        outputCountCurrent = false
        last = clock(); run.lastTokenAt = startedAt + (last - monotonicStart)
        if (first === null) { first = last; run.firstTokenAt = startedAt + (first - monotonicStart) }
        const kind = delta.type === 'text_delta' ? 'text' : 'thinking'
        observeCharacters(delta[kind], kind, event.index, last)
      }
      const block = event.type === 'content_block_start' && event.content_block
      if (block || event.type === 'content_block_stop') {
        trailingHighSurrogates.delete(characterKey(event.index, 'text'))
        trailingHighSurrogates.delete(characterKey(event.index, 'thinking'))
      }
      if (block) {
        const observedAt = clock()
        observeCharacters(block.text, 'text', event.index, observedAt)
        observeCharacters(block.thinking, 'thinking', event.index, observedAt)
      }
      const generatedArguments = delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string' && delta.partial_json.length > 0
      const generatedBlock = block && (typeof block.text === 'string' && block.text.length > 0 || typeof block.thinking === 'string' && block.thinking.length > 0 || ['tool_use', 'server_tool_use', 'redacted_thinking'].includes(block.type))
      if (generatedArguments || generatedBlock) outputCountCurrent = false
      // Names only, never arguments, tool results, request headers or signatures.
      if (block && ['tool_use', 'server_tool_use'].includes(block.type) && typeof block.name === 'string' && /^[a-zA-Z0-9_.:-]{1,128}$/.test(block.name) && (!provider.apiKey || !block.name.includes(provider.apiKey)) && run.toolCalls.length < 1000) run.toolCalls.push({ name: block.name })
    },
    finish(status, error) {
      if (finished) return snapshot()
      modelEnd = clock(); finished = true
      run.status = status; run.endedAt = startedAt + (modelEnd - monotonicStart); run.totalDurationMs = elapsed(modelEnd, monotonicStart); run.timingComplete = true
      if (error) run.error = { kind: safeStatisticsText(error.kind, provider, 80), message: safeStatisticsText(error.message, provider, 500) }
      trailingHighSurrogates.clear()
      return snapshot()
    },
    snapshot,
  }
}

/** A restart has no monotonic clock continuity: never bill offline wall time as generation time. */
export function interruptedStatistics(metrics) {
  if (!metrics) return null
  return { ...metrics, status: 'error', endedAt: null, ttftMs: null, modelDurationMs: null, totalDurationMs: null, decodeDurationMs: null, outputTokensPerSecond: null, outputCharactersPerSecond: null, toolDurationMs: null, timingComplete: false, error: { kind: 'interrupted', message: '服务器已重启，生成已中断；已保存收到的内容。请手动重试。' } }
}
