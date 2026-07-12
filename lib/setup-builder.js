// setup-builder.js — Pre-Trade Setup Builder (SB.*)
// Niveluri via SL.* · regim/danger via MCTX.* · draft md_signal_journal · prefill exec JR
(function(global){
  'use strict';

  const JOURNAL_KEY = 'md_signal_journal';
  const PREFILL_KEY = 'md_setup_prefill';
  const COIN_TICKERS = new Set([
    'BTC','ETH','SOL','BNB','XRP','ADA','DOGE','LINK','MATIC','AVAX','DOT','TRX','LTC','BCH',
    'SHIB','PEPE','ATOM','UNI','NEAR','APT','ARB','OP','SUI','INJ','TIA','SEI','RNDR','FET'
  ]);

  let $ = id => document.getElementById(id);
  let escHtml = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let toast = () => {};
  let onOpenExec = null;
  let onTabSetup = null;

  let _setupDir = 'long';
  let _lastSetup = null;
  let _setupLevels = null;

  function tickerToYahoo(t){
    if (COIN_TICKERS.has(t)) return t + '-USD';
    return t;
  }

  function dangerSizeMult(score){
    return score >= 70 ? 0.35 : score >= 45 ? 0.5 : score >= 25 ? 0.75 : 1;
  }

  function readDanger(){
    if (global.MCTX?.danger){
      const d = global.MCTX.danger();
      return { score: d.score != null ? d.score : 35, mult: d.mult || '1x', stale: d.stale };
    }
    return { score: 35, mult: '1x', stale: true };
  }

  function readRegime(){
    if (global.MCTX?.regime) return global.MCTX.regime();
    return { label: 'n/a', composite: null, partial: true };
  }

  function stockSym(ticker){
    return String(ticker || '').toUpperCase().replace(/-USD$/i, '');
  }

  function findCatalysts(ticker){
    const out = [];
    if (global.MCTX?.eventsUpcoming){
      const ups = global.MCTX.eventsUpcoming({ limit: 5, winFutureMs: 48 * 3600000 });
      const hi = ups.find(e => e.impact === 'high');
      if (hi){
        const h = hi.tilMs < 7200000 ? Math.round(hi.tilMs / 60000) + 'm' : '~' + Math.round(hi.tilMs / 3600000) + 'h';
        out.push('📅 Macro: ' + hi.event + ' în ' + h + ' — poate mișca piața');
      }
    }
    if (global.JI?.earningsBadge){
      const sym = stockSym(ticker);
      const eb = global.JI.earningsBadge(sym);
      if (eb) out.push('📊 ' + eb + ' — risc binar / gap');
    }
    return out;
  }

  function readDeskSizing(){
    if (!global.GV?.cfg) return null;
    const c = global.GV.cfg();
    const riskPct = c.maxTradesDay > 0
      ? Math.max(0.25, Math.round((c.maxLossPctDay / c.maxTradesDay) * 100) / 100)
      : 1;
    return { account: c.accountSize, riskPct };
  }

  function syncFromDesk(){
    const d = readDeskSizing();
    if (!d) return false;
    if ($('setupAccount')) $('setupAccount').value = d.account;
    if ($('setupRisk')) $('setupRisk').value = d.riskPct;
    syncDeskBadge();
    if (_setupLevels?.L) refreshSetupDisplay();
    return true;
  }

  function deskMismatch(){
    const d = readDeskSizing();
    if (!d) return false;
    const acct = parseFloat($('setupAccount')?.value);
    const risk = parseFloat($('setupRisk')?.value);
    return Math.abs(acct - d.account) > 1 || Math.abs(risk - d.riskPct) > 0.05;
  }

  function syncDeskBadge(){
    const b = $('setupDeskBadge');
    if (!b) return;
    if (deskMismatch()){ b.style.display = ''; b.textContent = '≠ Desk'; }
    else { b.style.display = 'none'; }
  }

  function computeVerdict(rrStruct, noHeadroom, okCount, totalChecks, dangerScore){
    if (noHeadroom || (rrStruct != null && rrStruct < 1))
      return { verdict: 'SKIP', label: 'SKIP', cls: 'skip', tip: 'R:R structural slab sau fără headroom 20z — așteaptă pullback sau alt ticker.' };
    if (rrStruct >= 1 && dangerScore < 45 && okCount >= totalChecks - 1)
      return { verdict: 'GO', label: 'GO', cls: 'go', tip: 'Confluență + R:R 20z + Danger OK — validare pe grafic înainte de execuție.' };
    return { verdict: 'WAIT', label: 'WAIT', cls: 'wait', tip: 'Headroom sau confluență marginală — reduce sizing sau așteaptă setup mai curat.' };
  }

  function buildPriceMapHtml(entry, sl, tp1, tp2, tp3, zone20, isLong){
    const pts = [sl, entry, tp1, tp2, tp3, zone20].filter(v => v != null && isFinite(v));
    if (pts.length < 2) return '';
    const lo = Math.min(...pts), hi = Math.max(...pts);
    const span = hi - lo || 1;
    const pct = v => ((v - lo) / span * 100).toFixed(2);
    const zoneLo = isLong ? entry : zone20;
    const zoneHi = isLong ? zone20 : entry;
    const zL = pct(Math.min(zoneLo, zoneHi)), zW = Math.max(0.5, Math.abs(pct(zoneHi) - pct(zoneLo)));
    const mk = (v, cls, title) => '<div class="setup-map-marker ' + cls + '" style="left:' + pct(v) + '%" title="' + escHtml(title) + '"></div>';
    return '<div class="setup-section-h">🗺️ Hartă preț (20z)</div><div class="setup-map"><div class="setup-map-track">'
      + '<div class="setup-map-zone" style="left:' + zL + '%;width:' + zW + '%"></div>'
      + mk(sl, 'sl', 'SL') + mk(entry, 'entry', 'Entry') + mk(tp1, 'tp', 'TP1') + mk(tp3, 'tp', 'TP3')
      + (zone20 != null ? mk(zone20, 'z20', isLong ? 'Hi20' : 'Lo20') : '')
      + '</div></div><div class="setup-map-labels"><span>SL</span><span>Entry</span><span>TP1</span><span>' + (isLong ? 'Hi20' : 'Lo20') + '</span></div>';
  }

  function renderFreezeBanner(){
    const el = $('setupFreezeBanner');
    if (!el || !global.MCTX?.eventsUpcoming) return;
    const now = Date.now();
    const ups = global.MCTX.eventsUpcoming({ limit: 20, winPastMs: 20 * 60000, winFutureMs: 3 * 3600000 });
    const hi = ups.filter(e => e.impact === 'high');
    const recent = hi.find(e => e.tilMs < 0 && e.tilMs > -15 * 60000);
    if (recent){
      el.style.display = '';
      el.className = 'setup-freeze freeze';
      el.innerHTML = '⛔ <b>POST-EVENT</b> · ' + escHtml(recent.event) + ' — evită intrări impulsive · <a href="../macro-dashboard/" style="color:inherit">Macro</a>';
      return;
    }
    const next = hi.find(e => e.tilMs >= 0);
    if (next && next.tilMs <= 15 * 60000){
      el.style.display = '';
      el.className = 'setup-freeze freeze';
      el.innerHTML = '⛔ <b>FREEZE</b> · ' + escHtml(next.event) + ' în ' + Math.round(next.tilMs / 60000) + 'm — NU deschide poziții noi · <a href="../macro-dashboard/" style="color:inherit">Macro</a>';
      return;
    }
    if (next && next.tilMs <= 120 * 60000){
      const h = Math.floor(next.tilMs / 3600000), m = Math.round((next.tilMs % 3600000) / 60000);
      el.style.display = '';
      el.className = 'setup-freeze soon';
      el.innerHTML = '⏳ <b>' + escHtml(next.event) + '</b> în ' + (h ? h + 'h ' : '') + m + 'm — redu sizing · <a href="../macro-dashboard/" style="color:inherit">Macro</a>';
      return;
    }
    el.style.display = 'none';
  }

  function getSetupSlMode(){
    return document.querySelector('#setupSlMode .fb-chip.active')?.dataset.mode || 'atr';
  }
  function getSetupSlPct(){
    return Math.max(0.1, parseFloat($('setupSlPct')?.value) || 2);
  }
  function syncSetupSlPctUI(){
    const wrap = $('setupSlPctWrap');
    if (wrap) wrap.style.display = getSetupSlMode() === 'pct' ? 'flex' : 'none';
  }

  function loadJournal(){
    try { const a = JSON.parse(localStorage.getItem(JOURNAL_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function persistJournal(arr){
    try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(arr.slice(-100))); } catch (e) {}
  }

  function todayET(){
    if (global.MCTX?.todayET) return global.MCTX.todayET();
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }

  async function buildSetup(){
    const resultEl = $('setupResult');
    const raw = ($('setupTicker').value || '').trim().toUpperCase();
    if (!raw){ resultEl.innerHTML = '<div class="setup-err">Introdu un ticker (ex: NVDA, AAPL, BTC sau BTC-USD).</div>'; return; }
    const ticker = tickerToYahoo(raw);
    if (ticker !== raw){ const inp = $('setupTicker'); if (inp) inp.value = ticker; }
    const account = parseFloat($('setupAccount').value) || 0;
    const riskPct = parseFloat($('setupRisk').value) || 1;
    resultEl.innerHTML = '<div class="setup-err">⏳ Calculez nivelurile pentru <b>' + escHtml(ticker) + '</b>…</div>';
    let L = null;
    try { L = global.SL ? await global.SL.fetchBriefLevels(ticker) : null; } catch (e) { L = null; }
    if (global.JI?.refreshEarningsCalendar && !/-USD$/i.test(ticker)){
      try { await global.JI.refreshEarningsCalendar([stockSym(ticker)]); } catch (e) {}
    }
    if (!L || L.last == null){
      resultEl.innerHTML = '<div class="setup-err">❌ Nu am găsit date pentru <b>' + escHtml(ticker) + '</b>. Verifică simbolul (crypto: <code>BTC-USD</code>, stocks: <code>NVDA</code>). Proxy blocat? Setează cheie <b>Finnhub</b>/<b>TwelveData</b> în Macro ⚙ sau reîncearcă.</div>';
      return;
    }
    _setupLevels = { ticker, L };
    _lastSetup = null;
    try { renderSetup(ticker, _setupDir, L, account, riskPct); }
    catch (e) {
      console.error('renderSetup', e);
      resultEl.innerHTML = '<div class="setup-err">❌ Eroare la afișare setup: ' + escHtml(e.message || String(e)) + '</div>';
    }
  }

  function refreshSetupDisplay(){
    if (!_setupLevels?.L) return;
    try {
      renderSetup(_setupLevels.ticker, _setupDir, _setupLevels.L,
        parseFloat($('setupAccount').value) || 0,
        parseFloat($('setupRisk').value) || 1);
    } catch (e) {
      console.error('refreshSetupDisplay', e);
    }
  }

  function renderSetup(ticker, dir, L, account, riskPct){
    const isLong = dir === 'long';
    const isCrypto = /-USD$/i.test(ticker);
    const slMode = getSetupSlMode();
    const slPctFix = getSetupSlPct();
    const fmt = v => v == null ? '—' : (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(4));
    const entry = L.last;
    const atrAbs = L.atrPct != null ? entry * L.atrPct / 100 : entry * 0.02;
    let r, slSub, modeTag;
    if (slMode === 'pct'){
      r = entry * (slPctFix / 100);
      slSub = 'SL fix ' + slPctFix + '% · distanță $' + fmt(r) + '/unit';
      modeTag = 'SL ' + slPctFix + '%';
    } else {
      r = 1.5 * atrAbs;
      slSub = '1.5×ATR · distanță $' + fmt(r) + '/unit (' + (r / entry * 100).toFixed(1) + '% preț)';
      modeTag = 'ATR';
    }
    const sl = isLong ? entry - r : entry + r;
    const tp1 = isLong ? entry + r : entry - r;
    const tp2 = isLong ? entry + 2 * r : entry - 2 * r;
    const tp3 = isLong ? entry + 3 * r : entry - 3 * r;
    const target = isLong ? L.hi20 : L.lo20;
    let rrStruct = null;
    if (target != null && r > 0){
      const reward = isLong ? target - entry : entry - target;
      if (reward > 0) rrStruct = reward / r;
    }
    const rrColor = rrStruct == null ? 'var(--t1)' : rrStruct >= 2 ? 'var(--bull-s)' : rrStruct >= 1 ? 'var(--warn)' : 'var(--bear-s)';
    const danger = readDanger();
    const mult = dangerSizeMult(danger.score);
    const riskDollars = account * (riskPct / 100) * mult;
    const shares = r > 0 ? riskDollars / r : 0;
    const posValue = shares * entry;
    const reg = readRegime();
    const checks = [];
    const maOk = L.ma50 != null && (isLong ? entry > L.ma50 : entry < L.ma50);
    checks.push({ ok: maOk, txt: 'Trend MA50 ' + (isLong ? 'în favoare' : 'în favoare (sub)'), note: L.ma50 != null ? 'MA50 ' + fmt(L.ma50) : 'n/a' });
    if (L.ma200 != null){
      checks.push({ ok: isLong ? entry > L.ma200 : entry < L.ma200, txt: 'Trend MA200 aliniat', note: 'MA200 ' + fmt(L.ma200) });
    }
    const regOk = reg.composite == null || (isLong ? reg.composite >= -2 : reg.composite <= 1);
    checks.push({ ok: regOk, txt: 'Regim ' + (isLong ? 'nu contra LONG' : 'nu contra SHORT'), note: reg.label || 'n/a' });
    checks.push({ ok: danger.score < 45, txt: 'Danger Score sub prag', note: danger.score + '/100' + (danger.stale ? ' (stale)' : '') });
    if (L.distMa50 != null){
      checks.push({ ok: Math.abs(L.distMa50) < 12, txt: 'Nu e supra-extins față de MA50', note: (L.distMa50 >= 0 ? '+' : '') + L.distMa50.toFixed(1) + '%' });
    }
    if (global.JI?.earningsBadge && !isCrypto){
      const eb = global.JI.earningsBadge(stockSym(ticker));
      if (eb) checks.push({ ok: false, txt: 'Fără earnings în ≤48h', note: eb });
    }
    const catalysts = findCatalysts(ticker);
    const okCount = checks.filter(c => c.ok).length;
    const shareN = shares >= 1 ? Math.floor(shares) : shares;
    const lossAtSl = shareN * r;
    const lossAtSlPct = account > 0 ? (lossAtSl / account) * 100 : 0;
    const gainTp1 = shareN * r, gainTp2 = shareN * 2 * r, gainTp3 = shareN * 3 * r;
    const gainPct = g => account > 0 ? (g / account) * 100 : 0;
    const shareLbl = shares >= 1 ? Math.floor(shares).toLocaleString('en-US') : shares.toFixed(4);
    const reward20 = target != null ? (isLong ? target - entry : entry - target) : null;
    const noHeadroom = reward20 != null && reward20 <= 0;
    const vd = computeVerdict(rrStruct, noHeadroom, okCount, checks.length, danger.score);
    _lastSetup = {
      ticker, dir, entry, sl, tp1, tp2, tp3, r, slMode,
      slPct: slMode === 'pct' ? slPctFix : null,
      atrPct: L.atrPct, dangerScore: danger.score,
      confluence: okCount, totalChecks: checks.length,
      shares: shareN, riskDollars, lossAtSl, lossAtSlPct,
      gainTp1, gainTp2, gainTp3, rrStruct, noHeadroom,
      verdict: vd.verdict, account, riskPct, draftId: _lastSetup?.draftId || null
    };

    const footHint = slMode === 'pct'
      ? '⚠ Schelet din SL fix ' + slPctFix + '% (TP 1/2/3R). Sizing pe Danger. NU sunt ordine.'
      : '⚠ Schelet ATR 1.5× (TP 1/2/3R). Sizing pe Danger. NU sunt ordine — validează pe grafic.';

    let rrWarnHtml = '';
    if (target != null && r > 0){
      if (noHeadroom){
        rrWarnHtml = '<div class="setup-rr-warn">⚠️ <strong>Fără headroom 20z</strong> — prețul e la sau peste '
          + (isLong ? 'maximul' : 'minimul') + ' din 20 zile. Nu e setup swing valid; așteaptă pullback sau alt ticker.</div>';
      } else if (rrStruct != null && rrStruct < 1){
        rrWarnHtml = '<div class="setup-rr-warn">⚠️ <strong>R:R structural slab (' + rrStruct.toFixed(2) + ':1)</strong> — riști '
          + (1 / rrStruct).toFixed(1) + '× mai mult decât ai până la ' + (isLong ? 'hi20' : 'lo20')
          + '. Așteaptă pullback sau caută alt ticker; TP1 la 1R depășește structura de preț.</div>';
      } else if (rrStruct != null && rrStruct < 2){
        rrWarnHtml = '<div class="setup-rr-warn setup-rr-warn--soft">⏳ <strong>R:R marginal (' + rrStruct.toFixed(2) + ':1)</strong> — headroom limitat față de 20z; reduce sizing sau ia profit devreme la TP1.</div>';
      }
    }
    const mapHtml = buildPriceMapHtml(entry, sl, tp1, tp2, tp3, target, isLong);

    $('setupResult').innerHTML = `
      <div class="setup-verdict">
        <div>
          <div class="sv-tag">${escHtml(ticker)} · ${isLong ? '📈 LONG' : '📉 SHORT'} · ${escHtml(modeTag)} · ${okCount}/${checks.length}</div>
          <div class="sv-px">$${fmt(entry)}</div>
          <div class="sv-meta">${(L.chgPct ?? 0) >= 0 ? '+' : ''}${Number(L.chgPct ?? 0).toFixed(2)}% azi · ATR≈${L.atrPct != null ? L.atrPct.toFixed(1) : '—'}%/zi</div>
        </div>
        <div class="setup-verdict-badge ${vd.cls}" title="${escHtml(vd.tip)}">${vd.label}</div>
      </div>
      ${rrWarnHtml}
      ${mapHtml}
      <div class="setup-grid">
        <div class="setup-tile entry"><div class="st-label">Entry</div><div class="st-val">$${fmt(entry)}</div></div>
        <div class="setup-tile sl"><div class="st-label">Stop Loss</div><div class="st-val">$${fmt(sl)}</div><div class="st-sub">${slSub}</div><div class="st-sub" style="color:var(--bear-s);margin-top:4px">La hit: −$${fmt(lossAtSl)} (−${lossAtSlPct.toFixed(2)}% cont)</div></div>
        <div class="setup-tile tp"><div class="st-label">TP1 · 1R</div><div class="st-val">$${fmt(tp1)}</div><div class="st-sub" style="color:var(--bull-s)">+$${fmt(gainTp1)} (+${gainPct(gainTp1).toFixed(2)}%)</div></div>
        <div class="setup-tile tp"><div class="st-label">TP2 · 2R</div><div class="st-val">$${fmt(tp2)}</div><div class="st-sub" style="color:var(--bull-s)">+$${fmt(gainTp2)} (+${gainPct(gainTp2).toFixed(2)}%)</div></div>
        <div class="setup-tile tp"><div class="st-label">TP3 · 3R</div><div class="st-val">$${fmt(tp3)}</div><div class="st-sub" style="color:var(--bull-s)">+$${fmt(gainTp3)} (+${gainPct(gainTp3).toFixed(2)}%)</div></div>
        <div class="setup-tile"><div class="st-label">R:R 20z</div><div class="st-val" style="color:${rrColor}">${rrStruct != null ? rrStruct.toFixed(2) + ':1' : '—'}</div></div>
      </div>
      <div class="setup-section-h">💰 Sizing — Danger ${danger.score}/100 → ×${mult}</div>
      <div class="setup-grid">
        <div class="setup-tile"><div class="st-label">Risc țintă / trade</div><div class="st-val">$${fmt(riskDollars)}</div><div class="st-sub">${riskPct}% cont × ×${mult} Danger</div></div>
        <div class="setup-tile sl"><div class="st-label">Pierdere la SL</div><div class="st-val" style="color:var(--bear-s)">−$${fmt(lossAtSl)}</div><div class="st-sub">${shareLbl} ${isCrypto ? 'unit.' : 'acț.'} × $${fmt(r)} · −${lossAtSlPct.toFixed(2)}% cont</div></div>
        <div class="setup-tile"><div class="st-label">Poziție</div><div class="st-val">${shareLbl}</div><div class="st-sub">${isCrypto ? 'unități' : 'acțiuni'} · ≈ $${fmt(posValue)}</div></div>
      </div>
      <div class="setup-section-h">✅ Confluență (${okCount}/${checks.length})</div>
      <div class="setup-check">${checks.map(c => '<div class="setup-check-row"><span>' + (c.ok ? '✅' : '⚠️') + '</span> ' + escHtml(c.txt) + ' <span class="scr-note">' + escHtml(c.note) + '</span></div>').join('')}</div>
      ${catalysts.length ? '<div class="setup-section-h">📅 Catalist</div>' + catalysts.map(c => '<div class="setup-cat">' + escHtml(c) + '</div>').join('') : ''}
      <div class="setup-actions">
        <button type="button" class="btn" id="sbSaveDraft">📓 Salvează draft</button>
        <button type="button" class="btn" id="sbOpenExec">➕ Deschide execuție</button>
        <button type="button" class="btn ghost" id="sbAlert">🔔 Alertă SL+TP</button>
      </div>
      <div class="setup-hint" style="margin-top:10px">${footHint}</div>`;
    if ((location.hash || '').replace('#', '').split('&')[0] === 'setup' && global.JWS?.renderContextStrip) global.JWS.renderContextStrip();
  }

  function ensureDraftId(){
    if (!_lastSetup) return null;
    if (_lastSetup.draftId) return _lastSetup.draftId;
    const id = 'j_' + Date.now();
    const arr = loadJournal();
    arr.push(Object.assign({}, _lastSetup, { id, dateET: todayET(), createdAt: Date.now() }));
    persistJournal(arr);
    _lastSetup.draftId = id;
    renderSignalJournal();
    renderPlanVsReal();
    return id;
  }

  function saveLastSetup(){
    if (!_lastSetup){ toast('⚠ Construiește întâi un setup', 'warn'); return; }
    if (_lastSetup.draftId){ toast('📓 Draft deja salvat', 'warn'); return; }
    const id = ensureDraftId();
    toast('📓 ' + _lastSetup.ticker + ' salvat (draft)', 'success');
    return id;
  }

  function execForDraft(draftId){
    if (!draftId || !global.JR?.all) return null;
    return global.JR.all().find(e => e.setupDraftId === draftId) || null;
  }

  function openExecFromSetup(){
    if (!_lastSetup){ toast('⚠ Construiește întâi un setup', 'warn'); return; }
    const s = _lastSetup;
    if (s.verdict === 'SKIP' || s.noHeadroom || (s.rrStruct != null && s.rrStruct < 1)){
      const rrTxt = s.rrStruct != null ? s.rrStruct.toFixed(2) + ':1' : 'fără headroom';
      const msg = 'Setup marcat SKIP / R:R structural slab (' + rrTxt + ').\nPierdere la SL: −$'
        + (s.lossAtSl != null ? s.lossAtSl.toFixed(2) : '?') + '\n\nContinui spre execuție oricum?';
      if (!confirm(msg)) return;
    }
    ensureDraftId();
    if (typeof onOpenExec === 'function'){
      onOpenExec(_lastSetup);
      return;
    }
    try {
      localStorage.setItem('jr_setup_exec_prefill', JSON.stringify({ s, ts: Date.now() }));
    } catch (e) {}
    toast('Execuție pregătită — tab Execuții', 'success');
  }

  function alertFromSetup(){
    if (!_lastSetup){ toast('⚠ Construiește întâi un setup', 'warn'); return; }
    const s = _lastSetup;
    try {
      const raw = JSON.parse(localStorage.getItem('wl_price_alerts') || '{}');
      const sym = s.ticker.toUpperCase();
      if (!Array.isArray(raw[sym])) raw[sym] = [];
      const isLong = s.dir === 'long';
      const dec = Math.abs(s.entry) >= 100 ? 2 : 4;
      const rnd = v => +v.toFixed(dec);
      raw[sym].push({ id: 'sb_' + Date.now() + '_sl', lvl: rnd(s.sl), dir: isLong ? 'below' : 'above', rearm: false, armed: true, lastFired: null, note: 'SL setup ' + s.dir + ' (Journal)' });
      raw[sym].push({ id: 'sb_' + (Date.now() + 1) + '_tp', lvl: rnd(s.tp1), dir: isLong ? 'above' : 'below', rearm: false, armed: true, lastFired: null, note: 'TP1 setup ' + s.dir });
      localStorage.setItem('wl_price_alerts', JSON.stringify(raw));
      toast('🔔 Alerte SL+TP pe ' + sym, 'success');
    } catch (e) { toast('❌ Nu am putut salva alerta', 'error'); }
  }

  async function evalJournalEntry(e){
    const points = global.SL ? await global.SL.getReactionSeries(e.ticker) : null;
    if (!points || !points.length) return { status: 'unknown' };
    const idx = points.findIndex(p => new Date(p.ts * 1000).toISOString().slice(0, 10) >= e.dateET);
    if (idx < 0) return { status: 'pending' };
    const isLong = e.dir === 'long';
    const r = e.r || Math.abs(e.entry - e.sl);
    if (!(r > 0)) return { status: 'unknown' };
    let maxR = -Infinity;
    for (let i = idx; i < points.length; i++){
      const px = points[i].close;
      if (!Number.isFinite(px)) continue;
      const rNow = isLong ? (px - e.entry) / r : (e.entry - px) / r;
      if (rNow > maxR) maxR = rNow;
      const hitSL = isLong ? px <= e.sl : px >= e.sl;
      if (hitSL) return maxR >= 1 ? { status: 'win', rMultiple: Math.min(maxR, 3) } : { status: 'loss', rMultiple: -1 };
      if (rNow >= 3) return { status: 'win', rMultiple: 3 };
    }
    const lastR = isLong ? (points[points.length - 1].close - e.entry) / r : (e.entry - points[points.length - 1].close) / r;
    if (maxR >= 1) return { status: 'win', rMultiple: Math.min(maxR, 3), open: true };
    return { status: 'open', rMultiple: Number.isFinite(lastR) ? lastR : 0 };
  }

  function journalStats(evals){
    const closed = evals.filter(x => x.status === 'win' || x.status === 'loss');
    if (!closed.length) return null;
    const wins = closed.filter(x => x.rMultiple > 0);
    return {
      n: closed.length,
      winRate: wins.length / closed.length * 100,
      expectancy: closed.reduce((s, x) => s + x.rMultiple, 0) / closed.length,
      pf: (() => { const gW = wins.reduce((s, x) => s + x.rMultiple, 0); const gL = Math.abs(closed.filter(x => x.rMultiple <= 0).reduce((s, x) => s + x.rMultiple, 0)); return gL ? gW / gL : null; })(),
      open: evals.length - closed.length
    };
  }

  async function renderSignalJournal(){
    const listEl = $('journalList');
    const scoreEl = $('journalScorecard');
    if (!listEl) return;
    const arr = loadJournal().slice().reverse();
    if (!arr.length){
      if (scoreEl) scoreEl.innerHTML = '';
      listEl.innerHTML = '<div class="setup-err">Niciun draft salvat. Construiește un setup și apasă „📓 Salvează draft".</div>';
      return;
    }
    listEl.innerHTML = '<div class="setup-err">⏳ Evaluez draft-urile…</div>';
    const evals = await Promise.all(arr.map(e => evalJournalEntry(e).catch(() => ({ status: 'unknown' }))));
    const stats = journalStats(evals);
    const fmtJ = v => v == null ? '—' : (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(4));
    if (scoreEl && stats){
      const expColor = stats.expectancy > 0 ? 'var(--bull-s)' : stats.expectancy < 0 ? 'var(--bear-s)' : 'var(--t1)';
      scoreEl.innerHTML = '<div class="setup-grid">' +
        '<div class="setup-tile"><div class="st-label">Win rate</div><div class="st-val">' + stats.winRate.toFixed(0) + '%</div></div>' +
        '<div class="setup-tile"><div class="st-label">Expectancy</div><div class="st-val" style="color:' + expColor + '">' + (stats.expectancy >= 0 ? '+' : '') + stats.expectancy.toFixed(2) + 'R</div></div>' +
        '<div class="setup-tile"><div class="st-label">PF</div><div class="st-val">' + (stats.pf != null ? stats.pf.toFixed(2) : '—') + '</div></div>' +
        '</div>';
    } else if (scoreEl) scoreEl.innerHTML = '';
    listEl.innerHTML = arr.map((e, i) => {
      const ev = evals[i] || { status: 'unknown' };
      const color = ev.status === 'win' ? 'var(--bull-s)' : ev.status === 'loss' ? 'var(--bear-s)' : 'var(--t2)';
      const stTxt = ev.status === 'win' ? '✅ +' + ev.rMultiple.toFixed(1) + 'R' : ev.status === 'loss' ? '❌ ' + ev.rMultiple.toFixed(1) + 'R' : ev.status === 'open' ? '⏳ ' + ev.rMultiple.toFixed(1) + 'R' : '· n/a';
      const rrB = e.rrStruct != null
        ? ' <span class="scr-note" style="color:' + (e.rrStruct < 1 ? 'var(--bear-s)' : e.rrStruct < 2 ? 'var(--warn)' : 'var(--bull-s)') + '">R:R ' + e.rrStruct.toFixed(2) + '</span>' : '';
      const vdB = e.verdict ? ' <span class="scr-note">' + escHtml(e.verdict) + '</span>' : '';
      const ex = execForDraft(e.id);
      const exB = ex ? ' <span class="scr-note" style="color:var(--accent)">→ exec</span>' : '';
      return '<div class="setup-check-row"><span>' + (e.dir === 'long' ? '📈' : '📉') + '</span><div style="flex:1"><b>' + escHtml(e.ticker) + '</b> ' + escHtml(e.dateET) + ' · E ' + fmtJ(e.entry) + '/ SL ' + fmtJ(e.sl) + rrB + vdB + exB + '</div><span style="color:' + color + '">' + stTxt + '</span><button type="button" class="act sb-del" data-id="' + escHtml(e.id) + '">🗑</button></div>';
    }).join('');
    renderPlanVsReal();
  }

  function deleteJournalEntry(id){
    persistJournal(loadJournal().filter(e => e.id !== id));
    renderSignalJournal();
  }

  let _setupWired = false;
  function wireSetup(){
    if (_setupWired) return;
    _setupWired = true;
    syncSetupSlPctUI();
    const root = $('jpaneSetup') || document;
    root.addEventListener('click', ev => {
      const slChip = ev.target.closest('#setupSlMode .fb-chip');
      if (slChip){
        document.querySelectorAll('#setupSlMode .fb-chip').forEach(x => x.classList.toggle('active', x === slChip));
        syncSetupSlPctUI();
        if (_setupLevels?.L) refreshSetupDisplay();
        return;
      }
      const dirChip = ev.target.closest('#setupDir .fb-chip');
      if (dirChip){
        _setupDir = dirChip.dataset.dir || 'long';
        document.querySelectorAll('#setupDir .fb-chip').forEach(x => x.classList.toggle('active', x === dirChip));
        if (_setupLevels?.L) refreshSetupDisplay();
        else if (($('setupTicker')?.value || '').trim()) buildSetup();
        return;
      }
      if (ev.target.closest('#setupDeskSync')){ syncFromDesk(); toast('Cont/Risc preluate din Desk', 'success'); return; }
      if (ev.target.closest('#setupBtn')){ buildSetup(); return; }
      if (ev.target.closest('#journalRefresh')){ renderSignalJournal(); return; }
      if (ev.target.closest('#journalClear')){
        if (!confirm('Ștergi toate draft-urile de setup?')) return;
        persistJournal([]);
        renderSignalJournal();
        return;
      }
      const delBtn = ev.target.closest('.sb-del');
      if (delBtn?.dataset?.id){ deleteJournalEntry(delBtn.dataset.id); return; }
      if (ev.target.closest('#sbSaveDraft')){ saveLastSetup(); return; }
      if (ev.target.closest('#sbOpenExec')){ openExecFromSetup(); return; }
      if (ev.target.closest('#sbAlert')){ alertFromSetup(); return; }
    });
    $('setupTicker')?.addEventListener('keydown', e => { if (e.key === 'Enter') buildSetup(); });
    ['setupAccount', 'setupRisk', 'setupSlPct'].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('input', () => { syncDeskBadge(); refreshSetupDisplay(); });
      el.addEventListener('change', () => { syncDeskBadge(); refreshSetupDisplay(); });
    });
  }

  function onSetupTabActivate(){
    renderFreezeBanner();
    syncDeskBadge();
    if (global.JWS?.renderContextStrip) global.JWS.renderContextStrip();
    renderPlanVsReal();
  }

  function consumePrefill(){
    let p = null;
    try { p = JSON.parse(localStorage.getItem(PREFILL_KEY) || 'null'); } catch (e) {}
    try { localStorage.removeItem(PREFILL_KEY); } catch (e) {}
    if (!p || !p.ticker || (Date.now() - (p.ts || 0) > 5 * 60000)) return false;
    const inp = $('setupTicker');
    if (!inp) return false;
    inp.value = String(p.ticker).toUpperCase();
    if (p.dir === 'short' || p.dir === 'long'){
      _setupDir = p.dir;
      document.querySelectorAll('#setupDir .fb-chip').forEach(x => x.classList.toggle('active', x.dataset.dir === p.dir));
    }
    if (typeof onTabSetup === 'function') onTabSetup();
    buildSetup();
    return true;
  }

  function prefillExecForm(s){
    if (!s) return;
    if ($('fSym')) $('fSym').value = s.ticker;
    if ($('fDir')) $('fDir').value = s.dir || 'long';
    if ($('fEntry')) $('fEntry').value = s.entry;
    if ($('fSl')) $('fSl').value = s.sl;
    if ($('fSize') && s.shares) $('fSize').value = Math.max(1, Math.floor(s.shares));
    if ($('fSrc')) $('fSrc').value = 'macro';
    if ($('fExit')) $('fExit').value = '';
    if ($('fSetupDraftId')) $('fSetupDraftId').value = s.draftId || '';
    const rrN = s.rrStruct != null ? ' · R:R20z ' + s.rrStruct.toFixed(2) : '';
    if ($('fNotes')) $('fNotes').value = 'Setup ' + (s.verdict || '?') + ' · confluență ' + (s.confluence || '?') + '/' + (s.totalChecks || '?') + ' · Danger ' + (s.dangerScore || '?') + rrN;
  }

  function renderPlanVsReal(){
    const el = $('planVsRealHost');
    if (!el) return;
    const drafts = loadJournal();
    if (!drafts.length && (!global.JR || !global.JR.all)){
      el.innerHTML = '';
      return;
    }
    const planEvalP = Promise.all(drafts.map(e => evalJournalEntry(e).catch(() => ({ status: 'unknown' }))));
    planEvalP.then(planEvals => {
      const planStats = journalStats(planEvals);
      const realExecs = global.JR ? global.JR.all().filter(e => e.source === 'macro' || e.setupDraftId) : [];
      const realStats = global.JR?.stats ? global.JR.stats(realExecs) : { n: 0 };
      const col = (lbl, st, isR) => {
        if (!st || !st.n){ return '<div class="setup-tile"><div class="st-label">' + lbl + '</div><div class="st-val">—</div><div class="st-sub">n=0</div></div>'; }
        const exp = isR && st.expectancy != null ? (st.expectancy >= 0 ? '+' : '') + st.expectancy.toFixed(2) + 'R'
          : (st.expectancyR != null ? (st.expectancyR >= 0 ? '+' : '') + st.expectancyR.toFixed(2) + 'R' : '—');
        const wr = st.winRate != null ? st.winRate.toFixed(0) + '%' : (st.winPct != null ? st.winPct.toFixed(0) + '%' : '—');
        const pf = st.pf != null ? (st.pf === Infinity ? '∞' : st.pf.toFixed(2)) : '—';
        const noise = (st.n || st.nR || 0) < 10 ? ' ⚠ zgomot' : '';
        return '<div class="setup-tile"><div class="st-label">' + lbl + '</div><div class="st-val">' + wr + '</div><div class="st-sub">Exp ' + exp + ' · PF ' + pf + ' · n=' + (st.n || st.nR) + noise + '</div></div>';
      };
      el.innerHTML = '<div class="setup-section-h">📊 Plan vs Real (macro/setup)</div><div class="setup-grid">'
        + col('Plan (draft)', planStats, true) + col('Real (exec)', realStats, false) + '</div>'
        + '<div class="setup-hint">Draft = close-only in-sample · Real = execuții JR source macro sau legate de draft. n&lt;10 = zgomot.</div>';
    });
  }

  function getCtxStripHtml(){
    const s = _lastSetup;
    const tkr = s?.ticker || ($('setupTicker')?.value || '').trim().toUpperCase() || '—';
    const conf = s ? s.confluence + '/' + s.totalChecks : '—';
    const dng = s?.dangerScore != null ? s.dangerScore : '—';
    const vd = s?.verdict || '—';
    const cls = s?.verdict === 'GO' ? 'pos' : s?.verdict === 'WAIT' ? 'wrn' : s?.verdict === 'SKIP' ? 'neg' : '';
    return '<button type="button" class="jr-ctx-cell" data-jtab-link="setup" title="Ticker setup"><span class="jr-ctx-lbl">Setup</span><span class="jr-ctx-val">' + escHtml(tkr) + '</span></button>'
      + '<button type="button" class="jr-ctx-cell" data-jtab-link="setup"><span class="jr-ctx-lbl">Conf</span><span class="jr-ctx-val">' + conf + '</span></button>'
      + '<button type="button" class="jr-ctx-cell" data-jtab-link="setup"><span class="jr-ctx-lbl">Danger</span><span class="jr-ctx-val">' + dng + '</span></button>'
      + '<button type="button" class="jr-ctx-cell ' + cls + '" data-jtab-link="setup"><span class="jr-ctx-lbl">Verdict</span><span class="jr-ctx-val">' + escHtml(vd) + '</span></button>';
  }

  function init(opts){
    opts = opts || {};
    if (opts.$) $ = opts.$;
    if (opts.escHtml) escHtml = opts.escHtml;
    if (opts.toast) toast = opts.toast;
    if (opts.onOpenExec) onOpenExec = opts.onOpenExec;
    if (opts.onTabSetup) onTabSetup = opts.onTabSetup;
    wireSetup();
    renderFreezeBanner();
    syncFromDesk();
    renderSignalJournal();
    setInterval(renderFreezeBanner, 30000);
  }

  global.SB = {
    init, buildSetup, consumePrefill, renderSignalJournal, renderPlanVsReal,
    prefillExecForm, getLastSetup: () => _lastSetup, getCtxStripHtml, onSetupTabActivate,
    syncFromDesk, renderFreezeBanner, computeVerdict,
    saveLastSetup, alertFromSetup, deleteJournalEntry, ensureDraftId
  };
})(typeof window !== 'undefined' ? window : globalThis);