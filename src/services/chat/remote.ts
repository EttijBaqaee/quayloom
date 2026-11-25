import { studioApi, StudioError, useStudio } from '../studio.js'
import type { Session, SessionSummary } from './types.js'

const revisions = new Map<string, number>()
const writes = new Map<string, Promise<void>>()
export type ServerJob = { id: string; sessionId: string; replyId: string; status?: 'running' | 'done' | 'stopped' | 'error'; session?: Session }
export const remoteApi = <T>(route: string, init: RequestInit = {}) => studioApi<T>('/chat' + route, { ...init, signal: init.signal ?? AbortSignal.timeout(15000) })
export const rememberRevision = (session: Session) => { revisions.set(session.id, Math.max(revisions.get(session.id) ?? 0, session.revision ?? 0)); return session }
export const sessionRevision = (id: string) => revisions.get(id) ?? 0
export const listRemoteSessions = () => remoteApi<{ sessions: SessionSummary[]; jobs: ServerJob[] }>('/sessions')
export const loadRemoteSession = async (id: string): Promise<Session | undefined> => {
  try { return rememberRevision((await remoteApi<{ session: Session }>('/sessions/' + encodeURIComponent(id))).session) }
  catch (error) { if (error instanceof StudioError && error.status === 404) {return undefined} throw error }
}
export const waitForSessionWrites = (id: string) => writes.get(id) ?? Promise.resolve()
export const saveRemoteSession = (session: Session, migrate = false): Promise<void> => {
  const task = waitForSessionWrites(session.id).catch(() => {}).then(async () => {
    const result = await remoteApi<{ session: Session }>('/sessions/' + encodeURIComponent(session.id), { method: 'PUT', body: JSON.stringify({ session, revision: sessionRevision(session.id), migrate }) })
    rememberRevision(result.session)
  })
  writes.set(session.id, task)
  void task.finally(() => { if (writes.get(session.id) === task) {writes.delete(session.id)} }).catch(() => {})
  return task
}
/** Serialized with full saves and job submission; only this field is written on the server. */
export const saveRemoteModelSelection = (id: string, modelSelection: Session['modelSelection'], onSaved?: (session: Session) => void): Promise<void> => {
  const principalId = useStudio.getState().principal?.id
  const task = waitForSessionWrites(id).catch(() => {}).then(async () => {
    if (!principalId || principalId !== useStudio.getState().principal?.id) { throw new Error('登录身份已变化') }
    const result = await remoteApi<{ session: Session }>('/sessions/' + encodeURIComponent(id), {
      method: 'PATCH', body: JSON.stringify({ modelSelection }),
    })
    rememberRevision(result.session)
    onSaved?.(result.session)
  })
  writes.set(id, task)
  void task.finally(() => { if (writes.get(id) === task) { writes.delete(id) } }).catch(() => {})
  return task
}
export const removeRemoteSession = async (id: string) => { await waitForSessionWrites(id); await remoteApi('/sessions/' + encodeURIComponent(id), { method: 'DELETE' }); revisions.delete(id) }
export const replaceRemoteSessions = async (sessions: Session[]) => {
  await Promise.all([...writes.values()]); await remoteApi('/sessions/replace', { method: 'PUT', body: JSON.stringify({ sessions }) }); revisions.clear()
}
