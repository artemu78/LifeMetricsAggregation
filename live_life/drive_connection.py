"""User-initiated desktop OAuth with bounded waiting and private atomic persistence."""

from __future__ import annotations

from contextlib import contextmanager
import fcntl
import json
import logging
from threading import Event, RLock, Thread
import uuid

from google_auth_oauthlib.flow import InstalledAppFlow, WSGITimeoutError

from .drive_recovery import (
    CLIENT_STEPS,
    DriveFailure,
    atomic_private_write,
    issue,
    report_failure,
    log_event,
)
from .fitness_drive import DRIVE_READONLY_SCOPE


class _NoOAuthURLs(logging.Filter):
    def filter(self, record):
        # The library logs the loopback request URL, including the authorization code.
        return False


logging.getLogger("google_auth_oauthlib.flow").addFilter(_NoOAuthURLs())


def client_problem():
    return DriveFailure(
        issue(
            "GOOGLE_CLIENT_MISSING",
            "Нужен JSON OAuth-клиента типа Desktop app из Google Cloud.",
            "configure",
            CLIENT_STEPS,
        )
    )


def validate_client(raw):
    try:
        installed = raw["installed"]
        if not isinstance(installed, dict):
            raise ValueError
        if not all(
            isinstance(installed.get(key), str) and installed[key]
            for key in ("client_id", "client_secret")
        ):
            raise ValueError
        if not installed["client_id"].endswith(".apps.googleusercontent.com"):
            raise ValueError
        if (
            installed.get("auth_uri") != "https://accounts.google.com/o/oauth2/auth"
            or installed.get("token_uri") != "https://oauth2.googleapis.com/token"
        ):
            raise ValueError
        # Retain only trusted Google endpoints and necessary fields.
        return {
            "installed": {
                key: installed[key]
                for key in ("client_id", "client_secret", "auth_uri", "token_uri")
            }
        }
    except (KeyError, TypeError, ValueError):
        raise client_problem() from None


@contextmanager
def connection_lock(config):
    path = config.root / "data/.fitness-sync.lock"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise DriveFailure(
                issue(
                    "GOOGLE_CONNECTION_BUSY",
                    "Дождитесь завершения текущего обновления или подключения Google Drive.",
                )
            ) from None
        yield


class DriveConnection:
    def __init__(self):
        self._lock = RLock()
        self._state = {"status": "idle"}

    def snapshot(self, session_id=None):
        with self._lock:
            if session_id and self._state.get("sessionId") != session_id:
                return {
                    "status": "failed",
                    "issue": issue(
                        "GOOGLE_SESSION_EXPIRED",
                        "Сеанс подключения завершён или сервер перезапущен. Начните подключение снова.",
                        "reconnect",
                    ),
                }
            return dict(self._state)

    def start(self, config):
        ready = Event()
        with self._lock:
            if self._state["status"] == "pending":
                return dict(self._state)
            session_id = uuid.uuid4().hex
            self._state = {"status": "pending", "sessionId": session_id}
            Thread(
                target=self._authorize, args=(config, session_id, ready), daemon=True
            ).start()
        ready.wait(3)
        return self.snapshot(session_id)

    def _authorize(self, config, session_id, ready):
        manager = self

        class BrowserFlow(InstalledAppFlow):
            def authorization_url(self, **kwargs):
                url, state = super().authorization_url(**kwargs)
                with manager._lock:
                    manager._state["authorizationUrl"] = url
                ready.set()
                return url, state

            def fetch_token(self, **kwargs):
                return super().fetch_token(**{**kwargs, "timeout": 20})

        try:
            with connection_lock(config):
                if (
                    not config.fitness_drive_client_secret
                    or not config.fitness_drive_token
                ):
                    raise client_problem()
                try:
                    raw = json.loads(config.fitness_drive_client_secret.read_text())
                except (FileNotFoundError, ValueError):
                    raise client_problem() from None
                flow = BrowserFlow.from_client_config(
                    validate_client(raw),
                    [DRIVE_READONLY_SCOPE],
                    autogenerate_code_verifier=True,
                )
                credentials = flow.run_local_server(
                    host="127.0.0.1",
                    port=0,
                    open_browser=False,
                    authorization_prompt_message=None,
                    timeout_seconds=180,
                    success_message="You may return to Live Life to see the connection result.",
                    prompt="consent",
                    access_type="offline",
                )
                granted = credentials.granted_scopes
                if isinstance(granted, str):
                    granted = granted.split()
                if (
                    not credentials.valid
                    or not credentials.refresh_token
                    or not credentials.has_scopes([DRIVE_READONLY_SCOPE])
                    or (granted is not None and DRIVE_READONLY_SCOPE not in granted)
                ):
                    raise DriveFailure(
                        issue(
                            "GOOGLE_RECONNECT_REQUIRED",
                            "Google не выдал долговременное разрешение на чтение Drive. Подключитесь снова и разрешите чтение.",
                            "reconnect",
                        )
                    )
                atomic_private_write(config.fitness_drive_token, credentials.to_json())
                log_event(config, "connected", stage="authorization")
                with self._lock:
                    self._state = {"status": "success", "sessionId": session_id}
        except Exception as exc:
            if isinstance(exc, WSGITimeoutError):
                exc = DriveFailure(
                    issue(
                        "GOOGLE_SIGN_IN_TIMEOUT",
                        "Вход не завершён за 3 минуты. Нажмите «Подключить Google Drive», чтобы начать снова.",
                        "reconnect",
                    )
                )
            problem = report_failure(config, exc, "authorization")
            with self._lock:
                self._state = {
                    "status": "failed",
                    "sessionId": session_id,
                    "issue": problem,
                }
        finally:
            ready.set()

    def save_client(self, config, content):
        try:
            raw = validate_client(json.loads(content))
        except ValueError:
            raise client_problem() from None
        with self._lock, connection_lock(config):
            if not config.fitness_drive_client_secret:
                raise client_problem()
            atomic_private_write(config.fitness_drive_client_secret, json.dumps(raw))
        return {"status": "idle"}


connection = DriveConnection()
