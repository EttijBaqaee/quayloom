import { useSettings } from '../../services/settings.js'
import { useUiText, uiText } from '../../i18n/ui.js'
import { adminMessages } from '../../i18n/admin.en.js'
import { useEffect, useState, type FormEvent } from 'react'
import { defaultQuota, loadCatalog, studioApi, type Provider, type Quota } from '../../services/studio.js'
import { QuotaEditor, UsageMeters, type CodeUsage } from './QuotaPanel.js'
import { confirmStudio } from './confirm.js'

type Allowed = { providerId: string; modelId: string }
type AccessCode = { id: string; name: string; enabled: boolean; expiresAt: number | null; createdAt: number; allowedModels: Allowed[]; channelQuotas: { providerId: string; quota: Quota }[]; usage: CodeUsage }
type Draft = { id?: string; name: string; enabled: boolean; expiry: string; allowedModels: Allowed[]; channelQuotas: Record<string, Quota> }
const keyOf = (item: Allowed) => JSON.stringify([item.providerId, item.modelId])
function localDate(value: number | null) {
  if (!value) {return ''}
  const date = new Date(value), pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
export function AccessCodesPanel() {
  const t = useUiText(adminMessages)
  const [codes, setCodes] = useState<AccessCode[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [dirty, setDirty] = useState(false)
  const [visible, setVisible] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function reload() {
    const [list, catalog] = await Promise.all([studioApi<{ accessCodes: AccessCode[] }>('/admin/access-codes'), studioApi<{ providers: Provider[] }>('/admin/providers')])
    setCodes(list.accessCodes); setProviders(catalog.providers)
  }
  async function run(action: () => Promise<void>) {
    if (busy) {return}
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : t('使用码操作失败')) } finally { setBusy(false) }
  }
  useEffect(() => { setBusy(true); void reload().catch(e => setError(e instanceof Error ? e.message : uiText(adminMessages, '加载使用码失败'))).finally(() => setBusy(false)) }, [])
  useEffect(() => {
    const hide = () => { if (document.visibilityState !== 'visible') {setVisible({})} }
    document.addEventListener('visibilitychange', hide)
    return () => document.removeEventListener('visibilitychange', hide)
  }, [])
  useEffect(() => { if (!Object.keys(visible).length) {return}; const timer = setTimeout(() => setVisible({}), 60000); return () => clearTimeout(timer) }, [visible])
  useEffect(() => {
    if (!dirty) {return}
    const before = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', before); return () => window.removeEventListener('beforeunload', before)
  }, [dirty])
  function change(value: Partial<Draft>) { setDraft(d => d ? { ...d, ...value } : d); setDirty(true) }
  async function edit(code?: AccessCode) {
    if (dirty && !await confirmStudio(t('尚未保存使用码修改，确认放弃？'))) {return}
    setVisible({}); setDirty(false)
    setDraft(code ? { id: code.id, name: code.name, enabled: code.enabled, expiry: localDate(code.expiresAt), allowedModels: structuredClone(code.allowedModels), channelQuotas: Object.fromEntries(code.channelQuotas.map(item => [item.providerId, { ...item.quota }])) } : { name: '', enabled: true, expiry: '', allowedModels: [], channelQuotas: {} })
    // Provider settings may have changed above; refresh choices without touching the draft.
    void run(reload)
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!draft) {return}
    const value = draft
    await run(async () => {
      const body = { name: value.name, enabled: value.enabled, expiresAt: value.expiry ? new Date(value.expiry).getTime() : null, allowedModels: value.allowedModels, channelQuotas: [...new Set(value.allowedModels.map(item => item.providerId))].map(providerId => ({ providerId, quota: value.channelQuotas[providerId] ?? defaultQuota() })) }
      const result = await studioApi<{ accessCode: AccessCode; code?: string }>(value.id ? `/admin/access-codes/${value.id}` : '/admin/access-codes', { method: value.id ? 'PUT' : 'POST', body: JSON.stringify(body) })
      setDraft(null); setDirty(false); await reload(); await loadCatalog()
      if (result.code) {setVisible({ [result.accessCode.id]: result.code })}
      setNotice(value.id ? t('使用码授权与额度已更新，正在进行的请求已停止。') : t('使用码已创建。'))
    })
  }
  async function toggle(code: AccessCode) {
    if (code.enabled && !await confirmStudio(t('停用「{name}」后，现有登录和进行中的请求立即失效。确认停用？', { name: code.name }))) {return}
    await run(async () => {
      await studioApi(`/admin/access-codes/${code.id}`, { method: 'PUT', body: JSON.stringify({ enabled: !code.enabled }) })
      setVisible({}); await reload(); setNotice(code.enabled ? t('已停用使用码，相关会话已撤销。') : t('已启用使用码；用户需重新登录。'))
    })
  }
  async function reveal(code: AccessCode) {
    if (visible[code.id]) {setVisible(v => Object.fromEntries(Object.entries(v).filter(([id]) => id !== code.id))); return}
    await run(async () => { const result = await studioApi<{ code: string }>(`/admin/access-codes/${code.id}/secret`, { method: 'POST' }); setVisible(v => ({ ...v, [code.id]: result.code })) })
  }
  async function copy(code: AccessCode) {
    const secret = visible[code.id]; if (!secret) {return}
    try {
      if (navigator.clipboard?.writeText) {await navigator.clipboard.writeText(secret); setNotice(t('使用码已复制，请勿粘贴到公开位置。'))}
      else {
        const input = document.getElementById(`access-secret-${code.id}`) as HTMLInputElement | null
        input?.select(); setNotice(document.execCommand('copy') ? t('使用码已复制，请勿粘贴到公开位置。') : t('已选中使用码，请按 Ctrl+C 复制。'))
      }
    } catch { setError(t('浏览器不允许复制，请选中已显示的使用码手动复制。')) }
  }
  function selectModel(item: Allowed, checked: boolean) {
    if (!draft) {return}
    change({ allowedModels: checked ? [...draft.allowedModels.filter(value => keyOf(value) !== keyOf(item)), item] : draft.allowedModels.filter(value => keyOf(value) !== keyOf(item)) })
  }
  const available = providers.filter(p => p.enabled && p.models.length)
  return <section className="studio-sync studio-access" id="access-codes" aria-label={t('使用码管理')}>
    <div className="studio-usage-heading"><div><h2>{t('使用码管理')}</h2></div><div className="studio-code-actions"><button disabled={busy} onClick={() => void run(reload)}>{t('刷新使用码')}</button><button className="studio-primary" disabled={busy} onClick={() => void edit()}>{t('＋ 创建使用码')}</button></div></div>
    {error && <p className="studio-error" role="alert">{error}</p>}{notice && <p className="studio-success" role="status">{notice}</p>}
    {draft && <form className="studio-editor studio-code-editor" onSubmit={event => void save(event)}><h3>{draft.id ? t('编辑使用码') : t('创建独立使用码')}</h3><div className="studio-form-grid"><label className="studio-field">{t('使用码名称')}<input required maxLength={100} value={draft.name} onChange={e => change({ name: e.target.value })} placeholder={t('例如：设计组 / 小林')} /></label><label className="studio-field">{t('到期时间（当前浏览器时区）')}<input type="datetime-local" value={draft.expiry} onChange={e => change({ expiry: e.target.value })} /><small>{t('留空长期有效。')}</small></label></div>
      <h3>{t('允许的渠道与模型')}</h3>
      <div className="studio-channel-choices">{available.map(provider => <fieldset key={provider.id}><legend><label><input type="checkbox" checked={provider.models.every(m => draft.allowedModels.some(a => a.providerId === provider.id && a.modelId === m.id))} onChange={e => change({ allowedModels: [...draft.allowedModels.filter(a => a.providerId !== provider.id), ...(e.target.checked ? provider.models.map(m => ({ providerId: provider.id, modelId: m.id })) : [])] })} />{t('允许渠道：')}{provider.name}</label></legend>{provider.models.map(model => <label key={model.id}><input type="checkbox" checked={draft.allowedModels.some(a => a.providerId === provider.id && a.modelId === model.id)} onChange={e => selectModel({ providerId: provider.id, modelId: model.id }, e.target.checked)} />{model.name || model.id} <small>{model.id}</small></label>)}</fieldset>)}</div>
      {!available.length && <p className="studio-error">{t('请先在上方添加并启用至少一个渠道及模型，然后刷新使用码。')}</p>}
      {draft.allowedModels.some(a => !available.some(p => p.id === a.providerId && p.models.some(m => m.id === a.modelId))) && <p className="studio-hint">{t('含已删除或停用的授权项。')}<button type="button" onClick={() => change({ allowedModels: draft.allowedModels.filter(a => available.some(p => p.id === a.providerId && p.models.some(m => m.id === a.modelId))) })}>{t('移除不可用授权项')}</button></p>}
      {[...new Set(draft.allowedModels.map(item => item.providerId))].map(providerId => <QuotaEditor key={providerId} channel={providers.find(p => p.id === providerId)?.name || t('已删除渠道')} value={draft.channelQuotas[providerId] ?? defaultQuota()} onChange={quota => change({ channelQuotas: { ...draft.channelQuotas, [providerId]: quota } })} />)}
      <label className="studio-checkbox"><input type="checkbox" checked={draft.enabled} onChange={e => change({ enabled: e.target.checked })} />{t('启用此使用码')}</label><div className="studio-code-actions"><button className="studio-primary" disabled={busy || !draft.allowedModels.length}>{busy ? t('保存中…') : t('保存使用码')}</button><button type="button" disabled={busy} onClick={() => { void (async () => { if (!dirty || await confirmStudio(t('确认放弃尚未保存的使用码修改？'))) {setDraft(null); setDirty(false)} })() }}>{t('取消编辑')}</button></div>
    </form>}
    <div className="studio-usage-grid">{codes.map(code => { const expired = code.expiresAt !== null && code.expiresAt <= Date.now(); return <article className="studio-usage-card studio-code-card" key={code.id}><header><strong>{code.name}</strong><span className={`studio-badge ${code.enabled && !expired ? 'is-on' : ''}`}>{!code.enabled ? t('已停用') : expired ? t('已过期') : t('已启用')}</span></header><p className="studio-hint">{code.expiresAt ? t('到期 {date}', { date: new Date(code.expiresAt).toLocaleString(useSettings.getState().locale) }) : t('长期有效')}</p><div className="studio-code-secret">{visible[code.id] ? <input id={`access-secret-${code.id}`} aria-label={t('{name} 的使用码明文', { name: code.name })} readOnly value={visible[code.id]} onFocus={e => e.target.select()} /> : <span aria-label={t('使用码已隐藏')}>••••••••••••••••</span>}<div className="studio-code-actions"><button disabled={busy} onClick={() => void reveal(code)}>{visible[code.id] ? t('隐藏使用码') : t('显示使用码')}</button>{visible[code.id] && <button onClick={() => void copy(code)}>{t('复制')}</button>}</div></div><p className="studio-hint">{t('获准渠道：{channels} · {count} 个模型', { channels: [...new Set(code.allowedModels.map(a => providers.find(p => p.id === a.providerId)?.name || t('已删除渠道')))].join(t('、')), count: code.allowedModels.length })}</p>{code.usage.providers.map(channel => <section className="studio-code-channel-usage" key={channel.providerId}><strong>{channel.name}</strong>{!channel.available && <small>{t(' · 渠道不可用')}</small>}<UsageMeters usage={channel} /></section>)}<div className="studio-code-actions"><button disabled={busy} onClick={() => void edit(code)}>{t('编辑授权与额度')}</button><button className={code.enabled ? 'studio-danger-text' : ''} disabled={busy} onClick={() => void toggle(code)}>{code.enabled ? t('停用') : t('启用')}</button></div></article> })}</div>
    {!codes.length && !busy && <p className="studio-hint">{t('暂无使用码。')}</p>}
  </section>
}
