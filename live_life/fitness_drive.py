from __future__ import annotations

from collections.abc import Iterable
from datetime import date, datetime, timedelta, timezone
from io import FileIO
from pathlib import Path
import json
import re

from .config import Config
from .db import connect


FOLDER_MIME_TYPE = "application/vnd.google-apps.folder"
FITNESS_MIME_TYPES = {"application/json", "application/gzip", "application/x-gzip"}
DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly"
SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def _google_modules():
    """Load Google client dependencies or raise an installation guidance error."""
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaIoBaseDownload
    except ImportError as exc:
        raise RuntimeError(
            "Google Drive support is not installed. Run `python3 -m pip install -e .`."
        ) from exc
    return Request, Credentials, InstalledAppFlow, build, MediaIoBaseDownload


def authorize_fitness_drive(config: Config) -> Path:
    """Run the one-time installed-app OAuth flow and persist a renewable token."""
    if not config.fitness_drive_client_secret or not config.fitness_drive_token:
        raise RuntimeError("Set GOOGLE_DRIVE_CLIENT_SECRET_FILE and GOOGLE_DRIVE_TOKEN_FILE in .env")
    if not config.fitness_drive_client_secret.exists():
        raise RuntimeError(
            f"Google OAuth client secret not found: {config.fitness_drive_client_secret}"
        )
    _, _, InstalledAppFlow, _, _ = _google_modules()
    flow = InstalledAppFlow.from_client_secrets_file(
        str(config.fitness_drive_client_secret), [DRIVE_READONLY_SCOPE]
    )
    credentials = flow.run_local_server(port=0)
    config.fitness_drive_token.parent.mkdir(parents=True, exist_ok=True)
    config.fitness_drive_token.write_text(credentials.to_json(), encoding="utf-8")
    return config.fitness_drive_token


