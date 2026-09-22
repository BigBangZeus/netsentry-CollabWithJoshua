import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  DEFAULT_ENDPOINT,
  EngineError,
  getHealth,
  getServiceInfo,
  predict,
  supportsBatch,
} from './api/client'
import type {
  ConnectionState,
  HealthResponse,
  ServiceInfo,
  Verdict,
  VerdictSource,
} from './api/types'
import { DecisionAxis } from './components/DecisionAxis'
import { DetailRail } from './components/DetailRail'
import { InstrumentBar } from './components/InstrumentBar'
import { Ledger } from './components/Ledger'
import type { PoleFilter } from './components/Ledger'
import { SourcePanel } from './components/SourcePanel'
import { SummaryTiles } from './components/SummaryTiles'
import { parseFlowCsv } from './engine/csv'
import type { ParsedFlows } from './engine/csv'
import { createReplay } from './engine/replay'
import type { ReplayController, ReplayState } from './engine/replay'
import { LEDGER_LIMIT, attackProbability, useSession } from './store/session'

/** Settings worth surviving a restart. Deliberately small. */
const SETTINGS_KEY = 'netsentry.settings.v1'

/**
 * Minimum time the Connect button stays in its "Checking" state, so a click
 * is always visible even when the engine answers instantly.
 */
const MIN_CHECK_FEEDBACK_MS = 450

interface Settings {
  endpoint: string
  rate: number
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>
      return {
        endpoint: parsed.endpoint ?? DEFAULT_ENDPOINT,
        rate: parsed.rate ?? 20,
      }
    }
  } catch {
    // Private mode, blocked storage, corrupt value — defaults are fine.
  }
  return { endpoint: DEFAULT_ENDPOINT, rate: 20 }
}

