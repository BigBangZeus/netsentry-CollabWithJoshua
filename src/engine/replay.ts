/**
 * Rate-controlled replay transport.
 *
 * Walks a parsed CSV and feeds rows to the engine at a chosen rate. The
 * engine has no streaming endpoint, so "live" here means this client pacing
 * its own requests — which is honest, and has the useful property that the
 * analyst controls the rate.
 *
 * Two transports:
 *
 *   batch  — chunks go to /api/predict/batch, roughly four dispatches a
 *            second regardless of rate. One HTTP round trip and one pair of
 *            model calls per chunk instead of per record.
 *   single — one /api/predict per record, for engines without the batch
 *            endpoint. Still the only path at very low rates, where a chunk
 *            would just add latency without saving anything.
 *
 * Dispatch is decoupled from completion: a tick fires a request and moves on,
 * bounded by `concurrency`, so one slow response cannot stall the schedule.
 */

import { EngineError, expandBatchResult, predict, predictBatch } from '../api/client'
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
  /** Records per second. Clamped to a sane band by the controller. */
  ratePerSecond: number
  /** Maximum requests in flight at once. */
  concurrency?: number
  /** Use /api/predict/batch when the engine offers it. */
  useBatch?: boolean
}

export const MIN_RATE = 1
export const MAX_RATE = 200

const DEFAULT_CONCURRENCY = 6

/**
 * Target dispatches per second when batching. Fast enough that the ledger and
 * axis still look live, slow enough that chunks are worth forming.
 */
const BATCH_DISPATCHES_PER_SECOND = 4

/** Ceiling on chunk size, well under the engine's own batch limit. */
const MAX_CHUNK = 200

export interface ReplayController {
  start(): void
  pause(): void
  resume(): void
  stop(): void
  setRate(ratePerSecond: number): void
  getState(): ReplayState
}

function clampRate(value: number): number {
  if (!Number.isFinite(value)) return MIN_RATE
  return Math.min(MAX_RATE, Math.max(MIN_RATE, Math.round(value)))
}

/**
 * Chunk size and tick interval for a given rate.
 *
 * `interval = chunk / rate` keeps the effective records-per-second equal to
 * the requested rate whatever the chunk size, so the slider still means what
 * it says when the transport switches.
 */
function plan(rate: number, useBatch: boolean): { chunk: number; intervalMs: number } {
  if (!useBatch || rate <= BATCH_DISPATCHES_PER_SECOND) {
    return { chunk: 1, intervalMs: 1000 / rate }
  }

  const chunk = Math.min(
    MAX_CHUNK,
    Math.max(2, Math.round(rate / BATCH_DISPATCHES_PER_SECOND)),
  )

  return { chunk, intervalMs: (chunk / rate) * 1000 }
}

export function createReplay(
  config: ReplayConfig,
  callbacks: ReplayCallbacks,
): ReplayController {
  const { endpoint, rows } = config
  const concurrency = config.concurrency ?? DEFAULT_CONCURRENCY
  const useBatch = config.useBatch ?? false

  let rate = clampRate(config.ratePerSecond)
  let state: ReplayState = 'idle'
  let cursor = 0
  let inFlight = 0
  let timer: ReturnType<typeof setTimeout> | undefined

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

  function dispatchSingle(row: FlowRow) {
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

  function dispatchChunk(chunk: FlowRow[]) {
    inFlight += 1
    const startedAt = performance.now()

    predictBatch(
      endpoint,
      chunk.map((row) => row.features),
    )
      .then((batch) => {
        const elapsed = performance.now() - startedAt
        // Amortised per-record cost. With batching the round trip is shared,
        // so the honest per-record number is the share, not the whole trip.
        const perRecord = elapsed / Math.max(1, batch.results.length)

        for (const result of batch.results) {
          const row = chunk[result.index]
          if (!row) continue
          callbacks.onVerdict(row, expandBatchResult(batch, result), perRecord)
        }
      })
      .catch((cause: unknown) => {
        const status = cause instanceof EngineError ? cause.status : null
        const message = cause instanceof Error ? cause.message : 'Unknown failure'
        // The whole chunk failed together, so every row in it failed.
        for (const row of chunk) callbacks.onFailure(row, message, status)
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

    const { chunk, intervalMs } = plan(rate, useBatch)

    // Back off rather than queue without bound when the engine is slower
    // than the requested rate.
    if (inFlight < concurrency) {
      const slice = rows.slice(cursor, cursor + chunk)
      cursor += slice.length

      if (slice.length === 1) {
        dispatchSingle(slice[0])
      } else {
        dispatchChunk(slice)
      }

      callbacks.onProgress(cursor, rows.length)
    }

    timer = setTimeout(tick, intervalMs)
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
