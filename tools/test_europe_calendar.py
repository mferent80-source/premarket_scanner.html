import datetime as dt
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('europe_calendar', Path(__file__).with_name('europe-calendar.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CalendarTest(unittest.TestCase):
    now = dt.datetime(2026, 10, 6, tzinfo=dt.timezone.utc)

    def page(self, symbol='SAP.DE', dates=None, flag=False):
        events = {'earningsDate': [{'fmt': d} for d in dates or ['2026-10-21']], 'isEarningsDateEstimate': flag}
        body = {'quoteSummary': {'result': [{'price': {'symbol': symbol}, 'calendarEvents': {'earnings': events}}]}}
        envelope = json.dumps({'body': json.dumps(body)})
        return '<script type="application/json" data-sveltekit-fetched>' + envelope + '</script>'

    def test_explicit_estimate_flag_and_date_range(self):
        result = module.parse_page(self.page(), 'SAP.DE', self.now)
        self.assertEqual(result['status'], 'confirmed')
        self.assertFalse(result['estimateFlag'])
        self.assertEqual(module.parse_page(self.page(flag=True), 'SAP.DE', self.now)['status'], 'estimated')
        self.assertEqual(module.parse_page(self.page(dates=['2026-10-21', '2026-10-23']), 'SAP.DE', self.now)['status'], 'estimated')

    def test_missing_flag_is_not_confirmed(self):
        self.assertEqual(module.parse_page(self.page(flag=None), 'SAP.DE', self.now)['status'], 'reported')

    def test_different_symbol_and_past_dates_remain_unknown(self):
        self.assertEqual(module.parse_page(self.page(symbol='SAP'), 'SAP.DE', self.now)['status'], 'unknown')
        self.assertEqual(module.parse_page(self.page(dates=['2026-09-01']), 'SAP.DE', self.now)['status'], 'unknown')

    def test_bad_payload_and_invalid_date_are_not_guessed(self):
        self.assertEqual(module.parse_page('<html>Oct 21, 2026</html>', 'SAP.DE', self.now)['status'], 'unknown')
        self.assertEqual(module.parse_page(self.page(dates=['2026-02-30']), 'SAP.DE', self.now)['status'], 'unknown')

    def test_unrelated_arrays_and_null_payloads_do_not_hide_the_calendar(self):
        prefix = ''.join('<script type="application/json" data-sveltekit-fetched>' + json.dumps({'body': json.dumps(data)}) + '</script>' for data in [None, [], {'quoteSummary': None}])
        self.assertEqual(module.parse_page(prefix + self.page(), 'SAP.DE', self.now)['status'], 'confirmed')


if __name__ == '__main__':
    unittest.main()
