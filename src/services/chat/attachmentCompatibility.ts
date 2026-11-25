import { supportedCapabilities, type CatalogProvider, type ModelSelection } from '../studio.js'
import type { FileAttachment } from './types.js'

export type AttachmentReference = { file: FileAttachment; location: string }
export type AttachmentIssue = { name: string; location: string; reason: string }
export type AttachmentCompatibility = {
  issues: AttachmentIssue[]
  models: { selection: ModelSelection; label: string }[]
  attachmentCount: number
}

/** Capability declarations never override ownership. Cross-provider files need an original to upload again. */
export const assessAttachmentCompatibility = (
  references: AttachmentReference[],
  providers: CatalogProvider[],
  selection: ModelSelection | null,
  isAdmin: boolean,
  originals: ReadonlySet<string>,
): AttachmentCompatibility => {
  const issuesFor = (provider: CatalogProvider | undefined, modelId: string | undefined): AttachmentIssue[] => {
    const model = provider?.models.find(item => item.id === modelId)
    return references.flatMap(({ file, location }) => {
      let reason: string | undefined
      if (!isAdmin) { reason = '此使用码仅支持文字，不能提交包含附件的会话。' }
      else if (!provider || !model) { reason = '请先选择可用模型。' }
      else {
        const caps = supportedCapabilities(provider, model)
        if (!(file.isImage ? caps.vision : caps.files)) {
          reason = file.isImage ? '所选模型未启用图片输入。' : '当前模型或协议未支持文档附件。'
        } else if ((!file.serverId || file.providerId !== provider.id) && !originals.has(file.id)) {
          reason = file.providerId && file.providerId !== provider.id
            ? '附件属于其他渠道，且本机没有原件可重新上传；可切回原渠道或重新选择原件。'
            : '旧附件缺少有效的渠道归属或原件，请重新选择原件；不能直接复用未知归属的文件 ID。'
        }
      }
      return reason ? [{ name: file.name, location, reason }] : []
    })
  }
  return {
    issues: issuesFor(providers.find(item => item.id === selection?.providerId), selection?.modelId),
    models: isAdmin ? providers.flatMap(provider => provider.models.flatMap(model =>
      issuesFor(provider, model.id).length ? [] : [{ selection: { providerId: provider.id, modelId: model.id }, label: `${provider.name} / ${model.name || model.id}` }]
    )) : [],
    attachmentCount: references.length,
  }
}
