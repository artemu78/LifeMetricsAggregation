from __future__ import annotations

import gzip
import json
from datetime import datetime, timedelta
from hashlib import sha256
from pathlib import Path
from zoneinfo import ZoneInfo

from .config import Config
from .db import connect, insert_metric, utc_now
from .import_support import as_utc_iso, file_hash

EMA_DETAILS_BACKFILL_VERSION = 1


def _ema_rating(value: object) -> int | None:
    """Keep only valid EMA ratings; malformed optional answers remain unavailable."""
    return value if type(value) is int and 1 <= value <= 5 else None


SLEEP_STAGES = {
    1: "awake",
    2: "sleeping",
    3: "out_of_bed",
    4: "light",
    5: "deep",
    6: "rem",
}


def _fitness_documents(path: Path) -> list[dict]:
    """Read plain or gzipped JSON or NDJSON exports into header-and-record documents."""
    opener = gzip.open if path.name.endswith(".gz") else open
    with opener(path, "rt", encoding="utf-8-sig") as handle:
        content = handle.read()
    try:
        document = json.loads(content)
    except json.JSONDecodeError:
        rows = [json.loads(line) for line in content.splitlines() if line.strip()]
        headers = [row for row in rows if row.get("recordType") == "header"]
        if not headers:
            raise ValueError(f"Fitness export has no schema header: {path}") from None
        return [
            {
                "header": headers[0],
                "records": [row for row in rows if row.get("recordType") != "header"],
            }
        ]
    if not isinstance(document, dict):
        raise ValueError(f"Fitness export must be a JSON object: {path}")
    return [document]


def _fitness_batch(document: dict) -> tuple[dict, list[dict], list[dict]]:
    """Return the health records and EMA events from legacy or combined exports."""
    batch = document.get("healthConnectBatch", document)
    if not isinstance(batch, dict):
        raise ValueError("Fitness export healthConnectBatch must be an object")
    records = batch.get("records", [])
    ema_events = document.get("emaEvents", [])
    if not isinstance(records, list) or not isinstance(ema_events, list):
        raise ValueError("Fitness export records and emaEvents must be arrays")
    return batch, records, ema_events


def _duration_seconds(start: str, end: str) -> float:
    """Return the signed elapsed seconds between two ISO timestamps."""
    start_time = datetime.fromisoformat(start.replace("Z", "+00:00"))
    end_time = datetime.fromisoformat(end.replace("Z", "+00:00"))
    return (end_time - start_time).total_seconds()


def _fitness_metrics(record: dict) -> list[tuple[str, str, float, str]]:
    """Convert a supported fitness record into metric tuples."""
    record_type = record.get("recordType")
    start = record.get("startTime")
    if not start:
        return []
    if record_type == "steps":
        return [(start, "fitness_drive.steps", float(record["count"]), "count")]
    if record_type == "heart_rate":
        return [
            (
                sample["time"],
                "fitness_drive.heart_rate",
                float(sample["beatsPerMinute"]),
                "bpm",
            )
            for sample in record.get("samples", [])
        ]
    if record_type == "distance":
        return [(start, "fitness_drive.distance", float(record["distanceMeters"]), "m")]
    if record_type == "total_calories_burned":
        return [
            (
                start,
                "fitness_drive.total_calories",
                float(record["energyKilocalories"]),
                "kcal",
            )
        ]
    if record_type == "sleep_session":
        metrics = []
        for stage in record.get("stages", []):
            label = SLEEP_STAGES.get(
                stage.get("stage"), f"stage_{stage.get('stage', 'unknown')}"
            )
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
        return [
            (
                start,
                "fitness_drive.exercise",
                _duration_seconds(start, record["endTime"]),
                "s",
            )
        ]
    if record_type == "resting_heart_rate":
        return [
            (
                start,
                "fitness_drive.resting_heart_rate",
                float(record["beatsPerMinute"]),
                "bpm",
            )
        ]
    if record_type == "oxygen_saturation":
        return [
            (start, "fitness_drive.oxygen_saturation", float(record["percentage"]), "%")
        ]
    return []


