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

CREATE TABLE IF NOT EXISTS ema_events (
    event_id TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    scheduled_at TEXT NOT NULL,
    answered_at TEXT,
    status TEXT NOT NULL,
    origin_file TEXT,
    mood INTEGER,
    energy INTEGER,
    focus INTEGER,
    stress INTEGER,
    activity TEXT,
    activity_label TEXT,
    note TEXT,
    payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ema_scheduled_at ON ema_events(scheduled_at);

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

CREATE TABLE IF NOT EXISTS deleted_tasks (
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    content TEXT NOT NULL,
    project_id TEXT,
    deleted_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    PRIMARY KEY(source, external_id, deleted_at)
);
CREATE INDEX IF NOT EXISTS idx_deleted_task_time ON deleted_tasks(deleted_at);

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
    imported_at TEXT NOT NULL,
    remote_id TEXT,
    remote_name TEXT,
    remote_modified_at TEXT,
    remote_status TEXT NOT NULL DEFAULT 'available',
    last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS source_runs (
    id INTEGER PRIMARY KEY,
    source TEXT NOT NULL,
    logical_date TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    details_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_source_run_day
    ON source_runs(logical_date, source, finished_at);
"""


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, declaration: str) -> None:
    """Add one nullable/defaulted column when opening an older database."""
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {declaration}")


def _migrate(conn: sqlite3.Connection) -> None:
    """Apply additive, transaction-safe schema migrations."""
    _ensure_column(conn, "metric_events", "origin_file", "TEXT")
    _ensure_column(conn, "import_files", "remote_id", "TEXT")
    _ensure_column(conn, "import_files", "remote_name", "TEXT")
    _ensure_column(conn, "import_files", "remote_modified_at", "TEXT")
    _ensure_column(conn, "import_files", "remote_status", "TEXT NOT NULL DEFAULT 'available'")
    _ensure_column(conn, "import_files", "last_seen_at", "TEXT")
    _ensure_column(conn, "ema_events", "mood", "INTEGER")
    _ensure_column(conn, "ema_events", "energy", "INTEGER")
    _ensure_column(conn, "ema_events", "focus", "INTEGER")
    _ensure_column(conn, "ema_events", "stress", "INTEGER")
    _ensure_column(conn, "ema_events", "activity", "TEXT")
    _ensure_column(conn, "ema_events", "note", "TEXT")
    _ensure_column(conn, "ema_events", "schema_version", "INTEGER")
    _ensure_column(conn, "ema_events", "activity_label", "TEXT")
    _ensure_column(conn, "ema_events", "payload_json", "TEXT")
    conn.execute("UPDATE ema_events SET schema_version = 1 WHERE schema_version IS NULL")
    conn.execute("UPDATE ema_events SET payload_json = '{}' WHERE payload_json IS NULL")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_metric_origin_file ON metric_events(origin_file)"
    )


@contextmanager
def connect(path: Path):
    """Initialize and yield a database connection, commit on success, and always close it."""
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    _migrate(conn)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def utc_now() -> str:
    """Return the current timezone-aware UTC timestamp in ISO format."""
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
    origin_file: str | None = None,
) -> bool:
    """Insert a metric unless its source identity exists; return whether it was added."""
    cursor = conn.execute(
        """
        INSERT OR IGNORE INTO metric_events
        (source, external_id, occurred_at, metric, value_num, value_text, unit,
         payload_json, imported_at, origin_file)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            origin_file,
        ),
    )
    return cursor.rowcount == 1


def record_source_run(
    conn: sqlite3.Connection,
    *,
    source: str,
    logical_date: str,
    status: str,
    started_at: str,
    details: object | None = None,
) -> None:
    """Record one source attempt without storing source payload contents."""
    conn.execute(
        """
        INSERT INTO source_runs
        (source, logical_date, status, started_at, finished_at, details_json)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            source,
            logical_date,
            status,
            started_at,
            utc_now(),
            json.dumps(details or {}, ensure_ascii=False, sort_keys=True),
        ),
    )
