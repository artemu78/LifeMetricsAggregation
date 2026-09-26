from __future__ import annotations

import gzip
import json
import re
from dataclasses import dataclass
from datetime import date
from datetime import datetime, timedelta
from hashlib import sha256
from pathlib import Path
from zoneinfo import ZoneInfo

from .config import Config
from .db import connect, insert_metric, utc_now
from .import_support import as_utc_iso, file_hash

EMA_DETAILS_BACKFILL_VERSION = 1


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
EMA_STATUSES = {"pending", "answered", "dismissed", "expired"}
EMA_RATING_FIELDS = ("mood", "energy", "focus", "stress")
EMA_ANSWER_FIELDS = {
    "answeredAt",
    *EMA_RATING_FIELDS,
    "activity",
    "activityLabel",
    "note",
    "additionalAnswers",
}


@dataclass(frozen=True)
class EmaRow:
    event_id: str
    schema_version: int
    scheduled_at: str
    answered_at: str | None
    status: str
    mood: int | None
    energy: int | None
    focus: int | None
    stress: int | None
    activity: str | None
    activity_label: str | None
    note: str | None
    payload_json: str


def _invalid_ema(path: Path) -> ValueError:
    return ValueError(f"Invalid EMA event in {path.name}")


def _ema_identity(event: dict, path: Path) -> tuple[int, str, str, str]:
    schema_version = event.get("schemaVersion")
    event_id = event.get("id")
    schedule_date = event.get("scheduleDate")
    scheduled_at = event.get("scheduledAt")
    timezone_name = event.get("timezone")
    if (
        type(schema_version) is not int
        or schema_version not in {1, 2}
        or not isinstance(event_id, str)
        or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", event_id)
        or not isinstance(schedule_date, str)
        or not isinstance(scheduled_at, str)
        or not isinstance(timezone_name, str)
        or not timezone_name.strip()
        or event.get("status") not in EMA_STATUSES
    ):
        raise _invalid_ema(path)
    try:
        date.fromisoformat(schedule_date)
    except ValueError:
        raise _invalid_ema(path) from None
    return schema_version, event_id, scheduled_at, event["status"]


def _ema_ratings(event: dict, path: Path) -> dict[str, int | None]:
    ratings: dict[str, int | None] = {}
    for key in EMA_RATING_FIELDS:
        value = event.get(key)
        if key in event and (type(value) is not int or not 1 <= value <= 5):
            raise _invalid_ema(path)
        ratings[key] = value
    return ratings


def _ema_optional_text(
    event: dict, key: str, path: Path, *, max_length: int | None = None
) -> str | None:
    if key not in event:
        return None
    value = event[key]
    if not isinstance(value, str) or not value.strip():
        raise _invalid_ema(path)
    if max_length is not None and len(value) > max_length:
        raise _invalid_ema(path)
    return value


def _validate_ema_additional_answers(event: dict, path: Path) -> None:
    if "additionalAnswers" not in event:
        return
    answers = event["additionalAnswers"]
    if not isinstance(answers, dict) or any(
        key in EMA_RATING_FIELDS or type(value) is not int
        for key, value in answers.items()
    ):
        raise _invalid_ema(path)


def _ema_answered_at(
    event: dict,
    path: Path,
    schema_version: int,
    status: str,
    ratings: dict[str, int | None],
    activity: str | None,
) -> str | None:
    if status != "answered":
        if EMA_ANSWER_FIELDS.intersection(event):
            raise _invalid_ema(path)
        return None
    answered_at = event.get("answeredAt")
    if not isinstance(answered_at, str):
        raise _invalid_ema(path)
    has_all_v1_answers = activity is not None and all(
        ratings[key] is not None for key in EMA_RATING_FIELDS
    )
    has_meaningful_v2_answer = activity is not None or any(
        ratings[key] is not None for key in EMA_RATING_FIELDS
    )
    if schema_version == 1 and not has_all_v1_answers:
        raise _invalid_ema(path)
    if schema_version == 2 and not has_meaningful_v2_answer:
        raise _invalid_ema(path)
    return answered_at


def _validate_fitness_document(
    path: Path, document: dict
) -> tuple[list[dict], list[dict]]:
    """Validate a document header and return its health and EMA records."""
    if "exportSchemaVersion" in document and document["exportSchemaVersion"] != 1:
        raise ValueError(
            f"Unsupported export schema in {path.name}: "
            f"{document['exportSchemaVersion']}"
        )
    batch, records, ema_events = _fitness_batch(document)
    header = batch.get("header", {})
    if header.get("schemaVersion") != 1:
        raise ValueError(
            f"Unsupported fitness schema in {path.name}: {header.get('schemaVersion')}"
        )
    if header.get("recordCount") is not None and header["recordCount"] != len(records):
        raise ValueError(f"Fitness record count mismatch: {path.name}")
    return records, ema_events


def _fitness_record_id(record: dict) -> str:
    return (
        record.get("recordId")
        or sha256(json.dumps(record, sort_keys=True).encode("utf-8")).hexdigest()
    )


