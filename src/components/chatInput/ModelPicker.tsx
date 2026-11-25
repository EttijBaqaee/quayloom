import { useUiText } from '../../i18n/ui.js'
import { workspaceEn } from '../../i18n/workspace.en.js'
import { selectChatModel, useChatStore } from '../../services/chat/store.js'
import { useUploads } from '../../services/attachments.js'
import { useStudio } from '../../services/studio.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import styles from './ModelPicker.module.css'

/** 与消息输入相邻的渠道/模型选择；上传或任一对话回复期间保持原有锁定规则。 */
export function ModelPicker() {
  const t = useUiText(workspaceEn)
  const locked = useChatStore(s => !s.ready || s.importingHistory || Object.keys(s.streaming).length > 0 || !!s.activeId && !s.sessionCache[s.activeId])
  const uploading = useUploads(s => Object.values(s.tasks).some(t => t.status === 'uploading'))
  const providers = useStudio(s => s.providers)
  const selection = useStudio(s => s.selection)
  const selectedProvider = providers.find(provider => provider.id === selection?.providerId)
  const selectedModel = selectedProvider?.models.find(model => model.id === selection?.modelId)
  return <div className={styles.picker} role="group" aria-label={t('供应商与模型')}>
    <label><span className="studio-sr">{t('供应商 / 渠道')}</span><select disabled={locked || uploading} aria-label={t('供应商')} title={t('切换管理员授权的渠道')} value={selection?.providerId ?? ''} onChange={e => {
      stopReadAloud()
      const provider = providers.find(p => p.id === e.target.value)
      if (provider?.models.length) { selectChatModel({ providerId: provider.id, modelId: provider.models[0].id }) }
    }}><option value="" disabled>{t('选择渠道')}</option>{selection && !selectedProvider && <option value={selection.providerId} disabled>{selection.providerId} · {t('选择渠道')}</option>}{providers.filter(p => p.models.length).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label><span className="studio-sr">{t('模型')}</span><select disabled={locked || uploading} aria-label={t('模型')} title={t('选择模型')} value={selection?.modelId ?? ''} onChange={e => {
      stopReadAloud()
      if (selection) {selectChatModel({ ...selection, modelId: e.target.value })}
    }}><option value="" disabled>{t('选择模型')}</option>{selection && !selectedModel && <option value={selection.modelId} disabled>{selection.modelId} · {t('选择模型')}</option>}{selectedProvider?.models.map(m => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}</select></label>
  </div>
}
