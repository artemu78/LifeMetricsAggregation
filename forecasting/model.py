"""Local CPU Timestral adapter; downloads are explicit, inference is offline.

The network guard covers Python socket connections, not subprocesses or native
network stacks. Run in an OS network sandbox for a stronger isolation boundary.
"""
from __future__ import annotations

from contextlib import ExitStack, contextmanager
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import resource
import socket
import time
from unittest.mock import patch

import numpy as np


@contextmanager
def deny_network():
    """Deny Python socket connections and disable Hugging Face online access."""
    def denied(*args, **kwargs):
        raise RuntimeError("Network access denied during local forecasting")

    with ExitStack() as stack:
        stack.enter_context(patch.dict(os.environ, {
            "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1",
            "HF_HUB_DISABLE_TELEMETRY": "1", "DO_NOT_TRACK": "1",
        }))
        for target in ("socket.socket.connect", "socket.socket.connect_ex",
                       "socket.create_connection"):
            stack.enter_context(patch(target, denied))
        yield


def download_model(destination: str | Path) -> str:
    """Explicitly fetch only the pinned checkpoint files; no personal inputs."""
    config = json.loads(Path(__file__).with_name("config.json").read_text())
    model = config["model"]
    revision = model["revision"]
    if len(revision) != 40 or any(c not in "0123456789abcdef" for c in revision):
        raise ValueError("Model revision must be a full immutable commit SHA")
    from huggingface_hub import snapshot_download
    return snapshot_download(
        repo_id=model["repo_id"], revision=revision, local_dir=str(destination),
        allow_patterns=["config.json", "model.safetensors"],
    )


def _rows(value, length, name):
    if value is None:
        return None
    rows = np.asarray(value, dtype=np.float32)
    if rows.ndim != 2 or rows.shape[1] != length:
        raise ValueError(f"{name} must have shape (rows, {length})")
    if np.isinf(rows).any():
        raise ValueError(f"{name} must contain finite values or NaN")
    return rows[None] if rows.shape[0] else None


class LocalTimestral:
    """One-day horizon: input (variates, days), output one value per variate."""
    def __init__(self, model_dir: str | Path, threads: int = 4):
        self.model_dir = Path(model_dir).resolve()
        if not all((self.model_dir / name).is_file()
                   for name in ("config.json", "model.safetensors")):
            raise FileNotFoundError("Local checkpoint missing; run explicit download first")
        if threads < 1:
            raise ValueError("threads must be positive")
        with deny_network():
            import torch
            from timestral import TimestralForecaster
            torch.set_num_threads(threads)
            self.forecaster = TimestralForecaster.from_pretrained(
                str(self.model_dir), device="cpu", local_files_only=True,
                per_shot_horizon_patches=1,
            )

    def __call__(self, context, past_covariates=None, known_covariates=None):
        context = np.asarray(context, dtype=np.float32)
        if context.ndim != 2 or min(context.shape) < 1:
            raise ValueError("context must have nonempty shape (variates, days)")
        if np.isinf(context).any():
            raise ValueError("context must contain finite values or NaN")
        if not np.isfinite(context).any(axis=1).all():
            raise ValueError("insufficient_data: every target needs observed history")
        days = context.shape[1]
        past = _rows(past_covariates, days, "past_covariates")
        known = _rows(known_covariates, days + 1, "known_covariates")
        with deny_network():
            forecast = self.forecaster.forecast(
                context[None], prediction_length=1,
                past_covariates=past, known_covariates=known,
            )
        quantiles = forecast.quantiles.detach().cpu().numpy()
        levels = list(forecast.quantile_levels)
        expected = (1, context.shape[0], 1, len(levels))
        if quantiles.shape != expected or not np.isfinite(quantiles).all():
            raise ValueError("Invalid Timestral forecast shape or nonfinite values")
        if 0.5 not in levels:
            raise ValueError("Timestral did not return a median quantile")
        return {"median": quantiles[0, :, 0, levels.index(0.5)],
                "quantiles": quantiles[0, :, 0, :], "levels": levels}


def smoke_test(model_dir: str | Path, threads: int = 4) -> dict:
    """Exercise univariate, joint targets, missing data and both covariate roles."""
    started = time.perf_counter()
    t = np.arange(32, dtype=np.float32)
    context = np.stack([3 + np.sin(t / 5), 50 + 10 * np.cos(t / 7)])
    context[0, 10:12] = np.nan
    with deny_network():
        model = LocalTimestral(model_dir, threads=threads)
        results = {
            "univariate": model(context[:1]),
            "multivariate": model(context),
            "covariates": model(context, past_covariates=np.cos(t)[None],
                                known_covariates=np.arange(33, dtype=np.float32)[None] % 7),
        }
    versions = {}
    for package in ("timestral", "torch", "numpy", "huggingface-hub"):
        try:
            versions[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            versions[package] = "unknown"
    peak_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return {
        "elapsed_seconds": time.perf_counter() - started,
        "peak_process_rss_bytes": peak_rss if platform.system() == "Darwin" else peak_rss * 1024,
        "hardware": {"system": platform.system(), "machine": platform.machine(),
                     "cpu_count": os.cpu_count(), "threads": threads, "device": "cpu"},
        "versions": versions,
        "checkpoint_bytes": sum(p.stat().st_size for p in Path(model_dir).glob("*") if p.is_file()),
        "python_socket_network_denied": True,
        "results": {name: {key: value.tolist() if isinstance(value, np.ndarray) else value
                           for key, value in result.items()} for name, result in results.items()},
    }
