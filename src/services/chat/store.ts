import { create } from 'zustand'
import { createId } from '../../utils/id.js'
import { ApiError } from '../api/client.js'
import type { ChatModel, CreateMessageRequest } from '../api/types.js'
import { isRetryableApiError } from '../api/errors.js'
import {
  checkImageFileIds,
  describeUploadError,
  uploadAttachment,
  useUploads,
} from '../attachments.js'
import { getReasoningEffortPreference, resolveReasoningEffort, useSettings } from '../settings.js'
import { selectedTarget, supportedCapabilities, currentCapabilities, useStudio, StudioError, restoreModelSelection, newChatModelSelection, rememberModelSelection, type ModelSelection } from '../studio.js'
import { appendBranch, getVisibleMessages, normalizeSession, selectVersion } from './branches.js'
import * as db from './db.js'
import { historyDatabaseName } from '../identity.js'
import { remoteApi, rememberRevision, sessionRevision, waitForSessionWrites, saveRemoteModelSelection, type ServerJob } from './remote.js'
import {
  clearAllDrafts,
  clearDraft,
  clearSentDraft,
  getDraft,
  prepareDraftMessage,
  useDrafts,
} from './drafts.js'
import { createLatestReminder } from './latestReminder.js'
import { assessAttachmentCompatibility, type AttachmentReference } from './attachmentCompatibility.js'
import {
  canContinueReply,
  getContextRounds,
  settleReply,
  toRequestMessages,
} from './reply.js'
import {
  toSessionSummary,
  type AssistantMessage,
  type FileAttachment,
  type Message,
  type Session,
  type SessionSummary,
  type UserMessage,
} from './types.js'

/** deepseek-flash 同时支持深度思考与图片输入 */
const MODEL: ChatModel = 'deepseek-flash'
/** 所有生成请求统一携带的助手身份说明 */
const SYSTEM_PROMPT = '你是一位可靠、友善的智能助手。请准确、清晰地帮助用户。'
/** 保留最近打开的详情；当前会话、生成中及尚未成功保存的会话不淘汰。 */
const SESSION_CACHE_LIMIT = 5
/** 安全审核固定开启，所有请求都走扩展模式 */
const SAFETY_CHECK = { level: 'high' } as const

/** 阅读链接始终开启，智能搜索开关控制是否另行声明搜索工具（含边想边搜）。 */
const serverTools = (search: boolean, providerType: 'openai' | 'anthropic' | 'deepseek' = 'deepseek'): CreateMessageRequest['tools'] => {
  if (providerType !== 'deepseek') {return search ? [{ type: 'web_search', name: 'web_search' }] : []}
  const tools: CreateMessageRequest['tools'] = [
    { type: 'deepseek_read_url', name: 'deepseek_read_url' },
  ]
  if (search) {
    tools.push({ type: 'deepseek_web_search', name: 'deepseek_web_search' })
  }
  return tools
}

/** 允许自动补标题的请求；手动重命名后取消本轮标题写入，包含主动清空标题的情况。 */
const titleRequests = new Set<AbortController>()

type ChatState = {
  ready: boolean
  initError: boolean
  /** 历史导入或全部删除期间锁定交互，提交成功前仍展示原有记录。 */
  importingHistory: boolean
  /** 仅列表元数据，按 updatedAt 降序；流式消息更新不会改变此数组。 */
  sessions: SessionSummary[]
  sessionCache: Record<string, Session>
  sessionLoadErrors: Record<string, boolean>
  sessionSaveErrors: Record<string, boolean>
  /** null 表示新对话（欢迎页） */
  activeId: string | null
  /** 正在生成回复的会话 */
  streaming: Record<string, AbortController>
}

export const useChatStore = create<ChatState>(() => ({
  ready: false,
  initError: false,
  importingHistory: false,
  sessions: [],
  sessionCache: {},
  sessionLoadErrors: {},
  sessionSaveErrors: {},
  activeId: null,
  streaming: {},
}))

const { getState: get, setState: set } = useChatStore

const sortSessions = (sessions: SessionSummary[]) =>
  [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)

const getSession = (id: string) => {
  const cache = get().sessionCache
  return Object.hasOwn(cache, id) ? cache[id] : undefined
}

const getStreamController = (id: string) => {
  const streams = get().streaming
  return Object.hasOwn(streams, id) ? streams[id] : undefined
}

const sameSummary = (a: SessionSummary, b: SessionSummary) =>
  a.title === b.title && a.createdAt === b.createdAt && a.updatedAt === b.updatedAt

const sessionAccess = new Map<string, number>()
const unsavedSessions = new Set<string>()
/** 保存失败时保留原件，重试成功后才释放。 */
const pendingFiles = new Map<string, db.StoredFile[]>()
const deletingSessions = new Set<string>()
const deletionTasks = new Set<Promise<boolean>>()
const streamFlushes = new Map<string, () => void>()
let accessSequence = 0
let historyEpoch = 0
let initTask: Promise<void> | undefined
const sessionLoads = new Map<string, { promise: Promise<void> }>()
const sessionPersists = new Map<string, Promise<void>>()
const pendingModelSelections = new Map<string, ModelSelection>()
const modelSelectionSaves = new Map<string, Promise<void>>()

