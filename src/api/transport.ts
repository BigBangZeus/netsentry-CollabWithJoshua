/**
 * Chooses how engine requests actually travel.
 *
 * The NETSENTRY service does not enable CORS, which constrains both targets:
 *
 *  - Desktop (Electron): requests go over IPC and are performed by the main
 *    process. Those are not browser requests, so no preflight, no origin,
 *    no CORS. This is the path that always works.
 *
 *  - Web: the browser must reach the engine itself. During `pnpm dev` the
 *    Vite proxy at `/engine` makes that same-origin. A production web build
 *    served from another origin needs `CORS(app)` enabled on the Flask side.
 */

export interface TransportResult {
  ok: boolean
  /** Null when the request never reached the server. */
  status: number | null
  body: unknown
}

export interface RequestInitLite {
  method?: string
  headers?: Record<string, string>
  body?: string
}

interface DesktopBridge {
  isDesktop: true
  request(
    endpoint: string,
    path: string,
    init?: RequestInitLite,
  ): Promise<TransportResult>
}

declare global {
  interface Window {
    netsentry?: DesktopBridge
  }
}

function bridge(): DesktopBridge | undefined {
  return typeof window !== 'undefined' ? window.netsentry : undefined
}

export const isDesktop = Boolean(bridge()?.isDesktop)

/**
 * Where the engine lives by default.
 *
 * In the browser dev server this is the Vite proxy path, which is same-origin
 * and therefore immune to the missing CORS headers. Everywhere else it is the
 * address the engine's own README documents.
 */
export const DEFAULT_ENDPOINT =
  !isDesktop && import.meta.env.DEV ? '/engine' : 'http://127.0.0.1:8086'

const REQUEST_TIMEOUT_MS = 15_000

export async function send(
  endpoint: string,
  path: string,
  init?: RequestInitLite,
): Promise<TransportResult> {
  const desktop = bridge()
  if (desktop) return desktop.request(endpoint, path, init)

  const root = endpoint.replace(/\/+$/, '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${root}${path}`, {
      method: init?.method ?? 'GET',
      headers: { Accept: 'application/json', ...init?.headers },
      body: init?.body,
      signal: controller.signal,
    })

    const body: unknown = await response.json().catch(() => null)
    return { ok: response.ok, status: response.status, body }
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === 'AbortError'
    return {
      ok: false,
      status: null,
      body: {
        error: timedOut
          ? `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
          : `Cannot reach the engine at ${endpoint}. If it is running, the browser is` +
            ` most likely blocking the call because the engine does not send CORS` +
            ` headers — use the desktop app, or add CORS(app) to the Flask service.`,
      },
    }
  } finally {
    clearTimeout(timer)
  }
}
