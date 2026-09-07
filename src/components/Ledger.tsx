import { useMemo } from 'react'

import type { Verdict, VerdictFailure } from '../api/types'
import { attackProbability } from '../store/session'
import { formatClock, formatLatency, formatProbability, humanizeClass } from '../lib/format'

export type PoleFilter = 'ALL' | 'ATTACK' | 'BENIGN'

interface Props {
  verdicts: Verdict[]
  failures: VerdictFailure[]
  pole: PoleFilter
  onPoleChange: (pole: PoleFilter) => void
  search: string
  onSearchChange: (value: string) => void
  showFailures: boolean
  onToggleFailures: () => void
  selectedId: string | null
  onSelect: (verdict: Verdict) => void
  ledgerLimit: number
  totalClassified: number
}

/** One ledger row: either a verdict or a failure, ordered by sequence. */
type Row =
  | { kind: 'verdict'; seq: number; verdict: Verdict }
  | { kind: 'failure'; seq: number; failure: VerdictFailure }

export function Ledger({
  verdicts,
  failures,
  pole,
  onPoleChange,
  search,
  onSearchChange,
  showFailures,
  onToggleFailures,
  selectedId,
  onSelect,
  ledgerLimit,
  totalClassified,
}: Props) {
  const rows = useMemo<Row[]>(() => {
    const needle = search.trim().toLowerCase()

    const matched = verdicts.filter((verdict) => {
      if (pole === 'ATTACK' && !verdict.response.is_attack) return false
      if (pole === 'BENIGN' && verdict.response.is_attack) return false

      if (!needle) return true
      return (
        verdict.response.attack_type.toLowerCase().includes(needle) ||
        verdict.response.risk_level.toLowerCase().includes(needle) ||
        String(verdict.sourceRow ?? '').includes(needle) ||
        (verdict.groundTruth ?? '').toLowerCase().includes(needle)
      )
    })

    const combined: Row[] = matched.map((verdict) => ({
      kind: 'verdict',
      seq: verdict.seq,
      verdict,
    }))

    if (showFailures) {
      for (const failure of failures) {
        combined.push({ kind: 'failure', seq: failure.seq, failure })
      }
    }

    return combined.sort((a, b) => b.seq - a.seq)
  }, [verdicts, failures, pole, search, showFailures])

  const truncated = totalClassified > ledgerLimit

  return (
    <section className="panel" style={{ flex: 1, minHeight: 0 }}>
      <div className="panel__head">
        <span className="eyebrow">Ledger</span>

        <div className="filters">
          {(['ALL', 'ATTACK', 'BENIGN'] as PoleFilter[]).map((option) => (
            <button
              key={option}
              type="button"
              className="chip"
              aria-pressed={pole === option}
              style={
                option === 'ATTACK'
                  ? { ['--pole' as string]: 'var(--attack)' }
                  : option === 'BENIGN'
                    ? { ['--pole' as string]: 'var(--benign)' }
                    : undefined
              }
              onClick={() => onPoleChange(option)}
            >
              {option === 'ALL' ? 'All' : option === 'ATTACK' ? 'Attack' : 'Benign'}
            </button>
          ))}

          {failures.length > 0 && (
            <button
              type="button"
              className="chip"
              aria-pressed={showFailures}
              style={{ ['--pole' as string]: 'var(--amber)' }}
              onClick={onToggleFailures}
            >
              Failures {failures.length}
            </button>
          )}
        </div>

        <div className="panel__spacer" />

        <div className="search">
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="attack type, risk, row, label…"
            aria-label="Filter the ledger"
          />
        </div>
      </div>

      {truncated && (
        <div className="notice notice--warn">
          <span>
            Showing the most recent {ledgerLimit.toLocaleString('en')} of{' '}
            {totalClassified.toLocaleString('en')} classifications. The axis and summary
            above cover the full run.
          </span>
        </div>
      )}

      <div className="ledger-wrap">
        <table className="ledger">
          <thead>
            <tr>
              <th>Seq</th>
              <th>Time</th>
              <th>Verdict</th>
              <th>P(attack)</th>
              <th>Risk</th>
              <th>Attack type</th>
              <th>Row</th>
              <th>Label</th>
              <th>Latency</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              row.kind === 'verdict' ? (
                <VerdictRow
                  key={row.verdict.id}
                  verdict={row.verdict}
                  selected={row.verdict.id === selectedId}
                  onSelect={onSelect}
                />
              ) : (
                <tr key={row.failure.id} className="row--fail">
                  <td className="num">{row.failure.seq}</td>
                  <td className="num">{formatClock(row.failure.at)}</td>
                  <td colSpan={6}>
                    {row.failure.status ? `${row.failure.status} — ` : ''}
                    {row.failure.message}
                  </td>
                  <td className="num">
                    {row.failure.sourceRow ? `row ${row.failure.sourceRow}` : ''}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="empty">
            <div className="empty__title">
              {totalClassified === 0 ? 'Nothing classified yet' : 'Nothing matches this filter'}
            </div>
            <div className="empty__hint">
              {totalClassified === 0
                ? 'Load a flow export and start the replay to populate the ledger.'
                : 'Clear the search or switch back to All.'}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

interface VerdictRowProps {
  verdict: Verdict
  selected: boolean
  onSelect: (verdict: Verdict) => void
}

function VerdictRow({ verdict, selected, onSelect }: VerdictRowProps) {
  const { response } = verdict
  const probability = attackProbability(response)

  // Only meaningful when the source shipped a label; blank otherwise.
  const disagrees =
    verdict.groundTruth !== undefined &&
    (verdict.groundTruth.trim().toUpperCase() === 'BENIGN') !== (response.prediction === 'BENIGN')

  return (
    <tr
      aria-selected={selected}
      tabIndex={0}
      onClick={() => onSelect(verdict)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(verdict)
        }
      }}
    >
      <td className="num">{verdict.seq}</td>
      <td className="num">{formatClock(verdict.at)}</td>
      <td>
        <span className={`verdict verdict--${response.is_attack ? 'attack' : 'benign'}`}>
          {response.prediction}
        </span>
      </td>
      <td className="num">{formatProbability(probability)}</td>
      <td>
        <span className={`risk risk--${response.risk_level}`}>{response.risk_level}</span>
      </td>
      <td className="wide">
        {response.is_attack ? humanizeClass(response.attack_type) : '—'}
      </td>
      <td className="num">{verdict.sourceRow ?? '—'}</td>
      <td className="num" style={disagrees ? { color: 'var(--amber)' } : undefined}>
        {verdict.groundTruth ?? '—'}
      </td>
      <td className="num">{formatLatency(verdict.latencyMs)}</td>
    </tr>
  )
}
