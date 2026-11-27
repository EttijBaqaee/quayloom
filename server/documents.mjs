// SPDX-License-Identifier: AGPL-3.0-only
import { randomBytes } from 'node:crypto'
import { fail } from './validation.mjs'

export const DOCUMENT_LIMITS = Object.freeze({ maxOriginalBytes: 10 * 1024 * 1024, maxChars: 200000, maxTextBytes: 1024 * 1024, maxResolveBytes: 2 * 1024 * 1024, maxResolveCount: 100, maxCount: 256, maxOwnerBytes: 64 * 1024 * 1024 })
export const DOCUMENT_FORMATS = Object.freeze(['txt', 'md', 'csv', 'json', 'code', 'pdf', 'docx', 'pptx', 'xlsx'])
const validId = value => typeof value === 'string' && /^qldoc_[a-f0-9]{48}$/.test(value)
const validScope = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\x00-\x20\x7f]/.test(value)
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const scope = (owner, providerId) => {
  if (!validScope(owner)) fail(401, '请先登录')
  if (!validScope(providerId)) fail(400, '无效的供应商')
}
// The identifier is included so the client can re-upload precisely the missing local attachment.
const missing = id => fail(404, `Local document missing: ${validId(id) ? id : 'invalid qldoc identifier'}; 请重新上传文档`)
const checkText = text => {
  if (typeof text !== 'string' || !text.trim() || text.includes('\0') || !text.isWellFormed()) fail(400, '文档提取文本为空或无效；扫描 PDF 需先进行 OCR')
  const bytes = Buffer.byteLength(text, 'utf8')
  if (text.length > DOCUMENT_LIMITS.maxChars || bytes > DOCUMENT_LIMITS.maxTextBytes) fail(413, '文档提取文本不能超过 200000 字符或 1 MiB')
  return bytes
}
const checkName = name => {
  if (typeof name !== 'string' || !name.trim() || name.length > 255 || !name.isWellFormed() || /[\x00-\x1f\x7f/\\]/.test(name)) fail(400, '无效的文档文件名')
  return name.trim()
}
const project = row => ({ id: row.id, filename: row.filename, mime_type: 'text/plain', size_bytes: row.original_size, created_at: row.created_at, type: 'file', provider_id: row.provider_id, format: row.format, text_bytes: row.text_bytes, text_chars: row.text_chars })

/** Client-extracted text is untrusted user input, NOT original-file authenticity or native file upload.
 * Uses only the owning store's existing SQLite connection; authorization belongs to the HTTP caller. */
