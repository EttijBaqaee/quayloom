import { useSettings } from '../../services/settings.js'
import { useUiText, uiText } from '../../i18n/ui.js'
import { adminMessages } from '../../i18n/admin.en.js'
import { useEffect, useState } from 'react'
import { defaultQuota, studioApi, type Quota } from '../../services/studio.js'

const fields = [
  ['dailyRequestLimit', '每日请求次数'],
  ['dailyTokenLimit', '每日 Token 上限'],
  ['totalTokenLimit', '累计 Token 上限'],
  ['concurrencyLimit', '渠道并发上限'],
] as const
export function QuotaEditor({ value, onChange, channel }: { value: Quota; onChange: (quota: Quota) => void; channel?: string }) {
  const t = useUiText(adminMessages)
  return <section className="studio-quota-editor"><h3>{channel ? t('{channel} · 此码独立额度', { channel }) : t('渠道并发与配额')}</h3><div className="studio-form-grid">
    {fields.map(([key, label]) => <label key={key} className="studio-field">{t(label)}<input type="number" min={1} max={key === 'concurrencyLimit' ? 32 : 1000000000000} step={1} required={key === 'concurrencyLimit'} value={value[key] ?? ''} placeholder={key === 'concurrencyLimit' ? '4' : t('不限')} onChange={e => onChange({ ...value, [key]: e.target.value === '' ? (key === 'concurrencyLimit' ? 4 : null) : Number(e.target.value) })} /></label>)}
  </div></section>
}
type Usage = { date: string; timeZone: string; providers: { providerId: string; quota: Quota; daily: { requests: number; tokens: number; reservedTokens: number }; total: { requests: number; tokens: number; reservedTokens: number }; activeRequests: number }[] }
function count(value: number) { return value.toLocaleString(useSettings.getState().locale) }
function Meter({ label, used, reserved = 0, limit }: { label: string; used: number; reserved?: number; limit: number | null }) {
  const t = useUiText(adminMessages)
  const percent = limit ? Math.min(100, ((used + reserved) / limit) * 100) : 0
  return <div className="studio-meter"><div><span>{label}</span><strong>{count(used)} <small>/ {limit == null ? t('不限') : count(limit)}</small></strong></div><div className="studio-meter-track"><i style={{ width: `${percent}%`, background: percent >= 90 ? '#ce8b35' : '#4d6bfe' }} /></div>{reserved > 0 && <small>{t('进行中预留 {count} Tokens', { count: count(reserved) })}</small>}</div>
}
export type PrincipalUsage = { quota: Quota; daily: { requests: number; tokens: number; reservedTokens: number }; total: { requests: number; tokens: number; reservedTokens: number }; activeRequests: number }
export function UsageMeters({ usage }: { usage: PrincipalUsage }) {
  const t = useUiText(adminMessages)
  return <><Meter label={t('今日请求')} used={usage.daily.requests} limit={usage.quota.dailyRequestLimit} /><Meter label={t('今日 Tokens')} used={usage.daily.tokens} reserved={usage.daily.reservedTokens} limit={usage.quota.dailyTokenLimit} /><Meter label={t('累计 Tokens')} used={usage.total.tokens} reserved={usage.total.reservedTokens} limit={usage.quota.totalTokenLimit} /><small>{t('并发 {active} / {limit} · 累计请求 {count}', { active: usage.activeRequests, limit: usage.quota.concurrencyLimit, count: count(usage.total.requests) })}</small></>
}
export type CodeUsage = { date: string; timeZone: string; providers: (PrincipalUsage & { providerId: string; name: string; available: boolean })[] }
export function MyUsagePanel() {
  const t = useUiText(adminMessages)
  const [usage, setUsage] = useState<(CodeUsage & { name: string; expiresAt: number | null }) | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function refresh() {
    setBusy(true); setError('')
    try { setUsage(await studioApi('/me/usage')) } catch (e) { setError(e instanceof Error ? e.message : uiText(adminMessages, '无法加载额度')) } finally { setBusy(false) }
  }
  useEffect(() => { void refresh() }, [])
  return <section className="studio-sync studio-my-usage" aria-label={t('我的额度')}><div className="studio-usage-heading"><h2>{t('我的额度')}</h2><button disabled={busy} onClick={() => void refresh()}>{busy ? t('刷新中…') : t('刷新额度')}</button></div>{error && <p className="studio-error" role="alert">{error}</p>}{usage && <><p>{usage.name} · {usage.expiresAt ? t('到期：{date}', { date: new Date(usage.expiresAt).toLocaleString(useSettings.getState().locale) }) : t('长期有效')} · {usage.date} ({usage.timeZone})</p><div className="studio-usage-grid">{usage.providers.map(channel => <article className="studio-usage-card" key={channel.providerId}><header><strong>{channel.name}</strong><span className="studio-badge">{channel.available ? t('已授权') : t('渠道不可用')}</span></header><UsageMeters usage={channel} /></article>)}</div></>}</section>
}
export function UsagePanel() {
  const t = useUiText(adminMessages)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function refresh() {
    setBusy(true); setError('')
    try {
      const [result, catalog] = await Promise.all([studioApi<Usage>('/admin/usage'), studioApi<{ providers: { id: string; name: string }[] }>('/admin/providers')])
      setUsage(result); setNames(Object.fromEntries(catalog.providers.map(p => [p.id, p.name])))
    } catch (e) { setError(e instanceof Error ? e.message : uiText(adminMessages, '无法加载用量')) } finally { setBusy(false) }
  }
  useEffect(() => { void refresh() }, [])
  return <section className="studio-sync studio-usage"><div className="studio-usage-heading"><div><h2>{t('本地用量')}</h2></div><button disabled={busy} onClick={() => void refresh()}>{busy ? t('刷新中…') : t('刷新用量')}</button></div>
    {error && <p className="studio-error" role="alert">{error}</p>}{usage && <><small>{t('统计日期：{date} · {timeZone} · 手动刷新', { date: usage.date, timeZone: usage.timeZone })}</small><div className="studio-usage-grid">{usage.providers.map(p => { const q = p.quota ?? defaultQuota(); return <article key={p.providerId} className="studio-usage-card"><header><strong>{names[p.providerId] || p.providerId}</strong><span className="studio-badge">{t('并发 {active} / {limit}', { active: p.activeRequests, limit: q.concurrencyLimit })}</span></header><Meter label={t('今日请求')} used={p.daily.requests} limit={q.dailyRequestLimit} /><Meter label={t('今日 Tokens')} used={p.daily.tokens} reserved={p.daily.reservedTokens} limit={q.dailyTokenLimit} /><Meter label={t('累计 Tokens')} used={p.total.tokens} reserved={p.total.reservedTokens} limit={q.totalTokenLimit} /><small>{t('累计请求 {count}', { count: count(p.total.requests) })}</small></article> })}</div>{!usage.providers.length && <p>{t('暂无供应商用量。')}</p>}</>}
  </section>
}