def _metric_external_id(
    record: dict, record_id: str, index: int, normalized: str, metric: str
) -> str:
    if record.get("recordType") != "heart_rate":
        return f"{record.get('recordType', 'fitness')}:{record_id}:{index}"
    # A sample identity survives changes in export batch size.
    sample_identity = json.dumps(
        [record.get("origin", ""), normalized, metric],
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return "heart_rate:" + sha256(sample_identity.encode("utf-8")).hexdigest()


def _stage_record_metrics(
    record: dict, config: Config, local_tz: ZoneInfo
) -> tuple[list[MetricRow], set[str]]:
    """Prepare the metric projection rows from one health record."""
    rows = []
    affected_dates = set()
    record_id = _fitness_record_id(record)
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
        rows.append(
            (
                _metric_external_id(record, record_id, index, normalized, metric),
                normalized,
                metric,
                value,
                unit,
                _fitness_metric_payload(record, metric),
            )
        )
    return rows, affected_dates


def _stage_ema_event(event: dict, path: Path, timezone_name: str) -> EmaRow:
    """Validate one EMA event and normalize it for the database schema."""
    schema_version, event_id, scheduled_at, status = _ema_identity(event, path)
    answered = status == "answered"
    ratings = _ema_ratings(event, path)
    activity = _ema_optional_text(event, "activity", path)
    activity_label = _ema_optional_text(event, "activityLabel", path)
    note = _ema_optional_text(event, "note", path, max_length=280)
    if activity_label is not None and activity is None:
        raise _invalid_ema(path)
    _validate_ema_additional_answers(event, path)
    answered_at = _ema_answered_at(
        event, path, schema_version, status, ratings, activity
    )

    return EmaRow(
        event_id=event_id,
        schema_version=schema_version,
        scheduled_at=as_utc_iso(scheduled_at, timezone_name),
        answered_at=as_utc_iso(answered_at, timezone_name) if answered_at else None,
        status=status,
        mood=ratings["mood"] if answered else None,
        energy=ratings["energy"] if answered else None,
        focus=ratings["focus"] if answered else None,
        stress=ratings["stress"] if answered else None,
        activity=activity if answered else None,
        activity_label=activity_label if answered else None,
        note=note if answered else None,
        payload_json=json.dumps(event, ensure_ascii=False, sort_keys=True),
    )


def _stage_fitness_file(
    path: Path, config: Config, local_tz: ZoneInfo
) -> tuple[list[MetricRow], list[EmaRow], int, set[str]]:
    """Validate one cached export and prepare its database rows without writing."""
    metric_rows: list[MetricRow] = []
    ema_rows_by_id: dict[str, EmaRow] = {}
    affected_dates: set[str] = set()
    records = 0
    for document in _fitness_documents(path):
        document_records, ema_events = _validate_fitness_document(path, document)
        for record in document_records:
            rows, record_dates = _stage_record_metrics(record, config, local_tz)
            metric_rows.extend(rows)
            affected_dates.update(record_dates)
        records += len(document_records)
        for event in ema_events:
            if not isinstance(event, dict):
                raise ValueError(f"Invalid EMA event in {path.name}")
            row = _stage_ema_event(event, path, config.timezone)
            # Within one export, the last revision of a stable event identity wins.
            ema_rows_by_id[row.event_id] = row
    return metric_rows, list(ema_rows_by_id.values()), records, affected_dates


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
            metrics += _store_staged_file(
                conn,
                path,
                rows,
                staged_ema[path],
                manifest.get(path.name, {}),
                path_hashes[path],
                rebuild=rebuild,
            )
            files += 1
        _update_manifest_statuses(conn, config, manifest)
        if missing_ema_details:
            conn.execute(f"PRAGMA user_version = {EMA_DETAILS_BACKFILL_VERSION}")
    return files, metrics


def _store_metric_rows(conn, path: Path, rows: list[MetricRow]) -> int:
    metrics = 0
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
    return metrics


def _store_ema_rows(conn, path: Path, rows: list[EmaRow]) -> None:
    for row in rows:
        conn.execute(
            """INSERT OR IGNORE INTO ema_events
            (event_id, schema_version, scheduled_at, answered_at, status, origin_file,
             mood, energy, focus, stress, activity, activity_label, note, payload_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                row.event_id,
                row.schema_version,
                row.scheduled_at,
                row.answered_at,
                row.status,
                str(path),
                row.mood,
                row.energy,
                row.focus,
                row.stress,
                row.activity,
                row.activity_label,
                row.note,
                row.payload_json,
            ),
        )


def _store_import_file(conn, path: Path, file_meta: dict, path_hash: str) -> None:
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
            path_hash,
            utc_now(),
            file_meta.get("remote_id") or path.name.split("--", 1)[0],
            file_meta.get("name") or path.name,
            file_meta.get("modifiedTime"),
            file_meta.get("status", "available"),
            file_meta.get("lastSeenAt"),
        ),
    )


def _store_staged_file(
    conn,
    path: Path,
    metric_rows: list[MetricRow],
    ema_rows: list[EmaRow],
    file_meta: dict,
    path_hash: str,
    *,
    rebuild: bool,
) -> int:
    if not rebuild:
        conn.execute(
            "DELETE FROM metric_events WHERE source = 'fitness_drive' "
            "AND origin_file = ?",
            (str(path),),
        )
    metrics = _store_metric_rows(conn, path, metric_rows)
    if not rebuild:
        conn.execute("DELETE FROM ema_events WHERE origin_file = ?", (str(path),))
    _store_ema_rows(conn, path, ema_rows)
    _store_import_file(conn, path, file_meta, path_hash)
    return metrics


def _update_manifest_statuses(conn, config: Config, manifest: dict[str, dict]) -> None:
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
