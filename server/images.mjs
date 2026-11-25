// SPDX-License-Identifier: AGPL-3.0-only
import { randomBytes } from 'node:crypto'
import { fail } from './validation.mjs'

export const IMAGE_LIMITS = Object.freeze({ maxBytes: 3 * 1024 * 1024, maxCount: 256, maxOwnerBytes: 128 * 1024 * 1024 })
const validId = value => typeof value === 'string' && /^qlimg_[a-f0-9]{48}$/.test(value)
const validScope = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\x00-\x20\x7f]/.test(value)
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Signature/format-header sniffing only: no SVG, URL fetch, decompression or new dependencies. */
export function sniffImageMime(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.length) return null
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (b.length >= 33 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && b.readUInt32BE(8) === 13 && b.toString('latin1', 12, 16) === 'IHDR' && b.readUInt32BE(16) > 0 && b.readUInt32BE(20) > 0) return 'image/png'
  if (b.length >= 14 && ['GIF87a', 'GIF89a'].includes(b.toString('latin1', 0, 6)) && b.readUInt16LE(6) > 0 && b.readUInt16LE(8) > 0 && b.at(-1) === 0x3b) return 'image/gif'
  if (b.length >= 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff && b.at(-2) === 0xff && b.at(-1) === 0xd9) return 'image/jpeg'
  if (b.length >= 25 && b.toString('latin1', 0, 4) === 'RIFF' && b.readUInt32LE(4) === b.length - 8 && b.toString('latin1', 8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(b.toString('latin1', 12, 16)) && b.readUInt32LE(16) > 0 && b.readUInt32LE(16) <= b.length - 20) return 'image/webp'
  return null
}
const checkBytes = (bytes, mediaType) => {
  if (!(bytes instanceof Uint8Array) || !bytes.length) fail(400, '图片不能为空')
  if (bytes.byteLength > IMAGE_LIMITS.maxBytes) fail(413, '单张图片不能超过 3 MiB')
  const mime = sniffImageMime(bytes)
  if (!mime || typeof mediaType !== 'string' || mediaType !== mime) fail(400, '仅支持内容与类型一致的 PNG、JPEG、GIF 或 WebP 图片')
  return mime
}
const scope = (owner, providerId) => {
  if (!validScope(owner)) fail(401, '请先登录')
  if (!validScope(providerId)) fail(400, '无效的供应商')
}
const missing = () => fail(404, '图片不存在')
const project = row => ({ id: row.id, filename: row.filename, mime_type: row.mime_type, size_bytes: row.size_bytes, created_at: row.created_at, type: 'file', provider_id: row.provider_id })

/** Persistent BLOBs on the owning store's existing SQLite connection. Authorization is the caller's responsibility. */
export function createImages({ store }) {
  const db = store.db
  db.exec(`CREATE TABLE IF NOT EXISTS studio_images (
    id TEXT PRIMARY KEY, owner TEXT NOT NULL, provider_id TEXT NOT NULL,
    filename TEXT NOT NULL, mime_type TEXT NOT NULL CHECK(mime_type IN ('image/png','image/jpeg','image/gif','image/webp')),
    size_bytes INTEGER NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 3145728),
    created_at TEXT NOT NULL, bytes BLOB NOT NULL CHECK(length(bytes)=size_bytes));
    CREATE INDEX IF NOT EXISTS studio_images_owner ON studio_images(owner,provider_id);`)
  const find = (owner, providerId, id, withBytes = false) => {
    scope(owner, providerId)
    if (!validId(id)) missing()
    const columns = `id,provider_id,filename,mime_type,size_bytes,created_at${withBytes ? ',bytes' : ''}`
    const row = db.prepare(`SELECT ${columns} FROM studio_images WHERE owner=? AND provider_id=? AND id=?`).get(owner, providerId, id)
    if (!row) missing()
    return row
  }
  return {
    upload(owner, provider, model, input) {
      scope(owner, provider?.id)
      if (provider?.type !== 'openai' || model?.capabilities?.vision !== true) fail(400, '所选模型不支持 OpenAI 图片')
      if (!object(input)) fail(400, '无效的图片')
      const { bytes, mediaType, name } = input
      const mime = checkBytes(bytes, mediaType)
      // Names are metadata only, never filesystem paths or header values.
      if (typeof name !== 'string' || !name.trim() || name.length > 255 || /[\x00-\x1f\x7f/\\]/.test(name)) fail(400, '无效的图片文件名')
      db.exec('SAVEPOINT studio_image_upload')
      try {
        const usage = db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(size_bytes),0) AS bytes FROM studio_images WHERE owner=?').get(owner)
        if (usage.count >= IMAGE_LIMITS.maxCount || usage.bytes + bytes.byteLength > IMAGE_LIMITS.maxOwnerBytes) fail(413, '图片存储已达上限，请先删除不再使用的图片')
        const row = { id: `qlimg_${randomBytes(24).toString('hex')}`, provider_id: provider.id, filename: name.trim(), mime_type: mime, size_bytes: bytes.byteLength, created_at: new Date().toISOString() }
        db.prepare('INSERT INTO studio_images(id,owner,provider_id,filename,mime_type,size_bytes,created_at,bytes) VALUES(?,?,?,?,?,?,?,?)').run(row.id, owner, provider.id, row.filename, mime, row.size_bytes, row.created_at, Buffer.from(bytes))
        db.exec('RELEASE studio_image_upload')
        return project(row)
      } catch (error) {
        db.exec('ROLLBACK TO studio_image_upload; RELEASE studio_image_upload')
        throw error
      }
    },
    metadata(owner, providerId, id) { return project(find(owner, providerId, id)) },
    delete(owner, providerId, id) {
      find(owner, providerId, id)
      db.prepare('DELETE FROM studio_images WHERE owner=? AND provider_id=? AND id=?').run(owner, providerId, id)
      return { id, type: 'file', deleted: true }
    },
    resolve(owner, provider, body) {
      scope(owner, provider?.id)
      if (!object(body) || !Array.isArray(body.messages)) fail(400, '无效的消息请求')
      let clone
      try { clone = structuredClone(body) } catch { fail(400, '无效的消息请求') }
      for (const message of clone.messages) {
        if (!Array.isArray(message?.content)) continue
        for (const block of message.content) {
          if (!object(block) || !object(block.source)) continue
          const id = block.source.file_id
          if (typeof id !== 'string' || !id.startsWith('qlimg_')) continue
          if (block.type !== 'image' || block.source.type !== 'file') fail(400, '本地图片只能作为 image 文件引用')
          if (provider.type !== 'openai') fail(400, '本地图片仅支持 OpenAI 协议')
          const model = provider.models?.find(item => item.id === clone.model)
          if (model?.capabilities?.vision !== true) fail(400, '所选模型不支持图片')
          for (const origin of [message.provider_id, block.source.provider_id, block.source.providerId]) if (origin !== undefined && origin !== provider.id) missing()
          const row = find(owner, provider.id, id, true)
          checkBytes(row.bytes, row.mime_type)
          block.source = { type: 'base64', media_type: row.mime_type, data: Buffer.from(row.bytes).toString('base64') }
        }
      }
      return clone
    },
  }
}
