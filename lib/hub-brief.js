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
  // o singură definiție la nivel de modul (era duplicată local în 2 funcții)
  function etDateOf(dt){ try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(dt); } catch (e) { return ''; } }
  function etPlus(days){ const t = new Date(etToday() + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + days); return t.toISOString().slice(0,10); }

  // Yahoo prin lib/data.js (hub-ul îl încarcă garantat); lanț local doar ca plasă de siguranță
  const PB_PROXIES = [
    u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
    u => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
    u => 'https://api.cors.lol/?url=' + encodeURIComponent(u)
  ];
  async function fetchViaProxy(url){
    // SWR + timeout scurt: brief-ul nu trebuie să stea pe ⏳ 20–30s dacă proxy-ul free atârnă.
    // D.fetchJSON preferă tt-proxy (custom) și sare cooldown pe free mort.
    if (window.D && D.fetchJSON){
      const j = await D.fetchJSON(url, { ttl: 120, timeout: 6000, swr: true, maxStale: 3600 });
      if (j != null) return j;
    }
    for (const build of PB_PROXIES){
      try {
        const r = await fetchT(build(url), 5000);
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
    // sanity anti-proxy-otrăvit (verificare adversarială audit 2026-07-22):
    // (1) simbolul din meta = cel cerut; (2) date recente (<7 zile), nu un
    // cache vechi servit de un proxy terț; (3) prețuri finite pozitive
    const metaSym = String(r.meta?.symbol || '').toUpperCase();
    const wantSym = decodeURIComponent(String(symbol)).toUpperCase();
    if (metaSym && metaSym !== wantSym) return null;
    const lastTs = (r.timestamp || [])[Math.max(0, (r.timestamp || []).length - 1)];
    if (Number.isFinite(lastTs) && Date.now() / 1000 - lastTs > 7 * 86400) return null;
    const closes = r.indicators?.quote?.[0]?.close || [];
    const ts = r.timestamp || [];
    const points = closes.map((c, i) => ({ ts: ts[i], close: c })).filter(p => Number.isFinite(p.close) && p.close > 0);
    return points.length < 5 ? null : { points, meta: r.meta };
  }
  async function fetchCryptoCG(coinId){
    try {
      const r = await fetchT(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=60&interval=daily`);
      if (!r.ok) return null;
      const d = await r.json();
      const prices = d?.prices || [];
      // punctele CG daily sunt snapshot-uri la 00:00 UTC ziua D = close-ul
      // zilei D-1 -> shift o zi inapoi (fara ultimul punct = pretul "acum"),
      // altfel corelatia BTC/SPY iesea cu lag de 1 zi (ρ≈0 -> corrScore -1
      // fals -> regimul local impins spre CAUTIOUS fix cand Macro e stale)
      return prices.length < 5 ? null : { points: prices.map((p, i) => ({
        ts: Math.floor(p[0]/1000) - (i < prices.length - 1 ? 86400 : 0),
        close: p[1]
      })) };
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
    const riskVal = $('pbRiskVal'), riskSub = $('pbRiskSub');
    if (!riskVal || !riskSub) return;
    let stale = null;
    try {
      const r = JSON.parse(localStorage.getItem('md_risk_regime') || 'null');
      if (r && r.label && String(r.label).trim()){
        const label = String(r.label);
        const ageMin = Math.round((Date.now() - (r.ts || 0)) / 60000);
        if (ageMin < 360){
          riskVal.innerHTML = `<span style="color:${riskColor(label)}">${escHtml(label)}</span>`;
          riskSub.textContent = `score ${r.composite >= 0 ? '+' : ''}${r.composite} · din Macro Dashboard (acum ${Math.max(1, ageMin)} min)`;
          return;
        }
        // regim VECHI: îl arătăm imediat (mai bine decât ⏳) cât rulează calculul local
        stale = { ...r, ageMin };
        riskVal.innerHTML = `<span style="color:${riskColor(label)}">${escHtml(label)}</span>`;
        riskSub.textContent = `din Macro acum ${Math.round(ageMin / 60)}h (vechi) · recalculez local…`;
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
        riskSub.textContent = `din Macro acum ${Math.round(stale.ageMin / 60)}h (VECHI) · datele live indisponibile — deschide Macro Dashboard pt update`;
      } else {
        riskVal.innerHTML = '<span style="color:var(--t3)">⚠ n/a</span>';
        riskSub.innerHTML = 'date live indisponibile (proxy CORS) — deschide <a href="./macro-dashboard/" style="color:#5bb0ff">Macro Dashboard</a> (regimul lui se preia automat aici)';
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
    // câte componente de scor vin din date REALE (nu zero implicit) — un
    // composite 0 din o singură sursă (ex. doar SPY, care nu contribuie la
    // niciun scor) NU e un NEUTRAL real, e „date parțiale"
    const nSig = (!isNaN(vixVal) ? 1 : 0) + (tenYDelta != null ? 1 : 0) + (corrVal != null ? 1 : 0);
    if (nSig === 0){
      if (stale){
        riskSub.textContent = `din Macro acum ${Math.round(stale.ageMin / 60)}h (VECHI) · datele live indisponibile — deschide Macro Dashboard pt update`;
      } else {
        riskVal.innerHTML = '<span style="color:var(--t3)">⚠ n/a</span>';
        riskSub.innerHTML = 'date live insuficiente (proxy CORS) — deschide <a href="./macro-dashboard/" style="color:#5bb0ff">Macro Dashboard</a>';
      }
      return;
    }
    const composite = vixScore + tenYScore + corrScore;
    const partial = nSig < 2;
    const label = composite >= 3 ? '🟢 RISK-ON' : composite >= 1 ? '🟢 LEAN ON' : composite >= -1 ? '⚪ NEUTRAL' : composite >= -3 ? '🟡 CAUTIOUS' : composite >= -5 ? '🔴 RISK-OFF' : '⛔ STRESS';
    const color = composite >= 1 ? 'var(--green)' : composite >= -1 ? 'var(--t1)' : composite >= -3 ? '#d4892c' : '#ff4d4d';
    riskVal.innerHTML = `<span style="color:${color}">${label}</span>${partial ? ' <span style="color:var(--t3);font-size:11px">⚠ parțial</span>' : ''}`;
    riskSub.textContent = `score ${composite >= 0 ? '+' : ''}${composite} · VIX ${!isNaN(vixVal) ? vixVal.toFixed(1) : '—'} · 10Y Δ${tenYDelta != null ? (tenYDelta>=0?'+':'')+Math.round(tenYDelta)+'bp' : '—'} · ρ ${corrVal != null ? Math.round(corrVal*100)+'%' : '—'}${partial ? ` · doar ${nSig}/3 semnale` : ''} · calcul local`;
    } catch (e) {
      if (riskVal) riskVal.innerHTML = '<span style="color:var(--t3)">⚠ n/a</span>';
      if (riskSub) riskSub.textContent = 'eroare calcul local: ' + ((e && e.message) || e);
    }
  }

  // ── Evenimente macro azi ──
  // Finnhub /calendar/economic e PREMIUM pe free tier → secțiunea era mereu goală/eroare.
  // Fallback: generatorul hardcoded din Macro Dashboard (FOMC date oficiale + pattern-uri
  // recurente CPI/NFP/PPI/claims/retail/ISM), filtrat pe următoarele 24h, etichetat estimativ.
  // Calendar hardcodat 2026 — sursă unică lib/macro-context.js (I-159)
  // fallback DST-aware (nu -04:00 fix — iarna decala CPI/NFP cu 1h si fereastra
  // FREEZE rata publicarea): incearca ambele offseturi si valideaza round-trip
  function pbEtWall(dateStr, hm){
    if (global.MCTX && MCTX.etWall) return MCTX.etWall(dateStr, hm);
    for (const off of ['-04:00', '-05:00']){
      const d = new Date(`${dateStr}T${hm}:00${off}`);
      try {
        const p = new Intl.DateTimeFormat('en-GB', { timeZone:'America/New_York', hour:'2-digit', minute:'2-digit', hour12:false }).format(d);
        if (p === hm) return d;
      } catch (e) { return d; }
    }
    return new Date(`${dateStr}T${hm}:00-05:00`);
  }
  function pbHardcodedEvents(){ return (global.MCTX && MCTX.hardcodedEvents) ? MCTX.hardcodedEvents() : []; }
  function pbRenderHardcoded(){
    const now = Date.now();
    const events = pbHardcodedEvents()
      .filter(e => e.d.getTime() > now - 30*60000 && e.d.getTime() < now + 26*3600000)
      .sort((a, b) => a.d - b.d);
    $('pbCntEvents').textContent = String(events.length);
    // calendar hardcodat expirat = „niciun eveniment" ar fi fals liniștitor
    if (global.MCTX && MCTX.calendarExpired && MCTX.calendarExpired()){
      $('pbBodyEvents').innerHTML = '<div class="pb-empty" style="color:#d4892c">⚠ Calendarul macro hardcodat a expirat (' + escHtml(MCTX.CAL_LAST_DATE || '') + ') — actualizează MCTX.hardcodedEvents cu datele noului an.</div>';
      return;
    }
    if (!events.length){
      $('pbBodyEvents').innerHTML = '<div class="pb-empty">📭 Niciun eveniment US recurent (CPI/NFP/FOMC/claims) în următoarele 24h. <span style="color:var(--t3)">📦 estimativ — calendarul live Finnhub e premium.</span></div>';
      return;
    }
    const todayE = etToday();
    $('pbBodyEvents').innerHTML = `<table class="pb-table">
      <thead><tr><th>Ora</th><th>Eveniment</th><th>Impact</th></tr></thead>
      <tbody>${events.slice(0, 10).map(e => {
        const til = e.d.getTime() - now;
        const tilStr = til < 0 ? 'PUBLICAT' : (til < 3600000 ? `T-${Math.round(til/60000)}min` : `T-${Math.round(til/3600000)}h`);
        // fereastra e de 26h — rândurile de a doua zi ET primesc marcaj explicit
        const dayTag = etDateOf(e.d) !== todayE ? 'mâine ' : '';
        return `<tr>
          <td class="pb-time"><span class="${til < 3600000 && til > 0 ? 't-imm' : ''}">${dayTag}${e.hm} ET (${e.d.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})} RO)</span><span class="t-til">${tilStr}</span></td>
          <td>${e.approx ? '~' : ''}${escHtml(e.event)}</td>
          <td><span class="pb-chip ${e.impact === 'high' ? 'high' : 'med'}">${e.impact === 'high' ? '🔴 HIGH' : '🟡 MED'}</span></td>
        </tr>`;
      }).join('')}</tbody></table>
      <div style="font-size:10.5px;color:var(--t3);margin-top:5px;font-family:var(--mono)">📅 NFP/CPI/FOMC = date oficiale 2026 (sincron cu Macro) · ~PPI/retail/ISM = date DERIVATE (estimative); calendarul live Finnhub e premium</div>`;
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
            <td class="pb-time"><span class="${til < 3600000 && til > 0 ? 't-imm' : ''}">${t.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})} RO <span style="color:var(--t3)">(brut ${escHtml(e.time.slice(11) || '?')})</span></span><span class="t-til">${tilStr}</span></td>
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
          <td class="sym"><a href="https://www.tradingview.com/chart/?symbol=${escHtml(e.symbol)}" target="_blank">${escHtml(e.symbol)}</a></td>
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
      // batch-uri de 5 tickere, endpoint-urile pe rând — varianta veche lansa
      // ~61 cereri PARALEL (= exact plafonul free tier 60/min); orice 429
      // devenea [] silențios și parțialul se cacheta 6h ca fiind complet
      let fetchFails = 0;
      const runBatched = async (mk) => {
        const out = [];
        const B = 5;
        for (let i = 0; i < tickers.length; i += B){
          const part = await Promise.all(tickers.slice(i, i + B).map(async t => {
            try { return await mk(t); } catch (e) { fetchFails++; return []; }
          }));
          out.push(...part);
          if (i + B < tickers.length) await new Promise(r => setTimeout(r, 350));
        }
        return out;
      };
      const divR = await runBatched(async t => {
        const r = await fetchT(`https://finnhub.io/api/v1/stock/dividend2?symbol=${encodeURIComponent(t)}&from=${today}&to=${in30}&token=${encodeURIComponent(key)}`);
        if (!r.ok){ fetchFails++; return []; }
        const d = await r.json();
        return (d?.data || (Array.isArray(d) ? d : [])).map(x => ({ symbol: t, ...x }));
      });
      const splitR = await runBatched(async t => {
        const r = await fetchT(`https://finnhub.io/api/v1/stock/split?symbol=${encodeURIComponent(t)}&from=${today}&to=${in30}&token=${encodeURIComponent(key)}`);
        if (!r.ok){ fetchFails++; return []; }
        const d = await r.json();
        return (Array.isArray(d) ? d : []).map(x => ({ symbol: t, ...x }));
      });
      const PRES_KW = /\b(conference|investor day|analyst day|presents at|presenting at|keynote|shareholder meeting|product launch|investor briefing|investor update|fireside chat|webcast|analyst meeting|annual meeting|investor presentation|to present)\b/i;
      const newsFrom = etPlus(-7);
      const presR = await runBatched(async t => {
        const r = await fetchT(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(t)}&from=${newsFrom}&to=${today}&token=${encodeURIComponent(key)}`);
        if (!r.ok){ fetchFails++; return []; }
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
      const events = [
        ...earnings.map(e => ({ type:'earnings', date: e.date, symbol: (e.symbol||'').toUpperCase(), hour: e.hour, epsEst: e.epsEstimate })),
        ...divR.flat().map(d => ({ type:'dividend', date: d.date || d.exDate || d.payDate, symbol: d.symbol, amount: d.amount, freq: d.freq, payDate: d.payDate })).filter(d => d.date && d.date >= today && d.date <= in30),
        ...splitR.flat().map(s => ({ type:'split', date: s.date, symbol: s.symbol, ratio: (s.toFactor && s.fromFactor) ? `${s.toFactor}-for-${s.fromFactor}` : (s.ratio || '—') })).filter(s => s.date && s.date >= today && s.date <= in30),
        // ziua pe ET, nu UTC — o stire publicata dupa 20:00 ET primea data de
        // MAINE (zi UTC), trecea de filtrul >= today si aparea ca eveniment viitor
        ...presR.flat().map(p => ({ type:'presentation', date: new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(new Date((p.datetime || 0) * 1000)), symbol: p.symbol, headline: p.headline, url: p.url, source: p.source }))
      ].sort((a,b) => a.date.localeCompare(b.date));
      // rezultatul PARȚIAL (unele endpoint-uri au picat) NU se cacheteaza 6h
      // ca și cum ar fi complet — se randează cu notă, refetch la următorul expand
      if (!fetchFails){
        try { localStorage.setItem(WL_EVENTS_CACHE_KEY, JSON.stringify({ ts: Date.now(), wlKey, events })); } catch (e) {}
      }
      pbRenderWlEvents(events, fetchFails ? { partial: fetchFails } : null);
    } catch (e) {
      $('pbBodyWlEvents').innerHTML = `<div class="pb-empty">⚠ Eroare fetch: ${escHtml(e.message)}</div>`;
    }
  }
  function pbRenderWlEvents(events, opts){
    const today = etToday();
    // DOAR azi → viitor (cerut explicit de Marius): „presentations" vin din știri cu
    // data PUBLICĂRII (trecut) → afișate doar dacă-s de azi; filtrul se aplică la
    // render ca să curețe și cache-ul vechi de 6h, nu doar fetch-urile noi
    events = (events || []).filter(e => e.date && e.date >= today);
    $('pbCntWlEvents').textContent = String(events.length);
    const partialNote = opts && opts.partial
      ? `<div class="pb-empty" style="color:#d4892c;padding:6px">⚠ ${opts.partial} cereri au picat — lista poate fi incompletă (necachetat, reîncearcă la următorul expand)</div>` : '';
    if (!events.length){ $('pbBodyWlEvents').innerHTML = partialNote + '<div class="pb-empty">📭 Niciun event VIITOR programat 14-30 zile pentru watchlist.</div>'; return; }
    const fmtDate = d => {
      const days = Math.round((new Date(d + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
      const dStr = new Date(d + 'T00:00:00Z').toLocaleDateString('ro-RO', { day:'2-digit', month:'short', weekday:'short' });
      const til = days === 0 ? '<b style="color:#ff4d4d">AZI</b>' : days === 1 ? '<b style="color:#d4892c">MÂINE</b>' : days < 0 ? `acum ${-days}z` : days <= 7 ? `T-${days}z` : `${days}z`;
      return { dStr, til };
    };
    $('pbBodyWlEvents').innerHTML = partialNote + `<table class="pb-table">
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
          // doar http(s) — escHtml nu blocheaza schema javascript: dintr-un URL
          // otravit de feed (localStorage-ul tine cheile API in acest origin)
          const safeU = /^https?:/i.test(String(e.url || '')) ? e.url : '';
          details = safeU ? `<a href="${escHtml(safeU)}" target="_blank" rel="noopener" style="color:var(--t1);text-decoration:none" title="${escHtml(e.headline || '')}">${escHtml(headline)}</a>${e.source ? ' · <span style="color:var(--t3)">' + escHtml(e.source) + '</span>' : ''}` : escHtml(headline);
        }
        return `<tr>
          <td class="pb-time"><span>${dt.dStr}</span><span class="t-til">${dt.til}</span></td>
          <td class="sym"><a href="https://www.tradingview.com/chart/?symbol=${escHtml(e.symbol)}" target="_blank">${escHtml(e.symbol)}</a></td>
          <td>${typeChip}</td>
          <td style="font-size:11.5px">${details}</td>
        </tr>`;
      }).join('')}</tbody></table>
      <div style="font-size:10.5px;color:var(--t3);margin-top:6px;text-align:right;font-family:var(--mono)">cache 6h · ${events.length > 20 ? 'top 20 din ' + events.length + ' entries' : events.length + ' entries'} · div/split/pres pe primele 20 tickere WL</div>`;
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
    const SRC = { 'wlm-strongbuy': '👁 WLM', 'me-early': '🌱 Events', 'me-fire': '▶ FIRE', 'me-confirmed': '🌳 Events', 'me-insider': '🏛️ Events', 'stl-ready': '🎯 STL', 'nasdaq-opp80': '🚀 Nasdaq' };
    let html = '';
    if (stlHot.length) html += `<div style="margin-bottom:7px"><span style="font-size:10.5px;color:var(--t3);font-family:var(--mono)">🎯 Smart Trade Long — scan listă &lt;24h:</span><div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px">${stlHot.map(([s, v]) => `<span class="pb-chip ${v.tier === 'READY' ? 'bull' : 'med'}">${escHtml(s)} ${v.tier === 'READY' ? '🚀 READY' : '🟢 OK'}</span>`).join('')}</div></div>`;
    if (led.length) html += `<div><span style="font-size:10.5px;color:var(--t3);font-family:var(--mono)">📒 ultimele semnale consemnate (Signal Ledger):</span>${led.map(e => `<div style="font-size:11.5px;padding:3px 0;border-bottom:1px solid rgba(42,50,71,.4)">${SRC[e.src] || escHtml(e.src)} · <b>${escHtml(e.sym)}</b> @ $${fmtNum(e.price)} <span style="color:var(--t3);font-family:var(--mono)">${escHtml(e.day)}</span></div>`).join('')}</div>`;
    return { html, n: stlHot.length + led.length };
  }
  function pbLoadNasdaqPicks(){
    let scan = null;
    try { scan = JSON.parse(localStorage.getItem('nasdaq_last_scan') || 'null'); } catch (e) {}
    const ageMin = scan ? Math.round((Date.now() - (scan.timestamp || 0)) / 60000) : null;
    const ops = (scan && Array.isArray(scan.opportunities) ? scan.opportunities : []).filter(o => o && Number(o.score) >= 65).slice(0, 8);
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
          <td class="sym"><a href="https://www.tradingview.com/chart/?symbol=${escHtml(o.symbol)}" target="_blank">${escHtml(o.symbol)}</a></td>
          <td><b style="color:${Number(o.score) >= 80 ? 'var(--green)' : (Number(o.score) >= 70 ? '#5bb0ff' : '#d4892c')}">${Number(o.score)}</b></td>
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
    const active = Object.values(sg).filter(s => s && !s.dismissed && (now - (s.ts || 0) < 24*3600000) && Array.isArray(s.tickers) && s.tickers.some(t => !(s.added || []).includes(t)));
    $('pbCntSuggestions').textContent = String(active.length);
    if (!active.length){ $('pbBodySuggestions').innerHTML = '<div class="pb-empty">📭 Nicio sugestie activă (apar la rezultate macro cu surprise ≥2.5%).</div>'; return; }
    $('pbBodySuggestions').innerHTML = active.map(s => {
      const remaining = s.tickers.filter(t => !(s.added || []).includes(t));
      const surpStr = (typeof s.surprise === 'number' && isFinite(s.surprise)) ? `${s.surprise>=0?'+':''}${s.surprise.toFixed(2)}%` : '';
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
      // dateET lipsă (format vechi) = tratat ca STALE, nu ca „de azi"
      const stale = !last.dateET || (pbTodayET() && last.dateET !== pbTodayET());
      $('pbDangerSub').innerHTML = band + (stale ? ` · <span style="color:var(--t3)">📦 din ${escHtml(String(last.dateET || '?'))}</span>` : '');
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
        dngStale = !last.dateET || !!(pbTodayET() && last.dateET !== pbTodayET());
        dngDate = last.dateET || '?';
        const band = s >= 70 ? 'PERICULOS · 0.25-0.5x' : s >= 45 ? 'RIDICAT · 0.5x' : s >= 25 ? 'MODERAT · 0.75x' : 'CALM · 1x';
        dngPhrase = `Danger ${s}/100 (${band})` + (dngStale ? ` 📦 din ${dngDate}` : '');
      }
    } catch (e) {}
    // eveniment macro high-impact azi
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
    // doar evenimentele NEconsumate — la 18:00 RO randul actional inca cerea
    // "fara intrari noi" pentru CPI-ul publicat de 3 ore
    const bigLeft = bigToday.filter(e => e.d.getTime() > Date.now() - 15*60000);
    if (bigLeft.length){
      const roT0 = bigLeft[0].d.toLocaleTimeString('ro-RO', { hour:'2-digit', minute:'2-digit' });
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
    // Number.isFinite, nu doar truthy — un chgPct lipsa/NaN dadea avg=NaN
    // si "tape mixt" fals in loc de n/a
    const pair = [spy, qqq].filter(q => q && Number.isFinite(q.chgPct));
    if (!pair.length) return null;
    const avg = pair.reduce((s, q) => s + q.chgPct, 0) / pair.length;
    let tone, cls;
    if (avg >= 0.3){ tone = 'tape ferm 🟢'; cls = 'up'; }
    else if (avg <= -0.3){ tone = 'tape slab 🔴'; cls = 'down'; }
    else { tone = 'tape mixt ⚪'; cls = ''; }
    let vixNote = '';
    // fără preț VIX finit NU afirmăm „VIX calm" — undefined pica pe ramura calm
    if (vix && Number.isFinite(vix.price)){ vixNote = vix.price >= 25 ? ' · VIX ridicat (frică)' : vix.price >= 18 ? ' · VIX moderat' : ' · VIX calm'; }
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
      // quote fără price/chgPct finite arunca în toFixed și tot render-ul murea
      // (prins de pbSafe, dar mut — secțiunea rămânea pe „încă încarcă" perpetuu)
      if (!quote || !Number.isFinite(quote.price) || !Number.isFinite(quote.chgPct)) return `<div class="pb-mkt-cell"><div class="pb-mkt-lbl">${lbl}</div><div class="pb-mkt-val">—</div><div class="pb-mkt-chg">n/a</div></div>`;
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
        const comp = (typeof r.composite === 'number' && isFinite(r.composite)) ? ` (scor ${r.composite >= 0 ? '+' : ''}${r.composite})` : '';
        lines.push(`Regim risc macro: ${r.label}${comp}${stale ? ' [ATENTIE: date VECHI, nereimprospatate azi — trateaza cu rezerva]' : ''}.`);
      }
    } catch (e) {}
    try {
      const h = JSON.parse(localStorage.getItem('md_danger_daily') || '[]');
      if (Array.isArray(h) && h.length && typeof h[h.length-1].score === 'number'){
        const last = h[h.length-1];
        const stale = !last.dateET || last.dateET !== pbTodayET();
        lines.push(`Danger Score: ${last.score}/100${stale ? ` [VECHI, din ${last.dateET || '?'} — nu e al zilei]` : ''}.`);
      }
    } catch (e) {}
    const t = pbMarketTone(), m = pbMktData();
    if (m && m.quotes){
      const q = m.quotes, f = (k) => (q[k] && Number.isFinite(q[k].chgPct)) ? `${k} ${q[k].chgPct >= 0 ? '+' : ''}${q[k].chgPct.toFixed(2)}%` : '';
      const parts = [f('SPY'), f('QQQ'), f('VIX')].filter(Boolean);
      if (parts.length) lines.push(`Piața (${m.session || ''}): ${parts.join(', ')}${t ? ` — ${t.tone}` : ''}.`);
    }
    try {
      const today = pbTodayET();
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

  // guard anti dublu-click pe "regenereaza" — doua apeluri API paralele = cost dublu
  let pbAiBusy = false;
  async function pbGenAiNote(force){
    const box = $('pbBodyAi');
    if (!box) return;
    if (pbAiBusy) return;
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
    pbAiBusy = true;
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
    finally { pbAiBusy = false; }
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
    // weekend ET: nu există bară SPY — „azi: bias LONG" sâmbăta era o intrare
    // moartă care murea apoi în skip; nu consemnăm nimic
    try {
      const wd = new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', weekday:'short' }).format(new Date());
      if (wd === 'Sat' || wd === 'Sun') return;
    } catch (e) {}
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
    if (!arr.some(e => e && e.chg == null && !e.skip && e.dateET && e.dateET < today)) return false; // nimic de evaluat → zero fetch
    const spy = await fetchYahooChart('SPY');
    if (!spy || !spy.points || spy.points.length < 2) return false;
    const dateOfTs = ts => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ts * 1000)); } catch (e) { return ''; } };
    const chgByDate = {};
    for (let i = 1; i < spy.points.length; i++){
      const prev = spy.points[i-1].close;
      if (prev > 0) chgByDate[dateOfTs(spy.points[i].ts)] = (spy.points[i].close / prev - 1) * 100;
    }
    let touched = false;
    const tradeDays = Object.keys(chgByDate).sort();
    arr.forEach(e => {
      if (!e || e.chg != null || e.skip || !e.dateET || e.dateET >= today) return;
      const chg = chgByDate[e.dateET];
      if (typeof chg === 'number'){
        e.chg = +chg.toFixed(2);
        e.hit = (e.bias && Math.abs(chg) > 0.1) ? ((e.bias === 'long') === (chg > 0)) : null;
        touched = true;
        return;
      }
      // fara bara desi au trecut 5+ zile de tranzactionare (weekend/sarbatoare)
      // sau in afara ferestrei chartului -> nu va putea fi evaluata NICIODATA;
      // marcata skip ca sa nu mai declanseze fetch SPY la fiecare load, perpetuu
      if ((tradeDays[0] && e.dateET < tradeDays[0]) || tradeDays.filter(d => d > e.dateET).length >= 5){
        e.skip = true;
        touched = true;
      }
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
        // reset stilurile inline puse de ramura CAUTION — altfel dupa
        // tranzitia CAUTION->HALTED bannerul rosu aparea cu stil amber
        el.style.background = ''; el.style.borderColor = ''; el.style.color = '';
        el.innerHTML = `🛑 GOVERNOR HALTED — ${escHtml(s.reasons[0] || 'limită atinsă')} · <a href="./journal/#desk" style="color:#ffd86b">Deschide Governor</a>`;
        GV.maybeNotifyHalted(s);
      } else if (s.verdict === 'CAUTION'){
        el.style.display = '';
        el.style.background = 'linear-gradient(90deg,#2a2010,#1d2537)';
        el.style.borderColor = '#d4892c';
        el.style.color = '#ffe8c8';
        // afișează CAUZA reală (reasons[0]) — bugetul ZILNIC poate fi 0% când
        // CAUTION vine din buget săptămânal/DD, ar induce în eroare
        const cauza = (s.reasons && s.reasons[0]) ? escHtml(s.reasons[0]) : `buget ${s.budgetUsedPct.toFixed(0)}%`;
        el.innerHTML = `⚠️ CAUTION — ${cauza} · ${s.tradesRemaining} trade-uri rămase · <a href="./journal/#desk" style="color:#ffd86b">Governor</a>`;
      } else { el.style.display = 'none'; }
    } catch (e) { el.style.display = 'none'; }
  }

  // fiecare sectiune izolata in try/catch — un throw intr-un render (cheie
  // localStorage corupta) omora altfel TOT ce urma dupa el, silentios
  function pbSafe(fn){ try { fn(); } catch (e) { console.error('pb section', e); } }
  async function pbLoadAll(){
    pbSafe(() => { $('pbRefreshInfo').textContent = '⏳ se încarcă…'; });
    pbSafe(pbLoadProDesk);
    pbSafe(pbLoadDanger);
    pbSafe(pbRenderMarket);
    pbSafe(pbRenderFreeze);
    pbSafe(pbLoadSector);
    pbSafe(pbShowAiCache);
    pbSafe(pbRenderHero);
    pbSafe(pbRenderOvernight); // instant, din snapshot-ul salvat
    pbSafe(pbLoadNasdaqPicks);
    pbSafe(pbLoadSTL);
    pbSafe(pbLoadSuggestions);
    // WL events = lazy (colapsat la coadă): se încarcă doar dacă drill-down-ul e deschis — economisește cota Finnhub
    const wlDet = $('pbWlEvDet');
    await Promise.allSettled([pbLoadRisk(), pbLoadMacroEvents(), pbLoadEarnings(), (wlDet && wlDet.open) ? pbLoadWlEvents() : Promise.resolve()]);
    pbSafe(pbRenderHero); // recompune după ce regimul/danger sunt proaspete în localStorage
    pbSafe(pbLoadProDesk);
    pbSafe(pbSnapshotDaily); // consemnează starea zilei (după refresh-ul surselor)
    pbSafe(pbRenderOvernight);
    pbSafe(pbTrackSnapshot); // verdictul zilei (regim proaspăt) — o dată/zi
    pbSafe(pbTrackRender);
    pbTrackEvaluate().then(ch => { if (ch) pbTrackRender(); }).catch(() => {}); // evaluează zilele trecute (fetch DOAR dacă e ceva pending)
    pbSafe(() => { $('pbRefreshInfo').textContent = `🔄 ultim refresh: ${new Date().toLocaleTimeString('ro-RO')}`; });
  }
  window.addEventListener('hub:market', () => { pbRenderMarket(); pbRenderHero(); renderHubCockpit(); });

  let pbLoaded = false;
  // Hydrate brief even when <details> e pliat — DOM-ul există oricum.
  // Înainte: doar la open → race lazy-load închidea brief-ul și nu mai rula
  // pbLoadAll (hero rămânea pe „se compune…", risk pe ⏳).
  function pbEnsure(force){
    if (pbLoaded && !force) return;
    pbLoaded = true;
    pbLoadAll();
  }
  function setPbTab(tabId){
    const wrap = $('pbWrap');
    if (!wrap) return;
    const id = tabId || 'desk';
    wrap.querySelectorAll('[data-pb-tab]').forEach(t => {
      const on = t.getAttribute('data-pb-tab') === id;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    wrap.querySelectorAll('[data-pb-panel]').forEach(p => {
      const on = p.getAttribute('data-pb-panel') === id;
      p.classList.toggle('on', on);
      if (on) p.removeAttribute('hidden');
      else p.setAttribute('hidden', '');
    });
    try { localStorage.setItem('pb_tab', id); } catch (e) {}
    // lazy: WL events doar pe tab Scan dacă e expandat
    if (id === 'scan'){
      const wl = $('pbWlEvDet');
      if (wl && wl.open) pbLoadWlEvents();
    }
  }

  function bindPlaybookEvents(){
    const wrap = $('pbWrap');
    if (!wrap) return;
    wrap.addEventListener('toggle', () => {
      if (!pbModeToggling){ try { localStorage.setItem('pb_open', wrap.open ? '1' : '0'); } catch (e) {} }
      pbEnsure(false);
    });
    // taburi mici grupate (Desk / Piață / Scan / AI)
    wrap.addEventListener('click', e => {
      const tab = e.target.closest('[data-pb-tab]');
      if (!tab || !wrap.contains(tab)) return;
      e.preventDefault();
      e.stopPropagation();
      setPbTab(tab.getAttribute('data-pb-tab'));
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
      const savedTab = localStorage.getItem('pb_tab') || 'desk';
      setPbTab(savedTab);
    } catch (e) { setPbTab('desk'); }
    // I-212: Brief pliat by default — decision surface rămâne clean.
    // DAR: (1) preferință LS, (2) user l-a deschis ÎNAINTE de lazy-load HB
    // (toggle pe index → loadHubBrief → init) — NU forța close pe wrap deja open.
    try {
      const prefOpen = localStorage.getItem('pb_open') === '1';
      if (prefOpen || wrap.open) {
        wrap.open = true;
        try { localStorage.setItem('pb_open', '1'); } catch (e2) {}
      } else {
        wrap.open = false;
      }
    } catch (e) { /* lasă starea curentă a details */ }
    // Datele brief se umplu mereu (pliat sau nu) — expand = instant, fără ⏳ etern
    pbEnsure(false);
  }

  // I-215: 4 layout-uri (pre|rth|after|review). Lock opțional în LS; altfel SES.
  // 'auto' / gol / null → rezolvare din sesiune NYSE.
  function getSessionModeLock(){
    try {
      const o = localStorage.getItem('hub_session_mode');
      if (o === 'pre' || o === 'rth' || o === 'after' || o === 'review') return o;
      if (o === 'auto' || o === '' || o == null) return 'auto';
      // legacy: valori vechi necunoscute → auto
    } catch (e) {}
    return 'auto';
  }
  function resolveSessionFromMarket(){
    let s = null;
    if (global.SES && SES.info){
      try { s = SES.info().state; } catch (e) {}
    }
    if (!s) s = (window.__hubMkt && window.__hubMkt.session) || 'rth';
    if (s === 'pre') return 'pre';
    if (s === 'after') return 'after';
    if (s === 'weekend' || s === 'closed' || s === 'holiday') return 'review';
    return 'rth';
  }
  function getHubSessionMode(){
    const lock = getSessionModeLock();
    if (lock !== 'auto') return lock;
    return resolveSessionFromMarket();
  }
  // Launch chips reordered pe sesiune (I-215) — nu ascunde, doar promovează
  const LAUNCH_ORDER = {
    pre:    ['nasdaq', 'events', 'macro', 'wl', 'stl', 'desk', 'router', 'portfolio', 'journal', 'alerts', 'sector', 'weekly', 'health'],
    rth:    ['desk', 'router', 'portfolio', 'journal', 'nasdaq', 'alerts', 'wl', 'stl', 'macro', 'events', 'sector', 'weekly', 'health'],
    after:  ['portfolio', 'journal', 'desk', 'nasdaq', 'weekly', 'router', 'alerts', 'wl', 'stl', 'macro', 'events', 'sector', 'health'],
    review: ['weekly', 'journal', 'portfolio', 'desk', 'health', 'router', 'nasdaq', 'macro', 'alerts', 'wl', 'stl', 'events', 'sector']
  };
  function applyLaunchOrder(mode){
    const nav = $('hubLaunch');
    if (!nav) return;
    const order = LAUNCH_ORDER[mode] || LAUNCH_ORDER.rth;
    const chips = Array.from(nav.querySelectorAll('.hub-launch-chip[data-launch]'));
    if (!chips.length) return;
    const byKey = {};
    chips.forEach(c => { byKey[c.getAttribute('data-launch')] = c; });
    order.forEach((k, i) => {
      const el = byKey[k];
      if (!el) return;
      el.style.order = String(i);
      el.classList.toggle('pri', i < 4);
    });
    // orice chip necunoscut la final
    chips.forEach(c => {
      const k = c.getAttribute('data-launch');
      if (order.indexOf(k) < 0) c.style.order = '99';
    });
    paintLaunchMore();
  }
  function paintLaunchMore(){
    const nav = $('hubLaunch');
    const menu = $('hubLaunchMore');
    const btn = $('hubLaunchMoreBtn');
    if (!nav || !menu || !btn) return;
    menu.innerHTML = '';
    nav.querySelectorAll('.hub-launch-chip[data-launch]').forEach(c => {
      if (c.classList.contains('pri')) return;
      const a = c.cloneNode(true);
      a.className = 'hub-launch-menu-item';
      a.style.order = '';
      menu.appendChild(a);
    });
    btn.style.order = '50';
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }
  function wireLaunchMore(){
    const btn = $('hubLaunchMoreBtn');
    const menu = $('hubLaunchMore');
    if (!btn || !menu || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const open = menu.hidden;
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    });
  }
  function paintSessPnl(){
    const el = $('hubSessPnl');
    if (!el) return;
    let pnl = null, left = null, verdict = '';
    try {
      if (global.GV && GV.status) {
        const s = GV.status();
        if (s && Number.isFinite(s.todayPnl)) {
          pnl = s.todayPnl;
          left = Number.isFinite(s.budgetLeftUsd) ? s.budgetLeftUsd : null;
          verdict = s.verdict || '';
        }
      }
    } catch (e) {}
    if (pnl == null) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const sign = pnl >= 0 ? '+' : '';
    el.textContent = 'PnL ' + sign + '$' + pnl.toFixed(0)
      + (left != null ? ' · R $' + Math.round(left) : '');
    el.className = 'hub-sess-pnl'
      + (pnl < 0 ? ' neg' : pnl > 0 ? ' pos' : '')
      + (verdict === 'HALTED' ? ' halt' : '');
    const mode = getHubSessionMode();
    el.classList.toggle('emph', mode === 'after' || mode === 'review' || verdict === 'HALTED');
  }
  function paintSessBar(){
    const bar = $('hubSessBar');
    if (!bar) return;
    const lock = getSessionModeLock();
    const mode = getHubSessionMode();
    bar.dataset.resolved = mode;
    bar.dataset.lock = lock;
    const lbl = $('hubSessLbl');
    if (lbl){
      const names = { pre: 'PRE', rth: 'RTH', after: 'AH', review: 'REVIEW' };
      lbl.textContent = lock === 'auto' ? ('AUTO · ' + (names[mode] || mode)) : ('LOCK · ' + (names[mode] || mode));
    }
    bar.querySelectorAll('[data-hub-mode-set]').forEach(btn => {
      const v = btn.getAttribute('data-hub-mode-set');
      const on = (v === 'auto' && lock === 'auto') || (v !== 'auto' && lock === v);
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    paintSessPnl();
  }
  // Catalog open preferințe per mode (I-215 follow-up)
  const CAT_OPEN_KEY = 'hub_catalog_open_v2';
  function readCatOpenMap(){
    try {
      const o = JSON.parse(localStorage.getItem(CAT_OPEN_KEY) || '{}');
      return o && typeof o === 'object' ? o : {};
    } catch (e) { return {}; }
  }
  function writeCatOpen(mode, open){
    try {
      const m = readCatOpenMap();
      m[mode] = open ? 1 : 0;
      localStorage.setItem(CAT_OPEN_KEY, JSON.stringify(m));
    } catch (e) {}
  }
  function applyCatalogForMode(mode){
    const cat = $('hubCatalogFold');
    if (!cat) return;
    const map = readCatOpenMap();
    // default: tot timpul pliat — catalogul e magazin, nu first paint (I-332)
    let want = map[mode];
    if (want == null) want = 0;
    pbSetOpen(cat, !!want);
  }
  function wireCatalogMode(){
    const cat = $('hubCatalogFold');
    if (!cat || cat.dataset.catWired) return;
    cat.dataset.catWired = '1';
    cat.addEventListener('toggle', () => {
      if (pbModeToggling) return;
      writeCatOpen(getHubSessionMode(), cat.open);
    });
  }
  function wireSessBar(){
    const bar = $('hubSessBar');
    if (!bar || bar.dataset.wired) return;
    bar.dataset.wired = '1';
    bar.addEventListener('click', e => {
      const btn = e.target.closest('[data-hub-mode-set]');
      if (!btn) return;
      const v = btn.getAttribute('data-hub-mode-set');
      try {
        if (v === 'auto') localStorage.setItem('hub_session_mode', 'auto');
        else if (v) localStorage.setItem('hub_session_mode', v);
      } catch (err) {}
      applyHubSessionMode();
    });
  }

  // ── 5 min pre-market card (hub) ──
  const PRE5_KEY = 'tt_hub_pre5_v1';
  function pre5Day(){
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function pre5LoadManual(){
    try {
      const o = JSON.parse(localStorage.getItem(PRE5_KEY) || '{}') || {};
      if (o.day !== pre5Day()) return { day: pre5Day() };
      return o;
    } catch (e) { return { day: pre5Day() }; }
  }
  function pre5SaveManual(o){
    try { localStorage.setItem(PRE5_KEY, JSON.stringify(o)); } catch (e) {}
  }
  function pre5Statuses(){
    // auto din suite + manual bifări
    const man = pre5LoadManual();
    let sess = '—', sessState = '';
    try {
      if (global.SES && SES.info) {
        const s = SES.info();
        sessState = s.state || '';
        sess = s.label || s.state || '—';
      } else if (global.HM && HM.usSession) {
        sessState = HM.usSession();
        sess = sessState;
      }
    } catch (e) {}
    let trustOk = null, freeze = false, spyAge = null;
    try {
      if (global.HS && HS.dataTrust) {
        const t = HS.dataTrust();
        trustOk = t.pct != null ? t.pct >= 50 && !t.degraded : null;
      }
    } catch (e) {}
    try {
      if (global.HS && HS.hubState) {
        const c = HS.hubState().rtPayload && HS.hubState().rtPayload.context;
        freeze = !!(c && c.macroFreeze && c.macroFreeze.active);
      }
    } catch (e) {}
    try {
      if (global.QB && QB.ageMs) {
        const a = QB.ageMs('SPY');
        if (a != null) spyAge = Math.round(a / 1000);
      }
    } catch (e) {}
    let govV = null, govOk = null;
    try {
      if (global.GV && GV.status) {
        const g = GV.status();
        govV = g.verdict || null;
        govOk = g.verdict === 'TRADE';
      }
    } catch (e) {}
    let riskPct = null, riskOk = null, riskHalt = null;
    try {
      if (global.CD && CD.unified) {
        const pf = CD.unified().portfolio || {};
        riskPct = pf.riskPct;
        if (riskPct != null) {
          riskOk = riskPct < 2;
          riskHalt = riskPct >= 4;
        }
      }
    } catch (e) {}
    let mcCrit = null, mcDone = null, mcTotal = null;
    try {
      if (global.MC && MC.items) {
        const m = MC.items();
        mcDone = m.done; mcTotal = m.total;
        mcCrit = global.MC.criticalOk ? MC.criticalOk() : null;
      }
    } catch (e) {}
    let naTitle = '';
    try {
      const na = $('hubNextAction');
      const t = na && na.querySelector('.hub-na-title');
      if (t) naTitle = (t.textContent || '').trim();
    } catch (e) {}
    const gappersVisible = (() => {
      try {
        const el = $('hubGappersSlot');
        return !!(el && el.style.display !== 'none' && el.innerHTML && el.innerHTML.indexOf('ht-gappers-empty') < 0 && el.querySelector('.ht-gap-chip, a[data-sctx-sym], .ht-gappers-scroll'));
      } catch (e) { return false; }
    })();
    const isPre = sessState === 'pre' || getHubSessionMode() === 'pre';
    return {
      man, sess, sessState, isPre, trustOk, freeze, spyAge,
      govV, govOk, riskPct, riskOk, riskHalt, mcCrit, mcDone, mcTotal,
      naTitle, gappersVisible
    };
  }
  function pre5StBadge(cls, text){
    return '<span class="p5-st ' + cls + '">' + escHtml(text) + '</span>';
  }
  function renderPre5(){
    const root = $('hubPre5');
    const stepsEl = $('hubPre5Steps');
    const gateEl = $('hubPre5Gate');
    const progEl = $('hubPre5Prog');
    if (!root || !stepsEl) return;
    const st = pre5Statuses();
    const man = st.man;

    // step statuses
    let s1cls = 'neut', s1txt = 'verifică strip';
    if (st.freeze) { s1cls = 'bad'; s1txt = 'FREEZE activ'; }
    else if (st.trustOk === false) { s1cls = 'warn'; s1txt = 'trust slab / date stale'; }
    else if (st.spyAge != null && st.spyAge < 120) { s1cls = 'ok'; s1txt = 'SPY ' + st.spyAge + 's · no freeze'; }
    else if (st.trustOk === true) { s1cls = 'ok'; s1txt = 'platform OK'; }

    let s2cls = 'neut', s2txt = st.naTitle ? st.naTitle.slice(0, 48) : 'citește Next Action';
    if (/halt|stop|nu forța|stand|review|închis/i.test(st.naTitle)) { s2cls = 'warn'; }
    else if (st.naTitle) { s2cls = 'ok'; }

    let s3cls = 'neut', s3txt = 'Governor / risc';
    if (st.govOk === false || st.riskHalt) {
      s3cls = 'bad';
      s3txt = (st.govV || '—') + (st.riskPct != null ? ' · risc ' + st.riskPct.toFixed(1) + '%' : '');
    } else if (st.govOk && st.riskOk !== false) {
      s3cls = 'ok';
      s3txt = 'TRADE' + (st.riskPct != null ? ' · risc ' + st.riskPct.toFixed(1) + '%' : '');
    } else if (st.govOk && st.riskOk === false) {
      s3cls = 'warn';
      s3txt = 'TRADE dar risc ridicat ' + (st.riskPct != null ? st.riskPct.toFixed(1) + '%' : '');
    }

    let s4cls = st.isPre ? (st.gappersVisible ? 'ok' : 'warn') : 'neut';
    let s4txt = st.isPre
      ? (st.gappersVisible ? 'gappers vizibili' : 'pre · așteaptă gappers / Finnhub')
      : ('sesiune: ' + (st.sess || '—') + ' (gappers doar Pre/AH)');

    const manGappers = !!man.gappers;
    const manSetup = !!man.setup;
    const manPlan = !!man.plan;
    const manStand = !!man.stand;

    const steps = [
      {
        min: '0–1 min',
        do: 'Health (pill DATE LIVE) + REGIM/DANGER în header. Dacă e roșu → nu tradezi pe date putrede.',
        badge: pre5StBadge(s1cls, s1txt),
        man: null
      },
      {
        min: '1 min',
        do: 'Citește <b>Next Action</b> (un singur CTA). Dacă zice stai / nu forța / HALT → urmezi asta.',
        badge: pre5StBadge(s2cls, s2txt),
        man: null
      },
      {
        min: '1–2 min',
        do: 'Poți tranzacționa? Governor TRADE + risc agregat (ideal &lt;2%, stop ~4%). Checklist ✓ pe DATE LIVE.',
        badge: pre5StBadge(s3cls, s3txt)
          + (st.mcTotal != null ? pre5StBadge(st.mcCrit ? 'ok' : 'warn', '✓ ' + st.mcDone + '/' + st.mcTotal) : ''),
        man: null
      },
      {
        min: '2–3 min',
        do: 'SPY/QQQ/VIX + evenimente. Gappers (rând DATE LIVE, doar Pre/AH) — max 1–3 tickere, nu 10 chase-uri.',
        badge: pre5StBadge(s4cls, s4txt),
        man: { id: 'gappers', label: 'Am notat max 1–3 gappers / skip', done: manGappers }
      },
      {
        min: '3–4 min',
        do: 'Un ticker: Nasdaq FOCUS / STL / earnings. Nu mări size dacă GO/Next Action e slab.',
        badge: pre5StBadge(manSetup ? 'ok' : 'neut', manSetup ? 'bifată' : 'opțional'),
        man: { id: 'setup', label: 'Am filtrat setup-ul (sau skip)', done: manSetup }
      },
      {
        min: '4–5 min',
        do: 'Dacă treci filtrul: Journal Exec (entry/SL/size) → buy la broker. Altfel stand-down = outcome bun.',
        badge: pre5StBadge(manPlan || manStand ? 'ok' : 'neut', manPlan ? 'plan' : (manStand ? 'stand-down' : 'alege')),
        man: null,
        man2: [
          { id: 'plan', label: 'Plan / exec notat', done: manPlan },
          { id: 'stand', label: 'Stand-down azi (no trade pre)', done: manStand }
        ]
      }
    ];

    stepsEl.innerHTML = steps.map((s, i) => {
      let manHtml = '';
      if (s.man) {
        manHtml = '<label class="p5-man"><input type="checkbox" data-pre5="' + s.man.id + '"'
          + (s.man.done ? ' checked' : '') + '/> <span>' + escHtml(s.man.label) + '</span></label>';
      }
      if (s.man2) {
        manHtml = s.man2.map(m =>
          '<label class="p5-man"><input type="checkbox" data-pre5="' + m.id + '"'
          + (m.done ? ' checked' : '') + '/> <span>' + escHtml(m.label) + '</span></label>'
        ).join('');
      }
      return '<li><span class="p5-min">' + escHtml(s.min) + '</span>'
        + '<span class="p5-do">' + s.do + '</span><div>' + s.badge + '</div>' + manHtml + '</li>';
    }).join('');

    stepsEl.querySelectorAll('[data-pre5]').forEach(cb => {
      cb.addEventListener('change', () => {
        const o = pre5LoadManual();
        o.day = pre5Day();
        o[cb.getAttribute('data-pre5')] = cb.checked;
        pre5SaveManual(o);
        renderPre5();
      });
    });

    // gate verdict
    let gateCls = 'caution', gateTxt = '⚠️ CAUTION — verifică pașii roșii înainte de size';
    if (st.freeze || st.govOk === false || st.riskHalt) {
      gateCls = 'halt';
      gateTxt = '🛑 NO-GO — freeze / Governor HALT / risc ≥4%. Size 0 pe setup-uri noi.';
    } else if (st.govOk && st.riskOk !== false && !st.freeze && (st.trustOk !== false)) {
      gateCls = 'go';
      gateTxt = '✅ POARTĂ DESCHISĂ (condițional) — max 1 setup, size din R, SL obligatoriu. Nu e semnal buy.';
    }
    if (gateEl) {
      gateEl.className = 'hub-pre5-gate ' + gateCls;
      gateEl.textContent = gateTxt;
    }

    // progress: auto critical + manuals
    let score = 0, max = 4;
    if (s1cls === 'ok') score++;
    if (s2cls === 'ok' || s2cls === 'warn') score++; // citit e ok chiar dacă warn
    if (s3cls === 'ok') score++;
    if (manGappers || manSetup || manPlan || manStand) score++;
    if (s1cls === 'bad' || s3cls === 'bad') { /* keep */ }
    const pct = Math.round(score / max * 100);
    if (progEl) {
      progEl.textContent = score + '/' + max + ' · ' + pct + '%';
      progEl.className = 'hub-pre5-prog ' + (s1cls === 'bad' || s3cls === 'bad' ? 'bad' : (score >= 3 ? 'ok' : (score >= 2 ? 'warn' : 'neut')));
    }
  }
  // schimbarile PROGRAMATICE de open nu trebuie persistate de listener-ele
  // de toggle ca preferinta userului (auto-close pe 'pre' suprascria permanent
  // pb_open='0' / hub_pre5_open; toggle-ul pe <details> e async)
  let pbModeToggling = false;
  function pbSetOpen(el, open){
    if (!el || el.open === open) return;
    pbModeToggling = true;
    el.open = open;
    setTimeout(() => { pbModeToggling = false; }, 0);
  }
  function wirePre5(){
    const root = $('hubPre5');
    if (!root || root.dataset.wired) return;
    root.dataset.wired = '1';
    const ref = $('hubPre5Refresh');
    if (ref) ref.addEventListener('click', e => { e.preventDefault(); renderPre5(); });
    const rst = $('hubPre5Reset');
    if (rst) rst.addEventListener('click', e => {
      e.preventDefault();
      pre5SaveManual({ day: pre5Day() });
      renderPre5();
    });
    root.addEventListener('toggle', () => {
      if (pbModeToggling) return;
      if (root.open) renderPre5();
      try { localStorage.setItem('hub_pre5_open', root.open ? '1' : '0'); } catch (e) {}
    });
  }
  function applyPre5ForMode(mode){
    const root = $('hubPre5');
    if (!root) return;
    wirePre5();
    // Pre: deschis by default; alte moduri: respectă preferința user
    let pref = null;
    try { pref = localStorage.getItem('hub_pre5_open'); } catch (e) {}
    if (mode === 'pre') {
      if (pref !== '0') pbSetOpen(root, true);
    } else if (pref === '1') {
      pbSetOpen(root, true);
    } else {
      pbSetOpen(root, false);
    }
    try { renderPre5(); } catch (e) {}
  }
  function applyHubSessionMode(){
    const mode = getHubSessionMode();
    document.body.dataset.hubMode = mode;
    wireSessBar();
    wireCatalogMode();
    wireLaunchMore();
    paintSessBar();
    applyLaunchOrder(mode);
    applyCatalogForMode(mode);
    applyPre5ForMode(mode);

    let pref = null;
    try { pref = localStorage.getItem('pb_open'); } catch (e) {}

    const pb = $('pbWrap');
    const sl = $('slWrap');
    const cl = $('hubChecklist');

    // Pre: gappers (în tableau) + checklist + events — brief pliat
    if (mode === 'pre'){
      if (pref !== '1' && pb) pbSetOpen(pb, false);
      if (sl) pbSetOpen(sl, false);
      if (cl){
        cl.style.display = 'flex';
        cl.dataset.expanded = '1';
        renderChecklist();
      }
    }
    // RTH: risk open + GO + freeze — checklist off, brief pliat
    if (mode === 'rth'){
      if (pref !== '1' && pb) pbSetOpen(pb, false);
      if (sl) pbSetOpen(sl, false);
      if (cl){
        cl.style.display = 'none';
        cl.dataset.expanded = '0';
      }
    }
    // AH: gappers after + PnL zi (chip pe bară) — brief pliat
    if (mode === 'after'){
      if (pref !== '1' && pb) pbSetOpen(pb, false);
      if (sl) pbSetOpen(sl, false);
      if (cl){
        cl.style.display = 'none';
        cl.dataset.expanded = '0';
      }
    }
    // Review: tot pliat — ledger/catalog nu mai sar deasupra launch-ului
    if (mode === 'review'){
      try { setPbTab('scan'); } catch (e) {}
      if (cl){
        cl.style.display = 'none';
        cl.dataset.expanded = '0';
      }
      if (sl) pbSetOpen(sl, false);
    }

    if (global.HT && HT.render) HT.render();
  }

  function updateSessionPill(){
    // pe hub, HM.updateSessionPillTimer rescrie acelasi pill la fiecare 1s cu
    // alt format — doi scriitori insemnau flicker; HM e sursa unica acolo
    if (global.HM && HM.usSession) return;
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
    // I-215: checklist doar Pre (dimineața); RTH/AH/Review ascuns
    if (mode !== 'pre'){
      cl.style.display = 'none';
      return;
    }
    if (!expanded){
      cl.style.display = 'none';
      return;
    }
    cl.style.display = 'flex';
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
    try { if (global.HNA && HNA.render) HNA.render(); } catch (e) {}
    try { if (global.HUB_HEALTH && HUB_HEALTH.renderStrip) HUB_HEALTH.renderStrip(); } catch (e) {}
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
      // I-206 Data Trust: GO ferm pe date stale = minciună — degradăm vizual
      let trust = null;
      try { trust = (global.HS && HS.dataTrust) ? HS.dataTrust() : null; } catch (e) {}
      const goClsShown = (trust && trust.degraded && p.goCls === 'go') ? 'caution' : (p.goCls || 'caution');
      $('hubGoNum').textContent = p.goScore + (trust && trust.degraded ? '*' : '');
      $('hubGoNum').className = 'hub-go-num ' + goClsShown;
      $('hubGoLbl').textContent = p.goLabel+' · '+p.goScore+'/100' + (trust && trust.degraded ? ' · date⚠' : '');
      const trEl = $('hubTrustRow');
      if (trEl && trust){
        const col = trust.degraded ? '#d4892c' : 'var(--t3)';
        const staleTxt = trust.items.length ? ' — stale: ' + trust.items.slice(0, 3).map(i => i.label).join(' · ') : '';
        trEl.innerHTML = '<span style="color:' + col + '">🔎 Încredere date: ' + trust.fresh + '/' + trust.total + ' surse fresh' + escHtml(staleTxt) + '</span>';
        trEl.title = trust.degraded ? 'GO score marcat cu * — decizia se ia pe surse parțial vechi' : 'Toate sursele decizionale sunt proaspete';
      }
      const gCol = goClsShown==='go'?'var(--green)':goClsShown==='caution'?'#d4892c':'#ff4d4d';
      const fill = $('hubGoFill');
      if (fill){ fill.style.width=(p.goScore||0)+'%'; fill.style.background=gCol; }
      $('hubBlockers').innerHTML = (p.blockers||[]).slice(0,3).map(b=>'<span class="hub-block '+escHtml(b.cls)+'">'+escHtml(b.text)+'</span>').join('');
      $('hubPlan').textContent = (p.reasons&&p.reasons[0]) ? p.reasons[0] : (p.matchedNote||'Deschide Router pentru plan complet');
      const sum = $('hubCockpitSum');
      if (sum) {
        // I-212: sumarul NU mai concurează Next Action — e „detalii Router”, nu al doilea GO dominant
        const sd = c.sessionDetail || {};
        const blk = (p.blockers||[]).slice(0,2).map(b => b.text).join(' · ');
        const trustChip = trust
          ? ' · 🔎 ' + trust.fresh + '/' + trust.total + (trust.degraded ? '⚠' : '')
          : '';
        sum.innerHTML = '🧭 <b>Detalii Router</b> · GO ' + p.goScore + (trust && trust.degraded ? '*' : '') +
          ' ' + escHtml(p.goLabel) +
          ' · ' + escHtml(p.strategy || '—') +
          ' · ' + escHtml(c.sessionLabel||'—') + (sd.countdown ? ' ' + escHtml(sd.countdown) : '') +
          trustChip +
          (blk ? ' · <span style="color:var(--t3)">' + escHtml(blk) + '</span>' : '') +
          ' <span class="hub-cockpit-sum-hint">expand</span>';
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
    } catch(e){
      // catch-ul mut lăsa pe ecran valorile randării PRECEDENTE (GO score,
      // strategy) fără niciun indiciu că widget-ul principal a murit
      console.error('renderHubCockpit:', e);
      try {
        const st = $('hubStrat'), gn = $('hubGoNum'), gl = $('hubGoLbl');
        if (st) st.textContent = '⚠ modul cockpit a picat';
        if (gn){ gn.textContent = 'n/a'; gn.className = 'hub-go-num caution'; }
        if (gl) gl.textContent = 'eroare — reîncarcă (Ctrl+F5)';
      } catch (e2) {}
    }
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
    try { paintSessPnl(); } catch (e) {}
    try { renderPre5(); } catch (e) {}
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
    bindPlaybookEvents(); // include pbEnsure → pbLoadAll
    applyHubSessionMode();
    updateSessionPill();
    renderHubCockpit();
    // safety: dacă bind a eșuat pe un nod lipsă, tot forțăm un refresh
    if (!pbLoaded) pbEnsure(true);
    let lastMode = getHubSessionMode();
    setInterval(()=>{
      try{
        if (typeof global.hubRefreshMarketQuotes === 'function') hubRefreshMarketQuotes();
        pbRenderFreeze();
        // I-215 Auto: re-aplică layout când SES trece pre→rth→ah→review
        const m = getHubSessionMode();
        if (m !== lastMode){
          lastMode = m;
          applyHubSessionMode();
        } else {
          paintSessBar();
        }
        renderHubCockpit();
      }catch(e){}
    }, 60000);
  }

  global.HB = {
    init: initHubBrief,
    refresh: pbLoadAll,
    renderCockpit: renderHubCockpit,
    sessionMode: getHubSessionMode,
    sessionModeLock: getSessionModeLock,
    applySessionMode: applyHubSessionMode,
    updateSessionPill,
    renderChecklist,
    renderPre5
  };

})(typeof window !== 'undefined' ? window : global);