/** Legacy history is recoverable only with an exact provider+model pair; never guess by model name. */
export const sessionModelSelection = (session: Session): ModelSelection | null => {
  if (session.modelSelection !== undefined) { return session.modelSelection }
  const reply = getVisibleMessages(session).findLast(message => message.role === 'assistant' && !!message.providerId && !!message.model)
  return reply?.role === 'assistant' && reply.providerId && reply.model ? { providerId: reply.providerId, modelId: reply.model } : null
}
const restoreSessionModel = (id: string) => {
  const session = getSession(id)
  if (get().activeId === id && session) { restoreModelSelection(sessionModelSelection(session)) }
}
const persistModelSelection = (id: string) => {
  const selection = pendingModelSelections.get(id)
  if (!selection || modelSelectionSaves.has(id) || deletingSessions.has(id) || get().importingHistory) { return }
  const epoch = historyEpoch, principalId = useStudio.getState().principal?.id
  const task = (sessionPersists.get(id) ?? Promise.resolve()).then(() => {
    if (epoch !== historyEpoch || principalId !== useStudio.getState().principal?.id) { throw new Error('登录身份或历史已变化') }
    if (!pendingModelSelections.has(id) || deletingSessions.has(id)) { return }
    const snapshot = getSession(id)
    return saveRemoteModelSelection(id, selection, saved => {
      // Merge the acknowledged snapshot only if no send/edit/choice changed local content.
      if (epoch === historyEpoch && principalId === useStudio.getState().principal?.id && getSession(id) === snapshot && !deletingSessions.has(id)) { adoptServerSession(saved) }
    })
  }).then(() => {
    if (epoch !== historyEpoch || principalId !== useStudio.getState().principal?.id) { return }
    if (pendingModelSelections.get(id) === selection) {
      pendingModelSelections.delete(id)
      set(state => ({ sessionSaveErrors: Object.fromEntries(Object.entries(state.sessionSaveErrors).filter(([key]) => key !== id)) }))
    }
  }).catch((error: unknown) => {
    db.reportStorageError('save model selection')(error)
    if (epoch === historyEpoch && principalId === useStudio.getState().principal?.id && pendingModelSelections.has(id) && !deletingSessions.has(id)) {
      set(state => ({ sessionSaveErrors: { ...state.sessionSaveErrors, [id]: true } }))
    }
  }).finally(() => {
    if (modelSelectionSaves.get(id) === task) { modelSelectionSaves.delete(id) }
    if (epoch === historyEpoch && pendingModelSelections.has(id) && pendingModelSelections.get(id) !== selection) { persistModelSelection(id) }
  })
  modelSelectionSaves.set(id, task)
}

/** Explicit UI choice. Empty conversations are saved too; no paid request is started. */
export const selectChatModel = (selection: ModelSelection): boolean => {
  const state = get()
  if (!state.ready || state.importingHistory || !useStudio.getState().authenticated || !selectedTarget(selection) ||
    Object.keys(state.streaming).length || Object.values(useUploads.getState().tasks).some(task => task.status === 'uploading')) { return false }
  if (state.activeId && (!getSession(state.activeId) || deletingSessions.has(state.activeId))) { return false }
  rememberModelSelection(selection)
  restoreModelSelection(selection)
  if (state.activeId) {
    updateSession(state.activeId, session => ({ ...session, modelSelection: selection }))
    pendingModelSelections.set(state.activeId, selection)
    persistModelSelection(state.activeId)
  } else {
    const now = Date.now()
    const session: Session = { id: createId(), title: '', createdAt: now, updatedAt: now, messages: [], rootMessageId: null, modelSelection: selection }
    touchSession(session.id)
    // Preserve the unsent welcome-page draft when this explicit choice creates a session.
    useDrafts.setState(current => {
      const drafts = new Map(current.drafts), draft = drafts.get(null)
      if (draft) { drafts.set(session.id, draft); drafts.delete(null) }
      return { drafts }
    })
    set(current => ({ activeId: session.id, sessions: [toSessionSummary(session), ...current.sessions], sessionCache: { ...current.sessionCache, [session.id]: session } }))
    persist(session.id)
  }
  return true
}

const touchSession = (id: string) => sessionAccess.set(id, ++accessSequence)

const trimSessionCache = () => {
  const state = get()
  const ids = Object.keys(state.sessionCache)
  if (ids.length <= SESSION_CACHE_LIMIT) {
    return
  }
  const removable = ids
    .filter(
      (id) =>
        id !== state.activeId &&
        !Object.hasOwn(state.streaming, id) &&
        !unsavedSessions.has(id) &&
        !pendingModelSelections.has(id) &&
        !deletingSessions.has(id)
    )
    .sort((a, b) => (sessionAccess.get(a) ?? 0) - (sessionAccess.get(b) ?? 0))
  const evicted = new Set(removable.slice(0, ids.length - SESSION_CACHE_LIMIT))
  for (const id of evicted) {
    sessionAccess.delete(id)
  }
  if (evicted.size > 0) {
    set({
      sessionCache: Object.fromEntries(
        Object.entries(state.sessionCache).filter(([id]) => !evicted.has(id))
      ),
    })
  }
}

const updateSession = (id: string, update: (session: Session) => Session) =>
  set((state) => {
    const previous = Object.hasOwn(state.sessionCache, id) ? state.sessionCache[id] : undefined
    if (!previous) {
      return state
    }
    const session = update(previous)
    if (session === previous) {
      return state
    }
    return {
      sessionCache: { ...state.sessionCache, [id]: session },
      sessions: sameSummary(previous, session)
        ? state.sessions
        : sortSessions(
            state.sessions.map((summary) =>
              summary.id === id ? toSessionSummary(session) : summary
            )
          ),
    }
  })

const updateReply = (sessionId: string, reply: AssistantMessage) =>
  updateSession(sessionId, (session) => ({
    ...session,
    messages: session.messages.map((message) =>
      message.id === reply.id
        ? { ...reply, parentId: message.parentId, selectedChildId: message.selectedChildId }
        : message
    ),
  }))

