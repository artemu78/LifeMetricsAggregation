from dataclasses import replace
from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch
import json

from google.auth.exceptions import RefreshError

from live_life.config import Config
from live_life.data_sync_json import _sync_bracelet
from live_life.db import connect


def configuration(root):
    return Config(
        root=root,
        timezone="Europe/Moscow",
        day_boundary_hour=5,
        database=root / "data/life.db",
        inbox=root / "data/inbox",
        reports=root / "reports",
        welltory_downloads=root,
        welltory_pattern="*.csv",
        rescuetime_key_env="UNUSED",
        todoist_token_env="UNUSED",
        fitness_drive_folder_id="folder",
        fitness_drive_client_secret=root / "private/client.json",
        fitness_drive_token=root / "private/token.json",
        fitness_drive_cache=root / "data/inbox/fitness_drive",
    )


class DriveRecoveryTest(TestCase):
    def test_refresh_rejection_survives_worker_and_is_safe_to_display(self):
        with TemporaryDirectory() as directory:
            config = configuration(Path(directory))
            error = RefreshError(
                "sensitive token",
                {"error": "invalid_grant", "error_description": "sensitive account"},
            )
            with patch(
                "live_life.data_sync_json.sync_fitness_drive", side_effect=error
            ):
                result = _sync_bracelet(
                    config, date(2026, 9, 22), date(2026, 9, 22), "2026-09-22T08:00:00Z"
                )
            self.assertEqual(result["issue"]["code"], "GOOGLE_RECONNECT_REQUIRED")
            self.assertEqual(result["issue"]["action"], "reconnect")
            with connect(config.database) as conn:
                details = conn.execute(
                    "SELECT details_json FROM source_runs"
                ).fetchone()[0]
            self.assertIn("GOOGLE_RECONNECT_REQUIRED", details)
            log = (config.root / "data/logs/bracelet.jsonl").read_text()
            self.assertIn("invalid_grant", log)
            self.assertNotIn("sensitive", json.dumps(result) + details + log)

    def test_permanent_and_temporary_google_errors_are_distinguished(self):
        from live_life.drive_recovery import classify
        from googleapiclient.errors import HttpError
        from httplib2 import Response

        for reason, code in [
            ("deleted_client", "GOOGLE_CLIENT_INVALID"),
            ("invalid_client", "GOOGLE_CLIENT_INVALID"),
            ("invalid_grant", "GOOGLE_RECONNECT_REQUIRED"),
            ("access_denied", "GOOGLE_ACCESS_BLOCKED"),
            ("server_error", "GOOGLE_TEMPORARY_FAILURE"),
        ]:
            with self.subTest(reason=reason):
                result = classify(RefreshError("secret", {"error": reason}))
                self.assertEqual(result.issue["code"], code)
                self.assertEqual(result.reason, reason)
        for status, reason, code in [
            (403, "accessNotConfigured", "GOOGLE_DRIVE_API_DISABLED"),
            (403, "rateLimitExceeded", "GOOGLE_TEMPORARY_FAILURE"),
            (403, "insufficientPermissions", "GOOGLE_RECONNECT_REQUIRED"),
            (404, "notFound", "GOOGLE_DRIVE_ACCESS_DENIED"),
            (503, "backendError", "GOOGLE_TEMPORARY_FAILURE"),
        ]:
            error = HttpError(
                Response({"status": status}),
                json.dumps(
                    {"error": {"errors": [{"reason": reason}], "message": "secret"}}
                ).encode(),
            )
            self.assertEqual(classify(error).issue["code"], code)

    def test_transient_failure_retries_but_revoked_token_does_not(self):
        from live_life.drive_recovery import perform, DriveFailure
        from google.auth.exceptions import TransportError
        from unittest.mock import Mock

        with (
            TemporaryDirectory() as directory,
            patch("live_life.drive_recovery.time.sleep") as sleep,
        ):
            config = configuration(Path(directory))
            operation = Mock(side_effect=[TransportError("private"), "ok"])
            self.assertEqual(perform(config, "download", operation), "ok")
            self.assertEqual(operation.call_count, 2)
            revoked = Mock(
                side_effect=RefreshError("private", {"error": "invalid_grant"})
            )
            with self.assertRaises(DriveFailure):
                perform(config, "refresh", revoked)
            self.assertEqual(revoked.call_count, 1)
            exhausted = Mock(side_effect=TimeoutError("private"))
            with self.assertRaises(DriveFailure):
                perform(config, "download", exhausted)
            self.assertEqual(exhausted.call_count, 3)

    def test_expired_token_is_refreshed_and_saved_privately(self):
        from unittest.mock import Mock
        from live_life.fitness_drive import GoogleDriveReader

        with TemporaryDirectory() as directory:
            config = configuration(Path(directory))
            config.fitness_drive_token.parent.mkdir()
            config.fitness_drive_token.write_text("old")
            credentials = Mock(valid=False, refresh_token="refresh-private")
            credentials.refresh.side_effect = lambda request: setattr(
                credentials, "valid", True
            )
            credentials.to_json.return_value = '{"token": "renewed"}'
            credential_type = Mock()
            credential_type.from_authorized_user_file.return_value = credentials
            with patch(
                "live_life.fitness_drive._google_modules",
                return_value=(Mock(), credential_type, Mock(), Mock(), Mock()),
            ):
                GoogleDriveReader(config)
            credentials.refresh.assert_called_once()
            self.assertEqual(
                config.fitness_drive_token.read_text(), '{"token": "renewed"}'
            )
            self.assertEqual(config.fitness_drive_token.stat().st_mode & 0o777, 0o600)

    def test_failed_refresh_keeps_old_token(self):
        from unittest.mock import Mock
        from live_life.fitness_drive import GoogleDriveReader
        from live_life.drive_recovery import DriveFailure

        with TemporaryDirectory() as directory:
            config = configuration(Path(directory))
            config.fitness_drive_token.parent.mkdir()
            config.fitness_drive_token.write_text("old")
            credentials = Mock(valid=False, refresh_token="refresh-private")
            credentials.refresh.side_effect = RefreshError(
                "secret", {"error": "invalid_grant"}
            )
            credential_type = Mock()
            credential_type.from_authorized_user_file.return_value = credentials
            with patch(
                "live_life.fitness_drive._google_modules",
                return_value=(Mock(), credential_type, Mock(), Mock(), Mock()),
            ):
                with self.assertRaises(DriveFailure):
                    GoogleDriveReader(config)
            self.assertEqual(config.fitness_drive_token.read_text(), "old")

    def test_worker_stream_preserves_recovery_issue_and_other_sources_continue(self):
        from contextlib import redirect_stdout
        from io import StringIO
        from live_life.data_sync_json import main
        from live_life.api_models import SyncProgressEvent, SyncCompleteEvent

        with TemporaryDirectory() as directory:
            config = configuration(Path(directory))
            with (
                patch("live_life.data_sync_json.load_config", return_value=config),
                patch(
                    "live_life.data_sync_json.sync_fitness_drive",
                    side_effect=RefreshError("secret", {"error": "invalid_grant"}),
                ),
                patch(
                    "live_life.data_sync_json.collect_rescuetime",
                    return_value={"events": 1},
                ),
                patch(
                    "live_life.data_sync_json.collect_todoist",
                    return_value={"created": 1, "completed": 0},
                ),
            ):
                output = StringIO()
                with redirect_stdout(output):
                    self.assertEqual(
                        main(
                            ["--from", "2026-09-22", "--to", "2026-09-22", "--progress"]
                        ),
                        0,
                    )
            events = [json.loads(line) for line in output.getvalue().splitlines()]
            progress = SyncProgressEvent.model_validate(events[0])
            self.assertEqual(progress.issue.code, "GOOGLE_RECONNECT_REQUIRED")
            complete = SyncCompleteEvent.model_validate(events[-1])
            self.assertEqual(
                complete.sources[0].issue.code, "GOOGLE_RECONNECT_REQUIRED"
            )
            self.assertEqual(complete.sources[-1].status.value, "success")


