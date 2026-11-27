import { useCallback, useEffect, useRef, useState } from 'react'
import { useUiText } from '../../i18n/ui.js'
import { adminMessages } from '../../i18n/admin.en.js'
import { studioApi, useStudio } from '../../services/studio.js'

type UpdateResult = {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean | null
  releaseUrl: string | null
  publishedAt: string | null
  checkedAt: string
  status: 'ok' | 'unavailable'
  cached: boolean
}

export function UpdatePanel() {
  const t = useUiText(adminMessages)
  const authenticated = useStudio(s => s.authenticated)
  const principal = useStudio(s => s.principal)
  const [result, setResult] = useState<UpdateResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [failed, setFailed] = useState(false)
  const pending = useRef<Promise<UpdateResult> | null>(null)
  const allowed = authenticated === true && principal?.role === 'admin'
  const principalId = principal?.id
  const check = useCallback(() => {
    // AdminPage already sits behind the login gate; keep this guard as well so
    // mounting the panel never causes unauthenticated/background version calls.
    if (!allowed || useStudio.getState().principal?.id !== principalId) {return null}
    if (!pending.current) {pending.current = studioApi<UpdateResult>('/admin/update')}
    return pending.current
  }, [allowed, principalId])
  useEffect(() => {
    let active = true
    const request = check()
    if (!request) {return}
    setChecking(true); setFailed(false)
    void request.then(value => { if (active) {setResult(value)} }).catch(() => { if (active) {setFailed(true)} }).finally(() => {
      if (pending.current === request) {pending.current = null}
      if (active) {setChecking(false)}
    })
    return () => { active = false }
  }, [check])
  async function manualCheck() {
    if (checking) {return}
    const request = check()
    if (!request) {return}
    setChecking(true); setFailed(false)
    try { setResult(await request) } catch { setFailed(true) } finally {
      if (pending.current === request) {pending.current = null}
      setChecking(false)
    }
  }
  if (!allowed) {return null}
  const available = !failed && result?.status === 'ok'
  // Only the server-constructed, fixed-repository URL can become a link.
  const releaseUrl = available && result.releaseUrl && /^https:\/\/github\.com\/EttijBaqaee\/quayloom\/releases\/tag\/[A-Za-z0-9.+%_-]+$/.test(result.releaseUrl) ? result.releaseUrl : null
  return <section className={`studio-update${available && result.updateAvailable ? ' has-update' : ''}`} aria-labelledby="studio-update-title" aria-busy={checking}>
    <div className="studio-update-heading"><h2 id="studio-update-title">{t('版本更新')}</h2><button type="button" disabled={checking} onClick={() => void manualCheck()}>{checking ? t('正在检查…') : t('检查更新')}</button></div>
    <dl className="studio-update-versions"><div><dt>{t('当前版本')}</dt><dd>{result?.currentVersion || '—'}</dd></div><div><dt>{t('最新稳定版')}</dt><dd>{available ? result.latestVersion : '—'}</dd></div></dl>
    <p className={available && result.updateAvailable ? 'studio-update-available' : 'studio-muted'} role="status" aria-live="polite">{checking ? t('正在检查版本更新…') : available ? (result.updateAvailable ? t('发现新版本 {version}', { version: result.latestVersion ?? '' }) : t('当前已是最新稳定版')) : t('暂时无法检查更新，请稍后重试。')}</p>
    {releaseUrl && <a className="studio-update-link" href={releaseUrl} target="_blank" rel="noopener noreferrer">{t('打开 GitHub 发布页')} ↗</a>}
  </section>
}
