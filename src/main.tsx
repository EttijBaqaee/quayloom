import { setupAppearancePreferences } from './services/settings.js'
import { createRoot } from 'react-dom/client'
import { StudioApp } from './app/StudioApp.js'
import { setupTheme } from './app/theme.js'
import { ensureKatex } from './services/markdown/katex.js'
import './app/theme.css'
import './app/global.css'

document.title = 'Quayloom'

ensureKatex()
setupAppearancePreferences()
setupTheme()

createRoot(document.getElementById('root') as HTMLElement).render(<StudioApp />)
