from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import sqlite3

from .collectors import logical_window
from .config import Config
from .db import connect


KEY_METRICS = [
    ("welltory.Stress(HRV)", "Stress (HRV)"),
    ("welltory.Energy(HRV)", "Energy (HRV)"),
    ("welltory.Focus", "Focus"),
    ("welltory.Measurement HR", "Measurement HR"),
    ("welltory.SDNN", "SDNN"),
    ("welltory.rMSSD", "rMSSD"),
]

RESCUETIME_PRODUCTIVITY_LABELS = {
    "-2": "Distracting",
    "-1": "Personal",
    "0": "Neutral",
    "1": "Other Work",
    "2": "Focus Work",
}


def default_report_day(config: Config) -> date:
    from zoneinfo import ZoneInfo

    now = datetime.now(ZoneInfo(config.timezone))
    logical_today = (now - timedelta(hours=config.day_boundary_hour)).date()
    return logical_today - timedelta(days=1)


def _format_number(value: float | None) -> str:
    if value is None:
        return "—"
    return f"{value:.1f}".rstrip("0").rstrip(".")


def generate_report(config: Config, day: date) -> Path:
    start, end = logical_window(day, config)
    start_utc = start.astimezone(timezone.utc).isoformat()
    end_utc = end.astimezone(timezone.utc).isoformat()
    lines = [
        f"# Daily life report — {day.isoformat()}",
        "",
        f"Window: {start.isoformat()} → {end.isoformat()}",
        "",
        "## Body",
        "",
    ]
    with connect(config.database) as conn:
        found_body = False
        for metric, label in KEY_METRICS:
            row = conn.execute(
                """
                SELECT AVG(value_num) AS avg_value, MIN(value_num) AS min_value,
                       MAX(value_num) AS max_value, COUNT(*) AS samples,
                       MAX(unit) AS unit
                FROM metric_events
                WHERE metric = ? AND occurred_at >= ? AND occurred_at < ?
                      AND value_num IS NOT NULL
                """,
                (metric, start_utc, end_utc),
            ).fetchone()
            if row["samples"]:
                found_body = True
                unit = row["unit"] or ""
                suffix = f" {unit}" if unit else ""
                lines.append(
                    f"- {label}: avg {_format_number(row['avg_value'])}{suffix} "
                    f"(range {_format_number(row['min_value'])}–{_format_number(row['max_value'])}, "
                    f"{row['samples']} measurement(s))"
                )
        if not found_body:
            lines.append("- No Welltory or health measurements imported for this day.")

        lines.extend(["", "## Fitness tracker (Google Drive)", ""])
        def source_for(drive_metric: str, *, like: bool = False) -> tuple[str, str]:
            operator = "LIKE" if like else "="
            has_drive = conn.execute(
                f"""
                SELECT EXISTS(
                    SELECT 1 FROM metric_events
                    WHERE source = 'fitness_drive' AND metric {operator} ?
                          AND occurred_at >= ? AND occurred_at < ?
                )
                """,
                (drive_metric, start_utc, end_utc),
            ).fetchone()[0]
            return (
                ("fitness_drive", "fitness_drive")
                if has_drive
                else ("health_sync", "health_sync")
            )

        steps_source, steps_prefix = source_for("fitness_drive.steps")
        steps = conn.execute(
            f"""
            SELECT SUM(value_num) AS total FROM metric_events
            WHERE source = ? AND metric = '{steps_prefix}.steps'
                  AND occurred_at >= ? AND occurred_at < ?
            """,
            (steps_source, start_utc, end_utc),
        ).fetchone()["total"]
        heart_source, heart_prefix = source_for("fitness_drive.heart_rate")
        heart_rate = conn.execute(
            f"""
            SELECT AVG(value_num) AS avg_value, MIN(value_num) AS min_value,
                   MAX(value_num) AS max_value, COUNT(*) AS samples
            FROM metric_events
            WHERE source = ? AND metric = '{heart_prefix}.heart_rate'
                  AND occurred_at >= ? AND occurred_at < ?
            """,
            (heart_source, start_utc, end_utc),
        ).fetchone()
        sleep_source, sleep_prefix = source_for("fitness_drive.sleep.%_seconds", like=True)
        sleep = conn.execute(
            f"""
            SELECT SUM(value_num) AS seconds FROM metric_events
            WHERE source = ? AND metric LIKE '{sleep_prefix}.sleep.%_seconds'
                  AND occurred_at >= ? AND occurred_at < ?
            """,
            (sleep_source, start_utc, end_utc),
        ).fetchone()["seconds"]
        if steps is not None:
            lines.append(f"- Steps: {_format_number(steps)}")
        if heart_rate["samples"]:
            lines.append(
                f"- Heart rate: avg {_format_number(heart_rate['avg_value'])} bpm "
                f"(range {_format_number(heart_rate['min_value'])}–{_format_number(heart_rate['max_value'])}, "
                f"{heart_rate['samples']} samples)"
            )
        if sleep is not None:
            lines.append(f"- Sleep stages recorded: {sleep / 3600:.2f} h")
        if steps is None and not heart_rate["samples"] and sleep is None:
            lines.append("- No Google Drive fitness export imported for this day.")

        lines.extend(["", "## Digital activity", ""])
        activity = conn.execute(
            """
            SELECT metric, SUM(value_num) AS seconds
            FROM metric_events
            WHERE source = 'rescuetime' AND occurred_at >= ? AND occurred_at < ?
            GROUP BY metric ORDER BY seconds DESC
            """,
            (start_utc, end_utc),
        ).fetchall()
        if activity:
            for row in activity[:12]:
                label = row["metric"].split(".", 3)[-1]
                if row["metric"].startswith("rescuetime.seconds.productivity."):
                    label = RESCUETIME_PRODUCTIVITY_LABELS.get(label, label)
                lines.append(f"- {label}: {row['seconds'] / 3600:.2f} h")
        else:
            lines.append("- RescueTime data not collected yet.")

        lines.extend(["", "## Completed tasks", ""])
        tasks = conn.execute(
            """
            SELECT content, completed_at FROM completed_tasks
            WHERE completed_at >= ? AND completed_at < ?
            ORDER BY completed_at
            """,
            (start_utc, end_utc),
        ).fetchall()
        if tasks:
            lines.extend(f"- {row['content']}" for row in tasks)
        else:
            lines.append("- No Todoist completions collected yet.")

        lines.extend(["", "## Active tasks added", ""])
        added_tasks = conn.execute(
            """
            SELECT content FROM created_tasks
            WHERE created_at >= ? AND created_at < ? ORDER BY created_at
            """,
            (start_utc, end_utc),
        ).fetchall()
        if added_tasks:
            lines.extend(f"- {row['content']}" for row in added_tasks)
        else:
            lines.append("- No newly added active Todoist tasks collected yet.")

        lines.extend(["", "## Diary", ""])
        journal = conn.execute(
            "SELECT content FROM journal_entries WHERE logical_date = ?", (day.isoformat(),)
        ).fetchone()
        if journal:
            # Keep reports and automation summaries safe to share.  The full entry
            # remains in the local database, but is intentionally not echoed here.
            character_count = len(journal["content"].strip())
            lines.append(f"- Entry imported ({character_count} characters; kept private in the local database).")
        else:
            lines.append("_No diary entry imported._")

        lines.extend(["", "## Data quality", ""])
        sources = conn.execute(
            """
            SELECT source, COUNT(*) AS count FROM metric_events
            WHERE occurred_at >= ? AND occurred_at < ? GROUP BY source
            """,
            (start_utc, end_utc),
        ).fetchall()
        if sources:
            lines.extend(f"- {row['source']}: {row['count']} metric rows" for row in sources)
        else:
            lines.append("- No metric rows in this logical-day window.")

    config.reports.mkdir(parents=True, exist_ok=True)
    destination = config.reports / f"{day.isoformat()}.md"
    destination.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    return destination
