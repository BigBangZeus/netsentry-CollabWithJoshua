/**
 * The 70-feature production schema, in the exact order the engine documents.
 *
 * `POST /api/predict` rejects the request outright if any one of these is
 * absent, so the CSV loader validates against this list before a single row
 * is sent rather than discovering the problem 10,000 requests in.
 *
 * CICIDS2017 exports carry leading spaces on most column names (" Flow
 * Duration"). The engine strips whitespace from both sides of the comparison,
 * and so does `canonical()` here — match on the trimmed form everywhere.
 */

export const PRODUCTION_FEATURES: readonly string[] = [
  'Destination Port',
  'Flow Duration',
  'Total Fwd Packets',
  'Total Backward Packets',
  'Total Length of Fwd Packets',
  'Total Length of Bwd Packets',
  'Fwd Packet Length Max',
  'Fwd Packet Length Min',
  'Fwd Packet Length Mean',
  'Fwd Packet Length Std',
  'Bwd Packet Length Max',
  'Bwd Packet Length Min',
  'Bwd Packet Length Mean',
  'Bwd Packet Length Std',
  'Flow Bytes/s',
  'Flow Packets/s',
  'Flow IAT Mean',
  'Flow IAT Std',
  'Flow IAT Max',
  'Flow IAT Min',
  'Fwd IAT Total',
  'Fwd IAT Mean',
  'Fwd IAT Std',
  'Fwd IAT Max',
  'Fwd IAT Min',
  'Bwd IAT Total',
  'Bwd IAT Mean',
  'Bwd IAT Std',
  'Bwd IAT Max',
  'Bwd IAT Min',
  'Fwd PSH Flags',
  'Fwd URG Flags',
  'Fwd Header Length',
  'Bwd Header Length',
  'Fwd Packets/s',
  'Bwd Packets/s',
  'Min Packet Length',
  'Max Packet Length',
  'Packet Length Mean',
  'Packet Length Std',
  'Packet Length Variance',
  'FIN Flag Count',
  'SYN Flag Count',
  'RST Flag Count',
  'PSH Flag Count',
  'ACK Flag Count',
  'URG Flag Count',
  'CWE Flag Count',
  'ECE Flag Count',
  'Down/Up Ratio',
  'Average Packet Size',
  'Avg Fwd Segment Size',
  'Avg Bwd Segment Size',
  'Fwd Header Length.1',
  'Subflow Fwd Packets',
  'Subflow Fwd Bytes',
  'Subflow Bwd Packets',
  'Subflow Bwd Bytes',
  'Init_Win_bytes_forward',
  'Init_Win_bytes_backward',
  'act_data_pkt_fwd',
  'min_seg_size_forward',
  'Active Mean',
  'Active Std',
  'Active Max',
  'Active Min',
  'Idle Mean',
  'Idle Std',
  'Idle Max',
  'Idle Min',
]

export const FEATURE_COUNT = PRODUCTION_FEATURES.length

/** Column names a CICIDS2017 export carries that are not model features. */
export const LABEL_COLUMNS = ['Label', 'label', 'Attack', 'Class']

/** Trimmed, case-preserved key used for all schema comparisons. */
export function canonical(name: string): string {
  return name.trim()
}

const CANONICAL_SET = new Set(PRODUCTION_FEATURES.map(canonical))

export function isProductionFeature(name: string): boolean {
  return CANONICAL_SET.has(canonical(name))
}

/**
 * Which required features a set of column names fails to cover.
 * Returned in schema order so the UI can show the first few meaningfully.
 */
export function missingFeatures(columns: string[]): string[] {
  const present = new Set(columns.map(canonical))
  return PRODUCTION_FEATURES.filter((feature) => !present.has(feature))
}
