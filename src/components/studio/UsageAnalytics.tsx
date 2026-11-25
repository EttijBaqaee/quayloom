// SPDX-License-Identifier: AGPL-3.0-only
import './usageAnalyticsCards.css'
import { useSettings } from '../../services/settings.js'
import { useUiText } from '../../i18n/ui.js'
import { adminMessages } from '../../i18n/admin.en.js'
import { useId, useState, type CSSProperties, type FormEvent } from 'react'
import { useStudio } from '../../services/studio.js'
import { useUsageAnalytics, type ActualUsage, type AnalyticsGroup, type AnalyticsQuery, type UsageAnalyticsResponse, type UsageMeasure, type UsageSummary } from '../../services/studio/analytics.js'

const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 12, minWidth: 0 }
const card: CSSProperties = { minWidth: 0, padding: 12, border: '1px solid #8885', borderRadius: 10, overflowWrap: 'anywhere' }
const control: CSSProperties = { boxSizing: 'border-box', minWidth: 0, width: '100%', maxWidth: '100%', padding: '8px 10px', border: '1px solid #8887', borderRadius: 7, background: 'transparent', color: 'inherit', font: 'inherit' }
const button: CSSProperties = { ...control, width: 'auto', cursor: 'pointer' }
const muted: CSSProperties = { opacity: 0.7, fontSize: 12, margin: '6px 0' }
const count = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString(useSettings.getState().locale) : '—'
const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toLocaleString(useSettings.getState().locale, { maximumFractionDigits: 1 })}%`
const day = (time: number) => new Date(time + 8 * 3600000).toISOString().slice(0, 10)
const time = (value: number) => new Date(value).toLocaleString(useSettings.getState().locale, { timeZone: 'Asia/Shanghai', hour12: false })
const status = { done: '成功', error: '失败', interrupted: '中断', running: '运行中快照', unknown: '状态未知' }
const label = (id: string | null | undefined, name: string | undefined, unknown: string) => !id ? unknown : name ? `${name} · ${id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id}` : id
function displayLabel(t: ReturnType<typeof useUiText>, filters: UsageAnalyticsResponse['filters'], kind: 'providers' | 'models' | 'owners', id: string | null | undefined, providerId?: string | null) {
  const item = kind === 'models' ? filters.models.find(model => model.id === id && model.providerId === providerId) : filters[kind].find(option => option.id === id)
  return label(id, item?.name, t('未知'))
}
function initialQuery(): AnalyticsQuery {
  return { range: '7', start: day(Date.now() - 6 * 86400000), end: day(Date.now()), providerId: '', modelId: '', owner: '', offset: 0 }
}
function Coverage({ value, terminal }: { value: UsageMeasure; terminal: number }) {
  const t = useUiText(adminMessages)
  return <><strong>{count(value.total)}</strong><p style={muted}>{t('已知 {known}/{terminal} · 缺失 {missing} · 覆盖 {coverage}', { known: value.known, terminal, missing: value.missing, coverage: percent(value.coverage) })}{value.overflow ? t(' · 总量超安全精度') : ''}</p></>
}
function UsageTotals({ actual }: { actual: ActualUsage }) {
  const t = useUiText(adminMessages)
  return <div style={grid}>
    {([['inputTokens', '真实输入 Token'], ['outputTokens', '真实输出 Token'], ['cacheReadTokens', '缓存读取 Token'], ['cacheCreationTokens', '缓存创建 Token']] as const).map(([key, label]) => <article key={key} style={card}><div>{t(label)}</div><Coverage value={actual[key]} terminal={actual.terminalRequests} /></article>)}
    <article style={card}><div>{t('加权缓存命中率')}</div><strong>{percent(actual.cacheHitRate.value)}</strong><p style={muted}>{t('配对 {known}/{terminal} · 缺失/无效 {missing}', { known: actual.cacheHitRate.known, terminal: actual.terminalRequests, missing: actual.cacheHitRate.missing })}</p><small>{t('读取 {read} / 输入 {input}', { read: count(actual.cacheHitRate.cacheReadTokens), input: count(actual.cacheHitRate.inputTokens) })}</small></article>
  </div>
}
function SummaryLine({ summary }: { summary: UsageSummary }) {
  const t = useUiText(adminMessages)
  return <p style={{ margin: '6px 0', fontSize: 13 }}>{t('请求 {requests} · 成功 {success} · 失败 {failed} · 中断 {interrupted} · 运行中快照 {running}', { requests: count(summary.requests), success: count(summary.success), failed: count(summary.failed), interrupted: count(summary.interrupted), running: count(summary.running) })}{summary.unknownStatus > 0 ? t(' · 状态未知 {count}', { count: count(summary.unknownStatus) }) : ''}</p>
}
function GroupCards({ groups, kind, filters }: { groups: AnalyticsGroup[]; kind: 'providers' | 'models' | 'owners'; filters: UsageAnalyticsResponse['filters'] }) {
  const t = useUiText(adminMessages)
  return <div style={grid}>{groups.map(group => {
    const name = kind === 'owners' ? displayLabel(t, filters, 'owners', group.owner) : kind === 'models' ? `${displayLabel(t, filters, 'providers', group.providerId)} / ${displayLabel(t, filters, 'models', group.modelId, group.providerId)}` : displayLabel(t, filters, 'providers', group.providerId)
    return <article style={card} key={JSON.stringify([group.owner, group.providerId, group.modelId])}><strong>{name}</strong><SummaryLine summary={group} /><p style={muted}>{t('输入 {input} / 输出 {output} · 缓存 {cache}', { input: count(group.actualUsage.inputTokens.total), output: count(group.actualUsage.outputTokens.total), cache: percent(group.actualUsage.cacheHitRate.value) })}</p><p style={muted}>{t('输入缺失 {input} · 输出缺失 {output} · 缓存读取缺失 {read} · 创建缺失 {creation}', { input: group.actualUsage.inputTokens.missing, output: group.actualUsage.outputTokens.missing, read: group.actualUsage.cacheReadTokens.missing, creation: group.actualUsage.cacheCreationTokens.missing })}</p></article>
  })}</div>
}
function JobUsageCard({ item, filters }: { item: UsageAnalyticsResponse['details']['items'][number]; filters: UsageAnalyticsResponse['filters'] }) {
  const t = useUiText(adminMessages)
  const model = filters.models.find(model => model.id === item.modelId && model.providerId === item.providerId)
  const knownStatus = Object.hasOwn(status, item.status) ? item.status : 'unknown'
  // Keep full identifiers available in the disclosure; only the primary model is abbreviated visually.
  const fullLabel = (id: string | null, name?: string) => !id ? t('未知') : name ? `${name} · ${id}` : id
  return <article className="ua-job-card">
    <header className="ua-job-heading">
      <strong className="ua-job-status" data-status={knownStatus}>{t(status[knownStatus])}</strong>
      <span className="ua-job-model" title={model?.name || item.modelId || t('未知')}>{model?.name || item.modelId || t('未知')}</span>
    </header>
    <p className="ua-job-time"><time>{time(item.startedAt)}</time>{t(' · 上海时间')}</p>
    <p className="ua-job-tokens"><span>{t('输入 {count}', { count: count(item.inputTokens) })}</span><span>{t('输出 {count}', { count: count(item.outputTokens) })}</span></p>
    {!item.actualUsageEligible && <p className="ua-job-note">{t('未进入终态，不计真实用量汇总')}</p>}
    <details className="ua-job-details">
      <summary>{t('身份、渠道与完整用量')}</summary>
      <dl>
        <div><dt>{t('模型')}</dt><dd>{fullLabel(item.modelId, model?.name)}</dd></div>
        <div><dt>{t('渠道')}</dt><dd>{fullLabel(item.providerId, filters.providers.find(provider => provider.id === item.providerId)?.name)}</dd></div>
        <div><dt>{t('使用码 / 管理员')}</dt><dd>{fullLabel(item.owner, filters.owners.find(owner => owner.id === item.owner)?.name)}</dd></div>
        <div><dt>{t('任务 ID')}</dt><dd>{item.id || t('未知')}</dd></div>
        <div><dt>{t('真实输入 Token')}</dt><dd>{count(item.inputTokens)}</dd></div>
        <div><dt>{t('真实输出 Token')}</dt><dd>{count(item.outputTokens)}</dd></div>
        <div><dt>{t('缓存读取 Token')}</dt><dd>{count(item.cacheReadTokens)}</dd></div>
        <div><dt>{t('缓存创建 Token')}</dt><dd>{count(item.cacheCreationTokens)}</dd></div>
      </dl>
    </details>
  </article>
}
/** Administrator-only independent view. Mount once in the administrator page. */
export function UsageAnalytics() {
  const principal = useStudio(state => state.principal)
  const authenticated = useStudio(state => state.authenticated)
  if (authenticated !== true || principal?.role !== 'admin') { return null }
  return <AnalyticsContent key={JSON.stringify([principal.id, principal.role])} />
}
function AnalyticsContent() {
  const t = useUiText(adminMessages)
  const heading = useId(), ownerList = useId()
  const [draft, setDraft] = useState(initialQuery)
  const [query, setQuery] = useState(initialQuery)
  const [kind, setKind] = useState<'providers' | 'models' | 'owners'>('providers')
  const { data, loading, error, refresh } = useUsageAnalytics(query)
  const maxRequests = Math.max(1, ...(data?.daily.map(item => item.requests) || []))
  const providers = data?.filters.providers || [], owners = data?.filters.owners || []
  const models = [...new Map((data?.filters.models || []).filter(item => !draft.providerId || item.providerId === draft.providerId).map(item => [item.id, item])).values()]
  function apply(event: FormEvent) { event.preventDefault(); setQuery({ ...draft, offset: 0 }); refresh() }
  return <section aria-labelledby={heading} aria-busy={loading} style={{ boxSizing: 'border-box', width: '100%', maxWidth: '100%', minWidth: 0, padding: 16, marginTop: 16, border: '1px solid #8885', borderRadius: 12, overflowWrap: 'anywhere', color: 'inherit' }}>
    <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><h2 id={heading} style={{ margin: 0, fontSize: 18 }}>{t('用量分析')}</h2><button type="button" style={button} disabled={loading} onClick={refresh}>{loading ? t('加载中…') : t('刷新')}</button></header>
    <p style={muted}>{t('上海时间 · 仅统计留存任务；删除会话或替换历史会移除记录，不是完整账单。运行中为持久化快照，非实时。')}</p>
    <form onSubmit={apply} style={{ margin: '14px 0' }}>
      <div style={grid}>
        <label>{t('日期范围')}<select style={control} value={draft.range} onChange={event => setDraft({ ...draft, range: event.target.value as AnalyticsQuery['range'] })}><option value="7">{t('近 7 天（含今天）')}</option><option value="30">{t('近 30 天（含今天）')}</option><option value="custom">{t('自定义（最多 366 天）')}</option></select></label>
        {draft.range === 'custom' && <><label>{t('开始日期')}<input type="date" min="2000-01-01" max="2099-12-31" required style={control} value={draft.start} onChange={event => setDraft({ ...draft, start: event.target.value })} /></label><label>{t('结束日期')}<input type="date" min={draft.start || '2000-01-01'} max="2099-12-31" required style={control} value={draft.end} onChange={event => setDraft({ ...draft, end: event.target.value })} /></label></>}
        <label>{t('渠道')}<select style={control} value={draft.providerId} onChange={event => setDraft({ ...draft, providerId: event.target.value, modelId: '' })}><option value="">{t('全部渠道')}</option>{draft.providerId && !providers.some(item => item.id === draft.providerId) && <option value={draft.providerId}>{draft.providerId}</option>}{providers.map(item => <option key={item.id} value={item.id}>{label(item.id, item.name, t('未知'))}</option>)}</select></label>
        <label>{t('模型')}<select style={control} value={draft.modelId} onChange={event => setDraft({ ...draft, modelId: event.target.value })}><option value="">{t('全部模型')}</option>{draft.modelId && !models.some(item => item.id === draft.modelId) && <option value={draft.modelId}>{draft.modelId}</option>}{models.map(item => <option key={item.id} value={item.id}>{label(item.id, item.name, t('未知'))}</option>)}</select></label>
        <label>{t('使用码 / 管理员')}<input list={ownerList} style={control} value={draft.owner} placeholder={t('全部身份，或选择/输入身份 ID')} maxLength={256} onChange={event => setDraft({ ...draft, owner: event.target.value })} /><datalist id={ownerList}>{owners.map(item => <option key={item.id} value={item.id}>{label(item.id, item.name, t('未知'))}</option>)}</datalist></label>
      </div><button type="submit" style={{ ...button, marginTop: 10 }} disabled={loading}>{t('应用筛选')}</button>
    </form>
    {loading && <p role="status">{t('正在加载用量分析…')}</p>}
    {error && <p role="alert">{error} <button type="button" style={button} onClick={refresh}>{t('重试')}</button></p>}
    {data && <>
      <p style={muted}>{t('{start} 至 {end}（含首尾） · 快照 {time}', { start: data.range.start, end: data.range.end, time: time(data.generatedAt) })}</p>
      <SummaryLine summary={data.overview} />
      <p style={muted}>{t('以下真实用量仅含 {count} 个终态任务；— 表示未知。部分覆盖时显示已知小计，零不代表缺失。', { count: count(data.overview.actualUsage.terminalRequests) })}</p>
      <UsageTotals actual={data.overview.actualUsage} />
      {data.scope.undatedRetainedJobs > 0 && <p style={muted}>{t('另有 {count} 个留存任务无有效开始时间，无法归入日期范围，未计入（按当前身份过滤，不应用渠道/模型过滤）。', { count: count(data.scope.undatedRetainedJobs) })}</p>}
      <details style={{ marginTop: 16 }} open><summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t('按天趋势')}</summary><div style={{ ...grid, marginTop: 10 }}>{data.daily.map(item => <article key={item.date} style={card}><strong>{item.date}</strong><div role="img" aria-label={t('{date} 请求 {count}', { date: item.date, count: item.requests })} style={{ height: 5, margin: '8px 0', background: '#8883', borderRadius: 3 }}><div style={{ width: `${item.requests / maxRequests * 100}%`, height: '100%', background: '#4d6bfe', borderRadius: 3 }} /></div><SummaryLine summary={item} /><p style={muted}>{t('输入 {input} / 输出 {output} · 缓存 {cache}', { input: count(item.actualUsage.inputTokens.total), output: count(item.actualUsage.outputTokens.total), cache: percent(item.actualUsage.cacheHitRate.value) })}</p><p style={muted}>{t('输入缺失 {input} · 输出缺失 {output} · 缓存读取缺失 {read} · 创建缺失 {creation}', { input: item.actualUsage.inputTokens.missing, output: item.actualUsage.outputTokens.missing, read: item.actualUsage.cacheReadTokens.missing, creation: item.actualUsage.cacheCreationTokens.missing })}</p></article>)}</div></details>
      <section style={{ marginTop: 16 }} aria-label={t('用量分组')}><label>{t('分组方式')}<select style={{ ...control, margin: '8px 0' }} value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="providers">{t('按渠道')}</option><option value="models">{t('按渠道 / 模型')}</option><option value="owners">{t('按使用码 / 管理员')}</option></select></label><GroupCards groups={data.groups[kind]} kind={kind} filters={data.filters} />{!data.groups[kind].length && <p>{t('此范围暂无留存任务。')}</p>}</section>
      <section style={{ marginTop: 16 }} aria-label={t('任务用量明细')}><h3 style={{ fontSize: 16, marginBottom: 6 }}>{t('任务明细（共 {count} 条）', { count: count(data.details.total) })}</h3>
        <p style={muted}>{t('输入 / 输出单位为 Token；— 表示未知。展开可查看身份、完整 ID 和缓存用量。')}</p>
        <div className="ua-job-grid">{data.details.items.map(item => <JobUsageCard key={JSON.stringify([item.owner, item.id])} item={item} filters={data.filters} />)}</div>{!data.details.items.length && <p>{t('暂无明细。')}</p>}
        <nav aria-label={t('用量明细分页')} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 }}><button style={button} type="button" disabled={loading || query.offset === 0} onClick={() => setQuery({ ...query, offset: Math.max(0, query.offset - 25) })}>{t('上一页')}</button><span style={muted}>{t('第 {page} 页 · 每页 25 条', { page: Math.floor(query.offset / 25) + 1 })}</span><button style={button} type="button" disabled={loading || !data.details.hasMore} onClick={() => setQuery({ ...query, offset: query.offset + 25 })}>{t('下一页')}</button></nav>
      </section>
    </>}
  </section>
}
