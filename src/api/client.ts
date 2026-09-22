/**
 * Typed access to the four NETSENTRY endpoints.
 *
 * Deliberately thin: the engine is stateless, so this module caches nothing
 * and holds no session state. Transport selection (IPC on desktop, fetch on
 * web) lives in `transport.ts`; this file only shapes requests and turns the
 * engine's error envelope into a thrown `EngineError`.
 */

import { send } from './transport'
import type { RequestInitLite } from './transport'
import type {
  BatchResponse,
  BatchResult,
  HealthResponse,
  ModelInfo,
  PredictResponse,
  ServiceInfo,
} from './types'

export { DEFAULT_ENDPOINT, isDesktop } from './transport'

/**
 * An error the engine reported, or a transport failure.
 * `status` is null when the request never reached the server.
 */
export class EngineError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'EngineError'
    this.status = status
  }
}

async function call<T>(
  endpoint: string,
  path: string,
  init?: RequestInitLite,
): Promise<T> {
  const { ok, status, body } = await send(endpoint, path, init)

  if (!ok) {
    // Every engine failure is {"error": "..."}; transport failures are shaped
    // the same way by the transport layer, so one branch handles both.
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Request to ${path} failed${status ? ` with ${status}` : ''}`
    throw new EngineError(message, status)
  }

  return body as T
}

export function getServiceInfo(endpoint: string): Promise<ServiceInfo> {
  return call<ServiceInfo>(endpoint, '/')
}

export function getHealth(endpoint: string): Promise<HealthResponse> {
  return call<HealthResponse>(endpoint, '/health')
}

export function getModelInfo(endpoint: string): Promise<ModelInfo> {
  return call<ModelInfo>(endpoint, '/api/model')
}

/**
 * Classify one flow record. `features` must carry all 70 production features;
 * the engine 400s with the list of missing names otherwise.
 */
export function predict(
  endpoint: string,
  features: Record<string, number>,
): Promise<PredictResponse> {
  return call<PredictResponse>(endpoint, '/api/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ features }),
  })
}

/**
 * Classify many records in one request.
 *
 * Only available on engines that advertise `predict_batch` — check with
 * `supportsBatch` before calling, and fall back to `predict` otherwise.
 */
export function predictBatch(
  endpoint: string,
  records: Record<string, number>[],
): Promise<BatchResponse> {
  return call<BatchResponse>(endpoint, '/api/predict/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records, include_type_probabilities: true }),
  })
}

/** Whether this engine offers bulk classification. */
export function supportsBatch(service: ServiceInfo | null): boolean {
  return Boolean(service?.endpoints?.predict_batch)
}

/**
 * Rebuild a full single-record response from a batch result.
 *
 * The batch endpoint hoists the fields that are identical for every record;
 * the UI wants them per verdict, so they are folded back in here rather than
 * making every component aware of two response shapes.
 */
export function expandBatchResult(
  batch: BatchResponse,
  result: BatchResult,
): PredictResponse {
  return {
    prediction: result.prediction,
    is_attack: result.is_attack,
    confidence: result.confidence,
    confidence_percent: result.confidence_percent,
    risk_level: result.risk_level,
    attack_type: result.attack_type,
    attack_type_prediction: result.attack_type_prediction,
    attack_type_confidence: result.attack_type_confidence,
    probabilities: result.probabilities,
    attack_type_probabilities: result.attack_type_probabilities ?? {},
    models: batch.models,
    thresholds: batch.thresholds,
    features: {
      binary: batch.features.binary,
      multiclass: batch.features.multiclass,
      // The batch envelope does not repeat per-record counts; every record
      // carried the full schema or the engine would have rejected the batch.
      provided: batch.features.binary,
    },
  }
}
