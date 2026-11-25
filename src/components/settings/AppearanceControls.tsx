import { setLocale, setThemePreference, useSettings, type Locale, type ThemePreference } from '../../services/settings.js'
import './appearance.css'

/** Available before sign-in and in every workspace; preferences stay on this browser. */
export function AppearanceControls() {
  const locale = useSettings(state => state.locale)
  const theme = useSettings(state => state.themePreference)
  const english = locale === 'en-US'
  return <div className="ql-appearance" role="group" aria-label={english ? 'Language and appearance' : '语言与外观'}>
    <label><span className="ql-appearance-label">{english ? 'Language' : '语言'}</span>
      <select data-ql-locale aria-label={english ? 'Language' : '语言'} value={locale} onChange={event => setLocale(event.target.value as Locale)}>
        <option value="zh-CN" lang="zh-CN">中文</option><option value="en-US" lang="en-US">English</option>
      </select>
    </label>
    <label><span className="ql-appearance-label">{english ? 'Theme' : '主题'}</span>
      <select data-ql-theme aria-label={english ? 'Theme' : '主题'} value={theme} onChange={event => setThemePreference(event.target.value as ThemePreference)}>
        <option value="system">{english ? 'Browser default' : '跟随浏览器'}</option>
        <option value="light">{english ? 'Light' : '浅色'}</option>
        <option value="dark">{english ? 'Dark' : '深色'}</option>
      </select>
    </label>
  </div>
}
