from __future__ import annotations

import json
from collections import defaultdict
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from .collectors import logical_window
from .config import Config
from .db import connect
from .sleep import main_sleep_by_wake_date, sleep_seconds
from .steps import STEP_METRIC, step_total, steps_by_calendar_date

SOURCES = ("bracelet", "welltory", "todoist", "rescuetime")
DB_SOURCE = {
    "bracelet": "fitness_drive",
    "welltory": "welltory",
    "rescuetime": "rescuetime",
}


def _days(start: date, end: date) -> Iterator[date]:
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def _quality(statuses: list[str], *, current_day: bool) -> str:
    if current_day:
        return "in_progress"
    if "failed" in statuses:
        return "failed"
    if statuses and all(status == "success" for status in statuses):
        return "complete"
    if statuses and all(status == "not_run" for status in statuses):
        return "not_run"
    return "partial"


@dataclass(slots=True)
class _DashboardFacts:
    metrics: dict[str, dict[str, list[dict]]] = field(
        default_factory=lambda: defaultdict(lambda: defaultdict(list))
    )
    created: dict[str, list[dict]] = field(default_factory=lambda: defaultdict(list))
    completed: dict[str, list[dict]] = field(default_factory=lambda: defaultdict(list))
    deleted: dict[str, list[dict]] = field(default_factory=lambda: defaultdict(list))
    ema_events: dict[str, list[dict]] = field(default_factory=lambda: defaultdict(list))
    run_statuses: dict[tuple[str, str], dict] = field(default_factory=dict)


def _logical_date(timestamp: str, config: Config, tz: ZoneInfo) -> str:
    return (
        (
            datetime.fromisoformat(timestamp).astimezone(tz)
            - timedelta(hours=config.day_boundary_hour)
        )
        .date()
        .isoformat()
    )


def _read_dashboard_facts(
    config: Config,
    start: date,
    end: date,
    start_utc: str,
    end_utc: str,
    tz: ZoneInfo,
    facts: _DashboardFacts,
) -> None:
    """Load the bounded source projection used to assemble dashboard days."""
    with connect(config.database) as conn:
        _read_metric_facts(conn, start, end, start_utc, end_utc, config, tz, facts)
        _read_task_facts(conn, start_utc, end_utc, config, tz, facts)
        _read_ema_facts(conn, start_utc, end_utc, config, tz, facts)
        _read_source_runs(conn, start, end, facts)


def _read_metric_facts(conn, start, end, start_utc, end_utc, config, tz, facts):
    for row in conn.execute(
        """
        SELECT source, occurred_at, metric, value_num, value_text, unit,
               payload_json
        FROM metric_events
        WHERE occurred_at >= ? AND occurred_at < ?
          AND source IN ('fitness_drive', 'welltory', 'rescuetime')
          AND metric NOT LIKE 'fitness_drive.sleep.%_seconds'
          AND metric != 'fitness_drive.steps'
          AND (value_num IS NOT NULL OR value_text IS NOT NULL)
        ORDER BY occurred_at
        """,
        (start_utc, end_utc),
    ):
        day = _logical_date(row["occurred_at"], config, tz)
        point = {
            "timestamp": row["occurred_at"],
            "metric": row["metric"],
            "value": row["value_num"],
            "valueText": row["value_text"],
            "unit": row["unit"],
        }
        if row["source"] == "rescuetime" and row["metric"].startswith(
            "rescuetime.seconds.activity."
        ):
            try:
                productivity = json.loads(row["payload_json"]).get("Productivity")
            except (ValueError, TypeError, AttributeError):
                productivity = None
            if type(productivity) is int and -2 <= productivity <= 2:
                point["productivityLevel"] = productivity
        facts.metrics[day][row["source"]].append(point)
    for wake_date, points in main_sleep_by_wake_date(
        conn, start, end, config.timezone
    ).items():
        facts.metrics[wake_date]["fitness_drive"].extend(points)
    for calendar_date, points in steps_by_calendar_date(
        conn, start, end, config.timezone
    ).items():
        facts.metrics[calendar_date]["fitness_drive"].extend(points)


def _read_task_facts(conn, start_utc, end_utc, config, tz, facts):
    task_sources = (
        ("created_tasks", "created_at", facts.created),
        ("completed_tasks", "completed_at", facts.completed),
        ("deleted_tasks", "deleted_at", facts.deleted),
    )
    for table, timestamp_column, destination in task_sources:
        query = f"""SELECT content, {timestamp_column} AS occurred_at FROM {table}
            WHERE source = 'todoist' AND {timestamp_column} >= ?
              AND {timestamp_column} < ? ORDER BY {timestamp_column}"""
        for row in conn.execute(query, (start_utc, end_utc)):
            timestamp = row["occurred_at"]
            destination[_logical_date(timestamp, config, tz)].append(
                {"content": row["content"], "timestamp": timestamp}
            )


