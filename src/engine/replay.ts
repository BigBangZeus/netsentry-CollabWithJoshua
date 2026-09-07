/**
 * Rate-controlled replay transport.
 *
 * Walks a parsed CSV and feeds rows to `POST /api/predict` at a chosen rate.
 * The engine has no streaming endpoint, so "live" here means this client
 * pacing its own requests — which is honest, and has the useful property
 * that the analyst controls the rate.
 *
 * Dispatch is decoupled from completion: a tick fires a request and moves on,
 * bounded by `concurrency`, so one slow response cannot stall the schedule.
 */

import { EngineError, predict } from '../api/client'
import type { PredictResponse } from '../api/types'
import type { FlowRow } from './csv'

export type ReplayState = 'idle' | 'running' | 'paused' | 'stopped' | 'done'

export interface ReplayCallbacks {
  onVerdict(row: FlowRow, response: PredictResponse, latencyMs: number): void
  onFailure(row: FlowRow, message: string, status: number | null): void
  onProgress(dispatched: number, total: number): void
  onStateChange(state: ReplayState): void
}

export interface ReplayConfig {
  endpoint: string
  rows: FlowRow[]
  /** Requests per second. Clamped to a sane band by the controller. */
  ratePerSecond: number
  /** Maximum requests in flight at once. */
  concurrency?: number
}

export const MIN_RATE = 1
export const MAX_RATE = 200
const DEFAULT_CONCURRENCY = 6

export interface ReplayController {
  start(): void
  pause(): void
  resume(): void
  stop(): void
  setRate(ratePerSecond: number): void
  getState(): ReplayState
}

export function createReplay(
  config: ReplayConfig,
  callbacks: ReplayCallbacks,
): ReplayController {
  const { endpoint, rows } = config
  const concurrency = config.concurrency ?? DEFAULT_CONCURRENCY

  let rate = clampRate(config.ratePerSecond)
  let state: ReplayState = 'idle'
  let cursor = 0
  let inFlight = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  function clampRate(value: number): number {
    if (!Number.isFinite(value)) return MIN_RATE
    return Math.min(MAX_RATE, Math.max(MIN_RATE, Math.round(value)))
  }

  function setState(next: ReplayState) {
    if (state === next) return
    state = next
    callbacks.onStateChange(next)
  }

  function finishIfComplete() {
    if (state === 'running' && cursor >= rows.length && inFlight === 0) {
      setState('done')
    }
  }

  function dispatch(row: FlowRow) {
    inFlight += 1
    const startedAt = performance.now()

    predict(endpoint, row.features)
      .then((response) => {
        callbacks.onVerdict(row, response, performance.now() - startedAt)
      })
      .catch((cause: unknown) => {
        const status = cause instanceof EngineError ? cause.status : null
        const message = cause instanceof Error ? cause.message : 'Unknown failure'
        callbacks.onFailure(row, message, status)
      })
      .finally(() => {
        inFlight -= 1
        finishIfComplete()
      })
  }

  function tick() {
    if (state !== 'running') return

    if (cursor >= rows.length) {
      finishIfComplete()
      return
    }

    // Back off rather than queue without bound when the engine is slower
    // than the requested rate.
    if (inFlight < concurrency) {
      dispatch(rows[cursor])
      cursor += 1
      callbacks.onProgress(cursor, rows.length)
    }

    timer = setTimeout(tick, 1000 / rate)
  }

  return {
    start() {
      if (state === 'running') return
      cursor = 0
      setState('running')
      tick()
    },

    pause() {
      if (state !== 'running') return
      clearTimeout(timer)
      setState('paused')
    },

    resume() {
      if (state !== 'paused') return
      setState('running')
      tick()
    },

    stop() {
      clearTimeout(timer)
      cursor = 0
      setState('stopped')
    },

    setRate(next: number) {
      rate = clampRate(next)
    },

    getState: () => state,
  }
}
