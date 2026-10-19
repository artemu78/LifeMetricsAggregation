import copy
import json
from datetime import date, timedelta

import numpy as np
import pytest

from forecasting.evaluation import evaluate


def dataset(n=24):
    return {'dates': [(date(2026, 1, 1) + timedelta(days=i)).isoformat() for i in range(n)],
            'targets': {'ema_energy': [float(i % 5 + 1) for i in range(n)],
                        'welltory_energy': [float(40 + i) for i in range(n)]},
            'features': {'sleep': [float(i) for i in range(n)],
                         'steps': [None if i % 3 else float(i) for i in range(n)]},
            'feature_groups': {'sleep': 'sleep', 'steps': 'activity'}, 'metadata': {}}


def test_origin_alignment_and_no_future_targets():
    data = dataset()
    seen = []
    def forecast(context, past, known):
        i = context.shape[1]
        assert past is None
        for row in context:
            assert any(np.array_equal(row, np.array(v[:i])) for v in data['targets'].values())
        if known is not None:
            assert known.shape[1] == i + 1
        seen.append(i)
        return {'median': np.array([3] * len(context)), 'quantiles': np.array([[1, 5]] * len(context)),
                'levels': [.1, .9]}
    result = evaluate(data, forecaster=forecast, max_origins=10)
    assert max(seen) == 23
    assert len(result['origins']) == 10
    assert result['timestral_calls'] <= 240
    assert result['targets']['ema_energy']['methods']['ridge']['validation']['count'] == 3
    assert result['targets']['ema_energy']['methods']['ridge']['holdout']['count'] == 7
    json.dumps(result, allow_nan=False)


def test_sparse_target_does_not_block_other_targets():
    data = dataset()
    data['targets']['ema_energy'] = [None] * 23 + [3]
    result = evaluate(data)
    assert result['targets']['ema_energy']['status'] == 'insufficient_evidence'
    assert result['targets']['welltory_energy']['status'] == 'evaluated'
    assert result['targets']['welltory_energy']['methods']['ridge']['holdout']['count'] == 7


def test_future_changes_cannot_change_past_predictions():
    data = dataset()
    first = evaluate(data, max_origins=24)
    altered = copy.deepcopy(data)
    altered['targets']['ema_energy'][20:] = [1, 1, 1, 1]
    altered['features']['sleep'][20:] = [1e10] * 4
    second = evaluate(altered, max_origins=24)
    for method in ('ridge', 'persistence', 'recent_median'):
        a = first['targets']['ema_energy']['methods'][method]['predictions']
        b = second['targets']['ema_energy']['methods'][method]['predictions']
        assert [r for r in a if r['date'] < data['dates'][20]] == [r for r in b if r['date'] < data['dates'][20]]


def test_common_dates_failure_and_clipped_ordinal_quantiles():
    def forecast(context, past, known):
        if context.shape[1] == 22:
            raise RuntimeError('private content must not leak to report')
        return {'median': [9 if row[0] < 10 else 110 for row in context],
                'quantiles': [[-3, 10] if row[0] < 10 else [0, 120] for row in context], 'levels': [.1, .9]}
    result = evaluate(dataset(), forecaster=forecast)
    target = result['targets']['ema_energy']
    assert target['methods']['persistence']['holdout']['count'] == 6
    assert target['methods']['persistence']['holdout_available']['count'] == 7
    assert target['methods']['timestral_history']['predictions'][0]['prediction'] == 5
    assert target['methods']['timestral_history']['predictions'][0]['quantiles'] == [1, 5]
    assert result['targets']['welltory_energy']['methods']['timestral_history']['predictions'][0]['prediction'] == 110
    assert 'private content' not in json.dumps(result, allow_nan=False)


def test_budget_validation_and_unobserved_features():
    data = dataset()
    data['features']['empty'] = [None] * 24
    result = evaluate(data, max_origins=1)
    assert len(result['origins']) == 1
    assert result['targets']['ema_energy']['methods']['ridge']['validation']['mae'] is None
    json.dumps(result, allow_nan=False)
    with pytest.raises(ValueError):
        evaluate(data, max_origins=0)


