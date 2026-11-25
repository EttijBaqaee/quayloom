// SPDX-License-Identifier: AGPL-3.0-only
import { useUiText, uiText } from '../../i18n/ui.js'
import { workspaceEn } from '../../i18n/workspace.en.js'
import { useSettings } from '../../services/settings.js'
import { Fragment, useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { useChatStatistics, type ChatRun } from '../../services/chat/statistics.js'
import './chatStatistics.css'

const t = (text: string, params?: Record<string, string | number>) => uiText(workspaceEn, text, params)

export type ChatStatisticsProps = { sessionId: string | null; ownerId?: string }
type Metric = 'speed' | 'cache' | 'context'
const known = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const count = (value: number | null | undefined) => known(value) ? value.toLocaleString(useSettings.getState().locale) : '—'
const percent = (value: number | null | undefined) => known(value) ? `${(value * 100).toLocaleString(useSettings.getState().locale, { maximumFractionDigits: 1 })}%` : '—'
const rate = (value: number | null | undefined) => known(value) ? `${value.toLocaleString(useSettings.getState().locale, { maximumFractionDigits: 1 })}tok/s` : '—'
const characterRate = (value: number | null | undefined) => known(value) ? t('{rate}字符/秒', { rate: value.toLocaleString(useSettings.getState().locale, { maximumFractionDigits: 1 }) }) : '—'
const outputSpeed = (run: ChatRun | undefined) => known(run?.outputTokensPerSecond) ? rate(run?.outputTokensPerSecond)
  : known(run?.outputCharactersPerSecond) ? characterRate(run?.outputCharactersPerSecond)
  : run?.status === 'running' ? known(run.firstTokenAt) || known(run.outputCharacters) && run.outputCharacters > 0 ? t('生成中') : t('等待输出') : t('速度 —')
const contextValue = (run: ChatRun | undefined) => known(run?.contextUsageRatio) ? percent(run?.contextUsageRatio)
  : known(run?.inputTokens) ? `${count(run?.inputTokens)} Token` : '—'
const contextStatus = (run: ChatRun) => [!known(run.contextWindowTokens) ? t('未配置窗口') : '',
  !known(run.inputTokens) ? run.status === 'running' ? t('等待上游用量') : t('未返回用量') : ''].filter(Boolean).join(' · ')
const duration = (value: number | null | undefined) => !known(value) ? '—' : value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toLocaleString(useSettings.getState().locale, { maximumFractionDigits: 2 })}s`
const time = (value: number | null | undefined) => known(value) && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString(useSettings.getState().locale) : '—'
const text = (value: string | undefined) => value || '—'
const triggerName: Record<ChatRun['trigger'], string> = { send: '发送', regenerate: '重新生成', continue: '继续生成' }
const statusName: Record<ChatRun['status'], string> = { running: '运行中', done: '已完成', stopped: '已停止', error: '出错' }
const totalTime = (run: ChatRun) => `${known(run.totalDurationMs) && (run.status === 'running' || !run.timingComplete) ? '≥ ' : ''}${duration(run.totalDurationMs)}`

function MetricIcon({ kind }: { kind: Exclude<Metric, 'context'> | 'refresh' }) {
  return <svg className="ql-stat-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'speed' ? <><path d="M4 17a9 9 0 1 1 16 0M12 12l5-5" /><circle cx="12" cy="12" r="1.6" /></>
      : kind === 'cache' ? <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 4 16 4 16 0V5M4 12v7c0 4 16 4 16 0v-7" /></>
      : <><path d="M20 7v5h-5M4 17v-5h5M5.5 8a7 7 0 0 1 11.7-2L20 9M4 15l2.8 3A7 7 0 0 0 18.5 16" /></>}
  </svg>
}

function ContextMeter({ ratio }: { ratio: number | null | undefined }) {
  // Clamp only the drawing. The adjacent percentage retains the real ratio,
  // including values above 100%; missing measurements never become zero.
  const progress = known(ratio) ? Math.min(1, Math.max(0, ratio)) * 100 : null
  return <svg className="ql-stat-context-meter" width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" aria-hidden="true" data-state={progress === null ? 'unknown' : 'known'}>
    <circle className="ql-stat-context-track" cx="12" cy="12" r="9" pathLength={100} strokeDasharray={progress === null ? '3 3' : undefined} />
    {progress === null ? <path className="ql-stat-context-unknown" d="M9 12h6" /> : <circle className="ql-stat-context-progress" cx="12" cy="12" r="9" pathLength={100} strokeDasharray={`${progress} ${100 - progress}`} transform="rotate(-90 12 12)" />}
  </svg>
}

function UsageDetails({ run, kind }: { run: ChatRun | undefined; kind: Metric }) {
  const t = useUiText(workspaceEn)
  if (!run) { return <p>{t('暂无真实任务统计。')}</p> }
  const missed = known(run.inputTokens) && known(run.cacheReadTokens)
    && run.inputTokens >= run.cacheReadTokens
    ? run.inputTokens - run.cacheReadTokens : null
  return <>
    {kind === 'cache' ? <>
      <dl className="ql-stat-facts">
        <div><dt>{t('输入总 Token')}</dt><dd>{count(run.inputTokens)}</dd></div>
        <div><dt>{t('输出 Token')}</dt><dd>{count(run.outputTokens)}</dd></div>
        <div><dt>{t('缓存读取 Token')}</dt><dd>{count(run.cacheReadTokens)}</dd></div>
        <div><dt>{t('缓存创建 / 写入 Token')}</dt><dd>{count(run.cacheCreationTokens)}</dd></div>
        <div><dt>{t('未命中输入 Token')}</dt><dd>{count(missed)}</dd></div>
        <div><dt>{t('缓存命中率')}</dt><dd>{percent(run.cacheHitRate)}</dd></div>
      </dl>

    </> : kind === 'context' ? <>
      <dl className="ql-stat-facts">
        <div><dt>{t('本任务输入 Token')}</dt><dd>{count(run.inputTokens)}</dd></div>
        <div><dt>{t('管理员配置的上下文窗口')}</dt><dd>{count(run.contextWindowTokens)}</dd></div>
        <div><dt>{t('上下文占比')}</dt><dd>{percent(run.contextUsageRatio)}</dd></div>
      </dl>
      {contextStatus(run) && <p className="ql-stat-note">{contextStatus(run)}</p>}
    </> : <>
      <dl className="ql-stat-facts">
        <div><dt>{t('输出速度')}</dt><dd>{rate(run.outputTokensPerSecond)}</dd></div>
        <div><dt>{t('输出 Token')}</dt><dd>{count(run.outputTokens)}</dd></div>
        <div><dt>{t('输出字符数')}</dt><dd>{count(run.outputCharacters)}</dd></div>
        <div><dt>{t('字符速度')}</dt><dd>{characterRate(run.outputCharactersPerSecond)}</dd></div>
        <div><dt>{t('首 Token 等待')}</dt><dd>{duration(run.ttftMs)}</dd></div>
        <div><dt>{t('观测输出时段')}</dt><dd>{duration(run.decodeDurationMs)}</dd></div>
        <div><dt>{t('模型用时')}</dt><dd>{duration(run.modelDurationMs)}</dd></div>
      </dl>
      {(known(run.outputCharacters) || known(run.outputCharactersPerSecond)) && <p className="ql-stat-note">{t('字符≠Token；不估算 Token。')}</p>}
    </>}
    <p className="ql-stat-note">{t('第 {step} 步', { step: count(run.sequence) })} · {t(statusName[run.status])}{!run.timingComplete ? t(' · 计时不完整') : ''}</p>
  </>
}

/** Composer-only view: mount instead of, never alongside, the full statistics view. */
export function ChatMetricsBar(props: ChatStatisticsProps) {
  const statistics = useChatStatistics({ ...props, limit: 1 })
  return <MetricsContent key={statistics.scopeKey} statistics={statistics} sessionId={props.sessionId} />
}

function MetricsContent({ statistics, sessionId }: { statistics: ReturnType<typeof useChatStatistics>; sessionId: string | null }) {
  const t = useUiText(workspaceEn)
  const { page, error, loading, refresh } = statistics
  const run = page?.runs[0]
  const [open, setOpen] = useState<Metric | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const activeTrigger = useRef<HTMLButtonElement | null>(null)
  const id = useId()
  useEffect(() => {
    if (!open) { return }
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) { setOpen(null) }
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(null); activeTrigger.current?.focus() }
    }
    const focusOutside = (event: FocusEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) { setOpen(null) }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    document.addEventListener('focusin', focusOutside)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
      document.removeEventListener('focusin', focusOutside)
    }
  }, [open])
  function toggle(kind: Metric, event: MouseEvent<HTMLButtonElement>) {
    activeTrigger.current = event.currentTarget
    setOpen(previous => previous === kind ? null : kind)
  }
  const labels = { speed: t('输出速度详情'), cache: t('缓存命中详情'), context: t('上下文详情') }
  const regionLabels = { speed: t('输出速度测量详情'), cache: t('缓存用量详情'), context: t('上下文用量详情') }
  return <div ref={root} className="ql-stat-metrics" aria-label={t('最近任务指标')}>
    <div className="ql-stat-metric-items">
      {(['speed', 'cache', 'context'] as const).map(kind => <button key={kind} className="ql-stat-metric" type="button" aria-label={labels[kind]} aria-expanded={open === kind} aria-controls={`${id}-${kind}`} title={labels[kind]} onClick={event => toggle(kind, event)}>
        {kind === 'context' ? <ContextMeter ratio={run?.contextUsageRatio} /> : <MetricIcon kind={kind} />}<span>{kind === 'speed' ? outputSpeed(run) : kind === 'cache' ? t('缓存命中{value}', { value: percent(run?.cacheHitRate) }) : t('上下文{value}', { value: contextValue(run) })}</span>
      </button>)}
      {run?.status === 'running' && <span className="ql-stat-compact-state">{t('运行中')}</span>}
      <button className="ql-stat-refresh-compact" type="button" aria-label={t('刷新任务指标')} title={t('刷新')} disabled={loading || !sessionId} onClick={refresh}><MetricIcon kind="refresh" /></button>
    </div>
    {error && <p className="ql-stat-error ql-stat-compact-message" role="alert">{error} <button className="ql-stat-link" type="button" disabled={loading} onClick={refresh}>{t('重试')}</button></p>}
    {!error && !loading && sessionId && !run && <p className="ql-stat-compact-message ql-stat-note">{t('暂无任务统计。')}</p>}
    {open && <section id={`${id}-${open}`} className="ql-stat-popover" role="region" aria-label={regionLabels[open]}>
      <div className="ql-stat-popover-heading"><strong>{regionLabels[open]}</strong><button className="ql-stat-link" type="button" aria-label={t('关闭指标详情')} onClick={() => { setOpen(null); activeTrigger.current?.focus() }}>{t('关闭')}</button></div>
      <UsageDetails run={run} kind={open} />
      {loading && <p className="ql-stat-note">{t('刷新中…')}</p>}
    </section>}
  </div>
}

function DurationBar({ run }: { run: ChatRun }) {
  const t = useUiText(workspaceEn)
  const total = run.totalDurationMs
  if (!known(total) || total === 0) { return <div className="ql-stat-duration-unknown">{t('耗时分布 —')}</div> }
  const model = run.modelDurationMs
  const first = run.ttftMs
  const decode = run.decodeDurationMs
  // All segments are inside the total. Only decodeDurationMs measures output;
  // model - TTFT is NOT an inferred decode duration (it also includes tail time).
  const segments = [{ name: t('已观测总耗时'), value: total, className: 'ql-stat-segment-other' }]
  if (known(model) && known(first) && first <= model && model <= total) {
    segments.length = 0
    segments.push({ name: t('首 Token 等待'), value: first, className: 'ql-stat-segment-first' })
    if (known(decode) && first + decode <= model) {
      segments.push({ name: t('观测输出时段'), value: decode, className: 'ql-stat-segment-model' })
      segments.push({ name: t('模型其余耗时'), value: model - first - decode, className: 'ql-stat-segment-model-other' })
    } else {
      segments.push({ name: t('模型其余耗时'), value: model - first, className: 'ql-stat-segment-model-other' })
    }
    segments.push({ name: t('其他耗时'), value: total - model, className: 'ql-stat-segment-other' })
  }
  const label = segments.map(segment => `${segment.name} ${duration(segment.value)}`).join(useSettings.getState().locale === 'en-US' ? '; ' : '；')
  return <div className="ql-stat-duration-bar" role="img" aria-label={label} title={label}>
    {segments.filter(segment => segment.value > 0).map(segment => <span key={segment.name} className={segment.className} style={{ width: `${segment.value / total * 100}%` }} />)}
  </div>
}

function RunDetails({ run }: { run: ChatRun }) {
  const t = useUiText(workspaceEn)
  return <div className="ql-stat-details">
    <dl className="ql-stat-facts">
      <div><dt>{t('服务商')}</dt><dd>{text(run.providerName)} <span className="ql-stat-note">({text(run.providerId)})</span></dd></div>
      <div><dt>{t('模型')}</dt><dd>{text(run.modelName)} <span className="ql-stat-note">({text(run.modelId)})</span></dd></div>
      <div><dt>{t('任务 ID')}</dt><dd>{text(run.id)}</dd></div>
      <div><dt>{t('回复 ID')}</dt><dd>{text(run.replyId)}</dd></div>
      <div><dt>{t('会话 ID')}</dt><dd>{text(run.sessionId)}</dd></div>
      <div><dt>{t('触发 / 状态')}</dt><dd>{t(triggerName[run.trigger])} / {t(statusName[run.status])}</dd></div>
      <div><dt>{t('开始时间')}</dt><dd>{time(run.startedAt)}</dd></div>
      <div><dt>{t('首 Token 时间')}</dt><dd>{time(run.firstTokenAt)}</dd></div>
      <div><dt>{t('末 Token 时间')}</dt><dd>{time(run.lastTokenAt)}</dd></div>
      <div><dt>{t('结束时间')}</dt><dd>{time(run.endedAt)}</dd></div>
      <div><dt>{t('输入 / 输出 Token')}</dt><dd>{count(run.inputTokens)} / {count(run.outputTokens)}</dd></div>
      <div><dt>{t('缓存读取 / 创建 Token')}</dt><dd>{count(run.cacheReadTokens)} / {count(run.cacheCreationTokens)}</dd></div>
      <div><dt>{t('缓存命中率')}</dt><dd>{percent(run.cacheHitRate)}</dd></div>
      <div><dt>{t('配置窗口 / 上下文占比')}</dt><dd>{count(run.contextWindowTokens)} / {percent(run.contextUsageRatio)}</dd></div>
      <div><dt>{t('首 Token / 模型用时')}</dt><dd>{duration(run.ttftMs)} / {duration(run.modelDurationMs)}</dd></div>
      <div><dt>{t('观测输出时段')}</dt><dd>{duration(run.decodeDurationMs)}</dd></div>
      <div><dt>{t('输出速度 / 工具用时')}</dt><dd>{rate(run.outputTokensPerSecond)} / —</dd></div>
      <div><dt>{t('输出字符数')}</dt><dd>{count(run.outputCharacters)}</dd></div>
      <div><dt>{t('字符速度')}</dt><dd>{characterRate(run.outputCharactersPerSecond)}</dd></div>
      <div><dt>{t('已观测总用时')}</dt><dd>{totalTime(run)}</dd></div>
      <div><dt>{t('工具名称')}</dt><dd>{run.toolCalls.length ? run.toolCalls.map(call => call.name).join(useSettings.getState().locale === 'en-US' ? ', ' : '、') : t('未记录工具调用')}</dd></div>
    </dl>
    {(known(run.outputCharacters) || known(run.outputCharactersPerSecond)) && <p className="ql-stat-note">{t('字符≠Token；不估算 Token。')}</p>}
    {contextStatus(run) && <p className="ql-stat-note">{contextStatus(run)}</p>}
    {!run.timingComplete && <p className="ql-stat-note">{t('计时不完整')}</p>}
    {run.error && <p className="ql-stat-error">{t('任务错误 · {kind}：{message}', { kind: text(run.error.kind), message: text(run.error.message) })}</p>}
  </div>
}

function StatisticsRow({ run }: { run: ChatRun }) {
  const t = useUiText(workspaceEn)
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()
  return <Fragment>
    <tr className={run.status === 'running' ? 'ql-stat-row-running' : undefined}>
      <th scope="row"><span className="ql-stat-step">{t('第 {step} 步', { step: count(run.sequence) })}</span><button className="ql-stat-link" type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}>{expanded ? t('收起详情') : t('详情')}</button></th>
      <td className="ql-stat-time">{time(run.startedAt)}</td>
      <td className="ql-stat-execution"><div className="ql-stat-execution-heading"><span>{t(triggerName[run.trigger])}</span><span className={`ql-stat-status ql-stat-status-${run.status}`}>{run.status === 'running' && '◉ '}{t(statusName[run.status])}</span></div><p>{run.summary ? run.summary.slice(0, 160) : t('未提供执行摘要')}</p>{run.toolCalls.length > 0 && <small>{t('工具：{names}', { names: run.toolCalls.map(call => call.name).join(useSettings.getState().locale === 'en-US' ? ', ' : '、') })}</small>}</td>
      <td>{count(run.inputTokens)}</td>
      <td>{count(run.outputTokens)}</td>
      <td>{percent(run.cacheHitRate)}</td>
      <td>{duration(run.ttftMs)}</td>
      <td>{duration(run.modelDurationMs)}</td>
      <td>{rate(run.outputTokensPerSecond)}</td>
      <td>—</td>
      <td className="ql-stat-total"><span>{totalTime(run)}</span><DurationBar run={run} /></td>
    </tr>
    {expanded && <tr className="ql-stat-detail-row"><td colSpan={11}><section id={detailsId} aria-label={t('第 {step} 步详情', { step: count(run.sequence) })}><RunDetails run={run} /></section></td></tr>}
  </Fragment>
}

/** Paged table; API pages are newest first, each visible page is chronological. */
export function ChatStatistics(props: ChatStatisticsProps) {
  const t = useUiText(workspaceEn)
  const { page, loading, error, refresh, offset, setOffset, scopeKey } = useChatStatistics({ ...props, limit: 100 })
  const headingId = useId()
  const runs = page ? [...page.runs].reverse() : []
  return <section className="ql-stat-panel" aria-labelledby={headingId}>
    <header className="ql-stat-toolbar"><div><h2 id={headingId}>{t('逐轮统计')}</h2>{page && <p className="ql-stat-note">{t('共 {count} 个任务', { count: count(page.total) })}</p>}</div><button className="ql-stat-button" type="button" disabled={loading || !props.sessionId} onClick={refresh}>{loading ? t('刷新中…') : error ? t('重试') : t('刷新')}</button></header>
    {error && <p className="ql-stat-error" role="alert">{error}</p>}
    {!props.sessionId ? <p className="ql-stat-empty">{t('请选择会话。')}</p> : !page ? <p className="ql-stat-empty" role="status">{loading ? t('加载中…') : error ? t('加载失败。') : t('暂无统计。')}</p> : !runs.length ? <p className="ql-stat-empty">{t('暂无逐轮统计。')}</p> : <div className="ql-stat-table-scroll" role="region" aria-label={t('逐轮统计表')} tabIndex={0} aria-busy={loading}>
      <table className="ql-stat-table"><caption>{t('生成任务统计')}</caption><thead><tr><th scope="col">{t('轮次 / 步骤')}</th><th scope="col">{t('触发时间')}</th><th scope="col">{t('执行内容')}</th><th scope="col">{t('上下文')}<br /><small>{t('输入 Token')}</small></th><th scope="col">{t('输出')}<br /><small>Token</small></th><th scope="col">{t('缓存命中')}</th><th scope="col">{t('首 Token')}</th><th scope="col">{t('模型用时')}</th><th scope="col">{t('输出速度')}</th><th scope="col">{t('工具用时')}</th><th scope="col">{t('总用时')}</th></tr></thead><tbody key={scopeKey}>{runs.map(run => <StatisticsRow key={run.id} run={run} />)}</tbody></table>
    </div>}
    {props.sessionId && <nav className="ql-stat-pagination" aria-label={t('统计分页')}><button className="ql-stat-button" type="button" disabled={offset === 0 || loading} onClick={() => setOffset(offset - 100)}>{t('较新一页')}</button><span>{t('第 {page} 页 · 每页 100 条', { page: count(Math.floor(offset / 100) + 1) })}</span><button className="ql-stat-button" type="button" disabled={!page?.hasMore || loading} onClick={() => setOffset(offset + 100)}>{t('较早一页')}</button></nav>}
  </section>
}
