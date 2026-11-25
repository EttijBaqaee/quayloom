import { useUiText } from '../../i18n/ui.js'
import { chromeEn } from '../../i18n/chrome.en.js'
import clsx from 'clsx'
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  IconGlobeLanguageOutline14,
  IconPaperclipOutline16,
  IconSendOutline16,
  IconStopFill16,
  IconThinkOutline14,
} from '../base/icons.js'
import {
  getReasoningEffortPreference,
  getSupportedReasoningEfforts,
  resolveReasoningEffort,
  setReasoningEffortPreference,
  setSearch,
  setThinking,
  useSettings,
} from '../../services/settings.js'
import { useIsMobile } from '../../app/viewport.js'
import { inspectSendAttachments, sendMessage, sendTextOnlyCopy, stopReply, useChatStore } from '../../services/chat/store.js'
import { AttachmentCompatibilityDialog } from '../studio/AttachmentCompatibilityDialog.js'
import type { AttachmentCompatibility } from '../../services/chat/attachmentCompatibility.js'
import {
  addDraftFiles,
  EMPTY_DRAFT,
  getDraft,
  prepareDraftMessage,
  removeDraftAttachment,
  retryDraftAttachment,
  setDraftText,
  useDrafts,
} from '../../services/chat/drafts.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import { IconButton } from '../base/IconButton.js'
import { Tooltip } from '../base/Tooltip.js'
import { ensureApiKey } from '../settings/settingsDialogState.js'
import { DragMask, useFileDrop } from './DragMask.js'
import { showToast } from '../base/toastState.js'
import { ACCEPT, useUploads } from '../../services/attachments.js'
import { DraftAttachments } from './DraftAttachments.js'
import { useVoiceInput } from './useVoiceInput.js'
import { VoiceButton } from './VoiceButton.js'
import { Spectrum } from './Spectrum.js'
import { ModelPicker } from './ModelPicker.js'
import { ChatMetricsBar } from '../studio/ChatStatistics.js'
import { useTranslate } from '../../i18n/index.js'
import styles from './ChatInput.module.css'
import { currentCapabilities, selectedTarget, useStudio } from '../../services/studio.js'
import { isImage, resolveMimeType } from '../../services/attachments.js'

/** 输入框：自适应高度的文本框 + 文件 + 深度思考与智能搜索开关 + 语音输入 + 发送 / 停止 */
export const ChatInput = memo(function ChatInput({ sessionId }: { sessionId: string | null }) {
  // 切换目标时释放录音、转写和 DOM 状态；文字与附件由草稿服务保留。
  const key = sessionId === null ? 'new' : `session:${sessionId}`
  return <><Input key={key} sessionId={sessionId} /><ChatMetricsBar key={`metrics:${key}`} sessionId={sessionId} /></>
})

