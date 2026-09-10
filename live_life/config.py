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
    fitness_drive_folder_id: str = ""
    fitness_drive_client_secret: Path | None = None
    fitness_drive_token: Path | None = None
    fitness_drive_cache: Path | None = None


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_config(root: Path | None = None) -> Config:
    root = (root or Path.cwd()).resolve()
    path = root / "config.toml"
    with path.open("rb") as handle:
        raw = tomllib.load(handle)
    load_dotenv(root / ".env")
    general = raw["general"]
    welltory = raw["welltory"]
    fitness_drive = raw.get("fitness_drive", {})

    def project_path(value: str | None) -> Path | None:
        return root / value if value else None

    return Config(
        root=root,
        timezone=general["timezone"],
        day_boundary_hour=int(general["day_boundary_hour"]),
        database=root / general["database"],
        inbox=root / general["inbox"],
        reports=root / general["reports"],
        welltory_downloads=Path(welltory["downloads_dir"]).expanduser(),
        welltory_pattern=welltory["file_pattern"],
        rescuetime_key_env=raw["rescuetime"]["api_key_env"],
        todoist_token_env=raw["todoist"]["token_env"],
        fitness_drive_folder_id=fitness_drive.get("folder_id", ""),
        fitness_drive_client_secret=project_path(fitness_drive.get("client_secret_file")),
        fitness_drive_token=project_path(fitness_drive.get("token_file")),
        fitness_drive_cache=project_path(fitness_drive.get("cache_dir")),
    )


def ensure_layout(config: Config) -> None:
    config.database.parent.mkdir(parents=True, exist_ok=True)
    config.reports.mkdir(parents=True, exist_ok=True)
    for name in ("diary", "health", "health_connect"):
        (config.inbox / name).mkdir(parents=True, exist_ok=True)
    if config.fitness_drive_cache:
        config.fitness_drive_cache.mkdir(parents=True, exist_ok=True)
