"""Shared dated EOD cache. New runs refetch; completed daily bars only."""
import hashlib
import json
import os
import tempfile
import time
import threading
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import requests
CACHE_DIR = os.environ.get('BREADTH_CACHE_DIR', os.path.join(tempfile.gettempdir(), 'tt-breadth-cache'))
UA = {'User-Agent': 'TradingTools-Breadth/2.0'}
NY = ZoneInfo('America/New_York')
_sessions = threading.local()

def _http_get(url, **kwargs):
    # One connection pool per worker: no cross-thread Session mutation, no
    # repeated TLS handshake for every one of the ~600 stock requests.
    if not hasattr(_sessions, 'session'):
        _sessions.session = requests.Session()
    return _sessions.session.get(url, **kwargs)

def _cache_path(symbol, range_, interval='1d'):
    return os.path.join(CACHE_DIR, hashlib.sha256(f'{symbol}|{range_}|{interval}'.encode()).hexdigest()+'.json')

def business_age(day, now=None):
    today = (now or datetime.now(timezone.utc)).astimezone(NY).date()
    try:
        d = datetime.strptime(day, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return 999
    if d > today:
        return 999
    age = 0
    while d < today and age < 31:
        d += timedelta(days=1)
        age += d.weekday() < 5
    return age

def completed_daily(result, now=None):
    # Stocks: 16:15 NY; daily futures/dollar proxies: conservative 17:15 NY.
    now = (now or datetime.now(timezone.utc)).astimezone(NY)
    q = result.get('indicators', {}).get('quote', [{}])[0]
    ts = result.get('timestamp', [])
    keep = []
    meta = result.get('meta', {})
    cutoff = (17, 15) if meta.get('instrumentType') == 'FUTURE' or meta.get('symbol') == 'DX-Y.NYB' else (16, 15)
    for i, stamp in enumerate(ts):
        day = datetime.fromtimestamp(stamp, NY).date()
        close = (q.get('close') or [])[i] if i < len(q.get('close') or []) else None
        complete = day < now.date() or (day == now.date() and (now.hour, now.minute) >= cutoff)
        if complete and close is not None and close > 0:
            keep.append(i)
    if not keep:
        return None
    result = json.loads(json.dumps(result))
    result['timestamp'] = [ts[i] for i in keep]
    for family in result.get('indicators', {}).values():
        for item in family:
            for key, vals in item.items():
                if isinstance(vals, list):
                    item[key] = [vals[i] if i < len(vals) else None for i in keep]
    result['_asOf'] = datetime.fromtimestamp(result['timestamp'][-1], NY).date().isoformat()
    return result if business_age(result['_asOf'], now) <= 2 else None

def get_chart(symbol, range_='1y', interval='1d'):
    if interval != '1d':
        raise ValueError('EOD cache supports daily bars only')
    os.makedirs(CACHE_DIR, exist_ok=True)
    cp = _cache_path(symbol, range_, interval)
    run_start = float(os.environ.get('BREADTH_RUN_STARTED', '0'))
    try:
        with open(cp, encoding='utf-8') as f:
            cached = json.load(f)
        fetched = cached.get('_fetchedAt', 0)
        if fetched >= run_start and (run_start or time.time()-fetched <= 300):
            if cached.get('_error'):
                return None
            return completed_daily(cached)
    except (OSError, ValueError, TypeError):
        pass
    for host in ('query1', 'query2'):
        try:
            r = _http_get(f'https://{host}.finance.yahoo.com/v8/finance/chart/{requests.utils.quote(symbol, safe="")}', params={'range':range_, 'interval':interval}, headers=UA, timeout=15)
            if r.status_code == 429:
                time.sleep(2)
                continue
            r.raise_for_status()
            raw = r.json()['chart']['result'][0]
            raw['_fetchedAt'] = time.time()
            result = completed_daily(raw)
            if not result:
                continue
            fd, tmp = tempfile.mkstemp(dir=CACHE_DIR)
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(result, f, allow_nan=False)
            os.replace(tmp, cp)
            return result
        except (requests.RequestException, ValueError, KeyError, IndexError, TypeError, OSError):
            continue
    # A failed symbol is not hammered again by every module in this same scan.
    # A subsequent scan refreshes this entry just as it refreshes successful ones.
    fd, tmp = tempfile.mkstemp(dir=CACHE_DIR)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump({'_error':True, '_fetchedAt':time.time()}, f)
    os.replace(tmp, cp)
    return None

def get_closes(symbol, range_='1y', min_len=60):
    r = get_chart(symbol, range_)
    c = r['indicators']['quote'][0]['close'] if r else []
    return c if len(c) >= min_len else None

def get_ohlcv(symbol, range_='1y', min_len=60):
    r = get_chart(symbol, range_)
    if not r:
        return None
    q = r['indicators']['quote'][0]
    rows = []
    for i, stamp in enumerate(r['timestamp']):
        h,l,c,v = [(q.get(k) or [None]*len(r['timestamp']))[i] for k in ('high','low','close','volume')]
        if None not in (h,l,c):
            rows.append({'high':h, 'low':l, 'close':c, 'vol':v or 0, 'date':datetime.fromtimestamp(stamp, NY).date().isoformat()})
    return rows if len(rows) >= min_len else None

def observation_date(symbol, range_='1y'):
    r = get_chart(symbol, range_)
    return r.get('_asOf') if r else None

def cleanup_cache(keep_days=2):
    if os.path.isdir(CACHE_DIR):
        for name in os.listdir(CACHE_DIR):
            path = os.path.join(CACHE_DIR, name)
            if time.time()-os.path.getmtime(path) > keep_days*86400:
                os.remove(path)
