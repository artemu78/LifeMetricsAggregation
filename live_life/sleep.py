from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
import json
from math import floor
from zoneinfo import ZoneInfo


SLEEP_PREFIX = "fitness_drive.sleep."
AWAKE_METRIC = "fitness_drive.sleep.awake_seconds"


def _parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def main_sleep_by_wake_date(conn, start: date, end: date, timezone: str) -> dict[str, list[dict]]:
    """Return the longest sleep session ending on each local date.

    Activity keeps the configured logical-day boundary, but Bracelet sleep follows
    the date on which the session ends. Shorter same-day sessions are treated as
    naps and do not change the nightly sleep total.
    """
    tz = ZoneInfo(timezone)
    sessions: dict[tuple[str, str, str, str], dict[tuple, dict]] = defaultdict(dict)
    wake_dates: dict[tuple[str, str, str, str], str] = {}

    rows = conn.execute(
        """
        SELECT occurred_at, metric, value_num, unit, payload_json
        FROM metric_events
        WHERE source = 'fitness_drive'
          AND metric LIKE 'fitness_drive.sleep.%_seconds'
          AND value_num IS NOT NULL
        ORDER BY occurred_at
        """
    )
    for row in rows:
        try:
            payload = json.loads(row["payload_json"])
            session_start = payload["startTime"]
            session_end = payload["endTime"]
            wake_date = _parse_timestamp(session_end).astimezone(tz).date()
        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            continue
        if wake_date < start or wake_date > end:
            continue
        identity = (
            str(payload.get("origin", "")),
            str(payload.get("recordId", "")),
            session_start,
            session_end,
        )
        wake_dates[identity] = wake_date.isoformat()
        point = {
            "timestamp": row["occurred_at"],
            "metric": row["metric"],
            "value": row["value_num"],
            "unit": row["unit"],
        }
        point_identity = (point["timestamp"], point["metric"], point["value"], point["unit"])
        sessions[identity][point_identity] = point

    selected: dict[str, tuple[float, list[dict]]] = {}
    for identity, unique_points in sessions.items():
        points = sorted(unique_points.values(), key=lambda point: point["timestamp"])
        sleep_seconds = sum(
            point["value"] for point in points if point["metric"] != AWAKE_METRIC
        )
        wake_date = wake_dates[identity]
        current = selected.get(wake_date)
        if current is None or sleep_seconds > current[0]:
            selected[wake_date] = (sleep_seconds, points)
    return {wake_date: points for wake_date, (_, points) in selected.items()}


def sleep_seconds(points: list[dict]) -> float:
    """Sum non-awake stage durations from one selected sleep session."""
    return sum(point["value"] for point in points if point["metric"] != AWAKE_METRIC)


def format_sleep_duration(seconds: float) -> str:
    """Format a sleep duration as zero-padded hours and minutes."""
    total_minutes = floor(seconds / 60 + 0.5)
    hours, minutes = divmod(total_minutes, 60)
    return f"{hours:02d}:{minutes:02d}"
