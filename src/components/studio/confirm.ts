import { uiText } from '../../i18n/ui.js'
import { chromeEn } from '../../i18n/chrome.en.js'
let dialogSequence = 0

/** Accessible native modal; cancellation (including Escape) never grants permission. */
export function confirmStudio(message: string, confirmLabel = '确认继续'): Promise<boolean> {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog')
    dialog.className = 'studio-confirm'
    const heading = document.createElement('h2')
    heading.id = `studio-confirm-${++dialogSequence}`
    heading.textContent = uiText(chromeEn, '请确认此操作')
    dialog.setAttribute('aria-labelledby', heading.id)
    const body = document.createElement('p')
    body.textContent = message
    const actions = document.createElement('div')
    const cancel = document.createElement('button')
    cancel.textContent = uiText(chromeEn, '取消')
    const confirm = document.createElement('button')
    confirm.textContent = uiText(chromeEn, confirmLabel)
    confirm.className = 'studio-primary'
    actions.append(cancel, confirm)
    dialog.append(heading, body, actions)
    let settled = false
    const finish = (allowed: boolean) => {
      if (settled) { return }
      settled = true
      dialog.close()
      dialog.remove()
      resolve(allowed)
    }
    cancel.onclick = () => finish(false)
    confirm.onclick = () => finish(true)
    dialog.oncancel = event => { event.preventDefault(); finish(false) }
    document.body.append(dialog)
    dialog.showModal()
    cancel.focus()
  })
}