CLIENT = {
    "installed": {
        "client_id": "test.apps.googleusercontent.com",
        "client_secret": "secret",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
}


class DriveConnectionTest(TestCase):
    def test_invalid_client_upload_cannot_change_endpoints_or_overwrite_saved_file(
        self,
    ):
        from live_life.drive_connection import DriveConnection
        from live_life.drive_recovery import DriveFailure

        with TemporaryDirectory() as directory:
            config = configuration(Path(directory))
            manager = DriveConnection()
            manager.save_client(config, json.dumps(CLIENT))
            before = config.fitness_drive_client_secret.read_text()
            for invalid in [
                "{}",
                "{",
                json.dumps({"web": CLIENT["installed"]}),
                json.dumps(
                    {
                        "installed": {
                            **CLIENT["installed"],
                            "token_uri": "https://attacker.example/token",
                        }
                    }
                ),
            ]:
                with self.assertRaises(DriveFailure):
                    manager.save_client(config, invalid)
                self.assertEqual(config.fitness_drive_client_secret.read_text(), before)
            self.assertEqual(
                config.fitness_drive_client_secret.stat().st_mode & 0o777, 0o600
            )

    def test_successful_oauth_requests_offline_consent_and_pkce_and_saves_token(self):
        from datetime import datetime, timedelta, timezone
        from threading import Event
        from urllib.parse import urlparse, parse_qs
        from google.oauth2.credentials import Credentials
        from live_life.drive_connection import DriveConnection
        from live_life.fitness_drive import DRIVE_READONLY_SCOPE

        with TemporaryDirectory() as directory:
            config = configuration(Path(directory))
            manager = DriveConnection()
            manager.save_client(config, json.dumps(CLIENT))
            credentials = Credentials(
                "new-token",
                refresh_token="new-refresh",
                token_uri=CLIENT["installed"]["token_uri"],
                client_id=CLIENT["installed"]["client_id"],
                client_secret="secret",
                scopes=[DRIVE_READONLY_SCOPE],
            )
            credentials.expiry = datetime.now(timezone.utc).replace(
                tzinfo=None
            ) + timedelta(hours=1)

            def run(flow, **kwargs):
                self.assertFalse(kwargs["open_browser"])
                self.assertEqual(kwargs["host"], "127.0.0.1")
                self.assertEqual(kwargs["timeout_seconds"], 180)
                flow.redirect_uri = "http://127.0.0.1:32123/"
                url, _ = flow.authorization_url(
                    prompt=kwargs["prompt"], access_type=kwargs["access_type"]
                )
                query = parse_qs(urlparse(url).query)
                self.assertEqual(query["prompt"], ["consent"])
                self.assertEqual(query["access_type"], ["offline"])
                self.assertEqual(query["code_challenge_method"], ["S256"])
                self.assertIn("state", query)
                return credentials

            with patch(
                "live_life.drive_connection.InstalledAppFlow.run_local_server", run
            ):
                manager._authorize(config, "session", Event())
            self.assertEqual(manager.snapshot()["status"], "success")
            self.assertEqual(
                json.loads(config.fitness_drive_token.read_text())["refresh_token"],
                "new-refresh",
            )
            self.assertNotIn(
                "new-token", (config.root / "data/logs/bracelet.jsonl").read_text()
            )

    def test_timeout_and_denial_preserve_token_and_explain_recovery(self):
        from threading import Event
        from google_auth_oauthlib.flow import WSGITimeoutError
        from oauthlib.oauth2 import AccessDeniedError
        from live_life.drive_connection import DriveConnection

        for error, code in [
            (WSGITimeoutError("private"), "GOOGLE_SIGN_IN_TIMEOUT"),
            (AccessDeniedError(), "GOOGLE_ACCESS_BLOCKED"),
        ]:
            with TemporaryDirectory() as directory:
                config = configuration(Path(directory))
                manager = DriveConnection()
                manager.save_client(config, json.dumps(CLIENT))
                config.fitness_drive_token.write_text("old")
                with patch(
                    "live_life.drive_connection.InstalledAppFlow.run_local_server",
                    side_effect=error,
                ):
                    manager._authorize(config, "session", Event())
                self.assertEqual(manager.snapshot()["issue"]["code"], code)
                self.assertEqual(config.fitness_drive_token.read_text(), "old")

    def test_shared_lock_blocks_configuration_during_import(self):
        from live_life.drive_connection import DriveConnection, connection_lock
        from live_life.drive_recovery import DriveFailure

        with TemporaryDirectory() as directory:
            config = configuration(Path(directory))
            connection = DriveConnection()
            client_json = json.dumps(CLIENT)
            with connection_lock(config):
                with self.assertRaises(DriveFailure) as failure:
                    connection.save_client(config, client_json)
            self.assertEqual(failure.exception.issue["code"], "GOOGLE_CONNECTION_BUSY")
            self.assertFalse(config.fitness_drive_client_secret.exists())

    def test_connection_endpoints_reject_cross_site_and_report_safe_upload_errors(self):
        from fastapi.testclient import TestClient
        from live_life.server import app
        from live_life.drive_connection import DriveConnection

        with TemporaryDirectory() as directory, TestClient(app) as client:
            config = configuration(Path(directory))
            headers = {"X-Live-Life-Action": "1"}
            self.assertEqual(client.post("/api/google-drive/connect").status_code, 403)
            self.assertEqual(
                client.post(
                    "/api/google-drive/connect",
                    headers={**headers, "Origin": "https://evil.example"},
                ).status_code,
                403,
            )
            with (
                patch("live_life.server.load_config", return_value=config),
                patch("live_life.server.connection", DriveConnection()),
            ):
                response = client.post(
                    "/api/google-drive/client",
                    headers=headers,
                    json={"content": json.dumps(CLIENT)},
                )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.headers["cache-control"], "no-store")
                response = client.post(
                    "/api/google-drive/client", headers=headers, json={"content": "{}"}
                )
                self.assertEqual(
                    response.json()["issue"]["code"], "GOOGLE_CLIENT_MISSING"
                )
                self.assertNotIn("secret", response.text)
                self.assertEqual(
                    client.post(
                        "/api/google-drive/client", headers=headers, content="x" * 70000
                    ).status_code,
                    400,
                )
                self.assertEqual(
                    client.get("/api/google-drive/connection/old").json()["issue"][
                        "code"
                    ],
                    "GOOGLE_SESSION_EXPIRED",
                )

    def test_stalled_worker_is_killed_before_stdout_closes(self):
        import subprocess
        import sys
        import time
        from live_life.server import _stream_sync_events

        real_popen = subprocess.Popen
        processes = []

        def start(*args, **kwargs):
            child = real_popen(
                [sys.executable, "-c", "import time; time.sleep(10)"],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
            )
            processes.append(child)
            return child

        started = time.monotonic()
        with patch("live_life.server.subprocess.Popen", side_effect=start):
            output = "".join(
                _stream_sync_events(date(2026, 9, 22), date(2026, 9, 22), timeout=0.05)
            )
        self.assertIn("SYNC_TIMEOUT", output)
        self.assertLess(time.monotonic() - started, 2)
        self.assertIsNotNone(processes[0].poll())

    def test_oauth_state_mismatch_cannot_replace_credentials(self):
        from threading import Event
        from live_life.drive_connection import DriveConnection

        with TemporaryDirectory() as directory:
            config = configuration(Path(directory))
            manager = DriveConnection()
            manager.save_client(config, json.dumps(CLIENT))
            config.fitness_drive_token.write_text("old")

            def run(flow, **kwargs):
                flow.redirect_uri = "http://127.0.0.1:32123/"
                flow.authorization_url(prompt="consent", access_type="offline")
                return flow.fetch_token(
                    authorization_response="https://127.0.0.1:32123/?state=wrong&code=private"
                )

            with patch(
                "live_life.drive_connection.InstalledAppFlow.run_local_server", run
            ):
                manager._authorize(config, "session", Event())
            self.assertEqual(manager.snapshot()["status"], "failed")
            self.assertEqual(config.fitness_drive_token.read_text(), "old")
            self.assertNotIn(
                "private", (config.root / "data/logs/bracelet.jsonl").read_text()
            )

    def test_missing_client_and_single_flight_connection_start(self):
        from live_life.drive_connection import DriveConnection
        from threading import Event

        with TemporaryDirectory() as directory:
            config = configuration(Path(directory))
            manager = DriveConnection()
            state = manager.start(config)
            self.assertEqual(state["status"], "failed")
            self.assertEqual(state["issue"]["code"], "GOOGLE_CLIENT_MISSING")
            manager.save_client(config, json.dumps(CLIENT))
            entered, release, finished = Event(), Event(), Event()

            def authorize(config, session_id, ready):
                ready.set()
                entered.set()
                release.wait(2)
                finished.set()

            with patch.object(
                manager, "_authorize", side_effect=authorize
            ) as authorize_mock:
                first = manager.start(config)
                self.assertTrue(entered.wait(1))
                second = manager.start(config)
                self.assertEqual(first["sessionId"], second["sessionId"])
                authorize_mock.assert_called_once()
                release.set()
                self.assertTrue(finished.wait(1))

    def test_insufficient_granted_scope_does_not_replace_token(self):
        from google.oauth2.credentials import Credentials
        from threading import Event
        from live_life.drive_connection import DriveConnection
        from live_life.fitness_drive import DRIVE_READONLY_SCOPE

        with TemporaryDirectory() as directory:
            config = configuration(Path(directory))
            manager = DriveConnection()
            manager.save_client(config, json.dumps(CLIENT))
            config.fitness_drive_token.write_text("old")
            credentials = Credentials(
                "new",
                refresh_token="refresh",
                scopes=[DRIVE_READONLY_SCOPE],
                granted_scopes=["openid"],
            )
            with patch(
                "live_life.drive_connection.InstalledAppFlow.run_local_server",
                return_value=credentials,
            ):
                manager._authorize(config, "session", Event())
            self.assertEqual(
                manager.snapshot()["issue"]["code"], "GOOGLE_RECONNECT_REQUIRED"
            )
            self.assertEqual(config.fitness_drive_token.read_text(), "old")