const persist = (sessionId: string) => {
  const session = getSession(sessionId)
  if (session) {
    unsavedSessions.add(sessionId)
    if (deletingSessions.has(sessionId)) {
      return
    }
    const epoch = historyEpoch
    const files = pendingFiles.get(sessionId)
    const task = db
      .saveSession(session, files)
      .then(() => {
        if (epoch !== historyEpoch || !getSession(sessionId)) {
          return
        }
        if (pendingFiles.get(sessionId) === files) {
          pendingFiles.delete(sessionId)
        }
        if (getSession(sessionId) === session) {
          unsavedSessions.delete(sessionId)
          set((state) => ({
            sessionSaveErrors: Object.fromEntries(
              Object.entries(state.sessionSaveErrors).filter(([id]) => id !== sessionId)
            ),
          }))
          trimSessionCache()
        }
      })
      .catch((error: unknown) => {
        db.reportStorageError('save session')(error)
        if (epoch === historyEpoch && getSession(sessionId)) {
          set((state) => ({
            sessionSaveErrors: { ...state.sessionSaveErrors, [sessionId]: true },
          }))
        }
      }).finally(() => { if (sessionPersists.get(sessionId) === task) { sessionPersists.delete(sessionId) } })
    sessionPersists.set(sessionId, task)
  }
}

export const retrySaveSessions = () => {
  if (!get().importingHistory) {
    unsavedSessions.forEach(persist)
    pendingModelSelections.forEach((_selection, id) => persistModelSelection(id))
  }
}

/** 离开前先合并尚未绘制的增量；隐藏期间浏览器可能暂停动画帧。 */
export const bindChatPersistence = () => {
  const save = () => {
    if (get().importingHistory) {
      return
    }
    for (const [id, flush] of streamFlushes) {
      flush()
      persist(id)
    }
    for (const id of unsavedSessions) {
      if (!streamFlushes.has(id)) {
        persist(id)
      }
    }
  }
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      save()
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', save)
  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', save)
  }
}

/** 按当前模型能力及开关创建回复，搜索仅使用明确适配的原生工具。 */
const createReply = (): AssistantMessage => {
  const settings = useSettings.getState()
  const target = selectedTarget()
  const capabilities = target && supportedCapabilities(target.provider, target.model)
  return {
    id: createId(),
    role: 'assistant',
    createdAt: Date.now(),
    model: target?.model.id ?? MODEL,
    providerId: target?.provider.id,
    thinking: !!capabilities?.thinking && settings.thinking,
    search: !!capabilities?.search && settings.search,
    prefix: true,
    status: 'pending',
    blocks: [],
  }
}

export const initChat = (): Promise<void> => {
  if (get().ready) {
    return Promise.resolve()
  }
  if (initTask) {
    return initTask
  }
  const epoch = historyEpoch
  set({ initError: false })
  initTask = (async () => {
    try {
      const summaries = await db.loadSessionSummaries()
      if (epoch === historyEpoch) {
        set({ sessions: sortSessions(summaries) })
        const jobs = await db.loadActiveJobs()
        const last = sessionStorage.getItem(`${historyDatabaseName()}:active`)
        const activeId = summaries.some(session => session.id === last) ? last : jobs[0]?.sessionId ?? null
        set({ activeId })
        if (activeId) {await ensureSessionLoaded(activeId)}
        for (const job of jobs) {
          await ensureSessionLoaded(job.sessionId)
          if (getSession(job.sessionId)) {void monitorServerJob(job)}
        }
        set({ ready: true })
      }
    } catch (error) {
      if (epoch === historyEpoch) {
        set({ initError: true })
        db.reportStorageError('read local sessions')(error)
      }
    } finally {
      if (epoch === historyEpoch) {
        initTask = undefined
      }
    }
  })()
  return initTask
}

/** 同一会话合并并发读取；切换只改变 activeId，旧请求不会把界面切回去。 */
const ensureSessionLoaded = (id: string): Promise<void> => {
  if (getSession(id)) {
    return Promise.resolve()
  }
  const pending = sessionLoads.get(id)
  if (pending) {
    return pending.promise
  }
  const epoch = historyEpoch
  set((state) => ({ sessionLoadErrors: { ...state.sessionLoadErrors, [id]: false } }))
  const load = { promise: Promise.resolve() }
  sessionLoads.set(id, load)
  load.promise = (async () => {
    try {
      const stored = await db.loadSession(id)
      if (epoch !== historyEpoch || sessionLoads.get(id) !== load) {
        return
      }
      const summary = get().sessions.find((session) => session.id === id)
      if (!summary) {
        return
      }
      if (!stored) {
        throw new Error(`Session ${id} is missing from local storage`)
      }
      const settled = normalizeSession(stored)
      // 读取期间可能已在列表重命名，保留最新元数据，不能让旧读取覆盖它。
      const session = { ...settled, modelSelection: pendingModelSelections.get(id) ?? sessionModelSelection(settled) }
      touchSession(id)
      set((state) => ({ sessionCache: { ...state.sessionCache, [id]: session } }))
      restoreSessionModel(id)
      trimSessionCache()
    } catch (error) {
      if (epoch === historyEpoch && sessionLoads.get(id) === load) {
        set((state) => ({ sessionLoadErrors: { ...state.sessionLoadErrors, [id]: true } }))
        db.reportStorageError('read session')(error)
      }
    } finally {
      if (sessionLoads.get(id) === load) {
        sessionLoads.delete(id)
      }
    }
  })()
  return load.promise
}

/** 等所有回复的收尾（落盘）完成 */
const waitForIdle = (sessionId?: string) =>
  new Promise<void>((resolve) => {
    const isIdle = (state: ChatState) =>
      sessionId === undefined
        ? Object.keys(state.streaming).length === 0
        : !Object.hasOwn(state.streaming, sessionId)
    if (isIdle(get())) {
      resolve()
      return
    }
    const unsubscribe = useChatStore.subscribe((state) => {
      if (isIdle(state)) {
        unsubscribe()
        resolve()
      }
    })
  })

/**
 * 替换历史对话：先写入暂存，成功后原子替换旧记录；写入为空即删除全部会话与附件。
 * 期间停止生成并禁止修改会话；失败时清除暂存，保留原有记录。
 */
