#!/usr/bin/env python3
"""Freeze the field-style evaluation IDs and exact research environment."""

from __future__ import annotations

import hashlib
import json
import platform
import subprocess
from collections import Counter
from importlib.metadata import version

import torch

from ml_common import REPORTS, ROOT, load_manifest, sha256_file


def main() -> None:
    test_rows = load_manifest("test")
    ids_sha256 = hashlib.sha256(
        "\n".join(row["id"] for row in test_rows).encode("utf-8")
    ).hexdigest()
    summary = json.loads((ROOT / "manifest_summary_v1.json").read_text(encoding="utf-8"))
    config_files = sorted((ROOT / "config").glob("*.json"))
    try:
        git_commit = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip()
    except Exception:
        git_commit = "unavailable"
    environment = {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "torch": torch.__version__,
        "torchvision": version("torchvision"),
        "timm": version("timm"),
        "numpy": version("numpy"),
        "scikit_learn": version("scikit-learn"),
        "onnx": version("onnx"),
        "onnxruntime": version("onnxruntime"),
        "cuda_available": torch.cuda.is_available(),
        "cuda_version": torch.version.cuda,
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "requirements_sha256": sha256_file(ROOT / "requirements.txt"),
    }
    freeze = {
        "version": "frozen-evaluation-v1",
        "seed": 26007,
        "git_commit_at_freeze": git_commit,
        "manifest_sha256": summary["manifest_sha256"],
        "test_ids_sha256": ids_sha256,
        "test_rows": len(test_rows),
        "test_ids": [row["id"] for row in test_rows],
        "counts_by_class": dict(sorted(Counter(row["model_class"] for row in test_rows).items())),
        "counts_by_source": dict(sorted(Counter(row["source_dataset"] for row in test_rows).items())),
        "config_sha256": {path.name: sha256_file(path) for path in config_files},
        "environment": environment,
        "thresholds_frozen_before_candidate_training": True,
        "test_is_immutable": True,
        "is_production_validated": False,
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "frozen_evaluation_v1.json").write_text(
        json.dumps(freeze, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({key: value for key, value in freeze.items() if key != "test_ids"}, indent=2))


if __name__ == "__main__":
    main()