def _fitness_metric_payload(record: dict, metric: str) -> dict:
    """Store interpretation context while keeping full source data in cached files."""
    payload = {
        "recordType": record.get("recordType"),
        "origin": record.get("origin", ""),
    }
    if metric == "fitness_drive.steps" or metric.startswith("fitness_drive.sleep."):
        payload.update(startTime=record.get("startTime"), endTime=record.get("endTime"))
    return payload


def _fitness_manifest(config: Config) -> dict[str, dict]:
    """Return Drive metadata keyed by local cache filename."""
    if not config.fitness_drive_cache:
        return {}
    try:
        raw = json.loads(
            (config.fitness_drive_cache / ".drive-index.json").read_text(
                encoding="utf-8"
            )
        )
    except (FileNotFoundError, json.JSONDecodeError):
        return {}
    files = raw.get("files", {}) if raw.get("version") == 2 else {}
    return {
        entry["localName"]: {"remote_id": remote_id, **entry}
        for remote_id, entry in files.items()
        if isinstance(entry, dict) and entry.get("localName")
    }


MetricRow = tuple[str, str, str, float, str, dict]
EmaRow = tuple[
    str,
    str,
    str | None,
    str,
    int | None,
    int | None,
    int | None,
    int | None,
    str | None,
    str | None,
]


def _stage_fitness_file(
    path: Path, config: Config, local_tz: ZoneInfo
) -> tuple[list[MetricRow], list[EmaRow], int, set[str]]:
    """Validate one cached export and prepare its database rows without writing."""
    metric_rows: list[MetricRow] = []
    ema_rows: list[EmaRow] = []
    affected_dates: set[str] = set()
    records = 0

    for document in _fitness_documents(path):
        batch, document_records, ema_events = _fitness_batch(document)
        header = batch.get("header", {})
        if header.get("schemaVersion") != 1:
            raise ValueError(
                f"Unsupported fitness schema in {path.name}: "
                f"{header.get('schemaVersion')}"
            )
        if header.get("recordCount") is not None and header["recordCount"] != len(
            document_records
        ):
            raise ValueError(f"Fitness record count mismatch: {path.name}")

        for record in document_records:
            records += 1
            record_id = (
                record.get("recordId")
                or sha256(
                    json.dumps(record, sort_keys=True).encode("utf-8")
                ).hexdigest()
            )
            for index, (occurred_at, metric, value, unit) in enumerate(
                _fitness_metrics(record)
            ):
                normalized = as_utc_iso(occurred_at, config.timezone)
                logical_date = (
                    (
                        datetime.fromisoformat(normalized).astimezone(local_tz)
                        - timedelta(hours=config.day_boundary_hour)
                    )
                    .date()
                    .isoformat()
                )
                affected_dates.add(logical_date)
                if record.get("recordType") == "heart_rate":
                    # A sample identity survives changes in export batch size.
                    sample_identity = json.dumps(
                        [record.get("origin", ""), normalized, metric],
                        ensure_ascii=False,
                        separators=(",", ":"),
                    )
                    external_id = (
                        "heart_rate:"
                        + sha256(sample_identity.encode("utf-8")).hexdigest()
                    )
                else:
                    record_type = record.get("recordType", "fitness")
                    external_id = f"{record_type}:{record_id}:{index}"
                metric_rows.append(
                    (
                        external_id,
                        normalized,
                        metric,
                        value,
                        unit,
                        _fitness_metric_payload(record, metric),
                    )
                )

        for event in ema_events:
            if not isinstance(event, dict):
                raise ValueError(f"Invalid EMA event in {path.name}")
            event_id = event.get("id")
            scheduled_at = event.get("scheduledAt")
            status = event.get("status")
            if (
                not event_id
                or not scheduled_at
                or status not in {"pending", "answered", "dismissed", "expired"}
            ):
                raise ValueError(f"Invalid EMA event in {path.name}")
            answered_at = event.get("answeredAt")
            answered_values = {
                key: event.get(key) if status == "answered" else None
                for key in ("mood", "energy", "focus", "stress")
            }
            ema_rows.append(
                (
                    str(event_id),
                    as_utc_iso(scheduled_at, config.timezone),
                    as_utc_iso(answered_at, config.timezone) if answered_at else None,
                    status,
                    _ema_rating(answered_values["mood"]),
                    _ema_rating(answered_values["energy"]),
                    _ema_rating(answered_values["focus"]),
                    _ema_rating(answered_values["stress"]),
                    (
                        str(event["activity"])
                        if status == "answered" and event.get("activity") is not None
                        else None
                    ),
                    (
                        str(event["note"])
                        if status == "answered" and event.get("note") is not None
                        else None
                    ),
                )
            )

    return metric_rows, ema_rows, records, affected_dates


