import { translate, type TranslationMessage } from '../../i18n/index.js'
import { selectedTarget, sessionExpired, useStudio } from '../studio.js'
import { resizeUploadImage } from '../../utils/resizeUploadImage.js'
import { extractDocument } from '../documentExtraction.js'
import { runtimeApiOrigin } from '../runtimePaths.js'
import { readMessageEvent } from './parseEvent.js'
import { readServerSentEvents } from './sse.js'
import type {
  ApiErrorBody,
  CreateMessageRequest,
  FileObject,
  FilePurpose,
  MessageStreamEvent,
} from './types.js'

/** 运行时同源服务器 API 前缀；供应商地址与密钥由服务器管理。 */
export const API_ORIGIN = runtimeApiOrigin()
/** Anthropic 兼容接口的前缀 */
const ANTHROPIC_BASE_URL = `${API_ORIGIN}/anthropic/v1`
/** 引用 Files API 上传的图片、调用 Anthropic 兼容 Files API 时必须携带 */
const FILES_BETA = 'files-api-2025-04-14'

export type ApiErrorKind =
  /** 非 2xx 响应 */
  | 'http'
  /** 流中返回的错误帧（如等待生成超时），随后连接关闭 */
  | 'stream'
  /** 请求没有到达服务端（断网、跨域被拦截等） */
  | 'network'
  /** 流在 message_stop 之前结束 */
  | 'interrupted'
  /** 响应不符合协议（如非 SSE 响应） */
  | 'protocol'

export class ApiError extends Error {
  readonly localMessage?: TranslationMessage

  constructor(
    readonly kind: ApiErrorKind,
    message: string | TranslationMessage,
    readonly status?: number
  ) {
    super(typeof message === 'string' ? message : translate(message.key, message.params))
    this.name = 'ApiError'
    this.localMessage = typeof message === 'string' ? undefined : message
  }
}

const isErrorBody = (value: unknown): value is ApiErrorBody =>
  typeof value === 'object' &&
  value !== null &&
  'error' in value &&
  typeof (value as ApiErrorBody).error?.message === 'string'

const readErrorResponse = async (
  response: Response,
  kind: 'http' | 'protocol' = 'http',
  fallback = response.statusText
): Promise<ApiError> => {
  const text = await response.text().catch(() => '')
  let message = text || fallback
  try {
    const body: unknown = JSON.parse(text)
    if (isErrorBody(body)) {
      message = body.error.message
    }
  } catch {
    // 非 JSON 响应体直接展示原文
  }
  return new ApiError(kind, message, response.status)
}

export const request = async (url: string, init: RequestInit): Promise<Response> => {
  let response: Response
  try {
    const headers = new Headers(init.headers)
    // Original demo call signatures retain a harmless compatibility argument only.
    headers.delete('Authorization')
    headers.delete('x-api-key')
    const principal = useStudio.getState().principal
    if (principal) {headers.set('x-studio-principal', principal.id)}
    const target = selectedTarget()
    if (target) {
      if (!headers.has('x-studio-provider')) {headers.set('x-studio-provider', target.provider.id)}
      if (!headers.has('x-studio-model')) {headers.set('x-studio-model', target.model.id)}
    }
    response = await fetch(url, { ...init, headers, credentials: 'same-origin' })
    if (response.status === 401) {sessionExpired()}
  } catch (error) {
    if (init.signal?.aborted) {
      throw error
    }
    throw new ApiError('network', error instanceof Error ? error.message : String(error))
  }
  if (!response.ok) {
    throw await readErrorResponse(response)
  }
  return response
}

const anthropicHeaders = (apiKey: string, beta: boolean): Record<string, string> => {
  void apiKey // Original demo compatibility signature; upstream secrets live only on the server.
  return beta ? { 'anthropic-beta': FILES_BETA } : {}
}

/** 用 GET /models 校验 API Key（不产生费用） */
export const verifyApiKey = async (apiKey: string, signal?: AbortSignal): Promise<void> => {
  await request(`${API_ORIGIN}/models`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  })
}

/**
 * POST /anthropic/v1/files 上传附件（不设过期时间，会话里的历史附件一直可用）。
 * purpose 为 null 时不传该字段（图片）；purpose 必须排在 file 之前。
 */
