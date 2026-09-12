from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from hashlib import sha256
from time import monotonic
from typing import Callable
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
import json
import os

from .config import Config
from .db import connect, insert_metric, utc_now


def logical_window(day: date, config: Config) -> tuple[datetime, datetime]:
    """Return timezone-aware start and exclusive end times for a logical day."""
    tz = ZoneInfo(config.timezone)
    start = datetime.combine(day, time(config.day_boundary_hour), tzinfo=tz)
    return start, start + timedelta(days=1)


def _get_json(url: str, token: str, on_response: Callable[[], None] | None = None) -> object:
    """Fetch and decode JSON with bearer authentication and a 30-second timeout."""
    request = Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "live-life/0.1",
        },
    )
    with urlopen(request, timeout=30) as response:
        if on_response is not None:
            on_response()
        return json.load(response)


def _rescuetime_log(config: Config, event: str, **fields: object) -> None:
    """Append allowlisted diagnostics, never credentials, URLs, or response contents."""
    path = config.root / "data/logs/rescuetime.jsonl"
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        with os.fdopen(fd, "a", encoding="utf-8") as handle:
            handle.write(json.dumps({"timestamp": utc_now(), "event": event, **fields}) + "\n")
    except OSError:
        # Diagnostics must not turn a successful fetch/commit into a source failure.
        import warnings
        warnings.warn("Could not write RescueTime diagnostic log", RuntimeWarning, stacklevel=2)


def _fetch_rescuetime(config: Config, url: str, token: str, day: date, taxonomy: str) -> dict:
    """Identify the failing request stage without exposing private request data."""
    context = {"day": day.isoformat(), "taxonomy": taxonomy}
    stage = "connection_or_response"
    started = monotonic()
    _rescuetime_log(config, "request_started", **context, timeout_seconds=30)

    def response_received() -> None:
        nonlocal stage
        stage = "decode_json"

    try:
        payload = _get_json(url, token, on_response=response_received)
        stage = "validate_payload"
        if not isinstance(payload, dict) or not isinstance(payload.get("row_headers"), list) or not isinstance(payload.get("rows"), list):
            raise ValueError("Unexpected RescueTime response structure")
    except Exception as exc:
        reason = getattr(exc, "reason", exc)
        status = exc.code if isinstance(exc, HTTPError) else None
        elapsed = round(monotonic() - started, 3)
        _rescuetime_log(config, "request_failed", **context, stage=stage,
                       elapsed_seconds=elapsed, error_type=type(exc).__name__,
                       reason_type=type(reason).__name__, http_status=status)
        if isinstance(exc, HTTPError):
            exc.close()
        detail = f"HTTP {status}" if status is not None else type(reason).__name__
        raise RuntimeError(
            f"RescueTime {day} {taxonomy}: {stage} failed after {elapsed:.1f}s "
            f"({detail}); diagnostics: {config.root / 'data/logs/rescuetime.jsonl'}"
        ) from None
    _rescuetime_log(config, "request_succeeded", **context,
                   elapsed_seconds=round(monotonic() - started, 3))
    return payload


def collect_rescuetime(config: Config, day: date) -> dict[str, int]:
    """Store activity and productivity events within the logical day, skipping duplicates."""
    token = os.environ.get(config.rescuetime_key_env, "").strip()
    if not token:
        return {"queries": 0, "events": 0, "skipped_no_token": 1}
    start, end = logical_window(day, config)
    inserted = queries = 0
    with connect(config.database) as conn:
        for taxonomy in ("productivity", "activity"):
            params = urlencode(
                {
                    "perspective": "interval",
                    "restrict_kind": taxonomy,
                    "resolution_time": "minute",
                    "restrict_begin": start.date().isoformat(),
                    "restrict_end": end.date().isoformat(),
                    "format": "json",
                }
            )
            payload = _fetch_rescuetime(config, f"{config.rescuetime_api_url}?{params}", token, day, taxonomy)
            queries += 1
            headers = payload.get("row_headers", [])
            for values in payload.get("rows", []):
                row = dict(zip(headers, values))
                timestamp = None
                for value in values:
                    if isinstance(value, str) and len(value) >= 10:
                        try:
                            candidate = datetime.fromisoformat(value.replace("Z", "+00:00"))
                        except ValueError:
                            continue
                        timestamp = candidate
                        break
                if timestamp is None:
                    continue
                if timestamp.tzinfo is None:
                    timestamp = timestamp.replace(tzinfo=ZoneInfo(config.timezone))
                timestamp = timestamp.astimezone(timezone.utc)
                if not (start.astimezone(timezone.utc) <= timestamp < end.astimezone(timezone.utc)):
                    continue
                seconds = next(
                    (
                        float(value)
                        for key, value in row.items()
                        if "time spent" in key.lower() and isinstance(value, (int, float))
                    ),
                    None,
                )
                if seconds is None:
                    continue
                label = next(
                    (
                        str(value)
                        for key, value in row.items()
                        if key.lower() in {taxonomy, "activity", "category"}
                    ),
                    taxonomy,
                )
                row_id = sha256(
                    json.dumps([taxonomy, row], sort_keys=True).encode("utf-8")
                ).hexdigest()
                if insert_metric(
                    conn,
                    source="rescuetime",
                    external_id=row_id,
                    occurred_at=timestamp.isoformat(),
                    metric=f"rescuetime.seconds.{taxonomy}.{label}",
                    value_num=seconds,
                    value_text=None,
                    unit="seconds",
                    payload=row,
                ):
                    inserted += 1
    _rescuetime_log(config, "collection_saved", day=day.isoformat(), queries=queries)
    return {"queries": queries, "events": inserted, "skipped_no_token": 0}


