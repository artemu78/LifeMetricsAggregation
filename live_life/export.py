from __future__ import annotations

from csv import DictWriter
from datetime import date, datetime, timedelta
import json
from pathlib import Path
from zoneinfo import ZoneInfo

from .config import Config
from .db import connect


FIELDNAMES = (
    "occurred_at",
    "activity_name",
    "productivity_level",
    "seconds",
    "category",
)


def export_rescuetime(config: Config, start: date, end: date, output_dir: Path) -> dict[str, int]:
    """Export raw RescueTime interval rows into one chronological CSV per day."""
    if end < start:
        raise ValueError("end must be on or after start")
    output_dir.mkdir(parents=True, exist_ok=True)
    tz = ZoneInfo(config.timezone)
    system_tz = datetime.now().astimezone().tzinfo
    files = rows = 0

    with connect(config.database) as conn:
        current = start
        while current <= end:
            window_start = datetime.combine(current, datetime.min.time(), tzinfo=tz).replace(
                hour=config.day_boundary_hour
            )
            window_end = window_start + timedelta(days=1)
            csv_path = output_dir / f"rescuetime_{current.isoformat()}.csv"
            query = conn.execute(
                """
                SELECT occurred_at, metric, value_num, external_id, payload_json
                FROM metric_events
                WHERE source = 'rescuetime'
                  AND metric LIKE 'rescuetime.seconds.activity.%'
                  AND occurred_at >= ? AND occurred_at < ?
                ORDER BY occurred_at, id
                """,
                (window_start.astimezone(ZoneInfo("UTC")).isoformat(),
                 window_end.astimezone(ZoneInfo("UTC")).isoformat()),
            )
            with csv_path.open("w", newline="", encoding="utf-8") as handle:
                writer = DictWriter(handle, fieldnames=FIELDNAMES)
                writer.writeheader()
                for row in query:
                    parts = row["metric"].split(".", 3)
                    name = parts[3] if len(parts) > 3 else ""
                    payload = json.loads(row["payload_json"])
                    occurred_at = datetime.fromisoformat(row["occurred_at"]).astimezone(system_tz)
                    writer.writerow({
                        "occurred_at": occurred_at.isoformat(),
                        "activity_name": name,
                        "productivity_level": payload.get("Productivity", ""),
                        "seconds": row["value_num"],
                        "category": payload.get("Category", ""),
                    })
                    rows += 1
            files += 1
            current += timedelta(days=1)
    return {"files": files, "rows": rows}
