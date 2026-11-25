// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs'

const CURRENT_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const RELEASE_API = 'https://api.github.com/repos/EttijBaqaee/quayloom/releases/latest'
const RELEASE_PAGE = 'https://github.com/EttijBaqaee/quayloom/releases/tag/'
const SUCCESS_TTL = 15 * 60 * 1000
const FAILURE_TTL = 60 * 1000
const BODY_LIMIT = 256 * 1024

// Stable SemVer only: prerelease labels and leading zeros are not stable versions.
// Build metadata is valid but does not affect precedence. BigInt avoids rounding.
function stableVersion(value) {
  if (typeof value !== 'string' || value.length > 128) return null
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value)
  return match && match[0] === value ? { version: value, parts: match.slice(1, 4).map(BigInt) } : null
}
function newer(latest, current) {
  for (let i = 0; i < 3; i++) {
    if (latest.parts[i] !== current.parts[i]) return latest.parts[i] > current.parts[i]
  }
  return false
}
async function limitedJson(response, signal) {
  const length = response.headers.get('content-length')
  if (length && /^\d+$/.test(length) && BigInt(length) > BigInt(BODY_LIMIT)) throw new Error('Response too large')
  if (!response.body) throw new Error('Empty response')
  const reader = response.body.getReader()
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  let size = 0
  const chunks = []
  try {
    if (signal.aborted) throw new Error('Check timed out')
    while (true) {
      const { value, done } = await reader.read()
      if (signal.aborted) throw new Error('Check timed out')
      if (done) break
      size += value.byteLength
      if (size > BODY_LIMIT) throw new Error('Response too large')
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks, size).toString('utf8'))
  } finally {
    signal.removeEventListener('abort', cancel)
    cancel()
    reader.releaseLock()
  }
}

// Injection points are for offline tests, never request parameters or environment URLs.
// This module has no store, providers, sessions, tokens, or business-data inputs.
export function createUpdateChecker({ fetchImpl = globalThis.fetch, now = Date.now, currentVersion = CURRENT_VERSION, timeoutMs = 5000 } = {}) {
  const current = stableVersion(currentVersion)
  const timeout = Number.isFinite(timeoutMs) ? Math.max(1, Math.min(5000, timeoutMs)) : 5000
  let cached = null, expiresAt = 0, inFlight = null
  const unavailable = () => ({ currentVersion, latestVersion: null, updateAvailable: null, releaseUrl: null, publishedAt: null, checkedAt: new Date(now()).toISOString(), status: 'unavailable' })
  async function query(signal) {
    if (!current) throw new Error('Invalid current version')
    const response = await fetchImpl(RELEASE_API, {
      method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal,
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Quayloom-update-check', 'X-GitHub-Api-Version': '2022-11-28' },
    })
    if (response.status !== 200 || response.redirected) {
      void response.body?.cancel().catch(() => {})
      throw new Error('Release unavailable')
    }
    const release = await limitedJson(response, signal)
    if (!release || typeof release !== 'object' || release.draft !== false || release.prerelease !== false || typeof release.tag_name !== 'string') throw new Error('Invalid release')
    const tag = release.tag_name
    const latest = stableVersion(tag.startsWith('v') ? tag.slice(1) : tag)
    if (!latest) throw new Error('Not a stable release')
    const published = typeof release.published_at === 'string' && release.published_at.length <= 64 ? Date.parse(release.published_at) : NaN
    return { currentVersion, latestVersion: latest.version, updateAvailable: newer(latest, current), releaseUrl: RELEASE_PAGE + encodeURIComponent(tag), publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : null, checkedAt: new Date(now()).toISOString(), status: 'ok' }
  }
  async function load() {
    const controller = new AbortController()
    let timer
    try {
      // Race also bounds injected/non-cooperative fetch implementations and body reads.
      return await Promise.race([
        query(controller.signal),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Check timed out')) }, timeout) }),
      ])
    } catch {
      // Never expose upstream bodies/errors or turn a network failure into "latest".
      return unavailable()
    } finally {
      clearTimeout(timer)
      controller.abort()
    }
  }
  return {
    async check() {
      if (cached && now() < expiresAt) return { ...cached, cached: true }
      if (!inFlight) {
        inFlight = load().then(result => {
          cached = Object.freeze(result)
          expiresAt = now() + (result.status === 'ok' ? SUCCESS_TTL : FAILURE_TTL)
          return cached
        }).finally(() => { inFlight = null })
      }
      return { ...await inFlight, cached: false }
    },
  }
}
