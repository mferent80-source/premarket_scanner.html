// hub-brief.js v1 — Morning Brief + Hub Cockpit
(function(global){
'use strict';
  const $ = id => document.getElementById(id);
  const escHtml = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmtPct = (n, d=2) => (n==null || isNaN(n)) ? '—' : (n>=0?'+':'') + Number(n).toFixed(d) + '%';
  const fmtNum = (n) => (n==null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US', {maximumFractionDigits:2});
  const getFinnhubKey = () => (global.FH_KEY && FH_KEY.get) ? FH_KEY.get() : (localStorage.getItem('finnhub_api_key') || localStorage.getItem('fh_key') || '');
  // normalizează ambele formate din wl_stocks (string-uri SAU obiecte {symbol}) — un
  // obiect în listă făcea t.toUpperCase() să arunce ÎN AFARA try-ului din pbLoadEarnings
  // → promisiune respinsă tăcut (allSettled) → secțiunea îngheța pe „calendar earnings…"
  const getWatchlist = () => {
    try {
      const a = JSON.parse(localStorage.getItem('wl_stocks') || '[]');
      return (Array.isArray(a) ? a : []).map(x => typeof x === 'string' ? x : ((x && (x.symbol || x.sym)) || '')).filter(Boolean);
    } catch (e) { return []; }
  };

  // fetch cu timeout — apelurile directe (Finnhub/CoinGecko) nu au altfel niciun timeout
  async function fetchT(url, timeoutMs = 9000){
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    try { return await fetch(url, { signal: ctrl.signal }); }
    finally { clearTimeout(to); }
  }
  // Datele calendaristice se ancorează pe ziua ET (nu UTC)
  function etToday(){ try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(new Date()); } catch(e){ return new Date().toISOString().slice(0,10); } }
  function etPlus(days){ const t = new Date(etToday() + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + days); return t.toISOString().slice(0,10); }

  // Yahoo prin lib/data.js (hub-ul îl încarcă garantat); lanț local doar ca plasă de siguranță
  const PB_PROXIES = [
    u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
    u => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
    u => 'https://api.cors.lol/?url=' + encodeURIComponent(u)
  ];
  async function fetchViaProxy(url){
    if (window.D && D.fetchJSON){
      const j = await D.fetchJSON(url, { ttl: 120 });
      if (j != null) return j;
    }
    for (const build of PB_PROXIES){
      try {
        const r = await fetchT(build(url));
        if (!r.ok) continue;
        const txt = await r.text();
        if (txt.trim().startsWith('<')) continue;
        try { return JSON.parse(txt); } catch (e) { continue; }
      } catch (e) {}
    }
    return null;
  }
  async function fetchYahooChart(symbol){
    const data = await fetchViaProxy(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=3mo`);
    const r = data?.chart?.result?.[0];
    if (!r) return null;
    const closes = r.indicators?.quote?.[0]?.close || [];
    const ts = r.timestamp || [];
    const points = closes.map((c, i) => ({ ts: ts[i], close: c })).filter(p => p.close != null);
    return points.length < 5 ? null : { points, meta: r.meta };
  }
  async function fetchCryptoCG(coinId){
    try {
      const r = await fetchT(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=60&interval=daily`);
      if (!r.ok) return null;
      const d = await r.json();
      const prices = d?.prices || [];
      return prices.length < 5 ? null : { points: prices.map(p => ({ ts: Math.floor(p[0]/1000), close: p[1] })) };
    } catch (e) { return null; }
  }

  // ── Risk Regime: ÎNTÂI regimul Macro Dashboard (cu histerezis — sursa de adevăr),
  //    fallback calcul rapid local (VIX nivel + 10Y Δ + corelație BTC/SPY) doar dacă e stale.
  async function pbLoadRisk(){
    // culoarea vine din PALETA MACRO (var(--bull-s) etc.) care NU există în hub →
    // o derivăm local din eticheta regimului, nu ne bazăm pe ce a salvat macro
    const riskColor = label =>
      /RISK-ON|LEAN/.test(label) ? 'var(--green)'
      : /NEUTRAL/.test(label) ? 'var(--t1)'
      : /CAUTIOUS/.test(label) ? '#d4892c'
      : /RISK-OFF|STRESS/.test(label) ? '#ff4d4d' : 'var(--t1)';
    let stale = null;
    try {
      const r = JSON.parse(localStorage.getItem('md_risk_regime') || 'null');
      if (r && r.label && String(r.label).trim()){
        const label = String(r.label);
        const ageMin = Math.round((Date.now() - (r.ts || 0)) / 60000);
        if (ageMin < 360){
          $('pbRiskVal').innerHTML = `<span style="color:${riskColor(label)}">${escHtml(label)}</span>`;
          $('pbRiskSub').textContent = `score ${r.composite >= 0 ? '+' : ''}${r.composite} · din Macro Dashboard (acum ${Math.max(1, ageMin)} min)`;
          return;
        }
        // regim VECHI: îl arătăm imediat (mai bine decât ⏳) cât rulează calculul local
        stale = { ...r, ageMin };
        $('pbRiskVal').innerHTML = `<span style="color:${riskColor(label)}">${escHtml(label)}</span>`;
        $('pbRiskSub').textContent = `din Macro acum ${Math.round(ageMin / 60)}h (vechi) · recalculez local…`;
      }
    } catch (e) {}
    try {
    const [vixData, spyData, btcData, tnxData] = await Promise.all([
      fetchYahooChart('^VIX'), fetchYahooChart('SPY'),
      fetchYahooChart('BTC-USD').then(d => d || fetchCryptoCG('bitcoin')),
      fetchYahooChart('^TNX')
    ]);
    if (!vixData && !spyData && !tnxData){
      // TOATE sursele au picat (proxy CORS jos / rate-limit) → onest, nu un NEUTRAL fals din zerouri
      if (stale){
        $('pbRiskSub').textContent = `din Macro acum ${Math.round(stale.ageMin / 60)}h (VECHI) · datele live indisponibile — deschide Macro Dashboard pt update`;
      } else {
        $('pbRiskVal').innerHTML = '<span style="color:var(--t3)">⚠ n/a</span>';
        $('pbRiskSub').innerHTML = 'date live indisponibile (proxy CORS) — deschide <a href="./macro-dashboard/" style="color:#5bb0ff">Macro Dashboard</a> (regimul lui se preia automat aici)';
      }
      return;
    }
    let vixScore = 0, vixVal = NaN;
    if (vixData?.points?.length){
      vixVal = vixData.meta?.regularMarketPrice ?? vixData.points[vixData.points.length-1].close;
      vixScore = vixVal < 12 ? 1 : vixVal < 18 ? 2 : vixVal < 25 ? -1 : vixVal < 30 ? -2 : -3;
    }
    let tenYScore = 0, tenYDelta = null;
    if (tnxData?.points?.length > 10){
      const last = tnxData.points[tnxData.points.length-1].close, first = tnxData.points[0].close;
      tenYDelta = (last - first) / 10 * 100;
      tenYScore = tenYDelta < -25 ? -2 : tenYDelta < -10 ? -1 : tenYDelta > 25 ? -1 : tenYDelta > 10 ? 0 : 1;
    }
    let corrScore = 0, corrVal = null;
    if (spyData?.points && btcData?.points){
      const map = new Map(btcData.points.map(p => [new Date(p.ts*1000).toISOString().slice(0,10), p.close]));
      const aligned = [];
      for (const p of spyData.points){
        const k = new Date(p.ts*1000).toISOString().slice(0,10);
        if (map.has(k)) aligned.push({ c1: p.close, c2: map.get(k) });
      }
      if (aligned.length >= 10){
        const a = aligned.slice(-30), r1 = [], r2 = [];
        for (let i = 1; i < a.length; i++){ r1.push(a[i].c1/a[i-1].c1 - 1); r2.push(a[i].c2/a[i-1].c2 - 1); }
        const n = r1.length, mx = r1.reduce((s,v)=>s+v,0)/n, my = r2.reduce((s,v)=>s+v,0)/n;
        let cov=0, sx=0, sy=0;
        for (let i=0; i<n; i++){ const dx=r1[i]-mx, dy=r2[i]-my; cov+=dx*dy; sx+=dx*dx; sy+=dy*dy; }
        corrVal = (sx === 0 || sy === 0) ? 0 : cov / (Math.sqrt(sx) * Math.sqrt(sy));
        corrScore = corrVal > 0.6 ? 1 : corrVal > 0.2 ? 0 : corrVal > -0.2 ? -1 : -2;
      }
    }
    const composite = vixScore + tenYScore + corrScore;
    const label = composite >= 3 ? '🟢 RISK-ON' : composite >= 1 ? '🟢 LEAN ON' : composite >= -1 ? '⚪ NEUTRAL' : composite >= -3 ? '🟡 CAUTIOUS' : composite >= -5 ? '🔴 RISK-OFF' : '⛔ STRESS';
    const color = composite >= 1 ? 'var(--green)' : composite >= -1 ? 'var(--t1)' : composite >= -3 ? '#d4892c' : '#ff4d4d';
    $('pbRiskVal').innerHTML = `<span style="color:${color}">${label}</span>`;
    $('pbRiskSub').textContent = `score ${composite >= 0 ? '+' : ''}${composite} · VIX ${!isNaN(vixVal) ? vixVal.toFixed(1) : '—'} · 10Y Δ${tenYDelta != null ? (tenYDelta>=0?'+':'')+Math.round(tenYDelta)+'bp' : '—'} · ρ ${corrVal != null ? Math.round(corrVal*100)+'%' : '—'} · calcul local (Macro nedeschis recent)`;
    } catch (e) {
      $('pbRiskVal').innerHTML = '<span style="color:var(--t3)">⚠ n/a</span>';
      $('pbRiskSub').textContent = 'eroare calcul local: ' + ((e && e.message) || e);
    }
  }

  // ── Evenimente macro azi ──
  // Finnhub /calendar/economic e PREMIUM pe free tier → secțiunea era mereu goală/eroare.
  // Fallback: generatorul hardcoded din Macro Dashboard (FOMC date oficiale + pattern-uri
  // recurente CPI/NFP/PPI/claims/retail/ISM), filtrat pe următoarele 24h, etichetat estimativ.
  // Calendar hardcodat 2026 — sursă unică lib/macro-context.js (I-159)
  function pbEtWall(dateStr, hm){ return (global.MCTX && MCTX.etWall) ? MCTX.etWall(dateStr, hm) : new Date(`${dateStr}T${hm}:00-04:00`); }
  function pbHardcodedEvents(){ return (global.MCTX && MCTX.hardcodedEvents) ? MCTX.hardcodedEvents() : []; }
  function pbRenderHardcoded(){
    const now = Date.now();
    const events = pbHardcodedEvents()
      .filter(e => e.d.getTime() > now - 30*60000 && e.d.getTime() < now + 26*3600000)
      .sort((a, b) => a.d - b.d);
    $('pbCntEvents').textContent = String(events.length);
    if (!events.length){
      $('pbBodyEvents').innerHTML = '<div class="pb-empty">📭 Niciun eveniment US recurent (CPI/NFP/FOMC/claims) în următoarele 24h. <span style="color:var(--t3)">📦 estimativ — calendarul live Finnhub e premium.</span></div>';
      return;
    }
    $('pbBodyEvents').innerHTML = `<table class="pb-table">
      <thead><tr><th>Ora</th><th>Eveniment</th><th>Impact</th></tr></thead>
      <tbody>${events.slice(0, 10).map(e => {
        const til = e.d.getTime() - now;
        const tilStr = til < 0 ? 'PUBLICAT' : (til < 3600000 ? `T-${Math.round(til/60000)}min` : `T-${Math.round(til/3600000)}h`);
        return `<tr>
          <td class="pb-time"><span class="${til < 3600000 && til > 0 ? 't-imm' : ''}">${e.hm} ET (${e.d.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})} RO)</span><span class="t-til">${tilStr}</span></td>
          <td>${escHtml(e.event)}</td>
          <td><span class="pb-chip ${e.impact === 'high' ? 'high' : 'med'}">${e.impact === 'high' ? '🔴 HIGH' : '🟡 MED'}</span></td>
        </tr>`;
      }).join('')}</tbody></table>
      <div style="font-size:10.5px;color:var(--t3);margin-top:5px;font-family:var(--mono)">📅 NFP/CPI/FOMC = date oficiale 2026 (sincron cu Macro) · PPI/claims/retail/ISM = estimative; calendarul live Finnhub e premium</div>`;
  }
  async function pbLoadMacroEvents(){
    const key = getFinnhubKey();
    // flag shared „economic = premium": după primul 403 nu mai încercăm 24h (cheia
    // free n-are endpoint-ul; scutește erori roșii în consolă la fiecare load)
    if (!key || Date.now() < +(localStorage.getItem('fh_econ_403_until') || 0)){ pbRenderHardcoded(); return; }
    try {
      const r = await fetchT(`https://finnhub.io/api/v1/calendar/economic?from=${etToday()}&to=${etPlus(1)}&token=${encodeURIComponent(key)}`);
      if (r.status === 403){ try { localStorage.setItem('fh_econ_403_until', String(Date.now() + 24*3600000)); } catch (e2) {} }
      if (!r.ok) throw new Error('Finnhub eroare');
      const data = await r.json();
      if (!(data?.economicCalendar || []).length){ pbRenderHardcoded(); return; } // premium/gol → estimativ
      const now = Date.now();
      let events = (data?.economicCalendar || []).map(e => ({
        time: (e.time || e.date || '').slice(0,16).replace('T',' '),
        country: (e.country || '').toUpperCase().slice(0,2),
        event: e.event || 'Unknown',
        impact: String(e.impact || '').toLowerCase(),
        forecast: e.estimate ?? e.forecast ?? null,
        previous: e.prev ?? e.previous ?? null,
        actual: e.actual ?? null
      })).filter(e => e.time && e.country === 'US')
        .filter(e => { const t = new Date(e.time.replace(' ', 'T') + 'Z').getTime(); return t > now - 30*60000 && t < now + 26*3600000; })
        .sort((a,b) => a.time.localeCompare(b.time));
      $('pbCntEvents').textContent = String(events.length);
      if (!events.length){ $('pbBodyEvents').innerHTML = '<div class="pb-empty">📭 Niciun eveniment US azi.</div>'; return; }
      $('pbBodyEvents').innerHTML = `<table class="pb-table">
        <thead><tr><th>Ora</th><th>Eveniment</th><th>Impact</th><th>Forecast</th><th>Prev</th><th>Actual</th></tr></thead>
        <tbody>${events.slice(0, 10).map(e => {
          const t = new Date(e.time.replace(' ', 'T') + 'Z');
          const til = t.getTime() - now;
          const tilStr = til < 0 ? 'PUBLICAT' : (til < 3600000 ? `T-${Math.round(til/60000)}min` : `T-${Math.round(til/3600000)}h`);
          return `<tr>
            <td class="pb-time"><span class="${til < 3600000 && til > 0 ? 't-imm' : ''}">${t.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})}</span><span class="t-til">${tilStr}</span></td>
            <td>${escHtml(e.event)}</td>
            <td><span class="pb-chip ${e.impact === 'high' ? 'high' : (e.impact === 'med' || e.impact === 'medium' ? 'med' : 'low')}">${e.impact === 'high' ? '🔴 HIGH' : (e.impact === 'med' || e.impact === 'medium' ? '🟡 MED' : '⚪ LOW')}</span></td>
            <td>${escHtml(e.forecast ?? '—')}</td>
            <td>${escHtml(e.previous ?? '—')}</td>
            <td>${e.actual != null ? `<b>${escHtml(String(e.actual))}</b>` : '—'}</td>
          </tr>`;
        }).join('')}</tbody></table>`;
    } catch (e) {
      pbRenderHardcoded(); // Finnhub picat/premium → mai bine estimativ decât eroare seacă
    }
  }

  // ── Earnings next 7 zile (watchlist + mega-caps) ──
  // fereastra veche azi/mâine × watchlist+12 mega-caps = gol aproape mereu în afara
  // sezonului de earnings; 7 zile = aproape mereu ai ce vedea, ordinea ⭐ întâi rămâne
  async function pbLoadEarnings(){
    const key = getFinnhubKey();
    const wl = new Set(getWatchlist().map(t => t.toUpperCase()));
    if (!key){ $('pbBodyEarnings').innerHTML = '<div class="pb-empty">⚠ Cheia Finnhub lipsește.</div>'; $('pbCntEarnings').textContent = '0'; return; }
    try {
      const r = await fetchT(`https://finnhub.io/api/v1/calendar/earnings?from=${etToday()}&to=${etPlus(7)}&token=${encodeURIComponent(key)}`);
      if (!r.ok) throw new Error('Finnhub eroare');
      const data = await r.json();
      const MEGAS = new Set(['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','AVGO','JPM','WMT','XOM','UNH']);
      const all = (data?.earningsCalendar || []).map(e => ({
        symbol: (e.symbol || '').toUpperCase(), date: (e.date || '').slice(0,10), hour: e.hour || '—',
        epsEst: e.epsEstimate, revEst: e.revenueEstimate, inWatchlist: wl.has((e.symbol || '').toUpperCase())
      }));
      let earnings = all.filter(e => e.inWatchlist || MEGAS.has(e.symbol));
      // în afara sezonului watchlist+megas e aproape gol → completează cu cele mai
      // NOTABILE raportări din fereastră (proxy onest: revenue estimate descrescător —
      // prinde ORCL/ADBE/LEN etc. care nu-s printre cele 12 megas)
      if (earnings.length < 5){
        const seen = new Set(earnings.map(e => e.symbol));
        const notable = all
          .filter(e => !seen.has(e.symbol) && e.revEst != null && e.revEst > 0 && e.symbol && !e.symbol.includes('.'))
          .sort((a, b) => b.revEst - a.revEst)
          .slice(0, 8 - earnings.length)
          .map(e => ({ ...e, notable: true }));
        earnings = earnings.concat(notable);
      }
      earnings.sort((a,b) => (a.inWatchlist === b.inWatchlist ? 0 : (a.inWatchlist ? -1 : 1)) || a.date.localeCompare(b.date));
      $('pbCntEarnings').textContent = String(earnings.length);
      if (!earnings.length){ $('pbBodyEarnings').innerHTML = '<div class="pb-empty">📭 Niciun earnings din watchlist sau mega-caps în următoarele 7 zile.</div>'; return; }
      $('pbBodyEarnings').innerHTML = `<table class="pb-table">
        <thead><tr><th>Ticker</th><th>Data</th><th>Ora</th><th>EPS Est</th><th>Watchlist</th></tr></thead>
        <tbody>${earnings.slice(0, 12).map(e => `<tr>
          <td class="sym"><a href="https://www.tradingview.com/chart/?symbol=NASDAQ:${escHtml(e.symbol)}" target="_blank">${escHtml(e.symbol)}</a></td>
          <td>${e.date === etToday() ? '<span class="pb-chip med">🔔 AZI</span> ' : ''}${escHtml(e.date)}</td>
          <td>${e.hour === 'bmo' ? '🌅 BMO' : (e.hour === 'amc' ? '🌙 AMC' : escHtml(e.hour))}</td>
          <td>${e.epsEst != null ? '$' + Number(e.epsEst).toFixed(2) : '—'}</td>
          <td>${e.inWatchlist ? '<span class="pb-chip bull">⭐ DA</span>' : (e.notable ? '<span class="pb-chip med">📰 notabil</span>' : '<span class="pb-chip low">mega-cap</span>')}</td>
        </tr>`).join('')}</tbody></table>`;
    } catch (e) {
      $('pbBodyEarnings').innerHTML = `<div class="pb-empty">⚠ Eroare: ${escHtml(e.message)}</div>`;
    }
  }

  // ── Watchlist events 14-30z (earnings + dividends + splits + presentations) ──
  const WL_EVENTS_CACHE_KEY = 'pb_wl_events_cache_v1';
  async function pbLoadWlEvents(){
    const wl = getWatchlist();
    if (!wl.length){ $('pbBodyWlEvents').innerHTML = '<div class="pb-empty">📭 Watchlist gol.</div>'; $('pbCntWlEvents').textContent = '0'; return; }
    const key = getFinnhubKey();
    if (!key){ $('pbBodyWlEvents').innerHTML = '<div class="pb-empty">⚠ Cheia Finnhub lipsește.</div>'; $('pbCntWlEvents').textContent = '0'; return; }
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(WL_EVENTS_CACHE_KEY) || 'null'); } catch (e) {}
    const wlKey = wl.slice().sort().join(',');
    if (cached && cached.wlKey === wlKey && Date.now() - cached.ts < 6*3600*1000){ pbRenderWlEvents(cached.events); return; }
    const today = etToday(), in14 = etPlus(14), in30 = etPlus(30);
    const wlUpper = wl.map(t => t.toUpperCase()), wlSet = new Set(wlUpper);
    try {
      const earningsResp = await fetchT(`https://finnhub.io/api/v1/calendar/earnings?from=${today}&to=${in14}&token=${encodeURIComponent(key)}`);
      let earnings = [];
      if (earningsResp.ok){
        const d = await earningsResp.json();
        earnings = (d?.earningsCalendar || []).filter(e => wlSet.has((e.symbol || '').toUpperCase()));
      }
      const tickers = wlUpper.slice(0, 20);
      const fetchPer = (mk) => tickers.map(async t => { try { return await mk(t); } catch (e) { return []; } });
      const divPromises = fetchPer(async t => {
        const r = await fetchT(`https://finnhub.io/api/v1/stock/dividend2?symbol=${encodeURIComponent(t)}&from=${today}&to=${in30}&token=${encodeURIComponent(key)}`);
        if (!r.ok) return [];
        const d = await r.json();
        return (d?.data || (Array.isArray(d) ? d : [])).map(x => ({ symbol: t, ...x }));
      });
      const splitPromises = fetchPer(async t => {
        const r = await fetchT(`https://finnhub.io/api/v1/stock/split?symbol=${encodeURIComponent(t)}&from=${today}&to=${in30}&token=${encodeURIComponent(key)}`);
        if (!r.ok) return [];
        const d = await r.json();
        return (Array.isArray(d) ? d : []).map(x => ({ symbol: t, ...x }));
      });
      const PRES_KW = /\b(conference|investor day|analyst day|presents at|presenting at|keynote|shareholder meeting|product launch|investor briefing|investor update|fireside chat|webcast|analyst meeting|annual meeting|investor presentation|to present)\b/i;
      const newsFrom = etPlus(-7);
      const presPromises = fetchPer(async t => {
        const r = await fetchT(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(t)}&from=${newsFrom}&to=${today}&token=${encodeURIComponent(key)}`);
        if (!r.ok) return [];
        const list = await r.json();
        if (!Array.isArray(list)) return [];
        const seen = new Set(), out = [];
        for (const n of list.filter(n => PRES_KW.test(n.headline || ''))){
          const k = (n.headline || '').slice(0, 50).toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          out.push({ symbol: t, headline: n.headline, url: n.url, datetime: n.datetime, source: n.source });
          if (out.length >= 2) break;
        }
        return out;
      });
      const [divR, splitR, presR] = await Promise.all([Promise.all(divPromises), Promise.all(splitPromises), Promise.all(presPromises)]);
      const events = [
        ...earnings.map(e => ({ type:'earnings', date: e.date, symbol: (e.symbol||'').toUpperCase(), hour: e.hour, epsEst: e.epsEstimate })),
        ...divR.flat().map(d => ({ type:'dividend', date: d.date || d.exDate || d.payDate, symbol: d.symbol, amount: d.amount, freq: d.freq, payDate: d.payDate })).filter(d => d.date && d.date >= today && d.date <= in30),
        ...splitR.flat().map(s => ({ type:'split', date: s.date, symbol: s.symbol, ratio: (s.toFactor && s.fromFactor) ? `${s.toFactor}-for-${s.fromFactor}` : (s.ratio || '—') })).filter(s => s.date && s.date >= today && s.date <= in30),
        ...presR.flat().map(p => ({ type:'presentation', date: new Date((p.datetime || 0) * 1000).toISOString().slice(0,10), symbol: p.symbol, headline: p.headline, url: p.url, source: p.source }))
      ].sort((a,b) => a.date.localeCompare(b.date));
      try { localStorage.setItem(WL_EVENTS_CACHE_KEY, JSON.stringify({ ts: Date.now(), wlKey, events })); } catch (e) {}
      pbRenderWlEvents(events);
    } catch (e) {
      $('pbBodyWlEvents').innerHTML = `<div class="pb-empty">⚠ Eroare fetch: ${escHtml(e.message)}</div>`;
    }
  }
  function pbRenderWlEvents(events){
    const today = etToday();
    // DOAR azi → viitor (cerut explicit de Marius): „presentations" vin din știri cu
    // data PUBLICĂRII (trecut) → afișate doar dacă-s de azi; filtrul se aplică la
    // render ca să curețe și cache-ul vechi de 6h, nu doar fetch-urile noi
    events = (events || []).filter(e => e.date && e.date >= today);
    $('pbCntWlEvents').textContent = String(events.length);
    if (!events.length){ $('pbBodyWlEvents').innerHTML = '<div class="pb-empty">📭 Niciun event VIITOR programat 14-30 zile pentru watchlist.</div>'; return; }
    const fmtDate = d => {
      const days = Math.round((new Date(d + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
      const dStr = new Date(d + 'T00:00:00Z').toLocaleDateString('ro-RO', { day:'2-digit', month:'short', weekday:'short' });
      const til = days === 0 ? '<b style="color:#ff4d4d">AZI</b>' : days === 1 ? '<b style="color:#d4892c">MÂINE</b>' : days < 0 ? `acum ${-days}z` : days <= 7 ? `T-${days}z` : `${days}z`;
      return { dStr, til };
    };
    $('pbBodyWlEvents').innerHTML = `<table class="pb-table">
      <thead><tr><th>Data</th><th>Ticker</th><th>Tip</th><th>Detalii</th></tr></thead>
      <tbody>${events.slice(0, 20).map(e => {
        const dt = fmtDate(e.date);
        let typeChip = '', details = '';
        if (e.type === 'earnings'){
          typeChip = '<span class="pb-chip warn">💰 Earnings</span>';
          const hour = e.hour === 'bmo' ? '🌅 BMO' : (e.hour === 'amc' ? '🌙 AMC' : escHtml(e.hour || ''));
          details = `${hour}${e.epsEst != null ? ' · EPS est <b>$' + Number(e.epsEst).toFixed(2) + '</b>' : ''}`;
        } else if (e.type === 'dividend'){
          typeChip = '<span class="pb-chip bull">💵 Dividend</span>';
          details = `ex-date · <b>${e.amount != null ? '$' + Number(e.amount).toFixed(3) + '/share' : '—'}</b>${e.freq ? ' · ' + escHtml(String(e.freq)) : ''}${e.payDate ? ' · pay ' + escHtml(e.payDate) : ''}`;
        } else if (e.type === 'split'){
          typeChip = '<span class="pb-chip high">✂ Split</span>';
          details = `ratio <b>${escHtml(e.ratio)}</b>`;
        } else if (e.type === 'presentation'){
          typeChip = '<span class="pb-chip med">🎤 Presentation</span>';
          const headline = (e.headline || '').length > 75 ? e.headline.slice(0, 75) + '…' : (e.headline || '');
          details = e.url ? `<a href="${escHtml(e.url)}" target="_blank" rel="noopener" style="color:var(--t1);text-decoration:none" title="${escHtml(e.headline || '')}">${escHtml(headline)}</a>${e.source ? ' · <span style="color:var(--t3)">' + escHtml(e.source) + '</span>' : ''}` : escHtml(headline);
        }
        return `<tr>
          <td class="pb-time"><span>${dt.dStr}</span><span class="t-til">${dt.til}</span></td>
          <td class="sym"><a href="https://www.tradingview.com/chart/?symbol=NASDAQ:${escHtml(e.symbol)}" target="_blank">${escHtml(e.symbol)}</a></td>
          <td>${typeChip}</td>
          <td style="font-size:11.5px">${details}</td>
        </tr>`;
      }).join('')}</tbody></table>
      <div style="font-size:10.5px;color:var(--t3);margin-top:6px;text-align:right;font-family:var(--mono)">cache 6h · primele 20 entries</div>`;
  }

  // ── Top picks: nasdaq_last_scan dacă e fresh; altfel semnalele LIVE din restul
  //    suitei (READY/OK din scanul de listă STL + ultimele intrări Signal Ledger) ──
  function pbPicksFallback(){
    let stl = {};
    try { stl = JSON.parse(localStorage.getItem('stl_list_state') || '{}'); } catch (e) {}
    const stlHot = Object.entries(stl)
      .filter(([, v]) => v && (v.tier === 'READY' || v.tier === 'OK') && Date.now() - (v.ts || 0) < 24*3600000)
      .sort((a, b) => (a[1].tier === 'READY' ? 0 : 1) - (b[1].tier === 'READY' ? 0 : 1)).slice(0, 10);
    const led = (window.LEDGER ? LEDGER.all() : []).slice(-5).reverse();
    if (!stlHot.length && !led.length) return null;
    const SRC = { 'wlm-strongbuy': '👁 WLM', 'me-early': '🌱 Events', 'stl-ready': '🎯 STL', 'nasdaq-opp80': '🚀 Nasdaq' };
    let html = '';
    if (stlHot.length) html += `<div style="margin-bottom:7px"><span style="font-size:10.5px;color:var(--t3);font-family:var(--mono)">🎯 Smart Trade Long — scan listă &lt;24h:</span><div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px">${stlHot.map(([s, v]) => `<span class="pb-chip ${v.tier === 'READY' ? 'bull' : 'med'}">${escHtml(s)} ${v.tier === 'READY' ? '🚀 READY' : '🟢 OK'}</span>`).join('')}</div></div>`;
    if (led.length) html += `<div><span style="font-size:10.5px;color:var(--t3);font-family:var(--mono)">📒 ultimele semnale consemnate (Signal Ledger):</span>${led.map(e => `<div style="font-size:11.5px;padding:3px 0;border-bottom:1px solid rgba(42,50,71,.4)">${SRC[e.src] || escHtml(e.src)} · <b>${escHtml(e.sym)}</b> @ $${fmtNum(e.price)} <span style="color:var(--t3);font-family:var(--mono)">${escHtml(e.day)}</span></div>`).join('')}</div>`;
    return { html, n: stlHot.length + led.length };
  }
  function pbLoadNasdaqPicks(){
    let scan = null;
    try { scan = JSON.parse(localStorage.getItem('nasdaq_last_scan') || 'null'); } catch (e) {}
    const ageMin = scan ? Math.round((Date.now() - (scan.timestamp || 0)) / 60000) : null;
    const ops = (scan && scan.opportunities ? scan.opportunities : []).filter(o => o.score >= 65).slice(0, 8);
    if (!ops.length || ageMin == null || ageMin > 24*60){
      // scan lipsă/vechi >24h (ar induce în eroare) → arată ce ȘTIE deja restul suitei
      const fb = pbPicksFallback();
      const note = ageMin != null ? `ultimul scan nasdaq: acum ${ageMin < 60 ? ageMin + 'min' : Math.round(ageMin/60) + 'h'}` : 'niciun scan nasdaq recent';
      if (fb){
        $('pbCntNasdaq').textContent = String(fb.n);
        $('pbBodyNasdaq').innerHTML = `<div style="font-size:10.5px;color:var(--t3);margin-bottom:6px;font-family:var(--mono)">${note} — mai jos: semnalele live din restul suitei</div>` + fb.html;
      } else {
        $('pbCntNasdaq').textContent = '0';
        $('pbBodyNasdaq').innerHTML = `<div class="pb-empty">📭 ${note} și niciun semnal în suite — rulează un scan în <a href="./nasdaq-scanner/" style="color:#5bb0ff">Nasdaq Scanner</a> sau lasă <a href="./smart-trade-long/" style="color:#5bb0ff">Smart Trade Long</a> deschis (scan listă automat).</div>`;
      }
      return;
    }
    $('pbCntNasdaq').textContent = String(ops.length);
    $('pbBodyNasdaq').innerHTML = `<div style="font-size:10.5px;color:var(--t3);margin-bottom:5px;font-family:var(--mono)">scan acum ${ageMin < 60 ? ageMin + 'min' : Math.round(ageMin/60) + 'h'} · top 8 cu score ≥65</div>
      <table class="pb-table">
        <thead><tr><th>Ticker</th><th>Score</th><th>Type</th><th>Preț</th><th>Chg 24h</th><th>RSI</th></tr></thead>
        <tbody>${ops.map(o => `<tr>
          <td class="sym"><a href="https://www.tradingview.com/chart/?symbol=NASDAQ:${escHtml(o.symbol)}" target="_blank">${escHtml(o.symbol)}</a></td>
          <td><b style="color:${o.score >= 80 ? 'var(--green)' : (o.score >= 70 ? '#5bb0ff' : '#d4892c')}">${o.score}</b></td>
          <td>${o.isBuy ? '<span class="pb-chip bull">BUY</span>' : '<span class="pb-chip bear">SHORT</span>'}</td>
          <td>$${fmtNum(o.price)}</td>
          <td class="${(o.chg24 ?? 0) >= 0 ? 'pos' : 'neg'}">${fmtPct(o.chg24)}</td>
          <td>${o.rsi != null ? Math.round(o.rsi) : '—'}</td>
        </tr>`).join('')}</tbody></table>`;
  }

  // ── Radar Smart Trade Long — longs READY/OK azi (mereu vizibil, nu doar fallback) ──
  // Sursă: stl_list_state (tier curent) îmbogățit cu score/preț din stl_scan_history (ultima intrare)
  function pbLoadSTL(){
    const body = $('pbBodySTL');
    if (!body) return;
    let state = {}, hist = {};
    try { state = JSON.parse(localStorage.getItem('stl_list_state') || '{}'); } catch (e) {}
    try { hist = JSON.parse(localStorage.getItem('stl_scan_history') || '{}'); } catch (e) {}
    const now = Date.now();
    const hot = Object.entries(state)
      .filter(([s, v]) => s !== '_mode' && v && (v.tier === 'READY' || v.tier === 'OK') && now - (v.ts || 0) < 24*3600000)
      .map(([sym, v]) => {
        const arr = Array.isArray(hist[sym]) ? hist[sym] : [];
        const h = arr.length ? arr[arr.length - 1] : null;
        return { sym, tier: v.tier, score: h && typeof h.score === 'number' ? h.score : null, price: h && typeof h.price === 'number' ? h.price : null };
      })
      .sort((a, b) => (a.tier === 'READY' ? 0 : 1) - (b.tier === 'READY' ? 0 : 1) || (b.score || 0) - (a.score || 0))
      .slice(0, 12);
    $('pbCntSTL').textContent = String(hot.length);
    if (!hot.length){
      body.innerHTML = '<div class="pb-empty">📭 Niciun long READY/OK din STL (&lt;24h). Lasă <a href="./smart-trade-long/" style="color:#5bb0ff">Smart Trade Long</a> deschis (scan listă auto).</div>';
      return;
    }
    body.innerHTML = `<table class="pb-table">
      <thead><tr><th>Ticker</th><th>Verdict</th><th>Score</th><th>Preț</th></tr></thead>
      <tbody>${hot.map(h => `<tr>
        <td class="sym"><a href="./smart-trade-long/?symbol=${encodeURIComponent(h.sym)}" target="_blank">${escHtml(h.sym)}</a></td>
        <td>${h.tier === 'READY' ? '<span class="pb-chip bull">🚀 READY</span>' : '<span class="pb-chip med">🟢 OK</span>'}</td>
        <td>${h.score != null ? '<b>' + h.score + '</b>' : '—'}</td>
        <td>${h.price != null ? '$' + fmtNum(h.price) : '—'}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  // ── Sugestii watchlist (din macro-dashboard auto-suggest) ──
  function pbLoadSuggestions(){
    let sg = {};
    try { sg = JSON.parse(localStorage.getItem('md_wl_suggestions') || '{}'); } catch (e) {}
    const now = Date.now();
    const active = Object.values(sg).filter(s => s && !s.dismissed && (now - (s.ts || 0) < 24*3600000) && s.tickers && s.tickers.some(t => !(s.added || []).includes(t)));
    $('pbCntSuggestions').textContent = String(active.length);
    if (!active.length){ $('pbBodySuggestions').innerHTML = '<div class="pb-empty">📭 Nicio sugestie activă (apar la rezultate macro cu surprise ≥2.5%).</div>'; return; }
    $('pbBodySuggestions').innerHTML = active.map(s => {
      const remaining = s.tickers.filter(t => !(s.added || []).includes(t));
      const surpStr = (s.surprise != null) ? `${s.surprise>=0?'+':''}${s.surprise.toFixed(2)}%` : '';
      const bias = s.bias === 'bullish' ? '🟢 Bullish' : (s.bias === 'bearish' ? '🔴 Bearish' : '⚪ Neutral');
      return `<div style="padding:7px 0;border-bottom:1px solid rgba(42,50,71,.5)">
        <div style="font-weight:700;font-size:12.5px;margin-bottom:4px">${escHtml(s.eventName)} · ${bias} <span style="font-family:var(--mono);font-size:11px;color:var(--t2)">${surpStr}</span></div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">${remaining.map(t => `<span class="pb-chip warn">+ ${escHtml(t)}</span>`).join('')}</div>
      </div>`;
    }).join('');
  }

  // Data ET de azi — delegat la MC.todayET când macro-context e încărcat
  function pbTodayET(){ return (global.MCTX && MCTX.todayET) ? MCTX.todayET() : etToday(); }

  // Danger Score al zilei — refolosește md_danger_daily (scris de macro-dashboard)
  function pbLoadDanger(){
    try {
      const h = JSON.parse(localStorage.getItem('md_danger_daily') || '[]');
      if (!Array.isArray(h) || !h.length){
        $('pbDangerVal').innerHTML = '<span style="color:var(--t3)">⚠️ Danger n/a</span>';
        $('pbDangerSub').innerHTML = 'deschide <a href="./macro-dashboard/" style="color:#5bb0ff">Macro</a> ca să se calculeze Danger Score-ul';
        return;
      }
      const last = h[h.length - 1];
      const s = last.score;
      if (typeof s !== 'number'){
        $('pbDangerVal').innerHTML = '<span style="color:var(--t3)">⚠️ n/a</span>';
        $('pbDangerSub').textContent = '';
        return;
      }
      const color = s >= 70 ? '#ff4d4d' : s >= 45 ? '#d4892c' : 'var(--green)';
      const band = s >= 70 ? 'PERICULOS · sizing 0.25-0.5x' : s >= 45 ? 'RIDICAT · 0.5x' : s >= 25 ? 'MODERAT · 0.75x' : 'CALM · 1x';
      $('pbDangerVal').innerHTML = `<span style="color:${color}">⚠️ ${s}/100</span>`;
      const stale = last.dateET && pbTodayET() && last.dateET !== pbTodayET();
      $('pbDangerSub').innerHTML = band + (stale ? ` · <span style="color:var(--t3)">📦 din ${escHtml(String(last.dateET))}</span>` : '');
    } catch (e) {
      $('pbDangerVal').innerHTML = '<span style="color:var(--t3)">⚠️ n/a</span>';
      $('pbDangerSub').textContent = '';
    }
  }

  // Rând-erou: verdictul zilei = regim + danger + eveniment macro high-impact azi
  function pbRenderHero(){
    const el = $('pbHero');
    if (!el) return;
    const rc = l => /RISK-ON|LEAN/.test(l) ? 'var(--green)' : /NEUTRAL/.test(l) ? 'var(--t1)' : /CAUTIOUS/.test(l) ? '#d4892c' : /RISK-OFF|STRESS/.test(l) ? '#ff4d4d' : 'var(--t2)';
    const re = l => /RISK-ON|LEAN/.test(l) ? '🟢' : /NEUTRAL/.test(l) ? '⚪' : /CAUTIOUS/.test(l) ? '🟠' : /RISK-OFF|STRESS/.test(l) ? '🔴' : '⚪';
    // regim — cu prospetime (aceeasi conventie 6h ca regime.js/pbLoadRisk);
    // fara marcaj, hero-ul prezenta luni regimul de vineri ca verdictul de AZI
    let regLabel = '', regStale = false;
    try {
      const r = JSON.parse(localStorage.getItem('md_risk_regime') || 'null');
      if (r && r.label){ regLabel = String(r.label).trim(); regStale = Date.now() - (r.ts || 0) > 6*3600000; }
    } catch (e) {}
    // streak: de câte zile consemnate ține regimul curent (md_regime_daily, snapshot zilnic din macro).
    // Numără intrări consecutive de la coadă cu același label — zilele în care macro n-a rulat lipsesc,
    // deci e „zile consemnate", nu calendaristice (suficient de onest pt context).
    let regStreak = 0;
    try {
      const rh = JSON.parse(localStorage.getItem('md_regime_daily') || '[]');
      if (regLabel && Array.isArray(rh)) for (let i = rh.length - 1; i >= 0; i--){ if (rh[i] && rh[i].label === regLabel) regStreak++; else break; }
    } catch (e) {}
    // danger — cu prospetime pe dateET (pbLoadDanger o verifica deja; hero nu)
    let dngPhrase = '', dngScore = null, dngStale = false, dngDate = '';
    try {
      const h = JSON.parse(localStorage.getItem('md_danger_daily') || '[]');
      if (Array.isArray(h) && h.length && typeof h[h.length-1].score === 'number'){
        const last = h[h.length-1];
        const s = last.score;
        dngScore = s;
        dngStale = !!(last.dateET && pbTodayET() && last.dateET !== pbTodayET());
        dngDate = last.dateET || '';
        const band = s >= 70 ? 'PERICULOS · 0.25-0.5x' : s >= 45 ? 'RIDICAT · 0.5x' : s >= 25 ? 'MODERAT · 0.75x' : 'CALM · 1x';
        dngPhrase = `Danger ${s}/100 (${band})` + (dngStale ? ` 📦 din ${dngDate}` : '');
      }
    } catch (e) {}
    // eveniment macro high-impact azi
    const etDateOf = dt => { try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(dt); } catch (e) { return ''; } };
    const today = pbTodayET();
    let bigToday = [];
    try { bigToday = pbHardcodedEvents().filter(e => e.impact === 'high' && etDateOf(e.d) === today).sort((a, b) => a.d - b.d); } catch (e) {}
    let evPhrase;
    if (bigToday.length){
      const e0 = bigToday[0];
      const roT = e0.d.toLocaleTimeString('ro-RO', { hour:'2-digit', minute:'2-digit' });
      evPhrase = `📅 azi: ${escHtml(e0.event)} — ${e0.hm} ET (${roT} RO)` + (bigToday.length > 1 ? ` · +${bigToday.length - 1} eveniment(e)` : '');
    } else {
      evPhrase = '📅 azi fără evenimente macro high-impact recurente (CPI/NFP/FOMC)';
    }
    // compune verdict
    const parts = [];
    parts.push(regLabel
      ? `<span style="color:${rc(regLabel)}">${re(regLabel)} ${escHtml(regLabel)}</span>${regStale ? ' <span style="color:var(--t3);font-weight:400;font-size:12px">📦 vechi</span>' : ''}${regStreak >= 2 ? ` <span style="color:var(--t3);font-weight:400;font-size:12px">(ziua ${regStreak})</span>` : ''}`
      : '<span style="color:var(--t3)">⚪ regim n/a</span>');
    if (dngPhrase) parts.push(`<span class="pb-hero-danger">${escHtml(dngPhrase)}</span>`);
    const tone = pbMarketTone();
    if (tone) parts.push(`<span style="color:${tone.cls === 'up' ? 'var(--green)' : tone.cls === 'down' ? 'var(--red)' : 'var(--t2)'}">${tone.tone}</span>`);
    el.querySelector('.pb-hero-verdict').innerHTML = parts.join('<span class="pb-hero-dot">·</span>');
    // rând acțional — consecința concretă pe azi (starea e degeaba fără „și deci ce fac?")
    const act = [];
    if (dngScore != null){
      const mult = dngScore >= 70 ? '0.25-0.5x' : dngScore >= 45 ? '0.5x' : dngScore >= 25 ? '0.75x' : '1x';
      // sizing pe danger stale NU se prezinta ca "AZI" fara marcaj — deschide Macro intai
      act.push(`sizing ${mult}` + (dngStale ? ` (📦 din ${dngDate} — redeschide Macro)` : ''));
    }
    if (bigToday.length){
      const roT0 = bigToday[0].d.toLocaleTimeString('ro-RO', { hour:'2-digit', minute:'2-digit' });
      act.push(`fără intrări noi ±15min de ${roT0} RO`);
    }
    el.querySelector('.pb-hero-sub').innerHTML = evPhrase
      + (act.length ? `<br><span style="color:var(--crypto-2);font-weight:700">→ AZI: ${act.join(' · ')}</span>` : '');
  }

  // Piața acum — OGLINDEȘTE window.__hubMkt (banda de sus e sursa de fetch; zero fetch dublu)
  function pbMktData(){ try { return window.__hubMkt || null; } catch (e) { return null; } }
  function pbMarketTone(){
    const m = pbMktData();
    if (!m || !m.quotes) return null;
    const spy = m.quotes.SPY, qqq = m.quotes.QQQ, vix = m.quotes.VIX;
    const pair = [spy, qqq].filter(Boolean);
    if (!pair.length) return null;
    const avg = pair.reduce((s, q) => s + q.chgPct, 0) / pair.length;
    let tone, cls;
    if (avg >= 0.3){ tone = 'tape ferm 🟢'; cls = 'up'; }
    else if (avg <= -0.3){ tone = 'tape slab 🔴'; cls = 'down'; }
    else { tone = 'tape mixt ⚪'; cls = ''; }
    let vixNote = '';
    if (vix){ vixNote = vix.price >= 25 ? ' · VIX ridicat (frică)' : vix.price >= 18 ? ' · VIX moderat' : ' · VIX calm'; }
    return { avg, tone, cls, vixNote };
  }
  function pbRenderMarket(){
    const box = $('pbBodyMkt');
    if (!box) return;
    const m = pbMktData();
    const q = (m && m.quotes) ? m.quotes : {};
    if (!(q.SPY || q.QQQ || q.VIX)){ box.innerHTML = '<div class="pb-loading">SPY · QQQ · VIX… (banda de sus încă încarcă)</div>'; return; }
    const dl = (m && m.dayLabel) || '';
    const fp = p => p >= 1000 ? '$' + p.toLocaleString('en', { maximumFractionDigits: 0 }) : '$' + p.toFixed(2);
    const fv = p => p.toFixed(2);
    const cell = (lbl, quote, fmt, invert) => {
      if (!quote) return `<div class="pb-mkt-cell"><div class="pb-mkt-lbl">${lbl}</div><div class="pb-mkt-val">—</div><div class="pb-mkt-chg">n/a</div></div>`;
      const up = quote.chgPct >= 0;
      const cls = invert ? (up ? 'down' : 'up') : (up ? 'up' : 'down'); // VIX = semantică inversă
      return `<div class="pb-mkt-cell"><div class="pb-mkt-lbl">${lbl}</div><div class="pb-mkt-val">${fmt(quote.price)}</div><div class="pb-mkt-chg ${cls}">${up ? '+' : ''}${quote.chgPct.toFixed(2)}${dl}</div></div>`;
    };
    const tone = pbMarketTone();
    box.innerHTML = cell('SPY', q.SPY, fp, false) + cell('QQQ', q.QQQ, fp, false) + cell('VIX', q.VIX, fv, true)
      + (tone ? `<div class="pb-mkt-tone">🌡️ ${tone.tone}${tone.vixNote}</div>` : '');
    if (m && m.session){
      const sess = m.session === 'pre' ? '🌅 PRE' : m.session === 'rth' ? '🟢 RTH' : m.session === 'after' ? '🌙 AFTER' : m.session === 'weekend' ? 'WEEKEND' : '🌙 CLOSED';
      $('pbMktSess').textContent = sess;
    }
  }

  // Fereastră freeze — high-impact iminent (±15min = nu deschide poziții; până în 2h = countdown catalist)
  function pbRenderFreeze(){
    const el = $('pbFreeze');
    if (!el) return;
    let events = [];
    try { events = pbHardcodedEvents().filter(e => e.impact === 'high'); } catch (e) {}
    const now = Date.now();
    const upcoming = events.filter(e => e.d.getTime() > now - 15*60000).sort((a, b) => a.d - b.d);
    const next = upcoming[0];
    if (!next){ el.style.display = 'none'; return; }
    const til = next.d.getTime() - now; // ms (poate fi negativ = publicat recent)
    const roT = next.d.toLocaleTimeString('ro-RO', { hour:'2-digit', minute:'2-digit' });
    if (til <= 15*60000 && til >= -15*60000){
      const when = til >= 0 ? `în ${Math.max(1, Math.round(til/60000))} min` : `acum ${Math.round(-til/60000)} min`;
      el.className = 'pb-freeze red';
      el.innerHTML = `🚫 <b>FREEZE</b> — ${escHtml(next.event)} ${when} (${next.hm} ET / ${roT} RO). Nu deschide poziții noi până se așează volatilitatea.`;
      el.style.display = '';
    } else if (til > 15*60000 && til <= 2*3600000){
      const h = Math.floor(til/3600000), mn = Math.round((til % 3600000)/60000);
      const cd = h > 0 ? `${h}h ${mn}min` : `${mn}min`;
      el.className = 'pb-freeze amber';
      el.innerHTML = `⏳ Catalist în <b>${cd}</b>: ${escHtml(next.event)} (${next.hm} ET / ${roT} RO). Pregătește planul; freeze la ±15min.`;
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  }

  // Sector rotation — oglindește ultimul scan (sr_last_scan) + regimul de rotație (tt_risk_regime)
  function pbLoadSector(){
    const body = $('pbBodySector');
    if (!body) return;
    let scan = null, reg = null;
    try { scan = JSON.parse(localStorage.getItem('sr_last_scan') || 'null'); } catch (e) {}
    try { reg = JSON.parse(localStorage.getItem('tt_risk_regime') || 'null'); } catch (e) {}
    if (!scan || !Array.isArray(scan.data) || !scan.data.length){
      $('pbCntSector').textContent = '0';
      body.innerHTML = '<div class="pb-empty">📭 Niciun scan sectorial salvat. Deschide <a href="./sector-rotation/" style="color:#5bb0ff">Sector Rotation</a> ca să se populeze.</div>';
      return;
    }
    const rows = scan.data.filter(d => typeof d.rsRatio === 'number');
    if (!rows.length){
      $('pbCntSector').textContent = '0';
      body.innerHTML = '<div class="pb-empty">📭 Scan sectorial fără RS valid — redeschide Sector Rotation.</div>';
      return;
    }
    const byRs = [...rows].sort((a, b) => (b.rsRatio || 0) - (a.rsRatio || 0));
    const leaders = byRs.slice(0, 4);
    const laggards = byRs.slice(-2).reverse();
    $('pbCntSector').textContent = String(rows.length);
    const ageH = scan.ts ? (Date.now() - scan.ts) / 3600000 : null;
    const stale = ageH != null && ageH > 12;
    let regHtml = '';
    if (reg && reg.regime){
      const spread = typeof reg.spread === 'number' ? `${reg.spread >= 0 ? '+' : ''}${reg.spread}%` : '';
      const rl = String(reg.regime);
      const chipCls = /ON/i.test(rl) ? 'bull' : /OFF/i.test(rl) ? 'high' : 'med';
      regHtml = `<div class="pb-sect-regime"><span class="pb-chip ${chipCls}">Rotație ${escHtml(rl)}</span> <span style="color:var(--t3);font-family:var(--mono);font-size:10.5px">cyc−def ${escHtml(spread)}</span></div>`;
    }
    const chip = d => {
      const rs = typeof d.rsRatio === 'number' ? d.rsRatio.toFixed(1) : '—';
      const w = typeof d.chg1w === 'number' ? `${d.chg1w >= 0 ? '+' : ''}${d.chg1w.toFixed(1)}%` : '';
      const cls = (d.chg1w || 0) >= 0 ? 'up' : 'down';
      return `<div class="pb-sect-cell"><a href="./sector-rotation/" class="pb-sect-sym">${escHtml(d.sym || d.name || '?')}</a><span class="pb-sect-rs">RS ${rs}</span><span class="pb-mkt-chg ${cls}">${w}</span></div>`;
    };
    body.innerHTML = regHtml
      + `<div class="pb-sect-grp">👑 LIDERI (RS vs SPY)</div><div class="pb-sect-row">${leaders.map(chip).join('')}</div>`
      + `<div class="pb-sect-grp">🐌 CODAȘI</div><div class="pb-sect-row">${laggards.map(chip).join('')}</div>`
      + (stale ? `<div style="font-family:var(--mono);font-size:10px;color:var(--t3);margin-top:5px">📦 scan de acum ${Math.round(ageH)}h — redeschide Sector Rotation pt refresh</div>` : '');
  }

  // ── Nota AI de dimineață — sintetizează contextul cockpit-ului (buton, o dată/zi, cache) ──
  function pbAiContext(){
    const lines = [];
    // prospetimea intra explicit in prompt — altfel AI-ul trata datele de
    // vineri ca "starea de azi" si recomanda sizing pe ele
    try {
      const r = JSON.parse(localStorage.getItem('md_risk_regime') || 'null');
      if (r && r.label){
        const stale = Date.now() - (r.ts || 0) > 6*3600000;
        lines.push(`Regim risc macro: ${r.label} (scor ${r.composite >= 0 ? '+' : ''}${r.composite})${stale ? ' [ATENTIE: date VECHI, nereimprospatate azi — trateaza cu rezerva]' : ''}.`);
      }
    } catch (e) {}
    try {
      const h = JSON.parse(localStorage.getItem('md_danger_daily') || '[]');
      if (Array.isArray(h) && h.length && typeof h[h.length-1].score === 'number'){
        const last = h[h.length-1];
        const stale = !!(last.dateET && last.dateET !== pbTodayET());
        lines.push(`Danger Score: ${last.score}/100${stale ? ` [VECHI, din ${last.dateET} — nu e al zilei]` : ''}.`);
      }
    } catch (e) {}
    const t = pbMarketTone(), m = pbMktData();
    if (m && m.quotes){
      const q = m.quotes, f = (k) => q[k] ? `${k} ${q[k].chgPct >= 0 ? '+' : ''}${q[k].chgPct.toFixed(2)}%` : '';
      const parts = [f('SPY'), f('QQQ'), f('VIX')].filter(Boolean);
      if (parts.length) lines.push(`Piața (${m.session || ''}): ${parts.join(', ')}${t ? ` — ${t.tone}` : ''}.`);
    }
    try {
      const today = pbTodayET();
      const etDateOf = dt => { try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(dt); } catch (e) { return ''; } };
      const big = pbHardcodedEvents().filter(e => e.impact === 'high' && etDateOf(e.d) === today);
      lines.push(big.length ? `Evenimente macro high-impact azi: ${big.map(e => `${e.event} ${e.hm} ET`).join('; ')}.` : 'Fără evenimente macro high-impact recurente azi.');
    } catch (e) {}
    try {
      const s = JSON.parse(localStorage.getItem('sr_last_scan') || 'null'), reg = JSON.parse(localStorage.getItem('tt_risk_regime') || 'null');
      if (s && Array.isArray(s.data)){
        const byRs = [...s.data.filter(d => typeof d.rsRatio === 'number')].sort((a, b) => (b.rsRatio || 0) - (a.rsRatio || 0));
        const lead = byRs.slice(0, 3).map(d => d.sym || d.name).filter(Boolean);
        if (lead.length) lines.push(`Sectoare lider (RS vs SPY): ${lead.join(', ')}${reg && reg.regime ? ` — rotație ${reg.regime}` : ''}.`);
      }
    } catch (e) {}
    try {
      const st = JSON.parse(localStorage.getItem('stl_list_state') || '{}'), now = Date.now();
      const hot = Object.entries(st).filter(([k, v]) => k !== '_mode' && v && (v.tier === 'READY' || v.tier === 'OK') && now - (v.ts || 0) < 24*3600000).map(([k, v]) => `${k}(${v.tier})`);
      if (hot.length) lines.push(`Longs STL azi: ${hot.slice(0, 10).join(', ')}.`);
    } catch (e) {}
    return lines.join('\n');
  }
  function pbShowAiCache(){
    const box = $('pbBodyAi');
    if (!box) return false;
    try {
      const c = JSON.parse(localStorage.getItem('pb_ai_note') || 'null');
      if (c && c.dateET === pbTodayET() && c.text){
        box.innerHTML = `<div class="pb-ai-note">${escHtml(c.text)}</div><div class="pb-ai-meta">📦 generat azi · <a href="#" id="pbAiRegen" style="color:#5bb0ff">regenerează</a> · <a href="#" id="pbAiTg" style="color:#5bb0ff">📤 Telegram</a></div>`;
        const rg = $('pbAiRegen'); if (rg) rg.addEventListener('click', e => { e.preventDefault(); pbGenAiNote(true); });
        const tg = $('pbAiTg'); if (tg) tg.addEventListener('click', e => { e.preventDefault(); pbSendAiTg(tg); });
        return true;
      }
    } catch (e) {}
    return false;
  }
  // Trimite nota AI pe Telegram (config shared tt_tg_config via lib/telegram.js; force=true — butonul E gating-ul)
  async function pbSendAiTg(link){
    let c = null;
    try { c = JSON.parse(localStorage.getItem('pb_ai_note') || 'null'); } catch (e) {}
    if (!c || !c.text){ if (link) link.textContent = '⚠ nimic de trimis'; return; }
    if (!window.TG || !TG.getConfig().token){ if (link) link.textContent = '⚠ config TG lipsă (setează în /alerts/)'; return; }
    if (link) link.textContent = '⏳ trimit…';
    const ok = await TG.send(`☀️ <b>Brief de dimineață — ${escHtml(c.dateET || '')}</b>\n\n${escHtml(c.text)}`, { force: true });
    if (link) link.textContent = ok ? '✓ trimis' : '⚠ eșec trimitere';
  }

  async function pbGenAiNote(force){
    const box = $('pbBodyAi');
    if (!box) return;
    if (!force && pbShowAiCache()) return; // deja generat azi → afișează din cache, fără apel API
    if (!window.AI || !AI.hasKey()){
      box.innerHTML = '<div class="pb-ai-empty">⚠ Cheia Anthropic lipsește. Setează-o într-o pagină cu AI (ex. <a href="./macro-dashboard/" style="color:#5bb0ff">Macro</a> → ⚙) — e shared între pagini.</div>';
      return;
    }
    const today = pbTodayET();
    const ctx = pbAiContext();
    box.innerHTML = '<div class="pb-loading">🤖 AI compune nota de dimineață…</div>';
    const system = 'Ești un trader senior care scrie o notă de desk de dimineață în română, pentru un trader retail pe acțiuni US. Maxim 6-8 rânduri, ton direct, fără hype. Structură: 1 rând verdict pe zi (risk-on/off + ce bias), 2-3 rânduri de ce (din date), 1-2 rânduri ce de urmărit azi (evenimente/niveluri), 1 rând riscul principal. Interpretează pe regim (good-news-is-bad-news când e cazul). NU inventa cifre care nu-s în context.';
    const prompt = `Date de azi (${today}):\n${ctx}\n\nScrie nota de desk de dimineață.`;
    try {
      const text = await AI.complete({ system, prompt, maxTokens: 700 });
      const clean = (text || '').trim();
      if (!clean){ box.innerHTML = '<div class="pb-ai-empty">AI a întors gol — reîncearcă.</div>'; return; }
      box.innerHTML = `<div class="pb-ai-note">${escHtml(clean)}</div><div class="pb-ai-meta">generat acum · <a href="#" id="pbAiRegen" style="color:#5bb0ff">regenerează</a> · <a href="#" id="pbAiTg" style="color:#5bb0ff">📤 Telegram</a></div>`;
      const rg = $('pbAiRegen'); if (rg) rg.addEventListener('click', e => { e.preventDefault(); pbGenAiNote(true); });
      const tg = $('pbAiTg'); if (tg) tg.addEventListener('click', e => { e.preventDefault(); pbSendAiTg(tg); });
      try { localStorage.setItem('pb_ai_note', JSON.stringify({ dateET: today, text: clean })); } catch (e) {}
    } catch (e) {
      box.innerHTML = `<div class="pb-ai-empty">⚠ ${escHtml((e && e.message) || 'eroare AI')}</div>`;
    }
  }

  // ── „Peste noapte" — ce s-a schimbat față de ziua precedentă (regim/danger/lider sectorial/READY) ──
  // Snapshot zilnic în pb_daily_snap {cur, prev}: la schimbarea zilei ET, cur→prev; în aceeași zi
  // cur se reîmprospătează cu ultimele valori (păstrând ce era deja prins azi dacă acum lipsește).
  function pbCurrentState(){
    const st = { dateET: pbTodayET(), regime: null, danger: null, leaders: [], ready: [] };
    try { const r = JSON.parse(localStorage.getItem('md_risk_regime') || 'null'); if (r && r.label) st.regime = String(r.label).trim(); } catch (e) {}
    try { const h = JSON.parse(localStorage.getItem('md_danger_daily') || '[]'); if (Array.isArray(h) && h.length && typeof h[h.length-1].score === 'number') st.danger = h[h.length-1].score; } catch (e) {}
    try {
      const s = JSON.parse(localStorage.getItem('sr_last_scan') || 'null');
      if (s && Array.isArray(s.data)) st.leaders = [...s.data.filter(d => typeof d.rsRatio === 'number')].sort((a, b) => (b.rsRatio || 0) - (a.rsRatio || 0)).slice(0, 3).map(d => d.sym || d.name).filter(Boolean);
    } catch (e) {}
    try {
      const l = JSON.parse(localStorage.getItem('stl_list_state') || '{}'), now = Date.now();
      st.ready = Object.entries(l).filter(([k, v]) => k !== '_mode' && v && v.tier === 'READY' && now - (v.ts || 0) < 24*3600000).map(([k]) => k).sort();
    } catch (e) {}
    return st;
  }
  function pbSnapshotDaily(){
    try {
      const today = pbTodayET();
      if (!today) return;
      let store = null;
      try { store = JSON.parse(localStorage.getItem('pb_daily_snap') || 'null'); } catch (e) {}
      if (!store || typeof store !== 'object') store = {};
      const st = pbCurrentState();
      if (store.cur && store.cur.dateET === today){
        // aceeași zi: valorile de azi deja prinse nu se pierd dacă o sursă e momentan goală
        if (st.regime == null) st.regime = store.cur.regime;
        if (st.danger == null) st.danger = store.cur.danger;
        if (!st.leaders.length) st.leaders = store.cur.leaders || [];
        if (!st.ready.length) st.ready = store.cur.ready || [];
        store.cur = st;
      } else {
        if (store.cur) store.prev = store.cur; // zi nouă: starea de ieri devine referința
        store.cur = st;
      }
      localStorage.setItem('pb_daily_snap', JSON.stringify(store));
    } catch (e) {}
  }
  function pbRenderOvernight(){
    const el = $('pbDiff');
    if (!el) return;
    let store = null;
    try { store = JSON.parse(localStorage.getItem('pb_daily_snap') || 'null'); } catch (e) {}
    const cur = store && store.cur, prev = store && store.prev;
    if (!cur){ el.style.display = 'none'; return; }
    if (!prev){
      el.innerHTML = '🌙 <b>Peste noapte:</b> <span style="color:var(--t3)">prim snapshot azi — comparația cu ziua precedentă apare de mâine</span>';
      el.style.display = '';
      return;
    }
    const ch = [];
    if (cur.regime && prev.regime && cur.regime !== prev.regime) ch.push(`regim <b>${escHtml(prev.regime)}</b> → <b>${escHtml(cur.regime)}</b>`);
    if (typeof cur.danger === 'number' && typeof prev.danger === 'number' && Math.abs(cur.danger - prev.danger) >= 5){
      const d = cur.danger - prev.danger;
      ch.push(`Danger ${prev.danger} → ${cur.danger} (<span style="color:${d > 0 ? 'var(--red)' : 'var(--green)'}">${d > 0 ? '+' : ''}${d}</span>)`);
    }
    if (cur.leaders[0] && prev.leaders[0] && cur.leaders[0] !== prev.leaders[0]) ch.push(`lider sectorial <b>${escHtml(prev.leaders[0])}</b> → <b>${escHtml(cur.leaders[0])}</b>`);
    const newReady = (cur.ready || []).filter(s => !(prev.ready || []).includes(s));
    if (newReady.length) ch.push(`READY noi: <b>${newReady.map(escHtml).join(', ')}</b>`);
    el.innerHTML = `🌙 <b>Peste noapte (vs ${escHtml(prev.dateET || 'ieri')}):</b> ` + (ch.length ? ch.join(' · ') : '<span style="color:var(--t3)">≈ nimic major schimbat</span>');
    el.style.display = '';
  }

  // ── Verdict tracker: „a avut dreptate brief-ul?" — regimul văzut dimineața vs SPY close-to-close ──
  // Bias din regim: RISK-ON/LEAN → long; RISK-OFF/STRESS → short; NEUTRAL/CAUTIOUS → fără bias
  // (zilele fără bias nu intră în hit-rate). Hit = SPY a închis în direcția bias-ului cu |Δ|>0.1%;
  // zi flat (≤0.1%) = exclusă (nici hit, nici miss). ONEST: verdictul consemnat e cel de la PRIMA
  // deschidere a hub-ului în ziua respectivă (dacă deschizi seara, aia e „dimineața" ta).
  function pbBiasOf(label){
    if (!label) return null;
    if (/RISK-ON|LEAN/.test(label)) return 'long';
    if (/RISK-OFF|STRESS/.test(label)) return 'short';
    return null; // NEUTRAL/CAUTIOUS = fără predicție direcțională
  }
  function pbTrackLoad(){ try { const a = JSON.parse(localStorage.getItem('pb_verdict_track') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function pbTrackSave(a){ try { localStorage.setItem('pb_verdict_track', JSON.stringify(a.slice(-60))); } catch (e) {} }
  function pbTrackSnapshot(){
    const today = pbTodayET();
    if (!today) return;
    let regime = null;
    try {
      const r = JSON.parse(localStorage.getItem('md_risk_regime') || 'null');
      // doar regim PROASPĂT (<12h) — un label stale de ieri consemnat ca verdictul de azi ar minți statistica
      if (r && r.label && Date.now() - (r.ts || 0) < 12*3600000) regime = String(r.label).trim();
    } catch (e) {}
    if (!regime) return;
    const arr = pbTrackLoad();
    if (arr.some(e => e && e.dateET === today)) return; // verdictul primei deschideri rămâne (nu suprascrie)
    arr.push({ dateET: today, regime, bias: pbBiasOf(regime), chg: null });
    pbTrackSave(arr);
  }
  async function pbTrackEvaluate(){
    const today = pbTodayET();
    const arr = pbTrackLoad();
    if (!arr.some(e => e && e.chg == null && e.dateET && e.dateET < today)) return false; // nimic de evaluat → zero fetch
    const spy = await fetchYahooChart('SPY');
    if (!spy || !spy.points || spy.points.length < 2) return false;
    const dateOfTs = ts => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ts * 1000)); } catch (e) { return ''; } };
    const chgByDate = {};
    for (let i = 1; i < spy.points.length; i++){
      const prev = spy.points[i-1].close;
      if (prev > 0) chgByDate[dateOfTs(spy.points[i].ts)] = (spy.points[i].close / prev - 1) * 100;
    }
    let touched = false;
    arr.forEach(e => {
      if (!e || e.chg != null || !e.dateET || e.dateET >= today) return;
      const chg = chgByDate[e.dateET];
      if (typeof chg !== 'number') return; // weekend/sărbătoare fără bară — rămâne neevaluată, nu intră în stats
      e.chg = +chg.toFixed(2);
      e.hit = (e.bias && Math.abs(chg) > 0.1) ? ((e.bias === 'long') === (chg > 0)) : null;
      touched = true;
    });
    if (touched) pbTrackSave(arr);
    return touched;
  }
  function pbTrackRender(){
    const el = $('pbHeroTrack');
    if (!el) return;
    const arr = pbTrackLoad();
    const done = arr.filter(e => e && typeof e.hit === 'boolean');
    const hits = done.filter(e => e.hit).length;
    const today = arr.find(e => e && e.dateET === pbTodayET());
    const todayTxt = today ? (today.bias ? `azi: bias ${today.bias.toUpperCase()}` : 'azi: fără bias (neutru)') : '';
    if (!done.length && !today){ el.style.display = 'none'; return; }
    el.innerHTML = done.length
      ? `📏 Brief-tracker: <b>${hits}✓/${done.length - hits}✗</b> (${Math.round(hits / done.length * 100)}%) din ${done.length} zile cu bias evaluate${done.length < 10 ? ' · <span style="color:var(--t3)">eșantion mic</span>' : ''}${todayTxt ? ' · ' + todayTxt : ''}`
      : `📏 Brief-tracker: <span style="color:var(--t3)">hit-rate-ul apare după primele zile cu bias</span>${todayTxt ? ' · ' + todayTxt : ''}`;
    el.style.display = '';
  }

  function pbShowGovBanner(){
    const el = $('govBanner');
    if (!el || !window.GV) return;
    try {
      const s = GV.status();
      if (s.verdict === 'HALTED'){
        el.style.display = '';
        el.innerHTML = `🛑 GOVERNOR HALTED — ${escHtml(s.reasons[0] || 'limită atinsă')} · <a href="./journal/#desk" style="color:#ffd86b">Deschide Governor</a>`;
        GV.maybeNotifyHalted(s);
      } else if (s.verdict === 'CAUTION'){
        el.style.display = '';
        el.style.background = 'linear-gradient(90deg,#2a2010,#1d2537)';
        el.style.borderColor = '#d4892c';
        el.style.color = '#ffe8c8';
        el.innerHTML = `⚠️ CAUTION — buget ${s.budgetUsedPct.toFixed(0)}% · ${s.tradesRemaining} trade-uri rămase · <a href="./journal/#desk" style="color:#ffd86b">Governor</a>`;
      } else { el.style.display = 'none'; }
    } catch (e) { el.style.display = 'none'; }
  }

  async function pbLoadAll(){
    $('pbRefreshInfo').textContent = '⏳ se încarcă…';
    pbLoadProDesk();
    pbLoadDanger();
    pbRenderMarket();
    pbRenderFreeze();
    pbLoadSector();
    pbShowAiCache();
    pbRenderHero();
    pbRenderOvernight(); // instant, din snapshot-ul salvat
    pbLoadNasdaqPicks();
    pbLoadSTL();
    pbLoadSuggestions();
    // WL events = lazy (colapsat la coadă): se încarcă doar dacă drill-down-ul e deschis — economisește cota Finnhub
    const wlDet = $('pbWlEvDet');
    await Promise.allSettled([pbLoadRisk(), pbLoadMacroEvents(), pbLoadEarnings(), (wlDet && wlDet.open) ? pbLoadWlEvents() : Promise.resolve()]);
    pbRenderHero(); // recompune după ce regimul/danger sunt proaspete în localStorage
    pbLoadProDesk();
    pbSnapshotDaily(); // consemnează starea zilei (după refresh-ul surselor)
    pbRenderOvernight();
    pbTrackSnapshot(); // verdictul zilei (regim proaspăt) — o dată/zi
    pbTrackRender();
    pbTrackEvaluate().then(ch => { if (ch) pbTrackRender(); }).catch(() => {}); // evaluează zilele trecute (fetch DOAR dacă e ceva pending)
    $('pbRefreshInfo').textContent = `🔄 ultim refresh: ${new Date().toLocaleTimeString('ro-RO')}`;
  }
  window.addEventListener('hub:market', () => { pbRenderMarket(); pbRenderHero(); renderHubCockpit(); });

  let pbLoaded = false;
  function pbEnsure(force){
    const wrap = $('pbWrap');
    if (!wrap || !wrap.open) return;
    if (pbLoaded && !force) return;
    pbLoaded = true;
    pbLoadAll();
  }
  function bindPlaybookEvents(){
    const wrap = $('pbWrap');
    if (!wrap) return;
    wrap.addEventListener('toggle', () => {
      try { localStorage.setItem('pb_open', wrap.open ? '1' : '0'); } catch (e) {}
      pbEnsure(false);
    });
    const refBtn = $('pbRefreshBtn');
    if (refBtn) refBtn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      if (!wrap.open) wrap.open = true;
      try { localStorage.removeItem(WL_EVENTS_CACHE_KEY); } catch (e2) {}
      pbLoaded = true;
      pbLoadAll();
    });
    const aiBtn = $('pbAiBtn');
    if (aiBtn) aiBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); pbGenAiNote(false); });
    const wlEvDet = $('pbWlEvDet');
    if (wlEvDet) wlEvDet.addEventListener('toggle', () => { if (wlEvDet.open) pbLoadWlEvents(); });
    try {
      if (localStorage.getItem('pb_open') === '0') wrap.open = false;
      else { wrap.open = true; pbEnsure(false); }
    } catch (e) { pbEnsure(false); }
  }

  function getHubSessionMode(){
    try {
      const o = localStorage.getItem('hub_session_mode');
      if (o === 'pre' || o === 'rth' || o === 'review') return o;
    } catch(e){}
    const s = (window.__hubMkt && window.__hubMkt.session) || 'rth';
    if (s === 'pre' || s === 'after') return 'pre';
    if (s === 'weekend' || s === 'closed') return 'review';
    return 'rth';
  }
  function applyHubSessionMode(){
    const mode = getHubSessionMode();
    document.body.dataset.hubMode = mode;
    const tier2 = $('pbTier2');
    if (tier2 && mode === 'review') tier2.open = true;
    const pb = $('pbWrap');
    if (pb && mode === 'pre') pb.open = false;
    if (global.HT && HT.render) HT.render();
  }

  function updateSessionPill(){
    const el = $('hubSessionPill');
    if (!el) return;
    let label = '—', sub = '', cls = '';
    if (global.HS && HS.hubState){
      try {
        const d = HS.hubState();
        label = d.sessionLabel || '—';
        sub = d.sessionSub || '';
        cls = d.sessionLvl === 'ok' ? 'rth' : d.sessionLvl === 'warn' ? 'ext' : '';
      } catch (e) {}
    }
    if (global.HG && HG.getNYSESession && (!label || label === '—')){
      const s = HG.getNYSESession();
      label = s.label || label;
    }
    el.textContent = sub ? label + ' · ' + sub : label;
    el.className = 'hub-session-pill' + (cls ? ' ' + cls : '');
  }

  function renderChecklist(){
    const cl = $('hubChecklist');
    if (!cl || !window.MC) return;
    const mode = getHubSessionMode();
    const expanded = cl.dataset.expanded === '1';
    if (mode !== 'pre' && mode !== 'rth'){
      cl.style.display = 'none';
      return;
    }
    if (!expanded) cl.style.display = 'none';
    const mc = MC.items();
    cl.innerHTML = mc.list.map(it =>
      '<label class="hub-check-row"><input type="checkbox" data-mc="' + it.id + '" ' + (it.done ? 'checked' : '') + ' ' + (it.manual ? '' : 'disabled') + '/> ' +
      escHtml(it.label) + ' <span class="hub-check-sub">' + escHtml(it.sub) + '</span></label>'
    ).join('');
    cl.querySelectorAll('[data-mc]').forEach(cb => cb.addEventListener('change', () => {
      if (cb.dataset.mc) MC.toggleManual(cb.dataset.mc);
      renderChecklist();
      renderHubCockpit();
      if (global.HT && HT.render) HT.render();
    }));
  }
  function renderHubCockpit(){
    if (global.HT && HT.render) HT.render();
    pbShowGovBanner();
    const box = $('hubCockpit');
    if (!box || !window.RT) return;
    try {
      const p = (global.HS && HS.hubState && HS.hubState().rtPayload) || (global.HT && HT.hubState && HT.hubState().rtPayload) || RT.evaluate();
      const c = p.context || RT.buildContext();
      const stay = p.strategy === 'STAY OUT';
      box.className = 'hub-cockpit'+(stay?' stay':'');
      $('hubStrat').textContent = p.strategy;
      $('hubRule').textContent = p.ruleOrder ? ('Regulă #'+p.ruleOrder+(p.matchedNote?' · '+p.matchedNote:'')) : 'Fără regulă matched';
      $('hubMeta').textContent = [p.goLabel,'×'+p.sizingMult,p.tradesLeftToday+' trades',p.presetLabel].filter(Boolean).join(' · ');
      $('hubGoNum').textContent = p.goScore;
      $('hubGoNum').className = 'hub-go-num '+(p.goCls||'caution');
      $('hubGoLbl').textContent = p.goLabel+' · '+p.goScore+'/100';
      const gCol = p.goCls==='go'?'var(--green)':p.goCls==='caution'?'#d4892c':'#ff4d4d';
      const fill = $('hubGoFill');
      if (fill){ fill.style.width=(p.goScore||0)+'%'; fill.style.background=gCol; }
      $('hubBlockers').innerHTML = (p.blockers||[]).slice(0,3).map(b=>'<span class="hub-block '+escHtml(b.cls)+'">'+escHtml(b.text)+'</span>').join('');
      $('hubPlan').textContent = (p.reasons&&p.reasons[0]) ? p.reasons[0] : (p.matchedNote||'Deschide Router pentru plan complet');
      const sum = $('hubCockpitSum');
      if (sum) {
        const sd = c.sessionDetail || {};
        const blk = (p.blockers||[]).slice(0,2).map(b => b.text).join(' · ');
        sum.innerHTML = '☀️ <b>GO ' + p.goScore + '</b> ' + escHtml(p.goLabel) +
          ' · ' + escHtml(c.regime||'—') +
          ' · Danger ' + (c.danger != null ? c.danger : '—') +
          ' · ' + escHtml(c.sessionLabel||'—') + (sd.countdown ? ' ' + escHtml(sd.countdown) : '') +
          (blk ? ' · <span style="color:var(--t3)">' + escHtml(blk) + '</span>' : '') +
          ' <span class="hub-cockpit-sum-hint">(detalii)</span>';
      }
      const mf = c.macroFreeze||{};
      const fr = $('hubFreezeTop');
      if (fr){
        if (mf.message){ fr.className='hub-freeze-top '+(mf.active?'red':'amber'); fr.textContent=(mf.active?'🚫 ':'⏳ ')+mf.message; fr.style.display=''; }
        else fr.style.display='none';
      }
      const rv = $('pbRouteVal'), rs = $('pbRouteSub');
      if (rv){
        const col2 = stay?'#ff4d4d':'var(--green)';
        const goCol = p.goCls==='go'?'#22d66b':p.goCls==='caution'?'#d4892c':'#ff4d4d';
        rv.innerHTML = '<span style="color:'+col2+'">🧭 '+escHtml(p.strategy)+'</span> <span style="color:'+goCol+';font-size:12px;font-weight:700">GO '+p.goScore+'</span>';
        if (rs) rs.textContent = [p.goLabel,'×'+p.sizingMult,p.tradesLeftToday+' trades',p.regimeNorm||p.regime,p.presetLabel].filter(Boolean).join(' · ');
      }
      if (window.HB_SL_MINI) HB_SL_MINI.renderReview();
      else if (window.HB_LEDGER && HB_LEDGER.review) HB_LEDGER.review();
      const ep = $('hubEqPill');
      if (ep && window.EQ){
        const eq = EQ.hubSummary();
        const col = eq.driftWarn ? '#d4892c' : (eq.ddPct >= 8 ? '#ff4d4d' : '#22d66b');
        ep.innerHTML = '<a href="./journal/#capital" style="color:'+col+';text-decoration:none">⚖ $'+Math.round(eq.estimated).toLocaleString()+' · DD '+eq.ddPct.toFixed(1)+'%'+(eq.driftWarn && eq.driftPct!=null?' · drift '+eq.driftPct.toFixed(1)+'%':'')+'</a>';
        EQ.writeDriftFlag();
        if (getHubSessionMode() === 'review') EQ.maybeNotifyDrift();
      }
      if (window.CD){
        CD.writeRiskFlag();
        if (CD.maybeNotifyRisk) CD.maybeNotifyRisk();
        if (CD.renderHubStrip){
          const hcd = $('hubCdStrip');
          if (hcd) CD.renderHubStrip(hcd);
        }
        const rb = $('hubRiskBanner');
        if (rb){
          const b = CD.unified();
          const pf = b.portfolio;
          if (pf.riskPct != null && pf.riskPct >= (CD.RISK_HALT_PCT || 4)){
            rb.className = 'hub-freeze-top red';
            rb.style.display = '';
            rb.innerHTML = '🛡️ <b>Risc agregat ' + pf.riskPct.toFixed(1) + '%</b> ≥ ' + (CD.RISK_HALT_PCT || 4) + '% — <a href="./journal/#portfolio" style="color:#ffd86b">Portfolio</a> · <a href="./journal/#desk" style="color:#ffd86b">Desk</a> · <button type="button" id="hubCopyRiskJson" style="margin-left:6px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);color:inherit;padding:2px 8px;border-radius:6px;cursor:pointer;font-size:10px">📋 JSON server</button>';
            const cp = $('hubCopyRiskJson');
            if (cp && !cp.dataset.wired){
              cp.dataset.wired = '1';
              cp.onclick = async () => {
                const ok = CD.copyServerRiskPayload && await CD.copyServerRiskPayload();
                cp.textContent = ok ? '✓ copiat' : '✗ eșec';
                setTimeout(() => { cp.textContent = '📋 JSON server'; }, 2000);
              };
            }
          } else rb.style.display = 'none';
        }
      }
      if (window.MC){
        renderChecklist();
      }
    } catch(e){}
    try {
      if (window.GV){
        const s = GV.status();
        const lb = GV.labelOf(s.verdict);
        const col = lb.cls==='halted'?'#ff4d4d':lb.cls==='caution'?'#d4892c':'var(--green)';
        const gv = $('pbGovVal'), gs = $('pbGovSub');
        if (gv) gv.innerHTML = '<span style="color:'+col+'">🛑 '+escHtml(lb.text)+'</span>';
        if (gs) gs.textContent = 'PnL '+(s.todayPnl>=0?'+':'')+'$'+s.todayPnl.toFixed(2)+' · buget '+s.budgetUsedPct.toFixed(0)+'% · '+s.tradesRemaining+' rămase';
      }
    } catch(e){}
  }
  function pbLoadProDesk(){ renderHubCockpit(); }
  function pbRenderOvernightHero(){
    let store=null;
    try{ store=JSON.parse(localStorage.getItem('pb_daily_snap')||'null'); }catch(e){}
    const cur=store&&store.cur, prev=store&&store.prev;
    const el=$('pbDiffHero');
    if(!el) return;
    if(!cur||!prev){ el.style.display='none'; return; }
    const major = cur.regime&&prev.regime&&cur.regime!==prev.regime;
    const dDanger = typeof cur.danger==='number'&&typeof prev.danger==='number'&&Math.abs(cur.danger-prev.danger)>=5;
    if(!major&&!dDanger){ el.style.display='none'; return; }
    const parts=[];
    if(major) parts.push('regim <b>'+escHtml(prev.regime)+'</b> → <b>'+escHtml(cur.regime)+'</b>');
    if(dDanger) parts.push('Danger '+prev.danger+' → '+cur.danger);
    el.innerHTML='🌙 <b>Schimbare majoră:</b> '+parts.join(' · ');
    el.style.display='';
  }
  const _pbRenderOvernightOrig = pbRenderOvernight;
  pbRenderOvernight = function(){ _pbRenderOvernightOrig(); pbRenderOvernightHero(); };

  function initHubBrief(){
    bindPlaybookEvents();
    applyHubSessionMode();
    updateSessionPill();
    const tier2=$('pbTier2');
    try{
      if(tier2 && localStorage.getItem('pb_tier2_open')==='1') tier2.open=true;
      else if(tier2) tier2.open=false;
    }catch(e){}
    if(tier2) tier2.addEventListener('toggle', ()=>{ try{ localStorage.setItem('pb_tier2_open', tier2.open?'1':'0'); }catch(e){} });
    renderHubCockpit();
    setInterval(()=>{
      try{
        if (typeof global.hubRefreshMarketQuotes === 'function') hubRefreshMarketQuotes();
        pbRenderFreeze();
        renderHubCockpit();
      }catch(e){}
    }, 60000);
  }

  global.HB = {
    init: initHubBrief,
    refresh: pbLoadAll,
    renderCockpit: renderHubCockpit,
    sessionMode: getHubSessionMode,
    applySessionMode: applyHubSessionMode,
    updateSessionPill,
    renderChecklist
  };

})(typeof window !== 'undefined' ? window : global);
