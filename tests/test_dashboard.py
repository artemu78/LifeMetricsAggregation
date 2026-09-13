from __future__ import annotations

from datetime import date
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import subprocess
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from live_life.api_models import DashboardResponse
from live_life.config import Config
from live_life.dashboard_data import build_dashboard
from live_life.db import connect, insert_metric, record_source_run
from live_life.importers import import_fitness_drive
from live_life.server import app
from live_life.fitness_sync_json import main as fitness_sync_main


class DashboardTest(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        root = Path(self.temporary.name)
        self.cache = root / "data/inbox/fitness_drive"
        self.cache.mkdir(parents=True)
        self.config = Config(
            root=root,
            timezone="Europe/Moscow",
            day_boundary_hour=5,
            database=root / "data/life.db",
            inbox=root / "data/inbox",
            reports=root / "data/reports",
            welltory_downloads=root,
            welltory_pattern="*.csv",
            rescuetime_key_env="RESCUETIME_API_KEY",
            todoist_token_env="TODOIST_API_TOKEN",
            fitness_drive_cache=self.cache,
        )

    def tearDown(self):
        self.temporary.cleanup()

    def _fitness_file(self, count: int) -> Path:
        path = self.cache / "drive-id--day.json"
        path.write_text(
            json.dumps(
                {
                    "header": {"schemaVersion": 1, "recordCount": 1},
                    "records": [
                        {
                            "recordType": "steps",
                            "startTime": "2026-09-10T07:00:00Z",
                            "endTime": "2026-09-10T08:00:00Z",
                            "count": count,
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        return path

    def test_changed_fitness_file_replaces_only_its_projection_atomically(self):
        path = self._fitness_file(100)
        import_fitness_drive(self.config)
        with connect(self.config.database) as conn:
            insert_metric(
                conn,
                source="welltory",
                external_id="keep",
                occurred_at="2026-09-10T07:00:00+00:00",
                metric="welltory.Focus",
                value_num=80,
                value_text=None,
                unit="%",
                payload={"private": "kept"},
            )

        self._fitness_file(250)
        result = import_fitness_drive(self.config)
        self.assertEqual(result["files"], 1)
        with connect(self.config.database) as conn:
            fitness = conn.execute(
                "SELECT value_num FROM metric_events WHERE source = 'fitness_drive'"
            ).fetchall()
            self.assertEqual([row["value_num"] for row in fitness], [250])
            self.assertEqual(
                conn.execute(
                    "SELECT COUNT(*) AS count FROM metric_events WHERE source = 'welltory'"
                ).fetchone()["count"],
                1,
            )

        path.write_text('{"broken":', encoding="utf-8")
        with self.assertRaises(json.JSONDecodeError):
            import_fitness_drive(self.config)
        with connect(self.config.database) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT value_num FROM metric_events WHERE source = 'fitness_drive'"
                ).fetchone()["value_num"],
                250,
            )

    def test_dashboard_excludes_diary_and_raw_payload_but_keeps_task_text(self):
        started = "2026-09-10T08:00:00+00:00"
        with connect(self.config.database) as conn:
            for source in ("bracelet", "welltory", "todoist", "rescuetime"):
                record_source_run(
                    conn,
                    source=source,
                    logical_date="2026-09-10",
                    status="success",
                    started_at=started,
                )
            insert_metric(
                conn,
                source="fitness_drive",
                external_id="steps",
                occurred_at="2026-09-10T07:00:00+00:00",
                metric="fitness_drive.steps",
                value_num=500,
                value_text=None,
                unit="count",
                payload={"rawSecret": "must-not-leak"},
            )
            insert_metric(
                conn,
                source="welltory",
                external_id="focus",
                occurred_at="2026-09-10T08:00:00+00:00",
                metric="welltory.Focus",
                value_num=75,
                value_text=None,
                unit="%",
                payload={"rawSecret": "must-not-leak"},
            )
            insert_metric(
                conn,
                source="rescuetime",
                external_id="activity",
                occurred_at="2026-09-10T09:00:00+00:00",
                metric="rescuetime.seconds.activity.Editor",
                value_num=600,
                value_text=None,
                unit="seconds",
                payload={"rawSecret": "must-not-leak"},
            )
            conn.execute(
                """
                INSERT INTO created_tasks
                (source, external_id, content, project_id, created_at, payload_json, imported_at)
                VALUES ('todoist', 'task', 'Visible task', NULL, ?, ?, ?)
                """,
                ("2026-09-10T10:00:00+00:00", '{"rawSecret":"must-not-leak"}', started),
            )
            conn.execute(
                """
                INSERT INTO journal_entries(logical_date, content, source_path, imported_at)
                VALUES ('2026-09-10', 'DIARY-MUST-NOT-LEAK', '/private/path', ?)
                """,
                (started,),
            )

        result = build_dashboard(self.config, date(2026, 9, 10), date(2026, 9, 10))
        DashboardResponse.model_validate(result)
        encoded = json.dumps(result)
        self.assertIn("Visible task", encoded)
        self.assertIn("Editor", encoded)
        self.assertEqual(
            result["days"][0]["detail"]["rescueTime"][0]["timestamp"],
            "2026-09-10T09:00:00+00:00",
        )
        self.assertNotIn("DIARY-MUST-NOT-LEAK", encoded)
        self.assertNotIn("rawSecret", encoded)
        self.assertNotIn("/private/path", encoded)
        self.assertEqual(result["days"][0]["quality"], "complete")

class ServerContractTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_reversed_range_uses_safe_error_contract(self):
        response = self.client.get(
            "/api/dashboard",
            params={"from": "2026-09-11", "to": "2026-09-10"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            set(response.json()),
            {"code", "message", "details"},
        )
        self.assertEqual(response.json()["code"], "INVALID_DATE_RANGE")

    def test_day_route_serves_dashboard_frontend(self):
        response = self.client.get("/day/2026-09-10")

        self.assertEqual(response.status_code, 200)
        self.assertIn("text/html", response.headers["content-type"])
        self.assertIn("Live Life", response.text)

    @patch("live_life.server._run")
    def test_parallel_sync_returns_contractual_conflict(self, run):
        run.return_value = subprocess.CompletedProcess([], 75, "", "SYNC_ALREADY_RUNNING")
        response = self.client.post(
            "/api/fitness-sync",
            json={"from": "2026-09-10", "to": "2026-09-11"},
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "SYNC_ALREADY_RUNNING")

    @patch("live_life.fitness_sync_json._record")
    @patch("live_life.fitness_sync_json.import_fitness_drive")
    @patch("live_life.fitness_sync_json.sync_fitness_drive")
    @patch("live_life.fitness_sync_json.load_config")
    def test_sync_worker_emits_one_contract_json_document(
        self, load_config, sync, imported, record
    ):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            load_config.return_value = Config(
                root=root,
                timezone="Europe/Moscow",
                day_boundary_hour=5,
                database=root / "data/life.db",
                inbox=root / "data/inbox",
                reports=root / "data/reports",
                welltory_downloads=root,
                welltory_pattern="*.csv",
                rescuetime_key_env="RESCUETIME_API_KEY",
                todoist_token_env="TODOIST_API_TOKEN",
                fitness_drive_cache=root / "data/inbox/fitness_drive",
            )
            sync.return_value = {
                "files": 2,
                "downloaded": 1,
                "changed_files": 1,
                "missing_files": 0,
                "skipped_not_authorized": 0,
            }
            imported.return_value = {
                "records": 3,
                "metrics": 4,
                "affected_dates": ["2026-09-10"],
            }
            output = StringIO()
            with redirect_stdout(output):
                code = fitness_sync_main(
                    ["--from", "2026-09-10", "--to", "2026-09-10"]
                )
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(output.getvalue())["metrics"], 4)
        record.assert_called_once()


if __name__ == "__main__":
    unittest.main()
