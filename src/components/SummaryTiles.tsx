import type { SessionStats } from '../store/session'
import { formatCount, formatLatency, formatPercent } from '../lib/format'

interface TileProps {
  label: string
  value: string
  unit?: string
  foot?: string
  tone?: 'attack' | 'benign'
}

function Tile({ label, value, unit, foot, tone }: TileProps) {
  return (
    <div className={`tile${tone ? ` tile--${tone}` : ''}`}>
      <div className="eyebrow">{label}</div>
      <div className="tile__value">
        {value}
        {unit && <span className="tile__unit">{unit}</span>}
      </div>
      {foot && <div className="tile__foot">{foot}</div>}
    </div>
  )
}

interface Props {
  stats: SessionStats
}

export function SummaryTiles({ stats }: Props) {
  const attackShare = stats.total > 0 ? stats.attacks / stats.total : 0
  const meanLatency = stats.total > 0 ? stats.latencySumMs / stats.total : 0
  const agreement = stats.labelled > 0 ? stats.agreed / stats.labelled : null

  return (
    <div className="tiles">
      <Tile
        label="Classified"
        value={formatCount(stats.total)}
        foot={stats.failures > 0 ? `${formatCount(stats.failures)} failed` : 'no failures'}
      />
      <Tile
        label="Attack"
        value={formatCount(stats.attacks)}
        tone="attack"
        foot={`${formatPercent(attackShare, 1)} of traffic`}
      />
      <Tile
        label="Benign"
        value={formatCount(stats.benign)}
        tone="benign"
        foot={`${formatPercent(1 - attackShare, 1)} of traffic`}
      />
      <Tile
        label="Critical"
        value={formatCount(stats.byRisk.CRITICAL)}
        foot={`${formatCount(stats.byRisk.HIGH)} high`}
      />
      <Tile
        label="Mean latency"
        value={stats.total > 0 ? formatLatency(meanLatency) : '—'}
        foot="per request"
      />
      {/* Agreement only means something when the export shipped labels. */}
      <Tile
        label="Label agreement"
        value={agreement === null ? '—' : formatPercent(agreement, 1)}
        foot={
          agreement === null
            ? 'no labels in source'
            : `${formatCount(stats.agreed)} of ${formatCount(stats.labelled)}`
        }
      />
    </div>
  )
}
