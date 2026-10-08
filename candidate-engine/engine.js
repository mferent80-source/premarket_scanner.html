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
    failures: [], earningsOk: false, earningsMap: {}, timer: null
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
      var r = await EARN.calendar({ zile: 14 });
      if (!r || !r.ok) return;
      state.earningsOk = true;
      (r.items || []).forEach(function (e) { if (e && e.symbol && !state.earningsMap[e.symbol]) state.earningsMap[e.symbol] = e; });
    } catch (_) {}
  }
  function earningsInfo(sym) {
    var e = state.earningsMap[sym];
    if (!state.earningsOk) return { penalty: 5, blocked: false, text: 'earnings neverificat' };
    if (regionOf(sym) === 'EU') return { penalty: 5, blocked: false, text: 'earnings EU neverificat' };
    if (!e || !e.date) return { penalty: 0, blocked: false, text: 'fără earnings în 14z' };
    var days = Math.ceil((new Date(e.date + 'T12:00:00').getTime() - Date.now()) / 86400000);
    if (days <= 1) return { penalty: 30, blocked: true, text: 'earnings în ' + Math.max(0, days) + 'z' };
    if (days <= 3) return { penalty: 12, blocked: false, text: 'earnings în ' + days + 'z' };
    return { penalty: 4, blocked: false, text: 'earnings în ' + days + 'z' };
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

  async function analyze(sym, benchmark) {
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
    var gov = window.GV && GV.status ? GV.status() : { verdict: 'NEVERIFICAT', reasons: ['Governor indisponibil'] };
    var blocked = earn.blocked || !['TRADE','CAUTION'].includes(gov.verdict);
    var sector = window.EL && EL.sectorOf ? EL.sectorOf(sym) : 'Necunoscut';
    var trend=window.TTDecisionVerdict?.trend(bars);
    var mid = price, entryLow = price * .997, entryHigh = price * 1.003;
    var stop = price - f.atr * 1.25, target = entryHigh + Math.max(.01, entryHigh - stop) * 2;
    var momentumState = blocked ? 'BLOCKED' : (mScore >= 80 && rvol >= 1.15 ? 'FIRE' : (mScore >= 68 ? 'ARMED' : 'EARLY'));
    var reversalState = blocked ? 'BLOCKED' : (eb && eb.isConfirmed && rScore >= 82 ? 'FIRE' : (eb && eb.isConfirmed ? 'ARMED' : 'EARLY'));
    var trendAligned=trend?trend.short==='up'&&trend.medium==='up':price>ema21&&ema21>ema50;
    var momentum = {
      symbol: sym, sourceDate:source.asOf,sourceTimezone:source.timezone,sourceCloseMinutes:source.closeMinutes,currency:source.currency,name: sym, trend:trend, atr:atr, region: f.region, sector: sector, mode: 'momentum', score: mScore,
      state: momentumState, price: price, dayChg: f.dayChg, rvol: f.rvol, rs: f.rs20,
      metricA: f.ret20, metricB: f.ext21,
      eligible: !blocked && price >= 5 && f.avgDollarVol >= 3000000 && f.ext21 <= 8 && f.dayChg < 10 && mScore >= 55,
      actionable: !!source.currency && benchmarkRet20!==null && !blocked && price >= 5 && f.avgDollarVol >= 3000000 && f.ext21 <= 8 && f.dayChg < 10 && mScore >= 68 && trendAligned && f.rs20>=0 && f.rvol>=1,
      reason: 'EOD '+source.asOf+' · Trend ' + (price > ema21 && ema21 > ema50 ? 'aliniat' : 'în formare') + ' · RS vs benchmark ' + signed(f.rs20, 1) + ' · RVOL ' + fmt(f.rvol, 2) + '× · ' + earn.text+' · țintă 2R calculată la limita intrării, nu rezistență confirmată',
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
      symbol: sym, sourceDate:source.asOf,sourceTimezone:source.timezone,sourceCloseMinutes:source.closeMinutes,currency:source.currency,name: sym, trend:trend, atr:atr, region: f.region, sector: sector, mode: 'reversal', score: rScore,
      state: reversalState, price: price, dayChg: f.dayChg, rvol: f.rvol, rs: f.rs20,
      metricA: f.drawdown, metricB: f.bounce60, baseDays: f.baseDays,
      eligible: !blocked && price >= 5 && f.avgDollarVol >= 3000000 && reversalWatch && rScore >= 32,
      actionable: reversalActionable,
      reason: 'EOD '+source.asOf+' · '+(reversalActionable ? 'Confirmare tehnică zilnică · ' : 'Monitorizare · ') + (eb && MEB.ebSignalText ? MEB.ebSignalText(eb) : 'structură reversal') + ' · scădere ' + signed(f.drawdown, 1) + ' · revenire ' + signed(f.bounce60, 1) + ' · ' + earn.text,
      entryLow: entryLow, entryHigh: entryHigh, stop: stop, target: target, spark: f.spark,
      governor: gov, earnings: earn.text, ts: Date.now()
    };
    if(window.TTDecisionVerdict){for(const item of [momentum,reversal]){const verdict=TTDecisionVerdict.build({purpose:'entry',candidate:item,risk:gov});if(!verdict.canPlan){item.actionable=false;item.state=verdict.code==='BLOCKED'?'BLOCKED':'WATCH';item.reason+=' · '+(verdict.blockers[0]?.text||verdict.cautions[0]?.text||verdict.title);}}}
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
    for(var pair of [['US','SPY'],['EU','^STOXX50E']]){try{var source=DailySeries.read(await D.fetchStock(pair[1],{range:'6mo',interval:'1d',ttl:1800}),pair[1]),ret=retAt(closes(source.bars),20);if(ret!==null)out[pair[0]]={asOf:source.asOf,ret20:ret};}catch(_){}}
    return out;
  }
  async function updateSectors(items) {
    if (!window.EL || !EL.enrichSectorsYahoo) return;
    try {
      var syms = unique(items.map(function (x) { return x.symbol; }));
      var map = EL.loadSectorMap();
      for (var i = 0; i < syms.length; i += 12) map = await EL.enrichSectorsYahoo(syms.slice(i, i + 12), map);
      items.forEach(function (x) { x.sector = EL.sectorOf(x.symbol, map); });
    } catch (_) {}
  }

  function setScanning(on) {
    state.scanning = on; $('scanBtn').disabled = on;
    $('scanState').textContent = on ? 'SCANEZ PIAȚA' : 'SCAN ACTIV';
    $('liveState').classList.toggle('off', false);
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

  async function scan() {
    if (demoMode) return;
    if (state.scanning || !state.shellVisible) return;
    if (!validateDeps()) { showAlert('Lipsesc biblioteci critice din lib/. Scanarea a fost oprită.', true); return; }
    setScanning(true); showAlert(''); progress(0, 1); state.failures = [];
    try {
      var list = universe(); $('ctxUniverse').textContent = list.length + ' simboluri';
      await earningsGate();
      var bench = await benchmarkReturns();
      var all = [], q = list.slice(), done = 0, concurrency = 5;
      async function worker() {
        while (q.length) {
          var sym = q.shift();
          try { all.push(await analyze(sym, bench[regionOf(sym)])); }
          catch (e) { state.failures.push({ symbol: sym, reason: e && e.message || 'eroare' }); }
          done++; progress(done, list.length);
        }
      }
      await Promise.all(Array.from({ length: concurrency }, function () { return worker(); }));
      var combined = [];
      all.forEach(function (x) { combined.push(x.momentum, x.reversal); });
      await updateSectors(combined);
      state.analyses=requested?combined.filter(function(x){return x.symbol===requested;}):[];
      state.momentum = capSectors(combined.filter(function (x) { return x.mode === 'momentum' && x.eligible; }));
      state.reversal = capSectors(combined.filter(function (x) { return x.mode === 'reversal' && x.eligible; }));
      state.updatedAt = Date.now();
      var cache = { analyses:state.analyses, momentum: state.momentum, reversal: state.reversal, updatedAt: state.updatedAt, scannedCount: list.length, failureCount: state.failures.length };
      var cacheSaved = true;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (_) { cacheSaved = false; }
      $('countMomentum').textContent = state.momentum.length; $('countReversal').textContent = state.reversal.length;
      $('ctxEligible').textContent = (state.momentum.length + state.reversal.length) + ' top';
      $('ctxSectors').textContent = topSectors(state[state.mode]);
      var gs = window.GV && GV.status ? GV.status() : null;
      $('ctxGovernor').textContent = gs ? gs.verdict : 'indisponibil';
      $('ctxFreshness').textContent = 'EOD verificat · scan ' + ageText(state.updatedAt);
      $('updatedAt').textContent = 'actualizat acum';
      if (state.failures.length) showAlert(state.failures.length + ' simboluri nu au răspuns; au fost excluse, nu înlocuite cu date vechi.');
      if (!cacheSaved) showAlert('Copia locală a scanării nu a putut fi salvată. Candidații sunt disponibili în această sesiune; Construiește planul transmite direct analiza selectată.');
      render();
    } catch (e) {
      showAlert('Scanarea nu s-a finalizat: ' + ((e && e.message) || 'eroare neașteptată') + '. Rezultatele anterioare nu au fost suprascrise.', true);
    } finally {
      setScanning(false);
      schedule();
    }
  }

  function currentItems() {
    var q = $('search').value.trim().toUpperCase();
    var only = $('onlyActionable').checked;
    var source=requested&&q===requested?state.analyses:state[state.mode];
    return source.filter(function (x) {
      if(x.mode!==state.mode)return false;
      if (only && !x.actionable) return false;
      return !q || x.symbol.indexOf(q) >= 0 || String(x.sector).toUpperCase().indexOf(q) >= 0;
    });
  }
  function tableHead() {
    $('tableHead').innerHTML = state.mode === 'momentum'
      ? '<span>#</span><span>SIMBOL / MOTIV</span><span>SECTOR</span><span>Δ ZI</span><span>RVOL</span><span>RS 20Z</span><span>RET. 20Z</span><span>SCOR</span><span>STARE</span>'
      : '<span>#</span><span>SIMBOL / MOTIV</span><span>SECTOR</span><span>DE LA MAX.</span><span>DIN MINIM</span><span>BAZĂ</span><span>RVOL</span><span>SCOR</span><span>STARE</span>';
  }
  function rowHtml(x, i) {
    var a = state.mode === 'momentum' ? signed(x.dayChg, 1) : signed(x.metricA, 1);
    var b = state.mode === 'momentum' ? fmt(x.rvol, 2) + '×' : signed(x.metricB, 1);
    var c = state.mode === 'momentum' ? signed(x.rs, 1) : (x.baseDays || '—') + 'z';
    var d = state.mode === 'momentum' ? signed(x.metricA, 1) : fmt(x.rvol, 2) + '×';
    var clsA = state.mode === 'momentum' ? (x.dayChg >= 0 ? 'ce-up' : 'ce-down') : 'ce-down';
    var clsB = state.mode === 'momentum' ? '' : 'ce-up';
    return '<button class="ce-row' + (state.selected && state.selected.symbol === x.symbol && state.selected.mode === x.mode ? ' selected' : '') + '" data-mode="' + escapeHtml(x.mode) + '" data-symbol="' + escapeHtml(x.symbol) + '">'
      + '<span class="ce-rank">' + String(i + 1).padStart(2, '0') + '</span>'
      + '<div class="ce-symbol"><b>' + escapeHtml(x.symbol) + ' <em>' + escapeHtml(x.region) + '</em></b><small>' + escapeHtml(x.reason) + '</small>' + (window.T212C ? T212C.badge(x.symbol) : '') + '</div>'
      + '<span class="ce-cell" data-label="Sector">' + escapeHtml(x.sector) + '</span><b class="ce-cell ' + clsA + '" data-label="'+(state.mode==='momentum'?'Δ zi':'De la maxim')+'">' + a + '</b>'
      + '<span class="ce-cell ' + clsB + '" data-label="'+(state.mode==='momentum'?'RVOL':'Din minim')+'">' + b + '</span><span class="ce-cell" data-label="'+(state.mode==='momentum'?'RS 20z':'Bază')+'">' + c + '</span><span class="ce-cell" data-label="'+(state.mode==='momentum'?'Ret. 20z':'RVOL')+'">' + d + '</span>'
      + '<strong class="ce-score">' + x.score + '</strong><i class="ce-state ' + x.state.toLowerCase() + '">' + x.state + '</i></button>';
  }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]; }); }

  function render() {
    tableHead();
    var items = currentItems();
    if (!items.length) {
      $('rows').innerHTML = '<div class="ce-empty"><b>Niciun candidat valid.</b>Scannerul nu umple artificial lista; relaxează filtrul sau așteaptă următoarea scanare.</div>';
      state.selected = null; renderDetail(null); return;
    }
    if (!state.selected || !items.some(function (x) { return x.symbol === state.selected.symbol && x.mode === state.selected.mode; })) state.selected = items[0];
    $('rows').innerHTML = items.map(rowHtml).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.ce-row'), function (btn) {
      btn.onclick = function () {
        state.selected = state[btn.dataset.mode].concat(state.analyses).find(function (x) { return x.symbol === btn.dataset.symbol; }); render();
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
    window.TTDecisionPanel?.set({purpose:'entry',simulation:x?.kind==='synthetic',candidate:x,risk:x?.kind==='synthetic'?x.governor:window.GV?.status?.()||x?.governor,empty:{title:state.scanning?'Analizez piața':requested?'Nicio analiză actuală · '+requested:state.updatedAt?'Niciun candidat pentru selecția curentă':'Scanarea nu este încă disponibilă',reason:state.scanning?'Așteaptă verificarea prețurilor, a trendului și a benchmarkului.':requested?'Simbolul solicitat nu a trecut verificarea datelor sau nu corespunde filtrelor.':state.analyses.length?'Există '+state.analyses.length+' analize, dar niciuna nu corespunde strategiei și filtrelor curente.':'Seriile de prețuri nu sunt încă verificate. Verifică acoperirea și erorile scanării.',next:state.scanning?'Așteaptă terminarea scanării.':'Scanează din nou sau schimbă strategia și filtrele; verifică și sursele excluse.'}});
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
    var g = x.governor || { verdict: 'NEVERIFICAT', reasons: ['Governor indisponibil'] };
    $('dGovernor').textContent = 'Governor: ' + g.verdict;
    $('dGovernorWhy').textContent = (g.reasons && g.reasons[0]) || (x.earnings + ' · R:R țintă 2.0');
    $('governorBox').className = 'ce-governor ' + (g.verdict === 'HALTED' ? 'halted' : (g.verdict === 'CAUTION' ? 'caution' : ''));
    $('setupBtn').disabled = x.state === 'BLOCKED' || !x.actionable;
    $('setupBtn').title = $('setupBtn').disabled ? 'Plan indisponibil: ' + x.reason : 'Deschide dimensionarea pentru ' + x.symbol;
  }

  function loadCache() {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!c || !c.updatedAt || c.updatedAt>Date.now()+60000 || Date.now() - c.updatedAt > 30 * 60 * 1000 || (c.momentum||[]).concat(c.reversal||[]).some(function(x){return !DailySeries.usable(x);})) return;
      state.analyses = Array.isArray(c.analyses) ? c.analyses : [];
      state.momentum = Array.isArray(c.momentum) ? c.momentum : []; state.reversal = Array.isArray(c.reversal) ? c.reversal : []; state.updatedAt = Number(c.updatedAt) || 0;
      $('countMomentum').textContent = state.momentum.length; $('countReversal').textContent = state.reversal.length;
      $('ctxUniverse').textContent = (Number(c.scannedCount) || '—') + ' simboluri';
      $('ctxScanned').textContent = (Number(c.scannedCount) || '—') + (c.failureCount ? ' · ' + c.failureCount + ' excluse' : '');
      $('ctxEligible').textContent = (state.momentum.length + state.reversal.length) + ' top';
      $('ctxSectors').textContent = topSectors(state[state.mode]);
      var gs = window.GV && GV.status ? GV.status() : null;
      $('ctxGovernor').textContent = gs ? gs.verdict : 'indisponibil';
      $('ctxFreshness').textContent = 'cache · ' + ageText(c.updatedAt);
      $('updatedAt').textContent = 'cache · ' + ageText(c.updatedAt); render();
    } catch (_) {}
  }
  function schedule() {
    clearTimeout(state.timer);
    state.timer = setTimeout(function () { if (!document.hidden && state.shellVisible) scan(); else schedule(); }, SCAN_MS);
    $('nextScan').textContent = 'următorul scan în 5 min';
  }
  function bind() {
    $('scanBtn').onclick = scan; $('universe').onchange = function () { scan(); };
    $('search').oninput = render; $('onlyActionable').onchange = render;
    $('setupBtn').onclick = function () {
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
  if(requested){$('search').value=requested;document.querySelectorAll('.ce-mode').forEach(function(b){b.classList.toggle('active',b.dataset.mode===state.mode);});showAlert('Validare intraday pentru '+requested+' · rulăm universul curent și tickerul solicitat. Ideea EOD nu este o intrare confirmată.');}
  schedule();
  setTimeout(scan, 400);
})();
