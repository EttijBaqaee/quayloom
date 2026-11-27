import { Inflate } from 'fflate'
import { SaxesParser, type SaxesTagNS } from 'saxes'
import type { PDFPageProxy } from 'pdfjs-dist'
type TextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>

const MAX_BYTES = 10 * 1024 * 1024
const MAX_CHARS = 200_000
const MAX_TEXT_BYTES = 1024 * 1024
const MAX_XML = 4 * 1024 * 1024
const OFFICE = 'http://schemas.openxmlformats.org/'
const W = `${OFFICE}wordprocessingml/2006/main`
const A = `${OFFICE}drawingml/2006/main`
const S = `${OFFICE}spreadsheetml/2006/main`
const P = `${OFFICE}presentationml/2006/main`
const R = `${OFFICE}officeDocument/2006/relationships`
const PKG_R = 'http://schemas.openxmlformats.org/package/2006/relationships'
declare const __DOCUMENT_PDF_CMAPS__: readonly string[]
declare const __DOCUMENT_PDF_FONTS__: readonly string[]
const strictDecode = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(bytes)
const fail = (message: string): never => { throw new Error(message) }
const checkText = (text: string) => {
  if (text.length > MAX_CHARS || new TextEncoder().encode(text).length > MAX_TEXT_BYTES) { fail('文档提取文字超过 200000 字符或 1 MiB，未截断上传。') }
  return text
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let value = n
  for (let bit = 0; bit < 8; bit++) { value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1 }
  return value >>> 0
})
const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff
  for (const byte of bytes) { crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 255] }
  return (crc ^ 0xffffffff) >>> 0
}
type ZipEntry = { name: string; method: number; local: number; data: number; compressed: number; original: number; crc: number; end: number }
/** Fully validate one directory before ANY decompression. No second ZIP parser or ZIP64. */
function zipPreflight(bytes: Uint8Array): ZipEntry[] {
  if (bytes.length < 22) { fail('Office ZIP 文件损坏。') }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const invalid = () => fail('Office ZIP 条目损坏。')
  let eocd = -1, candidates = 0
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) {
    if (view.getUint32(p, true) !== 0x06054b50) { continue }
    candidates++
    if (p + 22 + view.getUint16(p + 20, true) === bytes.length) { eocd = p }
  }
  // Reject EOCD ambiguity (including signatures hidden in comments), not just the last signature.
  if (eocd < 0 || candidates !== 1 || view.getUint16(eocd + 4, true) || view.getUint16(eocd + 6, true)) { fail('不支持分卷或损坏的 Office ZIP。') }
  if (eocd >= 20 && view.getUint32(eocd - 20, true) === 0x07064b50) { invalid() }
  const count = view.getUint16(eocd + 10, true)
  const size = view.getUint32(eocd + 12, true), start = view.getUint32(eocd + 16, true)
  if (!count || count > 2000 || count !== view.getUint16(eocd + 8, true) || start === 0xffffffff || size === 0xffffffff || start + size !== eocd) { fail('Office ZIP 条目数量或结构超出限制。') }
  const extraFields = (offset: number, length: number) => {
    const end = offset + length
    while (offset < end) {
      if (offset + 4 > end) { invalid() }
      const id = view.getUint16(offset, true), size = view.getUint16(offset + 2, true)
      if (id === 1 || offset + 4 + size > end) { invalid() }
      offset += 4 + size
    }
  }
  let pos = start, total = 0
  const names = new Set<string>(), entries: ZipEntry[] = []
  for (let i = 0; i < count; i++) {
    if (pos + 46 > eocd || view.getUint32(pos, true) !== 0x02014b50) { fail('Office ZIP 中央目录无效。') }
    const flags = view.getUint16(pos + 8, true), method = view.getUint16(pos + 10, true), crc = view.getUint32(pos + 16, true)
    const compressed = view.getUint32(pos + 20, true), original = view.getUint32(pos + 24, true)
    const nameLength = view.getUint16(pos + 28, true), extra = view.getUint16(pos + 30, true), comment = view.getUint16(pos + 32, true)
    const local = view.getUint32(pos + 42, true)
    if (pos + 46 + nameLength + extra + comment > eocd || view.getUint16(pos + 34, true) || local === 0xffffffff || compressed === 0xffffffff || original === 0xffffffff || local + 30 > start || view.getUint32(local, true) !== 0x04034b50) { invalid() }
    const localNameLength = view.getUint16(local + 26, true), localExtra = view.getUint16(local + 28, true)
    const data = local + 30 + localNameLength + localExtra
    if (data + compressed > start) { invalid() }
    extraFields(pos + 46 + nameLength, extra); extraFields(local + 30 + localNameLength, localExtra)
    const name = strictDecode(bytes.subarray(pos + 46, pos + 46 + nameLength))
    const localName = strictDecode(bytes.subarray(local + 30, local + 30 + localNameLength))
    const localCompressed = view.getUint32(local + 18, true), localOriginal = view.getUint32(local + 22, true), localCrc = view.getUint32(local + 14, true)
    if (name !== localName || view.getUint16(local + 6, true) !== flags || view.getUint16(local + 8, true) !== method || localCompressed === 0xffffffff || localOriginal === 0xffffffff || (flags & 8 ? ![0, compressed].includes(localCompressed) || ![0, original].includes(localOriginal) || ![0, crc].includes(localCrc) : localCompressed !== compressed || localOriginal !== original || localCrc !== crc)) { fail('Office ZIP 本地目录与中央目录不符。') }
    if (flags & (1 | 64 | 8192) || ![0, 8].includes(method) || original > MAX_XML || original > Math.max(1, compressed) * 100 || names.has(name) || name.includes('\\') || name.startsWith('/') || name.split('/').some(p => p === '..') || /(?:vbaProject|embeddings\/|externalLinks\/)/i.test(name)) { fail('Office ZIP 含加密、嵌入、重复或过度压缩内容。') }
    if (method === 0 && compressed !== original) { invalid() }
    let end = data + compressed
    if (flags & 8) {
      if (end + 12 > start) { invalid() }
      const descriptor = view.getUint32(end, true) === 0x08074b50 ? end + 4 : end
      if (descriptor + 12 > start || view.getUint32(descriptor, true) !== crc || view.getUint32(descriptor + 4, true) !== compressed || view.getUint32(descriptor + 8, true) !== original) { invalid() }
      end = descriptor + 12
    }
    total += original
    if (total > 20 * 1024 * 1024) { fail('Office ZIP 解压总量不能超过 20 MiB。') }
    names.add(name); entries.push({ name, method, local, data, compressed, original, crc, end })
    pos += 46 + nameLength + extra + comment
  }
  if (pos !== eocd) { fail('Office ZIP 中央目录长度无效。') }
  const intervals = [...entries].sort((a, b) => a.local - b.local)
  for (let i = 1; i < intervals.length; i++) { if (intervals[i].local < intervals[i - 1].end) { invalid() } }
  return entries
}
function officeFiles(bytes: Uint8Array) {
  const entries = zipPreflight(bytes), files: Record<string, Uint8Array> = Object.create(null)
  let total = 0
  for (const entry of entries) {
    if (!/^(?:word\/document\.xml|ppt\/(?:presentation\.xml|_rels\/presentation\.xml\.rels|slides\/[A-Za-z0-9_-]+\.xml)|xl\/(?:sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels|worksheets\/sheet\d+\.xml))$/.test(entry.name)) { continue }
    if (entry.method === 0) {
      const output = bytes.subarray(entry.data, entry.data + entry.original)
      if (crc32(output) !== entry.crc) { fail('Office ZIP 负载 CRC 校验失败。') }
      total += entry.original; files[entry.name] = output.slice(); continue
    }
    const output = new Uint8Array(entry.original)
    let written = 0, finished = false
    const inflater = new Inflate((chunk, final) => {
      // Inflate has no fixed-size output option: every real byte is accounted BEFORE copying.
      written += chunk.length; total += chunk.length
      if (written > entry.original || written > MAX_XML || total > 20 * 1024 * 1024) { fail('Office ZIP 条目损坏。') }
      output.set(chunk, written - chunk.length); finished = final
    })
    // Small compressed pushes bound transient Inflate output (~264 KiB plus its 32 KiB history).
    for (let offset = 0; offset < entry.compressed; offset += 256) {
      const next = Math.min(offset + 256, entry.compressed)
      inflater.push(bytes.subarray(entry.data + offset, entry.data + next), next === entry.compressed)
    }
    if (!finished || written !== entry.original) { fail('Office ZIP 条目损坏。') }
    if (crc32(output) !== entry.crc) { fail('Office ZIP 负载 CRC 校验失败。') }
    files[entry.name] = output
  }
  return files
}

