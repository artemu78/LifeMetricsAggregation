from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
import argparse
import json
import sys

from .collectors import collect_rescuetime, collect_todoist
from .config import ensure_layout, load_config
from .db import connect
from .fitness_drive import authorize_fitness_drive, sync_fitness_drive
from .export import export_rescuetime
from .importers import import_fitness_drive, import_inbox, import_welltory
from .report import default_report_day, generate_report


def _day(value: str | None, config) -> date:
    return date.fromisoformat(value) if value else default_report_day(config)


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="live-life")
    sub = result.add_subparsers(dest="command", required=True)
    sub.add_parser("init-db")
    sub.add_parser("authorize-fitness-drive")
    drive_sync = sub.add_parser("sync-fitness-drive")
    drive_sync.add_argument("--from", dest="from_date")
    drive_sync.add_argument("--to", dest="to_date")
    welltory = sub.add_parser("import-welltory")
    welltory.add_argument("paths", nargs="*", type=Path)
    sub.add_parser("import-inbox")
    for name in ("collect-rescuetime", "collect-todoist", "report", "run-daily"):
        command = sub.add_parser(name)
        command.add_argument("--date")
    backfill = sub.add_parser("backfill")
    backfill.add_argument("--from", dest="from_date", required=True)
    backfill.add_argument("--to", dest="to_date", required=True)
    export = sub.add_parser("export-rescuetime")
    export.add_argument("--from", dest="from_date", required=True)
    export.add_argument("--to", dest="to_date")
    export.add_argument("--output-dir", type=Path, default=Path("data/rescuetime_export"))
    return result


def _date_range(start: date, end: date):
    if end < start:
        raise ValueError("--to must be on or after --from")
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    config = load_config()
    ensure_layout(config)
    with connect(config.database):
        pass
    if args.command == "init-db":
        print(config.database)
        return 0
    if args.command == "authorize-fitness-drive":
        print(authorize_fitness_drive(config))
        return 0
    if args.command == "sync-fitness-drive":
        start = date.fromisoformat(args.from_date) if args.from_date else default_report_day(config)
        end = date.fromisoformat(args.to_date) if args.to_date else start
        if end < start:
            raise ValueError("--to must be on or after --from")
        print(
            json.dumps(
                {
                    "sync": sync_fitness_drive(config, start, end),
                    "import": import_fitness_drive(config),
                },
                indent=2,
            )
        )
        return 0
    if args.command == "import-welltory":
        paths = args.paths or None
        print(json.dumps(import_welltory(config, paths), indent=2))
        return 0
    if args.command == "import-inbox":
        print(json.dumps(import_inbox(config), indent=2))
        return 0
    if args.command == "backfill":
        start = date.fromisoformat(args.from_date)
        end = date.fromisoformat(args.to_date)
        result = {
            "from": start.isoformat(),
            "to": end.isoformat(),
            "fitness_drive_sync": sync_fitness_drive(config, start, end),
            "fitness_drive": import_fitness_drive(config),
            "welltory": import_welltory(config),
            "inbox": import_inbox(config),
            "days": [],
        }
        for day in _date_range(start, end):
            result["days"].append(
                {
                    "date": day.isoformat(),
                    "rescuetime": collect_rescuetime(config, day),
                    "todoist": collect_todoist(config, day),
                    "report": str(generate_report(config, day)),
                }
            )
        print(json.dumps(result, indent=2))
        return 0
    if args.command == "export-rescuetime":
        start = date.fromisoformat(args.from_date)
        end = date.fromisoformat(args.to_date) if args.to_date else start
        print(json.dumps(export_rescuetime(config, start, end, args.output_dir), indent=2))
        return 0
    day = _day(args.date, config)
    if args.command == "collect-rescuetime":
        print(json.dumps(collect_rescuetime(config, day), indent=2))
    elif args.command == "collect-todoist":
        print(json.dumps(collect_todoist(config, day), indent=2))
    elif args.command == "report":
        print(generate_report(config, day))
    elif args.command == "run-daily":
        result = {
            "date": day.isoformat(),
            "fitness_drive_sync": sync_fitness_drive(config, day, day),
            "fitness_drive": import_fitness_drive(config),
            "welltory": import_welltory(config),
            "inbox": import_inbox(config),
            "rescuetime": collect_rescuetime(config, day),
            "todoist": collect_todoist(config, day),
        }
        result["report"] = str(generate_report(config, day))
        print(json.dumps(result, indent=2))
    return 0
