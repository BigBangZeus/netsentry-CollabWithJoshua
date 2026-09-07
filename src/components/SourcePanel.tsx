import { useRef, useState } from 'react'

import { FEATURE_COUNT } from '../api/features'
import type { ParsedFlows } from '../engine/csv'
import { MAX_RATE, MIN_RATE } from '../engine/replay'
import type { ReplayState } from '../engine/replay'
import { formatCount } from '../lib/format'

interface Props {
  flows: ParsedFlows | null
  parsing: boolean
  parseError: string | null
  onFile: (file: File) => void
  onClearFile: () => void

  replayState: ReplayState
  dispatched: number
  rate: number
  onRateChange: (rate: number) => void
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void

  canRun: boolean
}

export function SourcePanel({
  flows,
  parsing,
  parseError,
  onFile,
  onClearFile,
  replayState,
  dispatched,
  rate,
  onRateChange,
  onStart,
  onPause,
  onResume,
  onStop,
  canRun,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const usable = flows !== null && flows.missing.length === 0 && flows.rows.length > 0
  const running = replayState === 'running'
  const paused = replayState === 'paused'
  const total = flows?.rows.length ?? 0
  const progress = total > 0 ? Math.min(100, (dispatched / total) * 100) : 0

  return (
    <section className="panel">
      <div className="panel__head">
        <span className="eyebrow">Flow source</span>
        <div className="panel__spacer" />
        {flows && (
          <button type="button" className="chip" onClick={onClearFile}>
            Clear
          </button>
        )}
      </div>

      {parseError && (
        <div className="notice notice--error">
          <span>{parseError}</span>
        </div>
      )}

      {/* Schema mismatch is fatal: the engine rejects any incomplete record,
          so say exactly what is missing rather than letting the run fail. */}
      {flows && flows.missing.length > 0 && (
        <div className="notice notice--error">
          <span>
            This export is missing {flows.missing.length} of the {FEATURE_COUNT} required
            features, so the engine would reject every row. First missing:{' '}
            <code>{flows.missing.slice(0, 3).join(', ')}</code>
            {flows.missing.length > 3 && ` and ${flows.missing.length - 3} more`}.
          </span>
        </div>
      )}

      {flows && flows.missing.length === 0 && flows.coercedCells > 0 && (
        <div className="notice notice--warn">
          <span>
            {formatCount(flows.coercedCells)} non-finite cells were set to 0, matching how
            the engine handles them. Predictions on those rows are still real, but the
            inputs were not.
          </span>
        </div>
      )}

      {!flows ? (
        <div style={{ padding: 14 }}>
          <button
            type="button"
            className={`drop${dragging ? ' drop--over' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              const file = event.dataTransfer.files?.[0]
              if (file) onFile(file)
            }}
          >
            <div className="drop__title">
              {parsing ? 'Reading flow export…' : 'Drop a CICIDS2017 CSV, or click to browse'}
            </div>
            <div className="drop__hint">
              Needs all {FEATURE_COUNT} production features. A Label column, if present, is
              used to score agreement.
            </div>
          </button>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onFile(file)
              // Allow re-selecting the same file after a clear.
              event.target.value = ''
            }}
          />
        </div>
      ) : (
        <>
          <div className="file">
            <span className="file__name">{flows.fileName}</span>
            <span className="file__meta">
              {formatCount(flows.rows.length)} rows &middot; {flows.columns.length} columns
              {flows.labelColumn && ' · labelled'}
            </span>
          </div>

          <div className="transport">
            {!running && !paused && (
              <button type="button" className="btn btn--go" onClick={onStart} disabled={!usable || !canRun}>
                Start replay
              </button>
            )}
            {running && (
              <button type="button" className="btn" onClick={onPause}>
                Pause
              </button>
            )}
            {paused && (
              <button type="button" className="btn btn--go" onClick={onResume}>
                Resume
              </button>
            )}
            {(running || paused) && (
              <button type="button" className="btn btn--stop" onClick={onStop}>
                Stop
              </button>
            )}

            <label className="rate">
              <span className="eyebrow">Rate</span>
              <input
                type="range"
                min={MIN_RATE}
                max={MAX_RATE}
                value={rate}
                onChange={(event) => onRateChange(Number(event.target.value))}
                aria-label="Replay rate in requests per second"
              />
              <span className="num" style={{ fontSize: 11, minWidth: 46 }}>
                {rate}/s
              </span>
            </label>

            <span className="num" style={{ fontSize: 11, color: 'var(--bone-faint)' }}>
              {formatCount(dispatched)} / {formatCount(total)}
            </span>

            <div className="progress">
              <div className="progress__fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {!canRun && usable && (
            <div className="notice notice--warn">
              <span>Connect to the engine before starting a replay.</span>
            </div>
          )}
        </>
      )}
    </section>
  )
}
