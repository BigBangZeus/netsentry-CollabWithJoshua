import { useState } from 'react'

import { FEATURE_COUNT, canonical, missingFeatures } from '../api/features'
import { SAMPLE_FLOWS } from '../api/samples'
import type { VerdictSource } from '../api/types'

/**
 * Inspect one flow without loading a file.
 *
 * The CSV replay is the right tool for volume, but it is a poor way to answer
 * "what does the engine make of this one record" — and it makes the detail
 * rail unreachable until a whole file has been processed.
 */

interface Props {
  onClassify: (features: Record<string, number>, source: VerdictSource) => void
  canRun: boolean
  busy: boolean
}

/**
 * Accepts either the full request envelope or a bare features object, since
 * both are things a person plausibly has on their clipboard.
 */
function extractFeatures(text: string): Record<string, number> {
  const parsed: unknown = JSON.parse(text)

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object.')
  }

  const container = parsed as Record<string, unknown>
  const raw =
    'features' in container && container.features && typeof container.features === 'object'
      ? (container.features as Record<string, unknown>)
      : container

  const features: Record<string, number> = {}

  for (const [key, value] of Object.entries(raw)) {
    const numeric = Number(value)
    // Match the engine: anything non-finite becomes 0 rather than failing.
    features[canonical(key)] = Number.isFinite(numeric) ? numeric : 0
  }

  const missing = missingFeatures(Object.keys(features))

  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.length} of ${FEATURE_COUNT} features, starting with ` +
        `${missing.slice(0, 3).join(', ')}.`,
    )
  }

  return features
}

export function SingleRecordPanel({ onClassify, canRun, busy }: Props) {
  const [json, setJson] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submitJson = () => {
    setError(null)
    try {
      onClassify(extractFeatures(json), 'single')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read that JSON.')
    }
  }

  return (
    <>
      <div className="samples">
        {SAMPLE_FLOWS.map((sample) => (
          <button
            key={sample.id}
            type="button"
            className="sample"
            disabled={!canRun || busy}
            onClick={() => onClassify(sample.features, 'sample')}
          >
            <span className="sample__name">{sample.name}</span>
            <span className="sample__desc">{sample.description}</span>
          </button>
        ))}
      </div>

      <div className="paste">
        <div className="eyebrow" style={{ marginBottom: 7 }}>
          Or paste one record
        </div>

        <textarea
          className="paste__input"
          value={json}
          onChange={(event) => {
            setJson(event.target.value)
            if (error) setError(null)
          }}
          spellCheck={false}
          rows={4}
          placeholder={'{"features": {"Destination Port": 443, "Flow Duration": 4812665, …}}'}
          aria-label="Flow record JSON"
        />

        <div className="paste__foot">
          <span className="paste__hint">
            {error ? (
              <span style={{ color: 'var(--attack)' }}>{error}</span>
            ) : (
              `All ${FEATURE_COUNT} production features required. A bare features object works too.`
            )}
          </span>

          <button
            type="button"
            className="btn btn--go"
            disabled={!canRun || busy || json.trim().length === 0}
            onClick={submitJson}
          >
            {busy ? 'Classifying…' : 'Classify'}
          </button>
        </div>
      </div>

      {!canRun && (
        <div className="notice notice--warn">
          <span>Connect to the engine to classify a record.</span>
        </div>
      )}
    </>
  )
}
