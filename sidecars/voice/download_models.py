from __future__ import annotations

import shutil
import urllib.request
from pathlib import Path

BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0"
FILES = {
    "en_US-lessac-medium.onnx": (
        f"{BASE}/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
    ),
    "en_US-lessac-medium.onnx.json": (
        f"{BASE}/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
    ),
    # Official Persian voice — auto-selected when STT/brain language is fa
    "fa_IR-ganji-medium.onnx": (
        f"{BASE}/fa/fa_IR/ganji/medium/fa_IR-ganji-medium.onnx"
    ),
    "fa_IR-ganji-medium.onnx.json": (
        f"{BASE}/fa/fa_IR/ganji/medium/fa_IR-ganji-medium.onnx.json"
    ),
}


def download(url: str, destination: Path) -> None:
    if destination.is_file():
        print(f"exists: {destination}")
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(f"{destination.suffix}.partial")
    print(f"download: {destination.name}")
    with urllib.request.urlopen(url) as response, temporary.open("wb") as output:
        shutil.copyfileobj(response, output)
    temporary.replace(destination)


def main() -> None:
    target = Path(__file__).resolve().parents[2] / "models" / "piper"
    for filename, url in FILES.items():
        download(url, target / filename)
    print(f"Piper voices ready in {target}")
    print("Persian default: fa_IR-ganji-medium.onnx")
    print("English default: en_US-lessac-medium.onnx")


if __name__ == "__main__":
    main()