def _store_fitness_projection(
    config: Config,
    manifest: dict[str, dict],
    path_hashes: dict[Path, str],
    staged: dict[Path, list[MetricRow]],
    staged_ema: dict[Path, list[EmaRow]],
    file_ranks: dict[Path, tuple[str, int, str]],
    *,
    rebuild: bool,
    missing_ema_details: bool,
) -> tuple[int, int]:
    """Persist staged source facts and their import provenance in one transaction."""
    files = metrics = 0
    with connect(config.database) as conn:
        if rebuild:
            conn.execute("DELETE FROM metric_events WHERE source = 'fitness_drive'")
            conn.execute("DELETE FROM ema_events")
        ordered_staged = sorted(
            staged.items(), key=lambda item: file_ranks[item[0]], reverse=True
        )
        for path, rows in ordered_staged:
            if not rebuild:
                conn.execute(
                    "DELETE FROM metric_events WHERE source = 'fitness_drive' "
                    "AND origin_file = ?",
                    (str(path),),
                )
            for external_id, occurred_at, metric, value, unit, payload in rows:
                if insert_metric(
                    conn,
                    source="fitness_drive",
                    external_id=external_id,
                    occurred_at=occurred_at,
                    metric=metric,
                    value_num=value,
                    value_text=None,
                    unit=unit,
                    payload=payload,
                    origin_file=str(path),
                ):
                    metrics += 1
            if not rebuild:
                conn.execute(
                    "DELETE FROM ema_events WHERE origin_file = ?", (str(path),)
                )
            for row in staged_ema[path]:
                conn.execute(
                    """INSERT OR IGNORE INTO ema_events
                    (event_id, scheduled_at, answered_at, status, origin_file,
                     mood, energy, focus, stress, activity, note)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (row[0], row[1], row[2], row[3], str(path), *row[4:]),
                )
            file_meta = manifest.get(path.name, {})
            conn.execute(
                """
                INSERT INTO import_files
                    (path, sha256, source, imported_at, remote_id, remote_name,
                     remote_modified_at, remote_status, last_seen_at)
                VALUES (?, ?, 'fitness_drive', ?, ?, ?, ?, ?, ?)
                ON CONFLICT(path) DO UPDATE SET
                    sha256=excluded.sha256,
                    source=excluded.source,
                    imported_at=excluded.imported_at,
                    remote_id=excluded.remote_id,
                    remote_name=excluded.remote_name,
                    remote_modified_at=excluded.remote_modified_at,
                    remote_status=excluded.remote_status,
                    last_seen_at=excluded.last_seen_at
                """,
                (
                    str(path),
                    path_hashes[path],
                    utc_now(),
                    file_meta.get("remote_id") or path.name.split("--", 1)[0],
                    file_meta.get("name") or path.name,
                    file_meta.get("modifiedTime"),
                    file_meta.get("status", "available"),
                    file_meta.get("lastSeenAt"),
                ),
            )
            files += 1
        for local_name, file_meta in manifest.items():
            conn.execute(
                """
                UPDATE import_files SET remote_status = ?, last_seen_at = ?
                WHERE path = ? AND source = 'fitness_drive'
                """,
                (
                    file_meta.get("status", "available"),
                    file_meta.get("lastSeenAt"),
                    str((config.fitness_drive_cache / local_name).resolve()),
                ),
            )
        if missing_ema_details:
            conn.execute(f"PRAGMA user_version = {EMA_DETAILS_BACKFILL_VERSION}")
    return files, metrics


def import_fitness_drive(config: Config) -> dict[str, object]:
    """Atomically replace changed bracelet-file projections in the local database."""
    if not config.fitness_drive_cache:
        return {"files": 0, "records": 0, "metrics": 0, "skipped_not_configured": 1}
    paths = sorted(
        path
        for path in config.fitness_drive_cache.iterdir()
        if path.is_file() and not path.name.startswith(".")
    )
    manifest = _fitness_manifest(config)
    path_hashes = {path.resolve(): file_hash(path) for path in paths}
    with connect(config.database) as conn:
        previous_hashes = {
            Path(row["path"]): row["sha256"]
            for row in conn.execute(
                "SELECT path, sha256 FROM import_files WHERE source = 'fitness_drive'"
            )
        }
        legacy_rows = conn.execute(
            """
            SELECT COUNT(*) AS count FROM metric_events
            WHERE source = 'fitness_drive' AND origin_file IS NULL
            """
        ).fetchone()["count"]
        legacy_heart_rate_ids = conn.execute(
            """
            SELECT COUNT(*) AS count FROM metric_events
            WHERE source = 'fitness_drive'
              AND metric = 'fitness_drive.heart_rate'
              AND external_id LIKE 'heart_rate:%:%'
            LIMIT 1
            """
        ).fetchone()["count"]
        full_record_payloads = conn.execute(
            """
            SELECT COUNT(*) AS count FROM metric_events
            WHERE source = 'fitness_drive'
              AND CASE WHEN json_valid(payload_json) THEN (
                    (metric = 'fitness_drive.heart_rate'
                     AND json_type(payload_json, '$.samples') = 'array')
                 OR (metric = 'fitness_drive.steps'
                     AND json_type(payload_json, '$.count') IS NOT NULL)
                 OR (metric LIKE 'fitness_drive.sleep.%_seconds'
                     AND json_type(payload_json, '$.stages') = 'array')
                 OR (metric = 'fitness_drive.distance'
                     AND json_type(payload_json, '$.distanceMeters') IS NOT NULL)
                 OR (metric = 'fitness_drive.total_calories'
                     AND json_type(payload_json, '$.energyKilocalories') IS NOT NULL)
                 OR (metric = 'fitness_drive.exercise'
                     AND json_type(payload_json, '$.endTime') IS NOT NULL)
                 OR (metric = 'fitness_drive.resting_heart_rate'
                     AND json_type(payload_json, '$.beatsPerMinute') IS NOT NULL)
                 OR (metric = 'fitness_drive.oxygen_saturation'
                     AND json_type(payload_json, '$.percentage') IS NOT NULL)
              ) ELSE 1 END
            LIMIT 1
            """
        ).fetchone()["count"]
        missing_ema_details = (
            conn.execute("PRAGMA user_version").fetchone()[0]
            < EMA_DETAILS_BACKFILL_VERSION
        )

    changed_paths = (
        paths
        if legacy_rows > 0
        else [
            path
            for path in paths
            if previous_hashes.get(path.resolve()) != path_hashes[path.resolve()]
        ]
    )
    # Overlapping exports can own identical rows; reconcile all cached files on change.
    rebuild = (
        legacy_rows > 0
        or legacy_heart_rate_ids > 0
        or full_record_payloads > 0
        or missing_ema_details
        or bool(changed_paths)
    )
    selected = paths if rebuild else []
    staged: dict[Path, list[MetricRow]] = {}
    staged_ema: dict[Path, list[EmaRow]] = {}
    file_ranks: dict[Path, tuple[str, int, str]] = {}
    records = 0
    affected_dates: set[str] = set()
    local_tz = ZoneInfo(config.timezone)

    for path in selected:
        file_meta = manifest.get(path.name, {})
        resolved_path = path.resolve()
        file_ranks[resolved_path] = (
            str(
                file_meta.get("modifiedTime")
                or file_meta.get("remote_modified_at")
                or ""
            ),
            path.stat().st_mtime_ns,
            path.name,
        )
        metric_rows, ema_rows, file_records, file_dates = _stage_fitness_file(
            path, config, local_tz
        )
        staged[resolved_path] = metric_rows
        staged_ema[resolved_path] = ema_rows
        records += file_records
        affected_dates.update(file_dates)

    files, metrics = _store_fitness_projection(
        config,
        manifest,
        path_hashes,
        staged,
        staged_ema,
        file_ranks,
        rebuild=rebuild,
        missing_ema_details=missing_ema_details,
    )
    return {
        "files": files,
        "records": records,
        "metrics": metrics,
        "rebuild": rebuild,
        "affected_dates": sorted(affected_dates),
    }
