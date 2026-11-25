import { appPath } from './paths.js'
import { create } from 'zustand'
import { bindHistoryPrincipal } from './identity.js'
import { bindPersonalSettings, clearPersonalSettings } from './settings.js'
import type { ReasoningEffort } from './api/types.js'
export type Principal = { id: string; role: 'admin' | 'user'; name: string; expiresAt: number | null }

export type Capabilities = { thinking: boolean; search: boolean; files: boolean; vision: boolean; speech: boolean }
export type StudioModel = { id: string; name: string; capabilities: Capabilities; maxOutputTokens: number; contextWindowTokens?: number | null; openaiProtocol?: 'chat-completions' | 'responses'; searchAdapter?: 'openai-web-search' | 'anthropic-web-search'; reasoningEfforts?: ReasoningEffort[]; reasoningEffort?: ReasoningEffort }
export type Quota = { dailyRequestLimit: number | null; dailyTokenLimit: number | null; totalTokenLimit: number | null; concurrencyLimit: number }
export const defaultQuota = (): Quota => ({ dailyRequestLimit: null, dailyTokenLimit: null, totalTokenLimit: null, concurrencyLimit: 4 })
export type Provider = { quota: Quota; id: string; name: string; type: 'openai' | 'anthropic' | 'deepseek'; baseUrl: string; enabled: boolean; allowPrivateNetwork: boolean; models: StudioModel[]; hasApiKey: boolean }
export type CatalogProvider = Pick<Provider, 'id' | 'name' | 'type' | 'models'>
export type ModelSelection = { providerId: string; modelId: string }
export type Preset = Pick<Provider, 'name' | 'type' | 'baseUrl' | 'models'> & { id: string }
export type ProviderList = { providers: Provider[]; defaultModel: ModelSelection | null; presets: Preset[] }

export const emptyCapabilities = (): Capabilities => ({ thinking: false, search: false, files: false, vision: false, speech: false })
export const newModel = (id = '', name = id): StudioModel => ({ id, name, capabilities: emptyCapabilities(), maxOutputTokens: 4096 })

export const useStudio = create<{
  authenticated: boolean | null
  principal: Principal | null
  providers: CatalogProvider[]
  selection: ModelSelection | null
  catalogError: string
}>(() => ({ authenticated: null, principal: null, providers: [], selection: null, catalogError: '' }))

export const sessionExpired = () => { clearPersonalSettings(); useStudio.setState({ authenticated: false, principal: null, providers: [], selection: null, catalogError: '' }) }
export class StudioError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'StudioError' }
}

export async function studioApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const principal = useStudio.getState().principal
  if (principal && path !== '/auth/session' && path !== '/auth/login') {headers.set('x-studio-principal', principal.id)}
  if (init.body && !(init.body instanceof FormData)) {headers.set('Content-Type', 'application/json')}
  const response = await fetch(`${__API_ORIGIN__}${path}`, { ...init, headers, credentials: 'same-origin', cache: 'no-store' })
  if (response.status === 401) {sessionExpired()}
  const body = await response.json().catch(() => null)
  if (!response.ok) {throw new StudioError(body?.error?.message || `请求失败（${response.status}）`, response.status)}
  return body as T
}

export async function checkSession() {
  try {
    const result = await studioApi<{ authenticated: boolean; principal: Principal }>('/auth/session')
    if (!bindHistoryPrincipal(result.principal.id)) { window.location.reload(); return }
    bindPersonalSettings(result.principal.id)
    useStudio.setState({ authenticated: result.authenticated, principal: result.principal })
  } catch (error) {
    if (error instanceof StudioError && error.status === 401) {return}
    throw error
  }
}
export async function login(credential: string, mode: 'code' | 'admin') {
  await studioApi('/auth/login', { method: 'POST', body: JSON.stringify(mode === 'code' ? { mode, code: credential.trim() } : { mode, password: credential.trim() }) })
  window.location.assign(mode === 'admin' && window.location.pathname.replace(/\/$/, '') === appPath('/admin') ? appPath('/admin') : appPath('/'))
}
export async function logout() {
  await studioApi('/auth/logout', { method: 'POST' })
  // Reload also clears transient admin key input, drafts, and rendered private conversations.
  window.location.assign(appPath('/'))
}

export async function loadCatalog() {
  try {
    const result = await studioApi<{ providers: CatalogProvider[]; defaultModel: ModelSelection | null }>('/catalog')
    const current = useStudio.getState().selection
    const valid = (selection: ModelSelection | null) => selection && result.providers.some(p => p.id === selection.providerId && p.models.some(m => m.id === selection.modelId))
    const first = result.providers.find(p => p.models.length > 0)
    const selection = valid(current) ? current : valid(result.defaultModel) ? result.defaultModel : first ? { providerId: first.id, modelId: first.models[0].id } : null
    useStudio.setState({ providers: result.providers, selection, catalogError: '' })
  } catch (error) {
    useStudio.setState({ catalogError: error instanceof Error ? error.message : '模型目录加载失败' })
    throw error
  }
}

export function selectedTarget(selection = useStudio.getState().selection) {
  const provider = useStudio.getState().providers.find(p => p.id === selection?.providerId)
  const model = provider?.models.find(m => m.id === selection?.modelId)
  return provider && model ? { provider, model } : null
}

// Declarations are a ceiling, not a promise that an adapter implements a feature.
export function supportedCapabilities(provider: Pick<Provider, 'type'>, model: StudioModel): Capabilities {
  return {
    thinking: model.capabilities.thinking,
    search: model.capabilities.search && (provider.type === 'deepseek' ||
      provider.type === 'openai' && model.openaiProtocol === 'responses' && model.searchAdapter === 'openai-web-search' ||
      provider.type === 'anthropic' && model.searchAdapter === 'anthropic-web-search'),
    speech: provider.type === 'deepseek' && model.capabilities.speech,
    files: provider.type !== 'openai' && model.capabilities.files,
    vision: model.capabilities.vision,
  }
}
export function currentCapabilities(): Capabilities {
  const target = selectedTarget()
  return target ? supportedCapabilities(target.provider, target.model) : emptyCapabilities()
}

export function ensureStudioReady() {
  const state = useStudio.getState()
  if (!state.authenticated) { sessionExpired(); return false }
  if (!selectedTarget()) {
    if (state.principal?.role === 'admin') {window.location.assign(appPath('/admin'))}
    return false
  }
  return true
}
