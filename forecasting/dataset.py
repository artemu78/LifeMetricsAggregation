"""Read-only, text-free morning forecasting dataset (standard library only).

Rows are Moscow calendar dates, not the dashboard's 05:00 logical days.
Retrospective mode is an event-time experiment, not a deployability claim.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
import json
import math
from pathlib import Path
import sqlite3
from zoneinfo import ZoneInfo

TZ = ZoneInfo('Europe/Moscow')
ACTIVITIES = ('work_coding', 'learning_reading', 'communication_social', 'entertainment',
              'social_media_browsing', 'exercise_walking', 'eating', 'resting',
              'household_errands', 'traveling', 'other')
TARGETS = ('welltory.energy', 'ema.mood', 'ema.energy')


def _timestamp(value):
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.astimezone(TZ) if parsed.tzinfo else None
    except (AttributeError, ValueError, TypeError):
        return None


def _number(value):
    if not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    return None


def _rows(conn, table, fields):
    columns = {r[1] for r in conn.execute(f'PRAGMA table_info({table})')}
    if not columns:
        return []
    projection = ', '.join(name if name in columns else f'NULL AS {name}' for name in fields)
    return [dict(row) for row in conn.execute(f'SELECT {projection} FROM {table}')]


def build_dataset(db_path: str | Path, *, window_minutes=30, availability='retrospective', through_date=None) -> dict:
    """Build consecutive daily rows; targets remain missing without a nearby answer.

    Strict inputs require both event completion and recorded import time <=09:00.
    Import timestamps are conservative proxies, not a historical revision archive.
    """
    if availability not in {'retrospective', 'strict'}:
        raise ValueError('availability must be retrospective or strict')
    if not isinstance(window_minutes, int) or not 0 <= window_minutes < 60:
        raise ValueError('window_minutes must be an integer in [0, 59] (after the 09:00 cutoff)')
    uri = Path(db_path).expanduser().resolve().as_uri() + '?mode=ro'
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute('PRAGMA query_only=ON')
        conn.execute('BEGIN')
        imports = {r['path']: r for r in _rows(conn, 'import_files', ['path', 'imported_at', 'remote_modified_at'])}
        metrics = _rows(conn, 'metric_events', ['id', 'source', 'metric', 'occurred_at', 'value_num', 'unit', 'payload_json', 'imported_at', 'origin_file'])
        ema = _rows(conn, 'ema_events', ['event_id', 'answered_at', 'status', 'mood', 'energy', 'focus', 'stress', 'origin_file', 'scheduled_at', 'activity'])
        runs = _rows(conn, 'source_runs', ['source', 'status', 'finished_at'])
        task_rows = {kind: _rows(conn, f'{kind}_tasks', [f'{kind}_at', 'imported_at']) for kind in ('created', 'completed', 'deleted')}
    finally:
        conn.close()

    dates_seen = []
    series = defaultdict(list)
    target_points = {target: [] for target in TARGETS}
    units = {'welltory.energy': None, 'ema.mood': '1-5', 'ema.energy': '1-5'}
    excluded = defaultdict(int)
    candidate_report = {}
    for row in metrics:
        stamp = _timestamp(row['occurred_at'])
        value = _number(row['value_num'])
        if stamp is None or value is None:
            if row['metric'] and not row['metric'].startswith('rescuetime.seconds.activity.'):
                candidate_report.setdefault(row['metric'], 'excluded: nonnumeric or invalid timestamp')
            continue
        dates_seen.append(stamp.date())
        metric = row['metric'] or ''
        imported = _timestamp(row['imported_at'])
        record = {'time': stamp, 'end': stamp, 'value': value, 'available': imported, 'id': row['id'] or 0}
        if metric == 'welltory.Energy(HRV)':
            target_points['welltory.energy'].append((stamp, value, record['id'], imported))
            units['welltory.energy'] = row['unit']
        if row['source'] == 'welltory':
            series[metric].append(record)
        elif metric.startswith('rescuetime.seconds.productivity.'):
            # API resolution_time=minute: all measurements in a minute finish at its boundary.
            record['end'] = stamp.replace(second=0, microsecond=0) + timedelta(minutes=1)
            series[metric].append(record)
        elif metric in {'fitness_drive.heart_rate', 'fitness_drive.resting_heart_rate', 'fitness_drive.oxygen_saturation'}:
            series[metric].append(record)
        elif metric in {'fitness_drive.steps', 'fitness_drive.distance', 'fitness_drive.total_calories', 'fitness_drive.exercise'} or metric.startswith('fitness_drive.sleep.'):
            try:
                payload = json.loads(row['payload_json'])
                start, end = _timestamp(payload.get('startTime')), _timestamp(payload.get('endTime'))
                if start is None or end is None or end < start:
                    raise ValueError('missing interval bounds')
            except (TypeError, ValueError, AttributeError):
                excluded['bracelet_intervals_missing_bounds'] += 1
                candidate_report[metric] = 'excluded: missing trustworthy interval bounds'
                continue
            record.update(start=start, end=end, origin=str(payload.get('origin', '')), metric=metric)
            provenance = imports.get(row['origin_file'], {})
            record['revision'] = _timestamp(provenance.get('remote_modified_at')) or imported or stamp
            series[metric].append(record)
        else:
            excluded['unsupported_or_unsafe_numeric_metrics'] += 1
            if metric.startswith('rescuetime.seconds.activity.'):
                candidate_report['rescuetime.seconds.activity.*'] = 'excluded: private labels and duplicate time perspective'
            else:
                candidate_report[metric] = 'excluded: unsupported numeric metric'
            continue
        units[metric] = row['unit']
        candidate_report[metric] = 'included'

    for row in ema:
        stamp = _timestamp(row['answered_at'])
        if stamp is None or row['status'] != 'answered':
            continue
        dates_seen.append(stamp.date())
        imported = _timestamp(imports.get(row['origin_file'], {}).get('imported_at'))
        for field in ('mood', 'energy', 'focus', 'stress'):
            value = _number(row[field])
            if value is None or not value.is_integer() or not 1 <= value <= 5:
                continue
            metric = f'ema.{field}'
            if metric in target_points:
                target_points[metric].append((stamp, value, row['event_id'] or '', imported))
            series[metric].append({'time': stamp, 'end': stamp, 'value': value, 'available': imported, 'id': row['event_id'] or ''})
            units[metric] = '1-5'
        scheduled = _timestamp(row['scheduled_at'])
        numeric = {}
        if scheduled is not None and scheduled <= stamp:
            numeric['ema.response_delay_minutes'] = (stamp-scheduled).total_seconds()/60
        if row['activity'] in ACTIVITIES:
            numeric.update({f'ema.activity.{code}': float(row['activity'] == code) for code in ACTIVITIES})
        for metric, value in numeric.items():
            series[metric].append({'time': stamp, 'end': stamp, 'value': value, 'available': imported, 'id': row['event_id'] or ''})
            units[metric] = 'minutes' if metric.endswith('minutes') else 'indicator'

    tasks = {}
    for kind, rows in task_rows.items():
        tasks[kind] = [{'time': stamp, 'end': stamp, 'available': _timestamp(row['imported_at']), 'value': 1.0} for row in rows if (stamp := _timestamp(row[f'{kind}_at'])) is not None]
        dates_seen.extend(r['time'].date() for r in tasks[kind])
    days = []
    if dates_seen:
        first, last = min(dates_seen), max(dates_seen)
        if through_date is not None:
            last = date.fromisoformat(through_date)
            first = min(first, last)
        days = [first + timedelta(days=i) for i in range((last-first).days + 1)]
    features, groups = {}, {}
    targets = {target: [] for target in TARGETS}
    offsets = {target: [] for target in TARGETS}
    target_available = {target: [] for target in TARGETS}

    def add(name, group, values, unit=None):
        features[name] = values
        groups[name] = group
        units[name] = unit

    def available(record, cutoff):
        return record['end'] <= cutoff and record['time'] <= cutoff and (availability != 'strict' or (record['available'] is not None and record['available'] <= cutoff))

    cutoffs = [datetime.combine(day, time(9), TZ) for day in days]
    for day in days:
        target_time = datetime.combine(day, time(10), TZ)
        for target, points in target_points.items():
            candidates = [p for p in points if abs((p[0]-target_time).total_seconds()) <= window_minutes*60]
            point = min(candidates, key=lambda p: (abs((p[0]-target_time).total_seconds()), p[0], p[2])) if candidates else None
            targets[target].append(point[1] if point else None)
            target_available[target].append(point[3].isoformat() if point and point[3] else None)
            offsets[target].append((point[0]-target_time).total_seconds()/60 if point else None)
    add('calendar.weekday_sin', 'calendar', [math.sin(2*math.pi*d.weekday()/7) for d in days])
    add('calendar.weekday_cos', 'calendar', [math.cos(2*math.pi*d.weekday()/7) for d in days])
    for metric, records in sorted(series.items()):
        if metric == 'fitness_drive.steps' or metric.startswith('fitness_drive.sleep.'):
            continue
        group = 'bracelet' if metric.startswith('fitness_drive.') else metric.split('.')[0]
        last_values, ages, means = [], [], []
        for cutoff in cutoffs:
            known = [r for r in records if available(r, cutoff)]
            latest = max(known, key=lambda r: (r['time'], r['id'])) if known else None
            recent = [r['value'] for r in known if r['time'] > cutoff-timedelta(hours=24)]
            last_values.append(latest['value'] if latest else None)
            ages.append((cutoff-latest['time']).total_seconds()/3600 if latest else None)
            means.append((sum(recent) if group == 'rescuetime' or metric in {'fitness_drive.distance', 'fitness_drive.total_calories', 'fitness_drive.exercise'} else sum(recent)/len(recent)) if recent else None)
        add(metric+'.last', group, last_values, units.get(metric))
        add(metric+'.age_hours', 'freshness', ages, 'hours')
        add(metric+('.sum_24h' if group == 'rescuetime' or metric in {'fitness_drive.distance', 'fitness_drive.total_calories', 'fitness_drive.exercise'} else '.mean_24h'), group, means, units.get(metric))

    step_values, sleep_values = [], []
    sleep_hours = {'start_hour': [], 'end_hour': []}
    stage_names = sorted(metric for metric in series if metric.startswith('fitness_drive.sleep.'))
    stage_values = {name: [] for name in stage_names}
    sleep_records = [r for metric, records in series.items() if metric.startswith('fitness_drive.sleep.') for r in records]
    for day, cutoff in zip(days, cutoffs):
        canonical = {}
        for record in series.get('fitness_drive.steps', []):
            if not available(record, cutoff) or record['start'].date() != day-timedelta(days=1):
                continue
            key = (record['origin'], record['start'], record['end'])
            current = canonical.get(key)
            if current is None or (record['revision'], record['id']) > (current['revision'], current['id']):
                canonical[key] = record
        step_values.append(sum(r['value'] for r in canonical.values()) if canonical else None)
        sessions = defaultdict(dict)
        for r in sleep_records:
            if available(r, cutoff) and r['end'].date() == day:
                # Mirror dashboard point de-duplication and longest completed session.
                sessions[(r['origin'], r['start'], r['end'])][(r['time'], r['metric'], r['value'])] = r
        chosen = max(sessions.items(), key=lambda item: (sum(r['value'] for r in item[1].values() if r['metric'] != 'fitness_drive.sleep.awake_seconds'), item[0])) if sessions else None
        sleep_values.append(sum(r['value'] for r in chosen[1].values() if r['metric'] != 'fitness_drive.sleep.awake_seconds') if chosen else None)
        for key, index in [('start_hour', 1), ('end_hour', 2)]:
            stamp = chosen[0][index] if chosen else None
            sleep_hours[key].append(stamp.hour + stamp.minute/60 if stamp else None)
        for metric in stage_names:
            stage_values[metric].append(sum(r['value'] for r in chosen[1].values() if r['metric'] == metric) if chosen else None)
    add('bracelet.steps_previous_calendar_date', 'bracelet', step_values, 'count')
    add('bracelet.main_sleep_seconds', 'bracelet', sleep_values, 'seconds')
    for name, values in sleep_hours.items():
        add('bracelet.main_sleep.'+name, 'bracelet', values, 'local hour')
    for name, values in stage_values.items():
        add(name+'.main_session', 'bracelet', values, 'seconds')
    for source in ('welltory', 'fitness_drive', 'rescuetime', 'todoist'):
        known_runs = [(stamp, row['status']) for row in runs if row['source'] == source and (stamp := _timestamp(row['finished_at'])) is not None]
        ages, statuses = [], {status: [] for status in ('success', 'partial', 'failed')}
        for cutoff in cutoffs:
            last = max((r for r in known_runs if r[0] <= cutoff), default=None)
            ages.append((cutoff-last[0]).total_seconds()/3600 if last else None)
            for status in statuses:
                statuses[status].append(float(last[1] == status) if last else None)
        add(f'quality.{source}.run_age_hours', 'freshness', ages, 'hours')
        for status, values in statuses.items():
            add(f'quality.{source}.{status}', 'freshness', values, 'indicator')
    for kind, records in tasks.items():
        # Without a successful source snapshot, absence of events is unknown, not zero.
        add(f'tasks.{kind}_count_24h', 'tasks', [float(len(recent)) if (recent := [r for r in records if available(r, cutoff) and r['time'] > cutoff-timedelta(hours=24)]) else None for cutoff in cutoffs], 'count')
    coverage = {name: {'observed': sum(v is not None for v in values), 'total': len(values)} for name, values in {**targets, **features}.items()}
    return {
        'dates': [day.isoformat() for day in days], 'targets': targets,
        'features': features, 'feature_groups': groups,
        'metadata': {
            'timezone': 'Europe/Moscow', 'forecast_time': '09:00', 'target_time': '10:00',
            'window_minutes': window_minutes, 'availability': availability,
            'coverage': coverage, 'timestamp_offsets_minutes': offsets, 'target_available_at': target_available, 'units': units,
            'candidate_metrics': candidate_report,
            'suitability': {name: {'labels': coverage[name]['observed'], 'status': 'exploratory' if coverage[name]['observed'] >= 30 else 'insufficient_labels'} for name in TARGETS},
            'excluded_counts': dict(excluded),
            'warnings': [
                'Retrospective mode uses event time and cannot establish historical input availability.' if availability == 'retrospective' else 'Strict mode requires imported_at; missing EMA import provenance is excluded from inputs.',
                'Current projections do not retain all historical revisions; strict mode is a conservative proxy, not a complete as-of archive.',
                'Daily rows use Moscow calendar dates. Targets use answered_at or measurement time, never scheduled_at.',
                'Missing labels and unavailable inputs remain null. Task absence remains unknown without source-completeness evidence.',
                'Bracelet interval metrics require trustworthy start/end times; missing bounds are listed in candidate_metrics. Sleep is the longest completed session known by 09:00.',
                'RescueTime uses only productivity perspective; minute buckets ending after the cutoff are excluded.',
            ],
        },
    }
