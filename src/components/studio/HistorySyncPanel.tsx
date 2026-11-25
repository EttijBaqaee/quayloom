import { useUiText, uiText } from '../../i18n/ui.js'
import { workspaceEn } from '../../i18n/workspace.en.js'
import { confirmStudio } from './confirm.js'
import { useEffect, useState } from 'react'
import { exportHistory, importHistory } from '../../services/chat/backup.js'
import { initChat, useChatStore } from '../../services/chat/store.js'
import { StudioError, studioApi, useStudio } from '../../services/studio.js'

const t = (text: string, params?: Record<string, string | number>) => uiText(workspaceEn, text, params)

type Snapshot = { format: 'chat-demo-zip'; data: string }
type RemoteHistory = { snapshot: unknown | null; revision: number }
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a'); link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(new Error(t('读取历史归档失败')))
    reader.readAsDataURL(blob)
  })
}
function snapshotFile(value: unknown) {
  if (!value || typeof value !== 'object' || !('format' in value) || value.format !== 'chat-demo-zip' || !('data' in value) || typeof value.data !== 'string') {throw new Error(t('服务器快照格式不受支持，未修改本地历史。'))}
  const raw = atob(value.data)
  const bytes = Uint8Array.from(raw, c => c.charCodeAt(0))
  return new File([bytes], 'studio-history.zip', { type: 'application/zip' })
}

/** Explicit versioned snapshots; never restore or overwrite on mount/login. */
export function HistorySyncPanel() {
  const t = useUiText(workspaceEn)
  const isAdmin = useStudio(s => s.principal?.role === 'admin')
  const [remote, setRemote] = useState<{ revision: number; hasSnapshot: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const streaming = useChatStore(s => Object.keys(s.streaming).length > 0)
  const importing = useChatStore(s => s.importingHistory)
  const empty = useChatStore(s => s.ready && s.sessions.length === 0)
  useEffect(() => { void initChat() }, [])
  const disabled = busy || streaming || importing
  async function run(action: () => Promise<void>) {
    if (disabled) {return}
    setBusy(true); setError(''); setMessage('')
    try { await initChat(); if (!useChatStore.getState().ready) {throw new Error(t('本地历史未能加载，已停止同步。'));} await action() }
    catch (e) {
      if (e instanceof StudioError && e.status === 409) { setRemote(null); setError(t('同步冲突：另一设备已更新服务器快照。本地与远端均未被本次请求覆盖。请先检查服务器版本，再明确选择保存或恢复。')) }
      else {setError(e instanceof Error ? e.message : t('同步失败；请重试。'))}
    } finally { setBusy(false) }
  }
  async function inspect() {
    const result = await studioApi<RemoteHistory>('/history')
    setRemote({ revision: result.revision, hasSnapshot: result.snapshot !== null })
    setMessage(t('服务器版本 {revision} · {status}。', { revision: result.revision, status: result.snapshot === null ? t('还没有快照') : t('已有历史快照') }))
  }
  async function save() {
    if (!remote) {return}
    if (!await confirmStudio(remote.hasSnapshot ? t('将用本机全部历史替换服务器版本 {revision}。这不会合并，其他设备的更新会触发冲突。确认继续？', { revision: remote.revision }) : t('将本机全部会话、分支和可归档图片保存到服务器，确认继续？'))) {return}
    await run(async () => {
      const { blob } = await exportHistory()
      const snapshot: Snapshot = { format: 'chat-demo-zip', data: await toBase64(blob) }
      const body = JSON.stringify({ snapshot, revision: remote.revision })
      if (new Blob([body]).size > 40 * 1024 * 1024) {throw new Error(t('归档超过服务器 40 MiB JSON 上限；未上传。请使用本地 ZIP 导出备份。'))}
      const result = await studioApi<{ revision: number }>('/history', { method: 'PUT', body })
      setRemote({ revision: result.revision, hasSnapshot: true }); setMessage(t('快照已保存到服务器 · 版本 {revision}。', { revision: result.revision }))
    })
  }
  async function restore() {
    if (!await confirmStudio(t('恢复会替换本机全部会话与附件，不会合并。系统会先下载本地 ZIP 备份；请保留备份文件。确认从服务器恢复？'))) {return}
    await run(async () => {
      const result = await studioApi<RemoteHistory>('/history')
      if (result.snapshot === null) {throw new Error(t('服务器没有快照；未清空或修改本地历史。'))}
      if (remote && result.revision !== remote.revision) {
        setRemote({ revision: result.revision, hasSnapshot: true })
        throw new Error(t('服务器已从版本 {previous} 更新为 {revision}，本次恢复已取消。检查版本后请再次确认恢复。', { previous: remote.revision, revision: result.revision }))
      }
      const file = snapshotFile(result.snapshot)
      const backup = await exportHistory(); download(backup.blob, `before-restore-${backup.name}`)
      const count = await importHistory(file)
      setRemote({ revision: result.revision, hasSnapshot: true }); setMessage(t('已恢复版本 {revision}，共 {count} 个会话。', { revision: result.revision, count }))
    })
  }
  return <section className="studio-sync">
    <div><h2>{t('历史快照')}</h2><p>{t('非图片附件仅保留元数据，不含原件。')}</p></div>
    <div className="studio-sync-actions">{isAdmin && <><button disabled={disabled} onClick={() => void run(inspect)}>{t('检查服务器版本')}</button><button disabled={disabled || !remote || empty} onClick={() => void save()}>{t('保存到服务器')}</button><button disabled={disabled} onClick={() => void restore()}>{t('从服务器恢复')}</button></>}<button disabled={disabled || empty} onClick={() => void run(async () => { const result = await exportHistory(); download(result.blob, result.name); setMessage(t('本地 ZIP 备份已生成，请检查浏览器下载。')) })}>{t('下载本地 ZIP')}</button></div>
    {remote && <small>{t('已检查服务器版本：{revision} · {status}', { revision: remote.revision, status: remote.hasSnapshot ? t('已有快照') : t('暂无快照') })}</small>}{empty && <p className="studio-hint">{t('本地没有会话；为防止误清空服务器，空历史不允许上传覆盖。')}</p>}{streaming && <p className="studio-hint">{t('请等待回复结束后操作历史快照。')}</p>}
    {message && <p className="studio-success" role="status">{message}</p>}{error && <p className="studio-error" role="alert">{error}</p>}
  </section>
}
