from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from .config import Config
from .db import connect

FITNESS_DRIVE_LABEL = "Fitness bracelet (Google Drive)"
FRESHNESS_SOURCES = (
    FITNESS_DRIVE_LABEL, "Welltory", "RescueTime", "Todoist", "Diary"
)


def _local_timestamp(value: str | None, timezone_name: str) -> str | None:
    """Convert an optional ISO timestamp to the configured local timezone."""
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=ZoneInfo(timezone_name))
    return parsed.astimezone(ZoneInfo(timezone_name)).isoformat(timespec="seconds")


def get_source_latest(conn, timezone_name: str, source: str) -> str | None:
    """Return the latest timestamp for one source converted to the local timezone."""
    if source in ("bracelet", "fitness_drive", FITNESS_DRIVE_LABEL):
        row = conn.execute(
            "SELECT MAX(occurred_at) AS latest FROM metric_events WHERE source = 'fitness_drive'"
        ).fetchone()
        return _local_timestamp(row["latest"] if row else None, timezone_name)
    elif source in ("welltory", "rescuetime", "Welltory", "RescueTime"):
        db_source = "welltory" if source.lower() == "welltory" else "rescuetime"
        row = conn.execute(
            "SELECT MAX(occurred_at) AS latest FROM metric_events WHERE source = ?", (db_source,)
        ).fetchone()
        return _local_timestamp(row["latest"] if row else None, timezone_name)
    elif source in ("todoist", "Todoist"):
        row = conn.execute(
            """
            SELECT MAX(recorded_at) AS latest
            FROM (
                SELECT completed_at AS recorded_at FROM completed_tasks WHERE source = 'todoist'
                UNION ALL
                SELECT created_at AS recorded_at FROM created_tasks WHERE source = 'todoist'
                UNION ALL
                SELECT deleted_at AS recorded_at FROM deleted_tasks WHERE source = 'todoist'
            )
            """
        ).fetchone()
        return _local_timestamp(row["latest"] if row else None, timezone_name)
    elif source in ("diary", "Diary"):
        row = conn.execute(
            "SELECT MAX(logical_date) AS latest FROM journal_entries"
        ).fetchone()
        return row["latest"] if row else None
    return None


def display_timestamp(value: str | None) -> str:
    """Format an ISO date or timestamp for display, or indicate missing records."""
    if not value:
        return "no records"
    if len(value) == 10:
        return date.fromisoformat(value).strftime("%d/%m/%Y")
    return datetime.fromisoformat(value).strftime("%d/%m/%Y %H:%M:%S")


def data_freshness(config: Config, now: datetime | None = None) -> dict[str, object]:
    """Return the latest stored record time for every supported data source."""
    timezone = ZoneInfo(config.timezone)
    current = now or datetime.now(timezone)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone)
    current = current.astimezone(timezone)

    with connect(config.database) as conn:
        metric_latest = {
            row["source"]: _local_timestamp(row["latest"], config.timezone)
            for row in conn.execute(
                "SELECT source, MAX(occurred_at) AS latest FROM metric_events GROUP BY source"
            )
        }
        todoist_latest = conn.execute(
            """
            SELECT MAX(recorded_at) AS latest
            FROM (
                SELECT completed_at AS recorded_at FROM completed_tasks WHERE source = 'todoist'
                UNION ALL
                SELECT created_at AS recorded_at FROM created_tasks WHERE source = 'todoist'
                UNION ALL
                SELECT deleted_at AS recorded_at FROM deleted_tasks WHERE source = 'todoist'
            )
            """
        ).fetchone()["latest"]
        diary_latest = conn.execute(
            "SELECT MAX(logical_date) AS latest FROM journal_entries"
        ).fetchone()["latest"]

    return {
        "reported_at": current.isoformat(timespec="seconds"),
        "sources": {
            FITNESS_DRIVE_LABEL: metric_latest.get("fitness_drive"),
            "Welltory": metric_latest.get("welltory"),
            "RescueTime": metric_latest.get("rescuetime"),
            "Todoist": _local_timestamp(todoist_latest, config.timezone),
            "Diary": diary_latest,
        },
    }
