/**
 * CICIDS2017 CSV ingestion.
 *
 * The engine requires all 70 production features on every request, so the
 * whole file is validated against the schema up front. Discovering a missing
 * column after firing 10,000 requests would be worse than useless.
 */

import Papa from 'papaparse'

import {
  LABEL_COLUMNS,
  PRODUCTION_FEATURES,
  canonical,
  missingFeatures,
} from '../api/features'

export interface FlowRow {
  /** 1-based row number in the source file, for provenance in the ledger. */
  index: number
  features: Record<string, number>
  /** The dataset's own label, when the export includes one. */
  label?: string
}

export interface ParsedFlows {
  fileName: string
  columns: string[]
  /** Required features the file does not provide. Empty means it is usable. */
  missing: string[]
  labelColumn: string | null
  rows: FlowRow[]
  /**
   * Count of cells that were not finite numbers (blank, "Infinity", "NaN").
   * The engine coerces these to 0, so we mirror that and report the total
   * rather than silently changing the analyst's data.
   */
  coercedCells: number
  parseErrors: string[]
}

/** Matches the engine's own coercion: non-finite becomes 0. */
function toFinite(raw: unknown): { value: number; coerced: boolean } {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { value: raw, coerced: false } : { value: 0, coerced: true }
  }
  const text = String(raw ?? '').trim()
  if (text === '') return { value: 0, coerced: true }

  const parsed = Number(text)
  return Number.isFinite(parsed)
    ? { value: parsed, coerced: false }
    : { value: 0, coerced: true }
}

export function parseFlowCsv(file: File): Promise<ParsedFlows> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      // CICIDS exports carry leading spaces and sometimes a BOM.
      transformHeader: (header) => canonical(header.replace(/^\uFEFF/, '')),

      complete(results) {
        const columns = (results.meta.fields ?? []).map(canonical)
        const missing = missingFeatures(columns)
        const labelColumn =
          LABEL_COLUMNS.map(canonical).find((candidate) => columns.includes(candidate)) ??
          null

        const rows: FlowRow[] = []
        let coercedCells = 0

        if (missing.length === 0) {
          results.data.forEach((record, i) => {
            const features: Record<string, number> = {}

            for (const feature of PRODUCTION_FEATURES) {
              const { value, coerced } = toFinite(record[feature])
              features[feature] = value
              if (coerced) coercedCells += 1
            }

            const label = labelColumn ? record[labelColumn]?.trim() : undefined

            rows.push({
              index: i + 1,
              features,
              ...(label ? { label } : {}),
            })
          })
        }

        resolve({
          fileName: file.name,
          columns,
          missing,
          labelColumn,
          rows,
          coercedCells,
          // Papa reports per-row issues; surface the first few only.
          parseErrors: results.errors.slice(0, 5).map((e) => `Row ${e.row ?? '?'}: ${e.message}`),
        })
      },

      error(cause) {
        reject(new Error(`Could not read ${file.name}: ${cause.message}`))
      },
    })
  })
}
