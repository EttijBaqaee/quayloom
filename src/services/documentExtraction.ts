import { uiText } from '../i18n/ui.js'
import { documentMessages } from '../i18n/documents.en.js'
import { runtimeBasePath } from './runtimePaths.js'
const localError = (message: string) => new Error(uiText(documentMessages, message))

export const DOCUMENT_LIMITS = Object.freeze({ maxBytes: 10 * 1024 * 1024, maxChars: 200_000, maxTextBytes: 1024 * 1024, timeoutMs: 15_000 })
export type ExtractedDocument = { name: string; originalSize: number; format: string; text: string }

/** One disposable worker per upload: cancellation also stops decompression/PDF parsing. */
export const extractDocument = (file: File, signal?: AbortSignal): Promise<ExtractedDocument> => {
  signal?.throwIfAborted()
  if (globalThis.location?.protocol === 'file:') { return Promise.reject(localError('文档提取需要通过应用的 HTTP 地址访问，不支持 file://。')) }
  if (!file.size || file.size > DOCUMENT_LIMITS.maxBytes) { return Promise.reject(localError('文档不能为空且不能超过 10 MiB。')) }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./documentExtraction.worker.ts', import.meta.url), { type: 'module' })
    let settled = false
    const finish = (error?: unknown, result?: ExtractedDocument) => {
      if (settled) { return }
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      worker.terminate()
      if (error !== undefined) { reject(error) } else if (result) { resolve(result) }
    }
    const abort = () => finish(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(() => finish(localError('文档提取超过 15 秒，已停止。请缩小文档后重试。')), DOCUMENT_LIMITS.timeoutMs)
    signal?.addEventListener('abort', abort, { once: true })
    worker.onerror = () => finish(localError('文档提取失败，文件可能损坏或格式不受支持。'))
    worker.onmessageerror = () => finish(localError('文档提取返回无效数据。'))
    worker.onmessage = ({ data }: MessageEvent<{ type?: unknown; text?: unknown; format?: unknown; error?: unknown }>) => {
      // PDF.js may announce its transport readiness; only our result envelope is authoritative.
      if (data?.type !== 'document-result') { return }
      if (typeof data?.error === 'string') { finish(localError(data.error)); return }
      if (typeof data?.text !== 'string' || !data.text.trim() || data.text.length > DOCUMENT_LIMITS.maxChars || new TextEncoder().encode(data.text).length > DOCUMENT_LIMITS.maxTextBytes || typeof data.format !== 'string') { finish(localError('文档提取结果为空或超出上限。')); return }
      finish(undefined, { name: file.name, originalSize: file.size, format: data.format, text: data.text })
    }
    try { worker.postMessage({ file, basePath: runtimeBasePath() }) } catch (error) { finish(error) }
    if (signal?.aborted) { abort() }
  })
}