export const uploadFile = async (
  apiKey: string,
  file: File,
  purpose: FilePurpose | null,
  signal?: AbortSignal,
  target = selectedTarget()
): Promise<FileObject> => {
  if (target?.provider.type === 'openai') {
    if (purpose !== null) {
      if (!target.model.capabilities.files) {throw new ApiError('protocol', '所选模型未启用文档提取文字。')}
      const document = await extractDocument(file, signal).catch((error: unknown) => {
        if (signal?.aborted) { throw error }
        throw new ApiError('protocol', error instanceof Error ? error.message : '文档文字提取失败。', 400)
      })
      const response = await request(`${API_ORIGIN}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-studio-provider': target.provider.id, 'x-studio-model': target.model.id },
        body: JSON.stringify(document), signal,
      })
      return (await response.json()) as FileObject
    }
    if (!target.model.capabilities.vision) {throw new ApiError('protocol', '所选模型不支持此附件类型。')}
    const body = await resizeUploadImage(file, signal)
    const response = await request(`${API_ORIGIN}/images`, {
      method: 'POST',
      headers: { 'Content-Type': body.type, 'x-studio-provider': target.provider.id, 'x-studio-model': target.model.id, 'x-studio-filename': encodeURIComponent(file.name) },
      body,
      signal,
    })
    return (await response.json()) as FileObject
  }
  const form = new FormData()
  if (purpose) {
    form.append('purpose', purpose)
  }
  form.append('file', purpose === null ? await resizeUploadImage(file, signal) : file)
  const response = await request(`${ANTHROPIC_BASE_URL}/files`, {
    method: 'POST',
    headers: { ...anthropicHeaders(apiKey, true), ...(target ? { 'x-studio-provider': target.provider.id, 'x-studio-model': target.model.id } : {}) },
    body: form,
    signal,
  })
  return (await response.json()) as FileObject
}

/** DELETE /anthropic/v1/files/{file_id} */
export const deleteFile = async (apiKey: string, fileId: string): Promise<void> => {
  const url = fileId.startsWith('qldoc_') ? `${API_ORIGIN}/documents/${encodeURIComponent(fileId)}` : fileId.startsWith('qlimg_') ? `${API_ORIGIN}/images/${encodeURIComponent(fileId)}` : `${ANTHROPIC_BASE_URL}/files/${encodeURIComponent(fileId)}`
  await request(url, {
    method: 'DELETE',
    headers: anthropicHeaders(apiKey, true),
  })
}

const hasFile = (body: CreateMessageRequest) =>
  body.messages.some(
    (message) =>
      typeof message.content !== 'string' &&
      message.content.some((block) => block.type === 'image' || block.type === 'document')
  )

/**
 * POST /anthropic/v1/messages（stream: true），逐个产出流式事件，收到 message_stop 时结束。
 * ping、保活注释与无法解析的内容不产出；中止请求时抛出 signal 的 AbortError。
 */
export async function* streamMessage(
  apiKey: string,
  body: CreateMessageRequest,
  signal: AbortSignal,
  providerId?: string
): AsyncGenerator<MessageStreamEvent> {
  const response = await request(`${ANTHROPIC_BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      ...anthropicHeaders(apiKey, hasFile(body)),
      ...(providerId ? { 'x-studio-provider': providerId } : {}),
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  })
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!response.body || !contentType.includes('text/event-stream')) {
    throw await readErrorResponse(response, 'protocol', '')
  }
  for await (const { event: eventName, data } of readServerSentEvents(response.body, signal)) {
    let payload: unknown
    try {
      payload = JSON.parse(data)
    } catch {
      if (eventName !== 'error') {
        continue
      }
    }
    if (isErrorBody(payload)) {
      throw new ApiError('stream', payload.error.message)
    }
    if (eventName === 'error') {
      throw new ApiError('stream', data)
    }
    const event = readMessageEvent(payload)
    if (!event) {
      continue
    }
    yield event
    if (event.type === 'message_stop') {
      return
    }
  }
  // 服务端没有提供错误内容时保持为空，不推测断流原因。
  throw new ApiError('interrupted', '')
}
