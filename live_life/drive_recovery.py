"""Safe Google Drive diagnostics and actionable recovery; no raw exceptions persisted."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import json
import os
import tempfile
import time
import uuid

from google.auth.exceptions import RefreshError, TransportError
from googleapiclient.errors import HttpError
from requests.exceptions import ConnectionError as RequestsConnectionError, Timeout
from httplib2 import ServerNotFoundError

CLIENT_STEPS = [
    "Откройте Google Cloud и выберите действующий проект. Удалённый проект можно попытаться восстановить в «Manage resources → Resources pending deletion»; иначе создайте новый.",
    "В выбранном проекте включите Google Drive API. В Google Auth Platform настройте Branding и Audience; для режима Testing добавьте свой Google-аккаунт в Test users.",
    "В Google Auth Platform → Clients создайте OAuth client типа Desktop app и скачайте JSON. Загрузите его здесь, затем подключите Google Drive.",
]
RECONNECT_STEPS = [
    "Нажмите «Подключить Google Drive» и выберите аккаунт с доступом к папке экспортов браслета. Разрешите чтение Google Drive.",
    "Если Google сообщает deleted_client или invalid_client, откройте настройку Google Cloud ниже и загрузите новый JSON клиента.",
    "В режиме Testing разрешение на Drive обычно истекает через 7 дней. В Google Auth Platform → Audience можно перевести приложение в Production; Google может потребовать проверку. После изменения подключите Drive заново.",
]


def issue(code, message, action="retry", steps=None):
    return {"code": code, "message": message, "action": action, "steps": steps or []}


class DriveFailure(Exception):
    def __init__(
        self, problem, *, stage="authorization", reason=None, http_status=None
    ):
        super().__init__(problem["message"])
        self.issue = problem
        self.stage = stage
        self.reason = reason
        self.http_status = http_status


def classify(exc):
    if isinstance(exc, DriveFailure):
        return exc
    reason = None
    status = None
    if isinstance(exc, RefreshError):
        for arg in exc.args:
            if isinstance(arg, dict):
                reason = arg.get("error")
        # OAuth libraries can include only a formatted error string.
        if not reason and exc.args and isinstance(exc.args[0], str):
            reason = exc.args[0].split(":", 1)[0]
    elif isinstance(exc, HttpError):
        status = exc.resp.status
        try:
            body = json.loads(exc.content).get("error", {})
            reasons = [entry.get("reason") for entry in body.get("errors", [])]
            reasons += [entry.get("reason") for entry in body.get("details", [])]
            reason = next(
                (
                    r
                    for r in reasons
                    if r
                    in {
                        "accessNotConfigured",
                        "SERVICE_DISABLED",
                        "rateLimitExceeded",
                        "userRateLimitExceeded",
                        "insufficientPermissions",
                        "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
                    }
                ),
                None,
            )
        except (ValueError, AttributeError, TypeError):
            pass
    else:
        reason = getattr(exc, "error", None)  # oauthlib's structured OAuth2Error
    allowed = {
        "mismatching_state",
        "invalid_grant",
        "invalid_client",
        "deleted_client",
        "unauthorized_client",
        "access_denied",
        "admin_policy_enforced",
        "org_internal",
        "invalid_scope",
        "temporarily_unavailable",
        "server_error",
        "accessNotConfigured",
        "SERVICE_DISABLED",
        "rateLimitExceeded",
        "userRateLimitExceeded",
        "insufficientPermissions",
        "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
    }
    reason = reason if isinstance(reason, str) and reason in allowed else None
    if reason == "mismatching_state":
        problem = issue(
            "GOOGLE_SIGN_IN_FAILED",
            "Ответ Google не соответствует текущему сеансу входа. Начните подключение заново.",
            "reconnect",
        )
    elif reason in {"invalid_client", "deleted_client", "unauthorized_client"}:
        problem = issue(
            "GOOGLE_CLIENT_INVALID",
            "Google не принимает OAuth-клиент: он удалён, отключён или настроен неверно. Проверьте проект Google Cloud.",
            "configure",
            CLIENT_STEPS,
        )
    elif reason in {"accessNotConfigured", "SERVICE_DISABLED"}:
        problem = issue(
            "GOOGLE_DRIVE_API_DISABLED",
            "Google Drive API отключён или недоступен в проекте OAuth-клиента.",
            "configure",
            [
                "Откройте Google Cloud → APIs & Services → Library → Google Drive API в проекте этого OAuth-клиента и нажмите Enable. Затем повторите импорт."
            ],
        )
    elif reason in {
        "access_denied",
        "admin_policy_enforced",
        "org_internal",
        "invalid_scope",
    }:
        problem = issue(
            "GOOGLE_ACCESS_BLOCKED",
            "Google не разрешил подключение этому аккаунту или приложению.",
            "configure",
            [
                "Проверьте Test users и Audience в Google Auth Platform. Для рабочего аккаунта обратитесь к администратору. При отмене входа попробуйте подключиться снова."
            ],
        )
    elif (
        reason
        in {
            "invalid_grant",
            "insufficientPermissions",
            "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
        }
        or status == 401
    ):
        problem = issue(
            "GOOGLE_RECONNECT_REQUIRED",
            "Разрешение Google истекло, отозвано или не включает чтение Drive. Подключите аккаунт заново.",
            "reconnect",
            RECONNECT_STEPS,
        )
    elif (
        (status and (status >= 500 or status == 429))
        or reason
        in {
            "rateLimitExceeded",
            "userRateLimitExceeded",
            "temporarily_unavailable",
            "server_error",
        }
        or getattr(exc, "retryable", False)
        or isinstance(
            exc,
            (
                TransportError,
                RequestsConnectionError,
                Timeout,
                TimeoutError,
                ConnectionError,
                ServerNotFoundError,
            ),
        )
    ):
        problem = issue(
            "GOOGLE_TEMPORARY_FAILURE",
            "Google Drive временно недоступен. Автоматические повторные попытки не помогли.",
            steps=[
                "Проверьте подключение к интернету и VPN. Подождите немного и повторите импорт."
            ],
        )
    elif status in {403, 404}:
        problem = issue(
            "GOOGLE_DRIVE_ACCESS_DENIED",
            "Нет доступа к папке или файлу Google Drive, либо они удалены.",
            "reconnect",
            [
                "Откройте папку экспортов в Google Drive и проверьте доступ выбранного аккаунта. Если нужно, подключите другой аккаунт.",
                "Если папка перемещена в корзину, восстановите её. Если создана новая папка, обновите GOOGLE_DRIVE_FOLDER_ID в .env.",
            ],
        )
    elif isinstance(exc, RefreshError):
        problem = issue(
            "GOOGLE_REFRESH_FAILED",
            "Google не смог обновить разрешение. Причина не распознана.",
            "reconnect",
            RECONNECT_STEPS,
        )
    elif isinstance(exc, (OSError, ValueError)):
        problem = issue(
            "BRACELET_LOCAL_ERROR",
            "Не удалось прочитать или сохранить локальные файлы браслета.",
            steps=[
                "Проверьте свободное место и права доступа к папке приложения. Если ошибка повторяется, проверьте журнал data/logs/bracelet.jsonl."
            ],
        )
    else:
        problem = issue(
            "BRACELET_IMPORT_FAILED",
            "Импорт браслета не завершён. Подробности сохранены в локальном журнале.",
            steps=[
                "Повторите импорт. Если ошибка остаётся, проверьте журнал data/logs/bracelet.jsonl."
            ],
        )
    return DriveFailure(problem, reason=reason, http_status=status)


def atomic_private_write(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".google-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def log_event(config, event, **safe_fields):
    """Only pass bounded, non-sensitive metadata; never exception messages or Drive IDs."""
    try:
        path = config.root / "data/logs/bracelet.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
        with os.fdopen(fd, "a", encoding="utf-8") as handle:
            handle.write(
                json.dumps(
                    {
                        "at": datetime.now(timezone.utc).isoformat(),
                        "event": event,
                        **safe_fields,
                    }
                )
                + "\n"
            )
    except OSError:
        # Diagnostics must never invalidate otherwise saved source data.
        pass


def report_failure(config, exc, stage="sync"):
    failure = classify(exc)
    diagnostic_id = uuid.uuid4().hex[:12]
    problem = {**failure.issue, "diagnosticId": diagnostic_id}
    log_event(
        config,
        "failed",
        diagnosticId=diagnostic_id,
        stage=failure.stage if isinstance(exc, DriveFailure) else stage,
        code=problem["code"],
        reason=failure.reason,
        httpStatus=failure.http_status,
        errorType=type(exc).__name__,
    )
    return problem


def perform(config, stage, fn):
    for attempt in range(3):
        try:
            return fn()
        except Exception as exc:
            failure = classify(exc)
            failure.stage = stage
            if failure.issue["code"] != "GOOGLE_TEMPORARY_FAILURE" or attempt == 2:
                raise failure from exc
            log_event(
                config,
                "retry",
                stage=stage,
                attempt=attempt + 1,
                code=failure.issue["code"],
            )
            time.sleep(2**attempt)