type XmlHooks = { open?: (tag: SaxesTagNS) => void; text?: (text: string, tags: SaxesTagNS[]) => void; close?: (tag: SaxesTagNS) => void }
function xml(bytes: Uint8Array | undefined, hooks: XmlHooks) {
  if (!bytes || bytes.length > MAX_XML) { throw new Error('Office XML 缺失或过大。') }
  const input = strictDecode(bytes)
  const parser = new SaxesParser({ xmlns: true })
  const tags: SaxesTagNS[] = []
  parser.on('doctype', () => fail('Office XML 不允许 DTD 或外部实体。'))
  parser.on('processinginstruction', tag => { if (tag.target.toLowerCase() !== 'xml') { fail('Office XML 不允许处理指令。') } })
  parser.on('opentag', tag => {
    if (tags.length >= 128 || Object.keys(tag.attributes).length > 64) { fail('Office XML 嵌套或属性过多。') }
    tags.push(tag); hooks.open?.(tag)
  })
  parser.on('text', text => hooks.text?.(text, tags))
  parser.on('cdata', text => hooks.text?.(text, tags))
  parser.on('closetag', tag => { hooks.close?.(tag); tags.pop() })
  parser.on('error', () => fail('Office XML 格式无效。'))
  parser.write(input).close()
}
const attribute = (tag: SaxesTagNS, name: string) => Object.values(tag.attributes).find(a => a.local === name)?.value ?? ''
const plainParagraphs = (bytes: Uint8Array | undefined, namespace: string) => {
  let text = ''
  const add = (value: string) => { text = checkText(text + value) }
  xml(bytes, {
    text(value, tags) { if (tags.at(-1)?.uri === namespace && tags.at(-1)?.local === 't') { add(value) } },
    open(tag) { if (tag.uri === namespace && tag.local === 'tab') { add('\t') } if (tag.uri === namespace && ['br', 'cr'].includes(tag.local)) { add('\n') } },
    close(tag) { if (tag.uri === namespace && ['p', 'tr'].includes(tag.local)) { add('\n') } if (tag.uri === namespace && tag.local === 'tc') { add('\t') } },
  })
  return text
}

