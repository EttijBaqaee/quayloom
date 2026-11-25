/*
 * Adapted from @deepseek-ai/dsh-session-title 0.2.2-rc.5,
 * src/normalize.ts: https://github.com/deepseek-ai/deepseek-harness
 *
 * MIT License
 *
 * Copyright (c) 2026 DeepSeek
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const OSC_SEQUENCE = /(?:\u001B\]|\u009D)(?:(?!\u0007|\u001B\\)[\s\S])*(?:\u0007|\u001B\\|$)/gu
const CSI_SEQUENCE = /(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]/gu
const ESC_SEQUENCE = /\u001B[@-_]/gu
const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu
const DIRECTIONAL_CONTROL = /[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/gu

function assertPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`)
}
function cleanTitleText(input) {
  return input.replace(OSC_SEQUENCE, '').replace(CSI_SEQUENCE, '').replace(ESC_SEQUENCE, '')
    .replace(CONTROL_CHARACTER, '').replace(DIRECTIONAL_CONTROL, '').replace(/\s+/gu, ' ').trim()
}
export function truncateTitleUtf8(input, maxBytes) {
  assertPositiveInteger('maxBytes', maxBytes)
  if (Buffer.byteLength(input, 'utf8') <= maxBytes) return input
  let used = 0, output = ''
  for (const character of input) {
    const bytes = Buffer.byteLength(character, 'utf8')
    if (used + bytes > maxBytes) break
    output += character; used += bytes
  }
  return output
}
export function normalizeSessionTitle(input, maxBytes = 120) {
  return truncateTitleUtf8(cleanTitleText(input), maxBytes).trimEnd()
}
export function fallbackSessionTitle(input, maxWords = 8, maxBytes = 96) {
  assertPositiveInteger('maxWords', maxWords)
  const words = cleanTitleText(input).split(' ').filter(Boolean).slice(0, maxWords)
  return truncateTitleUtf8(words.join(' '), maxBytes).trimEnd()
}

// Like DSH, only human text is eligible; empty/image-only messages wait for text.
// Titles are display metadata, never inserted into a model request.
export function deriveSessionFallback(session) {
  for (const message of session.messages) {
    if (message.role !== 'user' || typeof message.content !== 'string') continue
    const title = fallbackSessionTitle(message.content)
    if (title) return title
  }
  return ''
}
