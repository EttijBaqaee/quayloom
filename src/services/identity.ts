// A page may bind one local history identity only. Account changes require reload.
let principalId: string | null = null
export function bindHistoryPrincipal(id: string): boolean {
  if (principalId && principalId !== id) {return false}
  principalId = id
  return true
}
export function historyDatabaseName(): string {
  if (!principalId) {throw new Error('请先登录再读取本机历史')}
  // Preserve the administrator's pre-upgrade history; each access code gets a new DB.
  return principalId === 'admin' ? 'chat-demo' : `quayloom:${__BASE_PATH__}:chat:${principalId}`
}