export const replaceHistory = async (write: () => Promise<void>): Promise<number> => {
  if (get().importingHistory) {
    throw new Error('History replacement is already in progress')
  }
  set({ importingHistory: true })
  try {
    for (const controller of Object.values(get().streaming)) {
      controller.abort()
    }
    // 已开始的单条删除先同步到内存，避免本次替换失败后列表残留已被删除的记录。
    await Promise.all(deletionTasks)
    historyEpoch += 1
    initTask = undefined
    sessionLoads.clear()
    await waitForIdle()
    await Promise.allSettled([...sessionPersists.values(), ...modelSelectionSaves.values()])
    await db.clearStaging()
    let summaries: SessionSummary[]
    try {
      await write()
      summaries = await db.commitStaging()
    } catch (error) {
      await db.clearStaging().catch(db.reportStorageError('clear unfinished history replacement'))
      throw error
    }
    sessionAccess.clear()
    unsavedSessions.clear()
    pendingFiles.clear()
    pendingModelSelections.clear()
    clearAllDrafts()
    set({
      ready: true,
      initError: false,
      sessions: sortSessions(summaries),
      sessionCache: {},
      sessionLoadErrors: {},
      sessionSaveErrors: {},
      activeId: null,
    })
    return summaries.length
  } finally {
    set({ importingHistory: false })
    retrySaveSessions()
    const { activeId, ready } = get()
    // 替换失败时恢复被取消的详情读取，原有记录继续可用。
    if (activeId !== null) {
      void ensureSessionLoaded(activeId)
    } else if (!ready) {
      void initChat()
    }
  }
}

export const newChat = () => {
  if (!get().importingHistory) {
    set({ activeId: null })
    trimSessionCache()
  }
}

export const selectSession = (id: string) => {
  if (!get().importingHistory && get().sessions.some((session) => session.id === id)) {
    touchSession(id)
    set({ activeId: id })
    void ensureSessionLoaded(id)
    trimSessionCache()
  }
}

export const renameSession = (id: string, title: string) => {
  if (get().importingHistory || deletingSessions.has(id)) {return}
  const controller = getStreamController(id)
  if (controller) {titleRequests.delete(controller)}
  void db.renameSession(id, title).then(() => {
    updateSession(id, session => ({ ...session, title }))
    set(state => ({ sessions: state.sessions.map(session => session.id === id ? { ...session, title } : session) }))
  }).catch(db.reportStorageError('rename session'))
}

/**
 * 删除会话；本地原件仅在没有其他会话引用时清理。远端文件不删：导入、编辑、重新生成都会复用同一个附件，
 * 同一服务端文件可能被多个会话引用，不维护引用计数。
 */
export const removeSession = (id: string): Promise<boolean> => {
  const task = removeSessionData(id).finally(() => deletionTasks.delete(task))
  deletionTasks.add(task)
  return task
}

const removeSessionData = async (id: string): Promise<boolean> => {
  if (get().importingHistory || deletingSessions.has(id)) {
    return false
  }
  const epoch = historyEpoch
  deletingSessions.add(id)
  try {
    getStreamController(id)?.abort()
    // 等本会话的流收尾，避免删除之后又被收尾保存写回来。
    await waitForIdle(id)
    if (epoch !== historyEpoch) {
      return false
    }
    await db.deleteSession(id)
    if (epoch !== historyEpoch) {
      return true
    }
    sessionLoads.delete(id)
    sessionAccess.delete(id)
    unsavedSessions.delete(id)
    pendingFiles.delete(id)
    pendingModelSelections.delete(id)
    clearDraft(id)
    set((state) => ({
      sessions: state.sessions.filter((session) => session.id !== id),
      sessionCache: Object.fromEntries(
        Object.entries(state.sessionCache).filter(([key]) => key !== id)
      ),
      sessionLoadErrors: Object.fromEntries(
        Object.entries(state.sessionLoadErrors).filter(([key]) => key !== id)
      ),
      sessionSaveErrors: Object.fromEntries(
        Object.entries(state.sessionSaveErrors).filter(([key]) => key !== id)
      ),
      activeId: state.activeId === id ? null : state.activeId,
    }))
    return true
  } catch (error) {
    db.reportStorageError('delete session')(error)
    return false
  } finally {
    deletingSessions.delete(id)
    // 删除失败时保留会话，并保存停止生成后的最新状态。
    if (getSession(id)) {
      if (get().importingHistory) {
        unsavedSessions.add(id)
      } else {
        persist(id)
      }
    }
  }
}

export const stopReply = (sessionId: string) => getStreamController(sessionId)?.abort()

const sendAttachmentReferences = (sessionId: string | null): AttachmentReference[] => {
  const session = sessionId ? getSession(sessionId) : undefined
  const history = session ? getVisibleMessages(session) : []
  const tasks = useUploads.getState().tasks
  const draft = getDraft(sessionId)
  const references: AttachmentReference[] = draft.attachments.map(attachment => {
    const task = tasks[attachment.id]
    return { location: '当前草稿', file: {
      id: attachment.id, name: attachment.file.name, size: attachment.file.size,
      mimeType: attachment.file.type, isImage: attachment.isImage,
      serverId: task?.status === 'done' ? task.serverId : null,
      providerId: task?.status === 'done' ? task.providerId : undefined,
    } }
  })
  // A text-only access code cannot submit files even on an unselected branch.
  if (useStudio.getState().principal?.role !== 'admin' && session) {
    session.messages.forEach((message, index) => {
      if (message.role === 'user') { references.push(...message.files.map(file => ({ file, location: `历史消息 ${index + 1}` }))) }
    })
  } else {
    getContextRounds(history).forEach(([user], index) => references.push(...user.files.map(file => ({ file, location: `历史第 ${index + 1} 轮` }))))
  }
  return references
}

