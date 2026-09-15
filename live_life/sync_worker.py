from __future__ import annotations

from contextlib import contextmanager
from datetime import date
from pathlib import Path
import argparse
import fcntl

from .config import ensure_layout
from .db import utc_now


class InvalidDateRange(ValueError):
    pass


@contextmanager
def sync_worker(argv: list[str] | None, load_config):
    """Validate a date range and hold the shared synchronization lock."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="from_date", required=True)
    parser.add_argument("--to", dest="to_date", required=True)
    args = parser.parse_args(argv)
    try:
        start = date.fromisoformat(args.from_date)
        end = date.fromisoformat(args.to_date)
    except ValueError as exc:
        raise InvalidDateRange from exc
    if end < start:
        raise InvalidDateRange

    config = load_config()
    ensure_layout(config)
    lock_path = Path(config.root) / "data" / ".fitness-sync.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield config, start, end, utc_now()
