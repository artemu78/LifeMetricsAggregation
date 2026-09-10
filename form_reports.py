#!/usr/bin/env python3
"""Regenerate the latest report and fill every report through today."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path
from collections.abc import Callable
from typing import Any
import re
import sys
from zoneinfo import ZoneInfo

from live_life.collectors import collect_rescuetime, collect_todoist
from live_life.config import Config, ensure_layout, load_config
from live_life.db import connect
from live_life.diary_drive import sync_diary_drive
from live_life.fitness_drive import sync_fitness_drive
from live_life.importers import import_fitness_drive, import_inbox, import_welltory
from live_life.report import generate_report


REPORT_NAME = re.compile(r"^(\d{4}-\d{2}-\d{2})\.md$")


class SourceApprovalRequired(RuntimeError):
    """Raised when reports would be generated from incomplete source updates."""

    def __init__(self, issues: list[str], *, denied: bool = False):
        heading = (
            "Update cancelled because approval was not granted."
            if denied
            else "Human approval is required because some data sources are unavailable."
        )
        details = "\n".join(f"- {issue}" for issue in issues)
        super().__init__(f"{heading}\n{details}")
        self.issues = issues


def _source_result(
    name: str,
    action: Callable[[], dict[str, Any]],
    issues: list[str],
) -> dict[str, Any]:
    """Run one update stage and turn external failures into approval issues."""
    try:
        return action()
    except Exception as exc:  # Source boundaries can raise several client-library errors.
        message = f"{name} failed: {type(exc).__name__}: {exc}"
        issues.append(message)
        return {"error": message}


def _add_skip_issue(
    issues: list[str], result: dict[str, Any], flag: str, message: str
) -> None:
    if result.get(flag) and message not in issues:
        issues.append(message)


def prompt_for_approval(issues: list[str]) -> bool:
    """Explain unavailable sources and require an explicit interactive yes."""
    print("\nSome data sources are unavailable:", file=sys.stderr)
    for issue in issues:
        print(f"- {issue}", file=sys.stderr)
    if not sys.stdin.isatty():
        print(
            "Cannot request approval in a non-interactive run. "
            "Run python3 form_reports.py in a terminal.",
            file=sys.stderr,
        )
        return False
    try:
        answer = input("Continue and generate reports with partial data? [y/N] ")
    except (EOFError, KeyboardInterrupt):
        print(file=sys.stderr)
        return False
    return answer.strip().lower() in {"y", "yes"}


def latest_report_day(reports: Path) -> date:
    """Return the newest date represented by a daily Markdown report."""
    days = [
        date.fromisoformat(match.group(1))
        for path in reports.iterdir()
        if path.is_file() and (match := REPORT_NAME.fullmatch(path.name))
    ]
    if not days:
        raise RuntimeError(
            f"No existing YYYY-MM-DD.md report found in {reports}; "
            "create the first report with `python3 -m live_life report --date YYYY-MM-DD`."
        )
    return max(days)


def inclusive_days(start: date, end: date):
    if start > end:
        raise RuntimeError(
            f"Latest report {start.isoformat()} is after today {end.isoformat()}."
        )
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def _local_timestamp(value: str | None, timezone_name: str) -> str | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=ZoneInfo(timezone_name))
    return parsed.astimezone(ZoneInfo(timezone_name)).isoformat(timespec="seconds")


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
            )
            """
        ).fetchone()["latest"]
        diary_latest = conn.execute(
            "SELECT MAX(logical_date) AS latest FROM journal_entries"
        ).fetchone()["latest"]

    local_health = max(
        filter(None, (metric_latest.get("health_sync"), metric_latest.get("health_drop"))),
        default=None,
    )
    return {
        "reported_at": current.isoformat(timespec="seconds"),
        "sources": {
            "Fitness bracelet (Google Drive)": metric_latest.get("fitness_drive"),
            "Welltory": metric_latest.get("welltory"),
            "RescueTime": metric_latest.get("rescuetime"),
            "Todoist": _local_timestamp(todoist_latest, config.timezone),
            "Diary": diary_latest,
            "Local health inbox": local_health,
        },
    }


