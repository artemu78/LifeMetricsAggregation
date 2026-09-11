"""Read dated diary sections directly through the existing read-only Drive login."""
from __future__ import annotations

from datetime import datetime
import re

from .config import Config
from .db import connect, utc_now
from .fitness_drive import GoogleDriveReader


DATE_HEADING = re.compile(r"^(?:#{1,6}\s+)?(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})\s*$")


def parse_diary(text: str) -> dict[str, str]:
    """Parse dated sections, combine repeated dates, and reject missing or invalid headings."""
    entries: dict[str, list[str]] = {}
    current = None
    for line in text.lstrip('\ufeff').splitlines():
        match = DATE_HEADING.fullmatch(line.strip())
        if match:
            value = match.group(1)
            try:
                current = datetime.strptime(value, '%Y-%m-%d' if '-' in value else '%d.%m.%Y').date().isoformat()
            except ValueError:
                raise ValueError('Diary contains an invalid date heading.') from None
            entries.setdefault(current, [])
        elif current is not None:
            entries[current].append(line)
    if not entries:
        raise ValueError('Diary has no recognized date headings; expected D.M.YYYY or YYYY-MM-DD on separate lines.')
    return {day: '\n'.join(lines).strip() for day, lines in entries.items() if '\n'.join(lines).strip()}


def sync_diary_drive(config: Config, *, reader=None) -> dict[str, int]:
    """Export the configured diary and reconcile its entries after successful parsing."""
    if not config.diary_google_doc_id:
        return {'skipped_not_configured': 1}
    reader = reader if reader is not None else GoogleDriveReader(config)
    # Google Workspace documents require export_media, not get_media.
    payload = reader.service.files().export_media(
        fileId=config.diary_google_doc_id, mimeType='text/plain'
    ).execute()
    entries = parse_diary(payload.decode('utf-8-sig'))
    source = f'https://docs.google.com/document/d/{config.diary_google_doc_id}/edit'
    with connect(config.database) as conn:
        # Reconcile only entries owned by this document. Fetch/parse failures
        # above leave the last successful import intact.
        conn.execute('DELETE FROM journal_entries WHERE source_path = ?', (source,))
        conn.executemany(
            '''INSERT INTO journal_entries(logical_date, content, source_path, imported_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(logical_date) DO UPDATE SET content=excluded.content,
                   source_path=excluded.source_path, imported_at=excluded.imported_at''',
            [(day, content, source, utc_now()) for day, content in entries.items()],
        )
    return {'diary_entries': len(entries)}
