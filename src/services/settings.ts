import { create } from 'zustand'
import type { TtsVoice } from './api/speech.js'
import { DEEPSEEK_REASONING_EFFORTS, LEGACY_REASONING_EFFORTS, REASONING_EFFORTS, type ReasoningEffort } from './api/types.js'
import { normalizeLocation, type UserLocation } from './location.js'

export type Locale = 'zh-CN' | 'en-US'

/** 空串跟随渠道配置；仅保存公开的身份/目标 ID，不保存使用码或密钥。 */
export type ReasoningEffortPreference = ReasoningEffort | ''
export type ReasoningEffortScope = { principalId: string; providerId: string; modelId: string }

/** 主题偏好；默认跟随系统 */
export type ThemePreference = 'light' | 'dark' | 'system'

/** 本机偏好。上游密钥不存浏览器；个人位置在鉴权后按身份读取。 */
type Settings = {
  apiKey: string | null
  locale: Locale
  themePreference: ThemePreference
  location: UserLocation | null
  ttsVoice: TtsVoice
  thinking: boolean
  reasoningEffortPreferences: Record<string, ReasoningEffortPreference>
  search: boolean
  siderCollapsed: boolean
}

const KEYS = {
  apiKey: 'chat-demo:api-key',
  locale: 'chat-demo:locale',
  location: 'chat-demo:location',
  themePreference: 'chat-demo:theme-preference',
  ttsVoice: 'chat-demo:tts-voice',
  thinking: 'chat-demo:thinking',
  search: 'chat-demo:search',
  siderCollapsed: 'chat-demo:sider-collapsed',
} as const

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // 存储不可用时只在内存中生效
  }
}

const normalizeReasoningEffort = (value: unknown): ReasoningEffortPreference =>
  typeof value === 'string' && (REASONING_EFFORTS as readonly string[]).includes(value) ? value as ReasoningEffort : ''

export type ReasoningEffortProtocol = 'openai' | 'deepseek' | 'anthropic'

/** A declaration cannot exceed protocol support. Only absence uses the protocol's compatible set. */
export const getSupportedReasoningEfforts = (declared?: readonly unknown[], protocol: ReasoningEffortProtocol = 'openai'): ReasoningEffort[] => {
  const allowed: readonly ReasoningEffort[] = protocol === 'deepseek' ? DEEPSEEK_REASONING_EFFORTS : protocol === 'openai' ? REASONING_EFFORTS : []
  return declared === undefined ? protocol === 'openai' ? [...LEGACY_REASONING_EFFORTS] : [...allowed]
    : Array.isArray(declared) ? allowed.filter(effort => declared.includes(effort)) : []
}

const reasoningPreferenceKey = (scope: ReasoningEffortScope | null): string | null =>
  scope?.principalId && scope.providerId && scope.modelId
    ? `quayloom:reasoning-effort:${JSON.stringify([__BASE_PATH__, scope.principalId, scope.providerId, scope.modelId])}`
    : null

export const getReasoningEffortPreference = (scope: ReasoningEffortScope | null, declared?: readonly unknown[], protocol: ReasoningEffortProtocol = 'openai'): ReasoningEffortPreference => {
  const key = reasoningPreferenceKey(scope)
  if (!key) {return ''}
  const preferences = useSettings.getState().reasoningEffortPreferences
  const value = normalizeReasoningEffort(Object.hasOwn(preferences, key) ? preferences[key] : read(key))
  return value && getSupportedReasoningEfforts(declared, protocol).includes(value) ? value : ''
}

export const setReasoningEffortPreference = (scope: ReasoningEffortScope | null, value: string, declared?: readonly unknown[], protocol: ReasoningEffortProtocol = 'openai') => {
  const key = reasoningPreferenceKey(scope)
  const preference = normalizeReasoningEffort(value)
  if (!key || value !== '' && (!preference || !getSupportedReasoningEfforts(declared, protocol).includes(preference))) {return}
  write(key, preference || null)
  useSettings.setState(state => ({ reasoningEffortPreferences: { ...state.reasoningEffortPreferences, [key]: preference } }))
}

/** Invalid defaults/overrides are omitted; never invent an effort or broaden model support. */
export const resolveReasoningEffort = (configured: unknown, preference: ReasoningEffortPreference, declared?: readonly unknown[], protocol: ReasoningEffortProtocol = 'openai'): ReasoningEffort | undefined => {
  const supported = getSupportedReasoningEfforts(declared, protocol)
  const override = normalizeReasoningEffort(preference)
  const fallback = normalizeReasoningEffort(configured)
  return override && supported.includes(override) ? override : fallback && supported.includes(fallback) ? fallback : undefined
}