def _read_ema_facts(conn, start_utc, end_utc, config, tz, facts):
    for row in conn.execute(
        """SELECT scheduled_at, status, mood, energy, focus, stress,
                  activity, activity_label, note
        FROM ema_events WHERE scheduled_at >= ? AND scheduled_at < ?
        ORDER BY scheduled_at""",
        (start_utc, end_utc),
    ):
        item = {"timestamp": row["scheduled_at"], "status": row["status"]}
        for key in ("mood", "energy", "focus", "stress", "activity", "note"):
            if row[key] is not None:
                item[key] = row[key]
        if row["activity_label"] is not None:
            item["activityLabel"] = row["activity_label"]
        facts.ema_events[_logical_date(row["scheduled_at"], config, tz)].append(item)


def _read_source_runs(conn, start, end, facts):
    for row in conn.execute(
        """SELECT source, logical_date, status, finished_at FROM source_runs
        WHERE logical_date >= ? AND logical_date <= ? ORDER BY finished_at DESC""",
        (start.isoformat(), end.isoformat()),
    ):
        facts.run_statuses.setdefault(
            (row["logical_date"], row["source"]),
            {"status": row["status"], "lastRunAt": row["finished_at"]},
        )


def _rescue_rows(points: list[dict]) -> list[dict]:
    result = []
    for point in points:
        parts = point["metric"].split(".", 3)
        if len(parts) != 4 or parts[2] not in {"activity", "productivity"}:
            continue
        item = {
            "timestamp": point["timestamp"],
            "perspective": parts[2],
            "label": parts[3],
            "seconds": point["value"],
        }
        if parts[2] == "activity" and "productivityLevel" in point:
            item["productivityLevel"] = point["productivityLevel"]
        result.append(item)
    return result


def _dashboard_day(day: date, today: date, facts: _DashboardFacts) -> dict:
    day_key = day.isoformat()
    day_metrics = facts.metrics[day_key]
    bracelet_metrics = day_metrics["fitness_drive"]
    welltory_metrics = day_metrics["welltory"]
    rescue_rows = _rescue_rows(day_metrics["rescuetime"])
    legacy_data = {
        "bracelet": bool(bracelet_metrics),
        "welltory": bool(welltory_metrics),
        "todoist": bool(
            facts.created[day_key] or facts.completed[day_key] or facts.deleted[day_key]
        ),
        "rescuetime": bool(rescue_rows),
    }
    source_items = []
    for source in SOURCES:
        status = facts.run_statuses.get((day_key, source))
        if status is None:
            status = {
                "status": "partial" if legacy_data[source] else "not_run",
                "lastRunAt": None,
            }
        source_items.append({"source": source, **status})

    selected_sleep = [
        point
        for point in bracelet_metrics
        if point["metric"].startswith("fitness_drive.sleep.")
    ]
    selected_steps = [
        point for point in bracelet_metrics if point["metric"] == STEP_METRIC
    ]
    current_day = day == today
    return {
        "date": day_key,
        "weekday": day.isoweekday(),
        "currentDay": current_day,
        "quality": _quality(
            [item["status"] for item in source_items], current_day=current_day
        ),
        "sources": source_items,
        "bracelet": {
            "sleepSeconds": sleep_seconds(selected_sleep) if selected_sleep else None,
            "steps": step_total(selected_steps) if selected_steps else None,
        },
        "welltory": {
            "available": bool(welltory_metrics),
            "count": len(welltory_metrics),
        },
        "todoist": {
            "created": len(facts.created[day_key]),
            "completed": len(facts.completed[day_key]),
            "deleted": len(facts.deleted[day_key]),
        },
        "rescuetime": {"available": bool(rescue_rows), "count": len(rescue_rows)},
        "detail": {
            "braceletMetrics": bracelet_metrics,
            "welltoryMetrics": welltory_metrics,
            "createdTasks": facts.created[day_key],
            "completedTasks": facts.completed[day_key],
            "deletedTasks": facts.deleted[day_key],
            "emaEvents": facts.ema_events[day_key],
            "rescueTime": rescue_rows,
        },
    }


def build_dashboard(config: Config, start: date, end: date) -> dict[str, object]:
    """Build a value-safe dashboard projection without reading diary or raw payloads."""
    if end < start:
        raise ValueError("to must be on or after from")
    first_start, _ = logical_window(start, config)
    _, last_end = logical_window(end, config)
    start_utc = first_start.astimezone(UTC).isoformat()
    end_utc = last_end.astimezone(UTC).isoformat()
    tz = ZoneInfo(config.timezone)
    today = datetime.now(tz).date()
    facts = _DashboardFacts()
    _read_dashboard_facts(config, start, end, start_utc, end_utc, tz, facts)
    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "timezone": config.timezone,
        "generatedAt": datetime.now(UTC).isoformat(),
        "days": [_dashboard_day(day, today, facts) for day in _days(start, end)],
    }
