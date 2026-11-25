import { useUiText } from '../../i18n/ui.js'
import { chromeEn } from '../../i18n/chrome.en.js'
import clsx from 'clsx'
import { useState, type KeyboardEvent } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import type { Session } from '../../services/chat/types.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { MessageList } from '../messages/MessageList.js'
import { ChatStatistics } from '../studio/ChatStatistics.js'
import { MobileHeader } from './MobileHeader.js'
import styles from './SessionView.module.css'

type View = 'chat' | 'statistics'

/** 会话页：仅挂载可见视图；切换统计不取消服务端生成。 */
export const SessionView = ({
  session,
  streaming,
  siderCollapsed,
}: {
  session: Session
  streaming: boolean
  siderCollapsed: boolean
}) => {
  const t = useTranslate()
  const tUi = useUiText(chromeEn)
  const isMobile = useIsMobile()
  const title = session.title || t('untitledChat')
  const [selection, setSelection] = useState<{ sessionId: string; view: View }>({ sessionId: session.id, view: 'chat' })
  const view = selection.sessionId === session.id ? selection.view : 'chat'
  const choose = (next: View) => setSelection({ sessionId: session.id, view: next })
  const tabId = (name: View) => `session-${session.id}-${name}-tab`
  const panelId = (name: View) => `session-${session.id}-${name}-panel`
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { return }
    event.preventDefault()
    const next = event.key === 'Home' ? 'chat' : event.key === 'End' ? 'statistics' : view === 'chat' ? 'statistics' : 'chat'
    choose(next)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-view="${next}"]`)?.focus()
  }
  const tabs = <div className={styles.viewTabs} role="tablist" aria-label={tUi('会话视图')} onKeyDown={onTabKeyDown}>
    {(['chat', 'statistics'] as const).map(name => <button key={name} id={tabId(name)} data-view={name} type="button" role="tab" aria-selected={view === name} aria-controls={panelId(name)} tabIndex={view === name ? 0 : -1} onClick={() => choose(name)}>{tUi(name === 'chat' ? '对话' : '统计')}</button>)}
  </div>
  return (
    <div className={styles.view}>
      {isMobile ? (
        <MobileHeader title={title}>{tabs}</MobileHeader>
      ) : (
        <div className={styles.header}>
          <div className={clsx(styles.title, siderCollapsed && styles.withCollapsedSider)} title={title}>{title}</div>
          {tabs}
        </div>
      )}
      <div className={clsx(styles.panel, view === 'statistics' && styles.statisticsPanel)} id={panelId(view)} role="tabpanel" aria-labelledby={tabId(view)}>
        {view === 'statistics' ? <ChatStatistics key={session.id} sessionId={session.id} /> : <MessageList
          session={session}
          streaming={streaming}
          footer={
            <div className={styles.inputContainer}>
              <ChatInput sessionId={session.id} />
            </div>
          }
        />}
      </div>
    </div>
  )
}
