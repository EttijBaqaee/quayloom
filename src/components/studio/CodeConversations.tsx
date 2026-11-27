import { useUiText, uiText } from '../../i18n/ui.js'
import { workspaceEn } from '../../i18n/workspace.en.js'
import { useSettings } from '../../services/settings.js'
import { useEffect, useRef, useState } from 'react'
import { studioApi } from '../../services/studio.js'
import { getVisibleMessages } from '../../services/chat/branches.js'
import type { Session, SessionSummary } from '../../services/chat/types.js'
import { Markdown } from '../markdown/Markdown.js'
import { ChatStatistics } from './ChatStatistics.js'
import './codeConversations.css'

const translateText = (text: string, params?: Record<string, string | number>) => uiText(workspaceEn, text, params)

type Code = { id: string; name: string; enabled: boolean; expiresAt: number | null }
type Listing = { codes: Code[]; sessions: SessionSummary[]; jobs: { sessionId: string }[] }
const statuses = { pending: '等待生成', streaming: '生成中', done: '已完成', stopped: '已停止', error: '生成失败' }

export function CodeConversations({ onClose }: { onClose: () => void }) {
  const t = useUiText(workspaceEn)
  const dialog = useRef<HTMLDialogElement>(null)
  const [owner, setOwner] = useState(''), [selected, setSelected] = useState('')
  const [listing, setListing] = useState<Listing>({ codes: [], sessions: [], jobs: [] })
  const [session, setSession] = useState<Session | null>(null)
  const [allVersions, setAllVersions] = useState(false), [error, setError] = useState('')
  const [view, setView] = useState<'chat' | 'statistics'>('chat')
  const [loading, setLoading] = useState(true)
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close() }, [])
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    setLoading(true); setError(''); setSession(null)
    async function refresh() {
      try {
        const result = await studioApi<Listing>(`/admin/conversations${owner ? `?owner=${encodeURIComponent(owner)}` : ''}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
        if (disposed) { return }
        setListing(result)
        if (owner && selected) {
          const detail = await studioApi<{ session: Session }>(`/admin/conversations/${encodeURIComponent(owner)}/${encodeURIComponent(selected)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
          if (!disposed) { setSession(detail.session) }
        }
        if (!disposed) { setError('') }
      } catch (e) { if (!disposed) { setError(e instanceof Error ? e.message : translateText('无法读取对话')) } }
      finally { if (!disposed) { setLoading(false); timer = setTimeout(() => void refresh(), 2000) } }
    }
    void refresh()
    return () => { disposed = true; controller.abort(); clearTimeout(timer) }
  }, [owner, selected])
  const messages = session ? allVersions ? session.messages : getVisibleMessages(session) : []
  return <dialog ref={dialog} className="studio-conversations" aria-labelledby="code-conversations-title" onCancel={onClose}>
    <header><div><h2 id="code-conversations-title">{t('使用码对话')}</h2></div><button type="button" onClick={onClose} aria-label={t('关闭使用码对话')}>{t('关闭')}</button></header>
    <label className="studio-conversations-filter">{t('使用码')}<select aria-label={t('查看哪个使用码的对话')} value={owner} onChange={e => {
      setOwner(e.target.value); setSelected(''); setSession(null); setView('chat'); setAllVersions(false)
      setListing(value => ({ ...value, sessions: [], jobs: [] }))
    }}><option value="">{t('请选择使用码')}</option>{listing.codes.map(code => <option key={code.id} value={code.id}>{code.name} · {code.id.slice(0, 8)}{!code.enabled ? t('（已停用）') : code.expiresAt && code.expiresAt <= Date.now() ? t('（已到期）') : ''}</option>)}</select></label>
    {error && <p role="alert" className="studio-error">{error}</p>}
    <div className="studio-conversations-body">
      <nav aria-label={t('使用码会话列表')}>{!owner ? <p>{t('选择使用码以查看其对话。')}</p> : loading && !listing.sessions.length ? <p role="status">{t('正在读取…')}</p> : !listing.sessions.length ? <p>{t('暂无服务端对话。')}</p> : listing.sessions.map(item => <button key={item.id} type="button" aria-pressed={selected === item.id} onClick={() => {
        setSelected(item.id); setSession(null); setView('chat'); setAllVersions(false)
      }}><strong>{item.title || t('未命名对话')}</strong><small>{new Date(item.updatedAt).toLocaleString(useSettings.getState().locale)}{listing.jobs.some(job => job.sessionId === item.id) ? t(' · 生成中') : ''}</small></button>)}</nav>
      <section className={`studio-conversations-messages${view === 'statistics' ? ' is-statistics' : ''}`} aria-label={view === 'statistics' ? t('使用码会话统计') : t('使用码消息内容')}>
        {!selected ? <p>{t('选择一条会话查看消息。')}</p> : !session ? <p role="status">{t('正在读取消息…')}</p> : <>
          <h3>{session.title || t('未命名对话')}</h3>
          <div className="studio-conversations-tabs" role="group" aria-label={t('管理员只读视图')}>
            <button type="button" aria-pressed={view === 'chat'} onClick={() => setView('chat')}>{t('对话')}</button>
            <button type="button" aria-pressed={view === 'statistics'} onClick={() => setView('statistics')}>{t('统计')}</button>
          </div>
          {view === 'statistics' ? <ChatStatistics key={`${owner}:${selected}`} ownerId={owner} sessionId={selected} /> : <>
            <label><input type="checkbox" checked={allVersions} onChange={e => setAllVersions(e.target.checked)} />{t('包含所有消息版本')}</label>
            {messages.map(message => <article key={message.id}>
              <header><strong>{message.role === 'user' ? t('用户') : t('助手')}</strong><small>{new Date(message.createdAt).toLocaleString(useSettings.getState().locale)}{message.role === 'assistant' ? ` · ${t(statuses[message.status])} · ${message.model || ''}` : ''}</small></header>
              {message.role === 'user' ? <><p className="studio-conversations-text">{message.content}</p>{message.files.map(file => <p key={file.id}>{t('附件：{name}', { name: file.name })}</p>)}</> : <>
                {message.blocks.filter(block => block.type !== 'thinking' || (!block.opaqueReasoning && !block.responsesContext) || block.thinking).map((block, index) => block.type === 'text' ? <Markdown key={index} content={block.text} loading={message.status === 'streaming'} cacheKey={`${owner}:${message.id}:${index}`} disableLink={false} /> : block.type === 'thinking' ? <details key={index}><summary>{t('思考过程')}</summary><p className="studio-conversations-text">{block.thinking}</p></details> : <details key={index}><summary>{t('工具事件 · {type}', { type: block.type })}</summary><pre>{JSON.stringify(block, null, 2)}</pre></details>)}
                {message.error && <p className="studio-error">{message.error.message}</p>}
              </>}
            </article>)}
          </>}
        </>}
      </section>
    </div>
  </dialog>
}
