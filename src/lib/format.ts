/** Display formatting. Pure functions, trivially testable. */

const compact = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const plain = new Intl.NumberFormat('en')

/** 48200 -> "48.2K". Stays exact below 10k where precision still reads. */
export function formatCount(value: number): string {
  return value < 10_000 ? plain.format(value) : compact.format(value)
}

/** 0.8734 -> "87.34%" */
export function formatPercent(value: number, digits = 2): string {
  return `${(value * 100).toFixed(digits)}%`
}

/** 0.8734 -> "0.8734" — the raw probability, for when the number is the point. */
export function formatProbability(value: number, digits = 4): string {
  return value.toFixed(digits)
}

export function formatLatency(ms: number): string {
  return ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`
}

export function formatClock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('en-GB', { hour12: false })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}

/** "UNKNOWN_UNSEEN" -> "Unknown unseen"; keeps acronyms like DDoS intact. */
export function humanizeClass(value: string): string {
  if (!value) return ''
  if (!value.includes('_')) return value
  const [first, ...rest] = value.split('_')
  return [first.charAt(0) + first.slice(1).toLowerCase(), ...rest.map((w) => w.toLowerCase())].join(
    ' ',
  )
}
