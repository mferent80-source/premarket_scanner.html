#!/usr/bin/env python3
"""Refresh public Yahoo earnings dates for the exact Salt Europe identities.

The quote API requires authentication. The public quote page embeds the same
calendar with an explicit estimate flag. Never infer dates from quarter ends.
"""
import argparse
import concurrent.futures
import datetime as dt
import gzip
from html.parser import HTMLParser
import json
from pathlib import Path
import subprocess
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


class PageData(HTMLParser):
    def __init__(self):
        super().__init__()
        self.collect = False
        self.parts = []
        self.payloads = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.collect = tag == 'script' and attrs.get('type') == 'application/json' and 'data-sveltekit-fetched' in attrs
        if self.collect:
            self.parts = []

    def handle_data(self, data):
        if self.collect:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == 'script' and self.collect:
            self.payloads.append(''.join(self.parts))
            self.collect = False


def parse_page(text, symbol, now):
    page = PageData()
    page.feed(text)
    for payload in page.payloads:
        try:
            envelope = json.loads(payload)
            if not isinstance(envelope, dict):
                continue
            body = json.loads(envelope['body']) if isinstance(envelope.get('body'), str) else envelope.get('body', {})
            if not isinstance(body, dict) or not isinstance(body.get('quoteSummary'), dict):
                continue
            result = body.get('quoteSummary', {}).get('result', [])
            for record in result or []:
                if not isinstance(record, dict) or not isinstance(record.get('price'), dict) or record['price'].get('symbol') != symbol:
                    continue
                events = record.get('calendarEvents')
                if not isinstance(events, dict) or not isinstance(events.get('earnings'), dict):
                    continue
                earnings = events['earnings']
                dates = sorted(set(x['fmt'] for x in earnings.get('earningsDate', []) if isinstance(x, dict) and isinstance(x.get('fmt'), str)))
                dates = [d for d in dates if len(d) == 10 and dt.date.fromisoformat(d) >= now.date()]
                if not dates:
                    return {'status': 'unknown', 'reason': 'Sursa nu oferă o dată viitoare.'}
                estimate = earnings.get('isEarningsDateEstimate')
                status = 'estimated' if estimate is True or len(dates) > 1 else 'confirmed' if estimate is False else 'reported'
                return {'status': status, 'dates': dates, 'estimateFlag': estimate if isinstance(estimate, bool) else None}
        except (ValueError, KeyError, TypeError):
            continue
    return {'status': 'unknown', 'reason': 'Identitatea sau calendarul nu au putut fi verificate în pagina sursei.'}


def fetch_row(row, now):
    url = 'https://finance.yahoo.com/quote/' + urllib.parse.quote(row['symbol'], safe='') + '/'
    out = {'symbol': row['symbol'], 'isin': row['isin'], 'sourceUrl': url, 'checkedAt': now.isoformat()}
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'gzip'})
        with urllib.request.urlopen(req, timeout=25) as response:
            raw = response.read(6 * 1024 * 1024)
            if raw[:2] == b'\x1f\x8b':
                raw = gzip.decompress(raw)
            out.update(parse_page(raw.decode('utf-8'), row['symbol'], now))
    except Exception as exc:
        out.update(status='unknown', reason='Sursa indisponibilă: ' + str(exc)[:140])
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--symbols', default='')
    parser.add_argument('--output', default=str(ROOT / 'europe-stocks/calendar.json'))
    args = parser.parse_args()
    code = "const vm=require('node:vm'),fs=require('node:fs');const c={};c.window=c;vm.createContext(c);for(const f of ['europe-stocks/salt-list.js','europe-stocks/universe.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);console.log(JSON.stringify({id:c.EuropeUniverse.source.id,rows:c.EuropeUniverse.stocks.map(x=>({symbol:x.symbol,isin:x.isin}))}));"
    data = json.loads(subprocess.check_output(['node', '-e', code], cwd=ROOT, text=True))
    selected = set(args.symbols.split(',')) if args.symbols else None
    rows = [x for x in data['rows'] if selected is None or x['symbol'] in selected]
    now = dt.datetime.now(dt.timezone.utc)
    entries = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for i, row in enumerate(pool.map(lambda r: fetch_row(r, now), rows), 1):
            entries.append(row)
            if i % 20 == 0:
                print(f'Calendar {i}/{len(rows)}', flush=True)
    document = {'schema': 1, 'sourceId': data['id'], 'generatedAt': now.isoformat(), 'source': 'Yahoo Finance · pagini publice ale instrumentelor', 'rows': entries}
    destination = Path(args.output)
    destination.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n')
    counts = {s: sum(x['status'] == s for x in entries) for s in ['confirmed', 'estimated', 'reported', 'unknown']}
    print(json.dumps({'rows': len(entries), 'states': counts, 'output': str(destination)}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
