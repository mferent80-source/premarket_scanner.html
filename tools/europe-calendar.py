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
import sys
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


def download_page(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'gzip'})
    with urllib.request.urlopen(req, timeout=25) as response:
        raw = response.read(6 * 1024 * 1024)
        if raw[:2] == b'\x1f\x8b':
            raw = gzip.decompress(raw)
        return raw.decode('utf-8')


def fetch_row(row, now, page=download_page):
    url = 'https://finance.yahoo.com/quote/' + urllib.parse.quote(row['symbol'], safe='') + '/'
    out = {'symbol': row['symbol'], 'isin': row['isin'], 'sourceUrl': url, 'checkedAt': now.isoformat()}
    try:
        out.update(parse_page(page(url), row['symbol'], now))
    except Exception as exc:
        # 19.10.2026: cererea fără răspuns NU e o verificare — build_rows păstrează rândul știut.
        out['_error'] = str(exc)[:140]
    return out


# 19.10.2026: peste 15 % cereri fără răspuns ⇒ sursa e căzută; nu publicăm o pagină de „necunoscut”.
ERROR_LIMIT = 0.15


class TooManyErrors(RuntimeError):
    pass


def load_previous(path):
    try:
        document = json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}
    rows = document.get('rows') if isinstance(document, dict) else None
    return {(r.get('symbol'), r.get('isin')): r for r in rows or [] if isinstance(r, dict)}


def build_rows(rows, previous, now, fetch=fetch_row, progress=None):
    entries, errors = [], 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for i, row in enumerate(pool.map(lambda r: fetch(r, now), rows), 1):
            error = row.pop('_error', None)
            if error is not None:
                errors += 1
                known = previous.get((row['symbol'], row['isin']))
                # rândul vechi rămâne întocmai, cu checkedAt-ul lui: pagina îl arată „vechi”, nu „verificat azi”
                row = dict(known) if known else {**row, 'status': 'unknown', 'reason': 'Sursa indisponibilă: ' + error}
            entries.append(row)
            if progress and i % 20 == 0:
                progress(i)
    if rows and errors / len(rows) > ERROR_LIMIT:
        raise TooManyErrors(f'{errors}/{len(rows)} cereri fără răspuns (peste {ERROR_LIMIT:.0%}); calendarul publicat rămâne neschimbat.')
    return entries, errors


def publish(rows, source_id, destination, now, fetch=fetch_row):
    destination = Path(destination)
    try:
        entries, errors = build_rows(rows, load_previous(destination), now, fetch, progress=lambda i: print(f'Calendar {i}/{len(rows)}', flush=True))
    except TooManyErrors as exc:
        print('OPRIT: ' + str(exc), file=sys.stderr, flush=True)
        return 2
    document = {'schema': 1, 'sourceId': source_id, 'generatedAt': now.isoformat(), 'source': 'Yahoo Finance · pagini publice ale instrumentelor', 'rows': entries}
    destination.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    counts = {s: sum(x['status'] == s for x in entries) for s in ['confirmed', 'estimated', 'reported', 'unknown']}
    print(json.dumps({'rows': len(entries), 'states': counts, 'unanswered': errors, 'output': str(destination)}, ensure_ascii=False), flush=True)
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--symbols', default='')
    parser.add_argument('--output', default=str(ROOT / 'europe-stocks/calendar.json'))
    args = parser.parse_args()
    code = "const vm=require('node:vm'),fs=require('node:fs');const c={};c.window=c;vm.createContext(c);for(const f of ['europe-stocks/salt-list.js','europe-stocks/universe.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);console.log(JSON.stringify({id:c.EuropeUniverse.source.id,rows:c.EuropeUniverse.stocks.map(x=>({symbol:x.symbol,isin:x.isin}))}));"
    data = json.loads(subprocess.check_output(['node', '-e', code], cwd=ROOT, text=True))
    selected = set(args.symbols.split(',')) if args.symbols else None
    rows = [x for x in data['rows'] if selected is None or x['symbol'] in selected]
    sys.exit(publish(rows, data['id'], args.output, dt.datetime.now(dt.timezone.utc)))


if __name__ == '__main__':
    main()
