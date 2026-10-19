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


class SourceOutageTest(unittest.TestCase):
    # 19.10.2026 (calendar Europa): pe 13.10 Yahoo n-a răspuns și 57 de rânduri știute au devenit „Sursă indisponibilă” cu checkedAt proaspăt.
    now = dt.datetime(2026, 10, 19, 6, 15, tzinfo=dt.timezone.utc)
    rows = [{'symbol': f'S{i}.DE', 'isin': f'DE000000000{i}'} for i in range(10)]

    def old(self, row):
        return {'symbol': row['symbol'], 'isin': row['isin'], 'sourceUrl': 'https://finance.yahoo.com/quote/' + row['symbol'] + '/', 'checkedAt': '2026-10-12T06:15:00+00:00', 'status': 'confirmed', 'dates': ['2026-11-05'], 'estimateFlag': False}

    def fetch(self, failing):
        def page(row):
            if row['symbol'] in failing:
                raise OSError('HTTP Error 429: Too Many Requests')
            return '<html></html>'
        return lambda row, now: module.fetch_row(row, now, page=lambda url: page(row))

    def test_unanswered_request_keeps_the_known_row_and_its_old_check_time(self):
        previous = {(r['symbol'], r['isin']): self.old(r) for r in self.rows}
        document, errors = module.build_rows(self.rows, previous, self.now, fetch=self.fetch({'S3.DE'}))
        self.assertEqual(errors, 1)
        kept = next(r for r in document if r['symbol'] == 'S3.DE')
        self.assertEqual(kept, self.old(self.rows[3]))
        fresh = next(r for r in document if r['symbol'] == 'S4.DE')
        self.assertEqual(fresh['checkedAt'], self.now.isoformat())

    def test_unanswered_request_without_history_is_unknown_not_guessed(self):
        document, errors = module.build_rows(self.rows, {}, self.now, fetch=self.fetch({'S0.DE'}))
        self.assertEqual(errors, 1)
        new = next(r for r in document if r['symbol'] == 'S0.DE')
        self.assertEqual(new['status'], 'unknown')
        self.assertIn('Sursa indisponibilă', new['reason'])
        self.assertNotIn('_error', new)

    def test_more_than_15_percent_errors_stop_without_publishing(self):
        with self.assertRaises(module.TooManyErrors):
            module.build_rows(self.rows, {}, self.now, fetch=self.fetch({'S1.DE', 'S2.DE'}))
        document, errors = module.build_rows(self.rows, {}, self.now, fetch=self.fetch({'S1.DE'}))
        self.assertEqual((len(document), errors), (10, 1))

    def test_main_leaves_the_published_file_untouched_on_outage(self):
        import tempfile
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'calendar.json'
            target.write_text('{"keep": true}\n')
            failing = {r['symbol'] for r in self.rows}
            code = module.publish(self.rows, 'salt-test', target, self.now, fetch=self.fetch(failing))
            self.assertNotEqual(code, 0)
            self.assertEqual(target.read_text(), '{"keep": true}\n')


if __name__ == '__main__':
    unittest.main()