/** Run before clearing the draft or appending a failed reply. Reads originals; never uploads. */
export const inspectSendAttachments = async (sessionId: string | null, selection = useStudio.getState().selection) => {
  const principalId = useStudio.getState().principal?.id
  const references = sendAttachmentReferences(sessionId)
  const originals = new Set(getDraft(sessionId).attachments.map(file => file.id))
  await Promise.all([...new Set(references.map(({ file }) => file.id))].map(async id => {
    if (!originals.has(id) && await db.loadFile(id)) { originals.add(id) }
  }))
  if (principalId !== useStudio.getState().principal?.id) { throw new Error('登录身份已变化，请重新发送。') }
  const state = useStudio.getState()
  return assessAttachmentCompatibility(references, state.providers, selection, state.principal?.role === 'admin', originals)
}

const omittedAttachmentText = '【纯文字副本：原提问仅含附件，未包含附件内容。】'

/** Explicitly requested copy. The source session, files and draft are never mutated or cleared. */
export const sendTextOnlyCopy = (sourceId: string | null): boolean => {
  if (get().importingHistory || !get().ready || !selectedTarget()) { return false }
  if (sourceId && (deletingSessions.has(sourceId) || getStreamController(sourceId))) { return false }
  const source = sourceId ? getSession(sourceId) : undefined
  if (sourceId && !source) { return false }
  const draft = getDraft(sourceId)
  if (!draft.text.trim() && !draft.attachments.length) { return false }
  const now = Date.now()
  const history: Message[] = (source ? getContextRounds(getVisibleMessages(source)) : []).flatMap(([user, assistant]): Message[] => [
    { id: createId(), role: 'user', content: user.content.trim() ? user.content : omittedAttachmentText, files: [], createdAt: user.createdAt },
    { id: createId(), role: 'assistant', createdAt: assistant.createdAt, model: assistant.model, providerId: assistant.providerId,
      prefix: true, status: 'done', blocks: assistant.blocks.filter(block => block.type === 'text').map(block => ({ ...block, citations: undefined })),
    },
  ])
  const question: UserMessage = { id: createId(), role: 'user', content: draft.text.trim() || omittedAttachmentText, files: [], createdAt: now }
  const reply = createReply()
  const session = normalizeSession({ id: createId(), title: `${source?.title || '对话'} · 文字副本`.slice(0, 120), createdAt: now, updatedAt: now, messages: [...history, question, reply], modelSelection: useStudio.getState().selection })
  touchSession(session.id)
  set(state => ({ sessions: [toSessionSummary(session), ...state.sessions], sessionCache: { ...state.sessionCache, [session.id]: session }, activeId: session.id }))
  persist(session.id)
  void streamReply(session.id, reply, { history: session.messages.slice(0, -2), question: session.messages.at(-2) as UserMessage })
  return true
}

/**
 * 提交指定会话的最新草稿；null 表示新建会话。
 * 同步接收成功才清空草稿，附件原件由会话接管；保存失败仍通过保存入口重试。
 */
export const sendMessage = (targetSessionId: string | null) => {
  if (get().importingHistory || !get().ready || !selectedTarget()) {
    return false
  }
  const prepared = prepareDraftMessage(getDraft(targetSessionId), useUploads.getState().tasks)
  if (!prepared) {
    return false
  }
  const { text, files } = prepared
  const now = Date.now()
  let sessionId = targetSessionId
  if (
    sessionId !== null &&
    (deletingSessions.has(sessionId) || getStreamController(sessionId) || !getSession(sessionId))
  ) {
    return false
  }
  if (sessionId === null) {
    const session: Session = {
      id: createId(),
      title: '',
      createdAt: now,
      updatedAt: now,
      messages: [],
      rootMessageId: null,
      modelSelection: useStudio.getState().selection,
    }
    sessionId = session.id
    touchSession(session.id)
    set((state) => ({
      sessions: [toSessionSummary(session), ...state.sessions],
      sessionCache: { ...state.sessionCache, [session.id]: session },
      activeId: session.id,
    }))
  }
  const current = getSession(sessionId)
  if (!current) {
    return false
  }
  const history = getVisibleMessages(current)
  const question: UserMessage = {
    id: createId(),
    role: 'user',
    content: text,
    files: files.map(({ id, serverId, providerId, name, size, isImage, mimeType }) => ({
      id,
      serverId,
      providerId,
      // 草稿附件已上传成功，每张图片都在上传前检查过长边，超限的已缩小。
      imageSizeChecked: isImage,
      name,
      size,
      isImage,
      mimeType,
    })),
    createdAt: now,
  }
  const reply = createReply()
  updateSession(sessionId, (session) => ({
    ...appendBranch(session, history.at(-1)?.id ?? null, [question, reply]),
    updatedAt: now,
  }))
  if (files.length > 0) {
    pendingFiles.set(sessionId, [
      ...(pendingFiles.get(sessionId) ?? []),
      ...files.map(({ id, blob }) => ({ id, blob })),
    ])
  }
  persist(sessionId)
  clearSentDraft(targetSessionId)
  void streamReply(sessionId, reply, { history, question })
  return true
}

/** 重新生成当前路径上的回答：在原问题下新增版本，不覆盖旧回答和后续对话。 */
export const regenerateReply = (sessionId: string, messageId?: string) => {
  if (get().importingHistory || deletingSessions.has(sessionId)) {
    return
  }
  const session = getSession(sessionId)
  if (!session || getStreamController(sessionId)) {
    return
  }
  const path = getVisibleMessages(session)
  const index =
    messageId === undefined ? path.length - 1 : path.findIndex((m) => m.id === messageId)
  const question = path[index - 1]
  if (question?.role !== 'user' || path[index]?.role !== 'assistant') {
    return
  }
  const history = path.slice(0, index - 1)
  const reply = createReply()
  updateSession(sessionId, (s) => ({
    ...appendBranch(s, question.id, [reply]),
    updatedAt: Date.now(),
  }))
  persist(sessionId)
  void streamReply(sessionId, reply, { history, question }, 'regenerate')
}

