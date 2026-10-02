#!/usr/bin/env python3
"""Portable, public-data-only runner for the complete uploaded Breadth suite.

No SMTP, broker, thesis registration, portfolio state or uploaded account config
is executed. Historical tests keep their original weekly/monthly cadence.
"""
import argparse
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html import escape
from pathlib import Path

SUITE = Path(__file__).resolve().parent
ROOT = SUITE.parents[1]
MBA = SUITE / 'market-breadth-analyzer'
UP = SUITE / 'uptrend-analyzer'
OUT = MBA / 'dashboard'
PUBLIC = ROOT / 'market-breadth/generated'
sys.path.insert(0, str(MBA))
import yahoo_cache
import sector_ideas

def now():
    return datetime.now(timezone.utc).isoformat()

def read(path, default=None):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return {} if default is None else default

def write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False)+'\n')
    tmp.replace(path)

def due(path, days):
    data = read(path)
    try:
        generated = datetime.fromisoformat(data.get('_generatedAtUTC') or data['generated_at']).replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc)-generated).total_seconds() > days*86400
    except (KeyError, ValueError, TypeError):
        return True

def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def execute(script, args, timeout=900):
    log = OUT / (Path(script).stem+'.log')
    print('RUN', Path(script).name, flush=True)
    try:
        with log.open('w') as f:
            result = subprocess.run([sys.executable, str(script), *map(str,args)], stdout=f, stderr=subprocess.STDOUT, timeout=timeout)
        if result.returncode:
            print('ERROR', Path(script).name, log.read_text()[-800:], flush=True)
            return False
        return True
    except subprocess.TimeoutExpired:
        print('TIMEOUT', Path(script).name, flush=True)
        return False

def quote_metadata(symbols, range_):
    rows = {s:yahoo_cache.get_chart(s, range_) for s in symbols}
    valid = {s:r['_asOf'] for s,r in rows.items() if r and len(r.get('timestamp', [])) >= 60}
    aligned = len(valid)==len(symbols) and len(set(valid.values()))==1
    return {'asOf':min(valid.values()) if valid else None, 'inputDates':valid,
            'usable':aligned, 'required':len(symbols), 'valid':len(valid), 'fetchStatus':'OK' if aligned else 'ERROR'}

