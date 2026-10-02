import unittest
from datetime import date
from unittest.mock import patch
import update


class SourceContractTests(unittest.TestCase):
    TODAY = date(2026, 10, 2)
    CSV = 'worksheet,date,count,total,ratio,ma_10,slope,trend\nall,2026-10-01,10,100,0.1,0.11,-0.01,down\nsec_technology,2026-09-30,5,10,0.5,0.4,0.01,up\n'

    def test_source_and_sector_keep_distinct_dates(self):
        x = update.parse_uptrend(self.CSV, self.TODAY)
        self.assertEqual(x['asOf'], '2026-10-01')
        self.assertEqual(x['sectors'][0]['date'], '2026-09-30')

    def test_unordered_input_uses_latest_observation(self):
        x = update.parse_uptrend(self.CSV + 'all,2026-09-29,20,100,0.2,0.2,0,neutral\n', self.TODAY)
        self.assertEqual(x['market']['ratio'], .1)
        self.assertEqual(x['history'][0]['date'], '2026-09-29')

    def test_ratio_must_match_counts(self):
        with self.assertRaises(ValueError):
            update.parse_uptrend(self.CSV.replace('10,100,0.1', '10,100,0.8'), self.TODAY)

    def test_future_data_rejected(self):
        with self.assertRaises(ValueError):
            update.parse_uptrend(self.CSV.replace('2026-10-01', '2026-10-03'), self.TODAY)

    def test_nonfinite_rejected(self):
        with self.assertRaises(ValueError):
            update.parse_uptrend(self.CSV.replace('-0.01', 'NaN'), self.TODAY)

    @patch('update.urlopen', side_effect=TimeoutError('provider timeout'))
    def test_failure_preserves_date_and_marks_error(self, _):
        old = {'sources': {'uptrend': {'asOf': '2026-09-22', 'market': {'count': 9}}}}
        key, src = update.fetch_source('uptrend', update.UPTREND, update.parse_uptrend, self.TODAY, old)
        self.assertEqual(src['asOf'], '2026-09-22')
        self.assertEqual(src['fetchStatus'], 'ERROR')
        self.assertIn('timeout', src['error'])

    def test_sp500_fraction_not_0_to_100(self):
        csv = 'Date,Breadth_Index_Raw,Breadth_50_Index_Raw,Breadth_Index_8MA,Breadth_Index_200MA,Bearish_Signal\n2026-09-24,0.47,0.26,0.52,0.63,True\n'
        x = update.parse_sp500(csv, self.TODAY)
        self.assertEqual(x['latest']['above200'], .47)
        self.assertTrue(x['latest']['bearish'])
        with self.assertRaises(ValueError):
            update.parse_sp500(csv.replace('0.47', '47'), self.TODAY)


if __name__ == '__main__':
    unittest.main()
