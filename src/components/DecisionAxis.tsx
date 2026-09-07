import { useEffect, useRef, useState } from 'react'

import { BIN_COUNT } from '../store/session'

/**
 * The decision axis.
 *
 * Every verdict this engine produces is one number meeting one threshold, so
 * that is what the console leads with: the session's full P(ATTACK)
 * distribution drawn against the engine's two real detents (0.55 binary
 * attack, 0.30 unknown-type). Watching the histogram build during a replay
 * shows at a glance whether the model is deciding confidently or piling up
 * against the boundary — which is exactly the calibration caveat the engine's
 * own documentation raises.
 */

const HEIGHT = 116
const PAD = { top: 22, right: 16, bottom: 20, left: 16 }

/** Axis gridline positions. */
const TICKS = [0, 0.25, 0.5, 0.75, 1]

function useMeasuredWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}

interface Props {
  /** Counts per probability bin, length `BIN_COUNT`, covering [0,1]. */
  bins: number[]
  attackThreshold: number
  unknownThreshold: number
  /** P(ATTACK) of the most recent verdict, drawn as a live cursor. */
  cursor: number | null
  total: number
}

export function DecisionAxis({
  bins,
  attackThreshold,
  unknownThreshold,
  cursor,
  total,
}: Props) {
  const [ref, width] = useMeasuredWidth()

  const plotWidth = Math.max(0, width - PAD.left - PAD.right)
  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  const baseline = PAD.top + plotHeight

  const x = (probability: number) => PAD.left + probability * plotWidth
  const peak = Math.max(1, ...bins)

  /**
   * Square-root scaling. Flow datasets are heavily skewed toward one pole, so
   * a linear axis renders every minority bin as an invisible sliver.
   */
  const barHeight = (count: number) => (count <= 0 ? 0 : (Math.sqrt(count) / Math.sqrt(peak)) * plotHeight)

  const binWidth = plotWidth / BIN_COUNT
  const ready = width > 0

  return (
    <div className="axis" ref={ref}>
      {total === 0 ? (
        <div className="axis__empty">
          No classifications yet. Load a flow export below and start the replay.
        </div>
      ) : (
        ready && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`Distribution of attack probability across ${total} classifications, with the attack threshold at ${attackThreshold}`}
          >
            {/* Region labels sit above the plot so bars never collide with them */}
            <text className="axis__region" x={PAD.left} y={10}>
              Benign
            </text>
            <text className="axis__region" x={PAD.left + plotWidth} y={10} textAnchor="end">
              Attack
            </text>

            {/* Histogram */}
            {bins.map((count, i) => {
              if (count <= 0) return null
              const height = barHeight(count)
              const centre = (i + 0.5) / BIN_COUNT
              const isAttack = centre >= attackThreshold

              return (
                <rect
                  key={i}
                  className={isAttack ? 'axis__bar-attack' : 'axis__bar-benign'}
                  x={PAD.left + i * binWidth}
                  y={baseline - height}
                  width={Math.max(1, binWidth - 1)}
                  height={height}
                  opacity={0.85}
                />
              )
            })}

            {/* Detents: the engine's two real thresholds */}
            {[
              { value: unknownThreshold, label: `unknown ${unknownThreshold}` },
              { value: attackThreshold, label: `attack ${attackThreshold}` },
            ].map((detent) => (
              <g key={detent.label}>
                <line
                  className="axis__detent"
                  x1={x(detent.value)}
                  y1={PAD.top - 8}
                  x2={x(detent.value)}
                  y2={baseline}
                />
                <text
                  className="axis__detent-label"
                  x={x(detent.value)}
                  y={PAD.top - 12}
                  textAnchor="middle"
                >
                  {detent.label}
                </text>
              </g>
            ))}

            {/* Live cursor: where the most recent verdict landed */}
            {cursor !== null && (
              <g>
                <line
                  className="axis__cursor"
                  x1={x(cursor)}
                  y1={PAD.top - 4}
                  x2={x(cursor)}
                  y2={baseline}
                />
                <circle className="axis__cursor-cap" cx={x(cursor)} cy={PAD.top - 4} r={2.5} />
              </g>
            )}

            {/* Baseline and scale */}
            <line
              className="axis__baseline"
              x1={PAD.left}
              y1={baseline}
              x2={PAD.left + plotWidth}
              y2={baseline}
            />

            {TICKS.map((tick) => (
              <g key={tick}>
                <line
                  className="axis__tick"
                  x1={x(tick)}
                  y1={baseline}
                  x2={x(tick)}
                  y2={baseline + 4}
                />
                <text
                  className="axis__tick-label"
                  x={x(tick)}
                  y={baseline + 14}
                  textAnchor={tick === 0 ? 'start' : tick === 1 ? 'end' : 'middle'}
                >
                  {tick.toFixed(2)}
                </text>
              </g>
            ))}
          </svg>
        )
      )}
    </div>
  )
}
