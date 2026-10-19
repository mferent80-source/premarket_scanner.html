(function () {
  'use strict';

  var SCAN_MS = 5 * 60 * 1000;
  var CACHE_KEY = 'ce_results_v2';
  var demoMode = new URLSearchParams(location.search).get('demo') === '1';
  // 18.10.2026: pagina Piață rulează motorul într-o fereastră ascunsă (?fundal=1&univers=…): o singură scanare, fără reluarea la 5 minute
  // 18.10.2026 (audit): cadrul ascuns al aplicației trimite ?background=1 — aceeași regulă: o scanare, fără ceasul de 5 minute
  var fundal = (new URLSearchParams(location.search).get('fundal') || new URLSearchParams(location.search).get('background')) === '1', universCerut = new URLSearchParams(location.search).get('univers');
  var requested = new URLSearchParams(location.search).get('symbol');
  requested = /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(requested||'')?requested:null;
  var requestedMode = new URLSearchParams(location.search).get('mode') === 'reversal'?'reversal':'momentum';
  var US_CORE = [
    'AAPL','MSFT','NVDA','AVGO','AMD','MU','INTC','WDC','AMAT','LRCX','KLAC','QCOM','TSM',
    'PLTR','CRWD','PANW','SNOW','AMZN','META','GOOGL','NFLX','TSLA','COIN','HOOD','SOFI',
    'JPM','BAC','XOM','CVX','CAT','BA','GE','RTX','UNH','LLY','PFE','NVO','PYPL','EL',
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
    trend: [], trendMeta: null, trendEroare: '', trendIesiri: [], peadPentru: null, trendGen: 0,
    failures: [], earningsOk: false, earningsMap: {}, timer: null,
    verified: 0, scanned: 0, hasScan: false, benchmarks: [], sectorPending: false, generation: 0, scanKey: null,
    screener: null, screenerLa: null
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
  // 18.10.2026 (audit): vârsta rezultatelor se recalculează (la fiecare randare și la 30 s), nu rămâne „actualizat acum” oricât ar trece
  function vechime(ts) {
    var min = Math.floor(Math.max(0, Date.now() - ts) / 60000);
    return min < 1 ? 'acum' : min < 60 ? 'acum ' + min + ' min' : 'acum ' + Math.floor(min / 60) + ' h ' + (min % 60) + ' min';
  }
  function etichete() {
    if (state.hasScan && state.verified && state.updatedAt && !state.scanning) {
      $('updatedAt').textContent = 'actualizat ' + vechime(state.updatedAt);
      $('ctxFreshness').textContent = 'EOD verificat · scanat ' + vechime(state.updatedAt);
    }
    if (state.scanning) $('nextScan').textContent = 'scanarea rulează singură';
    else if (fundal) $('nextScan').textContent = 'o singură scanare, în fundal';
    else if (state.nextAt) { var m = Math.max(0, Math.ceil((state.nextAt - Date.now()) / 60000)); $('nextScan').textContent = m ? 'următorul scan în ' + m + ' min' : 'următorul scan acum'; }
  }
  function regionOf(sym) { return EU_CORE.indexOf(sym) >= 0 || /\.(DE|PA|AS|CO|MU|MI|L|SW)$/i.test(sym) ? 'EU' : 'US'; }
  function unique(arr) { return Array.from(new Set(arr.map(function (s) { return String(s || '').trim().toUpperCase(); }).filter(Boolean))); }
  function universe() {
    var kind = $('universe').value;
    var wl = window.WL ? WL.get() : [];
    if(requested)wl=wl.concat([requested]);
    if (kind === 'watchlist') return unique(wl);
    if (kind === 'us') return unique(US_CORE.concat(wl.filter(function (s) { return regionOf(s) === 'US'; })));
    // I-610 (14.10.2026): primele 200 din lista datata a robotului (screenerul Nasdaq, SUA >= 2 mld.), nu cele 67 de nume de mana
    if (kind === 'screener') return unique((state.screener || US_CORE).slice(0, 200).concat(wl.filter(function (s) { return regionOf(s) === 'US'; })));
    if (kind === 'eu') return unique(EU_CORE.concat(wl.filter(function (s) { return regionOf(s) === 'EU'; })));
    return unique(US_CORE.concat(EU_CORE, wl));
  }

  async function loadScreenerUnivers() {
    if (state.screener || typeof fetch !== 'function') return !!state.screener;
    try {
      var r = await fetch('generated/univers-sua.json?x=' + Date.now(), { cache: 'no-store' });
      if (!r || !r.ok) return false;
      var j = await r.json();
      if (!j || !Array.isArray(j.l) || j.l.length < 50) return false;
      state.screener = unique(j.l.map(function (x) { return x && x.s; })); state.screenerLa = j.la || null;
      return true;
    } catch (_) { return false; }
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
    // EL, 14.10 („lasă și Europa”): Finnhub nu acoperă raportările EU ⇒ rămâne neverificat, dar NU blochează planul — avertismentul rămâne la vedere
    if (regionOf(sym) === 'EU') return { penalty: 5, blocked: false, unverified: true, eu: true, text: 'earnings EU neverificat — verifică singur calendarul' };
    // revizie 14.10: calendarul vede doar tickere US de forma AAAA sau AAAA-B (BRK-B) — orice altceva NU e „verificat curat”
    if (!/^[A-Z][A-Z0-9]{0,4}(-[A-Z])?$/.test(sym)) return { penalty: 5, blocked: false, unverified: true, text: 'earnings neverificat (simbolul nu e în calendar)' };
    if (!e || !e.date) return { penalty: 0, blocked: false, text: 'fără earnings în 14z' };
    var days = zileNY(e.date);
    if (days <= 1) return { penalty: 30, blocked: true, days: days, text: 'earnings în ' + Math.max(0, days) + 'z' };
    if (days <= 3) return { penalty: 12, blocked: false, inFereastra: true, days: days, text: 'earnings în ' + days + 'z' };
    return { penalty: 4, blocked: false, inFereastra: true, days: days, text: 'earnings în ' + days + 'z' };
  }
  function gardaEarnings(earn) {
    if (!earn) return '';
    if (earn.unverified && earn.eu) return '';   // Europa: excepție hotărâtă de EL pe 14.10 — avertisment, nu blocaj
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
    // 14.10.2026 (I-611): volumul conteaza doar pe zi verde — volum mare pe zi rosie e distributie, nu cerere (trader.md);
    // probat pe 5 ani: nu aduce avantaj (ramane fara), dar scoate ~600 de FIRE false din 1.872.
    if (f.rvol >= 1.1 && f.dayChg > 0) s += 7;
    if (f.rvol >= 1.5 && f.dayChg > 0) s += 4;
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
    out.push({ k: 'earnings', v: String(earn.text || '').replace(/^earnings /, '').replace(/ — verifică singur calendarul$/, ''), rol: earn.blocked || garda ? 'block' : earn.inFereastra || earn.unverified ? 'attention' : 'support' });
    if (item.mode === 'reversal') out.push({ k: 'scădere', v: procente(f.drawdown), rol: 'info' }, { k: 'revenire', v: procente(f.bounce60), rol: 'info' });
    if (blocked) out.push({ k: 'plan', v: 'blocat', rol: 'block' }); else if (!item.actionable) out.push({ k: 'confirmare', v: 'incompletă', rol: 'attention' });
    return out;
  }
  async function analyze(sym, benchmark, govScan) {
    var source=DailySeries.read(await D.fetchStock(sym, { range: '1y', interval: '1d', ttl: 1800 }),sym);
    var bars=source.bars,benchmarkRet20=benchmark&&benchmark.asOf===source.asOf?benchmark.ret20:null,benchmarkSymbol=benchmark&&benchmark.symbol||null;
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
    var gov = govScan || (window.GV && GV.status ? GV.status() : { verdict: 'INDISPONIBIL', reasons: ['Governor indisponibil'] });   // lipsa Governor-ului ramane verdict NEcunoscut (nu eligible); NEVERIFICAT (I-612) e cunoscut
    var knownGovernor = ['TRADE','CAUTION','HALTED','NEVERIFICAT'].includes(gov.verdict);   // NEVERIFICAT (I-612): vizibil, dar fara plan
    var blocked = earn.blocked || !['TRADE','CAUTION'].includes(gov.verdict);
    var sector = window.EL && EL.sectorOf ? EL.sectorOf(sym) : 'Necunoscut';
    var trend=window.TTDecisionVerdict?.trend(bars);
    var mid = price, entryLow = price * .997, entryHigh = price * 1.003;
    var stop = price - f.atr * 1.25, target = entryHigh + Math.max(.01, entryHigh - stop) * 2;
    var momentumState = blocked ? 'BLOCKED' : (mScore >= 80 && rvol >= 1.15 ? 'FIRE' : (mScore >= 68 ? 'ARMED' : 'EARLY'));
    var reversalState = blocked ? 'BLOCKED' : (eb && eb.isConfirmed && rScore >= 82 ? 'FIRE' : (eb && eb.isConfirmed ? 'ARMED' : 'EARLY'));
    var trendAligned=trend?trend.short==='up'&&trend.medium==='up':price>ema21&&ema21>ema50;
    var momentum = {
      symbol: sym, dataQuality:source.dataQuality, sourceDate:source.asOf,sourceTimezone:source.timezone,sourceCloseMinutes:source.closeMinutes,currency:source.currency,name: sym, trend:trend, atr:atr, region: f.region, sector: sector, mode: 'momentum', score: mScore, benchmarkSymbol: benchmarkSymbol,
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
  var BENCHMARKS = [['US', ['SPY', 'IVV']], ['EU', ['^STOXX', '^STOXX50E']]];
  async function benchmarkReturns() {
    var out = { US:null,EU:null };
    state.benchmarks=[];
    // 18.10.2026 (audit): UE se compară cu STOXX 600 (^STOXX), același indice ca reperul Reguli V1 (EXSA.DE ⇒ ^STOXX); rezerve IVV / ^STOXX50E.
    // Reperul ales se notează (region, symbol); cel căzut rămâne la vedere cu motivul lui.
    for(var pair of BENCHMARKS){var lipsa=[];for(var sym of pair[1]){try{var source=DailySeries.read(await D.fetchStock(sym,{range:'6mo',interval:'1d',ttl:1800}),sym),ret=retAt(closes(source.bars),20);if(ret===null)throw Error('Istoric indice insuficient.');out[pair[0]]={asOf:source.asOf,ret20:ret,symbol:sym};state.benchmarks.push({region:pair[0],symbol:sym,asOf:source.asOf+(lipsa.length?' (rezervă; '+lipsa.join('; ')+')':'')});break;}catch(e){lipsa.push(sym+': '+(e.message||'indisponibil'));}}if(!out[pair[0]])state.benchmarks.push({region:pair[0],symbol:pair[1].join(' / '),reason:lipsa.join('; ')||'Indice indisponibil'});}
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
    var rp = $('rowsProgress'); if (rp) rp.textContent = done + ' / ' + total;
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
    setScanning(true); showAlert(''); progress(0, 1); state.failures = [];state.verified=0;state.sectorPending=false;render();
    try {
      if ($('universe').value === 'screener' && !(await loadScreenerUnivers())) showAlert('Lista screenerului (generated/univers-sua.json) nu s-a putut citi — scanez lista de mână (Core SUA) până revine robotul.');
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
      $('ctxFreshness').textContent = 'Nicio serie verificată'; $('updatedAt').textContent = 'actualizat acum';   // etichete() le înlocuiește când există serii verificate
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
      if (!fundal) schedule(); else etichete();
    }
  }

  // audit 18.10: un verdict Governor necunoscut scoate tot din clasament (eligible cere un verdict cunoscut) — golul trebuie să spună asta
  function governorNecunoscut() { var v = window.GV && GV.status ? (GV.status() || {}).verdict : null; return ['TRADE','CAUTION','HALTED','NEVERIFICAT'].indexOf(v) < 0; }
  function currentItems() {
    var q = $('search').value.trim().toUpperCase();
    var only = $('onlyActionable').checked;
    var source=q&&state.mode!=='trend'&&state.analyses.some(function(x){return x.symbol===q;})?state.analyses:state[state.mode];   // revizie 14.10: Trend nu e în analyses
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
      ? '<span>#</span><span>SIMBOL / MOTIV</span><span>SECTOR</span><span>MOM 12-1</span><span>MOM 6-1</span><span>RANG</span><span>PREȚ</span><span>60 Z</span><span>STARE</span>'
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
      + '<strong class="ce-score">' + x.score + '</strong><i class="ce-state ' + stateClass(x) + '">' + x.state + (probaTag(x) ? '<small class="ce-proba-tag">' + escapeHtml(probaTag(x)) + '</small>' : '') + '</i></button>';
  }
  // 19.10.2026 (I-709): Top Long e în proba în timp (scanner-verdicts/generated/premarket-proba.json) ⇒ lângă FIRE / ARMED scrie „în probă · N/8”,
  // iar deasupra listei, nota probei. Doar afișare: regulile de clasament (amprenta probei) nu se ating.
  function probaTag(x) { if (!x || x.mode !== 'momentum' || ['FIRE', 'ARMED'].indexOf(x.state) < 0) return ''; return window.TTProbaTopLong ? TTProbaTopLong.tag(x) : 'în probă'; }
  function notaProba() {
    var el = $('probaNota'); if (!el) return;
    var s = window.TTProbaTopLong ? TTProbaTopLong.state() : null;
    el.hidden = state.mode !== 'momentum' || !!(s && s.dovedit);
    if (!el.hidden) el.textContent = s ? s.text : 'Top Long e în proba în timp; până la verdict riscul unui plan Top Long e plafonat la 0,25 %.';
  }
  function stateClass(x) { return x.mode === 'trend' ? (x.state === 'VECHI' ? 'vechi' : x.state === 'RAPORTEAZĂ' ? 'raporteaza' : x.state === 'FĂRĂ REGIM' ? 'regim' : 'proba') : String(x.state || '').toLowerCase(); }
  // Modul „Trend 12 luni” (14.10.2026): clasamentul vine de la robotul zilnic (tools/trend-12-1.mjs ⇒ generated/trend-12-1.json).
  // Semnal de SELECȚIE: doar INDICIU față de alte acțiuni în aceeași zi (auditul de seară 14.10: t ≈ 1,5 pe ferestre independente);
  // neprobat pe listă istorică ⇒ fără plan, în probă.
  var TREND_ETICHETA = 'indiciu față de acțiunile din aceeași zi (t ≈ 1,5, sub pragul de „probat”); neprobat pe listă istorică; în probă — nu e un buton de cumpărat';
  async function loadTrend() {
    var gen = ++state.trendGen;   // revizie 14.10: două încărcări în paralel (pornire + scan) dublau cipurile — câștigă ultima pornită
    var lista = [], meta = null, eroare = '', iesiri = [];
    try {
      var r = await fetch('generated/trend-12-1.json?x=' + Date.now(), { cache: 'no-store' });
      if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status));
      var j = await r.json();
      if (!j || !Array.isArray(j.clasament) || !/^\d{4}-\d{2}-\d{2}$/.test(String(j.dataUltimei || ''))) throw new Error('fișier fără clasament');
      var asteptat = DailySeries.expected(Date.now(), 'America/New_York', 960);
      var vechime = Math.round((Date.parse(asteptat + 'T00:00:00Z') - Date.parse(j.dataUltimei + 'T00:00:00Z')) / 86400000);
      var regimPornit = !!(j.regim && j.regim.peste), vechi = vechime > 4;   // revizie 14.10: peste 4 zile calendaristice (weekend + o sărbătoare), nu 7
      var stare = vechi ? 'VECHI' : regimPornit ? 'ÎN PROBĂ' : 'FĂRĂ REGIM';
      var gov = window.GV && GV.status ? GV.status() : { verdict: 'NEVERIFICAT', reasons: ['Governor indisponibil'] };
      var eticheta = String(j.eticheta || TREND_ETICHETA);
      meta = { la: j.la, dataUltimei: j.dataUltimei, vechime: vechime, regim: j.regim || null, univers: j.univers || null, metoda: j.metoda || '', eticheta: eticheta, bilant: null };
      lista = j.clasament.slice(0, 20).map(function (c) {
        return {
          symbol: String(c.s || '').toUpperCase(), name: c.nume || c.s, mode: 'trend', kind: 'trend', region: 'US', currency: 'USD', sector: c.sector || 'Necunoscut',
          score: Math.round(clamp(100 - (safeNum(c.rang) || 0) * 100, 0, 100)), state: stare, price: safeNum(c.pret), dayChg: null, rvol: null, rs: null,
          metricA: (safeNum(c.m12) || 0) * 100, metricB: (safeNum(c.m6) || 0) * 100, rang: safeNum(c.rang), cap: safeNum(c.cap), dolari20: safeNum(c.dolari20), r60: safeNum(c.r60),
          salt: c.salt && safeNum(c.salt.pct) != null ? { pct: safeNum(c.salt.pct), d: String(c.salt.d || '') } : null,   // tt-v882: cel mai mare salt într-o zi din fereastra 12-1 (robotul)
          eligible: true, actionable: false,
          reason: 'EOD ' + j.dataUltimei + ' · ' + eticheta + ' · regim ' + (regimPornit ? 'pornit (SPY peste media pe 200 de zile)' : 'oprit (SPY sub media pe 200 de zile)') + (vechi ? ' · clasament VECHI de ' + vechime + ' zile' : ''),
          entryLow: safeNum(c.pret), entryHigh: safeNum(c.pret), stop: null, target: null, spark: Array.isArray(c.spark) ? c.spark : [],
          governor: gov, earnings: 'neverificat în modul trend', ts: Date.parse(j.la) || Date.now(), sourceDate: j.dataUltimei
        };
      });
      iesiri = imbogatesteTrend(j, vechi, lista, meta);
      await earningsPesteTrend(vechi, lista);
      meta.bilant = await incarcaBilant();
    } catch (e) { lista = []; meta = null; iesiri = []; eroare = (e && e.message) || 'eroare'; }
    if (gen !== state.trendGen) return;
    // faptul „după raportare” (I-620) supraviețuiește reîncărcării de la 5 minute
    var cuPead = {}; state.trend.forEach(function (x) { if (x.pead) cuPead[x.symbol] = x; });
    lista.forEach(function (x) { var v = cuPead[x.symbol]; if (v) { x.pead = v.pead; x.fapte = (x.fapte || []).concat((v.fapte || []).filter(function (p) { return p.k === 'după raportare'; })); } });
    state.trend = lista; state.trendMeta = meta; state.trendIesiri = iesiri; state.trendEroare = eroare;
    $('countTrend').textContent = state.trend.length;
    if (state.mode === 'trend') { render(); peadPesteTrend(); } else coverage();
  }
  // Audit 14.10.2026: 10 din cele 40 din clasament raportau în 14 zile și pagina nu spunea nimic. Robotul (I-621) sau cheia din browser:
  // cine raportează primește starea RAPORTEAZĂ și ziua; fără niciuna, rândul spune „neverificat” — nu tace.
  async function earningsPesteTrend(vechi, lista) {
    var cal = null;
    try { cal = window.EARN && EARN.calendar ? await EARN.calendar({ zile: 14, toate: true }) : null; } catch (_) { cal = null; }
    var harta = {};
    if (cal && cal.ok) (cal.items || []).forEach(function (e) { if (e && e.symbol && e.date && !harta[e.symbol]) harta[e.symbol] = e; });
    lista.forEach(function (x) {
      if (x.earningsDinRobot) return;
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
    var f = [{ k: 'EOD', v: m ? m.dataUltimei : '', rol: 'info' }, { k: '12-1', v: procente(x.metricA), rol: 'support' }, { k: '6-1', v: procente(x.metricB), rol: x.metricB >= 0 ? 'support' : 'attention' },
      { k: 'rang', v: x.rang == null ? '—' : 'top ' + fmt(x.rang * 100, 1) + ' %', rol: 'support' }, { k: 'regim', v: peste ? 'pornit' : 'oprit', rol: peste ? 'support' : 'attention' }];
    // tt-v882: un salt ≥ 50 % într-o zi în fereastra 12-1 e split neajustat / reverse split / glitch / știre — cifra 12-1 se verifică înainte de a fi crezută
    if (x.salt && x.salt.pct >= 0.5) f.push({ k: 'salt', v: procente(x.salt.pct * 100) + ' într-o zi' + (x.salt.d ? ' (' + x.salt.d + ')' : '') + ' — verifică seria', rol: 'attention' });
    return f;
  }
  function imbogatesteTrend(j, vechi, lista, m) {
    var sect = j.sectoare && typeof j.sectoare === 'object' ? j.sectoare : null, conc = null;
    if (sect) Object.keys(sect).forEach(function (s) { var n = Number(sect[s]) || 0; if (!conc || n > conc.n) conc = { sector: s, n: n, din: 20 }; });
    m.concentrare = conc && conc.n / 20 >= 0.4 ? conc : null;
    m.raportari = j.raportari && typeof j.raportari === 'object' ? j.raportari : null;
    m.ziuaDinainte = j.ziuaDinainte || null;
    var iesiri = (Array.isArray(j.iesiri) ? j.iesiri : []).slice(0, 20).map(function (e) { return { symbol: String(e.s || '').toUpperCase(), name: e.nume || e.s, sector: e.sector || 'Necunoscut', motiv: e.motiv || '', rangAzi: safeNum(e.rangAzi), m12: safeNum(e.m12) }; });
    lista.forEach(function (x, i) {
      var c = j.clasament[i] || {};
      x.fapte = faptePentruTrend(x, m);
      if (c.raporteaza && c.raporteaza.d) {
        var z = zileNY(c.raporteaza.d), ora = c.raporteaza.ora;   // revizie 14.10: zilele de la AZI, nu de la data clasamentului
        x.earningsDinRobot = true;
        if (z < 0) { x.earnings = 'a raportat acum ' + (-z) + 'z'; x.fapte.push({ k: 'a raportat', v: (-z) + 'z', rol: 'info' }); }
        else {
          x.earnings = 'raportează în ' + z + 'z' + (ora === 'amc' ? ' (după închidere)' : ora === 'bmo' ? ' (înainte de deschidere)' : '');
          if (!vechi) x.state = 'RAPORTEAZĂ'; x.reason += ' · ' + x.earnings;
          x.fapte.push({ k: 'raportează', v: 'în ' + z + 'z', rol: 'block' });
        }
      } else if (m.raportari && m.raportari.sursa === 'finnhub') {
        x.earnings = 'fără raportare în 14z'; x.earningsDinRobot = true; x.fapte.push({ k: 'earnings', v: 'fără raportare în 14z', rol: 'info' });
      }
      if (m.concentrare && x.sector === m.concentrare.sector) x.fapte.push({ k: 'sector', v: m.concentrare.n + '/20 ' + m.concentrare.sector, rol: 'attention' });
    });
    return iesiri;
  }
  async function incarcaBilant() {
    try {
      var r = await fetch('generated/trend-12-1-bilant.json?x=' + Date.now(), { cache: 'no-store' });
      if (!r || !r.ok) return null;
      var b = await r.json();
      if (!b || typeof b !== 'object') return null;
      return { zile: safeNum(b.zile) || 0, n20: safeNum(b.n20) || 0, n60: safeNum(b.n60) || 0, ferestre20: safeNum(b.ferestre20), exces20: safeNum(b.exces20), exces60: safeNum(b.exces60), nulB20: safeNum(b.nulB20), diferenta20: b.diferenta20 || null, verdict: String(b.verdict || 'în probă'), t20: safeNum(b.t20),
        abatere: b.abatere && typeof b.abatere === 'object' ? { k: safeNum(b.abatere.k), medie: safeNum(b.abatere.medie), prag: safeNum(b.abatere.prag), atinsa: b.abatere.atinsa === true } : null };   /* 14.10 seara */
    } catch (_) { return null; }
  }
  function notaTrend() {
    var el = $('trendNota'); if (!el) return;
    el.hidden = state.mode !== 'trend'; if (el.hidden) return;
    var m = state.trendMeta;
    if (!m) { el.innerHTML = state.trendEroare ? 'Clasamentul robotului nu s-a putut citi (' + escapeHtml(state.trendEroare) + ').' : 'Clasamentul se încarcă…'; return; }
    var parti = ['EOD ' + escapeHtml(m.dataUltimei) + (m.vechime > 4 ? ' (VECHI, ' + m.vechime + ' zile)' : ''), 'regim ' + (m.regim && m.regim.peste ? 'pornit' : 'oprit')];
    if (m.concentrare) parti.push('<b>' + m.concentrare.n + ' din ' + m.concentrare.din + ' ' + escapeHtml(m.concentrare.sector) + '</b> — un singur pariu');
    if (m.raportari && m.raportari.sursa !== 'finnhub') parti.push('raportările: ' + escapeHtml(m.raportari.sursa === 'lipsă' ? 'robotul fără cheie' : 'eroare la robot'));
    var b = m.bilant;
    if (b) parti.push('proba: ' + b.n20 + ' zile cu rezultat' + (b.ferestre20 != null ? ' (' + b.ferestre20 + ' ferestre de 20 z)' : '') + (b.exces20 != null ? ', ' + procente(b.exces20) + ' vs SPY' : '') + (b.diferenta20 && safeNum(b.diferenta20.medie) != null ? ', ' + procente(b.diferenta20.medie) + ' vs alte acțiuni' : '') + (b.t20 != null ? ', t ' + fmt(b.t20, 1) + ' („probat” cere t > 3,2 pe ≥ 12 ferestre)' : '') + ' · ' + escapeHtml(b.verdict));
    if (b && b.abatere && b.abatere.atinsa && b.abatere.medie != null && b.abatere.prag != null) parti.push('<b>ABATERE</b>: media pe ' + b.abatere.k + ' ferestre ' + procente(b.abatere.medie) + ', sub pragul scris înainte ' + procente(b.abatere.prag));
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
      + '<strong class="ce-score">' + (x.r60 == null ? '—' : procente(x.r60 * 100)) + '</strong><i class="ce-state ' + stateClass(x) + '">' + escapeHtml(x.state) + '</i></button>';
  }
  function renderDetailTrend(x) {
    var m = state.trendMeta || {}, g = window.GV?.status?.() || x.governor || { verdict: 'NEVERIFICAT', reasons: ['Governor indisponibil'] };
    var motiv = (m.eticheta || TREND_ETICHETA) + ' Se ține 20–60 de zile, fără stop strâns (planul cu 1,25 ATR anulează efectul); ieșire când iese din top 20 % sau când regimul se oprește.';
    window.TTDecisionPanel?.set({ purpose: 'entry', simulation: false, candidate: null, risk: g, empty: { title: 'Trend 12 luni · ' + x.symbol + ' · în probă', reason: 'În probă: doar un indiciu față de acțiunile din aceeași zi (t ≈ 1,5), neprobat pe listă istorică. Fără plan; se ține 20–60 de zile, fără stop strâns.' } });
    $('dSymbol').textContent = x.symbol; $('dName').textContent = 'Trend 12 luni · ' + (x.name || '') + ' · ' + x.currency;
    $('dScore').textContent = x.r60 == null ? '—' : '60 z ' + procente(x.r60 * 100); $('dSector').textContent = x.sector; $('dState').textContent = x.state;
    $('dFresh').textContent = 'EOD ' + (m.dataUltimei || '—'); $('dReason').textContent = x.reason + ' · ' + motiv;
    $('dEntry').textContent = fmt(x.price, 2) + ' (închiderea)'; $('dStop').textContent = '—'; $('dTarget').textContent = '—';
    $('spark').innerHTML = sparkSvg(x.spark);
    $('dGovernor').textContent = 'Governor: ' + g.verdict; $('dGovernorWhy').textContent = (g.reasons && g.reasons[0]) || 'modul Trend nu construiește plan';
    $('governorBox').className = 'ce-governor ' + (g.verdict === 'HALTED' ? 'halted' : (g.verdict === 'CAUTION' ? 'caution' : ''));
    $('setupBtn').disabled = true; $('setupBtn').title = 'Modul Trend 12 luni nu construiește plan: semnal de selecție în probă, ținut 20–60 de zile, fără stopul de 1,25 ATR.';
  }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]; }); }

  function render() {
    etichete();
    tableHead();
    coverage();
    notaTrend();
    notaProba();
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
        +(state.scanning?'Pornită singură: verific prețurile, trendul și indicii de comparație (<span id="rowsProgress">'+escapeHtml($('ctxScanned').textContent||'')+'</span>). Rezultatele apar aici la final.':query?'Căutarea „'+escapeHtml(query)+'” nu are rezultate în selecția curentă. Resetează filtrele.':only?'Filtrul „doar confirmate” ascunde candidații de monitorizare și cei cu plan blocat. Resetează filtrele pentru a-i vedea.':!state.verified?'Vezi Acoperire pentru erorile surselor sau schimbă universul scanat.':governorNecunoscut()?'Seriile au fost verificate, dar Governor nu se poate citi ('+escapeHtml(window.GV?.status?.()?.verdict||'indisponibil')+'): fără limitele contului candidații nu intră în clasament. Reîncarcă aplicația sau verifică Cont & sincronizare.':'Seriile au fost verificate, dar nu trec criteriile acestei strategii. Verifică Acoperire sau schimbă între Top Long și Early Reversal.')+'</div>';
      state.selected = null; renderDetail(null); return;
    }
    state.selected=items.find(function(x){return x.symbol===state.selected?.symbol&&x.mode===state.selected?.mode;})||items[0];
    $('rows').innerHTML = items.map(rowHtml).join('') + (state.mode === 'trend' && state.trendIesiri.length ? state.trendIesiri.map(rowHtmlIesit).join('') : '');
    Array.prototype.forEach.call(document.querySelectorAll('.ce-row[data-mode]'), function (btn) {   // revizie 14.10: rândurile IEȘIT n-au mod, nu primesc clic
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
    $('dScore').textContent = x.score; $('dSector').textContent = x.sector; $('dState').textContent = x.state + (probaTag(x) ? ' · ' + probaTag(x) : '');
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
      render();coverage();
    } catch (_) {}
  }
  function schedule() {
    clearTimeout(state.timer);
    state.timer = setTimeout(function () { if (!document.hidden && state.shellVisible) scan(); else schedule(); }, SCAN_MS);
    state.nextAt = Date.now() + SCAN_MS; etichete();
  }
  // 19.10.2026 (I-702): la deschidere pagina rescana mereu (setTimeout(scan, 400)), chiar cu rezultate de 2 minute. Acum: doar când copia lipsește
  // sau are peste 30 de minute — aceeași regulă ca scanarea ascunsă a aplicației (app/index.html). Dacă aplicația scanează chiar atunci în
  // fundal, pagina o așteaptă (copia vine prin `storage`) și scanează singură doar dacă aceea se oprește fără copie nouă.
  var DESCHIDERE_MS = 30 * 60 * 1000;
  function scanareAplicatie() {
    if (fundal) return false;   // cadrul ascuns al aplicației e chiar această pagină
    try { return !!(window.parent && window.parent !== window && window.parent.ttBackgroundScan && window.parent.ttBackgroundScan.state().running); } catch (_) { return false; }
  }
  function proaspat() { return state.updatedAt > 0 && Date.now() - state.updatedAt < DESCHIDERE_MS; }
  function pornire() {
    if (fundal || requested) { setTimeout(scan, 400); return; }   // cadrul ascuns și validarea unui simbol cerut scanează ca înainte
    if (proaspat()) return;
    if (!scanareAplicatie()) { setTimeout(scan, 400); return; }
    var start = Date.now();
    $('nextScan').textContent = 'aștept scanarea pornită de aplicație';
    (function astept() {
      setTimeout(function () {
        if (state.scanning || proaspat()) { etichete(); return; }
        if (scanareAplicatie() && Date.now() - start < 6 * 60000) { astept(); return; }
        loadCache(); if (!proaspat()) scan();
      }, 1500);
    })();
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
      // audit 18.10: la revenirea în pagina parcată rescanează dacă rezultatele au peste 5 minute (înainte: doar când lipseau de tot)
      if (state.shellVisible && Date.now() - state.updatedAt > SCAN_MS) scan();
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
  if (universCerut && Array.prototype.some.call($('universe').options, function (o) { return o.value === universCerut; })) $('universe').value = universCerut;
  loadCache();
  loadTrend();
  if (!fundal && window.TTProbaTopLong) TTProbaTopLong.load('../scanner-verdicts/generated/premarket-proba.json').then(function () { render(); });   // I-709
  if(requested){$('search').value=requested;document.querySelectorAll('.ce-mode').forEach(function(b){b.classList.toggle('active',b.dataset.mode===state.mode);});showAlert('Validare intraday pentru '+requested+' · rulăm universul curent și tickerul solicitat. Ideea EOD nu este o intrare confirmată.');}
  if (!fundal) schedule();
  // I-702: copia salvată de altă fereastră (scanarea ascunsă a aplicației, Piață, Planuri) intră în pagină fără o scanare nouă
  if (!fundal) window.addEventListener('storage', function (e) { if (e && e.key === CACHE_KEY && !state.scanning) loadCache(); });
  pornire();
  if (typeof setInterval === 'function') setInterval(etichete, 30000);
})();
