#!/usr/bin/env python3
"""Download YOLO26n (+ optional YOLO26s / SAM2 tiny) weights via Ultralytics."""

from __future__ import annotations

import argparse
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Download Aria vision model weights")
    parser.add_argument(
        "--models",
        nargs="+",
        default=["yolo26n.pt"],
        help="Ultralytics weight names (default: yolo26n.pt)",
    )
    parser.add_argument(
        "--include-sam",
        action="store_true",
        help="Also download SAM2 tiny (sam2_t.pt)",
    )
    parser.add_argument(
        "--include-yolo26s",
        action="store_true",
        help="Also download YOLO26s",
    )
    args = parser.parse_args()

    models = list(args.models)
    if args.include_yolo26s:
        models.append("yolo26s.pt")
    if args.include_sam:
        models.append("sam2_t.pt")

    from ultralytics import YOLO, SAM

    out = Path("models")
    out.mkdir(exist_ok=True)

    for name in models:
        print(f"Downloading {name} …")
        if name.startswith("sam"):
            SAM(name)
        else:
            YOLO(name)
        print(f"  ready: {name}")

    print("Done. Ultralytics caches weights under the user Ultralytics directory.")
    print("VLM (Qwen2.5-VL) downloads on first /v1/describe call via transformers.")


if __name__ == "__main__":
    main()
