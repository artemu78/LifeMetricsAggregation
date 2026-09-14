from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
import json
from zoneinfo import ZoneInfo


STEP_METRIC = "fitness_drive.steps"


def _parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def steps_by_calendar_date(conn, start: date, end: date, timezone_name: str) -> dict[str, list[dict]]:
    """Return canonical Bracelet step intervals grouped by local calendar date.

    Reva Health Exporter files can overlap and contain revisions of the same
    origin/interval. The most recently modified export is authoritative for that
    interval. Steps use their Moscow calendar date, independently of the logical
    day used for effort measurements.
    """
    tz = ZoneInfo(timezone_name)
    range_start = datetime.combine(start, time.min, tzinfo=tz).astimezone(timezone.utc)
    range_end = datetime.combine(end + timedelta(days=1), time.min, tzinfo=tz).astimezone(
        timezone.utc
    )
    selected: dict[tuple[str, ...], tuple[tuple[datetime, int], str, dict]] = {}

    rows = conn.execute(
        """
        SELECT m.id, m.occurred_at, m.value_num, m.unit, m.payload_json,
               m.imported_at, f.remote_modified_at
        FROM metric_events AS m
        LEFT JOIN import_files AS f ON f.path = m.origin_file
        WHERE m.source = 'fitness_drive'
          AND m.metric = 'fitness_drive.steps'
          AND m.value_num IS NOT NULL
          AND m.occurred_at >= ? AND m.occurred_at < ?
        ORDER BY m.occurred_at, m.id
        """,
        (range_start.isoformat(), range_end.isoformat()),
    )
    for row in rows:
        try:
            payload = json.loads(row["payload_json"])
        except (json.JSONDecodeError, TypeError):
            payload = {}
        origin = str(payload.get("origin", ""))
        interval_start = str(payload.get("startTime") or row["occurred_at"])
        interval_end = str(payload.get("endTime") or interval_start)
        identity = (origin, interval_start, interval_end)

        local_date = _parse_timestamp(interval_start).astimezone(tz).date()
        if local_date < start or local_date > end:
            continue
        revision_at = row["remote_modified_at"] or row["imported_at"]
        try:
            revision_time = _parse_timestamp(revision_at)
        except (TypeError, ValueError):
            revision_time = datetime.min.replace(tzinfo=timezone.utc)
        rank = (revision_time, row["id"])
        point = {
            "timestamp": row["occurred_at"],
            "metric": STEP_METRIC,
            "value": row["value_num"],
            "unit": row["unit"],
        }
        current = selected.get(identity)
        if current is None or rank > current[0]:
            selected[identity] = (rank, local_date.isoformat(), point)

    grouped: dict[str, list[dict]] = defaultdict(list)
    for _, local_date, point in selected.values():
        grouped[local_date].append(point)
    return {
        local_date: sorted(points, key=lambda point: point["timestamp"])
        for local_date, points in grouped.items()
    }


def step_total(points: list[dict]) -> float:
    """Sum canonical step intervals for one calendar date."""
    return sum(point["value"] for point in points)
