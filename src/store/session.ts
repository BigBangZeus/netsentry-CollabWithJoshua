/**
 * Session state: everything the stateless engine does not remember.
 *
 * Scaling decision — a CICIDS2017 export can exceed 100,000 rows, so the
 * ledger is bounded (most recent N) while the aggregates are not. Counters
 * and the confidence histogram update in O(1) per verdict, so the decision
 * axis and the summary stay exact no matter how long a replay runs.
 */

import { useCallback, useMemo, useRef, useState } from 'react'

import type {
  PredictResponse,
  Prediction,
  RiskLevel,
  Verdict,
  VerdictFailure,
  VerdictSource,
} from '../api/types'
import { RISK_LEVELS } from '../api/types'
import type { FlowRow } from '../engine/csv'

/** Rows kept for the ledger view. Aggregates cover everything. */
export const LEDGER_LIMIT = 2000

/** Resolution of the decision axis histogram. */
export const BIN_COUNT = 60

export interface SessionStats {
  total: number
  attacks: number
  benign: number
  failures: number
  byRisk: Record<RiskLevel, number>
  byAttackType: Record<string, number>
  /** P(ATTACK) histogram over [0,1], `BIN_COUNT` buckets. */
  attackProbBins: number[]
  latencySumMs: number
  /** Rows that carried a dataset label, and how many the engine matched. */
  labelled: number
  agreed: number
}

function emptyStats(): SessionStats {
  return {
    total: 0,
    attacks: 0,
    benign: 0,
    failures: 0,
    byRisk: Object.fromEntries(RISK_LEVELS.map((r) => [r, 0])) as Record<RiskLevel, number>,
    byAttackType: {},
    attackProbBins: new Array<number>(BIN_COUNT).fill(0),
    latencySumMs: 0,
    labelled: 0,
    agreed: 0,
  }
}

/**
 * P(ATTACK) for a response.
 *
 * The engine returns `probabilities` keyed by the binary model's own class
 * labels, so read the ATTACK key directly rather than trusting ordering.
 * Falls back to `confidence`, which is P(ATTACK) exactly when the verdict
 * was ATTACK and its complement otherwise.
 */
export function attackProbability(response: PredictResponse): number {
  for (const [label, value] of Object.entries(response.probabilities)) {
    if (label.trim().toUpperCase() === 'ATTACK') return value
  }
  return response.is_attack ? response.confidence : 1 - response.confidence
}

/** Whether the dataset label and the engine's verdict agree. */
function labelAgrees(label: string, prediction: Prediction): boolean {
  const isBenignLabel = label.trim().toUpperCase() === 'BENIGN'
  return isBenignLabel === (prediction === 'BENIGN')
}

export interface Session {
  verdicts: Verdict[]
  failures: VerdictFailure[]
  stats: SessionStats
  recordVerdict(
    row: FlowRow | null,
    response: PredictResponse,
    latencyMs: number,
    source: VerdictSource,
  ): void
  recordFailure(
    row: FlowRow | null,
    message: string,
    status: number | null,
    source: VerdictSource,
  ): void
  clear(): void
}

export function useSession(): Session {
  const [verdicts, setVerdicts] = useState<Verdict[]>([])
  const [failures, setFailures] = useState<VerdictFailure[]>([])
  const [stats, setStats] = useState<SessionStats>(emptyStats)

  // Monotonic across both verdicts and failures so the ledger orders cleanly.
  const seqRef = useRef(0)

  const recordVerdict = useCallback(
    (
      row: FlowRow | null,
      response: PredictResponse,
      latencyMs: number,
      source: VerdictSource,
    ) => {
      seqRef.current += 1
      const seq = seqRef.current

      const verdict: Verdict = {
        id: `v${seq}`,
        seq,
        at: Date.now(),
        latencyMs,
        source,
        ...(row ? { sourceRow: row.index } : {}),
        ...(row?.label ? { groundTruth: row.label } : {}),
        response,
      }

      setVerdicts((current) => {
        const next = [verdict, ...current]
        return next.length > LEDGER_LIMIT ? next.slice(0, LEDGER_LIMIT) : next
      })

      setStats((current) => {
        const probability = attackProbability(response)
        const bin = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor(probability * BIN_COUNT)))

        const attackProbBins = current.attackProbBins.slice()
        attackProbBins[bin] += 1

        const byRisk = { ...current.byRisk }
        byRisk[response.risk_level] = (byRisk[response.risk_level] ?? 0) + 1

        const byAttackType = { ...current.byAttackType }
        if (response.is_attack) {
          const type = response.attack_type || 'UNKNOWN'
          byAttackType[type] = (byAttackType[type] ?? 0) + 1
        }

        const hasLabel = Boolean(row?.label)
        const agrees = hasLabel && labelAgrees(row!.label!, response.prediction)

        return {
          total: current.total + 1,
          attacks: current.attacks + (response.is_attack ? 1 : 0),
          benign: current.benign + (response.is_attack ? 0 : 1),
          failures: current.failures,
          byRisk,
          byAttackType,
          attackProbBins,
          latencySumMs: current.latencySumMs + latencyMs,
          labelled: current.labelled + (hasLabel ? 1 : 0),
          agreed: current.agreed + (agrees ? 1 : 0),
        }
      })
    },
    [],
  )

  const recordFailure = useCallback(
    (row: FlowRow | null, message: string, status: number | null, source: VerdictSource) => {
      seqRef.current += 1
      const seq = seqRef.current

      const failure: VerdictFailure = {
        id: `f${seq}`,
        seq,
        at: Date.now(),
        source,
        ...(row ? { sourceRow: row.index } : {}),
        status,
        message,
      }

      // Failures are capped harder: they repeat, and one cause explains many.
      setFailures((current) => [failure, ...current].slice(0, 200))
      setStats((current) => ({ ...current, failures: current.failures + 1 }))
    },
    [],
  )

  const clear = useCallback(() => {
    seqRef.current = 0
    setVerdicts([])
    setFailures([])
    setStats(emptyStats())
  }, [])

  return useMemo(
    () => ({ verdicts, failures, stats, recordVerdict, recordFailure, clear }),
    [verdicts, failures, stats, recordVerdict, recordFailure, clear],
  )
}
