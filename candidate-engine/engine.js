(function () {
  'use strict';

  var SCAN_MS = 5 * 60 * 1000;
  var CACHE_KEY = 'ce_results_v2';
  var demoMode = new URLSearchParams(location.search).get('demo') === '1';
  var requested = new URLSearchParams(location.search).get('symbol');
  requested = /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(requested||'')?requested:null;
  var requestedMode = new URLSearchParams(location.search).get('mode') === 'reversal'?'reversal':'momentum';
  var US_CORE = [
    'AAPL','MSFT','NVDA','AVGO','AMD','MU','INTC','WDC','AMAT','LRCX','KLAC','QCOM','TSM',
    'PLTR','CRWD','PANW','SNOW','AMZN','META','GOOGL','NFLX','TSLA','COIN','HOOD','SOFI',
    'JPM','BAC','XOM','CVX','CAT','BA','GE','RTX','UNH','LLY','PFE','NVO','PYPL','EL','WBA',
    'UPS','APLD','CIFR','MARA','RIOT','NKE','SBUX','DG','TGT','DIS','RIVN','LCID','ROKU',
    'ENPH','SEDG','ON','SMCI','MRVL','CRM','ADBE','PATH','U','DKNG','CHWY','ETSY','JD','BABA','PDD'
  ];
  var EU_CORE = [
    'ASML.AS','SAP.DE','RHM.DE','VOW3.DE','MBG.DE','BAYN.DE','SIE.DE','AIR.PA','SU.PA',
    'MC.PA','TTE.PA','OR.PA','NOVO-B.CO','MIGA.MU','IFX.DE','ADS.DE','ALV.DE','DTE.DE'
  ];
  var state = {
    mode: requested?requestedMode:'momentum', analyses: [], scanning: false, shellVisible: true,
    momentum: [], reversal: [], selected: null, updatedAt: 0,
    trend: [], trendMeta: null, trendEroare: '', trendIesiri: [], peadPentru: null,
    failures: [], earningsOk: false, earningsMap: {}, timer: null,
    verified: 0, scanned: 0, hasScan: false, benchmarks: [], sectorPending: false, generation: 0, scanKey: null
  };

  function $(id) { return document.getElementById(id); }
  function safeNum(v) { if (v == null || v === '') return null; v = +v; return isFinite(v) ? v : null; }
  function lastValue(v) { return Array.isArray(v) ? safeNum(v[v.length - 1]) : safeNum(v); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }
  function pct(a, b) { return a > 0 && b != null ? (b - a) / a * 100 : null; }
  function fmt(v, d) { return v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function signed(v, d) { return v == null ? '—' : (v > 0 ? '+' : '') + fmt(v, d) + '%'; }
  function ageText(ts) {
    if (!ts) return '—';
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return s + 's';
    return Math.round(s / 60) + 'm';
  }
  function regionOf(sym) { return EU_CORE.indexOf(sym) >= 0 || /\.(DE|PA|AS|CO|MU|MI|L|SW)$/i.test(sym) ? 'EU' : 'US'; }
  function unique(arr) { return Array.from(new Set(arr.map(function (s) { return String(s || '').trim().toUpperCase(); }).filter(Boolean))); }
  function universe() {
    var kind = $('universe').value;
    var wl = window.WL ? WL.get() : [];
    if(requested)wl=wl.concat([requested]);
    if (kind === 'watchlist') return unique(wl);
    if (kind === 'us') return unique(US_CORE.concat(wl.filter(function (s) { return regionOf(s) === 'US'; })));
    if (kind === 'eu') return unique(EU_CORE.concat(wl.filter(function (s) { return regionOf(s) === 'EU'; })));
    return unique(US_CORE.concat(EU_CORE, wl));
  }

  function validateDeps() {
    var deps = {
      sData: !!(window.D && D.fetchStock), sTi: !!(window.TI && TI.calcEMA && TI.calcATR),
      sMeb: !!(window.MEB && MEB.computeEarlyBird), sGov: !!(window.GV && GV.status),
      sWl: !!(window.WL && WL.get)
    };
    Object.keys(deps).forEach(function (id) {
      var el = $(id); el.textContent = deps[id] ? 'OK' : 'LIPSĂ'; el.className = deps[id] ? 'ok' : 'fail';
    });
    return deps.sData && deps.sTi && deps.sMeb && deps.sGov && !!window.DailySeries;
  }

  function closes(bars) { return bars.map(function (b) { return +b.c; }); }
  function volumes(bars) { return bars.map(function (b) { return +b.v || 0; }); }
  function highs(bars) { return bars.map(function (b) { return +b.h; }); }
  function lows(bars) { return bars.map(function (b) { return +b.l; }); }
  function retAt(c, n) { return c.length > n ? pct(c[c.length - 1 - n], c[c.length - 1]) : null; }
  function avgDollarVol(bars) {
    var xs = bars.slice(-20).map(function (b) { return (+b.c || 0) * (+b.v || 0); });
    return mean(xs) || 0;
  }
  function daysSinceLow(arr, lookback) {
    var s = arr.slice(-lookback), min = Math.min.apply(null, s), i = s.lastIndexOf(min);
    return Math.max(1, s.length - 1 - i);
  }
  function sparkValues(c) { return c.slice(-45).map(function (v) { return +v; }); }

  async function earningsGate() {
    state.earningsOk = false; state.earningsMap = {};
    if (!window.EARN || !EARN.calendar) return;
    try {
      var r = await EARN.calendar({ zile: 14, toate: true });
      if (!r || !r.ok) return;
      state.earningsOk = true;
      (r.items || []).forEach(function (e) { if (e && e.symbol && !state.earningsMap[e.symbol]) state.earningsMap[e.symbol] = e; });
    } catch (_) {}
  }
  // Audit 14.10.2026: zilele pana la raportare se numara pe calendarul New York (la 23:30 ora Romaniei e inca azi la New York),
  // iar o raportare in fereastra de 14 zile NU mai lasa candidatul actionable: planul Desk-ului se tine zile/saptamani si ar
  // traversa raportarea cu un stop pe care un gap il sare. Fara cheie (neverificat) la fel: nu se cumpara pe o garda oarba.
  function zileNY(dataIso) {
    var azi = DailySeries.date(Date.now(), 'America/New_York');
    return Math.round((Date.parse(dataIso + 'T12:00:00Z') - Date.parse(azi + 'T12:00:00Z')) / 86400000);
  }
  function earningsInfo(sym) {
    var e = state.earningsMap[sym];
    if (!state.earningsOk) return { penalty: 5, blocked: false, unverified: true, text: 'earnings neverificat' };
    if (regionOf(sym) === 'EU') return { penalty: 5, blocked: false, unverified: true, text: 'earnings EU neverificat' };
    if (!e || !e.date) return { penalty: 0, blocked: false, text: 'fără earnings în 14z' };
    var days = zileNY(e.date);
    if (days <= 1) return { penalty: 30, blocked: true, days: days, text: 'earnings în ' + Math.max(0, days) + 'z' };
    if (days <= 3) return { penalty: 12, blocked: false, inFereastra: true, days: days, text: 'earnings în ' + days + 'z' };
    return { penalty: 4, blocked: false, inFereastra: true, days: days, text: 'earnings în ' + days + 'z' };
  }
  function gardaEarnings(earn) {
    if (!earn) return '';
    if (earn.unverified) return 'earnings neverificat — fără cheia Finnhub nu se construiește plan';
    if (earn.inFereastra) return 'raportează în ' + earn.days + ' zile — planul (zile, nu ore) ar traversa raportarea';
    return '';
  }

  function momentumScore(f, earn) {
    var s = 0;
    if (f.price > f.ema21) s += 12;
    if (f.ema21 > f.ema50) s += 12;
    if (f.price > f.ema50) s += 7;
    if (f.ret5 > 0) s += clamp(f.ret5 * 1.4, 0, 9);
    if (f.ret20 > 0) s += clamp(f.ret20 * .55, 0, 8);
    if (f.rs20 > 0) s += clamp(5 + f.rs20, 0, 12);
    if (f.rvol >= 1.1) s += 7;
    if (f.rvol >= 1.5) s += 4;
    if (f.rsi >= 50 && f.rsi <= 68) s += 10; else if (f.rsi >= 44 && f.rsi <= 74) s += 5;
    if (f.ext21 >= -1 && f.ext21 <= 4) s += 9; else if (f.ext21 <= 7) s += 3;
    if (f.avgDollarVol >= 20000000) s += 7; else if (f.avgDollarVol >= 5000000) s += 4;
    if (f.dayChg > 0 && f.dayChg < 6) s += 4;
    return Math.round(clamp(s - earn.penalty, 0, 100));
  }
  function reversalScore(f, eb, earn) {
    var s = 0;
    if (f.drawdown <= -20) s += 12;
    if (f.drawdown <= -35) s += 6;
    if (f.drawdown <= -50) s += 3;
    if (eb && eb.isEarly) s += 28;
    else if (eb && eb.isConfirmed) s += 20;
    if (eb && eb.signals) {
      if (eb.signals.higherLow) s += 10;
      if (eb.signals.stabilized) s += 7;
      if (eb.signals.rsiRising) s += 8;
      if (eb.signals.volWake) s += 8;
      if (eb.signals.nearEma) s += 6;
    }
    if (f.bounce60 >= 3 && f.bounce60 <= 25) s += 8;
    if (f.avgDollarVol >= 10000000) s += 6; else if (f.avgDollarVol >= 3000000) s += 3;
    return Math.round(clamp(s - earn.penalty, 0, 100));
  }

  function procente(v) { return signed(v, 1).replace('%', ' %'); }
  function fapteCandidat(item, f, earn, aligned, blocked, garda) {
    var out = [{ k: 'EOD', v: item.sourceDate || '', rol: 'info' }];
    out.push({ k: 'trend', v: aligned ? 'aliniat EMA21/EMA50' : 'neconfirmat', rol: aligned ? 'support' : 'attention' });
    out.push({ k: 'RS', v: f.rs20 == null ? 'fără indice' : procente(f.rs20), rol: f.rs20 == null ? 'attention' : f.rs20 >= 0 ? 'support' : 'attention' });
    out.push({ k: 'RVOL', v: fmt(f.rvol, 2) + '×', rol: f.rvol >= 1 ? 'support' : 'attention' });
    out.push({ k: 'earnings', v: String(earn.text || '').replace(/^earnings /, ''), rol: earn.blocked || garda ? 'block' : earn.inFereastra || earn.unverified ? 'attention' : 'support' });
    if (item.mode === 'reversal') out.push({ k: 'scădere', v: procente(f.drawdown), rol: 'info' }, { k: 'revenire', v: procente(f.bounce60), rol: 'info' });
    if (blocked) out.push({ k: 'plan', v: 'blocat', rol: 'block' }); else if (!item.actionable) out.push({ k: 'confirmare', v: 'incompletă', rol: 'attention' });
    return out;
  }
  async function analyze(sym, benchmark, govScan) {
    var source=DailySeries.read(await D.fetchStock(sym, { range: '1y', interval: '1d', ttl: 1800 }),sym);
    var bars=source.bars,benchmarkRet20=benchmark&&benchmark.asOf===source.asOf?benchmark.ret20:null;
    if (!bars || bars.length < 80) throw new Error('istoric insuficient');
    var c = closes(bars), h = highs(bars), l = lows(bars), v = volumes(bars);
    var price = c[c.length - 1], ema21 = lastValue(TI.calcEMA(c, 21)), ema50 = lastValue(TI.calcEMA(c, 50));
    var rsi = lastValue(TI.calcRSI(c, 14)), atr = lastValue(TI.calcATR(h, l, c, 14));
    if (ema21 == null || ema50 == null || rsi == null || !(atr>0)) throw new Error('indicatori incompleți');
    var avgVol20 = mean(v.slice(-21, -1)) || mean(v.slice(-20)) || 0;
    var rvol = avgVol20 > 0 ? v[v.length - 1] / avgVol20 : 0;
    var max252 = Math.max.apply(null, h.slice(-252));
    var min60 = Math.min.apply(null, l.slice(-60));
    var f = {
      symbol: sym, region: regionOf(sym), bars: bars, spark: sparkValues(c), price: price,
      ema21: ema21, ema50: ema50, rsi: rsi, atr: atr, rvol: rvol,
      ret5: retAt(c, 5) || 0, ret20: retAt(c, 20) || 0, dayChg: retAt(c, 1) || 0,
      rs20: benchmarkRet20===null?null:retAt(c,20)-benchmarkRet20, ext21: ema21 ? pct(ema21, price) : 99,
      drawdown: max252 > 0 ? pct(max252, price) : 0, bounce60: min60 > 0 ? pct(min60, price) : 0,
      baseDays: daysSinceLow(l, 60), avgDollarVol: avgDollarVol(bars)
    };
    var earn = earningsInfo(sym);
    var hist = { closes: c, highs: h, lows: l, vols: v };
    var eb = MEB.computeEarlyBird(hist, 4, null);
    var mScore = momentumScore(f, earn);
    var rScore = reversalScore(f, eb, earn);
    var gov = govScan || (window.GV && GV.status ? GV.status() : { verdict: 'NEVERIFICAT', reasons: ['Governor indisponibil'] });
    var knownGovernor = ['TRADE','CAUTION','HALTED'].includes(gov.verdict);
    var blocked = earn.blocked || !['TRADE','CAUTION'].includes(gov.verdict);
    var sector = window.EL && EL.sectorOf ? EL.sectorOf(sym) : 'Necunoscut';
    var trend=window.TTDecisionVerdict?.trend(bars);
    var mid = price, entryLow = price * .997, entryHigh = price * 1.003;
    var stop = price - f.atr * 1.25, target = entryHigh + Math.max(.01, entryHigh - stop) * 2;
    var momentumState = blocked ? 'BLOCKED' : (mScore >= 80 && rvol >= 1.15 ? 'FIRE' : (mScore >= 68 ? 'ARMED' : 'EARLY'));
    var reversalState = blocked ? 'BLOCKED' : (eb && eb.isConfirmed && rScore >= 82 ? 'FIRE' : (eb && eb.isConfirmed ? 'ARMED' : 'EARLY'));
    var trendAligned=trend?trend.short==='up'&&trend.medium==='up':price>ema21&&ema21>ema50;
    var momentum = {
      symbol: sym, dataQuality:source.dataQuality, sourceDate:source.asOf,sourceTimezone:source.timezone,sourceCloseMinutes:source.closeMinutes,currency:source.currency,name: sym, trend:trend, atr:atr, region: f.region, sector: sector, mode: 'momentum', score: mScore,
      state: momentumState, price: price, dayChg: f.dayChg, rvol: f.rvol, rs: f.rs20,
      metricA: f.ret20, metricB: f.ext21,
      eligible: knownGovernor && price >= 5 && f.avgDollarVol >= 3000000 && f.ext21 <= 8 && f.dayChg < 10 && mScore >= 55,
      actionable: !!source.currency && benchmarkRet20!==null && !blocked && price >= 5 && f.avgDollarVol >= 3000000 && f.ext21 <= 8 && f.dayChg < 10 && mScore >= 68 && trendAligned && f.rs20>=0 && f.rvol>=1,
      reason: 'EOD '+source.asOf+' · Trend ' + (trendAligned ? 'ascendent aliniat pe EMA21 / EMA50' : 'neconfirmat pe orizonturile scurt și mediu') + ' · RS vs benchmark ' + signed(f.rs20, 1) + ' · RVOL ' + fmt(f.rvol, 2) + '× · ' + earn.text+' · țintă 2R calculată la limita intrării, nu rezistență confirmată',
      entryLow: entryLow, entryHigh: entryHigh, stop: stop, target: target, spark: f.spark,
      governor: gov, earnings: earn.text, ts: Date.now()
    };
    if(!momentum.actionable&&!blocked){momentum.state='WATCH';momentum.reason+=' · confirmarea completă nu este îndeplinită';}
    var reversalSafe = eb && !eb.isWilting && !eb.isRanBlocked;
    var reversalWatch = reversalSafe && f.drawdown <= -12 && f.bounce60 >= 1 && f.bounce60 <= 35
      && (eb.isEarly || eb.isConfirmed || (eb.signals && (eb.signals.stabilized || eb.signals.rsiRising || eb.signals.higherLow)) || price > ema21);
    var reversalActionable = !!source.currency && benchmarkRet20!==null && !blocked && price >= 5 && f.avgDollarVol >= 3000000 && f.drawdown <= -20
      && f.bounce60 >= 2 && f.bounce60 <= 30 && reversalSafe && eb.isConfirmed && rScore >= 50;
    if (!blocked && !reversalActionable && reversalWatch) reversalState = 'WATCH';
    var reversal = {
      symbol: sym, dataQuality:source.dataQuality, sourceDate:source.asOf,sourceTimezone:source.timezone,sourceCloseMinutes:source.closeMinutes,currency:source.currency,name: sym, trend:trend, atr:atr, region: f.region, sector: sector, mode: 'reversal', score: rScore,
      state: reversalState, price: price, dayChg: f.dayChg, rvol: f.rvol, rs: f.rs20,
      metricA: f.drawdown, metricB: f.bounce60, baseDays: f.baseDays,
      eligible: knownGovernor && price >= 5 && f.avgDollarVol >= 3000000 && reversalWatch && rScore >= 32,
      actionable: reversalActionable,
      reason: 'EOD '+source.asOf+' · '+(reversalActionable ? 'Confirmare tehnică zilnică · ' : 'Monitorizare · ') + (eb && MEB.ebSignalText ? MEB.ebSignalText(eb) : 'structură reversal') + ' · scădere ' + signed(f.drawdown, 1) + ' · revenire ' + signed(f.bounce60, 1) + ' · ' + earn.text,
      entryLow: entryLow, entryHigh: entryHigh, stop: stop, target: target, spark: f.spark,
      governor: gov, earnings: earn.text, ts: Date.now()
    };
    var garda = gardaEarnings(earn);
    if (garda && !blocked) { for (const item of [momentum, reversal]) { if (item.actionable) { item.actionable = false; item.state = 'WATCH'; } item.reason += ' · ' + garda; } }
    if(blocked){for(const item of [momentum,reversal])item.reason+=' · Plan blocat: '+(earn.blocked?earn.text:gov.reasons?.[0]||'Governor '+gov.verdict);}
    if(window.TTDecisionVerdict){for(const item of [momentum,reversal]){const verdict=TTDecisionVerdict.build({purpose:'entry',candidate:item,risk:gov});if(!verdict.canPlan){item.actionable=false;item.state=blocked||verdict.code==='BLOCKED'?'BLOCKED':'WATCH';item.reason+=' · '+(verdict.blockers[0]?.text||verdict.cautions[0]?.text||verdict.title);}}}
    momentum.fapte = fapteCandidat(momentum, f, earn, trendAligned, blocked, garda); reversal.fapte = fapteCandidat(reversal, f, earn, trendAligned, blocked, garda);
    return { momentum: momentum, reversal: reversal };
  }

  function capSectors(items) {
    var out = [], counts = {};
    items.slice().sort(function (a, b) { return b.score - a.score; }).forEach(function (x) {
      var sec = x.sector || 'Necunoscut';
      var maxPerSector = sec === 'Necunoscut' ? 3 : 2;
      if ((counts[sec] || 0) >= maxPerSector) return;
      counts[sec] = (counts[sec] || 0) + 1; out.push(x);
    });
    return out.slice(0, 10);
  }
  async function benchmarkReturns() {
    var out = { US:null,EU:null };
    state.benchmarks=[];
    for(var pair of [['US','SPY'],['EU','^STOXX50E']]){try{var source=DailySeries.read(await D.fetchStock(pair[1],{range:'6mo',interval:'1d',ttl:1800}),pair[1]),ret=retAt(closes(source.bars),20);if(ret===null)throw Error('Istoric indice insuficient.');out[pair[0]]={asOf:source.asOf,ret20:ret};state.benchmarks.push({region:pair[0],symbol:pair[1],asOf:source.asOf});}catch(e){state.benchmarks.push({region:pair[0],symbol:pair[1],reason:e.message||'Indice indisponibil'});}}
    return out;
  }
  async function updateSectors(items) {
    if (!window.EL || !EL.enrichSectorsYahoo) return;
    try {
      var syms = unique(items.filter(function(x){return x.eligible;}).slice().sort(function(a,b){return b.score-a.score;}).map(function (x) { return x.symbol; })).slice(0,24);
      var map = EL.loadSectorMap();
      for (var i = 0; i < syms.length; i += 12) map = await EL.enrichSectorsYahoo(syms.slice(i, i + 12), map);
      items.forEach(function (x) { x.sector = EL.sectorOf(x.symbol, map); });
    } catch (_) {}
  }

  function setScanning(on) {
    state.scanning = on; $('scanBtn').disabled = on; $('universe').disabled = on;
    $('scanState').textContent = on ? 'SCANEZ PIAȚA' : state.hasScan && !state.verified ? 'DATE INDISPONIBILE' : 'SCANARE FINALIZATĂ';
    $('liveState').classList.toggle('off', !!state.hasScan && !state.verified);
    if (!state.selected) renderDetail(null);
  }
  function showAlert(msg, error) {
    var el = $('alert'); el.hidden = !msg; el.textContent = msg || ''; el.className = 'ce-alert' + (error ? ' error' : '');
  }
  function progress(done, total) {
    $('progress').style.width = (total ? Math.round(done / total * 100) : 0) + '%';
    $('ctxScanned').textContent = done + ' / ' + total;
  }
  function topSectors(items) {
    var c = {}; items.forEach(function (x) { c[x.sector] = (c[x.sector] || 0) + 1; });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).slice(0, 3).join(' · ') || '—';
  }

  function universeKey(){return JSON.stringify([$('universe').value,universe()]);}
  function scanCache(){return {universeKey:state.scanKey,analyses:requested?state.analyses.filter(function(x){return x.symbol===requested;}):[],momentum:state.momentum,reversal:state.reversal,updatedAt:state.updatedAt,scannedCount:state.scanned,verifiedCount:state.verified,failureCount:state.failures.length,failures:state.failures,benchmarks:state.benchmarks};}
  function saveScan(){var cache=scanCache();try{localStorage.setItem(CACHE_KEY,JSON.stringify(cache));return {saved:true,cache:cache};}catch(_){return {saved:false,cache:cache};}}
  function rankResults(){state.momentum=capSectors(state.analyses.filter(function(x){return x.mode==='momentum'&&x.eligible;}));state.reversal=capSectors(state.analyses.filter(function(x){return x.mode==='reversal'&&x.eligible;}));$('countMomentum').textContent=state.momentum.length;$('countReversal').textContent=state.reversal.length;$('ctxEligible').textContent=(state.momentum.length+state.reversal.length)+' top';}
  function coverage(){
    $('scanDetailsTitle').textContent='Acoperire · '+state.verified+' serii verificate · '+state.failures.length+' excluse';
    var risk=window.GV?.status?.(),blocked=risk&&!['TRADE','CAUTION'].includes(risk.verdict),confirmed=state[state.mode].filter(function(x){return x.actionable;}).length;
    $('scanDetailsBody').innerHTML='<p>'+state.verified+' / '+state.scanned+' serii verificate. '+(state.scanning?'Scanarea continuă.':state.hasScan?'Clasamentele includ numai criteriile strategiei; numărul de analize nu este numărul de confirmări.':'Scanarea nu a fost încă finalizată.')+'</p>'
      +'<p>Governor: '+escapeHtml(risk?.verdict||'neverificat')+(blocked?' · candidații tehnici rămân vizibili pentru analiză; planurile noi sunt blocate. '+escapeHtml((risk.reasons||[]).join(' · ')):'. '+confirmed+' '+(confirmed===1?'candidat cu confirmare':'candidați cu confirmare')+' în clasamentul curent.')+'</p>'
      +(state.trendMeta?'<p>Trend 12 luni: clasament EOD '+escapeHtml(state.trendMeta.dataUltimei)+(state.trendMeta.vechime>7?' (VECHI, '+state.trendMeta.vechime+' zile)':'')+' · '+(state.trendMeta.univers?escapeHtml(String(state.trendMeta.univers.n))+' acțiuni clasate':'')+' · regim '+(state.trendMeta.regim&&state.trendMeta.regim.peste?'pornit':'oprit')+' · '+escapeHtml(state.trendMeta.eticheta)+'</p>':state.trendEroare?'<p>Trend 12 luni: clasamentul robotului nu s-a putut citi ('+escapeHtml(state.trendEroare)+').</p>':'')
      +'<p>Sectoare: '+(state.sectorPending?'completare în fundal; rezultatele sunt deja disponibile.':'sunt folosite clasificările disponibile; cele lipsă rămân „Necunoscut”.')+'</p>'
      +'<div class="ce-coverage-grid"><div><b>Indici de comparație</b><ul>'+state.benchmarks.map(function(x){return '<li>'+escapeHtml(x.region+' · '+x.symbol+' · '+(x.asOf||x.reason))+'</li>';}).join('')+'</ul></div><div><b>Surse excluse</b><ul>'+state.failures.map(function(x){return '<li>'+escapeHtml(x.symbol+' · '+x.reason)+'</li>';}).join('')+'</ul>'+(state.failures.length?'':'<p>Nicio eroare de serie raportată.</p>')+'</div></div>';
  }

  async function scan() {
    if (demoMode) return;
    if (state.scanning || !state.shellVisible) return;
    if (!validateDeps()) { showAlert('Lipsesc biblioteci critice din lib/. Scanarea a fost oprită.', true); return; }
    var token=++state.generation;
    loadTrend();
    setScanning(true); showAlert(''); progress(0, 1); state.failures = [];state.verified=0;state.sectorPending=false;
    try {
      var list = universe(); state.scanKey=JSON.stringify([$('universe').value,list]);state.scanned=list.length;$('ctxUniverse').textContent = list.length + ' simboluri';
      var initial=await Promise.all([earningsGate(),benchmarkReturns()]),bench=initial[1];
      var govScan = window.GV && GV.status ? GV.status() : null;   // o singură citire a jurnalului pe scanare
      var all = [], q = list.slice(), done = 0, concurrency = 5;
      async function worker() {
        while (q.length) {
          var sym = q.shift();
          try { all.push(await analyze(sym, bench[regionOf(sym)], govScan));state.verified++; }
          catch (e) { state.failures.push({ symbol: sym, reason: e && e.message || 'eroare' }); }
          done++; progress(done, list.length);
        }
      }
      await Promise.all(Array.from({ length: concurrency }, function () { return worker(); }));
      var combined = [];
      all.forEach(function (x) { combined.push(x.momentum, x.reversal); });
      state.analyses=combined;state.hasScan=true;state.updatedAt = Date.now();rankResults();
      var saved=saveScan();window.TTEntryAuto?.observe(saved.cache);
      $('ctxSectors').textContent = topSectors(state[state.mode]);
      var gs = window.GV && GV.status ? GV.status() : null;
      $('ctxGovernor').textContent = gs ? gs.verdict : 'indisponibil';
      $('ctxFreshness').textContent = state.verified?'EOD verificat · scan ' + ageText(state.updatedAt):'Nicio serie verificată';
      $('updatedAt').textContent = 'actualizat acum';
      if (state.failures.length) showAlert(state.failures.length + ' simboluri nu au răspuns; au fost excluse, nu înlocuite cu date vechi.');
      if(!list.length)showAlert('Watchlist-ul selectat este gol. Alege Core lichid, SUA sau Europa pentru scanare.');
      if(gs&&!['TRADE','CAUTION'].includes(gs.verdict))showAlert('Governor '+gs.verdict+': '+((gs.reasons||[])[0]||'verifică limitele contului')+'. Candidații tehnici rămân vizibili; planurile noi sunt blocate.');
      if (!saved.saved) showAlert('Copia locală a scanării nu a putut fi salvată. Candidații sunt disponibili în această sesiune; Construiește planul transmite direct analiza selectată.');
      state.sectorPending=!!window.EL?.enrichSectorsYahoo&&combined.some(function(x){return x.eligible&&x.sector==='Necunoscut';});
      render();coverage();
      if(state.sectorPending)updateSectors(combined).then(function(){if(token!==state.generation)return;state.sectorPending=false;rankResults();saveScan();render();coverage();}).catch(function(){if(token===state.generation){state.sectorPending=false;coverage();}});
    } catch (e) {
      showAlert('Scanarea nu s-a finalizat: ' + ((e && e.message) || 'eroare neașteptată') + '. Rezultatele anterioare nu au fost suprascrise.', true);
    } finally {
      setScanning(false);
      if(!currentItems().length)render();
      coverage();
      schedule();
    }
  }

  function currentItems() {
    var q = $('search').value.trim().toUpperCase();
    var only = $('onlyActionable').checked;
    var source=q&&state.analyses.some(function(x){return x.symbol===q;})?state.analyses:state[state.mode];
    return source.filter(function (x) {
      if(x.mode!==state.mode)return false;
      if (only && !x.actionable) return false;
      return !q || x.symbol.indexOf(q) >= 0 || String(x.sector).toUpperCase().indexOf(q) >= 0;
    });
  }
  function tableHead() {
    $('tableHead').innerHTML = state.mode === 'momentum'
      ? '<span>#</span><span>SIMBOL / MOTIV</span><span>SECTOR</span><span>Δ ZI</span><span>RVOL</span><span>RS 20Z</span><span>RET. 20Z</span><span>SCOR</span><span>STARE</span>'
      : state.mode === 'trend'
      ? '<span>#</span><span>SIMBOL / MOTIV</span><span>SECTOR</span><span>MOM 12-1</span><span>MOM 6-1</span><span>RANG</span><span>PREȚ</span><span>SCOR</span><span>STARE</span>'
      : '<span>#</span><span>SIMBOL / MOTIV</span><span>SECTOR</span><span>DE LA MAX.</span><span>DIN MINIM</span><span>BAZĂ</span><span>RVOL</span><span>SCOR</span><span>STARE</span>';
  }
  function rowHtml(x, i) {
    if (x.mode === 'trend') return rowHtmlTrend(x, i);
    var a = state.mode === 'momentum' ? signed(x.dayChg, 1) : signed(x.metricA, 1);
    var b = state.mode === 'momentum' ? fmt(x.rvol, 2) + '×' : signed(x.metricB, 1);
    var c = state.mode === 'momentum' ? signed(x.rs, 1) : (x.baseDays || '—') + 'z';
    var d = state.mode === 'momentum' ? signed(x.metricA, 1) : fmt(x.rvol, 2) + '×';
    var clsA = state.mode === 'momentum' ? (x.dayChg >= 0 ? 'ce-up' : 'ce-down') : 'ce-down';
    var clsB = state.mode === 'momentum' ? '' : 'ce-up';
    return '<button class="ce-row' + (state.selected && state.selected.symbol === x.symbol && state.selected.mode === x.mode ? ' selected' : '') + '" data-mode="' + escapeHtml(x.mode) + '" data-symbol="' + escapeHtml(x.symbol) + '">'
      + '<span class="ce-rank">' + String(i + 1).padStart(2, '0') + '</span>'
      + '<div class="ce-symbol"><b>' + escapeHtml(x.symbol) + ' <em>' + escapeHtml(x.region) + '</em></b><small>' + fapteHtml(x) + '</small>' + (window.T212C ? T212C.badge(x.symbol) : '') + '</div>'
      + '<span class="ce-cell" data-label="Sector">' + escapeHtml(x.sector) + '</span><b class="ce-cell ' + clsA + '" data-label="'+(state.mode==='momentum'?'Δ zi':'De la maxim')+'">' + a + '</b>'
      + '<span class="ce-cell ' + clsB + '" data-label="'+(state.mode==='momentum'?'RVOL':'Din minim')+'">' + b + '</span><span class="ce-cell" data-label="'+(state.mode==='momentum'?'RS 20z':'Bază')+'">' + c + '</span><span class="ce-cell" data-label="'+(state.mode==='momentum'?'Ret. 20z':'RVOL')+'">' + d + '</span>'
      + '<strong class="ce-score">' + x.score + '</strong><i class="ce-state ' + stateClass(x) + '">' + x.state + '</i></button>';
  }
  function stateClass(x) { return x.mode === 'trend' ? (x.state === 'VECHI' ? 'vechi' : x.state === 'RAPORTEAZĂ' ? 'raporteaza' : x.state === 'FĂRĂ REGIM' ? 'regim' : 'proba') : String(x.state || '').toLowerCase(); }
  // Modul „Trend 12 luni” (14.10.2026): clasamentul vine de la robotul zilnic (tools/trend-12-1.mjs ⇒ generated/trend-12-1.json).
  // Semnal de SELECȚIE probat față de alte acțiuni în aceeași zi; neprobat pe listă istorică ⇒ fără plan, în probă.
  var TREND_ETICHETA = 'selecție probată față de acțiunile din aceeași zi; neprobată pe listă istorică; în probă — nu e un buton de cumpărat';
  async function loadTrend() {
    state.trendEroare = '';
    try {
      var r = await fetch('generated/trend-12-1.json?x=' + Date.now(), { cache: 'no-store' });
      if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status));
      var j = await r.json();
      if (!j || !Array.isArray(j.clasament) || !/^\d{4}-\d{2}-\d{2}$/.test(String(j.dataUltimei || ''))) throw new Error('fișier fără clasament');
      var asteptat = DailySeries.expected(Date.now(), 'America/New_York', 960);
      var vechime = Math.round((Date.parse(asteptat + 'T00:00:00Z') - Date.parse(j.dataUltimei + 'T00:00:00Z')) / 86400000);
      var regimPornit = !!(j.regim && j.regim.peste), vechi = vechime > 7;
      var stare = vechi ? 'VECHI' : regimPornit ? 'ÎN PROBĂ' : 'FĂRĂ REGIM';
      var gov = window.GV && GV.status ? GV.status() : { verdict: 'NEVERIFICAT', reasons: ['Governor indisponibil'] };
      var eticheta = String(j.eticheta || TREND_ETICHETA);
      state.trendMeta = { la: j.la, dataUltimei: j.dataUltimei, vechime: vechime, regim: j.regim || null, univers: j.univers || null, metoda: j.metoda || '', eticheta: eticheta };
      state.trend = j.clasament.slice(0, 20).map(function (c) {
        return {
          symbol: String(c.s || '').toUpperCase(), name: c.nume || c.s, mode: 'trend', kind: 'trend', region: 'US', currency: 'USD', sector: c.sector || 'Necunoscut',
          score: Math.round(clamp(100 - (safeNum(c.rang) || 0) * 100, 0, 100)), state: stare, price: safeNum(c.pret), dayChg: null, rvol: null, rs: null,
          metricA: (safeNum(c.m12) || 0) * 100, metricB: (safeNum(c.m6) || 0) * 100, rang: safeNum(c.rang), cap: safeNum(c.cap), dolari20: safeNum(c.dolari20),
          eligible: true, actionable: false,
          reason: 'EOD ' + j.dataUltimei + ' · ' + eticheta + ' · regim ' + (regimPornit ? 'pornit (SPY peste media pe 200 de zile)' : 'oprit (SPY sub media pe 200 de zile)') + (vechi ? ' · clasament VECHI de ' + vechime + ' zile' : ''),
          entryLow: safeNum(c.pret), entryHigh: safeNum(c.pret), stop: null, target: null, spark: Array.isArray(c.spark) ? c.spark : [],
          governor: gov, earnings: 'neverificat în modul trend', ts: Date.parse(j.la) || Date.now(), sourceDate: j.dataUltimei
        };
      });
      imbogatesteTrend(j, vechi);
      await earningsPesteTrend(vechi);
      await incarcaBilant();
    } catch (e) {
      state.trend = []; state.trendMeta = null; state.trendEroare = (e && e.message) || 'eroare';
    }
    $('countTrend').textContent = state.trend.length;
    if (state.mode === 'trend') { render(); peadPesteTrend(); } else coverage();
  }
  // Audit 14.10.2026: 10 din cele 40 din clasament raportau în 14 zile și pagina nu spunea nimic. Cu cheia Finnhub, cine raportează
  // primește starea RAPORTEAZĂ și ziua; fără cheie, rândul spune „neverificat” — nu tace.
  async function earningsPesteTrend(vechi) {
    var cal = null;
    try { cal = window.EARN && EARN.calendar ? await EARN.calendar({ zile: 14, toate: true }) : null; } catch (_) { cal = null; }
    var harta = {};
    if (cal && cal.ok) (cal.items || []).forEach(function (e) { if (e && e.symbol && e.date && !harta[e.symbol]) harta[e.symbol] = e; });
    state.trend.forEach(function (x) {
      if (x.earningsDinRobot) return;   // I-621: robotul a spus deja (din secretul Actions)
      x.fapte = x.fapte || [];
      if (!cal || !cal.ok) { x.earnings = 'earnings neverificat (fără cheia Finnhub)'; x.fapte.push({ k: 'earnings', v: 'neverificat', rol: 'attention' }); return; }
      var e = harta[x.symbol];
      if (!e) { x.earnings = 'fără raportare în 14z'; x.fapte.push({ k: 'earnings', v: 'fără raportare în 14z', rol: 'info' }); return; }
      var z = Math.max(0, zileNY(e.date));
      x.earnings = 'raportează în ' + z + 'z' + (e.hour === 'amc' ? ' (după închidere)' : e.hour === 'bmo' ? ' (înainte de deschidere)' : '');
      if (!vechi) x.state = 'RAPORTEAZĂ';
      x.reason += ' · ' + x.earnings;
      x.fapte.push({ k: 'raportează', v: 'în ' + z + 'z', rol: 'block' });
    });
  }
  // „fă tot” 14.10.2026 — I-618: faptele unui candidat ca cipuri (rol: support / attention / block / info); șirul `reason` rămâne
  // pentru Desk și pentru detaliu. I-621/I-615/I-616/I-614: ce vine de la robot (raportări, ieșiri, sectoare) și bilanțul probei.
  // In rand incap cel mult 4 cipuri (randul e pe o singura linie): intai ce blocheaza, apoi ce cere atentie, apoi sprijinul; restul in detaliu.
  var CIP_PRIO = { block: 0, attention: 1, support: 2, info: 3 };
  function fapteHtml(x, max) {
    if (!Array.isArray(x.fapte) || !x.fapte.length) return escapeHtml(x.reason);
    max = max || 4;
    var ord = x.fapte.map(function (p, i) { return { p: p, i: i }; }).sort(function (a, b) { return (CIP_PRIO[a.p.rol] ?? 3) - (CIP_PRIO[b.p.rol] ?? 3) || a.i - b.i; }).map(function (o) { return o.p; });
    var html = ord.slice(0, max).map(function (p) { return '<span class="ce-chip ' + escapeHtml(p.rol || 'info') + '"' + (p.nota ? ' title="' + escapeHtml(p.nota) + '"' : '') + '>' + escapeHtml(p.k) + ' ' + escapeHtml(p.v) + '</span>'; }).join('');
    return html + (ord.length > max ? '<span class="ce-chip info" title="' + escapeHtml(ord.slice(max).map(function (p) { return p.k + ' ' + p.v; }).join(' · ')) + '">+' + (ord.length - max) + '</span>' : '');
  }
  function faptePentruTrend(x, m) {
    var peste = !!(m && m.regim && m.regim.peste);
    return [{ k: 'EOD', v: m ? m.dataUltimei : '', rol: 'info' }, { k: '12-1', v: procente(x.metricA), rol: 'support' }, { k: '6-1', v: procente(x.metricB), rol: x.metricB >= 0 ? 'support' : 'attention' },
      { k: 'rang', v: x.rang == null ? '—' : 'top ' + fmt(x.rang * 100, 1) + ' %', rol: 'support' }, { k: 'regim', v: peste ? 'pornit' : 'oprit', rol: peste ? 'support' : 'attention' }];
  }
  function imbogatesteTrend(j, vechi) {
    var m = state.trendMeta, sect = j.sectoare && typeof j.sectoare === 'object' ? j.sectoare : null, conc = null;
    if (sect) Object.keys(sect).forEach(function (s) { var n = Number(sect[s]) || 0; if (!conc || n > conc.n) conc = { sector: s, n: n, din: 20 }; });
    m.concentrare = conc && conc.n / 20 >= 0.4 ? conc : null;
    m.raportari = j.raportari && typeof j.raportari === 'object' ? j.raportari : null;
    m.ziuaDinainte = j.ziuaDinainte || null;
    state.trendIesiri = (Array.isArray(j.iesiri) ? j.iesiri : []).slice(0, 20).map(function (e) { return { symbol: String(e.s || '').toUpperCase(), name: e.nume || e.s, sector: e.sector || 'Necunoscut', motiv: e.motiv || '', rangAzi: safeNum(e.rangAzi), m12: safeNum(e.m12) }; });
    state.trend.forEach(function (x, i) {
      var c = j.clasament[i] || {};
      x.fapte = faptePentruTrend(x, m);
      if (c.raporteaza && c.raporteaza.d) {
        var z = Math.max(0, safeNum(c.raporteaza.zile) || 0), ora = c.raporteaza.ora;
        x.earnings = 'raportează în ' + z + 'z' + (ora === 'amc' ? ' (după închidere)' : ora === 'bmo' ? ' (înainte de deschidere)' : '');
        x.earningsDinRobot = true; if (!vechi) x.state = 'RAPORTEAZĂ'; x.reason += ' · ' + x.earnings;
        x.fapte.push({ k: 'raportează', v: 'în ' + z + 'z', rol: 'block' });
      } else if (m.raportari && m.raportari.sursa === 'finnhub') {
        x.earnings = 'fără raportare în 14z'; x.earningsDinRobot = true; x.fapte.push({ k: 'earnings', v: 'fără raportare în 14z', rol: 'info' });
      }
      if (m.concentrare && x.sector === m.concentrare.sector) x.fapte.push({ k: 'sector', v: m.concentrare.n + '/20 ' + m.concentrare.sector, rol: 'attention' });
    });
  }
  async function incarcaBilant() {
    if (!state.trendMeta) return;
    state.trendMeta.bilant = null;
    try {
      var r = await fetch('generated/trend-12-1-bilant.json?x=' + Date.now(), { cache: 'no-store' });
      if (!r || !r.ok) return;
      var b = await r.json();
      if (!b || typeof b !== 'object') return;
      state.trendMeta.bilant = { zile: safeNum(b.zile) || 0, n20: safeNum(b.n20) || 0, n60: safeNum(b.n60) || 0, exces20: safeNum(b.exces20), exces60: safeNum(b.exces60), nulB20: safeNum(b.nulB20), diferenta20: b.diferenta20 || null, verdict: String(b.verdict || 'în probă') };
    } catch (_) { state.trendMeta.bilant = null; }
  }
  function notaTrend() {
    var el = $('trendNota'); if (!el) return;
    el.hidden = state.mode !== 'trend'; if (el.hidden) return;
    var m = state.trendMeta;
    if (!m) { el.innerHTML = state.trendEroare ? 'Clasamentul robotului nu s-a putut citi (' + escapeHtml(state.trendEroare) + ').' : 'Clasamentul se încarcă…'; return; }
    var parti = ['EOD ' + escapeHtml(m.dataUltimei) + (m.vechime > 7 ? ' (VECHI, ' + m.vechime + ' zile)' : ''), 'regim ' + (m.regim && m.regim.peste ? 'pornit' : 'oprit')];
    if (m.concentrare) parti.push('<b>' + m.concentrare.n + ' din ' + m.concentrare.din + ' ' + escapeHtml(m.concentrare.sector) + '</b> — un singur pariu');
    if (m.raportari && m.raportari.sursa !== 'finnhub') parti.push('raportările: ' + escapeHtml(m.raportari.sursa === 'lipsă' ? 'robotul fără cheie' : 'eroare la robot'));
    var b = m.bilant;
    if (b) parti.push('proba: ' + b.n20 + ' zile cu rezultat' + (b.exces20 != null ? ', ' + procente(b.exces20) + ' vs SPY' : '') + (b.diferenta20 && safeNum(b.diferenta20.medie) != null ? ', ' + procente(b.diferenta20.medie) + ' vs alte acțiuni' : '') + ' · ' + escapeHtml(b.verdict));
    else parti.push('proba: fără bilanț încă');
    if (state.trendIesiri.length) parti.push('au ieșit ' + state.trendIesiri.length + (m.ziuaDinainte ? ' față de ' + escapeHtml(m.ziuaDinainte) : ''));
    el.innerHTML = parti.join(' · ');
  }
  function rowHtmlIesit(x) {
    return '<div class="ce-row ce-row-iesit"><span class="ce-rank">—</span><div class="ce-symbol"><b>' + escapeHtml(x.symbol) + ' <em>US</em></b><small>' + escapeHtml(x.name) + ' · ' + escapeHtml(x.motiv) + '</small></div>'
      + '<span class="ce-cell" data-label="Sector">' + escapeHtml(x.sector) + '</span><b class="ce-cell ce-down" data-label="Mom 12-1">' + (x.m12 == null ? '—' : procente(x.m12 * 100)) + '</b><span class="ce-cell"></span>'
      + '<span class="ce-cell" data-label="Rang">' + (x.rangAzi == null ? 'afară' : 'top ' + fmt(x.rangAzi * 100, 1) + ' %') + '</span><span class="ce-cell"></span><strong class="ce-score">—</strong><i class="ce-state vechi">IEȘIT</i></div>';
  }
  // I-620, IPOTEZĂ (drift după raportare): candidații Trend care au raportat în ultimele 7 zile cu reacție pozitivă primesc un fapt
  // informativ. Doar cu cheia Finnhub, doar primele 20, o dată pe zi de date, două cereri deodată. Nu schimbă nicio stare.
  async function peadPesteTrend() {
    var m = state.trendMeta;
    if (!m || !state.trend.length || !window.EARN || !EARN.istoric) return;
    var cheie = ''; try { cheie = EARN.cheie ? EARN.cheie() : ''; } catch (_) { cheie = ''; }
    if (!cheie || state.peadPentru === m.dataUltimei) return;
    state.peadPentru = m.dataUltimei;
    var coada = state.trend.slice(0, 20);
    async function lucrator() {
      while (coada.length) {
        var x = coada.shift();
        try {
          var r = await EARN.istoric(x.symbol, { ani: 1 }), e = r && r.ok && r.items && r.items[0];
          if (!e || !e.date) continue;
          var z = zileNY(e.date);
          if (z < -7 || z > 0 || !(safeNum(e.reactie) > 0)) continue;
          x.pead = { date: e.date, reactie: e.reactie, surpriza: safeNum(e.surpriza) };
          x.fapte = (x.fapte || []).concat([{ k: 'după raportare', v: procente(e.reactie) + (x.pead.surpriza != null ? ' (surpriză ' + procente(x.pead.surpriza) + ')' : ''), rol: 'info', nota: 'ipoteză (drift după raportare), neprobată pe ambele nuluri' }]);
        } catch (_) {}
      }
    }
    await Promise.all([lucrator(), lucrator()]);
    if (state.mode === 'trend') render();
  }
  function rowHtmlTrend(x, i) {
    return '<button class="ce-row' + (state.selected && state.selected.symbol === x.symbol && state.selected.mode === x.mode ? ' selected' : '') + '" data-mode="trend" data-symbol="' + escapeHtml(x.symbol) + '">'
      + '<span class="ce-rank">' + String(i + 1).padStart(2, '0') + '</span>'
      + '<div class="ce-symbol"><b>' + escapeHtml(x.symbol) + ' <em>' + escapeHtml(x.region) + '</em></b><small>' + fapteHtml(x) + ' ' + escapeHtml(x.name) + '</small>' + (window.T212C ? T212C.badge(x.symbol) : '') + '</div>'
      + '<span class="ce-cell" data-label="Sector">' + escapeHtml(x.sector) + '</span><b class="ce-cell ' + (x.metricA >= 0 ? 'ce-up' : 'ce-down') + '" data-label="Mom 12-1">' + signed(x.metricA, 1) + '</b>'
      + '<span class="ce-cell ' + (x.metricB >= 0 ? 'ce-up' : 'ce-down') + '" data-label="Mom 6-1">' + signed(x.metricB, 1) + '</span><span class="ce-cell" data-label="Rang">' + (x.rang == null ? '—' : 'top ' + fmt(x.rang * 100, 1) + '%') + '</span><span class="ce-cell" data-label="Preț">' + fmt(x.price, 2) + '</span>'
      + '<strong class="ce-score">' + x.score + '</strong><i class="ce-state ' + stateClass(x) + '">' + escapeHtml(x.state) + '</i></button>';
  }
  function renderDetailTrend(x) {
    var m = state.trendMeta || {}, g = window.GV?.status?.() || x.governor || { verdict: 'NEVERIFICAT', reasons: ['Governor indisponibil'] };
    var motiv = (m.eticheta || TREND_ETICHETA) + ' Se ține 20–60 de zile, fără stop strâns (planul cu 1,25 ATR anulează efectul); ieșire când iese din top 20 % sau când regimul se oprește.';
    window.TTDecisionPanel?.set({ purpose: 'entry', simulation: false, candidate: null, risk: g, empty: { title: 'Trend 12 luni · ' + x.symbol + ' · în probă', reason: 'În probă: selecție probată față de acțiunile din aceeași zi, neprobată pe listă istorică. Fără plan; se ține 20–60 de zile, fără stop strâns.' } });
    $('dSymbol').textContent = x.symbol; $('dName').textContent = 'Trend 12 luni · ' + (x.name || '') + ' · ' + x.currency;
    $('dScore').textContent = x.score; $('dSector').textContent = x.sector; $('dState').textContent = x.state;
    $('dFresh').textContent = 'EOD ' + (m.dataUltimei || '—'); $('dReason').textContent = x.reason + ' · ' + motiv;
    $('dEntry').textContent = fmt(x.price, 2) + ' (închiderea)'; $('dStop').textContent = '—'; $('dTarget').textContent = '—';
    $('spark').innerHTML = sparkSvg(x.spark);
    $('dGovernor').textContent = 'Governor: ' + g.verdict; $('dGovernorWhy').textContent = (g.reasons && g.reasons[0]) || 'modul Trend nu construiește plan';
    $('governorBox').className = 'ce-governor ' + (g.verdict === 'HALTED' ? 'halted' : (g.verdict === 'CAUTION' ? 'caution' : ''));
    $('setupBtn').disabled = true; $('setupBtn').title = 'Modul Trend 12 luni nu construiește plan: semnal de selecție în probă, ținut 20–60 de zile, fără stopul de 1,25 ATR.';
  }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]; }); }

  function render() {
    tableHead();
    coverage();
    notaTrend();
    var items = currentItems();
    if (!items.length && state.mode === 'trend') {
      var qT=$('search').value.trim(),oT=$('onlyActionable').checked;
      $('rows').innerHTML = '<div class="ce-empty"><b>' + (state.trendEroare ? 'Clasamentul Trend 12 luni nu a venit' : qT || oT ? 'Niciun candidat pentru filtrele curente' : 'Clasamentul Trend 12 luni e gol') + '</b>'
        + (state.trendEroare ? 'Robotul zilnic nu a lăsat fișierul generated/trend-12-1.json sau nu s-a putut citi (' + escapeHtml(state.trendEroare) + ').' : oT ? 'Modul Trend nu are candidați „confirmați”: e un semnal de selecție în probă, fără plan. Resetează filtrele.' : qT ? 'Căutarea „' + escapeHtml(qT) + '” nu e în primele 20. Resetează filtrele.' : 'Nicio acțiune în primele 20 % cu momentum pozitiv.') + '</div>';
      state.selected = null; renderDetail(null); return;
    }
    if (!items.length) {
      var query=$('search').value.trim(),only=$('onlyActionable').checked;
      $('rows').innerHTML = '<div class="ce-empty"><b>'+(state.scanning?'Scanarea este în curs':!state.hasScan?'Scanarea se pregătește':!state.verified?'Nicio serie verificată':'Niciun candidat pentru filtrele curente')+'</b>'
        +(query?'Căutarea „'+escapeHtml(query)+'” nu are rezultate în selecția curentă. Resetează filtrele.':only?'Filtrul „doar confirmate” ascunde candidații de monitorizare și cei cu plan blocat. Resetează filtrele pentru a-i vedea.':!state.verified?'Vezi Acoperire pentru erorile surselor sau schimbă universul scanat.':'Seriile au fost verificate, dar nu trec criteriile acestei strategii. Verifică Acoperire sau schimbă între Top Long și Early Reversal.')+'</div>';
      state.selected = null; renderDetail(null); return;
    }
    state.selected=items.find(function(x){return x.symbol===state.selected?.symbol&&x.mode===state.selected?.mode;})||items[0];
    $('rows').innerHTML = items.map(rowHtml).join('') + (state.mode === 'trend' && state.trendIesiri.length ? state.trendIesiri.map(rowHtmlIesit).join('') : '');
    Array.prototype.forEach.call(document.querySelectorAll('.ce-row'), function (btn) {
      btn.onclick = function () {
        state.selected = state[btn.dataset.mode].concat(state.analyses).find(function (x) { return x.symbol === btn.dataset.symbol&&x.mode===btn.dataset.mode; }); render();
        if(window.matchMedia('(max-width:760px)').matches)$('detail').scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
      };
    });
    $('ctxSectors').textContent = topSectors(items); renderDetail(state.selected);
  }

  function sparkSvg(vals) {
    if (!vals || vals.length < 2) return '';
    var w = 320, h = 118, min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), r = max - min || 1;
    var pts = vals.map(function (v, i) { return (i / (vals.length - 1) * w).toFixed(1) + ',' + (h - 8 - (v - min) / r * (h - 16)).toFixed(1); }).join(' ');
    var area = '0,' + (h - 8) + ' ' + pts + ' ' + w + ',' + (h - 8);
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Evoluția ultimelor 45 sesiuni"><path class="grid" d="M0 30H320M0 59H320M0 88H320"/><polygon class="area" points="' + area + '"/><polyline class="line" points="' + pts + '"/></svg>';
  }
  function renderDetail(x) {
    if (x && x.mode === 'trend') { renderDetailTrend(x); return; }
    window.TTDecisionPanel?.set({purpose:'entry',simulation:x?.kind==='synthetic',candidate:x,risk:x?.kind==='synthetic'?x.governor:window.GV?.status?.()||x?.governor,empty:{title:state.scanning?'Analizez piața':requested?'Nicio analiză actuală · '+requested:state.updatedAt?'Niciun candidat pentru selecția curentă':'Scanarea nu este încă disponibilă',reason:state.scanning?'Așteaptă verificarea prețurilor, a trendului și a benchmarkului.':requested?'Simbolul solicitat nu a trecut verificarea datelor sau nu corespunde filtrelor.':state.verified?'Există '+state.verified+' instrumente verificate, dar niciunul nu corespunde strategiei și filtrelor curente.':'Seriile de prețuri nu sunt încă verificate. Verifică acoperirea și erorile scanării.',next:state.scanning?'Așteaptă terminarea scanării.':'Scanează din nou sau schimbă strategia și filtrele; verifică și sursele excluse.'}});
    if (!x) {
      ['dSymbol','dName','dScore','dSector','dState','dFresh','dReason','dEntry','dStop','dTarget','dGovernor','dGovernorWhy'].forEach(function (id) { $(id).textContent = '—'; });
      $('spark').innerHTML = ''; $('setupBtn').disabled = true; return;
    }
    $('dSymbol').textContent = x.symbol; $('dName').textContent = (x.mode === 'momentum' ? 'Long momentum' : 'Early reversal')+' · '+(x.currency||'monedă neverificată');
    $('dScore').textContent = x.score; $('dSector').textContent = x.sector; $('dState').textContent = x.state;
    $('dFresh').textContent = ageText(x.ts); $('dReason').textContent = x.reason + (window.T212C && T212C.held(x.symbol).length ? ' · DEȚII DEJA în snapshot Invest; verifică expunerea cumulată înainte de o nouă intrare.' : '');
    $('dEntry').textContent = fmt(x.entryLow, 2) + '–' + fmt(x.entryHigh, 2);
    $('dStop').textContent = fmt(x.stop, 2); $('dTarget').textContent = fmt(x.target, 2);
    $('spark').innerHTML = sparkSvg(x.spark);
    var g = x.kind==='synthetic'?x.governor:window.GV?.status?.()||x.governor||{ verdict: 'NEVERIFICAT', reasons: ['Governor indisponibil'] };
    $('dGovernor').textContent = 'Governor: ' + g.verdict;
    $('dGovernorWhy').textContent = (g.reasons && g.reasons[0]) || (x.earnings + ' · R:R țintă 2.0');
    $('governorBox').className = 'ce-governor ' + (g.verdict === 'HALTED' ? 'halted' : (g.verdict === 'CAUTION' ? 'caution' : ''));
    $('setupBtn').disabled = x.state === 'BLOCKED' || !x.actionable || !['TRADE','CAUTION'].includes(g.verdict);
    $('setupBtn').title = $('setupBtn').disabled ? 'Plan indisponibil: ' + x.reason : 'Deschide dimensionarea pentru ' + x.symbol;
  }

  function loadCache() {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!c || c.universeKey!==universeKey() || typeof c.updatedAt!=='number' || !Number.isFinite(c.updatedAt) || c.updatedAt<=0 || c.updatedAt>Date.now()+60000 || Date.now() - c.updatedAt > 30 * 60 * 1000 || !Array.isArray(c.momentum)||!Array.isArray(c.reversal)||!Array.isArray(c.analyses)||c.momentum.concat(c.reversal,c.analyses).some(function(x){return !DailySeries.usable(x);})) return;
      state.analyses = Array.isArray(c.analyses) ? c.analyses : [];
      state.momentum = Array.isArray(c.momentum) ? c.momentum : []; state.reversal = Array.isArray(c.reversal) ? c.reversal : []; state.updatedAt = Number(c.updatedAt) || 0;
      state.hasScan=true;state.scanKey=c.universeKey;state.verified=Number(c.verifiedCount)||0;state.scanned=Number(c.scannedCount)||0;state.failures=Array.isArray(c.failures)?c.failures:[];state.benchmarks=Array.isArray(c.benchmarks)?c.benchmarks:[];
      $('countMomentum').textContent = state.momentum.length; $('countReversal').textContent = state.reversal.length;
      $('ctxUniverse').textContent = (Number(c.scannedCount) || '—') + ' simboluri';
      $('ctxScanned').textContent = (Number(c.scannedCount) || '—') + (c.failureCount ? ' · ' + c.failureCount + ' excluse' : '');
      $('ctxEligible').textContent = (state.momentum.length + state.reversal.length) + ' top';
      $('ctxSectors').textContent = topSectors(state[state.mode]);
      var gs = window.GV && GV.status ? GV.status() : null;
      $('ctxGovernor').textContent = gs ? gs.verdict : 'indisponibil';
      $('ctxFreshness').textContent = 'cache · ' + ageText(c.updatedAt);
      $('updatedAt').textContent = 'cache · ' + ageText(c.updatedAt); render();coverage();
    } catch (_) {}
  }
  function schedule() {
    clearTimeout(state.timer);
    state.timer = setTimeout(function () { if (!document.hidden && state.shellVisible) scan(); else schedule(); }, SCAN_MS);
    $('nextScan').textContent = 'următorul scan în 5 min';
  }
  function bind() {
    $('scanBtn').onclick = scan; $('universe').onchange = function () {state.generation++;state.analyses=[];state.momentum=[];state.reversal=[];state.selected=null;state.hasScan=false;state.updatedAt=0;state.verified=0;rankResults();render();scan();};
    $('search').oninput = render; $('onlyActionable').onchange = render;
    $('resetFilters').onclick=function(){$('search').value='';$('onlyActionable').checked=false;render();};
    $('setupBtn').onclick = function () {
      if(!demoMode&&!['TRADE','CAUTION'].includes(window.GV?.status?.().verdict)){showAlert('Planul este blocat de Governor. Verifică limitele și datele contului.',true);renderDetail(state.selected);return;}
      var result = window.CandidatePlanHandoff ? CandidatePlanHandoff.read(state.selected) : {ok:false,message:'Modulul planului nu s-a încărcat. Reîncarcă aplicația.'};
      if (!result.ok) { showAlert(result.message, true); return; }
      var candidate = result.candidate;
      var query = 'symbol=' + encodeURIComponent(candidate.symbol) + '&mode=' + encodeURIComponent(candidate.mode) + '&ticket=1&handoff=1' + (demoMode ? '&demo=1' : '');
      if (window.parent !== window) window.parent.postMessage({ ttOpenModule: 'desk/', ttQuery: query, ttPlanCandidate: candidate }, location.origin);
      else location.href = '../desk/?' + query + '#plan=' + encodeURIComponent(JSON.stringify(candidate));
    };
    Array.prototype.forEach.call(document.querySelectorAll('.ce-mode'), function (btn) {
      btn.onclick = function () {
        document.querySelectorAll('.ce-mode').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active'); state.mode = btn.dataset.mode; state.selected = null; render();
        if (state.mode === 'trend') peadPesteTrend();
      };
    });
    window.addEventListener('message', function (e) {
      if (e.origin !== location.origin || !e.data || typeof e.data.ttShellVisible !== 'boolean') return;
      state.shellVisible = e.data.ttShellVisible;
      if (state.shellVisible && !state.updatedAt) scan();
    });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && state.shellVisible && Date.now() - state.updatedAt > SCAN_MS) scan(); });
  }

  validateDeps(); bind();
  if (demoMode) {
    var demoNow=Date.now(),demoCandidate={symbol:'FICTIV-C',mode:'momentum',region:'US',currency:'USD',actionable:true,state:'ARMED',ts:demoNow,sourceDate:DailySeries.expected(demoNow,'America/New_York',960),sourceTimezone:'America/New_York',sourceCloseMinutes:960,entryLow:100,entryHigh:102,stop:95,target:116,price:101,score:80,dayChg:2,rvol:1.4,rs:3,metricA:8,metricB:2,sector:'Sector fictiv',reason:'DEMO FICTIV · candidat transmis direct, fără salvarea scanării.',earnings:'Exemplu inventat',spark:[96,98,97,100,101],governor:{verdict:'TRADE',reasons:['DEMO FICTIV · fără ordine sau acces la cont.']}};
    demoCandidate.kind='synthetic';demoCandidate.atr=2;demoCandidate.trend=TTDecisionVerdict.trend(Array.from({length:240},(_,i)=>({t:i+1,o:89.05+i*.05,h:89.35+i*.05,l:88.85+i*.05,c:89.05+i*.05,v:1000000})));
    state.momentum=[demoCandidate];state.updatedAt=demoNow;state.selected=demoCandidate;render();
    $('scanBtn').disabled=true;$('universe').disabled=true;$('nextScan').textContent='DEMO · fără scanări de piață';
    showAlert('DEMO FICTIV · scanarea nu este salvată. Apasă Construiește planul pentru a verifica transferul direct. Date inventate; planurile demo rămân în memorie.');
    return;
  }
  loadCache();
  loadTrend();
  if(requested){$('search').value=requested;document.querySelectorAll('.ce-mode').forEach(function(b){b.classList.toggle('active',b.dataset.mode===state.mode);});showAlert('Validare intraday pentru '+requested+' · rulăm universul curent și tickerul solicitat. Ideea EOD nu este o intrare confirmată.');}
  schedule();
  setTimeout(scan, 400);
})();
