from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from zoneinfo import ZoneInfo
import csv
import gzip
import json
import re

from .config import Config
from .db import connect, insert_metric, utc_now


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


def _file_hash(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _as_utc_iso(value: str, timezone_name: str) -> str:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=ZoneInfo(timezone_name))
    return parsed.astimezone(timezone.utc).isoformat()


def _number(value: str) -> float | None:
    cleaned = value.strip().replace("%", "")
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def import_welltory(config: Config, paths: list[Path] | None = None) -> dict[str, int]:
    if paths is None:
        paths = sorted(config.welltory_downloads.glob(config.welltory_pattern))
    files = rows = metrics = 0
    with connect(config.database) as conn:
        for path in paths:
            path = path.resolve()
            digest = _file_hash(path)
            previous = conn.execute(
                "SELECT sha256 FROM import_files WHERE path = ?", (str(path),)
            ).fetchone()
            if previous and previous["sha256"] == digest:
                continue
            with path.open(newline="", encoding="utf-8-sig") as handle:
                reader = csv.DictReader(handle)
                for row in reader:
                    timestamp = row.get("Date") or row.get("Time")
                    if not timestamp:
                        continue
                    occurred_at = _as_utc_iso(timestamp, config.timezone)
                    row_id = sha256(
                        json.dumps(row, sort_keys=True).encode("utf-8")
                    ).hexdigest()
                    rows += 1
                    for name, raw_value in row.items():
                        if name in {"Date", "Time"} or raw_value is None or not raw_value.strip():
                            continue
                        numeric = _number(raw_value)
                        if insert_metric(
                            conn,
                            source="welltory",
                            external_id=row_id,
                            occurred_at=occurred_at,
                            metric=f"welltory.{name}",
                            value_num=numeric,
                            value_text=None if numeric is not None else raw_value.strip(),
                            unit=UNITS.get(name),
                            payload=row,
                        ):
                            metrics += 1
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


SLEEP_STAGES = {
    1: "awake",
    2: "sleeping",
    3: "out_of_bed",
    4: "light",
    5: "deep",
    6: "rem",
}


def _fitness_documents(path: Path) -> list[dict]:
    opener = gzip.open if path.name.endswith(".gz") else open
    with opener(path, "rt", encoding="utf-8-sig") as handle:
        content = handle.read()
    try:
        document = json.loads(content)
    except json.JSONDecodeError:
        rows = [json.loads(line) for line in content.splitlines() if line.strip()]
        headers = [row for row in rows if row.get("recordType") == "header"]
        if not headers:
            raise ValueError(f"Fitness export has no schema header: {path}")
        return [{"header": headers[0], "records": [row for row in rows if row.get("recordType") != "header"]}]
    if not isinstance(document, dict):
        raise ValueError(f"Fitness export must be a JSON object: {path}")
    return [document]


def _duration_seconds(start: str, end: str) -> float:
    start_time = datetime.fromisoformat(start.replace("Z", "+00:00"))
    end_time = datetime.fromisoformat(end.replace("Z", "+00:00"))
    return (end_time - start_time).total_seconds()


def _fitness_metrics(record: dict) -> list[tuple[str, str, float, str]]:
    record_type = record.get("recordType")
    start = record.get("startTime")
    if not start:
        return []
    if record_type == "steps":
        return [(start, "fitness_drive.steps", float(record["count"]), "count")]
    if record_type == "heart_rate":
        return [
            (sample["time"], "fitness_drive.heart_rate", float(sample["beatsPerMinute"]), "bpm")
            for sample in record.get("samples", [])
        ]
    if record_type == "distance":
        return [(start, "fitness_drive.distance", float(record["distanceMeters"]), "m")]
    if record_type == "total_calories_burned":
        return [(start, "fitness_drive.total_calories", float(record["energyKilocalories"]), "kcal")]
    if record_type == "sleep_session":
        metrics = []
        for stage in record.get("stages", []):
            label = SLEEP_STAGES.get(stage.get("stage"), f"stage_{stage.get('stage', 'unknown')}")
            metrics.append(
                (
                    stage["startTime"],
                    f"fitness_drive.sleep.{label}_seconds",
                    _duration_seconds(stage["startTime"], stage["endTime"]),
                    "s",
                )
            )
        return metrics
    if record_type == "exercise_session":
        return [(start, "fitness_drive.exercise", _duration_seconds(start, record["endTime"]), "s")]
    if record_type == "resting_heart_rate":
        return [(start, "fitness_drive.resting_heart_rate", float(record["beatsPerMinute"]), "bpm")]
    if record_type == "oxygen_saturation":
        return [(start, "fitness_drive.oxygen_saturation", float(record["percentage"]), "%")]
    return []


def import_fitness_drive(config: Config) -> dict[str, int]:
    """Import cached Reva Health Exporter schema-v1 JSON from Google Drive."""
    if not config.fitness_drive_cache:
        return {"files": 0, "records": 0, "metrics": 0, "skipped_not_configured": 1}
    paths = sorted(
        path
        for path in config.fitness_drive_cache.iterdir()
        if path.is_file() and not path.name.startswith(".")
    )
    files = records = metrics = 0
    with connect(config.database) as conn:
        for path in paths:
            digest = _file_hash(path)
            previous = conn.execute(
                "SELECT sha256 FROM import_files WHERE path = ?", (str(path.resolve()),)
            ).fetchone()
            if previous and previous["sha256"] == digest:
                continue
            for document in _fitness_documents(path):
                header = document.get("header", {})
                if header.get("schemaVersion") != 1:
                    raise ValueError(f"Unsupported fitness schema in {path}: {header.get('schemaVersion')}")
                document_records = document.get("records", [])
                if header.get("recordCount") != len(document_records):
                    raise ValueError(f"Fitness record count mismatch: {path}")
                for record in document_records:
                    records += 1
                    record_key = sha256(
                        json.dumps(record, sort_keys=True).encode("utf-8")
                    ).hexdigest()
                    for index, (occurred_at, metric, value, unit) in enumerate(
                        _fitness_metrics(record)
                    ):
                        if insert_metric(
                            conn,
                            source="fitness_drive",
                            external_id=f"{record_key}:{index}",
                            occurred_at=_as_utc_iso(occurred_at, config.timezone),
                            metric=metric,
                            value_num=value,
                            value_text=None,
                            unit=unit,
                            payload=record,
                        ):
                            metrics += 1
            conn.execute(
                """
                INSERT INTO import_files(path, sha256, source, imported_at)
                VALUES (?, ?, 'fitness_drive', ?)
                ON CONFLICT(path) DO UPDATE SET sha256=excluded.sha256,
                    source=excluded.source, imported_at=excluded.imported_at
                """,
                (str(path.resolve()), digest, utc_now()),
            )
            files += 1
    return {"files": files, "records": records, "metrics": metrics}


def import_inbox(config: Config) -> dict[str, int]:
    diary_entries = 0
    with connect(config.database) as conn:
        diary_paths = [] if config.diary_google_doc_id else sorted((config.inbox / "diary").glob("*.md"))
        for path in diary_paths:
            match = re.fullmatch(r"(\d{4}-\d{2}-\d{2})", path.stem)
            if not match:
                continue
            conn.execute(
                """
                INSERT INTO journal_entries(logical_date, content, source_path, imported_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(logical_date) DO UPDATE SET content=excluded.content,
                    source_path=excluded.source_path, imported_at=excluded.imported_at
                """,
                (match.group(1), path.read_text(encoding="utf-8"), str(path), utc_now()),
            )
            diary_entries += 1
    return {"diary_entries": diary_entries}
