"""Bounded rolling-origin experiment; never use future targets to fit a predictor.

Feature row i describes information available at 09:00 on date i. It is therefore
known for the 10:00 target, including at the prediction origin. This differs from
ordinary contemporaneous covariates that become observable with the target.
"""
from __future__ import annotations

import numpy as np


def _array(values):
    return np.asarray([np.nan if v is None else float(v) for v in values], dtype=float)


def _bounded(name, values):
    # EMA is ordinal. Keep continuous point estimates for MAE, bounded to scale;
    # do not round or claim that decimals are additional measurement precision.
    return np.clip(values, 1, 5) if 'ema' in name.lower() else values


def _ridge(history, features, index, available_at=None, cutoffs=None):
    """Fixed L2=10, training-only imputation/scaling, three past target lags."""
    def row(j):
        lag = [history[j - k] if j >= k and (available_at is None or available_at[j-k] <= cutoffs[j])
               else np.nan for k in (1, 2, 3)]
        return np.r_[lag, features[:, j]]
    rows = [j for j in range(1, index) if np.isfinite(history[j])]
    x = np.stack([row(j) for j in rows])
    y = history[rows]
    observed = np.isfinite(x)
    means = np.divide(np.where(observed, x, 0).sum(axis=0), observed.sum(axis=0),
                      out=np.zeros(x.shape[1]), where=observed.sum(axis=0) > 0)
    x = np.where(observed, x, means)
    scale = x.std(axis=0)
    scale[scale < 1e-8] = 1
    x = (x - means) / scale
    query = row(index)
    query = (np.where(np.isfinite(query), query, means) - means) / scale
    # The dual form bounds memory when the input inventory is very wide.
    centered = y - y.mean()
    weights = np.linalg.solve(x @ x.T + 10 * np.eye(len(y)), centered)
    return float(y.mean() + query @ x.T @ weights)


def _metrics(records):
    if not records:
        return {'count': 0, 'mae': None, 'quantile_loss': None, 'interval_coverage': None,
                'interval_count': 0, 'interval_definitions': [], 'dates': []}
    errors, losses, covered = [], [], []
    for r in records:
        errors.append(abs(r['actual'] - r['prediction']))
        if r['quantiles']:
            q = np.asarray(r['quantiles'])
            levels = np.asarray(r['levels'])
            residual = r['actual'] - q
            losses.extend(np.maximum(levels * residual, (levels - 1) * residual).tolist())
            if len(q) >= 2:
                covered.append(float(q[0] <= r['actual'] <= q[-1]))
    return {'count': len(records), 'mae': float(np.mean(errors)),
            'quantile_loss': float(np.mean(losses)) if losses else None,
            'interval_coverage': float(np.mean(covered)) if covered else None,
            'interval_count': len(covered),
            'interval_definitions': [dict(lower_level=lo, upper_level=hi, nominal_coverage=hi-lo)
                for lo, hi in sorted({(r['levels'][0], r['levels'][-1]) for r in records if len(r['levels']) >= 2})],
            'dates': [r['date'] for r in records]}


