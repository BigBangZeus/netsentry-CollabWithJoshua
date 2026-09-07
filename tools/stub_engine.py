#!/usr/bin/env python3
"""
Stub NETSENTRY engine for frontend development.

Speaks the same four endpoints as the real service with the same response
shapes and the same thresholds, so the console can be built and demonstrated
without the trained .joblib models (which the engine repo does not ship).

Deliberately dependency-free: standard library only, so it runs with a bare
Python install and no virtualenv.

    python tools/stub_engine.py            # serves on 127.0.0.1:8086
    python tools/stub_engine.py --port 9000

Verdicts are derived deterministically from the flow's own features, so the
same row always produces the same answer and replays are reproducible.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BINARY_ATTACK_THRESHOLD = 0.55
UNKNOWN_TYPE_THRESHOLD = 0.30

ATTACK_CLASSES = [
    "DoS Hulk",
    "PortScan",
    "DDoS",
    "DoS GoldenEye",
    "FTP-Patator",
    "SSH-Patator",
    "DoS slowloris",
    "DoS Slowhttptest",
    "Bot",
    "Web Attack - Brute Force",
    "Web Attack - XSS",
    "Infiltration",
    "Web Attack - Sql Injection",
    "Heartbleed",
]

PRODUCTION_FEATURES = [
    "Destination Port", "Flow Duration", "Total Fwd Packets",
    "Total Backward Packets", "Total Length of Fwd Packets",
    "Total Length of Bwd Packets", "Fwd Packet Length Max",
    "Fwd Packet Length Min", "Fwd Packet Length Mean", "Fwd Packet Length Std",
    "Bwd Packet Length Max", "Bwd Packet Length Min", "Bwd Packet Length Mean",
    "Bwd Packet Length Std", "Flow Bytes/s", "Flow Packets/s", "Flow IAT Mean",
    "Flow IAT Std", "Flow IAT Max", "Flow IAT Min", "Fwd IAT Total",
    "Fwd IAT Mean", "Fwd IAT Std", "Fwd IAT Max", "Fwd IAT Min",
    "Bwd IAT Total", "Bwd IAT Mean", "Bwd IAT Std", "Bwd IAT Max",
    "Bwd IAT Min", "Fwd PSH Flags", "Fwd URG Flags", "Fwd Header Length",
    "Bwd Header Length", "Fwd Packets/s", "Bwd Packets/s", "Min Packet Length",
    "Max Packet Length", "Packet Length Mean", "Packet Length Std",
    "Packet Length Variance", "FIN Flag Count", "SYN Flag Count",
    "RST Flag Count", "PSH Flag Count", "ACK Flag Count", "URG Flag Count",
    "CWE Flag Count", "ECE Flag Count", "Down/Up Ratio", "Average Packet Size",
    "Avg Fwd Segment Size", "Avg Bwd Segment Size", "Fwd Header Length.1",
    "Subflow Fwd Packets", "Subflow Fwd Bytes", "Subflow Bwd Packets",
    "Subflow Bwd Bytes", "Init_Win_bytes_forward", "Init_Win_bytes_backward",
    "act_data_pkt_fwd", "min_seg_size_forward", "Active Mean", "Active Std",
    "Active Max", "Active Min", "Idle Mean", "Idle Std", "Idle Max",
    "Idle Min",
]


def risk_level(prediction: str, confidence: float) -> str:
    """Mirrors the real engine's thresholds exactly."""
    if prediction == "BENIGN":
        if confidence >= 0.90:
            return "LOW"
        if confidence >= 0.70:
            return "MEDIUM"
        return "HIGH"

    if confidence >= 0.90:
        return "CRITICAL"
    if confidence >= 0.75:
        return "HIGH"
    if confidence >= 0.50:
        return "MEDIUM"
    return "LOW"


def stable_unit(seed: str) -> float:
    """Deterministic float in [0,1) from a string."""
    digest = hashlib.sha256(seed.encode()).digest()
    return int.from_bytes(digest[:8], "big") / float(1 << 64)


