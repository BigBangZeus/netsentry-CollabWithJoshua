import type { Verdict } from '../api/types'
import { attackProbability } from '../store/session'
import {
  formatClock,
  formatLatency,
  formatPercent,
  formatProbability,
  humanizeClass,
} from '../lib/format'

interface BarProps {
  label: string
  value: number
  tone?: 'attack' | 'benign'
}

function ProbabilityBar({ label, value, tone }: BarProps) {
  return (
    <div className="prob__row">
      <span className="prob__label">{label}</span>
      <span className="prob__value">{formatProbability(value)}</span>
      <div className="prob__track">
        <div
          className={`prob__fill${tone ? ` prob__fill--${tone}` : ''}`}
          style={{ width: `${Math.min(100, value * 100)}%` }}
        />
      </div>
    </div>
  )
}

interface Props {
  verdict: Verdict | null
}

export function DetailRail({ verdict }: Props) {
  if (!verdict) {
    return (
      <aside className="panel detail">
        <div className="panel__head">
          <span className="eyebrow">Verdict detail</span>
        </div>
        <div className="empty">
          <div className="empty__title">No verdict selected</div>
          <div className="empty__hint">
            Pick a row from the ledger to see the full engine response.
          </div>
        </div>
      </aside>
    )
  }

  const { response } = verdict
  const probability = attackProbability(response)
  const attackTypes = Object.entries(response.attack_type_probabilities).sort(
    (a, b) => b[1] - a[1],
  )

  const labelDisagrees =
    verdict.groundTruth !== undefined &&
    (verdict.groundTruth.trim().toUpperCase() === 'BENIGN') !== (response.prediction === 'BENIGN')

  return (
    <aside className="panel detail" aria-label="Verdict detail">
      <div className="panel__head">
        <span className="eyebrow">Verdict detail</span>
        <div className="panel__spacer" />
        <span className="num" style={{ fontSize: 11, color: 'var(--bone-faint)' }}>
          #{verdict.seq}
        </span>
      </div>

      <div className="detail__section">
        <div className="eyebrow">Stage 1 — binary</div>
        <div
          className={`detail__headline detail__headline--${response.is_attack ? 'attack' : 'benign'}`}
        >
          {response.prediction}
        </div>
        <div style={{ color: 'var(--bone-dim)', fontSize: 12 }}>
          {formatPercent(response.confidence)} confidence &middot;{' '}
          <span className={`risk risk--${response.risk_level}`}>{response.risk_level}</span> risk
        </div>
      </div>

      <div className="detail__section">
        <div className="eyebrow" style={{ marginBottom: 9 }}>
          Class probabilities
        </div>
        <div className="prob">
          {Object.entries(response.probabilities).map(([label, value]) => (
            <ProbabilityBar
              key={label}
              label={label}
              value={value}
              tone={label.trim().toUpperCase() === 'ATTACK' ? 'attack' : 'benign'}
            />
          ))}
        </div>
      </div>

      {/* Stage 2 only runs when stage 1 crossed the attack threshold. */}
      <div className="detail__section">
        <div className="eyebrow" style={{ marginBottom: 9 }}>
          Stage 2 — attack type
        </div>

        {response.is_attack ? (
          <>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 600 }}>
                {humanizeClass(response.attack_type)}
              </div>
              {response.attack_type_confidence !== null && (
                <div style={{ color: 'var(--bone-faint)', fontSize: 11 }}>
                  {formatPercent(response.attack_type_confidence)} confidence
                  {response.attack_type === 'UNKNOWN_UNSEEN' &&
                    ` — below the ${response.thresholds.unknown_attack_type} unknown-type threshold`}
                </div>
              )}
            </div>

            <div className="prob">
              {attackTypes.slice(0, 8).map(([label, value]) => (
                <ProbabilityBar key={label} label={humanizeClass(label)} value={value} />
              ))}
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--bone-faint)', fontSize: 12 }}>
            Not run. Stage 2 only executes once stage 1 crosses{' '}
            {response.thresholds.binary_attack}.
          </div>
        )}
      </div>

      <div className="detail__section">
        <div className="eyebrow" style={{ marginBottom: 9 }}>
          Record
        </div>
        <dl className="kv">
          <dt>P(attack)</dt>
          <dd>{formatProbability(probability)}</dd>

          <dt>Attack threshold</dt>
          <dd>{response.thresholds.binary_attack}</dd>

          <dt>Unknown threshold</dt>
          <dd>{response.thresholds.unknown_attack_type}</dd>

          <dt>Source</dt>
          <dd>
            {verdict.source}
            {verdict.sourceRow !== undefined && ` · row ${verdict.sourceRow}`}
          </dd>

          {verdict.groundTruth !== undefined && (
            <>
              <dt>Dataset label</dt>
              <dd style={labelDisagrees ? { color: 'var(--amber)' } : undefined}>
                {verdict.groundTruth}
                {labelDisagrees && ' (disagrees)'}
              </dd>
            </>
          )}

          <dt>Features sent</dt>
          <dd>{response.features.provided}</dd>

          <dt>Latency</dt>
          <dd>{formatLatency(verdict.latencyMs)}</dd>

          <dt>Received</dt>
          <dd>{formatClock(verdict.at)}</dd>

          <dt>Binary model</dt>
          <dd>{response.models.binary}</dd>

          <dt>Multiclass model</dt>
          <dd>{response.models.multiclass}</dd>
        </dl>
      </div>
    </aside>
  )
}
