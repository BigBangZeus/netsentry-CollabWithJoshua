#!/usr/bin/env python3
"""
Generate a CICIDS2017-shaped flow export for testing the console.

Produces every one of the 70 production feature columns plus a Label column,
with leading spaces on the header names exactly as the real CICIDS2017 CSVs
carry them — that quirk is worth exercising, because the loader has to strip
it before the engine will accept the record.

    python tools/make_sample_csv.py                  # 600 rows
    python tools/make_sample_csv.py --rows 20000 --out samples/big.csv
"""

from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path

from stub_engine import PRODUCTION_FEATURES

# Ports the stub (and a real IDS) treat as interesting.
SUSPICIOUS_PORTS = [22, 23, 21, 445, 3389]
NORMAL_PORTS = [80, 443, 53, 8080, 123, 993]

ATTACK_LABELS = [
    "DoS Hulk", "PortScan", "DDoS", "DoS GoldenEye",
    "FTP-Patator", "SSH-Patator", "Bot",
]


def make_row(rng: random.Random, attack: bool) -> dict:
    """One flow record. Values are plausible rather than physically exact."""
    duration = rng.randint(1, 120_000_000)
    fwd_packets = rng.randint(1, 400 if attack else 60)
    bwd_packets = rng.randint(0, 300 if attack else 50)
    fwd_bytes = fwd_packets * rng.randint(40, 1460)
    bwd_bytes = bwd_packets * rng.randint(40, 1460)

    seconds = max(duration / 1_000_000, 1e-6)
    packets_per_second = (fwd_packets + bwd_packets) / seconds
    if attack:
        packets_per_second *= rng.uniform(2.0, 40.0)

    row = {name: 0 for name in PRODUCTION_FEATURES}

    row["Destination Port"] = rng.choice(SUSPICIOUS_PORTS if attack else NORMAL_PORTS)
    row["Flow Duration"] = duration
    row["Total Fwd Packets"] = fwd_packets
    row["Total Backward Packets"] = bwd_packets
    row["Total Length of Fwd Packets"] = fwd_bytes
    row["Total Length of Bwd Packets"] = bwd_bytes
    row["Fwd Packet Length Max"] = rng.randint(40, 1460)
    row["Fwd Packet Length Min"] = rng.randint(0, 40)
    row["Fwd Packet Length Mean"] = round(fwd_bytes / max(fwd_packets, 1), 3)
    row["Fwd Packet Length Std"] = round(rng.uniform(0, 400), 3)
    row["Bwd Packet Length Max"] = rng.randint(40, 1460)
    row["Bwd Packet Length Min"] = rng.randint(0, 40)
    row["Bwd Packet Length Mean"] = round(bwd_bytes / max(bwd_packets, 1), 3)
    row["Bwd Packet Length Std"] = round(rng.uniform(0, 400), 3)
    row["Flow Bytes/s"] = round((fwd_bytes + bwd_bytes) / seconds, 3)
    row["Flow Packets/s"] = round(packets_per_second, 3)
    row["Flow IAT Mean"] = round(seconds / max(fwd_packets + bwd_packets, 1) * 1e6, 3)
    row["Flow IAT Max"] = rng.randint(1, duration)
    row["Flow IAT Min"] = rng.randint(0, 5000)
    row["Fwd IAT Total"] = duration
    row["Fwd Packets/s"] = round(fwd_packets / seconds, 3)
    row["Bwd Packets/s"] = round(bwd_packets / seconds, 3)
    row["Min Packet Length"] = rng.randint(0, 60)
    row["Max Packet Length"] = rng.randint(60, 1460)
    row["Packet Length Mean"] = round(rng.uniform(40, 900), 3)
    row["Packet Length Std"] = round(rng.uniform(0, 500), 3)
    row["Packet Length Variance"] = round(rng.uniform(0, 250_000), 3)
    row["SYN Flag Count"] = 1 if attack and rng.random() < 0.7 else 0
    row["ACK Flag Count"] = rng.randint(0, 1)
    row["PSH Flag Count"] = rng.randint(0, 1)
    row["Average Packet Size"] = round(rng.uniform(40, 900), 3)
    row["Avg Fwd Segment Size"] = round(rng.uniform(40, 900), 3)
    row["Avg Bwd Segment Size"] = round(rng.uniform(40, 900), 3)
    row["Fwd Header Length"] = fwd_packets * 20
    row["Fwd Header Length.1"] = fwd_packets * 20
    row["Bwd Header Length"] = bwd_packets * 20
    row["Subflow Fwd Packets"] = fwd_packets
    row["Subflow Fwd Bytes"] = fwd_bytes
    row["Subflow Bwd Packets"] = bwd_packets
    row["Subflow Bwd Bytes"] = bwd_bytes
    row["Init_Win_bytes_forward"] = rng.choice([-1, 8192, 29200, 65535])
    row["Init_Win_bytes_backward"] = rng.choice([-1, 229, 235, 65535])
    row["act_data_pkt_fwd"] = max(fwd_packets - 1, 0)
    row["min_seg_size_forward"] = rng.choice([20, 32])
    row["Down/Up Ratio"] = round(bwd_packets / max(fwd_packets, 1), 2)

    return row


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a sample flow export.")
    parser.add_argument("--rows", type=int, default=600)
    parser.add_argument("--attack-ratio", type=float, default=0.28)
    parser.add_argument("--out", default="samples/sample_flows.csv")
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    # Real CICIDS2017 exports carry a leading space on nearly every column.
    header = [f" {name}" for name in PRODUCTION_FEATURES] + [" Label"]

    with out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)

        for _ in range(args.rows):
            attack = rng.random() < args.attack_ratio
            row = make_row(rng, attack)
            label = rng.choice(ATTACK_LABELS) if attack else "BENIGN"
            writer.writerow([row[name] for name in PRODUCTION_FEATURES] + [label])

    print(f"wrote {args.rows} rows to {out}")


if __name__ == "__main__":
    main()
