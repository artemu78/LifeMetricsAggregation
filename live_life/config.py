from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os
import tomllib


@dataclass(frozen=True)
class Config:
    root: Path
    timezone: str
    day_boundary_hour: int
    database: Path
    inbox: Path
    reports: Path
    welltory_downloads: Path
    welltory_pattern: str
    rescuetime_key_env: str
    todoist_token_env: str
    rescuetime_api_url: str = "https://www.rescuetime.com/anapi/data"
    todoist_api_base_url: str = "https://api.todoist.com/api/v1"
    diary_google_doc_id: str = ""
    fitness_drive_folder_id: str = ""
    fitness_drive_client_secret: Path | None = None
    fitness_drive_token: Path | None = None
    fitness_drive_cache: Path | None = None


def load_dotenv(path: Path) -> None:
    """Load simple environment assignments without overriding existing shell values."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_config(root: Path | None = None) -> Config:
    """Combine general TOML settings with source configuration from the environment."""
    root = (root or Path.cwd()).resolve()
    path = root / "config.toml"
    with path.open("rb") as handle:
        raw = tomllib.load(handle)
    load_dotenv(root / ".env")
    general = raw["general"]

    def project_path(value: str | None) -> Path | None:
        """Expand a home-relative path and resolve relative values against the project root."""
        return root / Path(value).expanduser() if value else None

    return Config(
        root=root,
        timezone=general["timezone"],
        day_boundary_hour=int(general["day_boundary_hour"]),
        database=root / general["database"],
        inbox=project_path(os.environ.get("SOURCE_INBOX_DIR") or "data/inbox"),
        reports=root / general["reports"],
        welltory_downloads=project_path(os.environ.get("WELLTORY_DOWNLOADS_DIR") or "~/Downloads"),
        welltory_pattern=os.environ.get("WELLTORY_FILE_PATTERN") or "WELLTORY_HRV_DATA_EXPORT_*.csv",
        rescuetime_key_env="RESCUETIME_API_KEY",
        todoist_token_env="TODOIST_API_TOKEN",
        diary_google_doc_id=os.environ.get("DIARY_GOOGLE_DOC_ID", ""),
        fitness_drive_folder_id=os.environ.get("GOOGLE_DRIVE_FOLDER_ID", ""),
        fitness_drive_client_secret=project_path(os.environ.get("GOOGLE_DRIVE_CLIENT_SECRET_FILE")),
        fitness_drive_token=project_path(os.environ.get("GOOGLE_DRIVE_TOKEN_FILE")),
        fitness_drive_cache=project_path(os.environ.get("GOOGLE_DRIVE_CACHE_DIR") or "data/inbox/fitness_drive"),
        rescuetime_api_url=(os.environ.get("RESCUETIME_API_URL") or "https://www.rescuetime.com/anapi/data").rstrip("/"),
        todoist_api_base_url=(os.environ.get("TODOIST_API_BASE_URL") or "https://api.todoist.com/api/v1").rstrip("/"),
    )


def ensure_layout(config: Config) -> None:
    """Create the database parent, reports, diary inbox, and configured cache directories."""
    config.database.parent.mkdir(parents=True, exist_ok=True)
    config.reports.mkdir(parents=True, exist_ok=True)
    (config.inbox / "diary").mkdir(parents=True, exist_ok=True)
    if config.fitness_drive_cache:
        config.fitness_drive_cache.mkdir(parents=True, exist_ok=True)
