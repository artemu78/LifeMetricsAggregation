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

    def logical_date(timestamp: str) -> str:
        return (
            (
                datetime.fromisoformat(timestamp).astimezone(tz)
                - timedelta(hours=config.day_boundary_hour)
            )
            .date()
            .isoformat()
        )

    with connect(config.database) as conn:
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
            day = logical_date(row["occurred_at"])
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
        for row in conn.execute(
            """
            SELECT content, created_at FROM created_tasks
            WHERE source = 'todoist' AND created_at >= ? AND created_at < ?
            ORDER BY created_at
            """,
            (start_utc, end_utc),
        ):
            facts.created[logical_date(row["created_at"])].append(
                {"content": row["content"], "timestamp": row["created_at"]}
            )
        for row in conn.execute(
            """
            SELECT content, completed_at FROM completed_tasks
            WHERE source = 'todoist' AND completed_at >= ? AND completed_at < ?
            ORDER BY completed_at
            """,
            (start_utc, end_utc),
        ):
            facts.completed[logical_date(row["completed_at"])].append(
                {"content": row["content"], "timestamp": row["completed_at"]}
            )
        for row in conn.execute(
            """SELECT content, deleted_at FROM deleted_tasks
            WHERE source = 'todoist' AND deleted_at >= ? AND deleted_at < ?
            ORDER BY deleted_at""",
            (start_utc, end_utc),
        ):
            facts.deleted[logical_date(row["deleted_at"])].append(
                {"content": row["content"], "timestamp": row["deleted_at"]}
            )
        for row in conn.execute(
            """SELECT scheduled_at, status, mood, energy, focus, stress, activity, note
            FROM ema_events
            WHERE scheduled_at >= ? AND scheduled_at < ?
            ORDER BY scheduled_at""",
            (start_utc, end_utc),
        ):
            item = {
                "timestamp": row["scheduled_at"],
                "status": row["status"],
            }
            if row["mood"] is not None:
                item["mood"] = row["mood"]
            if row["energy"] is not None:
                item["energy"] = row["energy"]
            if row["focus"] is not None:
                item["focus"] = row["focus"]
            if row["stress"] is not None:
                item["stress"] = row["stress"]
            if row["activity"] is not None:
                item["activity"] = row["activity"]
            if row["note"] is not None:
                item["note"] = row["note"]
            facts.ema_events[logical_date(row["scheduled_at"])].append(item)
        for row in conn.execute(
            """
            SELECT source, logical_date, status, finished_at
            FROM source_runs
            WHERE logical_date >= ? AND logical_date <= ?
            ORDER BY finished_at DESC
            """,
            (start.isoformat(), end.isoformat()),
        ):
            facts.run_statuses.setdefault(
                (row["logical_date"], row["source"]),
                {"status": row["status"], "lastRunAt": row["finished_at"]},
            )


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

    result_days = []
    for day in _days(start, end):
        day_key = day.isoformat()
        day_metrics = facts.metrics[day_key]
        bracelet_metrics = day_metrics["fitness_drive"]
        welltory_metrics = day_metrics["welltory"]
        rescue_rows = []
        for point in day_metrics["rescuetime"]:
            parts = point["metric"].split(".", 3)
            if len(parts) == 4 and parts[2] in {"activity", "productivity"}:
                rescue_item = {
                    "timestamp": point["timestamp"],
                    "perspective": parts[2],
                    "label": parts[3],
                    "seconds": point["value"],
                }
                if parts[2] == "activity" and "productivityLevel" in point:
                    rescue_item["productivityLevel"] = point["productivityLevel"]
                rescue_rows.append(rescue_item)
        source_items = []
        for source in SOURCES:
            status = facts.run_statuses.get((day_key, source))
            if status is None:
                has_legacy_data = {
                    "bracelet": bool(bracelet_metrics),
                    "welltory": bool(welltory_metrics),
                    "todoist": bool(
                        facts.created[day_key]
                        or facts.completed[day_key]
                        or facts.deleted[day_key]
                    ),
                    "rescuetime": bool(rescue_rows),
                }[source]
                status = {
                    "status": "partial" if has_legacy_data else "not_run",
                    "lastRunAt": None,
                }
            source_items.append({"source": source, **status})

        selected_sleep = [
            point
            for point in bracelet_metrics
            if point["metric"].startswith("fitness_drive.sleep.")
        ]
        selected_sleep_seconds = sleep_seconds(selected_sleep)
        selected_steps = [
            point for point in bracelet_metrics if point["metric"] == STEP_METRIC
        ]
        result_days.append(
            {
                "date": day_key,
                "weekday": day.isoweekday(),
                "currentDay": day == today,
                "quality": _quality(
                    [item["status"] for item in source_items],
                    current_day=day == today,
                ),
                "sources": source_items,
                "bracelet": {
                    "sleepSeconds": selected_sleep_seconds
                    if selected_sleep_seconds
                    else None,
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
                "rescuetime": {
                    "available": bool(rescue_rows),
                    "count": len(rescue_rows),
                },
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
        )
    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "timezone": config.timezone,
        "generatedAt": datetime.now(UTC).isoformat(),
        "days": result_days,
    }
