import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from forecasting.dataset import build_dataset, _number


class DatasetTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'data.sqlite'
        self.conn = sqlite3.connect(self.path)
        self.addCleanup(self.conn.close)
        self.conn.executescript('''
            CREATE TABLE metric_events (id INTEGER PRIMARY KEY, source TEXT, metric TEXT, occurred_at TEXT,
                value_num REAL, unit TEXT, payload_json TEXT, imported_at TEXT, origin_file TEXT);
            CREATE TABLE ema_events (event_id TEXT, answered_at TEXT, status TEXT, mood INTEGER, energy INTEGER,
                focus INTEGER, stress INTEGER, origin_file TEXT, note TEXT);
            CREATE TABLE import_files (path TEXT, imported_at TEXT, remote_modified_at TEXT);
        ''')

    def metric(self, name, stamp, value, payload=None, imported='2026-10-01T00:00:00+03:00', origin=None):
        source = name.split('.')[0]
        self.conn.execute('INSERT INTO metric_events VALUES (NULL,?,?,?,?,?,?,?,?)',
                          (source, name, stamp, value, 'test', json.dumps(payload or {}), imported, origin))
        self.conn.commit()

    def ema(self, event, stamp, mood=None, energy=None, origin=None):
        self.conn.execute('INSERT INTO ema_events VALUES (?,?,?,?,?,?,?,?,?)',
                          (event, stamp, 'answered', mood, energy, None, None, origin, 'PRIVATE_SENTINEL'))
        self.conn.commit()

    def test_target_tie_partial_answers_and_daily_gaps(self):
        self.ema('early', '2026-10-02T09:45:00+03:00', mood=2)
        self.ema('late', '2026-10-02T10:15:00+03:00', mood=4, energy=5)
        self.ema('outside', '2026-10-04T11:00:00+03:00', mood=1)
        result = build_dataset(self.path)
        self.assertEqual(result['dates'], ['2026-10-02', '2026-10-03', '2026-10-04'])
        self.assertEqual(result['targets']['ema.mood'], [2.0, None, None])
        self.assertEqual(result['targets']['ema.energy'], [5.0, None, None])
        self.assertEqual(result['metadata']['timestamp_offsets_minutes']['ema.mood'], [-15.0, None, None])
        self.assertIsNone(result['features']['ema.mood.last'][0])
        self.assertNotIn('PRIVATE_SENTINEL', json.dumps(result))

    def test_event_and_import_cutoffs_no_target_siblings(self):
        self.metric('welltory.Energy(HRV)', '2026-10-02T08:59:00+03:00', 50,
                    imported='2026-10-02T09:01:00+03:00')
        self.metric('welltory.Energy(HRV)', '2026-10-02T10:00:00+03:00', 80)
        self.metric('welltory.rMSSD', '2026-10-02T10:00:00+03:00', 999)
        self.ema('prior', '2026-10-02T08:00:00+03:00', mood=3)
        retrospective = build_dataset(self.path)
        strict = build_dataset(self.path, availability='strict')
        self.assertEqual(retrospective['features']['welltory.Energy(HRV).last'], [50.0])
        self.assertEqual(strict['features']['welltory.Energy(HRV).last'], [None])
        self.assertEqual(strict['targets']['welltory.energy'], [80.0])
        self.assertEqual(strict['features']['ema.mood.last'], [None])
        self.assertEqual(retrospective['features']['welltory.rMSSD.last'], [None])

    def test_strict_ema_import_provenance(self):
        self.conn.execute('INSERT INTO import_files VALUES (?, ?, NULL)', ('file', '2026-10-02T09:00:00+03:00'))
        self.ema('known', '2026-10-02T08:00:00+03:00', mood=3, origin='file')
        self.assertEqual(build_dataset(self.path, availability='strict')['features']['ema.mood.last'], [3.0])

    def test_interval_completion_sleep_and_canonical_steps(self):
        step = {'origin': 'device', 'startTime': '2026-10-01T23:50:00+03:00', 'endTime': '2026-10-02T00:10:00+03:00'}
        self.metric('fitness_drive.steps', step['startTime'], 10, step)
        self.metric('fitness_drive.steps', step['startTime'], 20, step, imported='2026-10-01T01:00:00+03:00')
        sleep = {'origin': 'device', 'startTime': '2026-10-02T01:00:00+03:00', 'endTime': '2026-10-02T08:00:00+03:00'}
        self.metric('fitness_drive.sleep.light_seconds', sleep['startTime'], 100, sleep)
        self.metric('fitness_drive.sleep.light_seconds', sleep['startTime'], 100, sleep)
        self.metric('fitness_drive.sleep.awake_seconds', '2026-10-02T02:00:00+03:00', 50, sleep)
        future_sleep = {**sleep, 'endTime': '2026-10-02T09:01:00+03:00'}
        self.metric('fitness_drive.sleep.deep_seconds', sleep['startTime'], 9999, future_sleep)
        result = build_dataset(self.path)
        self.assertEqual(result['features']['bracelet.steps_previous_calendar_date'], [None, 20.0])
        self.assertEqual(result['features']['bracelet.main_sleep_seconds'], [None, 100.0])
        self.assertEqual(result['features']['bracelet.main_sleep.end_hour'], [None, 8.0])
        self.assertEqual(result['features']['fitness_drive.sleep.awake_seconds.main_session'], [None, 50.0])

    def test_rescuetime_no_double_count_and_minute_boundary(self):
        self.metric('rescuetime.seconds.productivity.2', '2026-10-02T08:59:00+03:00', 60)
        self.metric('rescuetime.seconds.productivity.2', '2026-10-02T09:00:00+03:00', 60)
        self.metric('rescuetime.seconds.activity.PRIVATE_SENTINEL', '2026-10-02T08:59:00+03:00', 60)
        result = build_dataset(self.path)
        self.assertEqual(result['features']['rescuetime.seconds.productivity.2.sum_24h'], [60.0])
        self.assertNotIn('PRIVATE_SENTINEL', json.dumps(result))

    def test_availability_units_and_fractional_ratings(self):
        self.metric('welltory.Energy(HRV)', '2026-10-02T10:00:00+03:00', 65,
                    imported='2026-10-05T12:00:00+03:00')
        self.conn.execute("UPDATE metric_events SET unit=NULL")
        self.ema('fractional', '2026-10-02T10:00:00+03:00', mood=2.5, energy=4)
        result = build_dataset(self.path, availability='strict')
        self.assertEqual(result['targets']['ema.mood'], [None])
        self.assertEqual(result['targets']['ema.energy'], [4.0])
        self.assertIsNone(result['metadata']['units']['welltory.energy'])
        self.assertEqual(result['metadata']['target_available_at']['welltory.energy'], ['2026-10-05T12:00:00+03:00'])
        self.assertEqual(result['metadata']['target_available_at']['ema.energy'], [None])
        self.assertIsNone(_number(True))

    def test_interval_candidates_and_safe_ema_categories(self):
        self.conn.execute('ALTER TABLE ema_events ADD COLUMN scheduled_at TEXT')
        self.conn.execute('ALTER TABLE ema_events ADD COLUMN activity TEXT')
        self.conn.execute("INSERT INTO ema_events (event_id,answered_at,status,scheduled_at,activity) VALUES ('x','2026-10-02T08:45:00+03:00','answered','2026-10-02T08:30:00+03:00','work_coding')")
        self.conn.commit()
        self.metric('fitness_drive.distance', '2026-10-02T08:30:00+03:00', 100,
                    {'startTime': '2026-10-02T08:30:00+03:00', 'endTime': '2026-10-02T08:59:00+03:00'})
        self.metric('fitness_drive.distance', '2026-10-02T08:30:00+03:00', 999,
                    {'startTime': '2026-10-02T08:30:00+03:00', 'endTime': '2026-10-02T09:01:00+03:00'})
        self.metric('fitness_drive.total_calories', '2026-10-02T08:30:00+03:00', 20)
        result = build_dataset(self.path)
        self.assertEqual(result['features']['fitness_drive.distance.sum_24h'], [100.0])
        self.assertIn('missing trustworthy', result['metadata']['candidate_metrics']['fitness_drive.total_calories'])
        self.assertEqual(result['features']['ema.activity.work_coding.last'], [1.0])
        self.assertEqual(result['features']['ema.activity.resting.last'], [0.0])
        self.assertEqual(result['features']['ema.response_delay_minutes.last'], [15.0])

    def test_read_only_and_finite_serialization(self):
        self.metric('welltory.Energy(HRV)', '2026-10-02T10:00:00+03:00', float('inf'))
        before = hashlib.sha256(self.path.read_bytes()).hexdigest()
        result = build_dataset(self.path)
        json.dumps(result, allow_nan=False)
        self.assertEqual(hashlib.sha256(self.path.read_bytes()).hexdigest(), before)
        self.assertEqual(result['dates'], [])
        missing = self.path.parent / 'absent.sqlite'
        with self.assertRaises(sqlite3.OperationalError):
            build_dataset(missing)
        self.assertFalse(missing.exists())
        with self.assertRaises(ValueError):
            build_dataset(self.path, window_minutes=60)


if __name__ == '__main__':
    unittest.main()
