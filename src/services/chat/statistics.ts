// SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useEffect, useRef, useState } from 'react'
import { StudioError, studioApi, useStudio } from '../studio.js'
import { useChatStore } from './store.js'

/** Server-observed generation task. Unknown measurements remain null, never estimated. */
export type ChatRun = {
  id: string
  sessionId: string
  replyId: string
  sequence: number
  status: 'running' | 'done' | 'stopped' | 'error'
  trigger: 'send' | 'regenerate' | 'continue'
  summary: string
  providerId: string
  providerName: string
  modelId: string
  modelName: string
  startedAt: number
  firstTokenAt: number | null
  lastTokenAt: number | null
  endedAt: number | null
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens: number | null
  cacheCreationTokens: number | null
  cacheHitRate: number | null
  contextWindowTokens: number | null
  contextUsageRatio: number | null
  ttftMs: number | null
  decodeDurationMs: number | null
  modelDurationMs: number | null
  totalDurationMs: number | null
  toolDurationMs: null
  outputTokensPerSecond: number | null
  outputCharacters?: number | null
  outputCharactersPerSecond?: number | null
  toolCalls: { name: string }[]
  error?: { kind: string; message: string }
  timingComplete: boolean
}

export type StatisticsPage = {
  runs: ChatRun[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

type RequestState = {
  key: string
  page: StatisticsPage | null
  loading: boolean
  error: string
  updatedAt: number | null
}

function principalIdentity() {
  const state = useStudio.getState()
  return JSON.stringify([state.authenticated, state.principal?.role, state.principal?.id])
}

/** Mount only the visible view. Hidden documents suspend requests as well. */
export function useChatStatistics({ sessionId, ownerId, limit = 100 }: {
  sessionId: string | null
  ownerId?: string
  limit?: 1 | 100
}) {
  const principal = useStudio(state => state.principal)
  const authenticated = useStudio(state => state.authenticated)
  const localRunning = useChatStore(state => ownerId === undefined && !!sessionId && !!state.streaming[sessionId])
  const identity = JSON.stringify([authenticated, principal?.role, principal?.id])
  const baseKey = JSON.stringify([identity, sessionId, ownerId ?? null, limit])
  const [pagination, setPagination] = useState({ baseKey, offset: 0 })
  // Reset synchronously for the first render of a new identity/session/owner.
  const offset = pagination.baseKey === baseKey ? pagination.offset : 0
  const key = JSON.stringify([baseKey, offset])
  const liveKey = useRef(key)
  liveKey.current = key
  const sequence = useRef(0)
  const [revision, setRevision] = useState(0)
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')
  const [stored, setStored] = useState<RequestState>({ key: '', page: null, loading: false, error: '', updatedAt: null })
  const deniedOwner = ownerId !== undefined && principal?.role !== 'admin'
  const enabled = authenticated === true && !!principal && !!sessionId && !deniedOwner

  useEffect(() => {
    setPagination({ baseKey, offset: 0 })
  }, [baseKey])

  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    update()
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  useEffect(() => {
    if (!enabled || !visible || !sessionId) { return }
    let active = true
    let controller: AbortController | undefined
    let requestTimer: ReturnType<typeof setTimeout> | undefined
    let pollTimer: ReturnType<typeof setTimeout> | undefined
    const current = () => active && liveKey.current === key && principalIdentity() === identity
    const load = async () => {
      if (!current()) { return }
      const requestSequence = ++sequence.current
      const request = new AbortController()
      controller = request
      let timedOut = false
      let terminal = false
      let running = false
      const valid = () => current() && sequence.current === requestSequence
      setStored(previous => ({
        key, page: previous.key === key ? previous.page : null, loading: true,
        error: '', updatedAt: previous.key === key ? previous.updatedAt : null,
      }))
      requestTimer = setTimeout(() => { timedOut = true; request.abort() }, 15_000)
      const query = new URLSearchParams({ limit: String(limit), offset: String(offset) })
      let path: string
      if (ownerId !== undefined) {
        query.set('owner', ownerId)
        query.set('sessionId', sessionId)
        path = `/admin/chat/statistics?${query}`
      } else {
        path = `/chat/sessions/${encodeURIComponent(sessionId)}/statistics?${query}`
      }
      try {
        const page = await studioApi<StatisticsPage>(path, { method: 'GET', signal: request.signal })
        if (!valid() || request.signal.aborted) { return }
        if (!page || !Array.isArray(page.runs) || page.offset !== offset || page.limit !== limit
          || page.runs.some(run => run.sessionId !== sessionId)) {
          throw new Error('统计响应格式或分页不匹配，请重试。')
        }
        running = page.runs.some(run => run.status === 'running')
        setStored({ key, page, loading: false, error: '', updatedAt: Date.now() })
      } catch (cause) {
        if (!valid() || request.signal.aborted && !timedOut) { return }
        const status = cause instanceof StudioError ? cause.status : null
        const awaitingSession = status === 404 && ownerId === undefined && localRunning
        terminal = status === 403 || status === 404 && !awaitingSession
        const error = awaitingSession ? '' : timedOut ? '统计请求超过 15 秒，请重试。'
          : status === 403 ? '无权查看此会话的统计（403）。请确认当前身份或使用码。'
          : status === 404 ? '会话或统计接口不存在（404），也可能已被删除。'
          : cause instanceof Error ? cause.message : '统计加载失败，请重试。'
        setStored(previous => ({
          key, page: terminal ? null : previous.key === key ? previous.page : null,
          loading: awaitingSession, error, updatedAt: terminal ? null : previous.key === key ? previous.updatedAt : null,
        }))
      } finally {
        if (requestTimer !== undefined) { clearTimeout(requestTimer); requestTimer = undefined }
        if (controller === request) { controller = undefined }
        if (valid() && !terminal) {
          // Serialize polls. Local generation keeps the fast cadence even before
          // its POST has produced a statistics record on the server.
          pollTimer = setTimeout(() => { void load() }, localRunning || running ? 500 : 15_000)
        }
      }
    }
    void load()
    return () => {
      active = false
      controller?.abort()
      if (requestTimer !== undefined) { clearTimeout(requestTimer) }
      if (pollTimer !== undefined) { clearTimeout(pollTimer) }
    }
  }, [enabled, visible, identity, key, sessionId, ownerId, limit, offset, revision, localRunning])

  const refresh = useCallback(() => setRevision(value => value + 1), [])
  const setOffset = useCallback((value: number) => {
    setPagination({ baseKey, offset: Math.max(0, Math.floor(value / limit) * limit) })
  }, [baseKey, limit])
  const matches = stored.key === key && enabled
  return {
    // No effect is needed to hide a previous principal's or previous page's data.
    page: matches ? stored.page : null,
    loading: enabled && visible && (!matches || stored.loading),
    error: deniedOwner ? '无权查看其他使用码的统计（403），仅管理员可指定 owner。' : matches ? stored.error : '',
    updatedAt: matches ? stored.updatedAt : null,
    offset, setOffset, refresh,
    scopeKey: key,
  }
}