/** 编辑提问后新增同父版本，保留原文件；旧问题的所有回答与后续对话仍可切回。 */
export const editMessage = (sessionId: string, messageId: string, content: string): boolean => {
  if (get().importingHistory || deletingSessions.has(sessionId)) {
    return false
  }
  const session = getSession(sessionId)
  if (!session || getStreamController(sessionId)) {
    return false
  }
  const path = getVisibleMessages(session)
  const index = path.findIndex((message) => message.id === messageId)
  const previous = path[index]
  const text = content.trim()
  if (previous?.role !== 'user' || (!text && previous.files.length === 0)) {
    return false
  }
  const question: UserMessage = {
    id: createId(),
    role: 'user',
    content: text,
    files: previous.files,
    createdAt: Date.now(),
  }
  const reply = createReply()
  updateSession(sessionId, (s) => ({
    ...appendBranch(s, path[index - 1]?.id ?? null, [question, reply]),
    updatedAt: Date.now(),
  }))
  persist(sessionId)
  void streamReply(sessionId, reply, { history: path.slice(0, index), question })
  return true
}

export const selectMessageVersion = (sessionId: string, messageId: string) => {
  if (get().importingHistory || deletingSessions.has(sessionId)) {
    return
  }
  if (getStreamController(sessionId)) {
    return
  }
  updateSession(sessionId, (session) => selectVersion(session, messageId))
  persist(sessionId)
}

/** 继续最后一条未完成的回答：保留原消息与开关，仅将新流的内容追加到原块之后。 */
export const continueReply = (sessionId: string, messageId: string) => {
  if (get().importingHistory || deletingSessions.has(sessionId)) {
    return
  }
  const session = getSession(sessionId)
  if (!session || getStreamController(sessionId)) {
    return
  }
  const path = getVisibleMessages(session)
  const question = path.at(-2)
  const previous = path.at(-1)
  if (
    question?.role !== 'user' ||
    previous?.role !== 'assistant' ||
    previous.id !== messageId ||
    !canContinueReply(previous)
  ) {
    return
  }
  const { thinking, search } = useSettings.getState()
  const reply: AssistantMessage = {
    ...previous,
    // 未记录请求配置的回复，续写时使用默认模型和当前开关。
    model: selectedTarget()?.model.id ?? previous.model ?? MODEL,
    providerId: selectedTarget()?.provider.id,
    thinking: !!selectedTarget()?.model.capabilities.thinking && (previous.thinking ?? thinking),
    search: currentCapabilities().search && (previous.search ?? search),
    status: 'pending',
    stopReason: undefined,
    stopDetails: undefined,
    error: undefined,
  }
  updateReply(sessionId, reply)
  updateSession(sessionId, (s) => ({ ...s, updatedAt: Date.now() }))
  persist(sessionId)
  void streamReply(sessionId, reply, { history: path.slice(0, -2), question, prefix: previous }, 'continue')
}

/** 附件补传失败后重试：保留原回答位置，重新补传并请求 */
export const retryUpload = (sessionId: string, messageId: string) => {
  if (get().importingHistory || deletingSessions.has(sessionId)) {
    return
  }
  const session = getSession(sessionId)
  if (!session || getStreamController(sessionId)) {
    return
  }
  const path = getVisibleMessages(session)
  const index = path.findIndex((message) => message.id === messageId)
  const question = path[index - 1]
  const previous = path[index]
  if (
    question?.role !== 'user' ||
    previous?.role !== 'assistant' ||
    previous.error?.kind !== 'upload'
  ) {
    return
  }
  const reply: AssistantMessage = { ...previous, status: 'pending', error: undefined }
  updateReply(sessionId, reply)
  persist(sessionId)
  void streamReply(sessionId, reply, { history: path.slice(0, index - 1), question })
}

type Request = { history: Message[]; question: UserMessage; prefix?: AssistantMessage }

/**
 * 将 serverId 写回所有引用同一附件的消息。传入 null 会清除超限旧图的 ID，触发补传。
 * 尺寸标记随有效 ID 保存，因为本地保留的是原图，刷新后可以直接复用已检查的上传副本。
 */
const saveServerIds = (sessionId: string, serverIds: ReadonlyMap<string, string | null>, providerId?: string) => {
  if (serverIds.size === 0) {
    return
  }
  updateSession(sessionId, (session) => ({
    ...session,
    messages: session.messages.map((message) =>
      message.role === 'user' && message.files.some((file) => serverIds.has(file.id))
        ? {
            ...message,
            files: message.files.map((file) => {
              const serverId = serverIds.get(file.id)
              return serverId === undefined
                ? file
                : { ...file, serverId, providerId: serverId ? (providerId ?? file.providerId) : undefined, imageSizeChecked: file.isImage && serverId !== null }
            }),
          }
        : message
    ),
  }))
  persist(sessionId)
}

/**
 * 附件的服务端 id：已有直接用；正在上传的等待同一任务；否则读取本地原件补传。
 * 本地也没有原件时拒绝本次请求，不能静默跳过附件或复用未知归属的 ID。
 */
type SubmissionTarget = NonNullable<ReturnType<typeof selectedTarget>>
const ensureServerId = async (apiKey: string, file: FileAttachment, target: SubmissionTarget, sessionId: string): Promise<string> => {
  const caps = supportedCapabilities(target.provider, target.model)
  if (!(file.isImage ? caps.vision : caps.files)) {throw new Error('当前模型不支持此附件，请切换模型或新建纯文本对话。')}
  if (file.serverId && file.providerId === target.provider.id) {
    return file.serverId
  }
  const task = useUploads.getState().tasks[file.id]
  if (task?.status === 'done' && task.providerId === target.provider.id) {
    return task.serverId
  }
  const blob = pendingFiles.get(sessionId)?.find(item => item.id === file.id)?.blob ?? await db.loadFile(file.id)
  if (!blob) {
    throw new Error(`附件“${file.name}”缺少可供当前渠道上传的原件。请重新选择原件，或发送前选择创建纯文字副本。`)
  }
  return uploadAttachment(apiKey, file.id, blob, file.name, file.isImage, target)
}