function officeText(bytes: Uint8Array, ext: string) {
  const files = officeFiles(bytes)
  if (ext === 'docx') { return plainParagraphs(files['word/document.xml'], W) }
  if (ext === 'pptx') {
    const relations = new Map<string, string>(), relationIds = new Set<string>(), relationTargets = new Set<string>()
    xml(files['ppt/_rels/presentation.xml.rels'], { open(tag) {
      if (tag.uri !== PKG_R || tag.local !== 'Relationship') { return }
      const id = attribute(tag, 'Id'), target = attribute(tag, 'Target'), type = attribute(tag, 'Type')
      if (!id || relationIds.has(id) || (attribute(tag, 'TargetMode') && attribute(tag, 'TargetMode') !== 'Internal')) { fail('PPTX 幻灯片关系无效、重复或包含外链。') }
      relationIds.add(id)
      if (type !== `${R}/slide`) { return }
      const path = target.startsWith('/') ? target.slice(1) : `ppt/${target}`
      if (!/^ppt\/slides\/[A-Za-z0-9_-]+\.xml$/.test(path) || !files[path]) { fail('PPTX 幻灯片关系路径不安全或目标缺失。') }
      if (relationTargets.has(path)) { fail('PPTX 幻灯片关系无效、重复或包含外链。') }
      relationTargets.add(path); relations.set(id, path)
    } })
    const slides: string[] = [], usedIds = new Set<string>(), usedPaths = new Set<string>()
    let depth = 0, listDepth = 0, seenList = false
    const slideNumbers = new Set<string>()
    xml(files['ppt/presentation.xml'], { open(tag) {
      depth++
      if (tag.uri !== P) { return }
      if (tag.local === 'sldIdLst') {
        if (seenList || depth !== 2) { fail('PPTX 幻灯片关系无效、重复或包含外链。') }
        seenList = true; listDepth = depth
      }
      if (tag.local !== 'sldId') { return }
      const id = Object.values(tag.attributes).find(a => a.uri === R && a.local === 'id')?.value ?? ''
      const number = Object.values(tag.attributes).find(a => !a.uri && a.local === 'id')?.value ?? ''
      const path = relations.get(id)
      if (!path || !listDepth || depth !== listDepth + 1 || !/^\d+$/.test(number) || Number(number) < 256 || Number(number) > 2147483647 || slideNumbers.has(String(Number(number))) || usedIds.has(id) || usedPaths.has(path) || slides.length >= 200) { throw new Error('PPTX 幻灯片关系无效、重复或包含外链。') }
      slideNumbers.add(String(Number(number))); usedIds.add(id); usedPaths.add(path); slides.push(path)
    }, close(tag) { if (tag.uri === P && tag.local === 'sldIdLst') { listDepth = 0 } depth-- } })
    if (!slides.length || slides.length > 200) { fail('PPTX 幻灯片数量无效或超过 200 页。') }
    let result = '', contentChars = 0
    for (let i = 0; i < slides.length; i++) {
      const content = plainParagraphs(files[slides[i]], A)
      contentChars += content.trim().length
      result = checkText(`${result}\n[Slide ${i + 1}]\n${content}`)
    }
    if (!contentChars) { fail('PPTX 没有可提取文字。') }
    return result
  }
  const shared: string[] = []
  let current = '', sharedChars = 0
  if (files['xl/sharedStrings.xml']) {
    xml(files['xl/sharedStrings.xml'], {
      open(tag) { if (tag.uri === S && tag.local === 'si') { current = '' } },
      text(value, tags) { if (tags.at(-1)?.uri === S && tags.at(-1)?.local === 't') { current = checkText(current + value) } },
      close(tag) { if (tag.uri === S && tag.local === 'si') { shared.push(current); sharedChars += current.length; if (shared.length > 100000 || sharedChars > MAX_CHARS) { fail('XLSX 共享字符串过多。') } } },
    })
  }
  const relations = new Map<string, string>()
  xml(files['xl/_rels/workbook.xml.rels'], { open(tag) {
    if (tag.local !== 'Relationship') { return }
    const target = attribute(tag, 'Target')
    if (attribute(tag, 'TargetMode') === 'External') { fail('XLSX 不允许外部工作表。') }
    if (/^\/?(?:xl\/)?worksheets\/sheet\d+\.xml$/.test(target)) { relations.set(attribute(tag, 'Id'), target.startsWith('/xl/') ? target.slice(1) : target.startsWith('xl/') ? target : `xl/${target}`) }
  } })
  const sheets: { name: string; path: string }[] = []
  xml(files['xl/workbook.xml'], { open(tag) {
    if (tag.uri !== S || tag.local !== 'sheet') { return }
    const path = relations.get(attribute(tag, 'id'))
    if (!path || sheets.length >= 200) { throw new Error('XLSX 工作表路径无效或数量超过限制。') }
    sheets.push({ name: attribute(tag, 'name'), path })
  } })
  if (!sheets.length) { fail('XLSX 没有工作表。') }
  let result = '', contentChars = 0
  for (const sheet of sheets) {
    result = checkText(`${result}\n[Sheet: ${sheet.name}]\n`)
    let cellType = '', cellValue = '', cellRef = '', rows = 0, cells = 0
    xml(files[sheet.path], {
      open(tag) { if (tag.uri !== S) { return } if (tag.local === 'c') { cellType = attribute(tag, 't'); cellValue = ''; cellRef = attribute(tag, 'r'); if (++cells > 100000) { fail('XLSX 单元格过多。') } } },
      text(value, tags) { const tag = tags.at(-1); if (tag?.uri === S && (tag.local === 'v' || tag.local === 't')) { cellValue = checkText(cellValue + value) } },
      close(tag) {
        if (tag.uri !== S) { return }
        if (tag.local === 'c') {
          let value = cellValue
          if (cellType === 's') { if (!/^\d+$/.test(value) || !Object.hasOwn(shared, Number(value))) { fail('XLSX 共享字符串引用无效。') } value = shared[Number(value)] }
          contentChars += value.trim().length
          result = checkText(`${result}${cellRef ? `${cellRef}: ` : ''}${value}\t`)
        }
        if (tag.local === 'row') { if (++rows > 100000) { fail('XLSX 行数过多。') } result = checkText(`${result}\n`) }
      },
    })
  }
  if (!contentChars) { fail('XLSX 没有可提取文字。') }
  return result
}

