"""Reconstruct one morning forecast without using that morning's target."""
from datetime import datetime
from zoneinfo import ZoneInfo
import uuid

import numpy as np
from .contract import make_forecast_result


def predict_morning(dataset, day, forecaster, model_revision, min_train_labels=8):
    if day not in dataset['dates']:
        raise ValueError('Build dataset through the requested forecast date first')
    index = dataset['dates'].index(day)
    cutoff = datetime.fromisoformat(day + 'T09:00:00').replace(tzinfo=ZoneInfo('Europe/Moscow'))
    meta = dataset['metadata']
    names = list(dataset['targets'])
    context = np.asarray([[np.nan if v is None else v for v in dataset['targets'][n][:index]] for n in names], dtype=float)
    if meta['availability'] == 'strict':
        for t, name in enumerate(names):
            for j, stamp in enumerate(meta['target_available_at'][name][:index]):
                if stamp is None or datetime.fromisoformat(stamp) > cutoff:
                    context[t, j] = np.nan
    counts = np.isfinite(context).sum(axis=1)
    active = [t for t, count in enumerate(counts) if count >= min_train_labels]
    feature_names = list(dataset['features'])
    known = np.asarray([[np.nan if v is None else v for v in dataset['features'][n][:index+1]] for n in feature_names], dtype=float)
    # Fixed all-input experiment, not selected using today's outcomes or backtest rankings.
    prediction = forecaster(context[active], None, known) if active else None
    run_id = str(uuid.uuid4())
    results = []
    for t, name in enumerate(names):
        observations = np.flatnonzero(np.isfinite(context[t]))
        quality = {'availability': meta['availability'], 'training_labels': int(counts[t]),
                   'last_target_date': dataset['dates'][observations[-1]] if len(observations) else None,
                   'unit': meta['units'].get(name), 'limitations': meta['warnings'],
                   'experiment': 'fixed all structured inputs; reconstructed after assessment time',
                   'available_feature_count': int(np.isfinite(known[:, -1]).sum()),
                   'total_feature_count': len(feature_names)}
        point, quantiles = None, None
        if t in active:
            local = active.index(t)
            point = float(prediction['median'][local])
            quantiles = dict(zip(map(str, prediction['levels']), map(float, prediction['quantiles'][local])))
        results.append(make_forecast_result(run_id=run_id, date=day, target=name,
                       model_revision=model_revision, point=point, quantiles=quantiles, quality=quality))
    return {'run_id': run_id, 'reconstructed': True, 'results': results}
