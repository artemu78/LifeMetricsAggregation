from __future__ import annotations

from contextlib import redirect_stdout
from datetime import date
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import unittest
from unittest.mock import patch

from live_life.api_models import DashboardSyncResponse
from live_life.config import Config
from live_life.data_sync_json import main
from live_life.db import connect


class DashboardDataSyncTest(unittest.TestCase):
    @patch("live_life.data_sync_json.collect_todoist")
    @patch("live_life.data_sync_json.collect_rescuetime")
    @patch("live_life.data_sync_json.import_welltory")
    @patch("live_life.data_sync_json.import_fitness_drive")
    @patch("live_life.data_sync_json.sync_fitness_drive")
    @patch("live_life.data_sync_json.load_config")
    def test_worker_refreshes_every_dashboard_source(
        self,
        load_config,
        sync_fitness,
        import_fitness,
        import_welltory,
        collect_rescuetime,
        collect_todoist,
    ):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            downloads = root / "downloads"
            downloads.mkdir()
            (downloads / "welltory.csv").write_text("Date,Focus\n", encoding="utf-8")
            config = Config(
                root=root,
                timezone="Europe/Moscow",
                day_boundary_hour=5,
                database=root / "data/life.db",
                inbox=root / "data/inbox",
                reports=root / "reports",
                welltory_downloads=downloads,
                welltory_pattern="*.csv",
                rescuetime_key_env="RESCUETIME_API_KEY",
                todoist_token_env="TODOIST_API_TOKEN",
                fitness_drive_cache=root / "data/inbox/fitness_drive",
            )
            load_config.return_value = config
            sync_fitness.return_value = {
                "changed_files": 1,
                "missing_files": 0,
                "skipped_not_configured": 0,
                "skipped_not_authorized": 0,
            }
            import_fitness.return_value = {"metrics": 3}
            import_welltory.return_value = {"metrics": 2}
            collect_rescuetime.return_value = {
                "queries": 2,
                "events": 5,
                "skipped_no_token": 0,
            }
            collect_todoist.return_value = {
                "created": 1,
                "completed": 2,
                "skipped_no_token": 0,
            }

            output = StringIO()
            with redirect_stdout(output):
                code = main(["--from", "2026-09-14", "--to", "2026-09-15"])

            self.assertEqual(code, 0)
            result = DashboardSyncResponse.model_validate_json(output.getvalue())
            self.assertEqual(
                [(item.source.value, item.status.value, item.records) for item in result.sources],
                [
                    ("bracelet", "success", 3),
                    ("welltory", "success", 2),
                    ("rescuetime", "success", 10),
                    ("todoist", "success", 6),
                ],
            )
            self.assertEqual(collect_rescuetime.call_count, 2)
            self.assertEqual(collect_todoist.call_count, 2)
            collect_rescuetime.assert_any_call(config, date(2026, 9, 14))
            collect_rescuetime.assert_any_call(config, date(2026, 9, 15))
            with connect(config.database) as conn:
                runs = conn.execute(
                    "SELECT source, logical_date, status FROM source_runs ORDER BY source, logical_date"
                ).fetchall()
            self.assertEqual(len(runs), 8)
            self.assertEqual({row["status"] for row in runs}, {"success"})


if __name__ == "__main__":
    unittest.main()
