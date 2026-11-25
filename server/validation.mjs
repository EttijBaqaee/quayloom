import { randomUUID } from 'node:crypto'
import { normalizeQuota } from './quota.mjs'
import { searchAdapterFor } from './search.mjs'
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status } }
export const fail = (status, message) => { throw new HttpError(status, message) }
export const REASONING_EFFORTS = Object.freeze(['minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
export const DEFAULT_REASONING_EFFORTS = Object.freeze(['low', 'medium', 'high'])
export const DEEPSEEK_REASONING_EFFORTS = Object.freeze(['low', 'high', 'max'])
const text = (value, name, max = 256) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(400, `${name} must contain 1–${max} characters`)
  return value.trim()
}
export function validateProvider(input, id, validateBaseUrl) {
  if (!input || Array.isArray(input) || typeof input !== 'object') fail(400, 'Invalid provider')
  if (!['openai', 'anthropic', 'deepseek'].includes(input.type)) fail(400, 'Unsupported protocol')
  const config = { id: id || randomUUID(), name: text(input.name, 'name', 100), type: input.type, baseUrl: text(input.baseUrl, 'baseUrl', 2048).replace(/\/+$/, ''), enabled: input.enabled !== false, allowPrivateNetwork: input.allowPrivateNetwork === true, models: [] }
  config.quota = normalizeQuota(input.quota)
  validateBaseUrl(config)
  if (!Array.isArray(input.models) || input.models.length > 500) fail(400, 'models must be an array of at most 500 entries')
  const seen = new Set()
  for (const item of input.models) {
    if (!item || typeof item !== 'object') fail(400, 'Invalid model')
    const modelId = text(item.id, 'model.id', 256)
    if (seen.has(modelId)) fail(400, 'Duplicate model ID')
    seen.add(modelId)
    const cap = item.capabilities || {}
    const caps = Object.fromEntries(['thinking', 'search', 'files', 'vision', 'speech'].map(k => [k, cap[k] === true]))
    if (input.type !== 'deepseek' && caps.speech) fail(400, 'Native speech is only implemented for DeepSeek protocol')
    if (item.searchAdapter !== undefined && !['openai-web-search', 'anthropic-web-search'].includes(item.searchAdapter)) fail(400, 'Invalid searchAdapter')
    // An adapter declaration can be retained while search is switched off, but
    // it must always match the provider and the explicitly selected protocol.
    if (item.searchAdapter !== undefined && !searchAdapterFor(config, { ...item, capabilities: { search: true } })) fail(400, 'searchAdapter is incompatible with provider type or OpenAI protocol')
    if (caps.search && input.type !== 'deepseek' && !searchAdapterFor(config, { ...item, capabilities: caps })) fail(400, 'OpenAI/Anthropic native search requires an explicit compatible searchAdapter')
    if (input.type === 'openai' && caps.files) fail(400, 'OpenAI-compatible models support image vision, not native files')
    const maxOutputTokens = item.maxOutputTokens ?? 4096
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 256 || maxOutputTokens > 200000) fail(400, 'maxOutputTokens must be an integer between 256 and 200000')
    const contextWindowTokens = item.contextWindowTokens ?? null
    if (contextWindowTokens !== null && (!Number.isSafeInteger(contextWindowTokens) || contextWindowTokens < 1 || contextWindowTokens > 1000000000)) fail(400, 'contextWindowTokens must be an integer between 1 and 1000000000, or null when unknown')
    if (caps.thinking && input.type === 'anthropic' && maxOutputTokens <= 1024) fail(400, 'Anthropic thinking requires maxOutputTokens above 1024')
    if (item.openaiProtocol !== undefined && (input.type !== 'openai' || !['chat-completions', 'responses'].includes(item.openaiProtocol))) fail(400, 'Invalid openaiProtocol')
    const supportedEfforts = input.type === 'deepseek' ? DEEPSEEK_REASONING_EFFORTS : REASONING_EFFORTS
    if (item.reasoningEfforts !== undefined && (input.type === 'anthropic' || !Array.isArray(item.reasoningEfforts) || !item.reasoningEfforts.length || item.reasoningEfforts.length > supportedEfforts.length || new Set(item.reasoningEfforts).size !== item.reasoningEfforts.length || item.reasoningEfforts.some(effort => !supportedEfforts.includes(effort)))) fail(400, 'Invalid reasoningEfforts')
    const efforts = item.reasoningEfforts ?? (input.type === 'deepseek' ? DEEPSEEK_REASONING_EFFORTS : DEFAULT_REASONING_EFFORTS)
    if (item.reasoningEffort !== undefined && (input.type === 'anthropic' || !efforts.includes(item.reasoningEffort))) fail(400, 'Invalid reasoningEffort: default must be supported by reasoningEfforts')
    config.models.push({ id: modelId, name: text(item.name || modelId, 'model.name', 128), capabilities: caps, maxOutputTokens, ...(contextWindowTokens !== null ? { contextWindowTokens } : {}), ...(item.reasoningEffort !== undefined ? { reasoningEffort: item.reasoningEffort } : {}), ...(item.openaiProtocol !== undefined ? { openaiProtocol: item.openaiProtocol } : {}), ...(item.searchAdapter !== undefined ? { searchAdapter: item.searchAdapter } : {}), ...(item.reasoningEfforts !== undefined ? { reasoningEfforts: [...item.reasoningEfforts] } : {}) })
  }
  if (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || input.apiKey.length > 16384 || /[\r\n]/.test(input.apiKey))) fail(400, 'Invalid API key')
  return config
}
export function validateChat(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Invalid message request')
  text(body.model, 'model', 256)
  if (body.reasoning_effort !== undefined && !REASONING_EFFORTS.includes(body.reasoning_effort)) fail(400, 'Invalid reasoning_effort')
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 2000) fail(400, 'messages must contain 1–2000 entries')
  for (const message of body.messages) {
    if (!message || !['user', 'assistant', 'latest_reminder'].includes(message.role)) fail(400, 'Invalid message role')
    if (typeof message.content !== 'string' && !Array.isArray(message.content)) fail(400, 'Invalid message content')
  }
  return body
}