def dated_report(directory, prefix, field):
    files = sorted(directory.glob(prefix+'*.json'))
    files = [p for p in files if 'history' not in p.name]
    if not files:
        return {'fetchStatus':'ERROR','error':'Generator failed or no dated report','usable':False}
    data = read(files[-1])
    asof = field(data)
    usable = yahoo_cache.business_age(asof) <= 2
    return {'fetchStatus':'OK','asOf':asof,'usable':usable,'data':data,
            'freshness':('FRESH' if yahoo_cache.business_age(asof)<=1 else 'AGED') if usable else 'STALE'}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--request-id', default=os.environ.get('BREADTH_REQUEST_ID') or str(uuid.uuid4()))
    parser.add_argument('--backtests', choices=['auto','skip','all'], default='auto')
    args = parser.parse_args()
    started = now()
    os.environ['BREADTH_RUN_STARTED'] = str(time.time())
    OUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    # Only generated public history is restored; personal package files never enter runtime.
    for p in PUBLIC.glob('*.json'):
        if p.name not in ('run-status.json','engine.json','sector_ideas.json','confirmation.json','intermarket.json','market_timing.json'):
            shutil.copy(p, OUT / p.name)
    for key in ('nasdaq100','russell2000'):
        name=key+'_breadth_history.json'
        folder=MBA/key/'reports'
        folder.mkdir(parents=True,exist_ok=True)
        if (PUBLIC/name).exists():
            shutil.copy(PUBLIC/name,folder/name)
    if (PUBLIC/'heatmap_archive').exists():
        shutil.copytree(PUBLIC/'heatmap_archive',OUT/'heatmap_archive',dirs_exist_ok=True)
    for name in ('sector_ideas','confirmation','intermarket','market_timing','engine','discipline_state','portfolio_risk','actionable'):
        (OUT / (name+'.json')).unlink(missing_ok=True)
    directories = [(MBA/'reports','market_breadth_'),(UP/'reports','uptrend_analysis_'),
                   (MBA/'nasdaq100/reports','nasdaq100_breadth_'),(MBA/'russell2000/reports','russell2000_breadth_')]
    for directory,prefix in directories:
        directory.mkdir(parents=True, exist_ok=True)
        for p in directory.glob(prefix+'*.json'):
            if 'history' not in p.name:
                p.unlink()
    execute(ROOT/'tools/market-breadth/update.py', [], 120)
    ndx = load_module(MBA/'nasdaq100/nasdaq100_breadth.py', 'ndx')
    small = load_module(MBA/'russell2000/russell2000_breadth.py', 'small')
    sectors, stocks = sector_ideas.load_sectors()
    symbols = sorted(set(stocks + ndx.NDX100 + small.SMALLCAP_SAMPLE + ['SPY','QQQ','IWM'] + list(sector_ideas.SECTOR_ETF.values())))
    print(f'PREFETCH {len(symbols)} instruments; completed EOD only', flush=True)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(yahoo_cache.get_chart, symbols))
    print('VALID QUOTES', sum(bool(x) for x in results), '/',len(symbols), flush=True)
    jobs = [(MBA/'scripts/market_breadth_analyzer.py',['--output-dir',MBA/'reports']),
            (UP/'scripts/uptrend_analyzer.py',['--output-dir',UP/'reports']),
            (MBA/'nasdaq100/nasdaq100_breadth.py',['--output-dir',MBA/'nasdaq100/reports']),
            (MBA/'russell2000/russell2000_breadth.py',['--output-dir',MBA/'russell2000/reports']),
            (MBA/'sector_ideas.py',['--output',OUT/'sector_ideas.json'])]
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(lambda j:execute(*j), jobs))
    sources = {}
    for key,(directory,prefix),field in zip(['sp','uptrend','ndx','r2k'], directories,
        [lambda d:d.get('metadata',{}).get('data_freshness',{}).get('latest_date'),
         lambda d:d.get('metadata',{}).get('latest_data_date'),lambda d:d.get('data_date'),lambda d:d.get('data_date')]):
        sources[key] = dated_report(directory,prefix,field)
    ideas = read(OUT/'sector_ideas.json')
    sources['ideas'] = {'asOf':ideas.get('asOf'),'usable':bool(ideas) and yahoo_cache.business_age(ideas.get('asOf'))<=2,
                        'fetchStatus':'OK' if ideas else 'ERROR','coverage':ideas.get('coverage')}
    requirements = {
        'confirmation':(['^VIX','HYG','LQD','RSP','SPY'],'6mo'),
        'market_timing':(['SPY','QQQ','IWM'],'1y'),
        'intermarket':(['^VIX','^VIX3M','DX-Y.NYB','GC=F','CL=F','HYG'],'3mo')}
    for module,(syms,window) in requirements.items():
        info = quote_metadata(syms,window)
        target = OUT / (module+'.json')
        if info['usable'] and execute(MBA/(module+'.py'),['--output',target]):
            data = read(target)
            if data and (module!='confirmation' or len(data.get('signals',[]))==3) and (module!='market_timing' or all(not a.get('error') for a in data.get('indices',{}).values())):
                data.update(info)
                write(target,data)
            else:
                info['usable']=False; info['fetchStatus']='ERROR'
                target.unlink(missing_ok=True)
        else:
            info['usable']=False; info['fetchStatus']='ERROR'
            target.unlink(missing_ok=True)
        sources[module]=info
    write(OUT/'discipline_state.json',{'status':'NEVERIFICAT','new_risk_allowed':False,'reason':'NEVERIFICAT aici: folosește Guardrail și portofoliul din Decision Desk.'})
    # Backtests are historical research, never fresh signals. Keep dates and limitations.
    cadence = [('backtest_breadth.py','backtest.json',1,['--json',OUT/'backtest.json','--md',OUT/'backtest.md']),
               ('backtest_ideas.py','backtest_ideas.json',6,[]),('backtest_rotation.py','backtest_rotation.json',6,[]),
               ('backtest_rotation_stocks.py','backtest_rotation_stocks.json',27,[]),('backtest_earlybuy.py','backtest_earlybuy.json',27,[])]
    for script,name,days,custom in cadence:
        if args.backtests=='all' or (args.backtests=='auto' and due(OUT/name,days)):
            if execute(MBA/script, custom or ['--output',OUT/name], 900):
                research = read(OUT/name)
                research['_generatedAtUTC'] = now()
                research['researchOnly'] = True
                write(OUT/name,research)
            else:
                # Preserve older dated research, but explicitly flag a failed refresh.
                sources[Path(script).stem]={'usable':False,'fetchStatus':'ERROR','error':'Historical refresh failed'}
    for script,output in [('validate_verdict.py','validate.json'),('validate_aplus.py','validate_aplus.json')]:
        execute(MBA/script,['--output',OUT/output,'--history',OUT/'dashboard_history.json'],180)
    has_breadth = any(sources[k]['usable'] for k in ('sp','uptrend','ndx','r2k'))
    aggregate = has_breadth and execute(MBA/'breadth_dashboard.py',['--output-dir',OUT],180)
    engine = read(OUT/'engine.json') if aggregate else {}
    status = 'COMPLETE' if aggregate and all(sources[k]['usable'] for k in ('sp','uptrend','ndx','r2k','ideas','confirmation','market_timing','intermarket')) else 'PARTIAL' if aggregate else 'ERROR'
    manifest = {'requestId':args.request_id,'startedAt':started,'finishedAt':now(),'status':status,
                'mode':'EOD_COMPLETED_BARS','sources':sources,
                'notes':['Nasdaq: original approximate list, not certified current membership.','Small-caps: sample proxy, not all Russell 2000 constituents.','Earnings unknown means unverified, not safe.','Weekday freshness does not adjust exchange holidays.','Private portfolio/discipline integrations are not imported; validate in Decision Desk.']}
    # Limit manifest size; component payloads have their own public JSON files.
    for src in sources.values():
        src.pop('data',None)
    raw = read(ROOT/'market-breadth/data/latest.json')
    raw['full'] = {'requestId':args.request_id,'checkedAt':manifest['finishedAt'],'status':status,
                   'sources':sources,'engine':engine,'ideas':ideas if sources['ideas']['usable'] else {}}
    if sources['ideas']['usable'] and ideas.get('sp_sample'):
        sample=ideas['sp_sample']
        raw['sources']['sp500Price']={'url':sector_ideas.CONSTITUENTS_URL,'fetchStatus':'OK','asOf':sample['asOf'],
            'basis':'S&P constituents sample; Yahoo completed EOD bars; equal company count; current membership',
            'latest':{'date':sample['asOf'],'above200':sample['above200'],'above50':sample['above50']},
            'valid':sample['valid'],'total':sample['total']}
    write(ROOT/'market-breadth/data/latest.json',raw)
    write(PUBLIC/'run-status.json',manifest)
    for p in OUT.glob('*.json'):
        if p.name not in ('discipline_state.json','notification_payload.json'):
            shutil.copy(p,PUBLIC/p.name)
    for key in ('nasdaq100','russell2000'):
        history=MBA/key/'reports'/(key+'_breadth_history.json')
        if history.exists():
            shutil.copy(history,PUBLIC/history.name)
    if (OUT/'heatmap_archive').exists():
        shutil.copytree(OUT/'heatmap_archive',PUBLIC/'heatmap_archive',dirs_exist_ok=True)
    if aggregate:
        content = (OUT/'breadth_dashboard.html').read_text()
        badges=' · '.join(escape(k)+': '+escape(s.get('asOf') or '—')+' ['+('OK' if s['usable'] else 'EXCLUS')+']' for k,s in sources.items() if k in ('sp','uptrend','ndx','r2k','ideas','confirmation','market_timing','intermarket'))
        banner='<div style="padding:18px;background:#142534;color:#e6edf3;font:16px/1.6 system-ui"><b>SCAN '+escape(status)+' · Date EOD, sesiuni încheiate</b><br>'+badges+'<br>Calcul: '+escape(manifest['finishedAt'])+'<br>Nasdaq = lista aproximativă originală; small-cap = eșantion. Datele expirate sunt excluse. Riscul personal se validează în Decision Desk.</div>'
        content = re.sub(r'(<body\b[^>]*>)', lambda m:m.group(1)+banner,content,count=1)
        (PUBLIC/'report.html').write_text(content)
    else:
        (PUBLIC/'report.html').write_text('<!doctype html><html lang="ro"><meta charset="utf-8"><h1>Raport indisponibil</h1><p>Sursele necesare nu au putut fi verificate. Verdictul anterior este suspendat.</p></html>')
    print('FINISHED',status,manifest['finishedAt'],flush=True)
    return 0 if aggregate else 1

if __name__=='__main__':
    sys.exit(main())