def evaluate(dataset: dict, *, forecaster=None, max_origins=12, min_train_labels=8,
             holdout_days=7) -> dict:
    """Evaluate immutable preselected variants, with no holdout-based selection.

    max_origins bounds shared origin dates; at most twenty joint Timestral variants and four separate-target calls are
    attempted on each date. Missing/failed predictions are explicit. Comparisons
    use the intersection of successful dates per target and split.
    """
    if max_origins < 1 or min_train_labels < 2 or holdout_days < 1:
        raise ValueError('Positive origin/holdout budgets and at least two training labels required')
    dates = dataset['dates']
    from datetime import date
    calendar = [date.fromisoformat(d) for d in dates]
    if any((b - a).days != 1 for a, b in zip(calendar, calendar[1:])):
        raise ValueError('dates must be ordered consecutive calendar dates')
    names = list(dataset['targets'])
    if not names:
        raise ValueError('At least one named target required')
    targets = np.stack([_array(dataset['targets'][name]) for name in names])
    feature_names = list(dataset.get('features', {}))
    features = (np.stack([_array(dataset['features'][name]) for name in feature_names])
                if feature_names else np.empty((0, len(dates))))
    if targets.shape[1] != len(dates) or features.shape[1] != len(dates):
        raise ValueError('Target and feature lengths must match dates')
    if np.isinf(targets).any() or np.isinf(features).any():
        raise ValueError('Infinite measurements are invalid')
    from datetime import datetime
    from zoneinfo import ZoneInfo
    cutoffs = np.asarray([datetime.fromisoformat(d + 'T09:00:00').replace(
        tzinfo=ZoneInfo('Europe/Moscow')).timestamp() for d in dates])
    metadata = dataset.get('metadata', {})
    strict = metadata.get('availability') == 'strict'
    availability = np.full(targets.shape, -np.inf)
    if strict:
        availability[:] = np.inf
        for t, name in enumerate(names):
            stamps = metadata.get('target_available_at', {}).get(name, [None] * len(dates))
            if len(stamps) != len(dates):
                raise ValueError('Target availability length must match dates')
            for j, stamp in enumerate(stamps):
                if stamp is not None:
                    parsed = datetime.fromisoformat(stamp.replace('Z', '+00:00'))
                    if parsed.tzinfo is None:
                        raise ValueError('Target availability timestamps must include timezone')
                    availability[t, j] = parsed.timestamp()
    def context_at(i):
        return np.where(availability <= cutoffs[i], targets, np.nan)

    eligible = {name: [i for i in range(len(dates)) if np.isfinite(targets[t, i])
                      and np.isfinite(context_at(i)[t, :i]).sum() >= min_train_labels]
                for t, name in enumerate(names)}
    # Share a bounded date pool fairly across targets with different last labels.
    chosen = set()
    depth = 1
    while len(chosen) < max_origins:
        before = len(chosen)
        for name in names:
            if len(eligible[name]) >= depth:
                chosen.add(eligible[name][-depth])
            if len(chosen) >= max_origins:
                break
        if before == len(chosen) and all(len(v) < depth for v in eligible.values()):
            break
        depth += 1
    origins = sorted(chosen)
    group_map = dataset.get('feature_groups', {})
    groups = sorted({group_map.get(name, 'other') for name in feature_names})
    variants = [('timestral_history', [])]
    if feature_names:
        variants += [('timestral_all', list(range(len(feature_names))))]
        variants += [('timestral_group_' + group,
                      [i for i, name in enumerate(feature_names) if group_map.get(name, 'other') == group])
                     for group in groups]
        if len(groups) > 1:
            variants += [('timestral_without_' + group,
                          [i for i, name in enumerate(feature_names) if group_map.get(name, 'other') != group])
                         for group in groups]
    omitted = [name for name, _ in variants[20:]]
    variants = variants[:20] if forecaster is not None else []
    method_names = ['persistence', 'recent_median', 'ridge'] + [v[0] for v in variants]
    if forecaster is not None:
        method_names.append('timestral_separate_history')
    records = {name: {method: [] for method in method_names} for name in names}
    failures = []
    calls = 0
    split_at = {name: max(0, max(values) - holdout_days + 1) if values else None
                for name, values in eligible.items()}
    for i in origins:
        forecasts = {}
        origin_targets = context_at(i)
        active = [t for t, name in enumerate(names)
                  if np.isfinite(context_at(i)[t, :i]).sum() >= min_train_labels]
        calls_for_origin = [(method, indexes, active) for method, indexes in variants]
        if forecaster is not None:
            calls_for_origin += [('timestral_separate_history', [], [t]) for t in active[:4]]
        for method, indexes, target_indexes in calls_for_origin:
            try:
                calls += 1
                forecast = forecaster(origin_targets[target_indexes, :i].copy(), None,
                                      features[indexes, :i + 1].copy() if indexes else None)
                median = np.asarray(forecast['median'], dtype=float).reshape(len(target_indexes))
                levels = np.asarray(forecast.get('levels', []), dtype=float)
                quantiles = np.asarray(forecast.get('quantiles', np.empty((len(target_indexes), 0))), dtype=float)
                if quantiles.shape != (len(target_indexes), len(levels)) or levels.ndim != 1:
                    raise ValueError('Invalid quantile shape')
                if not np.isfinite(levels).all() or np.any((levels <= 0) | (levels >= 1)) or np.any(np.diff(levels) <= 0):
                    raise ValueError('Quantile levels must be strictly increasing in (0,1)')
                for local_t, global_t in enumerate(target_indexes):
                    forecasts[(method, global_t)] = (median[local_t], quantiles[local_t], levels)
            except Exception as exc:
                failures.append({'date': dates[i], 'method': method, 'error_type': type(exc).__name__})
        for t, name in enumerate(names):
            if i not in eligible[name]:
                continue
            history = origin_targets[t, :i]
            finite = history[np.isfinite(history)]
            baseline = {'persistence': finite[-1], 'recent_median': np.median(finite[-7:]),
                        'ridge': _ridge(origin_targets[t], features, i, availability[t] if strict else None, cutoffs)}
            for method in method_names:
                q, levels = [], []
                if method in baseline:
                    prediction = baseline[method]
                elif (method, t) in forecasts:
                    prediction, quantiles, levels_array = forecasts[(method, t)]
                    q = _bounded(name, quantiles).tolist()
                    levels = levels_array.tolist()
                else:
                    continue
                prediction = float(_bounded(name, prediction))
                if not np.isfinite(prediction) or not np.isfinite(q).all() or np.any(np.diff(q) < 0):
                    failures.append({'date': dates[i], 'method': method, 'target': name,
                                     'error_type': 'InvalidPrediction'})
                    continue
                records[name][method].append({'date': dates[i],
                    'split': 'holdout' if i >= split_at[name] else 'validation',
                    'actual': float(targets[t, i]), 'prediction': prediction,
                    'quantiles': q, 'levels': levels})
    result = {'policy': {'forecast_time': '09:00 Europe/Moscow', 'target_time': '10:00 Europe/Moscow',
              'covariate_alignment': 'row i is known by 09:00 before target i at 10:00',
              'ema_predictions': 'clip to [1,5]; continuous ordinal estimates, no rounding',
              'target_availability': 'Import timestamps enforced at each origin and historical lag row' if strict else 'Retrospective event time; later imports may have been unavailable historically',
              'ridge_penalty': 10, 'min_train_labels': min_train_labels,
              'holdout_days': holdout_days, 'holdout_start_by_target': {n: dates[v] if v is not None else None for n, v in split_at.items()},
              'holdout_definition': 'Last calendar days ending at each target latest eligible assessment',
              'selection': 'Fixed variants; no tuning on holdout',
              'origin_budget': max_origins, 'timestral_variant_budget': 20, 'separate_target_budget': 4,
              'origin_selection': 'Newest eligible dates, round robin across targets, shared capped pool'},
              'origins': [dates[i] for i in origins], 'timestral_calls': calls,
              'omitted_variants': omitted, 'failures': failures, 'targets': {}}
    for name in names:
        selected = [dates[i] for i in origins if i in eligible[name]]
        status = 'evaluated' if selected else 'insufficient_evidence'
        if selected and forecaster is not None and not any(
                records[name][m] for m in method_names if m.startswith('timestral_')):
            status = 'model_failed'
        target_result = {'status': status,
                         'units': 'EMA ordinal rating, 1-5' if 'ema' in name.lower() else 'Source score units (Welltory energy: percent)',
                         'eligible_dates': selected, 'methods': {}, 'common_dates': {}}
        for split in ('validation', 'holdout'):
            common = set.intersection(*[set(r['date'] for r in records[name][m] if r['split'] == split)
                                        for m in method_names])
            target_result['common_dates'][split] = sorted(common)
            baseline_metrics = _metrics([r for r in records[name]['persistence'] if r['date'] in common])
            for method in method_names:
                metrics = _metrics([r for r in records[name][method] if r['date'] in common])
                metrics['mae_improvement_over_persistence'] = (baseline_metrics['mae'] - metrics['mae']
                    if metrics['mae'] is not None else None)
                entry = target_result['methods'].setdefault(method, {'predictions': records[name][method]})
                entry[split] = metrics
                entry[split + '_available'] = _metrics([r for r in records[name][method] if r['split'] == split])
        result['targets'][name] = target_result
    return result