export default function App() {
  const initial = useMemo(loadSettings, [])

  const [endpoint, setEndpoint] = useState(initial.endpoint)
  const [rate, setRate] = useState(initial.rate)
  const [connection, setConnection] = useState<ConnectionState>('idle')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [service, setService] = useState<ServiceInfo | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null)

  const [flows, setFlows] = useState<ParsedFlows | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  const [classifying, setClassifying] = useState(false)
  const [replayState, setReplayState] = useState<ReplayState>('idle')
  const [dispatched, setDispatched] = useState(0)
  const replayRef = useRef<ReplayController | null>(null)

  const [pole, setPole] = useState<PoleFilter>('ALL')
  const [search, setSearch] = useState('')
  const [showFailures, setShowFailures] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const session = useSession()

  // Persist settings, tolerating storage being unavailable.
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ endpoint, rate }))
    } catch {
      // Not worth surfacing — the app works fine without persistence.
    }
  }, [endpoint, rate])

  const connect = useCallback(async () => {
    setConnection('checking')
    setConnectError(null)
    const startedAt = performance.now()

    let nextHealth: HealthResponse | null = null
    let nextService: ServiceInfo | null = null
    let nextError: string | null = null

    try {
      ;[nextHealth, nextService] = await Promise.all([
        getHealth(endpoint),
        getServiceInfo(endpoint).catch(() => null),
      ])
      if (!nextHealth.model_loaded) {
        nextError = 'The engine responded, but its models are not loaded.'
      }
    } catch (cause) {
      nextError = cause instanceof Error ? cause.message : 'Could not reach the engine'
    }

    /**
     * A local engine answers in a couple of milliseconds, which is faster than
     * a person can perceive — so re-checking an already-online engine looked
     * like the button was dead. Hold the checking state long enough to read.
     */
    const elapsed = performance.now() - startedAt
    if (elapsed < MIN_CHECK_FEEDBACK_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_CHECK_FEEDBACK_MS - elapsed))
    }

    setHealth(nextHealth)
    setService(nextService)
    setConnection(nextHealth?.model_loaded ? 'online' : 'offline')
    setConnectError(nextError)
    setLastCheckedAt(Date.now())
  }, [endpoint])

  // Probe once on mount so a running engine is picked up without a click.
  useEffect(() => {
    void connect()
    // Intentionally mount-only; later probes are user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tear the replay down if the component unmounts mid-run.
  useEffect(() => () => replayRef.current?.stop(), [])

  const handleFile = useCallback(async (file: File) => {
    setParsing(true)
    setParseError(null)
    try {
      setFlows(await parseFlowCsv(file))
    } catch (cause) {
      setFlows(null)
      setParseError(cause instanceof Error ? cause.message : 'Could not read that file')
    } finally {
      setParsing(false)
    }
  }, [])

  const clearFile = useCallback(() => {
    replayRef.current?.stop()
    replayRef.current = null
    setFlows(null)
    setParseError(null)
    setDispatched(0)
    setReplayState('idle')
  }, [])

  const startReplay = useCallback(() => {
    if (!flows || flows.rows.length === 0) return

    session.clear()
    setSelectedId(null)
    setDispatched(0)

    const controller = createReplay(
      {
        endpoint,
        rows: flows.rows,
        ratePerSecond: rate,
        // Detected from the engine's own index, so an engine without the
        // batch route still replays one record at a time.
        useBatch: supportsBatch(service),
      },
      {
        onVerdict: (row, response, latencyMs) =>
          session.recordVerdict(row, response, latencyMs, 'replay'),
        onFailure: (row, message, status) =>
          session.recordFailure(row, message, status, 'replay'),
        onProgress: setDispatched,
        onStateChange: setReplayState,
      },
    )

    replayRef.current = controller
    controller.start()
  }, [endpoint, flows, rate, service, session])

  // Rate is live-adjustable mid-run.
  useEffect(() => {
    replayRef.current?.setRate(rate)
  }, [rate])

  /**
   * Classify one record outside the replay. Selects the result immediately,
   * which is the point: it puts a full engine response in the detail rail
   * without processing a file first.
   */
  const classifyOne = useCallback(
    async (features: Record<string, number>, source: VerdictSource) => {
      setClassifying(true)
      const startedAt = performance.now()

      try {
        const response = await predict(endpoint, features)
        const verdict = session.recordVerdict(
          null,
          response,
          performance.now() - startedAt,
          source,
        )
        setSelectedId(verdict.id)
      } catch (cause) {
        const status = cause instanceof EngineError ? cause.status : null
        const message = cause instanceof Error ? cause.message : 'Classification failed'
        session.recordFailure(null, message, status, source)
      } finally {
        setClassifying(false)
      }
    },
    [endpoint, session],
  )

  const selected = useMemo(
    () => session.verdicts.find((verdict) => verdict.id === selectedId) ?? null,
    [session.verdicts, selectedId],
  )

  const cursor = useMemo(() => {
    const latest = session.verdicts[0]
    return latest ? attackProbability(latest.response) : null
  }, [session.verdicts])

  const attackThreshold =
    health?.binary_attack_threshold ?? service?.binary_attack_threshold ?? 0.55
  const unknownThreshold =
    health?.unknown_type_threshold ?? service?.unknown_type_threshold ?? 0.3

  return (
    <div className="app">
      <InstrumentBar
        endpoint={endpoint}
        onEndpointChange={setEndpoint}
        connection={connection}
        health={health}
        lastCheckedAt={lastCheckedAt}
        onConnect={() => void connect()}
      />

      {connectError && (
        <div className="notice notice--error">
          <span>
            {connectError} Start it with <code>python src/app.py</code> in the netsentry
            repo, then press Connect.
          </span>
        </div>
      )}

      <DecisionAxis
        bins={session.stats.attackProbBins}
        attackThreshold={attackThreshold}
        unknownThreshold={unknownThreshold}
        cursor={cursor}
        total={session.stats.total}
      />

      <div className="body">
        <div className="col">
          <SourcePanel
            flows={flows}
            parsing={parsing}
            parseError={parseError}
            onFile={(file) => void handleFile(file)}
            onClearFile={clearFile}
            replayState={replayState}
            dispatched={dispatched}
            rate={rate}
            onRateChange={setRate}
            onStart={startReplay}
            onPause={() => replayRef.current?.pause()}
            onResume={() => replayRef.current?.resume()}
            onStop={() => replayRef.current?.stop()}
            onClassifyOne={(features, source) => void classifyOne(features, source)}
            classifying={classifying}
            batched={supportsBatch(service)}
            canRun={connection === 'online'}
          />

          <SummaryTiles stats={session.stats} />

          <Ledger
            verdicts={session.verdicts}
            failures={session.failures}
            pole={pole}
            onPoleChange={setPole}
            search={search}
            onSearchChange={setSearch}
            showFailures={showFailures}
            onToggleFailures={() => setShowFailures((current) => !current)}
            selectedId={selectedId}
            onSelect={(verdict: Verdict) => setSelectedId(verdict.id)}
            ledgerLimit={LEDGER_LIMIT}
            totalClassified={session.stats.total}
          />
        </div>

        <DetailRail verdict={selected} />
      </div>
    </div>
  )
}
