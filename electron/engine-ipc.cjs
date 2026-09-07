'use strict'

/**
 * Engine transport for the desktop app.
 *
 * Split out from `main.cjs` so that window management and network access are
 * separable: the handler can be registered (and exercised) without creating a
 * BrowserWindow.
 *
 * The NETSENTRY service sends no CORS headers, so a `file://` renderer would
 * fail its preflight on every JSON POST. Requests issued here come from the
 * main process, which is not a browser context, so no origin is sent and no
 * preflight occurs.
 */

const { ipcMain } = require('electron')

const CHANNEL = 'netsentry:request'
const REQUEST_TIMEOUT_MS = 15_000

/**
 * Local addresses only. This is a local-first analysis tool, and the renderer
 * must not be able to turn the main process into a general-purpose fetcher.
 */
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0'])

function isLocalEndpoint(rawUrl) {
  try {
    const url = new URL(rawUrl)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') && ALLOWED_HOSTS.has(url.hostname)
    )
  } catch {
    return false
  }
}

/**
 * Perform one engine request.
 * Always resolves — transport failures come back shaped like engine errors so
 * the renderer has a single path to handle.
 */
async function performRequest({ endpoint, path: routePath, init }) {
  const target = `${String(endpoint).replace(/\/+$/, '')}${routePath}`

  if (!isLocalEndpoint(target)) {
    return {
      ok: false,
      status: null,
      body: { error: 'Only local engine endpoints are allowed from the desktop app.' },
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(target, {
      method: init?.method ?? 'GET',
      headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
      body: init?.body,
      signal: controller.signal,
    })

    const body = await response.json().catch(() => null)
    return { ok: response.ok, status: response.status, body }
  } catch (cause) {
    const message =
      cause && cause.name === 'AbortError'
        ? `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
        : `Cannot reach the engine at ${endpoint}`
    return { ok: false, status: null, body: { error: message } }
  } finally {
    clearTimeout(timer)
  }
}

function registerEngineIpc() {
  ipcMain.handle(CHANNEL, (_event, payload) => performRequest(payload))
}

module.exports = { registerEngineIpc, performRequest, isLocalEndpoint, CHANNEL }