type PdfTextState = { parts: string[]; chars: number; textBytes: number; contentChars: number; items: number }
export const createPdfTextState = (): PdfTextState => ({ parts: [], chars: 0, textBytes: 0, contentChars: 0, items: 0 })
const appendPdfText = (state: PdfTextState, text: string) => {
  if (text.length > MAX_CHARS - state.chars) { fail('文档提取文字超过 200000 字符或 1 MiB，未截断上传。') }
  const size = new TextEncoder().encode(text).length
  if (size > MAX_TEXT_BYTES - state.textBytes) { fail('文档提取文字超过 200000 字符或 1 MiB，未截断上传。') }
  state.chars += text.length; state.textBytes += size; state.parts.push(text)
}
// Stream instead of retaining getTextContent's whole-page items/styles array.
// This bounds our retained text, NOT PDF.js's internal inflate/font/xref or one chunk's allocation.
export async function readPdfTextPage(pdfPage: Pick<PDFPageProxy, 'getJSActions' | 'streamTextContent' | 'cleanup'>, page: number, state: PdfTextState) {
  let reader: ReadableStreamDefaultReader<TextContent> | undefined, complete = false
  try {
    const actions = await pdfPage.getJSActions()
    if (actions && Object.keys(actions).length) { fail('PDF 含 JavaScript 动作，不支持提取。') }
    reader = pdfPage.streamTextContent({ disableNormalization: false }).getReader()
    appendPdfText(state, `\n[Page ${page}]\n`)
    while (true) {
      const { value, done } = await reader.read()
      if (done) { complete = true; break }
      for (const item of value.items) {
        if (++state.items > 100_000) { fail('PDF 文字条目超过 100000，未截断上传。') }
        if ('str' in item) {
          appendPdfText(state, item.str)
          appendPdfText(state, item.hasEOL ? '\n' : ' ')
          state.contentChars += item.str.trim().length
        }
      }
    }
  } finally {
    try { if (reader && !complete) { await reader.cancel().catch(() => {}) } }
    finally { try { reader?.releaseLock() } finally { pdfPage.cleanup() } }
  }
}

