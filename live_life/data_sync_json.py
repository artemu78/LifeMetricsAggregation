from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
import argparse
import fcntl
import json
import sys

from .collectors import collect_rescuetime, collect_todoist
from .config import ensure_layout, load_config
from .db import connect, record_source_run, utc_now
from .fitness_drive import sync_fitness_drive
from .importers import import_fitness_drive, import_welltory


def _days(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def _record(config, source: str, day: date, status: str, started_at: str, details: dict):
    with connect(config.database) as conn:
        record_source_run(
            conn,
            source=source,
            logical_date=day.isoformat(),
            status=status,
            started_at=started_at,
            details=details,
        )


def _summary_status(statuses: list[str]) -> str:
    if "failed" in statuses:
        return "failed"
    if statuses and all(status == "not_run" for status in statuses):
        return "not_run"
    if "partial" in statuses or "not_run" in statuses:
        return "partial"
    return "success"


def _sync_bracelet(config, start: date, end: date, started_at: str) -> dict:
    try:
        sync = sync_fitness_drive(config, start, end)
        unavailable = sync.get("skipped_not_configured") or sync.get("skipped_not_authorized")
        if unavailable:
            status = "not_run"
            records = 0
            details = {"unavailable": True}
        else:
            imported = import_fitness_drive(config)
            status = "partial" if sync.get("missing_files") else "success"
            records = int(imported.get("metrics", 0))
            details = {
                "changedFiles": int(sync.get("changed_files", 0)),
                "missingFiles": int(sync.get("missing_files", 0)),
            }
    except Exception as exc:
        status = "failed"
        records = 0
        details = {"errorType": type(exc).__name__}
        print(f"{type(exc).__name__}: bracelet synchronization failed", file=sys.stderr)
    for day in _days(start, end):
        _record(config, "bracelet", day, status, started_at, details)
    return {"source": "bracelet", "status": status, "records": records}


def _sync_welltory(config, start: date, end: date, started_at: str) -> dict:
    paths = sorted(config.welltory_downloads.glob(config.welltory_pattern))
    try:
        result = import_welltory(config, paths) if paths else {"metrics": 0}
        status = "success" if paths else "not_run"
        records = int(result.get("metrics", 0))
        details = {"filesAvailable": len(paths)}
    except Exception as exc:
        status = "failed"
        records = 0
        details = {"errorType": type(exc).__name__}
        print(f"{type(exc).__name__}: Welltory import failed", file=sys.stderr)
    for day in _days(start, end):
        _record(config, "welltory", day, status, started_at, details)
    return {"source": "welltory", "status": status, "records": records}


def _sync_collector(config, source: str, collector, start: date, end: date, started_at: str) -> dict:
    statuses = []
    records = 0
    for day in _days(start, end):
        try:
            result = collector(config, day)
            status = "not_run" if any(
                value for key, value in result.items() if key.startswith("skipped_")
            ) else "success"
            if source == "rescuetime":
                records += int(result.get("events", 0))
            else:
                records += int(result.get("created", 0)) + int(result.get("completed", 0))
            details = result
        except Exception as exc:
            status = "failed"
            details = {"errorType": type(exc).__name__}
            print(f"{type(exc).__name__}: {source} collection failed for {day}", file=sys.stderr)
        statuses.append(status)
        _record(config, source, day, status, started_at, details)
    return {"source": source, "status": _summary_status(statuses), "records": records}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="from_date", required=True)
    parser.add_argument("--to", dest="to_date", required=True)
    args = parser.parse_args(argv)
    try:
        start = date.fromisoformat(args.from_date)
        end = date.fromisoformat(args.to_date)
    except ValueError:
        print("INVALID_DATE_RANGE", file=sys.stderr)
        return 2
    if end < start:
        print("INVALID_DATE_RANGE", file=sys.stderr)
        return 2

    config = load_config()
    ensure_layout(config)
    lock_path = Path(config.root) / "data" / ".fitness-sync.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("SYNC_ALREADY_RUNNING", file=sys.stderr)
            return 75
        started_at = utc_now()
        sources = [
            _sync_bracelet(config, start, end, started_at),
            _sync_welltory(config, start, end, started_at),
            _sync_collector(config, "rescuetime", collect_rescuetime, start, end, started_at),
            _sync_collector(config, "todoist", collect_todoist, start, end, started_at),
        ]
    print(json.dumps({
        "from": start.isoformat(),
        "to": end.isoformat(),
        "sources": sources,
    }, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