/** 位置选择模式跟随浏览器语言，与应用内选择的界面语言无关。 */
export const isChineseBrowser = (): boolean =>
  (typeof navigator === 'undefined' ? 'zh' : navigator.language).toLowerCase().startsWith('zh')

const initialLocale = (): Locale => {
  const saved = read(KEYS.locale)
  if (saved === 'zh-CN' || saved === 'en-US') {
    return saved
  }
  return isChineseBrowser() ? 'zh-CN' : 'en-US'
}

let locationKey: string | null = null
const initialLocation = (key: string): UserLocation | null => {
  try {
    const location = normalizeLocation(JSON.parse(read(key) ?? 'null'))
    if (!location) {
      return null
    }
    return isChineseBrowser()
      ? location.region === 'CN' && location.province
        ? location
        : null
      : { region: location.region }
  } catch {
    return null
  }
}

/** 未保存过时跟随系统 */
const initialThemePreference = (): ThemePreference => {
  const saved = read(KEYS.themePreference)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

/** 未保存过时使用服务端默认音色 stella（海星） */
const initialTtsVoice = (): TtsVoice => (read(KEYS.ttsVoice) === 'tide' ? 'tide' : 'stella')

// Remove any old official-demo key without reading its value.
write(KEYS.apiKey, null)

export const useSettings = create<Settings>(() => ({
  // Compatibility token for the original internal call signatures, never an upstream secret.
  apiKey: 'studio-session',
  locale: initialLocale(),
  location: null,
  themePreference: initialThemePreference(),
  ttsVoice: initialTtsVoice(),
  thinking: read(KEYS.thinking) === 'true',
  reasoningEffortPreferences: {},
  search: read(KEYS.search) === 'true',
  siderCollapsed: read(KEYS.siderCollapsed) === 'true',
}))

export function bindPersonalSettings(principalId: string) {
  locationKey = principalId === 'admin' ? KEYS.location : `quayloom:${__BASE_PATH__}:location:${principalId}`
  useSettings.setState({ location: initialLocation(locationKey), reasoningEffortPreferences: {} })
}
export function clearPersonalSettings() { locationKey = null; useSettings.setState({ location: null, reasoningEffortPreferences: {} }) }

export const setLocale = (locale: Locale) => {
  if (locale !== 'zh-CN' && locale !== 'en-US') {return}
  write(KEYS.locale, locale)
  useSettings.setState({ locale })
}

export const setLocation = (value: UserLocation | null) => {
  const location = normalizeLocation(value)
  if (!locationKey) {return}
  write(locationKey, location ? JSON.stringify(location) : null)
  useSettings.setState({ location })
}

export const setThemePreference = (themePreference: ThemePreference) => {
  if (!['system', 'light', 'dark'].includes(themePreference)) {return}
  write(KEYS.themePreference, themePreference)
  useSettings.setState({ themePreference })
}

export const setTtsVoice = (ttsVoice: TtsVoice) => {
  write(KEYS.ttsVoice, ttsVoice)
  useSettings.setState({ ttsVoice })
}

/** Legacy form is no longer mounted. Never persist or retain entered upstream secrets. */
export const setApiKey = (apiKey: string | null) => {
  void apiKey
  write(KEYS.apiKey, null)
}

export const setThinking = (thinking: boolean) => {
  write(KEYS.thinking, String(thinking))
  useSettings.setState({ thinking })
}

export const setSearch = (search: boolean) => {
  write(KEYS.search, String(search))
  useSettings.setState({ search })
}

export const setSiderCollapsed = (siderCollapsed: boolean) => {
  write(KEYS.siderCollapsed, String(siderCollapsed))
  useSettings.setState({ siderCollapsed })
}

/** Keep public appearance preferences synchronized across same-origin tabs. */
export function setupAppearancePreferences() {
  const syncLanguage = () => { document.documentElement.lang = useSettings.getState().locale }
  syncLanguage()
  useSettings.subscribe(syncLanguage)
  window.addEventListener('storage', event => {
    try { if (event.storageArea !== window.localStorage) {return} } catch { return }
    if (event.key === null || event.key === KEYS.locale) {
      useSettings.setState({ locale: initialLocale() })
    }
    if (event.key === null || event.key === KEYS.themePreference) {
      useSettings.setState({ themePreference: initialThemePreference() })
    }
  })
}
