/**
 * Wire contract for the NETSENTRY engine.
 *
 * Transcribed from the service's own Flask handlers, so field names are
 * snake_case exactly as the API emits them. Four endpoints exist and no
 * more: `/`, `/health`, `/api/model`, `POST /api/predict`.
 *
 * The engine is stateless — it classifies one flow record per request and
 * remembers nothing. Every notion of history, counts, or "recent activity"
 * in this app is therefore owned by the client, not the server.
 */

export type Prediction = 'ATTACK' | 'BENIGN'

/** Risk is derived server-side from prediction + confidence. */
export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export const RISK_LEVELS: RiskLevel[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

/** `POST /api/predict` body. Every one of the 70 features must be present. */
export interface PredictRequest {
  features: Record<string, number>
}

export interface PredictResponse {
  prediction: Prediction
  is_attack: boolean
  confidence: number
  confidence_percent: number
  risk_level: RiskLevel
  /** "BENIGN" when stage 2 did not run, else the attack family or UNKNOWN_UNSEEN. */
  attack_type: string
  attack_type_prediction: string | null
  attack_type_confidence: number | null
  /** Stage 1 class probabilities, pre-sorted descending by the server. */
  probabilities: Record<string, number>
  /** Stage 2 class probabilities. Empty object when stage 2 did not run. */
  attack_type_probabilities: Record<string, number>
  models: { binary: string; multiclass: string }
  thresholds: { binary_attack: number; unknown_attack_type: number }
  features: { binary: number; multiclass: number; provided: number }
}

export interface ServiceInfo {
  name: string
  description: string
  architecture: { stage_1: string; stage_2: string }
  binary_attack_threshold: number
  unknown_type_threshold: number
  binary_feature_count: number
  multiclass_feature_count: number
  attack_types: string[]
}

export interface HealthResponse {
  status: string
  model_loaded: boolean
  binary_model_loaded: boolean
  multiclass_model_loaded: boolean
  binary_feature_count: number
  multiclass_feature_count: number
  binary_only_feature_count: number
  class_count: number
  attack_class_count: number
  binary_attack_threshold: number
  unknown_type_threshold: number
}

export interface ModelInfo {
  model: string
  binary_model: {
    file: string
    classes: string[]
    feature_count: number
    attack_threshold: number
  }
  multiclass_model: { file: string; classes: string[]; feature_count: number }
  binary_only_features: string[]
  unknown_type_threshold: number
}

/** The engine's error envelope, used for 400/500/503 alike. */
export interface ApiError {
  error: string
}

// ---------------------------------------------------------------------------
// Client-side records
// ---------------------------------------------------------------------------

/**
 * One classification, as this app stores it. The engine returns only the
 * response half; sequence, timing and provenance are added here so the
 * session can be reconstructed, filtered and persisted.
 */
export interface Verdict {
  id: string
  /** 1-based order within the session. */
  seq: number
  /** Epoch ms when the response landed. */
  at: number
  /** Round-trip latency in ms. */
  latencyMs: number
  /** Where the record came from, for the ledger's provenance column. */
  source: VerdictSource
  /** Row number in the source CSV, when applicable. */
  sourceRow?: number
  /** The label shipped alongside the flow in the CSV, when present. */
  groundTruth?: string
  response: PredictResponse
}

export type VerdictSource = 'replay' | 'single' | 'sample'

/** A failed classification. Kept so the ledger can show what did not work. */
export interface VerdictFailure {
  id: string
  seq: number
  at: number
  source: VerdictSource
  sourceRow?: number
  status: number | null
  message: string
}

export type ConnectionState = 'idle' | 'checking' | 'online' | 'offline'
