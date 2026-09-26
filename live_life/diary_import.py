from __future__ import annotations

import re

from .config import Config
from .db import connect, utc_now


def import_inbox(config: Config) -> dict[str, int]:
    """Import dated local diary files only when no Google Doc diary is configured."""
    diary_entries = 0
    with connect(config.database) as conn:
        diary_paths = (
            []
            if config.diary_google_doc_id
            else sorted((config.inbox / "diary").glob("*.md"))
        )
        for path in diary_paths:
            match = re.fullmatch(r"(\d{4}-\d{2}-\d{2})", path.stem)
            if not match:
                continue
            conn.execute(
                """
                INSERT INTO journal_entries
                    (logical_date, content, source_path, imported_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(logical_date) DO UPDATE SET content=excluded.content,
                    source_path=excluded.source_path, imported_at=excluded.imported_at
                """,
                (
                    match.group(1),
                    path.read_text(encoding="utf-8"),
                    str(path),
                    utc_now(),
                ),
            )
            diary_entries += 1
    return {"diary_entries": diary_entries}
