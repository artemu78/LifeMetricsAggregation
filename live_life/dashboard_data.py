from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from .collectors import logical_window
from .config import Config
from .db import connect


SOURCES = ("bracelet", "welltory", "todoist", "rescuetime")
DB_SOURCE = {"bracelet": "fitness_drive", "welltory": "welltory", "rescuetime": "rescuetime"}


def _days(start: date, end: date):
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


def build_dashboard(config: Config, start: date, end: date) -> dict:
    """Build a value-safe dashboard projection without reading diary or raw payloads."""
    if end < start:
        raise ValueError("to must be on or after from")
    first_start, _ = logical_window(start, config)
    _, last_end = logical_window(end, config)
    start_utc = first_start.astimezone(timezone.utc).isoformat()
    end_utc = last_end.astimezone(timezone.utc).isoformat()
    tz = ZoneInfo(config.timezone)
    today = datetime.now(tz).date()

    metrics: dict[str, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    created: dict[str, list[dict]] = defaultdict(list)
    completed: dict[str, list[dict]] = defaultdict(list)
    run_statuses: dict[tuple[str, str], dict] = {}

    def logical_date(timestamp: str) -> str:
        return (
            datetime.fromisoformat(timestamp).astimezone(tz)
            - timedelta(hours=config.day_boundary_hour)
        ).date().isoformat()

    with connect(config.database) as conn:
        for row in conn.execute(
            """
            SELECT source, occurred_at, metric, value_num, unit
            FROM metric_events
            WHERE occurred_at >= ? AND occurred_at < ?
              AND source IN ('fitness_drive', 'welltory', 'rescuetime')
              AND value_num IS NOT NULL
            ORDER BY occurred_at
            """,
            (start_utc, end_utc),
        ):
            day = logical_date(row["occurred_at"])
            metrics[day][row["source"]].append(
                {
                    "timestamp": row["occurred_at"],
                    "metric": row["metric"],
                    "value": row["value_num"],
                    "unit": row["unit"],
                }
            )
        for row in conn.execute(
            """
            SELECT content, created_at FROM created_tasks
            WHERE source = 'todoist' AND created_at >= ? AND created_at < ?
            ORDER BY created_at
            """,
            (start_utc, end_utc),
        ):
            created[logical_date(row["created_at"])].append(
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
            completed[logical_date(row["completed_at"])].append(
                {"content": row["content"], "timestamp": row["completed_at"]}
            )
        for row in conn.execute(
            """
            SELECT source, logical_date, status, finished_at
            FROM source_runs
            WHERE logical_date >= ? AND logical_date <= ?
            ORDER BY finished_at DESC
            """,
            (start.isoformat(), end.isoformat()),
        ):
            run_statuses.setdefault(
                (row["logical_date"], row["source"]),
                {"status": row["status"], "lastRunAt": row["finished_at"]},
            )

    result_days = []
    for day in _days(start, end):
        day_key = day.isoformat()
        day_metrics = metrics[day_key]
        bracelet_metrics = day_metrics["fitness_drive"]
        welltory_metrics = day_metrics["welltory"]
        rescue_rows = []
        for point in day_metrics["rescuetime"]:
            parts = point["metric"].split(".", 3)
            if len(parts) == 4 and parts[2] in {"activity", "productivity"}:
                rescue_rows.append(
                    {
                        "perspective": parts[2],
                        "label": parts[3],
                        "seconds": point["value"],
                    }
                )
        source_items = []
        for source in SOURCES:
            status = run_statuses.get((day_key, source))
            if status is None:
                has_legacy_data = {
                    "bracelet": bool(bracelet_metrics),
                    "welltory": bool(welltory_metrics),
                    "todoist": bool(created[day_key] or completed[day_key]),
                    "rescuetime": bool(rescue_rows),
                }[source]
                status = {
                    "status": "partial" if has_legacy_data else "not_run",
                    "lastRunAt": None,
                }
            source_items.append({"source": source, **status})

        sleep_seconds = sum(
            point["value"] for point in bracelet_metrics
            if point["metric"].startswith("fitness_drive.sleep.")
        )
        step_values = [
            point["value"] for point in bracelet_metrics
            if point["metric"] == "fitness_drive.steps"
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
                    "sleepSeconds": sleep_seconds if sleep_seconds else None,
                    "steps": sum(step_values) if step_values else None,
                },
                "welltory": {
                    "available": bool(welltory_metrics),
                    "count": len(welltory_metrics),
                },
                "todoist": {
                    "created": len(created[day_key]),
                    "completed": len(completed[day_key]),
                },
                "rescuetime": {
                    "available": bool(rescue_rows),
                    "count": len(rescue_rows),
                },
                "detail": {
                    "braceletMetrics": bracelet_metrics,
                    "welltoryMetrics": welltory_metrics,
                    "createdTasks": created[day_key],
                    "completedTasks": completed[day_key],
                    "rescueTime": rescue_rows,
                },
            }
        )
    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "timezone": config.timezone,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "days": result_days,
    }
