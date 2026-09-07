import type { ConnectionState, HealthResponse } from '../api/types'
import { formatClock } from '../lib/format'

const STATE_LABEL: Record<ConnectionState, string> = {
  idle: 'Not connected',
  checking: 'Checking',
  online: 'Models loaded',
  offline: 'Unreachable',
}

interface Props {
  endpoint: string
  onEndpointChange: (value: string) => void
  connection: ConnectionState
  health: HealthResponse | null
  /** Epoch ms of the last completed health check, or null before the first. */
  lastCheckedAt: number | null
  onConnect: () => void
}

export function InstrumentBar({
  endpoint,
  onEndpointChange,
  connection,
  health,
  lastCheckedAt,
  onConnect,
}: Props) {
  const checking = connection === 'checking'

  return (
    <header className="bar">
      <div className="bar__brand">
        NET<span>SENTRY</span>
      </div>
      <div className="bar__sub">Analysis console</div>

      <div className="bar__spacer" />

      {health && (
        <span className="eyebrow" title="Feature counts reported by the engine">
          {health.binary_feature_count} features &middot; {health.attack_class_count} classes
        </span>
      )}

      <form
        className="endpoint"
        onSubmit={(event) => {
          event.preventDefault()
          onConnect()
        }}
      >
        <label htmlFor="endpoint-input">Engine</label>
        <input
          id="endpoint-input"
          value={endpoint}
          onChange={(event) => onEndpointChange(event.target.value)}
          spellCheck={false}
          autoComplete="off"
          aria-label="Engine endpoint URL"
        />
      </form>

      {/* The verb tracks the actual state: you connect when you are not
          connected, and re-check when you already are. */}
      <button type="button" className="btn" onClick={onConnect} disabled={checking}>
        {checking ? 'Checking…' : connection === 'online' ? 'Recheck' : 'Connect'}
      </button>

      <span className={`pill pill--${connection}`} role="status" aria-live="polite">
        <span className="pill__led" />
        {STATE_LABEL[connection]}
      </span>

      {/*
        The engine answers in milliseconds, so without a timestamp a re-check
        of an already-online engine leaves no trace that anything happened.
      */}
      <span
        className="bar__stamp num"
        title={lastCheckedAt ? 'Last successful health check' : undefined}
      >
        {checking ? '· · ·' : lastCheckedAt ? formatClock(lastCheckedAt) : '—'}
      </span>
    </header>
  )
}
