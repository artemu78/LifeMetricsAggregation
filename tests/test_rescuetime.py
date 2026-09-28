import json
import os
from dataclasses import replace
from datetime import date
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from live_life.collectors import _retry_delay_seconds, collect_rescuetime
from live_life.config import load_config
from live_life.db import connect


class RescueTimeDiagnosticsTest(TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        self.config = replace(load_config(), root=root, database=root / 'life.db')
        self.env = patch.dict(os.environ, {self.config.rescuetime_key_env: 'secret-test-token'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.log = root / 'data/logs/rescuetime.jsonl'

    def records(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()]

    def test_retry_delay_is_bounded_and_invalid_header_uses_fallback(self):
        self.assertEqual(_retry_delay_seconds('999', 0), 30.0)
        self.assertEqual(_retry_delay_seconds('invalid', 1), 2)

    def test_handshake_timeout_is_logged_without_credentials(self):
        with patch('live_life.collectors.urlopen', side_effect=URLError(TimeoutError('secret-test-token'))):
            with self.assertRaisesRegex(RuntimeError, 'connection_or_response.*TimeoutError'):
                collect_rescuetime(self.config, date(2026, 9, 11))
        records = self.records()
        self.assertEqual(
            [r['event'] for r in records],
            ['request_started', 'request_failed', 'request_started', 'request_failed'],
        )
        self.assertEqual([r['taxonomy'] for r in records], ['productivity'] * 2 + ['activity'] * 2)
        self.assertEqual(records[-1]['reason_type'], 'TimeoutError')
        self.assertEqual(records[-1]['taxonomy'], 'activity')
        self.assertNotIn('secret-test-token', self.log.read_text())
        self.assertEqual(self.log.stat().st_mode & 0o777, 0o600)

    def test_http_error_logs_status_without_body_or_url(self):
        error = HTTPError('https://example.invalid/?key=secret-test-token', 401,
                          'secret-test-token', {}, BytesIO(b'private response'))
        with patch('live_life.collectors.urlopen', side_effect=error):
            with self.assertRaisesRegex(RuntimeError, 'HTTP 401'):
                collect_rescuetime(self.config, date(2026, 9, 11))
        self.assertEqual(self.records()[-1]['http_status'], 401)
        self.assertNotIn('secret-test-token', self.log.read_text())
        self.assertNotIn('private response', self.log.read_text())

    def test_transient_http_error_is_retried(self):
        error = HTTPError(
            'https://example.invalid', 502, 'Bad Gateway',
            {'Retry-After': '7'}, BytesIO(b''),
        )
        payload = json.dumps({'row_headers': [], 'rows': []}).encode()
        with patch('live_life.collectors.sleep') as wait, patch(
                'live_life.collectors.urlopen',
                side_effect=[error, BytesIO(payload), BytesIO(payload)],
                ) as request:
            result = collect_rescuetime(self.config, date(2026, 9, 11))
        self.assertEqual(result['queries'], 2)
        self.assertEqual(request.call_count, 3)
        wait.assert_called_once_with(7.0)
        self.assertIn('request_retrying', [record['event'] for record in self.records()])

    def test_retry_uses_bounded_fallback_and_activity_runs_after_productivity_fails(self):
        errors = [
            HTTPError('https://example.invalid', 502, 'Bad Gateway', {}, BytesIO(b''))
            for _ in range(3)
        ]
        payload = json.dumps({'row_headers': [], 'rows': []}).encode()
        day = date(2026, 9, 11)
        with patch('live_life.collectors.sleep') as wait, patch(
                'live_life.collectors.urlopen',
                side_effect=[*errors, BytesIO(payload)],
            ) as request:
            with self.assertRaisesRegex(RuntimeError, 'productivity'):
                collect_rescuetime(self.config, day)

        self.assertEqual(request.call_count, 4)
        self.assertEqual([call.args[0] for call in wait.call_args_list], [1, 2])
        self.assertIn(
            {'event': 'request_succeeded', 'taxonomy': 'activity'},
            [
                {'event': record['event'], 'taxonomy': record.get('taxonomy')}
                for record in self.records()
            ],
        )

    def test_invalid_json_identifies_decode_stage(self):
        with patch(
            'live_life.collectors.urlopen',
            side_effect=lambda *args, **kwargs: BytesIO(b'not json'),
        ):
            with self.assertRaisesRegex(RuntimeError, 'decode_json'):
                collect_rescuetime(self.config, date(2026, 9, 11))
        self.assertEqual(self.records()[-1]['stage'], 'decode_json')

    def test_success_logs_requests_and_commit(self):
        payload = json.dumps({'row_headers': [], 'rows': []}).encode()
        with patch('live_life.collectors.urlopen', side_effect=lambda *a, **k: BytesIO(payload)):
            result = collect_rescuetime(self.config, date(2026, 9, 11))
        self.assertEqual(result['queries'], 2)
        self.assertEqual([r['event'] for r in self.records()],
                         ['request_started', 'request_succeeded', 'request_started',
                          'request_succeeded', 'collection_saved'])

    def test_error_envelope_is_not_treated_as_empty_success(self):
        with patch('live_life.collectors.urlopen', return_value=BytesIO(b'{"error":"private detail"}')):
            with self.assertRaisesRegex(RuntimeError, 'validate_payload'):
                collect_rescuetime(self.config, date(2026, 9, 11))
        self.assertNotIn('private detail', self.log.read_text())
        self.assertNotIn('collection_saved', self.log.read_text())

    def test_second_request_failure_rolls_back_first_request(self):
        payload = json.dumps({'row_headers': ['Date', 'Time Spent (seconds)', 'Productivity'],
                              'rows': [['2026-09-11T12:00:00', 60, 2]]}).encode()
        with patch('live_life.collectors.urlopen', side_effect=[BytesIO(payload), URLError(TimeoutError())]):
            with self.assertRaises(RuntimeError):
                collect_rescuetime(self.config, date(2026, 9, 11))
        with connect(self.config.database) as conn:
            self.assertEqual(conn.execute('SELECT count(*) FROM metric_events').fetchone()[0], 0)
        self.assertEqual(self.records()[-1]['taxonomy'], 'activity')
        self.assertNotIn('collection_saved', self.log.read_text())

    def test_unwritable_log_does_not_fail_successful_collection(self):
        (self.config.root / 'data').write_text('not a directory')
        payload = json.dumps({'row_headers': [], 'rows': []}).encode()
        with patch('live_life.collectors.urlopen', side_effect=lambda *a, **k: BytesIO(payload)):
            with self.assertWarnsRegex(RuntimeWarning, 'Could not write RescueTime'):
                self.assertEqual(collect_rescuetime(self.config, date(2026, 9, 11))['queries'], 2)
