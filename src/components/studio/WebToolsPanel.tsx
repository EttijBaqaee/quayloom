import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useUiText } from '../../i18n/ui.js'
import { webToolsMessages } from '../../i18n/web-tools.en.js'
import { useStudio } from '../../services/studio.js'
import { loadWebTools, saveWebTools, type WebToolsConfig, type WebToolsUpdate } from '../../services/web-tools.js'
import { confirmStudio } from './confirm.js'

type Draft = {
  search: WebToolsConfig['search'] & { apiKey: string; clearApiKey: boolean }
  fetch: WebToolsConfig['fetch'] & { apiKey: string; clearApiKey: boolean }
}
const draftFor = (config: WebToolsConfig): Draft => ({
  search: { ...config.search, apiKey: '', clearApiKey: false },
  fetch: { ...config.fetch, apiKey: '', clearApiKey: false },
})
const requestError = (error: unknown) => error instanceof Error
  ? error.name === 'AbortError' ? '配置请求超时或已取消，请重试。' : error.message
  : '操作失败'

export function WebToolsPanel() {
  const t = useUiText(webToolsMessages)
  const authenticated = useStudio(s => s.authenticated)
  const principal = useStudio(s => s.principal)
  const allowed = authenticated === true && principal?.role === 'admin'
  const principalId = principal?.id
  const [expanded, setExpanded] = useState(false)
  const [saved, setSaved] = useState<WebToolsConfig | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(false)
  const [reload, setReload] = useState(0)
  const pending = useRef<AbortController | null>(null)
  const busy = loading || saving

  useEffect(() => {
    pending.current?.abort(); pending.current = null
    setSaved(null); setDraft(null); setDirty(false); setError(''); setNotice(false); setLoading(false); setSaving(false)
    if (!allowed) { return }
    let active = true
    const controller = new AbortController()
    pending.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 20000)
    setLoading(true)
    void loadWebTools(controller.signal).then(result => {
      if (active && useStudio.getState().principal?.id === principalId) {
        setSaved(result.config); setDraft(draftFor(result.config))
      }
    }).catch(reason => { if (active) { setError(requestError(reason)) } }).finally(() => {
      window.clearTimeout(timeout)
      if (pending.current === controller) { pending.current = null }
      if (active) { setLoading(false) }
    })
    return () => { active = false; window.clearTimeout(timeout); controller.abort() }
  }, [allowed, principalId, reload])
  useEffect(() => () => { pending.current?.abort() }, [])
  useEffect(() => {
    if (!dirty) { return }
    const before = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', before)
    return () => window.removeEventListener('beforeunload', before)
  }, [dirty])

  function patch<K extends keyof Draft>(kind: K, value: Partial<Draft[K]>) {
    setDraft(current => current ? { ...current, [kind]: { ...current[kind], ...value } } : current)
    setDirty(true); setNotice(false)
  }
  async function discard(close = false) {
    if (busy || dirty && !await confirmStudio(t('网页服务有未保存修改，确定放弃？'))) { return }
    if (saved) { setDraft(draftFor(saved)) }
    setDirty(false); setNotice(false); setError('')
    if (close) { setExpanded(false) }
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft || busy || pending.current || !allowed || useStudio.getState().principal?.id !== principalId) { return }
    const clean = (service: Draft['search'] | Draft['fetch']) => ({
      baseUrl: service.baseUrl.trim(), allowPrivateNetwork: service.allowPrivateNetwork,
      ...(service.clearApiKey ? { clearApiKey: true } : service.apiKey.trim() ? { apiKey: service.apiKey.trim() } : {}),
    })
    const config: WebToolsUpdate = {
      search: { ...clean(draft.search), provider: draft.search.provider, maxResults: draft.search.maxResults },
      fetch: { ...clean(draft.fetch), provider: draft.fetch.provider },
    }
    const controller = new AbortController()
    pending.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 20000)
    setSaving(true); setError(''); setNotice(false)
    try {
      const result = await saveWebTools(config, controller.signal)
      if (!controller.signal.aborted && useStudio.getState().principal?.id === principalId) {
        setSaved(result.config); setDraft(draftFor(result.config)); setDirty(false); setNotice(true)
      }
    } catch (reason) {
      if (useStudio.getState().principal?.id === principalId) { setError(requestError(reason)) }
    } finally {
      window.clearTimeout(timeout)
      if (pending.current === controller) { pending.current = null; setSaving(false) }
    }
  }
  if (!allowed) { return null }
  return <section className="studio-update" aria-labelledby="studio-web-tools-title" aria-busy={busy}>
    <div className="studio-update-heading"><h2 id="studio-web-tools-title">{t('网页搜索与获取')}{dirty && <small> · {t('有未保存修改')}</small>}</h2><button type="button" disabled={busy} aria-expanded={expanded} aria-controls="studio-web-tools-form" onClick={() => expanded ? void discard(true) : setExpanded(true)}>{expanded ? t('关闭') : t('配置网页服务')}</button></div>
    <p className="studio-muted">{t('服务配置不会自动开启模型搜索；还需在模型设置中选择“独立搜索服务”并勾选“联网搜索”。')}</p>
    {loading && <p role="status">{t('正在加载…')}</p>}
    {error && <div className="studio-banner studio-error" role="alert">{t(error)}{!saved && <button type="button" disabled={busy} onClick={() => setReload(value => value + 1)}>{t('重新加载')}</button>}</div>}
    {notice && <p className="studio-success" role="status">{t('网页服务配置已保存。')}</p>}
    {expanded && draft && <form id="studio-web-tools-form" onSubmit={save}>
      <fieldset disabled={busy}>
        <div className="studio-form-grid">
          {(['search', 'fetch'] as const).map(kind => {
            const service = draft[kind]
            const apiEnabled = service.provider === 'deepseek-api'
            return <section key={kind} className="studio-model-card">
              <h3>{t(kind === 'search' ? '网页搜索' : '网页获取')}</h3>
              <label className="studio-field">{t(kind === 'search' ? '搜索服务' : '获取服务')}<select value={service.provider} onChange={event => kind === 'search' ? patch('search', { provider: event.target.value as Draft['search']['provider'] }) : patch('fetch', { provider: event.target.value as Draft['fetch']['provider'] })}>
                {kind === 'search' ? <option value="disabled">{t('停用')}</option> : <option value="http">{t('直接抓取（HTTP）')}</option>}<option value="deepseek-api">DeepSeek {kind === 'search' ? 'Search' : 'Fetch'} API</option>
              </select></label>
              <label className="studio-field">{t('API 基地址')}<input type="url" required={apiEnabled} disabled={!apiEnabled} value={service.baseUrl} maxLength={2048} placeholder="https://api.deepseek.com/v1/tools" onChange={event => patch(kind, { baseUrl: event.target.value })} /><small>{t('填写路径前缀，服务器会追加 {suffix}。', { suffix: kind === 'search' ? '/search' : '/fetch' })}</small></label>
              {kind === 'search' && <label className="studio-field">{t('每次搜索最多返回结果数')}<input type="number" min={1} max={10} step={1} required disabled={!apiEnabled} value={draft.search.maxResults} onChange={event => patch('search', { maxResults: Number(event.target.value) })} /></label>}
              <label className="studio-field">{t(kind === 'search' ? '搜索服务密钥' : '获取服务密钥')}<small>{t(service.hasApiKey ? '服务器已保存密钥' : '尚未设置密钥')}</small><input type="password" autoComplete="new-password" spellCheck={false} disabled={!apiEnabled || service.clearApiKey} value={service.apiKey} onChange={event => patch(kind, { apiKey: event.target.value })} placeholder={t('留空保留原密钥；输入新值替换')} /></label>
              {service.hasApiKey && <label className="studio-private"><input type="checkbox" checked={service.clearApiKey} onChange={event => patch(kind, { clearApiKey: event.target.checked, apiKey: '' })} /><span>{t('明确清除服务器密钥')}</span></label>}
              <label className="studio-private"><input type="checkbox" disabled={!apiEnabled} checked={service.allowPrivateNetwork} onChange={event => patch(kind, { allowPrivateNetwork: event.target.checked })} /><span><strong>{t('允许访问私有网络（显式授权）')}</strong><small>{t('仅在信任该服务时允许服务器访问其内网地址。')}</small></span></label>
              {kind === 'fetch' && !apiEnabled && <small>{t('直接抓取沿用网页地址安全检查；此处基地址与密钥仅用于 DeepSeek Fetch API。')}</small>}
            </section>
          })}
        </div>
        <p className="studio-muted">{t('搜索和获取服务独立计费，不包含在聊天模型 Token 额度内。保存配置不会发起检索。')}</p>
      </fieldset>
      <div className="studio-form-actions"><button type="submit" className="studio-primary" disabled={busy || !dirty}>{saving ? t('正在保存…') : t('保存网页服务配置')}</button><button type="button" disabled={busy || !dirty} onClick={() => void discard()}>{t('放弃修改')}</button></div>
    </form>}
  </section>
}
