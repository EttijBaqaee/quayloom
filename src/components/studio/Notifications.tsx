// SPDX-License-Identifier: AGPL-3.0-only
import { useUiText, uiText } from '../../i18n/ui.js'
import { workspaceEn } from '../../i18n/workspace.en.js'
import { useSettings } from '../../services/settings.js'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { studioApi, useStudio } from '../../services/studio.js'
import './notifications.css'

const translateText = (text: string, params?: Record<string, string | number>) => uiText(workspaceEn, text, params)

type Notice = { id: string; title: string; body: string; createdAt: number; readAt?: number | null; audience?: 'all' | 'selected'; codeIds?: string[]; withdrawnAt?: number | null }
type Code = { id: string; name: string; enabled: boolean }
type NoticePage = { notices: Notice[]; unreadCount?: number; codes?: Code[]; total: number; limit: number; offset: number; hasMore: boolean }
type Scope = { identity: string; active: boolean; controllers: Set<AbortController> }
const PAGE_SIZE = 50
const EMPTY_PAGE: NoticePage = { notices: [], unreadCount: 0, total: 0, limit: PAGE_SIZE, offset: 0, hasMore: false }
const formatTime = (value: number) => new Date(value).toLocaleString(useSettings.getState().locale)

/** In-app notices only: no Notification API, service worker, email or SMS. */
export function NotificationsButton({ compact = false }: { compact?: boolean } = {}) {
  const t = useUiText(workspaceEn)
  const principal = useStudio(state => state.principal)
  const admin = principal?.role === 'admin'
  const identity = principal ? `${principal.role}:${principal.id}` : ''
  const headingId = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const scope = useRef<Scope | null>(null)
  const sequence = useRef(0)
  const [open, setOpen] = useState(false)
  const [offset, setOffset] = useState(0)
  const [storedData, setData] = useState<NoticePage>(EMPTY_PAGE)
  const [dataIdentity, setDataIdentity] = useState('')
  const data = dataIdentity === identity ? storedData : EMPTY_PAGE
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<'all' | 'selected'>('all')
  const [selected, setSelected] = useState<string[]>([])
  const [withdrawId, setWithdrawId] = useState<string | null>(null)
  const mutation = useRef(false)

  useEffect(() => {
    const current: Scope = { identity, active: true, controllers: new Set() }
    const element = dialog.current
    scope.current = current
    setData(EMPTY_PAGE); setDataIdentity('')
    mutation.current = false
    setOffset(0); setOpen(false); setError(''); setStatus(''); setTitle(''); setBody(''); setSelected([]); setWithdrawId(null); setBusy(false)
    return () => {
      current.active = false
      for (const controller of current.controllers) { controller.abort() }
      current.controllers.clear()
      element?.close()
    }
  }, [identity])

  const request = useCallback(async <T,>(path: string, init: RequestInit = {}, parentSignal?: AbortSignal): Promise<T | undefined> => {
    const current = scope.current
    if (!current?.active || current.identity !== identity || parentSignal?.aborted) { return }
    const controller = new AbortController()
    const abort = () => controller.abort()
    parentSignal?.addEventListener('abort', abort, { once: true })
    current.controllers.add(controller)
    const timer = window.setTimeout(abort, 15000)
    try {
      const result = await studioApi<T>(path, { ...init, signal: controller.signal })
      return current.active && !controller.signal.aborted ? result : undefined
    } catch (cause) {
      if (!current.active || parentSignal?.aborted) { return }
      if (controller.signal.aborted) { throw new Error(translateText('请求超时，请重试。')) }
      throw cause
    } finally {
      window.clearTimeout(timer); parentSignal?.removeEventListener('abort', abort); current.controllers.delete(controller)
    }
  }, [identity])

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const seq = ++sequence.current
    setLoading(true)
    try {
      const badgeOnly = !admin && !open
      const result = await request<NoticePage>(`${admin ? '/admin/notices' : '/notices'}?limit=${badgeOnly ? 1 : PAGE_SIZE}&offset=${badgeOnly ? 0 : offset}`, {}, signal)
      if (result && seq === sequence.current) { setData(result); setDataIdentity(identity); setError('') }
    } catch (cause) {
      if (!signal?.aborted && seq === sequence.current) { setError(cause instanceof Error ? cause.message : translateText('通知加载失败')) }
    } finally {
      if (!signal?.aborted && seq === sequence.current) { setLoading(false) }
    }
  }, [admin, identity, offset, open, request])

  useEffect(() => {
    if (!identity || admin && !open) { return }
    const controller = new AbortController()
    let timer: number | undefined
    const poll = async () => {
      await refresh(controller.signal)
      if (!controller.signal.aborted) { timer = window.setTimeout(() => { void poll() }, 30000) }
    }
    void poll()
    return () => { controller.abort(); if (timer !== undefined) { window.clearTimeout(timer) } }
  }, [identity, admin, open, refresh])

  useEffect(() => {
    const node = dialog.current
    if (open && node && !node.open) { node.showModal() }
    if (!open && node?.open) { node.close() }
  }, [open])

  async function run(path: string, payload: object, success: string, after?: () => void) {
    if (mutation.current) { return }
    const current = scope.current
    mutation.current = true; setBusy(true); setError(''); setStatus('')
    try {
      const result = await request<{ ok?: boolean; notice?: Notice }>(path, { method: 'POST', body: JSON.stringify(payload) })
      if (!result || !current?.active) { return }
      after?.(); setStatus(success); await refresh()
    } catch (cause) {
      if (current?.active) { setError(cause instanceof Error ? cause.message : t('操作失败')) }
    } finally {
      if (current?.active && scope.current === current) { mutation.current = false; setBusy(false) }
    }
  }
  function publish(event: FormEvent) {
    event.preventDefault()
    if (!title.trim() || !body.trim()) { setError(t('请填写标题和正文。')); return }
    if (audience === 'selected' && selected.length === 0) { setError(t('请至少选择一个使用码。')); return }
    void run('/admin/notices', { title, body, audience, codeIds: audience === 'selected' ? selected : [] }, t('公告已发布。'), () => { setTitle(''); setBody(''); setSelected([]) })
  }
  function close() { setOpen(false); setWithdrawId(null); trigger.current?.focus() }
  if (!principal) { return null }
  return <>
    <button ref={trigger} type="button" className={`ql-notices-trigger${compact ? ' is-compact' : ''}`} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={compact ? admin ? t('发布通知') : t('通知（{count} 条未读）', { count: data.unreadCount ?? 0 }) : undefined} title={compact ? admin ? t('发布通知') : t('通知') : undefined}>{compact ? <><svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>{!admin && !!data.unreadCount && <span className="ql-notices-dot" aria-hidden="true" />}</> : admin ? t('发布通知') : t('通知（{count}）', { count: data.unreadCount ?? 0 })}</button>
    <dialog ref={dialog} className="ql-notices-dialog" aria-labelledby={headingId} onCancel={event => { event.preventDefault(); close() }} onClose={() => { setOpen(false); trigger.current?.focus() }}>
      <header className="ql-notices-header"><h2 id={headingId}>{admin ? t('站内公告管理') : t('站内通知')}</h2><button type="button" onClick={close} aria-label={t('关闭通知')}>{t('关闭')}</button></header>
      {error && <p className="ql-notices-error" role="alert">{error}</p>}
      <p className="ql-notices-status" role="status" aria-live="polite">{status}</p>
      {admin && <form className="ql-notices-form" onSubmit={publish}>
        <label>{t('标题')}<input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} disabled={busy} /></label>
        <label>{t('正文（纯文本，最多 20000 字符）')}<textarea required maxLength={20000} rows={5} value={body} onChange={event => setBody(event.target.value)} disabled={busy} /></label>
        <label>{t('接收范围')}<select value={audience} onChange={event => { setAudience(event.target.value as 'all' | 'selected'); setSelected([]) }} disabled={busy}><option value="all">{t('全部使用码（包括以后新建的码）')}</option><option value="selected">{t('指定使用码')}</option></select></label>
        {audience === 'selected' && <fieldset disabled={busy} className="ql-notices-codes"><legend>{t('选择使用码（已选 {count}）', { count: selected.length })}</legend>{data.codes?.length ? data.codes.map(code => <label key={code.id}><input type="checkbox" checked={selected.includes(code.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, code.id] : previous.filter(id => id !== code.id))} /><span>{code.name}{!code.enabled && t('（已停用）')}</span></label>) : <p>{t('暂无使用码。')}</p>}</fieldset>}
        <button type="submit" disabled={busy || loading}>{t('发布公告')}</button>
      </form>}
      <section className="ql-notices-list" aria-label={admin ? t('已发布公告') : t('收到的通知')} aria-busy={loading}>
        <div className="ql-notices-toolbar"><h3>{admin ? t('公告记录（{count}）', { count: data.total }) : t('未读 {unread} · 共 {total} 条', { unread: data.unreadCount ?? 0, total: data.total })}</h3><button type="button" disabled={loading || busy} onClick={() => { void refresh() }}>{t('刷新')}</button>{!admin && <button type="button" disabled={busy || !data.unreadCount} onClick={() => { void run('/notices/read-all', {}, t('当前可见范围内的公告已全部标为已读。')) }}>{t('全部标为已读')}</button>}</div>
        {!data.notices.length && <p>{loading ? t('加载中…') : t('暂无通知。')}</p>}
        {data.notices.map(notice => <article className={`ql-notice ${notice.readAt === null ? 'ql-notice-unread' : ''}`} key={notice.id}>
          <div className="ql-notice-heading"><h4>{notice.title}</h4><span>{admin ? notice.withdrawnAt ? t('已撤回') : t('已发布') : notice.readAt ? t('已读') : t('未读')}</span></div>
          <p className="ql-notice-meta"><time dateTime={new Date(notice.createdAt).toISOString()}>{formatTime(notice.createdAt)}</time>{admin && ` · ${notice.audience === 'all' ? t('全部使用码') : t('指定 {count} 个使用码', { count: notice.codeIds?.length ?? 0 })}`}</p>
          <p className="ql-notice-body">{notice.body}</p>
          {admin ? !notice.withdrawnAt && (withdrawId === notice.id ? <div className="ql-notice-withdraw"><span>{t('撤回后用户将无法查看此公告。')}</span><button type="button" disabled={busy} onClick={() => { void run(`/admin/notices/${encodeURIComponent(notice.id)}/withdraw`, {}, t('公告已撤回。'), () => setWithdrawId(null)) }}>{t('确认撤回')}</button><button type="button" disabled={busy} onClick={() => setWithdrawId(null)}>{t('取消')}</button></div> : <button type="button" disabled={busy} onClick={() => setWithdrawId(notice.id)}>{t('撤回')}</button>) : !notice.readAt && <button type="button" disabled={busy} onClick={() => { void run(`/notices/${encodeURIComponent(notice.id)}/read`, {}, t('已标为已读。')) }}>{t('标为已读')}</button>}
        </article>)}
        <nav className="ql-notices-pagination" aria-label={t('公告分页')}><button type="button" disabled={offset === 0 || busy || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>{t('上一页')}</button><span>{t('第 {page} 页', { page: Math.floor(offset / PAGE_SIZE) + 1 })}</span><button type="button" disabled={!data.hasMore || busy || loading} onClick={() => setOffset(offset + PAGE_SIZE)}>{t('下一页')}</button></nav>
      </section>
    </dialog>
  </>
}