def test_sparse_context_groups_separate_and_target_relative_holdout():
    data = dataset(40)
    data['targets']['ema_energy'][24:] = [None] * 16
    data['targets']['ema_mood'] = [None] * 40
    for i in range(7):
        key = 'feature_' + str(i)
        data['features'][key] = [float(i)] * 40
        data['feature_groups'][key] = 'group_' + str(i)
    calls = []
    def forecast(context, past, known):
        assert all(np.isfinite(row).sum() >= 8 for row in context)
        calls.append(len(context))
        return {'median': [3] * len(context), 'levels': [.01, .99],
                'quantiles': [[1, 5]] * len(context)}
    result = evaluate(data, forecaster=forecast, max_origins=24)
    assert not result['omitted_variants']
    assert 1 in calls and 2 in calls
    assert result['policy']['holdout_start_by_target']['ema_energy'] == data['dates'][17]
    assert result['targets']['ema_energy']['methods']['timestral_history']['holdout']['count'] > 0
    assert result['targets']['ema_mood']['status'] == 'insufficient_evidence'
    metrics = result['targets']['ema_energy']['methods']['timestral_history']['holdout']
    assert metrics['interval_definitions'][0]['nominal_coverage'] == .98
    assert result['timestral_calls'] <= 24 * 24
    json.dumps(result, allow_nan=False)


def test_strict_late_imports_mask_context_and_historical_ridge_lags():
    data = dataset()
    data['metadata'] = {'availability': 'strict', 'target_available_at': {
        name: [d + 'T11:00:00+03:00' for d in data['dates']] for name in data['targets']}}
    # An old label imported after all forecast origins cannot enter training.
    data['metadata']['target_available_at']['ema_energy'][0] = '2027-01-01T00:00:00Z'
    seen = []
    def forecast(context, past, known):
        if len(context) == 2:
            assert np.isnan(context[0, 0])
        seen.append(context)
        return {'median': [3] * len(context), 'quantiles': [[1, 5]] * len(context), 'levels': [.1, .9]}
    result = evaluate(data, forecaster=forecast)
    assert seen
    # Mutating an unavailable label must not affect any prediction.
    changed = copy.deepcopy(data)
    changed['targets']['ema_energy'][0] = 500
    other = evaluate(changed, forecaster=forecast)
    for method in ('ridge', 'persistence', 'recent_median'):
        assert result['targets']['ema_energy']['methods'][method] == other['targets']['ema_energy']['methods'][method]
    from forecasting.evaluation import _ridge
    history = np.array([1., 2., 3., 4., 5.])
    availability = np.array([3.5, 1., 2., 3., 4.])
    cutoff = np.arange(5.)
    # Label 0 is valid as training y by origin 4, but cannot appear as lag at rows 1, 2 or 3.
    # Rows 1/2 lag availability is independent of its stored value.
    prediction = _ridge(history, np.empty((0, 5)), 4, availability, cutoff)
    mutated = history.copy()
    mutated[0] = 500
    assert prediction == _ridge(mutated, np.empty((0, 5)), 4, availability, cutoff)


def test_all_model_failures_are_explicit_and_missing_strict_provenance_is_ineligible():
    def failing(*args):
        raise ValueError('failure')
    result = evaluate(dataset(), forecaster=failing)
    assert result['targets']['ema_energy']['status'] == 'model_failed'
    data = dataset()
    data['metadata']['availability'] = 'strict'
    result = evaluate(data, forecaster=failing)
    assert result['origins'] == []
    assert result['targets']['ema_energy']['status'] == 'insufficient_evidence'


def test_empty_dataset_is_insufficient_without_model_calls():
    data = {'dates': [], 'targets': {'ema_energy': [], 'ema_mood': [], 'welltory_energy': []},
            'features': {}, 'feature_groups': {}, 'metadata': {}}
    def forbidden(*args):
        raise AssertionError('Must not invoke model without data')
    result = evaluate(data, forecaster=forbidden)
    assert result['origins'] == []
    assert result['timestral_calls'] == 0
    assert all(t['status'] == 'insufficient_evidence' for t in result['targets'].values())
    json.dumps(result, allow_nan=False)