def collect_todoist(config: Config, day: date) -> dict[str, int]:
    """Store task completions and creation times, or report a missing API token."""
    token = os.environ.get(config.todoist_token_env, "").strip()
    if not token:
        return {"completed": 0, "created": 0, "skipped_no_token": 1}
    start, end = logical_window(day, config)
    since = start.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    until = end.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    cursor = None
    completed = created = 0
    with connect(config.database) as conn:
        while True:
            params = {"since": since, "until": until, "limit": 200}
            if cursor:
                params["cursor"] = cursor
            url = (
                f"{config.todoist_api_base_url}/tasks/completed/by_completion_date?"
                + urlencode(params)
            )
            payload = _get_json(url, token)
            for item in payload.get("items", []):
                completed_at = item.get("completed_at")
                if not completed_at:
                    continue
                result = conn.execute(
                    """
                    INSERT OR IGNORE INTO completed_tasks
                    (source, external_id, content, project_id, completed_at,
                     payload_json, imported_at)
                    VALUES ('todoist', ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(item["id"]),
                        item.get("content", ""),
                        item.get("project_id"),
                        datetime.fromisoformat(completed_at.replace("Z", "+00:00"))
                        .astimezone(timezone.utc)
                        .isoformat(),
                        json.dumps(item, ensure_ascii=False, sort_keys=True),
                        utc_now(),
                    ),
                )
                completed += result.rowcount
                created_at = item.get("created_at") or item.get("added_at")
                if created_at:
                    created_at_utc = datetime.fromisoformat(
                        created_at.replace("Z", "+00:00")
                    ).astimezone(timezone.utc)
                    result = conn.execute(
                        """
                        INSERT OR IGNORE INTO created_tasks
                        (source, external_id, content, project_id, created_at,
                         payload_json, imported_at)
                        VALUES ('todoist', ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            str(item["id"]),
                            item.get("content", ""),
                            item.get("project_id"),
                            created_at_utc.isoformat(),
                            json.dumps(item, ensure_ascii=False, sort_keys=True),
                            utc_now(),
                        ),
                    )
                    created += result.rowcount
            cursor = payload.get("next_cursor")
            if not cursor:
                break
        cursor = None
        while True:
            params = {"limit": 200}
            if cursor:
                params["cursor"] = cursor
            payload = _get_json(f"{config.todoist_api_base_url}/tasks?" + urlencode(params), token)
            items = payload.get("results", payload) if isinstance(payload, dict) else payload
            for item in items:
                created_at = item.get("created_at") or item.get("added_at")
                if not created_at:
                    continue
                created_at_utc = datetime.fromisoformat(created_at.replace("Z", "+00:00")).astimezone(timezone.utc)
                if not (start.astimezone(timezone.utc) <= created_at_utc < end.astimezone(timezone.utc)):
                    continue
                result = conn.execute(
                    """
                    INSERT OR IGNORE INTO created_tasks
                    (source, external_id, content, project_id, created_at, payload_json, imported_at)
                    VALUES ('todoist', ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(item["id"]), item.get("content", ""), item.get("project_id"),
                        created_at_utc.isoformat(), json.dumps(item, ensure_ascii=False, sort_keys=True), utc_now(),
                    ),
                )
                created += result.rowcount
            cursor = payload.get("next_cursor") if isinstance(payload, dict) else None
            if not cursor:
                break
    return {"completed": completed, "created": created, "skipped_no_token": 0}
