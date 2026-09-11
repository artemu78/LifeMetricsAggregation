from dataclasses import replace
from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import MagicMock, patch

from live_life.config import load_config, ensure_layout
from live_life.db import connect
from live_life.diary_drive import parse_diary, sync_diary_drive
from live_life.importers import import_inbox
from form_reports import form_reports, SourceApprovalRequired


class DiaryTest(TestCase):
    def setUp(self):
        """Create isolated temporary paths and configuration for each test."""
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.config = replace(load_config(Path(__file__).resolve().parents[1]),
                              database=root / 'life.db', inbox=root / 'inbox',
                              reports=root / 'data/reports', welltory_downloads=root,
                              fitness_drive_cache=None)
        ensure_layout(self.config)
        self.reader = MagicMock()

    def sync(self, text):
        """Supply a synthetic document export and synchronize it through the mocked reader."""
        self.reader.service.files.return_value.export_media.return_value.execute.return_value = text.encode()
        return sync_diary_drive(self.config, reader=self.reader)

    def entries(self):
        """Read the stored diary entries as a date-to-content mapping."""
        with connect(self.config.database) as conn:
            return dict(conn.execute('SELECT logical_date, content FROM journal_entries').fetchall())

    def test_parse_formats_repeated_dates_and_empty_sections(self):
        """Verify parse formats repeated dates and empty sections."""
        self.assertEqual(parse_diary('\ufeffTitle\n3.01.2026\nFirst\n# 2026-01-04\nNext\n3.01.2026\nAgain\n5.01.2026\n'),
                         {'2026-01-03': 'First\nAgain', '2026-01-04': 'Next'})
        for value in ('No dates', '31.02.2026\nText'):
            with self.assertRaises(ValueError):
                parse_diary(value)

    def test_sync_edits_deletions_idempotency_and_local_precedence(self):
        """Verify sync edits deletions idempotency and local precedence."""
        self.sync('3.01.2026\nOriginal\n4.01.2026\nRemove')
        self.sync('3.01.2026\nEdited')
        self.sync('3.01.2026\nEdited')
        (self.config.inbox / 'diary' / '2026-01-03.md').write_text('Stale')
        import_inbox(self.config)
        self.assertEqual(self.entries(), {'2026-01-03': 'Edited'})
        self.reader.service.files.return_value.export_media.assert_called_with(
            fileId=self.config.diary_google_doc_id, mimeType='text/plain')

    def test_invalid_export_preserves_previous_entries(self):
        """Verify invalid export preserves previous entries."""
        self.sync('3.01.2026\nOriginal')
        with self.assertRaises(ValueError):
            self.sync('Unrecognized document')
        self.assertEqual(self.entries(), {'2026-01-03': 'Original'})

    def test_diary_failure_requires_approval_and_preserves_report(self):
        """Verify diary failure requires approval and preserves report."""
        today = date(2026, 9, 10)
        report = self.config.reports / '2026-09-10.md'
        report.write_text('unchanged')
        with patch('form_reports.sync_diary_drive', side_effect=RuntimeError('Unavailable')), \
             patch('form_reports.sync_fitness_drive', return_value={}), \
             patch('form_reports.import_fitness_drive', return_value={}), \
             patch('form_reports.import_welltory', return_value={}), \
             patch('form_reports.collect_rescuetime', return_value={}), \
             patch('form_reports.collect_todoist', return_value={}):
            with self.assertRaises(SourceApprovalRequired) as caught:
                form_reports(self.config, today=today)
        self.assertTrue(any('Diary / Google Drive failed' in issue for issue in caught.exception.issues))
        self.assertEqual(report.read_text(), 'unchanged')
