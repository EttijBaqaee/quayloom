import { useSettings } from '../services/settings.js'

export type UiMessages = Readonly<Record<string, string>>
export type UiParams = Record<string, string | number>

/** Static application chrome only; never translate user text or provider payloads. */
const render = (messages: UiMessages, text: string, english: boolean, params?: UiParams) => {
  const value = english && Object.hasOwn(messages, text) ? messages[text] : text
  return value.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    params && Object.hasOwn(params, key) ? String(params[key]) : placeholder)
}

export const useUiText = (messages: UiMessages) => {
  const locale = useSettings(state => state.locale)
  return (text: string, params?: UiParams) => render(messages, text, locale === 'en-US', params)
}

export const uiText = (messages: UiMessages, text: string, params?: UiParams) =>
  render(messages, text, useSettings.getState().locale === 'en-US', params)
