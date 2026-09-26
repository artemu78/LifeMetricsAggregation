from __future__ import annotations

import csv
import json
from hashlib import sha256
from pathlib import Path

from .config import Config
from .db import connect, insert_metric, utc_now
from .import_support import as_utc_iso, file_hash

UNITS = {
    "Stress(HRV)": "%",
    "Energy(HRV)": "%",
    "Focus": "%",
    "Measurement HR": "bpm",
    "Mean RR": "ms",
    "SDNN": "ms",
    "rMSSD": "ms",
    "MxDMn": "ms",
    "pNN50": "%",
    "AMo50": "%",
    "Mode": "ms",
    "Total power": "ms2",
    "HF": "ms2",
    "LF": "ms2",
    "VLF": "ms2",
}


def _number(value: str) -> float | None:
    """Parse a number with an optional percent sign."""
    cleaned = value.strip().replace("%", "")
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _import_welltory_row(conn, row: dict, timezone_name: str) -> tuple[int, int]:
    timestamp = row.get("Date") or row.get("Time")
    if not timestamp:
        return 0, 0
    occurred_at = as_utc_iso(timestamp, timezone_name)
    row_id = sha256(json.dumps(row, sort_keys=True).encode("utf-8")).hexdigest()
    metrics = 0
    for name, raw_value in row.items():
        if name in {"Date", "Time"} or raw_value is None or not raw_value.strip():
            continue
        numeric = _number(raw_value)
        metrics += insert_metric(
            conn,
            source="welltory",
            external_id=row_id,
            occurred_at=occurred_at,
            metric=f"welltory.{name}",
            value_num=numeric,
            value_text=None if numeric is not None else raw_value.strip(),
            unit=UNITS.get(name),
            payload=row,
        )
    return 1, metrics


def _import_welltory_csv(conn, path: Path, timezone_name: str) -> tuple[int, int]:
    rows = metrics = 0
    with path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            imported_rows, imported_metrics = _import_welltory_row(
                conn, row, timezone_name
            )
            rows += imported_rows
            metrics += imported_metrics
    return rows, metrics


def import_welltory(config: Config, paths: list[Path] | None = None) -> dict[str, int]:
    """Import changed Welltory CSV files and return file, row, and new metric counts."""
    if paths is None:
        paths = sorted(config.welltory_downloads.glob(config.welltory_pattern))
    files = rows = metrics = 0
    with connect(config.database) as conn:
        for path in paths:
            path = path.resolve()
            digest = file_hash(path)
            previous = conn.execute(
                "SELECT sha256 FROM import_files WHERE path = ?", (str(path),)
            ).fetchone()
            if previous and previous["sha256"] == digest:
                continue
            imported_rows, imported_metrics = _import_welltory_csv(
                conn, path, config.timezone
            )
            rows += imported_rows
            metrics += imported_metrics
            conn.execute(
                """
                INSERT INTO import_files(path, sha256, source, imported_at)
                VALUES (?, ?, 'welltory', ?)
                ON CONFLICT(path) DO UPDATE SET sha256=excluded.sha256,
                    imported_at=excluded.imported_at
                """,
                (str(path), digest, utc_now()),
            )
            files += 1
    return {"files": files, "rows": rows, "metrics": metrics}
