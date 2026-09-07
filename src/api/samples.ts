import { PRODUCTION_FEATURES } from './features'

/**
 * Bundled flow records for inspecting the engine without loading a CSV.
 *
 * These are described by their traffic characteristics, not by the verdict
 * they should produce. What the engine makes of them is the engine's business
 * — a sample labelled "expected: ATTACK" would be a lie the moment the model
 * is retrained or a threshold moves.
 *
 * Values are shaped after CICIDS2017 flows: plausible rather than captured.
 */

export interface SampleFlow {
  id: string
  name: string
  /** What the traffic looks like, in an operator's terms. */
  description: string
  features: Record<string, number>
}

/** Zero-fills the full 70-feature schema, then applies the interesting ones. */
function flow(overrides: Record<string, number>): Record<string, number> {
  const features: Record<string, number> = {}
  for (const name of PRODUCTION_FEATURES) features[name] = 0

  for (const [name, value] of Object.entries(overrides)) {
    features[name] = value
  }

  return features
}

export const SAMPLE_FLOWS: SampleFlow[] = [
  {
    id: 'https-session',
    name: 'HTTPS session',
    description: 'Long-lived TLS flow, balanced both directions, ordinary packet sizes.',
    features: flow({
      'Destination Port': 443,
      'Flow Duration': 4_812_665,
      'Total Fwd Packets': 14,
      'Total Backward Packets': 16,
      'Total Length of Fwd Packets': 2184,
      'Total Length of Bwd Packets': 12_460,
      'Fwd Packet Length Max': 517,
      'Fwd Packet Length Min': 0,
      'Fwd Packet Length Mean': 156,
      'Fwd Packet Length Std': 187.4,
      'Bwd Packet Length Max': 1460,
      'Bwd Packet Length Min': 0,
      'Bwd Packet Length Mean': 778.75,
      'Bwd Packet Length Std': 664.2,
      'Flow Bytes/s': 3041.3,
      'Flow Packets/s': 6.23,
      'Flow IAT Mean': 165_953,
      'Flow IAT Max': 1_004_221,
      'Flow IAT Min': 12,
      'Fwd IAT Total': 4_812_100,
      'Fwd Packets/s': 2.91,
      'Bwd Packets/s': 3.32,
      'Min Packet Length': 0,
      'Max Packet Length': 1460,
      'Packet Length Mean': 472.9,
      'Packet Length Std': 596.1,
      'Packet Length Variance': 355_335,
      'ACK Flag Count': 1,
      'PSH Flag Count': 1,
      'Average Packet Size': 488.8,
      'Avg Fwd Segment Size': 156,
      'Avg Bwd Segment Size': 778.75,
      'Fwd Header Length': 296,
      'Fwd Header Length.1': 296,
      'Bwd Header Length': 328,
      'Subflow Fwd Packets': 14,
      'Subflow Fwd Bytes': 2184,
      'Subflow Bwd Packets': 16,
      'Subflow Bwd Bytes': 12_460,
      Init_Win_bytes_forward: 29_200,
      Init_Win_bytes_backward: 26_883,
      act_data_pkt_fwd: 8,
      min_seg_size_forward: 20,
      'Down/Up Ratio': 1,
    }),
  },
  {
    id: 'dns-lookup',
    name: 'DNS lookup',
    description: 'Single tiny request and reply on port 53, sub-millisecond.',
    features: flow({
      'Destination Port': 53,
      'Flow Duration': 812,
      'Total Fwd Packets': 1,
      'Total Backward Packets': 1,
      'Total Length of Fwd Packets': 43,
      'Total Length of Bwd Packets': 91,
      'Fwd Packet Length Max': 43,
      'Fwd Packet Length Min': 43,
      'Fwd Packet Length Mean': 43,
      'Bwd Packet Length Max': 91,
      'Bwd Packet Length Min': 91,
      'Bwd Packet Length Mean': 91,
      'Flow Bytes/s': 165_024,
      'Flow Packets/s': 2463.05,
      'Flow IAT Mean': 812,
      'Flow IAT Max': 812,
      'Flow IAT Min': 812,
      'Fwd Packets/s': 1231.5,
      'Bwd Packets/s': 1231.5,
      'Min Packet Length': 43,
      'Max Packet Length': 91,
      'Packet Length Mean': 67,
      'Packet Length Std': 33.9,
      'Packet Length Variance': 1152,
      'Average Packet Size': 100.5,
      'Avg Fwd Segment Size': 43,
      'Avg Bwd Segment Size': 91,
      'Fwd Header Length': 8,
      'Fwd Header Length.1': 8,
      'Bwd Header Length': 8,
      'Subflow Fwd Packets': 1,
      'Subflow Fwd Bytes': 43,
      'Subflow Bwd Packets': 1,
      'Subflow Bwd Bytes': 91,
      Init_Win_bytes_forward: -1,
      Init_Win_bytes_backward: -1,
      min_seg_size_forward: 8,
      'Down/Up Ratio': 1,
    }),
  },
  {
    id: 'ssh-repeated-auth',
    name: 'Repeated SSH auth',
    description: 'Short bursts to port 22, high rate, SYN-heavy — brute-force shaped.',
    features: flow({
      'Destination Port': 22,
      'Flow Duration': 41_233,
      'Total Fwd Packets': 22,
      'Total Backward Packets': 18,
      'Total Length of Fwd Packets': 2904,
      'Total Length of Bwd Packets': 2376,
      'Fwd Packet Length Max': 336,
      'Fwd Packet Length Min': 0,
      'Fwd Packet Length Mean': 132,
      'Fwd Packet Length Std': 118.6,
      'Bwd Packet Length Max': 296,
      'Bwd Packet Length Min': 0,
      'Bwd Packet Length Mean': 132,
      'Bwd Packet Length Std': 104.2,
      'Flow Bytes/s': 128_060,
      'Flow Packets/s': 970.1,
      'Flow IAT Mean': 1057,
      'Flow IAT Max': 8221,
      'Flow IAT Min': 4,
      'Fwd IAT Total': 41_100,
      'Fwd Packets/s': 533.6,
      'Bwd Packets/s': 436.5,
      'Min Packet Length': 0,
      'Max Packet Length': 336,
      'Packet Length Mean': 132,
      'Packet Length Std': 111.3,
      'Packet Length Variance': 12_387,
      'SYN Flag Count': 1,
      'ACK Flag Count': 1,
      'PSH Flag Count': 1,
      'Average Packet Size': 135.4,
      'Avg Fwd Segment Size': 132,
      'Avg Bwd Segment Size': 132,
      'Fwd Header Length': 464,
      'Fwd Header Length.1': 464,
      'Bwd Header Length': 376,
      'Subflow Fwd Packets': 22,
      'Subflow Fwd Bytes': 2904,
      'Subflow Bwd Packets': 18,
      'Subflow Bwd Bytes': 2376,
      Init_Win_bytes_forward: 8192,
      Init_Win_bytes_backward: 229,
      act_data_pkt_fwd: 21,
      min_seg_size_forward: 20,
      'Down/Up Ratio': 0.82,
    }),
  },
  {
    id: 'scan-probe',
    name: 'Single-packet probe',
    description: 'One SYN, no reply, near-zero duration — the shape of a port sweep.',
    features: flow({
      'Destination Port': 445,
      'Flow Duration': 3,
      'Total Fwd Packets': 1,
      'Total Backward Packets': 0,
      'Total Length of Fwd Packets': 0,
      'Fwd Packet Length Max': 0,
      'Fwd Packet Length Min': 0,
      'Fwd Packet Length Mean': 0,
      'Flow Bytes/s': 0,
      'Flow Packets/s': 333_333.33,
      'Flow IAT Mean': 3,
      'Flow IAT Max': 3,
      'Flow IAT Min': 3,
      'Fwd Packets/s': 333_333.33,
      'Min Packet Length': 0,
      'Max Packet Length': 0,
      'SYN Flag Count': 1,
      'Average Packet Size': 0,
      'Fwd Header Length': 20,
      'Fwd Header Length.1': 20,
      'Subflow Fwd Packets': 1,
      Init_Win_bytes_forward: 1024,
      Init_Win_bytes_backward: -1,
      min_seg_size_forward: 20,
      'Down/Up Ratio': 0,
    }),
  },
]
