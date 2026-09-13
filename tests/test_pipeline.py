from __future__ import annotations

from dataclasses import replace
from datetime import date, datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from contextlib import ExitStack, redirect_stderr, redirect_stdout
from io import StringIO
import csv
import json
import os
import sqlite3
import unittest
from unittest.mock import patch

from live_life.collectors import collect_todoist
from live_life.config import Config, ensure_layout
from live_life.cli import _date_range
from live_life.db import connect, insert_metric
from live_life.fitness_drive import FOLDER_MIME_TYPE, sync_fitness_drive
from live_life.importers import import_fitness_drive, import_inbox, import_welltory
from live_life.report import generate_report
from form_reports import (
    FreshnessProgress,
    SourceApprovalRequired,
    data_freshness,
    format_data_freshness,
    form_reports,
    inclusive_days,
    latest_report_day,
    main as form_reports_main,
    prompt_for_approval,
)


class PipelineTest(unittest.TestCase):
    def test_source_progress_resolves_after_saved_data_before_reports(self):
        """Verify source progress resolves after saved data before reports."""
        self.config.reports.mkdir(exist_ok=True)
        (self.config.reports / "2026-09-01.md").write_text("old")
        (self.config.welltory_downloads / "WELLTORY_sample.csv").write_text("Date\n")
        events = []
        sources = ["Fitness bracelet (Google Drive)", "Welltory", "Diary", "RescueTime", "Todoist"]

        def stage(name):
            """Build a fake pipeline stage that records when it runs."""
            def run(*args):
                """Record the fake stage invocation and return an empty result."""
                events.append(name)
                return {}
            return run

        def collect_todoist(config, day):
            """Record collection and insert a synthetic task to exercise freshness updates."""
            events.append("todoist " + day.isoformat())
            with connect(config.database) as conn:
                conn.execute(
                    "INSERT INTO completed_tasks "
                    "(source, external_id, content, project_id, completed_at, payload_json, imported_at) "
                    "VALUES ('todoist', ?, '', NULL, ?, '{}', '')",
                    (day.isoformat(), day.isoformat() + "T18:30:00+03:00"),
                )
            return {}

        def resolved(source, value):
            """Capture a source completion notification in the event log."""
            events.append((source, value))

        def save_report(*args):
            """Check that every source resolved before recording report generation."""
            self.assertEqual([e[0] for e in events if isinstance(e, tuple)], sources)
            events.append("report saved")
            return "report.md"

        with ExitStack() as stack:
            for name in ("sync_fitness_drive", "import_fitness_drive", "import_welltory",
                         "import_inbox", "sync_diary_drive", "collect_rescuetime"):
                stack.enter_context(patch("form_reports." + name, side_effect=stage(name)))
            stack.enter_context(patch("form_reports.collect_todoist", side_effect=collect_todoist))
            stack.enter_context(patch("form_reports.generate_report", side_effect=save_report))
            result = form_reports(self.config, today=date(2026, 9, 2), on_source_finished=resolved)

        self.assertLess(events.index((sources[0], "no records")), events.index("import_welltory"))
        self.assertLess(events.index(("Diary", "no records")), events.index("collect_rescuetime"))
        self.assertGreater(events.index(("RescueTime", "no records")), events.index("todoist 2026-09-01"))
        self.assertIn(("Todoist", "02/09/2026 18:30:00"), events)
        self.assertFalse(result["data_freshness"]["incomplete"])
        self.assertEqual(events[-2:], ["report saved", "report saved"])

    def test_partial_summary_does_not_display_success_timestamp(self):
        """Verify partial summary does not display success timestamp."""
        summary = {
            "reported_at": "2026-09-10T21:00:00+03:00",
            "sources": {"Todoist": "2026-09-09T18:00:00+03:00"},
            "source_status": {"Todoist": "failed"},
            "incomplete": True,
        }
        self.assertEqual(format_data_freshness(summary),
                         "Data freshness — incomplete\n- Todoist: failed")

    def test_terminal_progress_is_visible_during_work_and_cleared_on_failure(self):
        """Verify terminal progress is visible during work and cleared on failure."""
        stdout = StringIO()
        stdout.isatty = lambda: True

        def fail_during_work(*args, **kwargs):
            """Check that progress is visible before simulating a collection failure."""
            self.assertIn("Data freshness — ⠋\n", stdout.getvalue())
            self.assertIn("- Diary: ⠋\n", stdout.getvalue())
            raise RuntimeError("collection failed")

        with redirect_stdout(stdout), patch("form_reports.load_config"), patch(
            "form_reports.form_reports", side_effect=fail_during_work
        ):
            with self.assertRaisesRegex(RuntimeError, "collection failed"):
                form_reports_main()
        self.assertTrue(stdout.getvalue().endswith("\033[1A\r\033[2K" * 6))

    def test_terminal_progress_pauses_for_approval_and_resumes(self):
        """Verify terminal progress pauses for approval and resumes."""
        stdout = StringIO()
        stdout.isatty = lambda: True
        with redirect_stdout(stdout):
            progress = FreshnessProgress()

            def approve(issues):
                """Check that animation is paused while granting source approval."""
                self.assertIsNone(progress.thread)
                self.assertFalse(progress.visible)
                return True

            try:
                progress.start()
                with patch("form_reports.prompt_for_approval", side_effect=approve):
                    self.assertTrue(progress.approve(["Source unavailable"]))
                self.assertTrue(progress.visible)
                self.assertTrue(progress.thread.is_alive())
            finally:
                progress.stop()

    @patch("form_reports.collect_todoist", return_value={"completed": 0})
    @patch("form_reports.collect_rescuetime", return_value={"events": 0})
    @patch("form_reports.import_welltory", return_value={"files": 0})
    @patch("form_reports.import_inbox", return_value={"files": 0})
    def test_form_reports_recreates_latest_day_through_today(
        self, import_inbox_mock, import_welltory_mock, rescuetime_mock, todoist_mock
    ):
        """Verify form reports recreates latest day through today."""
        self.config.reports.mkdir(exist_ok=True)
        (self.config.reports / "2026-08-30.md").write_text("old", encoding="utf-8")
        (self.config.reports / "2026-08-31.md").write_text("incomplete", encoding="utf-8")
        (self.config.reports / "notes.md").write_text("ignore", encoding="utf-8")

        result = form_reports(
            self.config,
            today=date(2026, 9, 2),
            approve_unavailable=lambda issues: True,
        )

        self.assertEqual(latest_report_day(self.config.reports), date(2026, 9, 2))
        self.assertEqual(
            [item["date"] for item in result["days"]],
            ["2026-08-31", "2026-09-01", "2026-09-02"],
        )
        self.assertNotEqual(
            (self.config.reports / "2026-08-31.md").read_text(encoding="utf-8"),
            "incomplete",
        )
        import_inbox_mock.assert_called_once_with(self.config)
        import_welltory_mock.assert_called_once_with(self.config, [])
        self.assertEqual(rescuetime_mock.call_count, 3)
        self.assertEqual(todoist_mock.call_count, 3)

    @patch("form_reports.collect_todoist", return_value={"skipped_no_token": 1})
    @patch("form_reports.collect_rescuetime", return_value={"skipped_no_token": 1})
    @patch("form_reports.import_welltory", return_value={"files": 0})
    @patch("form_reports.import_inbox", return_value={"diary_entries": 0})
    @patch("form_reports.import_fitness_drive", return_value={"files": 0})
    @patch("form_reports.sync_fitness_drive", return_value={"skipped_not_authorized": 1})
    def test_form_reports_requires_approval_when_sources_are_unavailable(
        self,
        drive_sync_mock,
        drive_import_mock,
        import_inbox_mock,
        import_welltory_mock,
        rescuetime_mock,
        todoist_mock,
    ):
        """Verify form reports requires approval when sources are unavailable."""
        self.config.reports.mkdir(exist_ok=True)
        report = self.config.reports / "2026-09-01.md"
        report.write_text("unchanged", encoding="utf-8")

        with self.assertRaisesRegex(SourceApprovalRequired, "Google Drive"):
            form_reports(self.config, today=date(2026, 9, 1))

        self.assertEqual(report.read_text(encoding="utf-8"), "unchanged")

    @patch("form_reports.collect_todoist", return_value={"skipped_no_token": 1})
    @patch("form_reports.collect_rescuetime", return_value={"skipped_no_token": 1})
    @patch("form_reports.import_welltory", return_value={"files": 0})
    @patch("form_reports.import_inbox", return_value={"diary_entries": 0})
    @patch("form_reports.import_fitness_drive", return_value={"files": 0})
    @patch("form_reports.sync_fitness_drive", return_value={"skipped_not_authorized": 1})
    def test_form_reports_continues_after_explicit_approval(
        self,
        drive_sync_mock,
        drive_import_mock,
        import_inbox_mock,
        import_welltory_mock,
        rescuetime_mock,
        todoist_mock,
    ):
        """Verify form reports continues after explicit approval."""
        self.config.reports.mkdir(exist_ok=True)
        report = self.config.reports / "2026-09-01.md"
        report.write_text("old", encoding="utf-8")
        seen = []

        form_reports(
            self.config,
            today=date(2026, 9, 1),
            approve_unavailable=lambda issues: seen.extend(issues) or True,
        )

        self.assertTrue(any("Google Drive" in issue for issue in seen))
        self.assertTrue(any("RescueTime" in issue for issue in seen))
        self.assertTrue(any("Todoist" in issue for issue in seen))
        self.assertNotEqual(report.read_text(encoding="utf-8"), "old")

    @patch("form_reports.collect_todoist", return_value={"completed": 0, "created": 0})
    @patch("form_reports.collect_rescuetime", return_value={"events": 0})
    @patch("form_reports.import_welltory", return_value={"files": 1})
    @patch("form_reports.import_inbox", return_value={"diary_entries": 0})
    @patch("form_reports.import_fitness_drive", return_value={"files": 0})
    @patch("form_reports.sync_fitness_drive", return_value={"files": 0, "downloaded": 0})
    def test_form_reports_does_not_request_approval_when_sources_are_available(
        self,
        drive_sync_mock,
        drive_import_mock,
        import_inbox_mock,
        import_welltory_mock,
        rescuetime_mock,
        todoist_mock,
    ):
        """Verify form reports does not request approval when sources are available."""
        self.config.reports.mkdir(exist_ok=True)
        (self.config.reports / "2026-09-01.md").write_text("old", encoding="utf-8")
        (self.config.welltory_downloads / "WELLTORY_sample.csv").write_text(
            "Date,Stress(HRV)\n", encoding="utf-8"
        )
        approval = unittest.mock.Mock(return_value=True)

        result = form_reports(
            self.config,
            today=date(2026, 9, 1),
            approve_unavailable=approval,
        )

        approval.assert_not_called()
        self.assertNotIn("approved_unavailable_sources", result)

    @patch("form_reports.collect_todoist", side_effect=OSError("Todoist offline"))
    @patch("form_reports.collect_rescuetime", side_effect=OSError("network down"))
    @patch("form_reports.import_welltory", return_value={"files": 1})
    @patch("form_reports.import_inbox", return_value={"diary_entries": 0})
    @patch("form_reports.import_fitness_drive", return_value={"files": 0})
    @patch("form_reports.sync_fitness_drive", return_value={"files": 0, "downloaded": 0})
    def test_form_reports_requests_approval_for_network_failure_and_stops_retrying_source(
        self,
        drive_sync_mock,
        drive_import_mock,
        import_inbox_mock,
        import_welltory_mock,
        rescuetime_mock,
        todoist_mock,
    ):
        """Verify form reports requests approval for network failure and stops retrying source."""
        self.config.reports.mkdir(exist_ok=True)
        (self.config.reports / "2026-09-01.md").write_text("old", encoding="utf-8")
        (self.config.welltory_downloads / "WELLTORY_sample.csv").write_text(
            "Date,Stress(HRV)\n", encoding="utf-8"
        )
        seen = []

        result = form_reports(
            self.config,
            today=date(2026, 9, 2),
            approve_unavailable=lambda issues: seen.extend(issues) or True,
        )

        self.assertEqual(rescuetime_mock.call_count, 1)
        self.assertEqual(todoist_mock.call_count, 1)
        self.assertIn("OSError: network down", "\n".join(seen))
        self.assertIn("OSError: Todoist offline", "\n".join(seen))
        self.assertEqual(result["days"][1]["rescuetime"], {"skipped_after_source_failure": 1})
        self.assertEqual(result["days"][1]["todoist"], {"skipped_after_source_failure": 1})

    @patch("form_reports.collect_todoist", return_value={"skipped_no_token": 1})
    @patch("form_reports.collect_rescuetime", return_value={"events": 0})
    @patch("form_reports.import_welltory", return_value={"files": 1})
    @patch("form_reports.import_inbox", return_value={"diary_entries": 0})
    @patch("form_reports.import_fitness_drive", return_value={"files": 0})
    @patch("form_reports.sync_fitness_drive", return_value={"files": 0, "downloaded": 0})
    def test_form_reports_preserves_report_when_human_denies_approval(
        self,
        drive_sync_mock,
        drive_import_mock,
        import_inbox_mock,
        import_welltory_mock,
        rescuetime_mock,
        todoist_mock,
    ):
        """Verify form reports preserves report when human denies approval."""
        self.config.reports.mkdir(exist_ok=True)
        report = self.config.reports / "2026-09-01.md"
        report.write_text("unchanged", encoding="utf-8")
        (self.config.welltory_downloads / "WELLTORY_sample.csv").write_text(
            "Date,Stress(HRV)\n", encoding="utf-8"
        )

        with self.assertRaisesRegex(SourceApprovalRequired, "approval was not granted"):
            form_reports(
                self.config,
                today=date(2026, 9, 1),
                approve_unavailable=lambda issues: False,
            )

        self.assertEqual(report.read_text(encoding="utf-8"), "unchanged")

    def test_approval_prompt_requires_terminal_and_accepts_explicit_yes(self):
        """Verify approval prompt requires terminal and accepts explicit yes."""
        stderr = StringIO()
        with patch("form_reports.sys.stdin.isatty", return_value=False):
            with redirect_stderr(stderr):
                self.assertFalse(prompt_for_approval(["Todoist token is missing."]))
        self.assertIn("non-interactive", stderr.getvalue())

        with patch("form_reports.sys.stdin.isatty", return_value=True):
            with patch("builtins.input", return_value="yes"):
                with redirect_stderr(StringIO()):
                    self.assertTrue(prompt_for_approval(["RescueTime is unavailable."]))

    def test_approval_prompt_rejects_interrupted_input(self):
        """Verify approval prompt rejects interrupted input."""
        with patch("form_reports.sys.stdin.isatty", return_value=True):
            with patch("builtins.input", side_effect=EOFError):
                with redirect_stderr(StringIO()):
                    self.assertFalse(prompt_for_approval(["Welltory export is missing."]))

    @patch("form_reports.load_config", return_value="config")
    @patch("form_reports.form_reports", return_value={"days": []})
    def test_form_reports_main_prints_result_and_returns_success(
        self, form_reports_mock, load_config_mock
    ):
        """Verify form reports main prints result and returns success."""
        form_reports_mock.return_value = {
            "days": [],
            "data_freshness": {
                "reported_at": "2026-09-10T12:00:00+03:00",
                "sources": {"Welltory": "2026-09-10T10:00:00+03:00"},
            },
        }
        stdout = StringIO()
        with redirect_stdout(stdout):
            exit_status = form_reports_main()

        self.assertEqual(exit_status, 0)
        self.assertEqual(
            stdout.getvalue(),
            "Data freshness — 10/09/2026 12:00:00\n"
            "- Welltory: 10/09/2026 10:00:00\n",
        )

    def test_data_freshness_reports_latest_record_for_each_source(self):
        """Verify data freshness reports latest record for each source."""
        with connect(self.config.database) as conn:
            insert_metric(
                conn,
                source="welltory",
                external_id="measurement-1",
                occurred_at="2026-09-10T07:30:00+00:00",
                metric="welltory.SDNN",
                value_num=42,
                value_text=None,
                unit="ms",
                payload={},
            )
            conn.execute(
                """
                INSERT INTO completed_tasks
                (source, external_id, content, project_id, completed_at, payload_json, imported_at)
                VALUES ('todoist', 'task-1', '', NULL, '2026-09-10T08:00:00+00:00', '{}', '')
                """
            )
            conn.execute(
                """
                INSERT INTO journal_entries(logical_date, content, source_path, imported_at)
                VALUES ('2026-09-09', '', '', '')
                """
            )

        summary = data_freshness(
            self.config,
            datetime.fromisoformat("2026-09-10T12:00:00+03:00"),
        )

        self.assertEqual(summary["sources"]["Welltory"], "2026-09-10T10:30:00+03:00")
        self.assertEqual(summary["sources"]["Todoist"], "2026-09-10T11:00:00+03:00")
        self.assertEqual(summary["sources"]["Diary"], "2026-09-09")
        self.assertIsNone(summary["sources"]["RescueTime"])
        self.assertIn("- RescueTime: no records", format_data_freshness(summary))

    @patch("form_reports.load_config", return_value="config")
    @patch(
        "form_reports.form_reports",
        side_effect=SourceApprovalRequired(["Todoist token is missing."], denied=True),
    )
    def test_form_reports_main_returns_two_when_approval_is_not_granted(
        self, form_reports_mock, load_config_mock
    ):
        """Verify form reports main returns two when approval is not granted."""
        stderr = StringIO()
        with redirect_stderr(stderr):
            exit_status = form_reports_main()

        self.assertEqual(exit_status, 2)
        self.assertIn("Todoist token is missing", stderr.getvalue())

    def test_date_range_is_inclusive(self):
        """Verify date range is inclusive."""
        self.assertEqual(
            list(_date_range(date(2026, 8, 30), date(2026, 9, 1))),
            [date(2026, 8, 30), date(2026, 8, 31), date(2026, 9, 1)],
        )
        with self.assertRaisesRegex(ValueError, "--to"):
            list(_date_range(date(2026, 9, 1), date(2026, 8, 31)))

        with self.assertRaisesRegex(RuntimeError, "after today"):
            list(inclusive_days(date(2026, 9, 2), date(2026, 9, 1)))

    def test_latest_report_day_explains_how_to_create_first_report(self):
        """Verify latest report day explains how to create first report."""
        with self.assertRaisesRegex(RuntimeError, "create the first report"):
            latest_report_day(self.config.reports)

    def test_todoist_recovers_creation_time_from_completed_tasks(self):
        """Verify todoist recovers creation time from completed tasks."""
        completed = {
            "items": [
                {
                    "id": "task-1",
                    "content": "private task",
                    "project_id": "project-1",
                    "added_at": "2026-08-10T08:00:00Z",
                    "completed_at": "2026-08-10T10:00:00Z",
                }
            ],
            "next_cursor": None,
        }
        active = {"results": [], "next_cursor": None}
        with patch.dict(os.environ, {"TEST_TODOIST_TOKEN": "test-token"}):
            with patch("live_life.collectors._get_json", side_effect=[completed, active]):
                result = collect_todoist(self.config, date(2026, 8, 10))

        self.assertEqual(result["completed"], 1)
        self.assertEqual(result["created"], 1)
        with connect(self.config.database) as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM created_tasks").fetchone()[0], 1)

    def setUp(self):
        """Create isolated temporary paths and configuration for each test."""
        self.temp = TemporaryDirectory()
        root = Path(self.temp.name)
        self.config = Config(
            root=root,
            timezone="Europe/Moscow",
            day_boundary_hour=5,
            database=root / "data/life.db",
            inbox=root / "data/inbox",
            reports=root / "data/reports",
            welltory_downloads=root / "downloads",
            welltory_pattern="WELLTORY*.csv",
            rescuetime_key_env="TEST_RESCUETIME_KEY",
            todoist_token_env="TEST_TODOIST_TOKEN",
        )
        ensure_layout(self.config)
        self.config.welltory_downloads.mkdir()

    def tearDown(self):
        """Remove temporary test files and databases."""
        self.temp.cleanup()

    def write_sample(self) -> Path:
        """Write a synthetic Welltory CSV fixture and return its path."""
        path = self.config.welltory_downloads / "WELLTORY_sample.csv"
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(
                handle,
                fieldnames=["Date", "Time", "Stress(HRV)", "SDNN", "Health"],
            )
            writer.writeheader()
            writer.writerow(
                {"Date": "2026-07-17T04:30:00", "Time": "2026-07-17T04:30:00", "Stress(HRV)": "60", "SDNN": "30", "Health": "ok"}
            )
            writer.writerow(
                {"Date": "2026-07-17T05:30:00", "Time": "2026-07-17T05:30:00", "Stress(HRV)": "40", "SDNN": "50", "Health": "ok"}
            )
        return path

    def test_import_is_idempotent_and_boundary_is_applied(self):
        """Verify import is idempotent and boundary is applied."""
        path = self.write_sample()
        first = import_welltory(self.config, [path])
        second = import_welltory(self.config, [path])
        self.assertEqual(first["rows"], 2)
        self.assertEqual(second["files"], 0)

        report_16 = generate_report(self.config, date(2026, 7, 16)).read_text()
        report_17 = generate_report(self.config, date(2026, 7, 17)).read_text()
        self.assertIn("Stress (HRV): avg 60", report_16)
        self.assertIn("Stress (HRV): avg 40", report_17)

        with connect(self.config.database) as conn:
            count = conn.execute("SELECT COUNT(*) FROM metric_events").fetchone()[0]
        self.assertEqual(count, 6)

    def test_report_keeps_diary_content_private(self):
        """Verify report keeps diary content private."""
        diary_dir = self.config.inbox / "diary"
        (diary_dir / "2026-07-17.md").write_text("private reflection", encoding="utf-8")
        import_inbox(self.config)
        report = generate_report(self.config, date(2026, 7, 17)).read_text()
        self.assertIn("Entry imported (18 characters; kept private", report)
        self.assertNotIn("private reflection", report)

    def test_report_labels_rescuetime_productivity_levels(self):
        """Verify report labels rescuetime productivity levels."""
        productivity_levels = {
            "-2": "Distracting",
            "-1": "Personal",
            "0": "Neutral",
            "1": "Other Work",
            "2": "Focus Work",
        }
        with connect(self.config.database) as conn:
            for code in productivity_levels:
                insert_metric(
                    conn,
                    source="rescuetime",
                    external_id=f"productivity-{code}",
                    occurred_at="2026-08-12T12:00:00+00:00",
                    metric=f"rescuetime.seconds.productivity.{code}",
                    value_num=3600,
                    value_text=None,
                    unit="seconds",
                    payload={"Productivity": int(code)},
                )

        report = generate_report(self.config, date(2026, 8, 12)).read_text()

        for code, label in productivity_levels.items():
            self.assertIn(f"- {label}: 1.00 h", report)
            self.assertNotIn(f"- {code}: 1.00 h", report)

    def test_retired_local_health_is_ignored_and_preserved(self):
        """Verify retired local health is ignored and preserved."""
        health = self.config.inbox / "health"
        self.assertFalse(health.exists())
        health.mkdir()
        legacy = health / "steps.csv"
        legacy.write_text("Date,Time,Steps\n2026.07.18 10:00:00,10:00:00,42\n")
        self.assertEqual(import_inbox(self.config), {"diary_entries": 0})
        with connect(self.config.database) as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM metric_events").fetchone()[0], 0)
            for metric in ("steps", "heart_rate", "sleep.deep_seconds"):
                insert_metric(conn, source="health_sync", external_id=metric,
                              occurred_at="2026-07-18T10:00:00+00:00",
                              metric="health_sync." + metric, value_num=42,
                              value_text=None, unit=None, payload={})
        report = generate_report(self.config, date(2026, 7, 18)).read_text()
        self.assertIn("No Google Drive fitness export imported", report)
        self.assertNotIn("health_sync", report)
        self.assertNotIn("- Steps:", report)
        self.assertNotIn("- Heart rate:", report)
        self.assertNotIn("- Sleep stages recorded:", report)
        self.assertNotIn("Local health inbox", data_freshness(self.config)["sources"])
        self.assertTrue(legacy.exists())
        with connect(self.config.database) as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM metric_events").fetchone()[0], 3)

    def test_syncs_year_month_files_and_optional_day_folders(self):
        """Verify syncs year month files and optional day folders."""
        cache = self.config.root / "data/inbox/fitness_drive"
        config = replace(
            self.config,
            fitness_drive_folder_id="root",
            fitness_drive_cache=cache,
        )
        document = {
            "header": {"schemaVersion": 1, "recordCount": 0},
            "records": [],
        }

        class FakeReader:
            children = {
                "root": [{"id": "year", "name": "2026", "mimeType": FOLDER_MIME_TYPE}],
                "year": [{"id": "month", "name": "07", "mimeType": FOLDER_MIME_TYPE}],
                "month": [
                    {"id": "direct", "name": "direct.json", "mimeType": "application/json", "modifiedTime": "1"},
                    {"id": "day", "name": "18", "mimeType": FOLDER_MIME_TYPE},
                ],
                "day": [{"id": "nested", "name": "nested.json", "mimeType": "application/json", "modifiedTime": "1"}],
            }

            def list_children(self, folder_id):
                """Return the synthetic folder contents without contacting Google Drive."""
                return self.children.get(folder_id, [])

            def download(self, file_id, destination):
                """Write the synthetic export document to the requested cache path."""
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_text(json.dumps(document), encoding="utf-8")

        first = sync_fitness_drive(config, date(2026, 7, 18), date(2026, 7, 18), reader=FakeReader())
        second = sync_fitness_drive(config, date(2026, 7, 18), date(2026, 7, 18), reader=FakeReader())

        self.assertEqual(
            first,
            {
                "files": 2,
                "downloaded": 2,
                "changed_files": 2,
                "missing_files": 0,
                "skipped_not_authorized": 0,
            },
        )
        self.assertEqual(second["downloaded"], 0)

    def test_sync_rename_replaces_cached_path_and_import_projection(self):
        """Verify a renamed Drive item removes its previous cached projection."""
        cache = self.config.root / "data/inbox/fitness_drive"
        config = replace(
            self.config,
            fitness_drive_folder_id="root",
            fitness_drive_cache=cache,
        )
        document = {
            "header": {"schemaVersion": 1, "recordCount": 1},
            "records": [
                {
                    "recordType": "steps",
                    "startTime": "2026-07-18T10:00:00Z",
                    "endTime": "2026-07-18T10:15:00Z",
                    "count": 1250,
                }
            ],
        }

        class FakeReader:
            name = "before.json"

            def list_children(self, folder_id):
                """Return one mutable synthetic Drive item."""
                if folder_id == "root":
                    return [{"id": "year", "name": "2026", "mimeType": FOLDER_MIME_TYPE}]
                if folder_id == "year":
                    return [{"id": "month", "name": "07", "mimeType": FOLDER_MIME_TYPE}]
                if folder_id == "month":
                    return [{
                        "id": "same-id",
                        "name": self.name,
                        "mimeType": "application/json",
                        "modifiedTime": "1",
                    }]
                return []

            def download(self, file_id, destination):
                """Write the synthetic export document to the requested cache path."""
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_text(json.dumps(document), encoding="utf-8")

        reader = FakeReader()
        sync_fitness_drive(config, date(2026, 7, 18), date(2026, 7, 18), reader=reader)
        import_fitness_drive(config)
        old_path = (cache / "same-id--before.json").resolve()
        new_path = (cache / "same-id--after.json").resolve()

        reader.name = "after.json"
        sync_fitness_drive(config, date(2026, 7, 18), date(2026, 7, 18), reader=reader)

        self.assertFalse(old_path.exists())
        self.assertTrue(new_path.exists())
        with connect(config.database) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT COUNT(*) FROM metric_events WHERE origin_file = ?",
                    (str(old_path),),
                ).fetchone()[0],
                0,
            )
            self.assertEqual(
                conn.execute(
                    "SELECT COUNT(*) FROM import_files WHERE path = ?",
                    (str(old_path),),
                ).fetchone()[0],
                0,
            )

        import_fitness_drive(config)
        with connect(config.database) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT origin_file FROM metric_events WHERE source = 'fitness_drive'"
                ).fetchone()[0],
                str(new_path),
            )

    def test_imports_drive_schema_and_ignores_retired_csv(self):
        """Verify imports drive schema and ignores retired csv."""
        cache = self.config.root / "data/inbox/fitness_drive"
        cache.mkdir(parents=True)
        config = replace(self.config, fitness_drive_cache=cache)
        document = {
            "header": {"schemaVersion": 1, "recordCount": 3},
            "records": [
                {
                    "recordType": "steps",
                    "origin": "com.xiaomi.wearable",
                    "startTime": "2026-07-18T10:00:00Z",
                    "endTime": "2026-07-18T10:15:00Z",
                    "count": 1250,
                },
                {
                    "recordType": "heart_rate",
                    "origin": "com.xiaomi.wearable",
                    "startTime": "2026-07-18T10:00:00Z",
                    "endTime": "2026-07-18T10:05:00Z",
                    "samples": [
                        {"time": "2026-07-18T10:01:00Z", "beatsPerMinute": 72},
                        {"time": "2026-07-18T10:03:00Z", "beatsPerMinute": 78},
                    ],
                },
                {
                    "recordType": "sleep_session",
                    "origin": "com.xiaomi.wearable",
                    "startTime": "2026-07-18T00:30:00Z",
                    "endTime": "2026-07-18T02:30:00Z",
                    "stages": [
                        {"startTime": "2026-07-18T00:30:00Z", "endTime": "2026-07-18T02:30:00Z", "stage": 5}
                    ],
                },
            ],
        }
        (cache / "batch.json").write_text(json.dumps(document), encoding="utf-8")
        legacy = config.inbox / "health" / "steps.csv"
        legacy.parent.mkdir()
        legacy.write_text(
            "Date,Time,Steps\n2026.07.18 13:00:00,13:00:00,999\n", encoding="utf-8"
        )

        result = import_fitness_drive(config)
        import_inbox(config)
        report = generate_report(config, date(2026, 7, 18)).read_text()
        previous_report = generate_report(config, date(2026, 7, 17)).read_text()

        self.assertEqual(result["records"], 3)
        self.assertEqual(result["metrics"], 4)
        self.assertIn("## Fitness tracker (Google Drive)", report)
        self.assertIn("Steps: 1250", report)
        self.assertNotIn("2249", report)
        self.assertIn("Heart rate: avg 75 bpm", report)
        self.assertIn("Sleep stages recorded: 2.00 h", previous_report)


if __name__ == "__main__":
    unittest.main()
