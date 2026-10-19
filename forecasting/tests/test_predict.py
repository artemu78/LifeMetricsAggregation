from datetime import datetime, timedelta
import numpy as np
from forecasting.predict import predict_morning


def test_predict_never_reads_same_day_target_and_masks_late_imports():
    dates = [(datetime(2026,10,1)+timedelta(days=i)).date().isoformat() for i in range(10)]
    dataset = {'dates': dates, 'targets': {'welltory.energy': list(range(9))+[999], 'ema.energy': [None]*9+[5]},
               'features': {'x': list(range(10))},
               'metadata': {'availability':'strict','units':{},'warnings':[],
                            'target_available_at': {'welltory.energy':['2026-10-01T08:00:00+03:00']*8+['2026-10-10T12:00:00+03:00']*2,
                                                    'ema.energy':[None]*10}}}
    def model(context, past, known):
        assert context.shape == (1,9)
        assert np.isnan(context[0,-1])
        assert 999 not in context
        assert known[0,-1] == 9
        return {'median':np.array([50.]), 'quantiles':np.array([[30.,50.,70.]]), 'levels':[.1,.5,.9]}
    result=predict_morning(dataset,dates[-1],model,'revision')
    assert result['results'][0]['point']==50
    assert result['results'][1]['status']=='insufficient_data'


def test_tomorrow_masks_not_yet_observed_target_and_uses_actual_cutoff():
    dates = [(datetime(2026,10,1)+timedelta(days=i)).date().isoformat() for i in range(11)]
    now = '2026-10-10T08:00:00+03:00'
    dataset = {'dates':dates, 'targets':{'ema.mood':[3]*9+[999,None]},
               'features':{'calendar':[1]*11}, 'metadata':{'availability':'strict','as_of':now,
               'units':{},'warnings':[], 'target_available_at':{'ema.mood':['2026-10-01T00:00:00+03:00']*11}}}
    def model(context, past, known):
        assert np.isnan(context[0,-1])
        assert 999 not in context
        return {'median':np.array([3.]),'quantiles':np.array([[2.,3.,4.]]),'levels':[.1,.5,.9]}
    result=predict_morning(dataset,dates[-1],model,'revision',as_of=now)
    assert result['reconstructed'] is False
    assert result['results'][0]['cutoff']==now
    assert result['results'][0]['assessment']=='2026-10-11T10:00:00+03:00'