/** The page supplies its trusted runtime mount for this job; workers never inspect document. */
export const pdfResourceUrl = (basePath: unknown, kind: 'cmaps' | 'standard_fonts', filename: string, origin: string): URL => {
  if (typeof basePath !== 'string' || basePath !== '' && /^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.exec(basePath)?.[0] !== basePath) { throw new Error('Invalid PDF resource base path') }
  return new URL(`${basePath}/static/pdfjs/${kind}/${filename}`, origin)
}

async function pdfText(bytes: Uint8Array, basePath?: string) {
  if (strictDecode(bytes.subarray(0, 5)) !== '%PDF-') { fail('PDF 文件签名无效。') }
  // Register PDF.js's in-process transport inside OUR disposable worker. No nested worker or CDN survives terminate().
  // @ts-expect-error PDF.js ships no type declaration for the worker transport module.
  const implementation = await import('pdfjs-dist/build/pdf.worker.mjs')
  ;(globalThis as typeof globalThis & { pdfjsWorker?: unknown }).pdfjsWorker = implementation
  const { getDocument } = await import('pdfjs-dist')
  let resourceError = false
  // Only build-shipped filenames, never PDF URLs. This fetch stays in our terminable worker.
  const localResource = async (kind: 'cmaps' | 'standard_fonts', filename: string) => {
    try {
      const allowed = kind === 'cmaps' ? __DOCUMENT_PDF_CMAPS__ : __DOCUMENT_PDF_FONTS__
      if (!allowed.includes(filename) || !/^[A-Za-z0-9_-]+\.(?:bcmap|pfb|ttf)$/.test(filename) || !['http:', 'https:'].includes(globalThis.location.protocol)) { throw new Error('resource') }
      const url = pdfResourceUrl(basePath, kind, filename, globalThis.location.origin)
      if (url.origin !== globalThis.location.origin) { throw new Error('origin') }
      const response = await fetch(url.href, { credentials: 'same-origin', redirect: 'error', referrerPolicy: 'no-referrer' })
      if (!response.ok || Number(response.headers.get('content-length')) > MAX_XML) { throw new Error('resource') }
      const data = new Uint8Array(await response.arrayBuffer())
      if (!data.length || data.length > MAX_XML) { throw new Error('resource') }
      return data
    } catch { resourceError = true; throw new Error('PDF 本地字体或 CMap 资源不可用。请通过应用的 HTTP 地址重试。') }
  }
  class LocalCMapFactory {
    async fetch({ name }: { name: string }) { return { cMapData: await localResource('cmaps', `${name}.bcmap`), isCompressed: true } }
  }
  class LocalFontFactory {
    async fetch({ filename }: { filename: string }) { return localResource('standard_fonts', filename) }
  }
  const task = getDocument({ data: bytes, isEvalSupported: false, useWorkerFetch: false, useSystemFonts: false, disableFontFace: true, disableAutoFetch: true, disableStream: true, stopAtErrors: true, useWasm: false, CMapReaderFactory: LocalCMapFactory, StandardFontDataFactory: LocalFontFactory, cMapPacked: true })
  try {
    const doc = await task.promise
    if (!doc.numPages || doc.numPages > 200) { fail('PDF 页数必须在 1–200 页之间。') }
    const actions = await doc.getJSActions()
    if (actions && Object.keys(actions).length) { fail('PDF 含 JavaScript 动作，不支持提取。') }
    const state = createPdfTextState()
    for (let page = 1; page <= doc.numPages; page++) {
      await readPdfTextPage(await doc.getPage(page), page, state)
      if (resourceError) { fail('PDF 本地字体或 CMap 资源不可用。请通过应用的 HTTP 地址重试。') }
    }
    if (!state.contentChars) { fail('PDF 没有可提取文字；扫描件需要 OCR，当前不支持。') }
    return checkText(state.parts.join(''))
  } finally { await task.destroy() }
}