/** 用会话里的最新消息替换请求快照：重传前会重置附件的 serverId，快照必须跟着更新 */
const refreshRequest = (sessionId: string, request: Request): Request => {
  const session = getSession(sessionId)
  if (!session) {
    return request
  }
  const byId = new Map(session.messages.map((message) => [message.id, message]))
  const pick = <T extends Message>(message: T): T =>
    (byId.get(message.id) as T | undefined) ?? message
  return {
    history: request.history.map(pick),
    question: pick(request.question),
    prefix: request.prefix,
  }
}

/**
 * 发送前补齐附件的 serverId。
 * - 本轮提问的附件并行补齐，任一失败则整体失败，已成功的照常写回，重试时复用成功结果；
 * - 历史轮次（仅进入上下文的）中没有 serverId 的附件，多为导入的图片：从最新的消息往前逐张补传，
 *   任一失败则终止请求，原附件引用仍保留供重试或显式创建纯文字副本。
 */
const prepareFiles = async (sessionId: string, request: Request, signal: AbortSignal, target: SubmissionTarget) => {
  const epoch = historyEpoch
  // 服务端判定 file_id 失效时会清掉会话里的 serverId，先用最新消息替换请求快照，
  // 否则快照里仍是旧 id，补传会直接复用它。
  request = refreshRequest(sessionId, request)
  const apiKey = useSettings.getState().apiKey ?? ''
  const serverIds = new Map<string, string>()
  // 停止生成立即生效；上传本身不取消（输入框与其他消息可能共用同一任务），完成后照常写回 serverId
  const aborted = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
  // 旧图片超限时先清除 ID，交给下方已有的附件补传流程。
  const files = [
    ...request.question.files,
    ...getContextRounds(request.history).flatMap(([user]) => user.files),
  ]
  const caps = supportedCapabilities(target.provider, target.model)
  if (files.some(file => file.isImage ? !caps.vision : !caps.files)) {
    throw new Error('本次提交的模型不支持会话中的附件。请在发送前选择兼容模型，或明确创建纯文字副本。')
  }
  const checked = await Promise.race([checkImageFileIds(files.filter(file => file.providerId === target.provider.id), signal), aborted])
  if (checked.size > 0) {
    saveServerIds(sessionId, checked)
    request = refreshRequest(sessionId, request)
  }
  const uploads = Promise.allSettled(
    request.question.files.map(async (file) => {
      const serverId = await ensureServerId(apiKey, file, target, sessionId)
      if (serverId && (serverId !== file.serverId || file.providerId !== target.provider.id)) {
        serverIds.set(file.id, serverId)
      }
    })
  )
  void uploads.then(() => {
    if (epoch === historyEpoch) {
      saveServerIds(sessionId, serverIds, target.provider.id)
    }
  })
  const results = await Promise.race([uploads, aborted])
  const failed = results.find((result) => result.status === 'rejected')
  if (failed) {
    throw failed.reason
  }

  const pending = new Map<string, FileAttachment>()
  for (const [user] of getContextRounds(request.history).toReversed()) {
    for (const file of user.files) {
      if ((!file.serverId || file.providerId !== target.provider.id) && !serverIds.has(file.id) && !pending.has(file.id)) {
        pending.set(file.id, file)
      }
    }
  }
  for (const file of pending.values()) {
    signal.throwIfAborted()
    try {
      const serverId = await Promise.race([ensureServerId(apiKey, file, target, sessionId), aborted])
      if (serverId) {
        serverIds.set(file.id, serverId)
        saveServerIds(sessionId, new Map([[file.id, serverId]]), target.provider.id)
      }
    } catch (error) {
      signal.throwIfAborted()
      throw error
    }
  }

  // 用补齐后的会话重新取历史与提问，保证请求里都是 serverId
  const session = getSession(sessionId)
  const resolve = <T extends Message>(message: T): T =>
    (session?.messages.find((m) => m.id === message.id) as T | undefined) ?? message
  return {
    history: request.history.map(resolve),
    question: resolve(request.question),
    prefix: request.prefix,
  }
}

/** Only identifiers (never credentials) are remembered to restore the open conversation. */
useChatStore.subscribe((state, previous) => {
  if (state.activeId !== previous.activeId) {
    try { sessionStorage.setItem(`${historyDatabaseName()}:active`, state.activeId ?? '') } catch { /* storage may be unavailable */ }
    if (state.activeId) {
      const session = getSession(state.activeId)
      restoreModelSelection(session ? sessionModelSelection(session) : null)
    } else {
      const selection = newChatModelSelection()
      useStudio.setState({ selection, selectionResolved: selection !== null })
    }
  }
})

const pauseRemote = () => new Promise<void>(resolve => setTimeout(resolve, 500))
const adoptServerSession = (session: Session) => {
  // A queued poll may predate an acknowledged metadata save; never roll back revision/choice.
  if ((session.revision ?? 0) < sessionRevision(session.id)) { return }
  rememberRevision(session)
  const pending = pendingModelSelections.get(session.id)
  const normalized = normalizeSession(session)
  updateSession(session.id, () => ({ ...normalized, modelSelection: pending ?? sessionModelSelection(normalized) }))
  restoreSessionModel(session.id)
  unsavedSessions.delete(session.id)
  if (!pending) { set(state => ({ sessionSaveErrors: Object.fromEntries(Object.entries(state.sessionSaveErrors).filter(([id]) => id !== session.id)) })) }
}

