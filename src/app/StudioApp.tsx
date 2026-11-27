import { useUiText, uiText } from '../i18n/ui.js'
import { chromeEn } from '../i18n/chrome.en.js'
import { AppearanceControls } from '../components/settings/AppearanceControls.js'
import { create } from 'zustand'
import { useIsMobile } from './viewport.js'
import { appPath } from '../services/paths.js'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { App } from './App.js'
import { HarborMark } from '../components/base/HarborMark.js'
import { AdminPage } from '../components/studio/AdminPage.js'
import { MyUsagePanel } from '../components/studio/QuotaPanel.js'
import { CodeConversations } from '../components/studio/CodeConversations.js'
import { NotificationsButton } from '../components/studio/Notifications.js'
import { checkSession, loadCatalog, login, logout, useStudio } from '../services/studio.js'
import './studio.css'
import { useChatStore } from '../services/chat/store.js'
import { cancelUpload, useUploads } from '../services/attachments.js'
import { stopReadAloud } from '../services/speech/readAloud.js'

export function StudioApp() {
  const tUi = useUiText(chromeEn)
  const authenticated = useStudio(s => s.authenticated)
  const principal = useStudio(s => s.principal)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const check = () => {
    setError(''); setChecking(true)
    void checkSession().catch(e => setError(e instanceof Error ? e.message : uiText(chromeEn, '连接服务器失败'))).finally(() => setChecking(false))
  }
  useEffect(check, [])
  useEffect(() => {
    const verify = () => { if (document.visibilityState === 'visible') {void checkSession().then(() => useStudio.getState().authenticated ? loadCatalog() : undefined).catch(() => {})} }
    window.addEventListener('focus', verify); document.addEventListener('visibilitychange', verify)
    return () => { window.removeEventListener('focus', verify); document.removeEventListener('visibilitychange', verify) }
  }, [])
  useEffect(() => {
    if (authenticated === false) {
      Object.values(useChatStore.getState().streaming).forEach(controller => controller.abort())
      Object.entries(useUploads.getState().tasks).forEach(([id, task]) => { if (task.status === 'uploading') {cancelUpload(id)} })
      stopReadAloud()
    }
  }, [authenticated])
  useEffect(() => { if (authenticated) {void loadCatalog().catch(() => {})} }, [authenticated])
  if (authenticated === null) {return <div className="studio-login"><section className="studio-login-card"><AppearanceControls /><HarborMark size={44} /><div className="studio-brand">Quayloom <span>{tUi('多供应商 AI 工作台')}</span></div><p role="status">{error || tUi('正在连接工作空间…')}</p>{!checking && <button onClick={check}>{tUi('重新连接')}</button>}</section></div>}
  if (!authenticated) {return <Login />}
  if (window.location.pathname.replace(/\/$/, '') === appPath('/admin')) {
    return principal?.role === 'admin' ? <AdminPage /> : <main className="studio-login"><section className="studio-login-card"><AppearanceControls /><h1>{tUi('仅管理员可访问')}</h1><p>{tUi('当前使用码只允许聊天，不能管理渠道、模型或其他使用码。')}</p><a href={appPath('/')}>{tUi('返回聊天 →')}</a></section></main>
  }
  return <App />
}

function Login() {
  const tUi = useUiText(chromeEn)
  const [mode, setMode] = useState<'code' | 'admin'>(() => window.location.pathname.replace(/\/$/, '') === appPath('/admin') ? 'admin' : 'code')
  const [credential, setCredential] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) {return}
    const normalized = credential.trim()
    setCredential(normalized)
    if (!normalized) { setError(mode === 'code' ? tUi('请输入使用码') : tUi('请输入管理员密码')); return }
    setBusy(true); setError('')
    try { await login(normalized, mode); setCredential('') } catch (e) { setError(e instanceof Error ? e.message : tUi('登录失败')) } finally { setBusy(false) }
  }
  return <main className="studio-login"><form className="studio-login-card" onSubmit={submit}><AppearanceControls />
    <div className="studio-symbol"><HarborMark size={44} /></div><div className="studio-brand">Quayloom <span>{tUi('多供应商 AI 工作台')}</span></div>
    <h1>{tUi('欢迎回来')}</h1>
    <div className="studio-login-tabs" role="group" aria-label={tUi('登录方式')}>{(['code', 'admin'] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} className={mode === value ? 'is-selected' : ''} disabled={busy} onClick={() => { setMode(value); setCredential(''); setError('') }}>{value === 'code' ? tUi('使用码登录') : tUi('管理员登录')}</button>)}</div>
    <label className="studio-field">{mode === 'code' ? tUi('使用码') : tUi('管理员密码')}<input key={mode} name={mode === 'code' ? 'access-code' : 'admin-password'} type="password" autoComplete={mode === 'code' ? 'off' : 'current-password'} spellCheck={false} maxLength={mode === 'code' ? 64 : 1024} required autoFocus value={credential} onChange={e => setCredential(e.target.value)} onBlur={e => setCredential(e.target.value.trim())} placeholder={mode === 'code' ? tUi('输入管理员提供的使用码') : tUi('输入管理员密码')} /></label>
    {error && <p className="studio-error" role="alert">{error}</p>}
    <button className="studio-primary" disabled={busy}>{busy ? tUi('正在登录…') : tUi('进入工作空间 →')}</button>
    <a href="https://github.com/EttijBaqaee/quayloom" target="_blank" rel="noopener noreferrer">GitHub</a>
  </form></main>
}