const TEXT_EXTS = new Set(['txt','md','markdown','csv','tsv','json','log','xml','html','htm','css','js','jsx','mjs','cjs','ts','tsx','py','go','rs','java','c','h','cpp','hpp','cs','rb','php','sh','bash','ps1','sql','yaml','yml','toml','ini','conf','env','vue','svelte','tex','r','swift','kt','kts','dart','scala','lua','pl','ex','exs','wxml','wxss','wxs','axml','acss','sjs','swan','ttml','ttss','qml','qss'])
export async function extractDocumentBytes(bytes: Uint8Array, name: string, basePath?: string): Promise<{ text: string; format: string }> {
  if (!bytes.length || bytes.length > MAX_BYTES) { fail('文档不能为空且不能超过 10 MiB。') }
  const ext = name.toLowerCase().split('.').at(-1) ?? ''
  let text = '', format: string = ext
  if (ext === 'pdf') { text = await pdfText(bytes, basePath) }
  else if (['docx','pptx','xlsx'].includes(ext)) { text = officeText(bytes, ext) }
  else if (TEXT_EXTS.has(ext)) {
    try { text = strictDecode(bytes) } catch { fail('文本必须为有效的 UTF-8 编码。') }
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i)
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) { fail('文件含二进制控制字符，不能作为文本上传。') }
    }
    format = ext === 'tsv' ? 'csv' : ext === 'markdown' ? 'md' : ['txt','md','csv','json'].includes(ext) ? ext : 'code'
  } else { fail('此格式不支持文字提取。请使用 PDF、DOCX、PPTX、XLSX 或 UTF-8 文本；旧版 DOC/PPT/XLS 请先转换。') }
  checkText(text)
  if (!text.trim()) { fail('文档没有可提取文字。') }
  return { text, format }
}

// Explicitly narrow the worker API; DOM lib does not imply DOMParser/document exists here.
const workerScope = globalThis as typeof globalThis & { postMessage(message: unknown): void; onmessage: ((event: MessageEvent<{ file: File; basePath: string }>) => void) | null }
workerScope.onmessage = event => {
  void (async () => {
    try {
      const data = event.data
      if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== 2 || !Object.hasOwn(data, 'file') || !Object.hasOwn(data, 'basePath')) { fail('无效的文档任务。') }
      const { file, basePath } = data
      if (typeof basePath !== 'string' || basePath !== '' && /^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.exec(basePath)?.[0] !== basePath) { fail('无效的文档资源路径。') }
      if (!(file instanceof Blob) || !('name' in file) || typeof file.name !== 'string' || file.size > MAX_BYTES) { fail('无效或过大的文档。') }
      workerScope.postMessage({ type: 'document-result', ...await extractDocumentBytes(new Uint8Array(await file.arrayBuffer()), file.name, basePath) })
    } catch (error) {
      workerScope.postMessage({ type: 'document-result', error: error instanceof Error && error.name === 'PasswordException' ? '加密 PDF 不支持文字提取。' : error instanceof Error ? error.message : '文档文字提取失败。' })
    }
  })()
}
