from __future__ import annotations

from datetime import date
from pathlib import Path
import argparse
import fcntl
import json
import sys

from .config import ensure_layout, load_config
from .db import connect, record_source_run, utc_now
from .fitness_drive import sync_fitness_drive
from .importers import import_fitness_drive


def _days(start: date, end: date):
    current = start
    from datetime import timedelta
    while current <= end:
        yield current
        current += timedelta(days=1)


def _record(config, start: date, end: date, status: str, started_at: str, details: dict):
    with connect(config.database) as conn:
        for day in _days(start, end):
            record_source_run(
                conn,
                source="bracelet",
                logical_date=day.isoformat(),
                status=status,
                started_at=started_at,
                details=details,
            )


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
        try:
            sync = sync_fitness_drive(config, start, end)
            if sync.get("skipped_not_configured"):
                raise RuntimeError("Google Drive fitness folder is not configured")
            if sync.get("skipped_not_authorized"):
                raise RuntimeError("Google Drive is not authorized")
            imported = import_fitness_drive(config)
            response = {
                "from": start.isoformat(),
                "to": end.isoformat(),
                "filesFound": sync.get("files", 0),
                "downloaded": sync.get("downloaded", 0),
                "changedFiles": sync.get("changed_files", 0),
                "missingFiles": sync.get("missing_files", 0),
                "records": imported.get("records", 0),
                "metrics": imported.get("metrics", 0),
                "affectedDates": imported.get("affected_dates", []),
            }
            run_status = "partial" if response["missingFiles"] else "success"
            _record(
                config,
                start,
                end,
                run_status,
                started_at,
                {
                    "filesFound": response["filesFound"],
                    "changedFiles": response["changedFiles"],
                    "missingFiles": response["missingFiles"],
                },
            )
        except Exception as exc:
            _record(config, start, end, "failed", started_at, {"errorType": type(exc).__name__})
            print(f"{type(exc).__name__}: fitness synchronization failed", file=sys.stderr)
            return 1
    print(json.dumps(response, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
