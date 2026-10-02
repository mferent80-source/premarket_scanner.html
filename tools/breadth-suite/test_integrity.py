import importlib.util
import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

SPEC=importlib.util.spec_from_file_location('cache_under_test',Path(__file__).parent/'market-breadth-analyzer/yahoo_cache.py')
cache=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(cache)

def chart(days):
    stamps=[int(datetime.fromisoformat(d+'T13:30:00+00:00').timestamp()) for d in days]
    return {'timestamp':stamps,'indicators':{'quote':[{'close':[100+i for i in range(len(days))],'high':[102]*len(days),'low':[98]*len(days),'volume':[123]*len(days)}],'adjclose':[{'adjclose':[99]*len(days)}]}}

class Integrity(unittest.TestCase):
    def test_sector_summary_uses_only_same_day_eleven_sectors(self):
        spec=importlib.util.spec_from_file_location('dated_uptrend',Path(__file__).parent/'uptrend-analyzer/scripts/data_fetcher.py')
        m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        f=m.UptrendDataFetcher()
        f._timeseries_cache=[{'worksheet':'all','date':'2026-10-01'}]+[{'worksheet':k,'date':'2026-10-01','ratio':.2} for k in m.WORKSHEET_TO_DISPLAY]+[{'worksheet':'ind_semiconductors','date':'2026-10-01','ratio':.8}]
        self.assertEqual(len(f.fetch_sector_summary()),11)
        f._sector_summary_cache=None
        f._timeseries_cache[-2]['date']='2026-09-24'
        with self.assertRaises(ValueError):f.fetch_sector_summary()

    def test_open_session_removed_from_every_array(self):
        r=cache.completed_daily(chart(['2026-10-01','2026-10-02']),datetime(2026,10,2,18,tzinfo=timezone.utc))
        self.assertEqual(r['_asOf'],'2026-10-01')
        self.assertEqual(r['indicators']['quote'][0]['volume'],[123])
        self.assertEqual(r['indicators']['adjclose'][0]['adjclose'],[99])
    def test_closed_session_allowed_after_cutoff(self):
        r=cache.completed_daily(chart(['2026-10-01','2026-10-02']),datetime(2026,10,2,21,tzinfo=timezone.utc))
        self.assertEqual(r['_asOf'],'2026-10-02')
    def test_future_and_expired_quotes_rejected(self):
        t=datetime(2026,10,2,18,tzinfo=timezone.utc)
        self.assertIsNone(cache.completed_daily(chart(['2026-10-03']),t))
        self.assertIsNone(cache.completed_daily(chart(['2026-09-24']),t))
    def test_weekend_age(self):
        self.assertEqual(cache.business_age('2026-10-02',datetime(2026,10,5,14,tzinfo=timezone.utc)),1)
    def test_cache_key_distinguishes_symbols_and_intervals(self):
        self.assertNotEqual(cache._cache_path('BRK.B','1y'),cache._cache_path('BRK-B','1y'))
        self.assertNotEqual(cache._cache_path('SPY','1y','1d'),cache._cache_path('SPY','1y','1h'))
    def test_previous_run_cache_is_not_silently_reused(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(cache,'CACHE_DIR',directory),patch.dict(os.environ,{'BREADTH_RUN_STARTED':'200'}):
            data=chart(['2026-10-01']);data['_fetchedAt']=100
            Path(cache._cache_path('SPY','1y')).write_text(json.dumps(data))
            with patch.object(cache,'_http_get',side_effect=cache.requests.ConnectionError) as get:
                self.assertIsNone(cache.get_chart('SPY'))
                self.assertEqual(get.call_count,2)
    def test_incomplete_ma200_never_used_as_negative_vote(self):
        for name in ('nasdaq100/nasdaq100_breadth.py','russell2000/russell2000_breadth.py'):
            source=(Path(__file__).parent/'market-breadth-analyzer'/name).read_text()
            self.assertIn('min_len=200',source)
            self.assertIn('!= expected_date',source)
            self.assertIn('Coverage below 80%',source)

if __name__=='__main__':unittest.main()
