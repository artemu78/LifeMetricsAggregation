from datetime import datetime
import pytest
from forecasting.__main__ import prediction_schedule


def test_prediction_date_default_override_and_past_cutoff():
    now = datetime.fromisoformat('2026-10-19T12:00:00+03:00')
    assert prediction_schedule(None, now) == ('2026-10-20', now.isoformat(), False)
    assert prediction_schedule('2026-10-23', now) == ('2026-10-23', now.isoformat(), False)
    assert prediction_schedule('2026-10-18', now) == ('2026-10-18', '2026-10-18T09:00:00+03:00', True)
    with pytest.raises(ValueError):
        prediction_schedule('2026-02-30', now)
    with pytest.raises(ValueError):
        prediction_schedule('20261020', now)


def test_default_date_uses_moscow_day():
    now = datetime.fromisoformat('2026-10-19T22:30:00+00:00')
    assert prediction_schedule(None, now)[0] == '2026-10-21'
