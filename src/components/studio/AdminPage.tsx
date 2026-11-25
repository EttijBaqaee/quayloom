import { AppearanceControls } from '../settings/AppearanceControls.js'
import { useUiText } from '../../i18n/ui.js'
import { adminMessages } from '../../i18n/admin.en.js'
import { appPath } from '../../services/paths.js'
import { useEffect, useState, type FormEvent } from 'react'
import { defaultQuota, emptyCapabilities, loadCatalog, logout, newModel, studioApi, type ModelSelection, type Preset, type Provider, type ProviderList, type StudioModel } from '../../services/studio.js'
import { confirmStudio } from './confirm.js'
import { REASONING_EFFORTS, type ReasoningEffort } from '../../services/api/types.js'
import { getSupportedReasoningEfforts, resolveReasoningEffort } from '../../services/settings.js'
import { HarborMark } from '../base/HarborMark.js'
import { HistorySyncPanel } from './HistorySyncPanel.js'
import { AccessCodesPanel } from './AccessCodesPanel.js'
import { NotificationsButton } from './Notifications.js'
import { QuotaEditor, UsagePanel } from './QuotaPanel.js'
import { UsageAnalytics } from './UsageAnalytics.js'

const fallbackPresets: Preset[] = [
  { id: 'deepseek', name: 'DeepSeek', type: 'deepseek', baseUrl: 'https://api.deepseek.com', models: [newModel('deepseek-flash')] },
  { id: 'openai', name: 'OpenAI', type: 'openai', baseUrl: 'https://api.openai.com/v1', models: [newModel('gpt-4.1-mini')] },
  { id: 'anthropic', name: 'Anthropic', type: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', models: [newModel('claude-sonnet-4-5')] },
  { id: 'openrouter', name: 'OpenRouter', type: 'openai', baseUrl: 'https://openrouter.ai/api/v1', models: [] },
  { id: 'ollama', name: 'Ollama', type: 'openai', baseUrl: 'http://127.0.0.1:11434/v1', models: [] },
  { id: 'custom', name: '自定义', type: 'openai', baseUrl: '', models: [] },
]
const capLabels = { thinking: '深度思考', search: '联网搜索', files: '文档附件', vision: '图片理解', speech: '语音' } as const
const effortLabels: Record<ReasoningEffort, string> = { minimal: '极低 (minimal)', low: '低 (low)', medium: '中 (medium)', high: '高 (high)', xhigh: '极高 (xhigh)', max: '最大 (max)' }

type DiscoveredModel = { id: string; name: string; contextWindowTokens?: number }
type Draft = Omit<Provider, 'id' | 'hasApiKey'> & { id?: string; hasApiKey?: boolean; apiKey: string; clearApiKey: boolean }
function draftFor(preset: Preset): Draft { return { quota: defaultQuota(), name: preset.id === 'custom' ? '' : preset.name, type: preset.type, baseUrl: preset.baseUrl, enabled: true, allowPrivateNetwork: false, models: structuredClone(preset.models), apiKey: '', clearApiKey: false } }

export function AdminPage() {
  const t = useUiText(adminMessages)
  const [data, setData] = useState<ProviderList>({ providers: [], defaultModel: null, presets: [] })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [discovered, setDiscovered] = useState<DiscoveredModel[]>([])
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const presets = fallbackPresets.map(p => data.presets.find(item => item.id === p.id) ?? p)
  async function reload() { const next = await studioApi<ProviderList>('/admin/providers'); setData(next); await loadCatalog(); return next }
  useEffect(() => { void reload().catch(e => setError(e.message)).finally(() => setLoading(false)) }, [])
  async function run(action: () => Promise<void>) {
    if (busy) {return}
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : t('操作失败')) } finally { setBusy(false) }
  }
  async function switchDraft(next: Draft | null) {
    if (dirty && !await confirmStudio(t('当前供应商有未保存修改，确定放弃这些修改？'))) {return}
    setDraft(next); setDirty(false); setDiscovered([]); setChosen(new Set()); setNotice(''); setError('')
  }
  function patch(value: Partial<Draft>) { setDraft(d => d ? { ...d, ...value } : d); setDirty(true) }
  function changeProviderType(type: Provider['type']) {
    if (!draft) {return}
    patch({ type, models: draft.models.map(m => {
      const capabilities = { ...m.capabilities, search: false, ...(type !== 'deepseek' ? { speech: false } : {}), ...(type === 'openai' ? { files: false } : {}) }
      if (type === 'anthropic') {return { ...m, capabilities, searchAdapter: undefined, openaiProtocol: undefined, reasoningEfforts: undefined, reasoningEffort: undefined }}
      const supported = getSupportedReasoningEfforts(m.reasoningEfforts, type)
      const reasoningEfforts = m.reasoningEfforts !== undefined && supported.length ? supported : undefined
      return { ...m, capabilities, searchAdapter: undefined, openaiProtocol: type === 'openai' ? m.openaiProtocol : undefined, reasoningEfforts, reasoningEffort: resolveReasoningEffort(m.reasoningEffort, '', reasoningEfforts, type) }
    }) })
  }
  function updateModel(index: number, value: Partial<StudioModel>) {
    const current = draft?.models[index]
    if (!draft || !current) {return}
    const next = { ...current, ...value }
    if (draft.type === 'openai' && next.openaiProtocol !== 'responses') {
      next.searchAdapter = undefined
      next.capabilities = { ...next.capabilities, search: false }
    }
    if (draft.type !== 'anthropic') {
      const supported = getSupportedReasoningEfforts(next.reasoningEfforts, draft.type)
      if (!supported.length) { setError(t('请至少选择一种供应商实际支持的思考强度。')); return }
      if (next.reasoningEffort && !supported.includes(next.reasoningEffort)) {next.reasoningEffort = undefined}
    }
    patch({ models: draft.models.map((m, i) => i === index ? next : m) })
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!draft) {return}
    if (new Set(draft.models.map(m => m.id.trim())).size !== draft.models.length) { setError(t('模型 ID 不能重复。')); return }
    if (draft.type !== 'anthropic') {
      for (const model of draft.models) {
        const supported = getSupportedReasoningEfforts(model.reasoningEfforts, draft.type)
        if (!supported.length) { setError(t('模型「{model}」须至少选择一种支持的思考强度。', { model: model.name || model.id })); return }
        if (model.reasoningEffort && !supported.includes(model.reasoningEffort)) { setError(t('模型「{model}」的默认强度不在支持列表内，请重新选择。', { model: model.name || model.id })); return }
      }
    }
    await run(async () => {
      const { id, hasApiKey, ...body } = draft
      void hasApiKey
      const payload = { ...body, name: body.name.trim(), baseUrl: body.baseUrl.trim(), models: body.models.map(m => {
        const { openaiProtocol, reasoningEfforts, reasoningEffort, ...model } = m
        return { ...model, ...(body.type !== 'anthropic' ? { reasoningEfforts: reasoningEfforts === undefined ? undefined : getSupportedReasoningEfforts(reasoningEfforts, body.type), reasoningEffort } : {}), ...(body.type === 'openai' ? { openaiProtocol } : {}), id: m.id.trim(), name: m.name.trim() || m.id.trim() }
      }), ...(body.apiKey.trim() ? { apiKey: body.apiKey.trim() } : { apiKey: undefined }) }
      const result = await studioApi<{ provider: Provider }>(`/admin/providers${id ? `/${encodeURIComponent(id)}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) })
      setDraft({ ...result.provider, apiKey: '', clearApiKey: false }); setDirty(false); await reload(); setNotice(t('供应商已保存。'))
    })
  }
  async function remove(p: Provider) {
    if (dirty && !await confirmStudio(t('当前表单有未保存修改，删除操作会重新加载供应商。继续？'))) {return}
    if (!await confirmStudio(t('确认删除「{provider}」及其模型配置？聊天历史不会被删除。', { provider: p.name }))) {return}
    await run(async () => { await studioApi(`/admin/providers/${encodeURIComponent(p.id)}`, { method: 'DELETE' }); if (draft?.id === p.id) { setDraft(null); setDirty(false) } await reload(); setNotice(t('供应商已删除。')) })
  }
  function defaultIs(providerId: string, modelId: string) { return data.defaultModel?.providerId === providerId && data.defaultModel.modelId === modelId }
  async function setDefault(selection: ModelSelection) { await run(async () => { await studioApi('/admin/default-model', { method: 'PUT', body: JSON.stringify(selection) }); await reload(); setNotice(t('默认模型已更新。')) }) }
  useEffect(() => {
    if (!dirty) {return}
    const before = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', before); return () => window.removeEventListener('beforeunload', before)
  }, [dirty])

  return <div className="studio-admin">
    <header className="studio-admin-header"><a href={appPath('/')} className="studio-brand harbor-brand" aria-label={t('Quayloom 多供应商 AI 工作台首页')}><HarborMark />Quayloom <span>{t('多供应商 AI 工作台')}</span></a><nav><AppearanceControls /><NotificationsButton /><a href={appPath('/api/source.zip')} download>{t('源码 · AGPL-3.0')}</a><a href={appPath('/')}>{t('← 返回聊天')}</a><button className="studio-quiet" onClick={() => void logout().catch(e => setError(e.message))}>{t('退出登录')}</button></nav></header>
    <main className="studio-admin-main">
      <div className="studio-page-title"><div><h1>{t('模型管理')}</h1></div><button className="studio-primary" disabled={busy || loading} onClick={() => switchDraft(draftFor(presets[0]))}>{t('＋ 添加供应商')}</button></div>
      {error && <div className="studio-banner studio-error" role="alert">{error}</div>}{notice && <div className="studio-banner studio-success" role="status">{notice}</div>}
      <div className="studio-admin-grid">
        <aside className="studio-provider-list"><div className="studio-section-title">{t('供应商')} <span>{data.providers.length}</span><button disabled={busy} className="studio-quiet" onClick={() => void run(async () => { await reload(); setNotice(t('已刷新配置。')) })}>{t('刷新')}</button></div>
          {loading ? <p role="status">{t('正在加载…')}</p> : !data.providers.length ? <div className="studio-empty">{t('暂无供应商。')}</div> : data.providers.map(p => <article key={p.id} className={`studio-provider-card ${draft?.id === p.id ? 'is-selected' : ''}`}>
            <button className="studio-provider-open" disabled={busy} onClick={() => switchDraft({ ...structuredClone(p), apiKey: '', clearApiKey: false })}><strong>{p.name}</strong><span className={`studio-badge ${p.enabled ? 'is-on' : ''}`}>{p.enabled ? t('已启用') : t('已停用')}</span><small>{t('{type} · {count} 个模型 · 渠道并发 {concurrency} · {keyStatus}', { type: p.type, count: p.models.length, concurrency: p.quota?.concurrencyLimit ?? 4, keyStatus: p.hasApiKey ? t('•••• 已设密钥') : t('未设密钥') })}</small><small className="studio-url">{p.baseUrl}</small></button>
            <button className="studio-danger-text" disabled={busy} onClick={() => void remove(p)}>{t('删除')}</button>
          </article>)}
        </aside>
        <section className="studio-editor">
          {!draft ? <div className="studio-empty studio-empty-large"><h2>{t('供应商配置')}</h2><p>{t('请选择供应商。')}</p><button onClick={() => switchDraft(draftFor(presets[0]))}>{t('添加供应商')}</button></div> : <form onSubmit={save}>
            <div className="studio-editor-heading"><h2>{draft.id ? t('编辑供应商') : t('添加供应商')}{dirty && <small>{t(' · 未保存')}</small>}</h2><button type="button" className="studio-quiet" disabled={busy} onClick={() => switchDraft(null)}>{t('关闭')}</button></div>
            {!draft.id && <label className="studio-field">{t('快速预设')}<select defaultValue="deepseek" disabled={busy} onChange={e => { const p = presets.find(p => p.id === e.target.value); if (p) { patch(draftFor(p)); setDiscovered([]) } }}>{presets.map(p => <option key={p.id} value={p.id}>{p.id === 'custom' ? t('自定义') : p.name}</option>)}</select></label>}
            <fieldset disabled={busy}><div className="studio-form-grid">
              <label className="studio-field">{t('供应商名称')}<input required maxLength={100} value={draft.name} onChange={e => patch({ name: e.target.value })} placeholder={t('例如：我的模型服务')} /></label>
              <label className="studio-field">{t('API 协议')}<select value={draft.type} onChange={e => changeProviderType(e.target.value as Provider['type'])}><option value="deepseek">{t('DeepSeek 原生扩展')}</option><option value="openai">{t('OpenAI 兼容')}</option><option value="anthropic">{t('Anthropic 原生')}</option></select></label>
              <label className="studio-field studio-wide">Base URL<input required type="url" value={draft.baseUrl} onChange={e => patch({ baseUrl: e.target.value })} placeholder="https://api.example.com/v1" /><small>{t('填写 API 基地址；不包含 /chat/completions、/responses 或 /messages。')}</small></label>
              <label className="studio-field studio-wide">API Key <span className="studio-muted">{draft.hasApiKey ? t('•••••••• · 服务器已保存') : t('未设置（Ollama 等本地服务可留空）')}</span><input type="password" autoComplete="new-password" value={draft.apiKey} disabled={draft.clearApiKey} onChange={e => patch({ apiKey: e.target.value })} placeholder={draft.hasApiKey ? t('留空保留原密钥；输入新值替换') : t('输入供应商密钥，仅用于服务器请求')} /></label>
            </div>
            <div className="studio-checks"><label><input type="checkbox" checked={draft.enabled} onChange={e => patch({ enabled: e.target.checked })} />{t('启用此供应商')}</label>{draft.hasApiKey && <label><input type="checkbox" checked={draft.clearApiKey} onChange={e => patch({ clearApiKey: e.target.checked, apiKey: '' })} />{t('明确清除服务器密钥')}</label>}</div>
            <label className="studio-private"><input type="checkbox" checked={draft.allowPrivateNetwork} onChange={e => patch({ allowPrivateNetwork: e.target.checked })} /><span><strong>{t('允许访问私有网络（显式授权）')}</strong><small>{t('将允许服务器访问内网，仅在信任该服务时开启。')}</small></span></label>
            <QuotaEditor value={draft.quota ?? defaultQuota()} onChange={quota => patch({ quota })} />
            <div className="studio-model-heading"><div><h3>{t('模型配置')} <span>{draft.models.length}</span></h3></div><button type="button" onClick={() => patch({ models: [...draft.models, newModel()] })}>{t('＋ 手动添加')}</button></div>
            {draft.models.map((m, index) => <article className="studio-model-card" key={index}>
              <div className="studio-model-row"><label className="studio-field">{t('模型 ID')}<input required value={m.id} onChange={e => updateModel(index, { id: e.target.value })} placeholder={t('供应商真实模型 ID')} /></label><label className="studio-field">{t('显示名称')}<input value={m.name} onChange={e => updateModel(index, { name: e.target.value })} placeholder={t('可留空')} /></label><button type="button" className="studio-danger-text" aria-label={t('移除模型 {model}', { model: m.name || m.id || index + 1 })} onClick={() => patch({ models: draft.models.filter((_, i) => i !== index) })}>{t('移除')}</button></div>
              <div className="studio-model-row"><label className="studio-field">{t('最大输出 Tokens')}<input required type="number" min={m.capabilities.thinking && draft.type === 'anthropic' ? 1025 : 256} max={200000} step={1} value={m.maxOutputTokens} onChange={e => updateModel(index, { maxOutputTokens: Number(e.target.value) })} /></label><label className="studio-field">{t('上下文窗口 Tokens（可选）')}<input type="number" min={1} max={1000000000} step={1} value={m.contextWindowTokens ?? ''} placeholder={t('留空表示未知')} onChange={e => updateModel(index, { contextWindowTokens: e.target.value === '' ? null : Number(e.target.value) })} /></label>{draft.type !== 'anthropic' && <label className="studio-field">{t('默认思考强度')}<select aria-label={t('模型 {model} 默认思考强度', { model: m.id || index + 1 })} value={resolveReasoningEffort(m.reasoningEffort, '', m.reasoningEfforts, draft.type) ?? ''} disabled={!m.capabilities.thinking} onChange={e => updateModel(index, { reasoningEffort: (e.target.value || undefined) as StudioModel['reasoningEffort'] })}><option value="">{t('供应商默认（不指定）')}</option>{getSupportedReasoningEfforts(m.reasoningEfforts, draft.type).map(effort => <option key={effort} value={effort}>{t(effortLabels[effort])}</option>)}</select></label>}</div>
              {draft.type !== 'anthropic' && <>
                {draft.type === 'openai' && <label className="studio-field">{t('OpenAI 模型协议')}<select aria-label={t('模型 {model} OpenAI 协议', { model: m.id || index + 1 })} value={m.openaiProtocol ?? 'chat-completions'} onChange={e => updateModel(index, { openaiProtocol: e.target.value as StudioModel['openaiProtocol'] })}><option value="chat-completions">Chat Completions</option><option value="responses">Responses</option></select></label>}
                <div className="studio-field"><span>{t('支持的思考强度')}</span><div className="studio-checks" role="group" aria-label={t('模型 {model} 支持的思考强度', { model: m.id || index + 1 })}>
                  {getSupportedReasoningEfforts(REASONING_EFFORTS, draft.type).map(effort => {
                    const supported = getSupportedReasoningEfforts(m.reasoningEfforts, draft.type)
                    const checked = supported.includes(effort)
                    return <label key={effort}><input type="checkbox" aria-label={t('模型 {model} 支持思考强度 {effort}', { model: m.id || index + 1, effort })} checked={checked} disabled={checked && supported.length === 1} onChange={e => updateModel(index, { reasoningEfforts: e.target.checked ? getSupportedReasoningEfforts(REASONING_EFFORTS, draft.type).filter(value => value === effort || supported.includes(value)) : supported.filter(value => value !== effort) })} />{t(effortLabels[effort])}</label>
                  })}
                </div><small>{t('仅勾选当前渠道实际支持的值。')}</small></div>
              </>}
              {draft.type !== 'deepseek' && <label className="studio-field">{t('原生联网搜索')}<select aria-label={t('模型 {model} 搜索协议', { model: m.id || index + 1 })} value={m.searchAdapter ?? ''} disabled={draft.type === 'openai' && m.openaiProtocol !== 'responses'} onChange={e => updateModel(index, { searchAdapter: (e.target.value || undefined) as StudioModel['searchAdapter'], capabilities: { ...m.capabilities, search: false } })}><option value="">{t('未配置')}</option>{draft.type === 'openai' ? <option value="openai-web-search">OpenAI Responses · web_search</option> : <option value="anthropic-web-search">Anthropic · web_search_20250305</option>}</select><small>{draft.type === 'openai' && m.openaiProtocol !== 'responses' ? t('需先选择 Responses 协议。') : t('仅在渠道实际支持时启用；搜索可能另计费。')}</small></label>}
              <div className="studio-checks">{(Object.keys(capLabels) as (keyof typeof capLabels)[]).map(cap => {
                const blocked = cap === 'search' ? !(draft.type === 'deepseek' || draft.type === 'openai' && m.openaiProtocol === 'responses' && m.searchAdapter === 'openai-web-search' || draft.type === 'anthropic' && m.searchAdapter === 'anthropic-web-search') : cap === 'speech' ? draft.type !== 'deepseek' : cap === 'files' && draft.type === 'openai'
                return <label key={cap} title={blocked ? t('当前协议适配器不支持') : t('仅在供应商真实支持时开启')}><input type="checkbox" disabled={blocked} checked={!blocked && m.capabilities[cap]} onChange={e => updateModel(index, { capabilities: { ...m.capabilities, [cap]: e.target.checked } })} />{t(capLabels[cap])}</label>
              })}</div>
              {draft.id && data.providers.find(p => p.id === draft.id)?.models.some(saved => saved.id === m.id) && <button type="button" disabled={dirty || !draft.enabled || defaultIs(draft.id, m.id)} onClick={() => void setDefault({ providerId: (draft.id ?? ''), modelId: m.id })}>{defaultIs(draft.id, m.id) ? t('✓ 当前默认模型') : t('设为默认模型')}</button>}
            </article>)}
            </fieldset>
            <div className="studio-form-actions"><button className="studio-primary" disabled={busy}>{busy ? t('处理中…') : t('保存配置')}</button><button type="button" disabled={busy || !draft.id || dirty} title={dirty || !draft.id ? t('请先保存配置') : t('仅测试模型列表')} onClick={() => void run(async () => { const r = await studioApi<{ latencyMs: number; models: string[] }>(`/admin/providers/${encodeURIComponent((draft.id ?? ''))}/test`, { method: 'POST' }); setNotice(t('模型列表可访问 · {latency} ms · 返回 {count} 个模型。', { latency: r.latencyMs, count: r.models.length })) })}>{t('连接测试')}</button><button type="button" disabled={busy || !draft.id || dirty} title={t('请先保存配置')} onClick={() => void run(async () => { const r = await studioApi<{ models: DiscoveredModel[] }>(`/admin/providers/${encodeURIComponent((draft.id ?? ''))}/discover`, { method: 'POST' }); setDiscovered(r.models); setChosen(new Set()); setNotice(t('发现 {count} 个模型。', { count: r.models.length })) })}>{t('发现模型')}</button></div>
            {discovered.length > 0 && <section className="studio-discovered"><h3>{t('发现的模型')}</h3><input aria-label={t('筛选发现的模型')} placeholder={t('搜索模型 ID / 名称')} value={filter} onChange={e => setFilter(e.target.value)} /><div className="studio-discovered-list">{discovered.filter(m => `${m.id} ${m.name}`.toLowerCase().includes(filter.toLowerCase())).map(m => { const exists = draft.models.some(old => old.id === m.id); return <label key={m.id}><input type="checkbox" disabled={exists || busy} checked={exists || chosen.has(m.id)} onChange={e => setChosen(prev => { const next = new Set(prev); if (e.target.checked) {next.add(m.id);} else {next.delete(m.id);} return next })} /><span>{m.name || m.id}<small>{m.id}{exists ? t(' · 已添加') : ''}</small></span></label> })}</div><button type="button" disabled={busy || !chosen.size} onClick={() => { patch({ models: [...draft.models, ...discovered.filter(m => chosen.has(m.id) && !draft.models.some(old => old.id === m.id)).map(m => ({ ...newModel(m.id, m.name), ...(m.contextWindowTokens !== undefined ? { contextWindowTokens: m.contextWindowTokens } : {}), capabilities: emptyCapabilities() }))] }); setChosen(new Set()) }}>{t('添加所选（{count}）', { count: chosen.size })}</button></section>}
          </form>}
        </section>
      </div>
      <UsageAnalytics />
      <UsagePanel />
      <AccessCodesPanel />
      <HistorySyncPanel />
      <footer className="studio-footer">{t('Quayloom · 管理员配置')}</footer>
    </main>
  </div>
}