const useWorkspaceOverlay = create<{ type: 'usage' | 'conversations' | null }>(() => ({ type: null }))

/** Keep modal ownership independent of responsive header/composer remounts. */
export function StudioOverlays() {
  const tUi = useUiText(chromeEn)
  const principal = useStudio(s => s.principal)
  const type = useWorkspaceOverlay(s => s.type)
  const mobile = useIsMobile()
  const usageDialog = useRef<HTMLDialogElement>(null)
  const close = () => useWorkspaceOverlay.setState({ type: null })
  useEffect(() => {
    const dialog = usageDialog.current
    if (type !== 'usage' || principal?.role !== 'user' || !dialog) {return}
    dialog.showModal()
    return () => dialog.close()
  }, [type, principal?.role])
  return <>{type === 'usage' && principal?.role === 'user' && <dialog ref={usageDialog} className={`studio-usage-dialog${mobile ? ' studio-mobile-usage' : ''}`} aria-label={tUi('我的额度')} onCancel={close} onClose={close}><button className="studio-usage-close" onClick={close} aria-label={tUi('关闭我的额度')}>{tUi('关闭')}</button><MyUsagePanel /></dialog>}{type === 'conversations' && principal?.role === 'admin' && <CodeConversations onClose={close} />}</>
}

export function StudioToolbar({ mobile = false }: { mobile?: boolean }) {
  const tUi = useUiText(chromeEn)
  const principal = useStudio(s => s.principal)
  const selection = useStudio(s => s.selection)
  const error = useStudio(s => s.catalogError)
  const [logoutError, setLogoutError] = useState('')
  const showUsage = useWorkspaceOverlay(s => s.type === 'usage')
  const menu = useRef<HTMLDetailsElement>(null)
  const closeMenu = () => { if (menu.current) {menu.current.open = false} }
  useEffect(() => {
    if (!mobile) {return}
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !menu.current?.contains(event.target)) {closeMenu()} }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && menu.current?.open) { closeMenu(); menu.current.querySelector('summary')?.focus() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [mobile])
  const actions = <>
    <AppearanceControls />
    {principal?.role === 'admin' ? <><a className="studio-admin-link" href={appPath('/admin')}>{tUi('模型与使用码管理')}</a><button className="studio-quiet" aria-haspopup="dialog" onClick={() => { closeMenu(); useWorkspaceOverlay.setState({ type: 'conversations' }) }}>{tUi('使用码对话')}</button></> : <button className="studio-quiet studio-admin-link" aria-expanded={showUsage} onClick={() => { closeMenu(); useWorkspaceOverlay.setState({ type: showUsage ? null : 'usage' }) }}>{tUi('我的额度')}</button>}
    {/\bQuayloomAndroid\//.test(navigator.userAgent) && <a className="studio-quiet" href={appPath('/__quayloom_android/menu')} onClick={closeMenu}>{tUi('客户端设置')}</a>}
    <a className="studio-quiet" href="https://github.com/EttijBaqaee/quayloom" target="_blank" rel="noopener noreferrer" onClick={closeMenu}>GitHub</a>
    <button className="studio-quiet" onClick={() => { closeMenu(); void logout().catch(e => setLogoutError(e.message)) }}>{tUi('退出')}</button>
  </>
  return <><div className={`studio-toolbar${mobile ? ' is-mobile' : ''}`}>
    {mobile ? <><NotificationsButton compact /><details className="studio-workspace-menu" ref={menu}><summary aria-label={tUi('工作台菜单')} title={tUi('更多')}><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg></summary><nav aria-label={tUi('工作台操作')}>{actions}</nav></details></> : <>{actions}<NotificationsButton /></>}
    {logoutError && <div role="alert" className="studio-error">{logoutError}</div>}
    {(error || !selection) && <div className="studio-catalog-note" role="status">{error || (principal?.role === 'admin' ? tUi('请添加可用模型。') : tUi('暂无可用模型，请联系管理员。'))} {error && <button onClick={() => void loadCatalog().catch(() => {})}>{tUi('重试')}</button>}</div>}
  </div></>
}
