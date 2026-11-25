import { fail } from './validation.mjs'
import { allowsModel } from './access.mjs'

/** One ticket per actual upstream round. The first reuses the job's reservation;
 * later rounds must settle their predecessor before reserving their own input.
 * A failed reservation never authorizes an upstream request. */
export function createResponsesRoundQuota({ store, ledger, reservation, provider, model, access = null }) {
  let nextRound = 0, previousSettled = true
  return async ({ round, request }) => {
    if (!Number.isSafeInteger(round) || round !== nextRound || round > 4 || !previousSettled) fail(502, 'Invalid upstream round sequence')
    if (!request || !Array.isArray(request.input) || !Array.isArray(request.tools) || !Number.isSafeInteger(request.max_output_tokens) || request.max_output_tokens < 1 || Buffer.byteLength(JSON.stringify(request)) > 4 * 1024 * 1024) fail(502, 'Invalid upstream round budget')
    const currentProvider = store.provider(provider.id, true)
    const currentModel = currentProvider?.models.find(item => item.id === model.id)
    if (!currentProvider?.enabled || !currentModel) fail(403, '渠道或模型已停用')
    if (currentProvider.type !== provider.type || currentProvider.baseUrl !== provider.baseUrl || currentProvider.apiKey !== provider.apiKey || currentModel.openaiProtocol !== model.openaiProtocol || currentModel.searchAdapter !== model.searchAdapter || currentModel.capabilities?.search !== true || request.max_output_tokens > currentModel.maxOutputTokens) fail(409, '渠道或模型配置已变更，请重新发起请求')
    const currentAccess = access ? store.activeAccess(access.id) : null
    if (access && (!currentAccess || !allowsModel(currentAccess, provider.id, model.id))) fail(403, '使用码已失效或不再允许此模型')
    const ticketReservation = round === 0 ? reservation : ledger.reserve(currentProvider, { ...currentModel, maxOutputTokens: request.max_output_tokens }, {
      system: request.instructions || '', messages: request.input, tools: request.tools,
    }, { access: currentAccess })
    nextRound++; previousSettled = false
    let settled = false
    return {
      settle(usage, status) {
        if (settled) return
        settled = true
        try {
          // Partial usage cannot reduce the allowance for an interrupted round.
          ledger.settle(ticketReservation, status === 'completed' ? usage : undefined, status === 'completed' ? 'completed' : 'interrupted')
        } finally {
          try { ledger.release?.(ticketReservation) }
          finally { previousSettled = true }
        }
      },
    }
  }
}
