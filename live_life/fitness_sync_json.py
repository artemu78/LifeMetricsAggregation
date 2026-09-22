from __future__ import annotations

from datetime import date
import json
import sys

from .config import load_config
from .db import connect, record_source_run
from .fitness_drive import sync_fitness_drive
from .drive_recovery import report_failure
from .importers import import_fitness_drive
from .sync_worker import InvalidDateRange, sync_worker


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
    try:
        with sync_worker(argv, load_config) as (config, start, end, started_at):
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
                _record(config, start, end, "failed", started_at, {"errorType": type(exc).__name__, "issue": report_failure(config, exc)})
                print(f"{type(exc).__name__}: fitness synchronization failed", file=sys.stderr)
                return 1
    except InvalidDateRange:
        print("INVALID_DATE_RANGE", file=sys.stderr)
        return 2
    except BlockingIOError:
        print("SYNC_ALREADY_RUNNING", file=sys.stderr)
        return 75
    print(json.dumps(response, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