def classify(features: dict) -> dict:
    """
    Produce a plausible, deterministic verdict.

    Ports and packet-rate are nudged to look like real signal so the decision
    axis shows structure rather than uniform noise.
    """
    port = features.get("Destination Port", 0.0)
    packets_per_second = features.get("Flow Packets/s", 0.0)
    syn = features.get("SYN Flag Count", 0.0)

    base = stable_unit(f"{port}:{features.get('Flow Duration', 0)}:{packets_per_second}")

    # Suspicious ports and high packet rates push probability up.
    lift = 0.0
    if port in (22.0, 23.0, 445.0, 3389.0, 21.0):
        lift += 0.32
    if packets_per_second > 5000:
        lift += 0.28
    if syn > 0:
        lift += 0.12

    attack_probability = min(0.999, max(0.001, base * 0.55 + lift))
    benign_probability = 1.0 - attack_probability

    is_attack = attack_probability >= BINARY_ATTACK_THRESHOLD
    prediction = "ATTACK" if is_attack else "BENIGN"
    confidence = attack_probability if is_attack else benign_probability

    attack_type = "BENIGN"
    attack_type_prediction = None
    attack_type_confidence = None
    attack_type_probabilities: dict = {}

    if is_attack:
        index = int(stable_unit(f"type:{port}:{packets_per_second}") * len(ATTACK_CLASSES))
        attack_type_prediction = ATTACK_CLASSES[index]
        attack_type_confidence = 0.25 + stable_unit(f"conf:{port}") * 0.74

        # Spread the remainder over the other classes so the bars look real.
        remainder = 1.0 - attack_type_confidence
        others = [c for c in ATTACK_CLASSES if c != attack_type_prediction]
        weights = [stable_unit(f"{attack_type_prediction}:{c}") for c in others]
        total = sum(weights) or 1.0

        attack_type_probabilities = {attack_type_prediction: round(attack_type_confidence, 6)}
        for name, weight in zip(others, weights):
            attack_type_probabilities[name] = round(remainder * weight / total, 6)

        attack_type = (
            attack_type_prediction
            if attack_type_confidence >= UNKNOWN_TYPE_THRESHOLD
            else "UNKNOWN_UNSEEN"
        )

    return {
        "prediction": prediction,
        "is_attack": is_attack,
        "confidence": round(confidence, 6),
        "confidence_percent": round(confidence * 100, 2),
        "risk_level": risk_level(prediction, confidence),
        "attack_type": attack_type,
        "attack_type_prediction": attack_type_prediction,
        "attack_type_confidence": (
            round(attack_type_confidence, 6) if attack_type_confidence is not None else None
        ),
        "probabilities": {
            "ATTACK": round(attack_probability, 6),
            "BENIGN": round(benign_probability, 6),
        },
        "attack_type_probabilities": attack_type_probabilities,
        "models": {
            "binary": "intrusion_detector_production.joblib",
            "multiclass": "intrusion_detector_multiclass_production.joblib",
        },
        "thresholds": {
            "binary_attack": BINARY_ATTACK_THRESHOLD,
            "unknown_attack_type": UNKNOWN_TYPE_THRESHOLD,
        },
        "features": {
            "binary": len(PRODUCTION_FEATURES),
            "multiclass": len(PRODUCTION_FEATURES),
            "provided": len(features),
        },
    }


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    # Unlike the real engine this stub sends CORS headers, so the browser
    # build works against it directly. Enabling CORS on the real service is a
    # one-line change (`CORS(app)`) and would give the same benefit.
    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):  # quieter console
        pass

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path == "/":
            self._json({
                "name": "NETSENTRY",
                "description": "Two-stage machine-learning network intrusion detection API.",
                "architecture": {
                    "stage_1": "Binary Random Forest",
                    "stage_2": "Multiclass Random Forest",
                },
                "binary_attack_threshold": BINARY_ATTACK_THRESHOLD,
                "unknown_type_threshold": UNKNOWN_TYPE_THRESHOLD,
                "binary_feature_count": len(PRODUCTION_FEATURES),
                "multiclass_feature_count": len(PRODUCTION_FEATURES),
                "attack_types": ATTACK_CLASSES,
                "endpoints": {
                    "health": "/health",
                    "model": "/api/model",
                    "predict": "POST /api/predict",
                },
            })
        elif self.path == "/health":
            self._json({
                "status": "healthy",
                "model_loaded": True,
                "binary_model_loaded": True,
                "multiclass_model_loaded": True,
                "binary_feature_count": len(PRODUCTION_FEATURES),
                "multiclass_feature_count": len(PRODUCTION_FEATURES),
                "binary_only_feature_count": 0,
                "class_count": 2,
                "attack_class_count": len(ATTACK_CLASSES) + 1,
                "binary_attack_threshold": BINARY_ATTACK_THRESHOLD,
                "unknown_type_threshold": UNKNOWN_TYPE_THRESHOLD,
            })
        elif self.path == "/api/model":
            self._json({
                "model": "Two-stage Random Forest",
                "binary_model": {
                    "file": "intrusion_detector_production.joblib",
                    "classes": ["ATTACK", "BENIGN"],
                    "feature_count": len(PRODUCTION_FEATURES),
                    "attack_threshold": BINARY_ATTACK_THRESHOLD,
                },
                "multiclass_model": {
                    "file": "intrusion_detector_multiclass_production.joblib",
                    "classes": ["BENIGN"] + ATTACK_CLASSES,
                    "feature_count": len(PRODUCTION_FEATURES),
                },
                "binary_only_features": [],
                "unknown_type_threshold": UNKNOWN_TYPE_THRESHOLD,
            })
        else:
            self._json({"error": "Not found."}, 404)

    def do_POST(self):
        if self.path != "/api/predict":
            self._json({"error": "Not found."}, 404)
            return

        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""

        try:
            payload = json.loads(raw)
        except (ValueError, TypeError):
            self._json({"error": "Request must contain JSON data."}, 400)
            return

        if not isinstance(payload, dict) or "features" not in payload:
            self._json({"error": "Missing 'features' object."}, 400)
            return

        features = payload["features"]
        if not isinstance(features, dict):
            self._json({"error": "'features' must be a JSON object."}, 400)
            return

        # Same validation contract as the real engine: all 70 or nothing.
        missing = [f for f in PRODUCTION_FEATURES if f not in features]
        if missing:
            self._json({"error": "Missing binary model features: " + ", ".join(missing)}, 400)
            return

        numeric = {}
        for name in PRODUCTION_FEATURES:
            try:
                value = float(features[name])
            except (TypeError, ValueError):
                value = 0.0
            numeric[name] = value if math.isfinite(value) else 0.0

        self._json(classify(numeric))


def main() -> None:
    parser = argparse.ArgumentParser(description="Stub NETSENTRY engine.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8086)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"stub NETSENTRY engine on http://{args.host}:{args.port}")
    print("endpoints: /  /health  /api/model  POST /api/predict")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
        server.server_close()


if __name__ == "__main__":
    main()
