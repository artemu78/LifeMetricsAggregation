from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path
from zoneinfo import ZoneInfo


def file_hash(path: Path) -> str:
    """Compute a file SHA-256 digest in bounded chunks for import change detection."""
    digest = sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def as_utc_iso(value: str, timezone_name: str) -> str:
    """Normalize timestamps to UTC using the supplied zone for naive values."""
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=ZoneInfo(timezone_name))
    return parsed.astimezone(UTC).isoformat()
