from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import json
import sqlite3


SCHEMA = """
CREATE TABLE IF NOT EXISTS metric_events (
    id INTEGER PRIMARY KEY,
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    metric TEXT NOT NULL,
    value_num REAL,
    value_text TEXT,
    unit TEXT,
    payload_json TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    UNIQUE(source, external_id, metric)
);
CREATE INDEX IF NOT EXISTS idx_metric_time ON metric_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_metric_name ON metric_events(metric);

CREATE TABLE IF NOT EXISTS completed_tasks (
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    content TEXT NOT NULL,
    project_id TEXT,
    completed_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    PRIMARY KEY(source, external_id, completed_at)
);
CREATE INDEX IF NOT EXISTS idx_task_time ON completed_tasks(completed_at);

CREATE TABLE IF NOT EXISTS created_tasks (
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    content TEXT NOT NULL,
    project_id TEXT,
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    PRIMARY KEY(source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_created_task_time ON created_tasks(created_at);

CREATE TABLE IF NOT EXISTS journal_entries (
    logical_date TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    source_path TEXT NOT NULL,
    imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_files (
    path TEXT PRIMARY KEY,
    sha256 TEXT NOT NULL,
    source TEXT NOT NULL,
    imported_at TEXT NOT NULL
);
"""


@contextmanager
def connect(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def insert_metric(
    conn: sqlite3.Connection,
    *,
    source: str,
    external_id: str,
    occurred_at: str,
    metric: str,
    value_num: float | None,
    value_text: str | None,
    unit: str | None,
    payload: object,
) -> bool:
    cursor = conn.execute(
        """
        INSERT OR IGNORE INTO metric_events
        (source, external_id, occurred_at, metric, value_num, value_text, unit,
         payload_json, imported_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            source,
            external_id,
            occurred_at,
            metric,
            value_num,
            value_text,
            unit,
            json.dumps(payload, ensure_ascii=False, sort_keys=True),
            utc_now(),
        ),
    )
    return cursor.rowcount == 1