class GoogleDriveReader:
    def __init__(self, config: Config):
        """Load and refresh saved credentials, then initialize the read-only Drive client."""
        Request, Credentials, _, build, media_downloader = _google_modules()
        if not config.fitness_drive_token or not config.fitness_drive_token.exists():
            raise RuntimeError(
                "Google Drive is not authorized. Run `python3 -m live_life authorize-fitness-drive`."
            )
        credentials = Credentials.from_authorized_user_file(
            str(config.fitness_drive_token), [DRIVE_READONLY_SCOPE]
        )
        if credentials.expired and credentials.refresh_token:
            credentials.refresh(Request())
            config.fitness_drive_token.write_text(credentials.to_json(), encoding="utf-8")
        if not credentials.valid:
            raise RuntimeError(
                "Google Drive authorization is invalid. Run `python3 -m live_life authorize-fitness-drive`."
            )
        self.service = build("drive", "v3", credentials=credentials, cache_discovery=False)
        self.media_downloader = media_downloader

    def list_children(self, folder_id: str) -> list[dict[str, str]]:
        """Return metadata for all non-trashed children across every result page."""
        items: list[dict[str, str]] = []
        page_token = None
        while True:
            response = (
                self.service.files()
                .list(
                    q=f"'{folder_id}' in parents and trashed = false",
                    spaces="drive",
                    fields="nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum)",
                    pageToken=page_token,
                    pageSize=1000,
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True,
                )
                .execute()
            )
            items.extend(response.get("files", []))
            page_token = response.get("nextPageToken")
            if not page_token:
                return items

    def download(self, file_id: str, destination: Path) -> None:
        """Download file contents in chunks to the destination path."""
        destination.parent.mkdir(parents=True, exist_ok=True)
        request = self.service.files().get_media(fileId=file_id)
        with FileIO(destination, "wb") as handle:
            downloader = self.media_downloader(handle, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()


def _requested_months(start: date, end: date) -> set[tuple[str, str]]:
    """Return year-month pairs covering the range plus one day on either side."""
    current = start - timedelta(days=1)
    last = end + timedelta(days=1)
    months: set[tuple[str, str]] = set()
    while current <= last:
        months.add((f"{current.year:04d}", f"{current.month:02d}"))
        current += timedelta(days=1)
    return months


def _walk_files(reader, folder_id: str) -> Iterable[dict[str, str]]:
    """Recursively yield supported fitness export files beneath a Drive folder."""
    for item in reader.list_children(folder_id):
        if item.get("mimeType") == FOLDER_MIME_TYPE:
            yield from _walk_files(reader, item["id"])
        elif item.get("mimeType") in FITNESS_MIME_TYPES or item.get("name", "").endswith(
            (".json", ".json.gz", ".ndjson", ".ndjson.gz")
        ):
            yield item


def _remove_replaced_cache(config: Config, local_name: object, destination: Path) -> None:
    """Remove one renamed cache file and its imported fitness projection."""
    if not isinstance(local_name, str) or local_name == destination.name:
        return
    previous = (config.fitness_drive_cache / local_name).resolve()
    if previous.parent != config.fitness_drive_cache.resolve():
        raise ValueError("Invalid localName in fitness Drive manifest")
    if config.database.exists():
        with connect(config.database) as conn:
            conn.execute(
                "DELETE FROM metric_events WHERE source = 'fitness_drive' AND origin_file = ?",
                (str(previous),),
            )
            conn.execute(
                "DELETE FROM import_files WHERE source = 'fitness_drive' AND path = ?",
                (str(previous),),
            )
            previous.unlink(missing_ok=True)
    else:
        previous.unlink(missing_ok=True)


def sync_fitness_drive(
    config: Config,
    start: date,
    end: date,
    *,
    reader=None,
) -> dict[str, int]:
    """Download raw exports for the requested months from year/month[/day]."""
    if not config.fitness_drive_folder_id or not config.fitness_drive_cache:
        return {"files": 0, "downloaded": 0, "skipped_not_configured": 1}
    if reader is None:
        try:
            reader = GoogleDriveReader(config)
        except RuntimeError:
            return {"files": 0, "downloaded": 0, "skipped_not_authorized": 1}

    requested = _requested_months(start, end)
    years = {
        item["name"]: item
        for item in reader.list_children(config.fitness_drive_folder_id)
        if item.get("mimeType") == FOLDER_MIME_TYPE
    }
    remote_files: list[tuple[str, str, dict[str, str]]] = []
    for year, month in sorted(requested):
        year_item = years.get(year)
        if not year_item:
            continue
        months = {
            item["name"]: item
            for item in reader.list_children(year_item["id"])
            if item.get("mimeType") == FOLDER_MIME_TYPE
        }
        month_item = months.get(month)
        if month_item:
            remote_files.extend((year, month, item) for item in _walk_files(reader, month_item["id"]))

    downloaded = 0
    manifest_path = config.fitness_drive_cache / ".drive-index.json"
    try:
        raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        raw_manifest = {}
    if raw_manifest.get("version") == 2 and isinstance(raw_manifest.get("files"), dict):
        manifest = raw_manifest["files"]
    else:
        manifest = {
            file_id: {"fingerprint": fingerprint, "status": "available"}
            for file_id, fingerprint in raw_manifest.items()
            if isinstance(fingerprint, str)
        }
    now = datetime.now(timezone.utc).isoformat()
    seen: set[str] = set()
    changed_files = 0
    for year, month, item in remote_files:
        seen.add(item["id"])
        safe_name = SAFE_NAME.sub("_", item["name"])
        destination = config.fitness_drive_cache / f"{item['id']}--{safe_name}"
        fingerprint = item.get("md5Checksum") or item.get("modifiedTime") or "unknown"
        previous = manifest.get(item["id"], {})
        unchanged = destination.exists() and previous.get("fingerprint") == fingerprint
        replacement = {
            "fingerprint": fingerprint,
            "name": item["name"],
            "localName": destination.name,
            "modifiedTime": item.get("modifiedTime"),
            "year": year,
            "month": month,
            "status": "available",
            "lastSeenAt": now,
        }
        if not unchanged:
            temporary = config.fitness_drive_cache / f".{item['id']}.part"
            try:
                reader.download(item["id"], temporary)
                temporary.replace(destination)
            finally:
                temporary.unlink(missing_ok=True)
            downloaded += 1
            changed_files += 1
        _remove_replaced_cache(config, previous.get("localName"), destination)
        manifest[item["id"]] = replacement
    missing = 0
    requested_keys = {f"{year}-{month}" for year, month in requested}
    for file_id, entry in manifest.items():
        key = f"{entry.get('year')}-{entry.get('month')}"
        if key in requested_keys and file_id not in seen:
            entry["status"] = "missing_on_drive"
            missing += 1
    manifest_document = json.dumps(
        {"version": 2, "files": manifest}, indent=2, sort_keys=True
    ) + "\n"
    temporary_manifest = manifest_path.with_name(f"{manifest_path.name}.tmp")
    try:
        temporary_manifest.write_text(manifest_document, encoding="utf-8")
        temporary_manifest.replace(manifest_path)
    finally:
        temporary_manifest.unlink(missing_ok=True)
    return {
        "files": len(remote_files),
        "downloaded": downloaded,
        "changed_files": changed_files,
        "missing_files": missing,
        "skipped_not_authorized": 0,
    }
