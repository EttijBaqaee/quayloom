import { studioApi } from './studio.js'

export type WebSearchProvider = 'disabled' | 'deepseek-api'
export type WebFetchProvider = 'http' | 'deepseek-api'
export type WebServiceConfig = { baseUrl: string; allowPrivateNetwork: boolean; hasApiKey: boolean }
export type WebToolsConfig = {
  search: WebServiceConfig & { provider: WebSearchProvider; maxResults: number }
  fetch: WebServiceConfig & { provider: WebFetchProvider }
}
type KeyChange = { apiKey?: string; clearApiKey?: boolean }
export type WebToolsUpdate = {
  search: Omit<WebToolsConfig['search'], 'hasApiKey'> & KeyChange
  fetch: Omit<WebToolsConfig['fetch'], 'hasApiKey'> & KeyChange
}
export type WebToolsResponse = { config: WebToolsConfig }

// Configuration reads and saves never execute a search or fetch operation.
export const loadWebTools = (signal: AbortSignal) => studioApi<WebToolsResponse>('/admin/web-tools', { signal })
export const saveWebTools = (config: WebToolsUpdate, signal: AbortSignal) => studioApi<WebToolsResponse>('/admin/web-tools', {
  method: 'PUT', body: JSON.stringify({ config }), signal,
})
