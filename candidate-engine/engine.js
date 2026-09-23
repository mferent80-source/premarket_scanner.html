(function () {
  'use strict';

  var SCAN_MS = 5 * 60 * 1000;
  var CACHE_KEY = 'ce_results_v2';
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
    mode: 'momentum', scanning: false, shellVisible: true,
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
    return deps.sData && deps.sTi && deps.sMeb;
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

  async function analyze(sym, benchmarkRet20) {
    var bars = await D.fetchStock(sym, { range: '1y', interval: '1d', ttl: 1800 });
    if (!bars || bars.length < 80) throw new Error('istoric insuficient');
    var c = closes(bars), h = highs(bars), l = lows(bars), v = volumes(bars);
    var price = c[c.length - 1], ema21 = lastValue(TI.calcEMA(c, 21)), ema50 = lastValue(TI.calcEMA(c, 50));
    var rsi = lastValue(TI.calcRSI(c, 14)), atr = lastValue(TI.calcATR(h, l, c, 14));
    if (ema21 == null || ema50 == null || rsi == null) throw new Error('indicatori incompleți');
    var avgVol20 = mean(v.slice(-21, -1)) || mean(v.slice(-20)) || 0;
    var rvol = avgVol20 > 0 ? v[v.length - 1] / avgVol20 : 0;
    var max252 = Math.max.apply(null, h.slice(-252));
    var min60 = Math.min.apply(null, l.slice(-60));
    var f = {
      symbol: sym, region: regionOf(sym), bars: bars, spark: sparkValues(c), price: price,
      ema21: ema21, ema50: ema50, rsi: rsi, atr: atr || price * .025, rvol: rvol,
      ret5: retAt(c, 5) || 0, ret20: retAt(c, 20) || 0, dayChg: retAt(c, 1) || 0,
      rs20: (retAt(c, 20) || 0) - (benchmarkRet20 || 0), ext21: ema21 ? pct(ema21, price) : 99,
      drawdown: max252 > 0 ? pct(max252, price) : 0, bounce60: min60 > 0 ? pct(min60, price) : 0,
      baseDays: daysSinceLow(l, 60), avgDollarVol: avgDollarVol(bars)
    };
    var earn = earningsInfo(sym);
    var hist = { closes: c, highs: h, lows: l, vols: v };
    var eb = MEB.computeEarlyBird(hist, 4, null);
    var mScore = momentumScore(f, earn);
    var rScore = reversalScore(f, eb, earn);
    var gov = window.GV && GV.status ? GV.status() : { verdict: 'TRADE', reasons: [] };
    var blocked = earn.blocked || gov.verdict === 'HALTED';
    var sector = window.EL && EL.sectorOf ? EL.sectorOf(sym) : 'Necunoscut';
    var mid = price, entryLow = price * .997, entryHigh = price * 1.003;
    var stop = price - f.atr * 1.25, target = mid + Math.max(.01, mid - stop) * 2;
    var momentumState = blocked ? 'BLOCKED' : (mScore >= 80 && rvol >= 1.15 ? 'FIRE' : (mScore >= 68 ? 'ARMED' : 'EARLY'));
    var reversalState = blocked ? 'BLOCKED' : (eb && eb.isConfirmed && rScore >= 82 ? 'FIRE' : (eb && eb.isConfirmed ? 'ARMED' : 'EARLY'));
    var momentum = {
      symbol: sym, name: sym, region: f.region, sector: sector, mode: 'momentum', score: mScore,
      state: momentumState, price: price, dayChg: f.dayChg, rvol: f.rvol, rs: f.rs20,
      metricA: f.ret20, metricB: f.ext21,
      eligible: !blocked && price >= 5 && f.avgDollarVol >= 3000000 && f.ext21 <= 8 && f.dayChg < 10 && mScore >= 55,
      actionable: !blocked && price >= 5 && f.avgDollarVol >= 3000000 && f.ext21 <= 8 && f.dayChg < 10 && mScore >= 68,
      reason: 'Trend ' + (price > ema21 && ema21 > ema50 ? 'aliniat' : 'în formare') + ' · RS vs benchmark ' + signed(f.rs20, 1) + ' · RVOL ' + fmt(f.rvol, 2) + '× · ' + earn.text,
      entryLow: entryLow, entryHigh: entryHigh, stop: stop, target: target, spark: f.spark,
      governor: gov, earnings: earn.text, ts: Date.now()
    };
    var reversalSafe = eb && !eb.isWilting && !eb.isRanBlocked;
    var reversalConfirmed = reversalSafe && (eb.isEarly || eb.isConfirmed || (eb.signals && eb.signals.stabilized && eb.signals.rsiRising));
    var reversalWatch = reversalSafe && f.drawdown <= -12 && f.bounce60 >= 1 && f.bounce60 <= 35
      && (eb.isEarly || eb.isConfirmed || (eb.signals && (eb.signals.stabilized || eb.signals.rsiRising || eb.signals.higherLow)) || price > ema21);
    var reversalActionable = !blocked && price >= 5 && f.avgDollarVol >= 3000000 && f.drawdown <= -20
      && f.bounce60 >= 2 && f.bounce60 <= 30 && reversalConfirmed && rScore >= 50;
    if (!blocked && !reversalActionable && reversalWatch) reversalState = 'WATCH';
    var reversal = {
      symbol: sym, name: sym, region: f.region, sector: sector, mode: 'reversal', score: rScore,
      state: reversalState, price: price, dayChg: f.dayChg, rvol: f.rvol, rs: f.rs20,
      metricA: f.drawdown, metricB: f.bounce60, baseDays: f.baseDays,
      eligible: !blocked && price >= 5 && f.avgDollarVol >= 3000000 && reversalWatch && rScore >= 32,
      actionable: reversalActionable,
      reason: (reversalActionable ? 'Confirmat · ' : 'Monitorizare · ') + (eb && MEB.ebSignalText ? MEB.ebSignalText(eb) : 'structură reversal') + ' · scădere ' + signed(f.drawdown, 1) + ' · revenire ' + signed(f.bounce60, 1) + ' · ' + earn.text,
      entryLow: entryLow, entryHigh: entryHigh, stop: stop, target: target, spark: f.spark,
      governor: gov, earnings: earn.text, ts: Date.now()
    };
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
    var out = { US: 0, EU: 0 };
    try { var s = closes(await D.fetchStock('SPY', { range: '6mo', interval: '1d', ttl: 1800 })); out.US = retAt(s, 20) || 0; } catch (_) {}
    try { var e = closes(await D.fetchStock('^STOXX50E', { range: '6mo', interval: '1d', ttl: 1800 })); out.EU = retAt(e, 20) || 0; } catch (_) {}
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
    if (state.scanning || !state.shellVisible) return;
    if (!validateDeps()) { showAlert('Lipsesc biblioteci critice din lib/. Scanarea a fost oprită.', true); return; }
    setScanning(true); showAlert(''); progress(0, 1); state.failures = [];
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
    state.momentum = capSectors(combined.filter(function (x) { return x.mode === 'momentum' && x.eligible; }));
    state.reversal = capSectors(combined.filter(function (x) { return x.mode === 'reversal' && x.eligible; }));
    state.updatedAt = Date.now();
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ momentum: state.momentum, reversal: state.reversal, updatedAt: state.updatedAt })); } catch (_) {}
    $('countMomentum').textContent = state.momentum.length; $('countReversal').textContent = state.reversal.length;
    $('ctxEligible').textContent = (state.momentum.length + state.reversal.length) + ' top';
    $('ctxSectors').textContent = topSectors(state[state.mode]);
    var gs = window.GV && GV.status ? GV.status() : null;
    $('ctxGovernor').textContent = gs ? gs.verdict : 'indisponibil';
    $('ctxFreshness').textContent = 'live · ' + ageText(state.updatedAt);
    $('updatedAt').textContent = 'actualizat acum';
    if (state.failures.length) showAlert(state.failures.length + ' simboluri nu au răspuns; au fost excluse, nu înlocuite cu date vechi.');
    render(); setScanning(false); schedule();
  }

  function currentItems() {
    var q = $('search').value.trim().toUpperCase();
    var only = $('onlyActionable').checked;
    return state[state.mode].filter(function (x) {
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
      + '<div class="ce-symbol"><b>' + escapeHtml(x.symbol) + ' <em>' + escapeHtml(x.region) + '</em></b><small>' + escapeHtml(x.reason) + '</small></div>'
      + '<span class="ce-cell">' + escapeHtml(x.sector) + '</span><b class="ce-cell ' + clsA + '">' + a + '</b>'
      + '<span class="ce-cell ' + clsB + '">' + b + '</span><span class="ce-cell">' + c + '</span><span class="ce-cell">' + d + '</span>'
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
        state.selected = state[btn.dataset.mode].find(function (x) { return x.symbol === btn.dataset.symbol; }); render();
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
    if (!x) {
      ['dSymbol','dName','dScore','dSector','dState','dFresh','dReason','dEntry','dStop','dTarget','dGovernor','dGovernorWhy'].forEach(function (id) { $(id).textContent = '—'; });
      $('spark').innerHTML = ''; $('setupBtn').disabled = true; return;
    }
    $('dSymbol').textContent = x.symbol; $('dName').textContent = x.mode === 'momentum' ? 'Long momentum' : 'Early reversal';
    $('dScore').textContent = x.score; $('dSector').textContent = x.sector; $('dState').textContent = x.state;
    $('dFresh').textContent = ageText(x.ts); $('dReason').textContent = x.reason;
    $('dEntry').textContent = fmt(x.entryLow, 2) + '–' + fmt(x.entryHigh, 2);
    $('dStop').textContent = fmt(x.stop, 2); $('dTarget').textContent = fmt(x.target, 2);
    $('spark').innerHTML = sparkSvg(x.spark);
    var g = x.governor || { verdict: 'TRADE', reasons: [] };
    $('dGovernor').textContent = 'Governor: ' + g.verdict;
    $('dGovernorWhy').textContent = (g.reasons && g.reasons[0]) || (x.earnings + ' · R:R țintă 2.0');
    $('governorBox').className = 'ce-governor ' + (g.verdict === 'HALTED' ? 'halted' : (g.verdict === 'CAUTION' ? 'caution' : ''));
    $('setupBtn').disabled = x.state === 'BLOCKED' || !x.actionable;
  }

  function loadCache() {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!c || !c.updatedAt || Date.now() - c.updatedAt > 30 * 60 * 1000) return;
      state.momentum = c.momentum || []; state.reversal = c.reversal || []; state.updatedAt = c.updatedAt;
      $('countMomentum').textContent = state.momentum.length; $('countReversal').textContent = state.reversal.length;
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
      if (!state.selected || state.selected.state === 'BLOCKED') return;
      location.href = '../smart-trade-long/?symbol=' + encodeURIComponent(state.selected.symbol);
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

  validateDeps(); bind(); loadCache(); schedule();
  setTimeout(scan, 400);
})();
