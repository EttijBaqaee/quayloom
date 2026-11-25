import { useUiText } from '../../i18n/ui.js'
import { workspaceEn } from '../../i18n/workspace.en.js'
import { useState } from 'react'
import { Modal } from '../base/Modal.js'
import { Button } from '../base/Button.js'
import type { AttachmentCompatibility } from '../../services/chat/attachmentCompatibility.js'
import type { ModelSelection } from '../../services/studio.js'
import styles from './AttachmentCompatibilityDialog.module.css'

/** Explicit consent only: closing this dialog never clears the source draft. */
export function AttachmentCompatibilityDialog({ result, busy, onCancel, onChooseModel, onTextOnly }: {
  result: AttachmentCompatibility
  busy: boolean
  onCancel: () => void
  onChooseModel: (selection: ModelSelection) => void
  onTextOnly: () => void
}) {
  const t = useUiText(workspaceEn)
  const [model, setModel] = useState('')
  const locationText = (location: string) => {
    const message = /^历史消息 (\d+)$/.exec(location)
    if (message) { return t('历史消息 {number}', { number: message[1] }) }
    const turn = /^历史第 (\d+) 轮$/.exec(location)
    return turn ? t('历史第 {number} 轮', { number: turn[1] }) : t(location)
  }
  return <Modal className={styles.dialog} mainClassName={styles.body} title={t('附件暂不能随本次请求发送')} closable onClose={onCancel} footer={<div className={styles.actions}>
    <Button variant="outlined" autoFocus disabled={busy} onClick={onCancel}>{t('取消')}</Button>
    <Button disabled={busy || !model} onClick={() => { const item = result.models.find(candidate => JSON.stringify(candidate.selection) === model); if (item) {onChooseModel(item.selection)} }}>{t('切换模型，保留附件')}</Button>
    <Button disabled={busy} onClick={onTextOnly}>{t('仅用文字继续（创建副本）')}</Button>
  </div>}>
    <p>{t('原对话、附件原件和草稿都会保留，不会自动删除或跳过图片。')}</p>
    <ul style={{ maxHeight: '28vh', overflow: 'auto', paddingLeft: 20, overflowWrap: 'anywhere' }}>
      {result.issues.map((issue, index) => <li key={`${issue.location}:${index}`}><strong>{locationText(issue.location)} · {issue.name}</strong><br />{t(issue.reason)}</li>)}
    </ul>
    {result.models.length > 0 && <label>{t('可兼容的模型')}<select aria-label={t('兼容附件的模型')} style={{ display: 'block', width: '100%', marginTop: 8 }} value={model} onChange={event => setModel(event.target.value)}>
      <option value="">{t('请选择模型')}</option>
      {result.models.map(item => <option key={JSON.stringify(item.selection)} value={JSON.stringify(item.selection)}>{item.label}</option>)}
    </select></label>}
    <p>{t('选择“仅用文字继续”将创建当前分支的纯文字副本，保留已有文字和回复；不会发送 {count} 个附件的内容。仅含附件的提问会保留明确占位说明。原草稿仍留在原对话中。', { count: result.attachmentCount })}</p>
  </Modal>
}