/** Polling is a detachable subscriber. Only an explicit abort/stop action calls /stop. */
const monitorServerJob = async (initialJob: ServerJob, existingController?: AbortController) => {
  const controller = existingController ?? new AbortController(), sessionId = initialJob.sessionId
  set(state => ({ streaming: { ...state.streaming, [sessionId]: controller } }))
  let job = initialJob, after = '', stopAcknowledged = false
  try {
    for (;;) {
      if (!useStudio.getState().authenticated) {return}
      if (controller.signal.aborted && !stopAcknowledged) {
        try { await remoteApi(`/jobs/${encodeURIComponent(job.id)}/stop`, { method: 'POST' }); stopAcknowledged = true }
        catch (error) { if (error instanceof StudioError && [401, 403, 404].includes(error.status)) {return} }
      }
      if (job.session) { adoptServerSession(job.session); after = String(job.session.revision ?? '') }
      if (job.status && job.status !== 'running') {return}
      await pauseRemote()
      try { job = await remoteApi<ServerJob>(`/jobs/${encodeURIComponent(job.id)}?after=${encodeURIComponent(after)}`) }
      catch (error) {
        if (error instanceof StudioError && [401, 403, 404].includes(error.status)) {return}
        // Keep the task active in the UI while reconnecting; never recreate it.
        job = { ...job, session: undefined }
      }
    }
  } finally {
    titleRequests.delete(controller)
    set(state => ({ streaming: Object.fromEntries(Object.entries(state.streaming).filter(([id, value]) => id !== sessionId || value !== controller)) }))
    trimSessionCache()
  }
}

/** Submit one durable, idempotent server job, then attach a disposable subscriber. */
const streamReply = async (sessionId: string, initial: AssistantMessage, request: Request, trigger: 'send' | 'regenerate' | 'continue' = 'send') => {
  const target = selectedTarget(initial.providerId && initial.model ? { providerId: initial.providerId, modelId: initial.model } : useStudio.getState().selection)
  const principalId = useStudio.getState().principal?.id
  // Capture this submission before uploads/awaits. Later UI changes cannot alter its retries.
  const reasoningEffort = (target?.provider.type === 'openai' || target?.provider.type === 'deepseek') && target.model.capabilities.thinking && initial.thinking
    ? resolveReasoningEffort(target.model.reasoningEffort, getReasoningEffortPreference(principalId ? {
      principalId, providerId: target.provider.id, modelId: target.model.id,
    } : null, target.model.reasoningEfforts, target.provider.type), target.model.reasoningEfforts, target.provider.type)
    : undefined
  const controller = new AbortController()
  if (!getSession(sessionId)?.title) {titleRequests.add(controller)}
  set(state => ({ streaming: { ...state.streaming, [sessionId]: controller } }))
  let reply = initial, submitted = false, preparing = true
  try {
    if (!target) {throw new Error('所选模型已不可用，请刷新模型目录后重试。')}
    const capabilities = supportedCapabilities(target.provider, target.model)
    const prepared = await prepareFiles(sessionId, request, controller.signal, target)
    preparing = false
    controller.signal.throwIfAborted()
    const latestReminder = prepared.prefix ? prepared.prefix.latestReminder : createLatestReminder(useSettings.getState())
    reply = { ...reply, latestReminder }
    updateReply(sessionId, reply)
    // Persist attachment originals locally before handing ownership to the server.
    const session = getSession(sessionId)
    if (!session) {throw new Error('会话已被移除')}
    await db.saveSession(session, pendingFiles.get(sessionId))
    pendingFiles.delete(sessionId)
    await sessionPersists.get(sessionId)
    await modelSelectionSaves.get(sessionId)
    await waitForSessionWrites(sessionId)
    controller.signal.throwIfAborted()
    const body: CreateMessageRequest = {
      model: target.model.id,
      max_tokens: target.model.maxOutputTokens,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      system: SYSTEM_PROMPT,
      messages: toRequestMessages(prepared.history, prepared.question, prepared.prefix, initial.thinking ?? false, latestReminder, target.provider.id, target.model.id),
      thinking: { type: capabilities.thinking && initial.thinking ? 'enabled' : 'disabled' },
      safety_check: SAFETY_CHECK,
      tools: capabilities.search ? serverTools(initial.search ?? false, target.provider.type) : [],
      ...(titleRequests.has(controller) ? { title: { enabled: true } } : {}),
    }
    // Capture exactly one payload. A lost response retries the same identity and cannot bill twice.
    const payload = JSON.stringify({ id: createId(), replyId: initial.id, trigger, session: getSession(sessionId), revision: sessionRevision(sessionId), request: body })
    let job: ServerJob | undefined
    for (let attempt = 0; ; attempt++) {
      try { job = await remoteApi<ServerJob>('/jobs', { method: 'POST', headers: { 'x-studio-provider': target.provider.id }, body: payload }); break }
      catch (error) { if (error instanceof StudioError && error.status < 500 || attempt >= 2 || !useStudio.getState().authenticated) {throw error} await pauseRemote() }
    }
    submitted = true
    if (job) {await monitorServerJob(job, controller)}
  } catch (error) {
    if (!submitted) {
      reply = settleReply(reply, controller.signal.aborted ? 'stopped' : 'error', Date.now(), controller.signal.aborted ? undefined : {
        kind: preparing ? 'upload' : error instanceof ApiError ? error.kind : 'network',
        message: error instanceof Error ? error.message : '提交任务失败；请刷新以确认服务端任务状态。',
        ...(preparing && error instanceof ApiError ? { localMessage: describeUploadError(error), retryable: isRetryableApiError(error) } : {}),
      })
      updateReply(sessionId, reply)
      persist(sessionId)
    }
  } finally {
    titleRequests.delete(controller)
    set(state => ({ streaming: Object.fromEntries(Object.entries(state.streaming).filter(([id, value]) => id !== sessionId || value !== controller)) }))
  }
}