export function createDocuments({ store }) {
  const db = store.db
  db.exec(`CREATE TABLE IF NOT EXISTS studio_documents (
    id TEXT PRIMARY KEY, owner TEXT NOT NULL, provider_id TEXT NOT NULL, filename TEXT NOT NULL,
    original_size INTEGER NOT NULL CHECK(original_size > 0 AND original_size <= 10485760),
    format TEXT NOT NULL CHECK(format IN ('txt','md','csv','json','code','pdf','docx','pptx','xlsx')),
    text_chars INTEGER NOT NULL CHECK(text_chars > 0 AND text_chars <= 200000),
    text_bytes INTEGER NOT NULL CHECK(text_bytes > 0 AND text_bytes <= 1048576),
    created_at TEXT NOT NULL, text TEXT NOT NULL CHECK(length(CAST(text AS BLOB))=text_bytes));
    CREATE INDEX IF NOT EXISTS studio_documents_owner ON studio_documents(owner,provider_id);`)
  const find = (owner, providerId, id, withText = false) => {
    scope(owner, providerId)
    if (!validId(id)) missing(id)
    const row = db.prepare(`SELECT id,provider_id,filename,original_size,format,text_chars,text_bytes,created_at${withText ? ',text' : ''} FROM studio_documents WHERE owner=? AND provider_id=? AND id=?`).get(owner, providerId, id)
    if (!row) missing(id)
    return row
  }
  return {
    upload(owner, provider, model, input) {
      scope(owner, provider?.id)
      if (provider?.type !== 'openai' || model?.capabilities?.files !== true) fail(400, '所选模型不支持 OpenAI 文档文本提取')
      if (!object(input)) fail(400, '无效的文档')
      const filename = checkName(input.name)
      if (!Number.isSafeInteger(input.originalSize) || input.originalSize <= 0) fail(400, '无效的文档原始大小')
      if (input.originalSize > DOCUMENT_LIMITS.maxOriginalBytes) fail(413, '原始文档不能超过 10 MiB')
      if (!DOCUMENT_FORMATS.includes(input.format)) fail(400, '不支持的文档格式')
      const textBytes = checkText(input.text)
      db.exec('SAVEPOINT studio_document_upload')
      try {
        const usage = db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(text_bytes),0) AS bytes FROM studio_documents WHERE owner=?').get(owner)
        if (usage.count >= DOCUMENT_LIMITS.maxCount || usage.bytes + textBytes > DOCUMENT_LIMITS.maxOwnerBytes) fail(413, '文档存储已达上限，请先删除不再使用的文档')
        const row = { id: `qldoc_${randomBytes(24).toString('hex')}`, provider_id: provider.id, filename, original_size: input.originalSize, format: input.format, text_chars: input.text.length, text_bytes: textBytes, created_at: new Date().toISOString() }
        db.prepare('INSERT INTO studio_documents(id,owner,provider_id,filename,original_size,format,text_chars,text_bytes,created_at,text) VALUES(?,?,?,?,?,?,?,?,?,?)').run(row.id, owner, provider.id, filename, row.original_size, row.format, row.text_chars, row.text_bytes, row.created_at, input.text)
        db.exec('RELEASE studio_document_upload')
        return project(row)
      } catch (error) {
        db.exec('ROLLBACK TO studio_document_upload; RELEASE studio_document_upload')
        throw error
      }
    },
    metadata(owner, providerId, id) { return project(find(owner, providerId, id)) },
    delete(owner, providerId, id) {
      find(owner, providerId, id)
      db.prepare('DELETE FROM studio_documents WHERE owner=? AND provider_id=? AND id=?').run(owner, providerId, id)
      return { id, type: 'file', deleted: true }
    },
    resolve(owner, provider, body) {
      scope(owner, provider?.id)
      if (!object(body) || !Array.isArray(body.messages)) fail(400, '无效的消息请求')
      let clone
      try { clone = structuredClone(body) } catch { fail(400, '无效的消息请求') }
      let bytes = 0, count = 0
      const resolveContent = (content, message, isUser) => {
        if (!Array.isArray(content)) return content
        return content.map(block => {
          if (!object(block) || !object(block.source)) return block
          const id = block.source.file_id
          if (typeof id !== 'string' || !id.startsWith('qldoc_')) return block
          if (!isUser || block.type !== 'document' || block.source.type !== 'file') fail(400, '本地文档只能作为 user 消息的 document 文件引用')
          if (provider.type !== 'openai') fail(400, '本地文档文本仅支持 OpenAI 协议')
          const model = provider.models?.find(item => item.id === clone.model)
          if (model?.capabilities?.files !== true) fail(400, '所选模型不支持文档文本')
          for (const origin of [message.provider_id, message.providerId, block.source.provider_id, block.source.providerId]) if (origin !== undefined && origin !== provider.id) missing(id)
          if (++count > DOCUMENT_LIMITS.maxResolveCount) fail(413, '单次请求的文档数量过多')
          const row = find(owner, provider.id, id, true)
          if (checkText(row.text) !== row.text_bytes || row.text.length !== row.text_chars) fail(400, '已存储文档文本无效，请重新上传')
          // Random data delimiters prevent user text from forging this particular boundary.
          // This remains a normal user text block, never system/developer instructions.
          const fence = randomBytes(12).toString('hex')
          const text = `[BEGIN CLIENT-EXTRACTED DOCUMENT ${fence}]\nFilename (JSON): ${JSON.stringify(row.filename)}\nUntrusted user-supplied extracted text; not a verified original file.\n[BEGIN DATA ${fence}]\n${row.text}\n[END DATA ${fence}]\n[END CLIENT-EXTRACTED DOCUMENT ${fence}]`
          bytes += Buffer.byteLength(text, 'utf8')
          if (bytes > DOCUMENT_LIMITS.maxResolveBytes) fail(413, '单次请求展开后的文档文本不能超过 2 MiB')
          return { type: 'text', text }
        })
      }
      for (const message of clone.messages) if (object(message)) message.content = resolveContent(message.content, message, message.role === 'user')
      clone.system = clone.system === undefined ? undefined : resolveContent(clone.system, {}, false)
      if (body.system === undefined) delete clone.system
      return clone
    },
  }
}
