// SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useEffect, useRef, useState } from 'react'
import { StudioError, studioApi, useStudio } from '../studio.js'

export type UsageMeasure = { total: number | null; known: number; missing: number; coverage: number | null; overflow: boolean }
export type ActualUsage = {
  terminalRequests: number
  inputTokens: UsageMeasure
  outputTokens: UsageMeasure
  cacheReadTokens: UsageMeasure
  cacheCreationTokens: UsageMeasure
  cacheHitRate: { value: number | null; known: number; missing: number; inputTokens: number | null; cacheReadTokens: number | null }
}
export type UsageSummary = { requests: number; success: number; failed: number; interrupted: number; running: number; unknownStatus: number; actualUsage: ActualUsage }
export type AnalyticsItem = { id: string | null; owner: string | null; providerId: string | null; modelId: string | null; startedAt: number; date: string; status: 'done' | 'error' | 'interrupted' | 'running' | 'unknown'; actualUsageEligible: boolean; inputTokens: number | null; outputTokens: number | null; cacheReadTokens: number | null; cacheCreationTokens: number | null }
export type AnalyticsGroup = UsageSummary & { providerId?: string | null; modelId?: string | null; owner?: string | null }
export type UsageAnalyticsResponse = {
  timeZone: 'Asia/Shanghai'
  generatedAt: number
  range: { kind: '7' | '30' | 'custom'; start: string; end: string; startUtc: number; endExclusiveUtc: number; days: number }
  scope: { source: 'retained-chat-jobs-metrics'; active: 'persisted-snapshot'; actualUsage: 'terminal-only'; billingComplete: false; undatedRetainedJobs: number; maxRetainedJobs: number }
  filters: { providers: { id: string; name: string }[]; models: { providerId: string; id: string; name: string }[]; owners: { id: string; name: string }[] }
  selected: { providerId: string | null; modelId: string | null; owner: string | null }
  overview: UsageSummary
  daily: (UsageSummary & { date: string })[]
  groups: { providers: AnalyticsGroup[]; models: AnalyticsGroup[]; owners: AnalyticsGroup[] }
  details: { items: AnalyticsItem[]; total: number; limit: number; offset: number; hasMore: boolean }
}
export type AnalyticsQuery = { range: '7' | '30' | 'custom'; start: string; end: string; providerId: string; modelId: string; owner: string; offset: number }
const identity = () => {
  const state = useStudio.getState()
  return JSON.stringify([state.authenticated, state.principal?.id, state.principal?.role])
}
export function analyticsSearch(query: AnalyticsQuery) {
  const params = new URLSearchParams({ range: query.range, limit: '25', offset: String(query.offset) })
  if (query.range === 'custom') { params.set('start', query.start); params.set('end', query.end) }
  for (const key of ['providerId', 'modelId', 'owner'] as const) {
    if (query[key]) { params.set(key, query[key]) }
  }
  return params.toString()
}
export function useUsageAnalytics(query: AnalyticsQuery) {
  const principal = useStudio(state => state.principal)
  const authenticated = useStudio(state => state.authenticated)
  const principalKey = JSON.stringify([authenticated, principal?.id, principal?.role])
  const enabled = authenticated === true && principal?.role === 'admin'
  const search = analyticsSearch(query), key = JSON.stringify([principalKey, search])
  const liveKey = useRef(key)
  liveKey.current = key
  const [revision, setRevision] = useState(0)
  const [stored, setStored] = useState<{ key: string; data: UsageAnalyticsResponse | null; loading: boolean; error: string }>({ key: '', data: null, loading: false, error: '' })
  useEffect(() => {
    if (!enabled) { return }
    let active = true, timedOut = false
    const controller = new AbortController()
    const unsubscribe = useStudio.subscribe(() => { if (identity() !== principalKey) { controller.abort() } })
    const valid = () => active && liveKey.current === key && identity() === principalKey
    const timer = setTimeout(() => {
      timedOut = true; controller.abort()
      if (valid()) { setStored({ key, data: null, loading: false, error: '用量分析请求超时，请重试。' }) }
    }, 15_000)
    setStored({ key, data: null, loading: true, error: '' })
    void studioApi<UsageAnalyticsResponse>(`/admin/analytics?${search}`, { signal: controller.signal }).then(data => {
      if (!valid() || controller.signal.aborted) { return }
      if (!data || !Array.isArray(data.details?.items) || !Array.isArray(data.daily) || !data.filters || !data.groups || !data.overview || data.scope?.source !== 'retained-chat-jobs-metrics') { throw new Error('Invalid analytics response') }
      setStored({ key, data, loading: false, error: '' })
    }).catch((cause: unknown) => {
      if (!valid() || controller.signal.aborted && !timedOut) { return }
      const status = cause instanceof StudioError ? cause.status : null
      setStored({ key, data: null, loading: false, error: timedOut ? '用量分析请求超时，请重试。' : status === 403 ? '仅管理员可以查看用量分析。' : status === 400 ? '日期或过滤条件无效；范围最多 366 天。' : status === 422 ? '留存任务超过 50,000 条，请输入使用码身份 ID 缩小范围，或归档后查询。' : '用量分析加载失败，请重试。' })
    }).finally(() => clearTimeout(timer))
    return () => { active = false; clearTimeout(timer); controller.abort(); unsubscribe() }
  }, [enabled, key, principalKey, search, revision])
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  const matches = enabled && stored.key === key
  return { data: matches ? stored.data : null, loading: enabled && (!matches || stored.loading), error: matches ? stored.error : '', refresh, enabled, principalKey }
}
