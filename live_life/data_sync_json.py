from __future__ import annotations

from datetime import date, timedelta
import json
import sys

from .collectors import collect_rescuetime, collect_todoist
from .config import load_config
from .db import connect, record_source_run
from .fitness_drive import sync_fitness_drive
from .drive_recovery import issue, report_failure, log_event, RECONNECT_STEPS
from .freshness import display_timestamp, get_source_latest
from .importers import import_fitness_drive, import_welltory
from .sync_worker import InvalidDateRange, sync_worker


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
    if statuses and all(status == "failed" for status in statuses):
        return "failed"
    if "failed" in statuses:
        return "partial"
    if statuses and all(status == "not_run" for status in statuses):
        return "not_run"
    if "partial" in statuses or "not_run" in statuses:
        return "partial"
    return "success"


def _sync_bracelet(config, start: date, end: date, started_at: str) -> dict:
    problem = None
    log_event(config, "started", stage="sync", fromDate=start.isoformat(), toDate=end.isoformat())
    try:
        sync = sync_fitness_drive(config, start, end)
        unavailable = sync.get("skipped_not_configured") or sync.get("skipped_not_authorized")
        if unavailable:
            status = "not_run"
            records = 0
            problem = (issue("GOOGLE_DRIVE_NOT_CONFIGURED", "Папка экспортов браслета не настроена.", "configure", ["Укажите GOOGLE_DRIVE_FOLDER_ID в .env: это идентификатор папки с экспортами Reva Health Exporter в Google Drive."])
                       if sync.get("skipped_not_configured") else issue("GOOGLE_RECONNECT_REQUIRED", "Подключите Google Drive.", "reconnect", RECONNECT_STEPS))
            details = {"unavailable": True, "issue": problem}
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
        problem = report_failure(config, exc)
        details = {"errorType": type(exc).__name__, "issue": problem}
    for day in _days(start, end):
        _record(config, "bracelet", day, status, started_at, details)
    log_event(config, "finished", stage="sync", status=status, records=records)
    return {"source": "bracelet", "status": status, "records": records, **({"issue": problem} if problem else {})}


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
                records += (
                    int(result.get("created", 0))
                    + int(result.get("completed", 0))
                    + int(result.get("deleted", 0))
                )
            details = result
        except Exception as exc:
            status = "failed"
            details = {"errorType": type(exc).__name__}
            print(f"{type(exc).__name__}: {source} collection failed for {day}", file=sys.stderr)
        statuses.append(status)
        _record(config, source, day, status, started_at, details)
    return {"source": source, "status": _summary_status(statuses), "records": records}


def main(argv: list[str] | None = None) -> int:
    try:
        with sync_worker(argv, load_config) as ctx:
            config, start, end, started_at = ctx
            sources = []

            def run_source(source_name: str, fn):
                res = fn()
                sources.append(res)
                if ctx.progress:
                    with connect(config.database) as conn:
                        latest = get_source_latest(conn, config.timezone, source_name)
                    if res["status"] == "failed":
                        display = "ошибка"
                    elif res["status"] == "not_run" and not latest:
                        display = "недоступен"
                    elif latest:
                        display = display_timestamp(latest)
                    else:
                        display = "нет записей"
                    progress_event = {
                        "type": "progress",
                        "source": source_name,
                        "status": res["status"],
                        "records": res["records"],
                        "latest": latest,
                        "display": display,
                    }
                    if res.get("issue"):
                        progress_event["issue"] = res["issue"]
                    print(json.dumps(progress_event, ensure_ascii=False), flush=True)
                return res

            run_source("bracelet", lambda: _sync_bracelet(config, start, end, started_at))
            run_source("welltory", lambda: _sync_welltory(config, start, end, started_at))
            run_source("rescuetime", lambda: _sync_collector(config, "rescuetime", collect_rescuetime, start, end, started_at))
            run_source("todoist", lambda: _sync_collector(config, "todoist", collect_todoist, start, end, started_at))
    except InvalidDateRange:
        print("INVALID_DATE_RANGE", file=sys.stderr)
        return 2
    except BlockingIOError:
        print("SYNC_ALREADY_RUNNING", file=sys.stderr)
        return 75

    final_payload = {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "sources": sources,
    }
    if ctx.progress:
        final_payload["type"] = "complete"
    print(json.dumps(final_payload, ensure_ascii=False, separators=(",", ":")), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