const Input = ({ sessionId }: { sessionId: string | null }) => {
  const t = useTranslate()
  const tUi = useUiText(chromeEn)
  useStudio(s => s.selection)
  useStudio(s => s.providers)
  const principal = useStudio(s => s.principal)
  const target = selectedTarget()
  const caps = currentCapabilities()
  const chinese = useSettings(state => state.locale) === 'zh-CN'
  useSettings(state => state.reasoningEffortPreferences)
  const reasoningScope = principal && target ? {
    principalId: principal.id, providerId: target.provider.id, modelId: target.model.id,
  } : null
  const supportedEfforts = getSupportedReasoningEfforts(target?.model.reasoningEfforts, target?.provider.type)
  const reasoningPreference = getReasoningEffortPreference(reasoningScope, target?.model.reasoningEfforts, target?.provider.type)
  const strengthSupported = (target?.provider.type === 'openai' || target?.provider.type === 'deepseek') && caps.thinking && supportedEfforts.length > 0
  const effortNames = chinese
    ? { minimal: '极低', low: '低', medium: '中', high: '高', xhigh: '极高', max: '最大' }
    : { minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Maximum' }
  const configuredEffort = resolveReasoningEffort(target?.model.reasoningEffort, '', target?.model.reasoningEfforts, target?.provider.type)
  const defaultEffortLabel = `${chinese ? '渠道默认' : 'Channel default'} · ${configuredEffort ? effortNames[configuredEffort] : chinese ? '未指定' : 'unspecified'}`
  const [capabilityError, setCapabilityError] = useState('')
  const [compatibility, setCompatibility] = useState<AttachmentCompatibility | null>(null)
  const [inspecting, setInspecting] = useState(false)
  const sendInProgress = useRef(false)
  const compatibilityDraft = useRef<ReturnType<typeof getDraft> | null>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const draft = useDrafts((state) => state.drafts.get(sessionId) ?? EMPTY_DRAFT)
  const { text, attachments } = draft
  const setText = (value: string) => setDraftText(sessionId, value)
  const draftReady = useUploads((state) => prepareDraftMessage(draft, state.tasks) !== null)
  const streaming = useChatStore(
    (state) => sessionId !== null && Object.hasOwn(state.streaming, sessionId)
  )
  const thinking = useSettings((state) => state.thinking)
  const importingHistory = useChatStore((state) => state.importingHistory)
  const isMobile = useIsMobile()
  const search = useSettings((state) => state.search)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const togglesRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const toggles = togglesRef.current
    if (!toggles) {
      return
    }

    const updateLabels = () => {
      toggles.classList.remove(styles.collapsedToggles)
      toggles.classList.toggle(styles.collapsedToggles, toggles.scrollWidth > toggles.clientWidth)
    }

    updateLabels()
    const observer = new ResizeObserver(updateLabels)
    observer.observe(toggles)
    return () => observer.disconnect()
  }, [t])

  const acceptFiles = (files: File[]) => {
    if (files.length === 0 || useChatStore.getState().importingHistory || !ensureApiKey()) {
      return
    }
    if (files.some(file => isImage(resolveMimeType(file)) ? !caps.vision : !caps.files)) {
      setCapabilityError(tUi('当前模型不支持此类附件。请在模型管理中选择支持文档 / 图片的模型。')); return
    }
    const error = addDraftFiles(sessionId, files, useSettings.getState().apiKey ?? '')
    if (error) {
      showToast(error)
    }
  }
  const retryFile = useCallback(
    (id: string) => {
      if (!useChatStore.getState().importingHistory && ensureApiKey()) {
        retryDraftAttachment(sessionId, id, useSettings.getState().apiKey ?? '')
      }
    },
    [sessionId]
  )
  const removeFile = useCallback(
    (id: string) => {
      if (!useChatStore.getState().importingHistory) {
        removeDraftAttachment(sessionId, id)
      }
    },
    [sessionId]
  )
  const dragging = useFileDrop(acceptFiles)

  /** 转写结果插入到光标处，并把光标移到插入内容之后 */
  const voice = useVoiceInput((transcript) => {
    const textarea = textareaRef.current
    const current = getDraft(sessionId).text
    const start = textarea?.selectionStart ?? current.length
    const end = textarea?.selectionEnd ?? current.length
    setText(current.slice(0, start) + transcript + current.slice(end))
    requestAnimationFrame(() => {
      textarea?.focus({ preventScroll: true })
      textarea?.setSelectionRange(start + transcript.length, start + transcript.length)
    })
  })

  // 欢迎页导入后会话 ID 不变，不能依赖卸载取消语音；订阅开始事件也覆盖快速完成的导入。
  const cancelVoice = voice.cancel
  useEffect(
    () =>
      useChatStore.subscribe((state, previous) => {
        if (state.importingHistory && !previous.importingHistory) {
          cancelVoice()
        }
      }),
    [cancelVoice]
  )

  // 移动端录音时用频谱替代输入框内容
  const recording = voice.status === 'recording'

  // 附件始终保留；正常图文提交仍要求上传成功，不兼容时允许进入显式副本选择。
  const canSend = !inspecting && !importingHistory && !streaming && voice.status === 'idle' && (draftReady || !!text.trim() || attachments.length > 0)

  const finishSend = () => {
    stopReadAloud()
    if (isMobile) { textareaRef.current?.blur() } else { textareaRef.current?.focus() }
  }
  const send = async () => {
    if (sendInProgress.current || useChatStore.getState().importingHistory || streaming || voice.status !== 'idle' || !ensureApiKey()) { return }
    const draftSnapshot = getDraft(sessionId)
    if (!draftSnapshot.text.trim() && !draftSnapshot.attachments.length) { return }
    const chatSnapshot = useChatStore.getState()
    const studioSnapshot = useStudio.getState()
    sendInProgress.current = true
    setInspecting(true)
    try {
      const result = await inspectSendAttachments(sessionId)
      if (!mounted.current) { return }
      const currentChat = useChatStore.getState(), currentStudio = useStudio.getState()
      if (getDraft(sessionId) !== draftSnapshot || currentChat.activeId !== chatSnapshot.activeId ||
        (sessionId && currentChat.sessionCache[sessionId] !== chatSnapshot.sessionCache[sessionId]) ||
        currentStudio.selection !== studioSnapshot.selection || currentStudio.providers !== studioSnapshot.providers ||
        currentStudio.principal !== studioSnapshot.principal) {
        setCapabilityError(tUi('草稿、会话或模型已变化，请重新发送以检查附件。')); return
      }
      if (result.issues.length) { compatibilityDraft.current = draftSnapshot; setCompatibility(result); return }
      if (!prepareDraftMessage(draftSnapshot, useUploads.getState().tasks)) {
        setCapabilityError(tUi('附件尚未上传成功，请等待完成或重试上传。')); return
      }
      // Snapshot checks and the synchronous send share one turn; nothing can swap the draft between them.
      if (sendMessage(sessionId)) { finishSend() }
    } catch (error) {
      setCapabilityError(error instanceof Error ? error.message : tUi('附件检查失败，请重试。'))
    } finally { sendInProgress.current = false; setInspecting(false) }
  }

  return (
    <div
      className={clsx(styles.wrapper, sessionId === null ? styles.home : styles.session)}
      data-ql-composer
      data-session-id={sessionId ?? 'new'}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          textareaRef.current?.focus({ preventScroll: true })
        }
      }}
    >
      {compatibility && <AttachmentCompatibilityDialog result={compatibility} busy={inspecting}
        onCancel={() => setCompatibility(null)}
        onChooseModel={async selection => {
          if (sendInProgress.current) { return }
          sendInProgress.current = true; setInspecting(true)
          const sourceDraft = getDraft(sessionId), sourceStudio = useStudio.getState()
          try {
            const current = await inspectSendAttachments(sessionId, selection)
            if (!mounted.current) { return }
            if (sourceDraft !== getDraft(sessionId) || sourceStudio.principal !== useStudio.getState().principal || sourceStudio.providers !== useStudio.getState().providers) {
              setCapabilityError(tUi('草稿或模型目录已变化，请重新发送。')); setCompatibility(null); return
            }
            if (current.issues.length) { compatibilityDraft.current = sourceDraft; setCompatibility(current); return }
            if (Object.keys(useChatStore.getState().streaming).length || Object.values(useUploads.getState().tasks).some(task => task.status === 'uploading')) {
              setCapabilityError(tUi('上传或回复进行中，请完成后再切换模型。')); return
            }
            stopReadAloud(); useStudio.setState({ selection }); setCompatibility(null)
          } catch (error) { setCapabilityError(error instanceof Error ? error.message : tUi('附件检查失败，请重试。')) }
          finally { sendInProgress.current = false; if (mounted.current) { setInspecting(false) } }
        }}
        onTextOnly={() => {
          if (getDraft(sessionId) !== compatibilityDraft.current) { setCompatibility(null); setCapabilityError(tUi('草稿已变化，请重新发送以确认附件。')); return }
          if (sendTextOnlyCopy(sessionId)) { setCompatibility(null); finishSend() }
        }}
      />}
      {capabilityError && <div role="alert" className={styles.capabilityError}><span>{capabilityError}</span><button type="button" onClick={() => setCapabilityError('')}>{chinese ? '关闭' : 'Dismiss'}</button></div>}
      <DraftAttachments items={attachments} onRetry={retryFile} onRemove={removeFile} />
      <div className={styles.textareaWrapper}>
        <textarea
          ref={textareaRef}
          className={clsx(styles.textarea, recording && isMobile && styles.textareaHidden)}
          placeholder={t('chatInputPlaceholderChat')}
          rows={2}
          // 移动端不自动聚焦，避免一打开就弹出键盘
          autoFocus={!isMobile}
          disabled={importingHistory || inspecting}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onMouseDown={(event) => {
            // 首次点击时手动聚焦，避免 Safari 把整个页面滚到输入框位置。
            if (isMobile && event.button === 0 && document.activeElement !== event.currentTarget) {
              event.preventDefault()
              event.currentTarget.focus({ preventScroll: true })
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              send()
            }
          }}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files)
            if (files.length > 0) {
              event.preventDefault()
              acceptFiles(files)
            }
          }}
        />
        {recording && isMobile ? <Spectrum getAnalyser={voice.getAnalyser} /> : null}
        <div className={styles.mirror} aria-hidden>
          {`${text}\n`}
        </div>
      </div>
      <div className={styles.configurationRow} data-ql-model-row>
        <ModelPicker />
        {target && <div className={styles.reasoningControl} data-reasoning-supported={strengthSupported ? 'true' : 'false'}>
          {strengthSupported && <label className={styles.reasoningLabel}>
            <span className={styles.srOnly}>{chinese ? '思考强度' : 'Reasoning effort'}</span>
            <select
              className={styles.reasoningSelect}
              aria-label={chinese ? '下次请求的思考强度' : 'Reasoning effort for the next request'}
              title={chinese ? `思考强度${thinking ? '' : ' · 思考已关闭'}` : `Reasoning effort${thinking ? '' : ' · Reasoning is off'}`}
              value={reasoningPreference}
              disabled={!thinking || importingHistory || !reasoningScope}
              onChange={event => setReasoningEffortPreference(reasoningScope, event.target.value, target.model.reasoningEfforts, target.provider.type)}
            >
              <option value="">{defaultEffortLabel}</option>
              {supportedEfforts.map(effort => <option key={effort} value={effort}>{effortNames[effort]}</option>)}
            </select>
          </label>}
        </div>}
      </div>
      <div className={styles.functionRow}>
        {/* 深度思考 / 智能搜索开关，tooltip 在按钮上方 */}
        <div ref={togglesRef} className={styles.toggles}>
          <Tooltip content={t('deactivatedThinkTooltip')}>
            <button
              type="button"
              disabled={!caps.thinking}
              title={caps.thinking ? undefined : tUi('当前模型不支持深度思考')}
              className={clsx(styles.toggle, caps.thinking && thinking && styles.selected)}
              aria-label={t('thinkingSwitch')}
              aria-pressed={caps.thinking && thinking}
              onClick={() => setThinking(!thinking)}
            >
              <IconThinkOutline14 />
              <span className={styles.toggleLabel}>{t('thinkingSwitch')}</span>
            </button>
          </Tooltip>
          <Tooltip content={caps.search ? t('deactivatedSearchTooltip') : chinese ? '当前渠道尚未适配或未启用联网搜索' : 'Web search is not adapted or enabled for this channel'}>
            <button
              type="button"
              disabled={!caps.search}
              title={caps.search ? undefined : chinese ? '当前渠道尚未适配或未启用联网搜索' : 'Web search is not adapted or enabled for this channel'}
              className={clsx(styles.toggle, caps.search && search && styles.selected)}
              aria-label={t('search')}
              aria-pressed={caps.search && search}
              onClick={() => setSearch(!search)}
            >
              <IconGlobeLanguageOutline14 />
              <span className={styles.toggleLabel}>{t('search')}</span>
            </button>
          </Tooltip>
        </div>
        <div className={styles.right}>
          {(caps.speech || voice.status !== 'idle') && <VoiceButton
            status={voice.status}
            disabled={voice.status === 'idle' && (!voice.available || !caps.speech || importingHistory)}
            seconds={voice.seconds}
            onClick={() => {
              if (
                voice.status !== 'idle' ||
                (caps.speech && !useChatStore.getState().importingHistory && ensureApiKey())
              ) {
                void voice.toggle()
              }
            }}
          />}
          <IconButton
            size="m"
            tone="primary"
            className={styles.attachmentButton}
            icon={<IconPaperclipOutline16 />}
            tooltip={t('uploadFile')}
            disabled={importingHistory || (!caps.files && !caps.vision)}
            onClick={() => ensureApiKey() && fileInputRef.current?.click()}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept={ACCEPT}
            onChange={(event) => {
              acceptFiles(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
          {streaming && sessionId ? (
            <button
              type="button"
              className={clsx(styles.sendButton, styles.stopButton)}
              aria-label={t('chatInputStopButtonTooltip')}
              onClick={() => {
                stopReadAloud()
                stopReply(sessionId)
              }}
            >
              <IconStopFill16 />
            </button>
          ) : (
            <button
              type="button"
              className={clsx(styles.sendButton, !canSend && styles.disabled)}
              aria-label={t('send')}
              aria-disabled={!canSend}
              onClick={send}
            >
              <IconSendOutline16 />
            </button>
          )}
        </div>
      </div>
      {dragging ? <DragMask /> : null}
    </div>
  )
}