def format_data_freshness(summary: dict[str, object]) -> str:
    """Render a compact, value-free freshness report for terminal output."""
    lines = [f"Data freshness — {summary['reported_at']}"]
    sources = summary["sources"]
    assert isinstance(sources, dict)
    for source, latest in sources.items():
        lines.append(f"- {source}: {latest or 'no records'}")
    return "\n".join(lines)


def form_reports(
    config: Config,
    today: date | None = None,
    approve_unavailable: Callable[[list[str]], bool] | None = None,
) -> dict[str, object]:
    """Refresh shared inputs, collect each day, and overwrite its report."""
    ensure_layout(config)
    with connect(config.database):
        pass

    today = today or datetime.now(ZoneInfo(config.timezone)).date()
    start = latest_report_day(config.reports)
    issues: list[str] = []
    drive_sync = _source_result(
        "Fitness bracelet / Google Drive",
        lambda: sync_fitness_drive(config, start, today),
        issues,
    )
    _add_skip_issue(
        issues,
        drive_sync,
        "skipped_not_configured",
        "Fitness bracelet / Google Drive is not configured.",
    )
    _add_skip_issue(
        issues,
        drive_sync,
        "skipped_not_authorized",
        "Fitness bracelet / Google Drive is not authorized or its support is unavailable.",
    )
    drive_import = _source_result(
        "Fitness bracelet cache import", lambda: import_fitness_drive(config), issues
    )

    welltory_paths = sorted(config.welltory_downloads.glob(config.welltory_pattern))
    if not welltory_paths:
        issues.append(
            f"Welltory export is missing: no {config.welltory_pattern} file in "
            f"{config.welltory_downloads}."
        )
    welltory = _source_result(
        "Welltory import", lambda: import_welltory(config, welltory_paths), issues
    )
    inbox = _source_result("Local inbox import", lambda: import_inbox(config), issues)

    diary = _source_result("Diary / Google Drive", lambda: sync_diary_drive(config), issues)

    result: dict[str, object] = {
        "from": start.isoformat(),
        "to": today.isoformat(),
        "diary": diary,
        "fitness_drive_sync": drive_sync,
        "fitness_drive": drive_import,
        "welltory": welltory,
        "inbox": inbox,
        "days": [],
    }
    days = result["days"]
    assert isinstance(days, list)
    rescuetime_available = True
    todoist_available = True
    for day in inclusive_days(start, today):
        if rescuetime_available:
            rescuetime = _source_result(
                f"RescueTime ({day.isoformat()})",
                lambda day=day: collect_rescuetime(config, day),
                issues,
            )
            _add_skip_issue(
                issues,
                rescuetime,
                "skipped_no_token",
                "RescueTime token is missing.",
            )
            rescuetime_available = not (
                rescuetime.get("error") or rescuetime.get("skipped_no_token")
            )
        else:
            rescuetime = {"skipped_after_source_failure": 1}

        if todoist_available:
            todoist = _source_result(
                f"Todoist ({day.isoformat()})",
                lambda day=day: collect_todoist(config, day),
                issues,
            )
            _add_skip_issue(
                issues,
                todoist,
                "skipped_no_token",
                "Todoist token is missing.",
            )
            todoist_available = not (
                todoist.get("error") or todoist.get("skipped_no_token")
            )
        else:
            todoist = {"skipped_after_source_failure": 1}

        days.append(
            {
                "date": day.isoformat(),
                "rescuetime": rescuetime,
                "todoist": todoist,
            }
        )

    if issues:
        if approve_unavailable is None:
            raise SourceApprovalRequired(issues)
        if not approve_unavailable(issues):
            raise SourceApprovalRequired(issues, denied=True)

    for item in days:
        item["report"] = str(generate_report(config, date.fromisoformat(item["date"])))
    result["data_freshness"] = data_freshness(config)
    if issues:
        result["approved_unavailable_sources"] = issues
    return result


def main() -> int:
    root = Path(__file__).resolve().parent
    try:
        result = form_reports(
            load_config(root), approve_unavailable=prompt_for_approval
        )
    except SourceApprovalRequired as exc:
        print(f"\n{exc}", file=sys.stderr)
        return 2
    print(format_data_freshness(result["data_freshness"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
