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

  function findCatalysts(){
    const out = [];
    if (!global.MCTX?.eventsUpcoming) return out;
    const ups = global.MCTX.eventsUpcoming({ limit: 5, winFutureMs: 48 * 3600000 });
    const hi = ups.find(e => e.impact === 'high');
    if (hi){
      const h = hi.tilMs < 7200000 ? Math.round(hi.tilMs / 60000) + 'm' : '~' + Math.round(hi.tilMs / 3600000) + 'h';
      out.push('📅 Macro: ' + hi.event + ' în ' + h + ' — poate mișca piața');
    }
    return out;
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
    if (!L || L.last == null){
      resultEl.innerHTML = '<div class="setup-err">❌ Nu am găsit date pentru <b>' + escHtml(ticker) + '</b>. Verifică simbolul (crypto: <code>BTC-USD</code>, stocks: <code>NVDA</code>). Proxy blocat? Setează cheie <b>Finnhub</b>/<b>TwelveData</b> în Macro ⚙ sau reîncearcă.</div>';
      return;
    }
    _setupLevels = { ticker, L };
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
    const catalysts = findCatalysts();
    const okCount = checks.filter(c => c.ok).length;
    const shareN = shares >= 1 ? Math.floor(shares) : shares;
    const lossAtSl = shareN * r;
    const lossAtSlPct = account > 0 ? (lossAtSl / account) * 100 : 0;
    const shareLbl = shares >= 1 ? Math.floor(shares).toLocaleString('en-US') : shares.toFixed(4);
    _lastSetup = {
      ticker, dir, entry, sl, tp1, tp2, tp3, r, slMode,
      slPct: slMode === 'pct' ? slPctFix : null,
      atrPct: L.atrPct, dangerScore: danger.score,
      confluence: okCount, totalChecks: checks.length,
      shares: shareN, riskDollars, lossAtSl, lossAtSlPct, account, riskPct
    };

    const footHint = slMode === 'pct'
      ? '⚠ Schelet din SL fix ' + slPctFix + '% (TP 1/2/3R). Sizing pe Danger. NU sunt ordine.'
      : '⚠ Schelet ATR 1.5× (TP 1/2/3R). Sizing pe Danger. NU sunt ordine — validează pe grafic.';

    let rrWarnHtml = '';
    if (target != null && r > 0){
      const reward = isLong ? target - entry : entry - target;
      if (reward <= 0){
        rrWarnHtml = '<div class="setup-rr-warn">⚠️ <strong>Fără headroom 20z</strong> — prețul e la sau peste '
          + (isLong ? 'maximul' : 'minimul') + ' din 20 zile. Nu e setup swing valid; așteaptă pullback sau alt ticker.</div>';
      } else if (rrStruct != null && rrStruct < 1){
        rrWarnHtml = '<div class="setup-rr-warn">⚠️ <strong>R:R structural slab (' + rrStruct.toFixed(2) + ':1)</strong> — riști '
          + (1 / rrStruct).toFixed(1) + '× mai mult decât ai până la ' + (isLong ? 'hi20' : 'lo20')
          + '. Așteaptă pullback sau caută alt ticker; TP1 la 1R depășește structura de preț.</div>';
      }
    }

    $('setupResult').innerHTML = `
      <div class="setup-verdict">
        <div>
          <div class="sv-tag">${escHtml(ticker)} · ${isLong ? '📈 LONG' : '📉 SHORT'} · ${escHtml(modeTag)} · ${okCount}/${checks.length}</div>
          <div class="sv-px">$${fmt(entry)}</div>
          <div class="sv-meta">${(L.chgPct ?? 0) >= 0 ? '+' : ''}${Number(L.chgPct ?? 0).toFixed(2)}% azi · ATR≈${L.atrPct != null ? L.atrPct.toFixed(1) : '—'}%/zi</div>
        </div>
      </div>
      ${rrWarnHtml}
      <div class="setup-grid">
        <div class="setup-tile entry"><div class="st-label">Entry</div><div class="st-val">$${fmt(entry)}</div></div>
        <div class="setup-tile sl"><div class="st-label">Stop Loss</div><div class="st-val">$${fmt(sl)}</div><div class="st-sub">${slSub}</div><div class="st-sub" style="color:var(--bear-s);margin-top:4px">La hit: −$${fmt(lossAtSl)} (−${lossAtSlPct.toFixed(2)}% cont)</div></div>
        <div class="setup-tile tp"><div class="st-label">TP1 · 1R</div><div class="st-val">$${fmt(tp1)}</div></div>
        <div class="setup-tile tp"><div class="st-label">TP2 · 2R</div><div class="st-val">$${fmt(tp2)}</div></div>
        <div class="setup-tile tp"><div class="st-label">TP3 · 3R</div><div class="st-val">$${fmt(tp3)}</div></div>
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
  }

  function saveLastSetup(){
    if (!_lastSetup){ toast('⚠ Construiește întâi un setup', 'warn'); return; }
    const s = _lastSetup;
    const arr = loadJournal();
    arr.push(Object.assign({}, s, { id: 'j_' + Date.now(), dateET: todayET(), createdAt: Date.now() }));
    persistJournal(arr);
    toast('📓 ' + s.ticker + ' salvat (draft)', 'success');
    renderSignalJournal();
  }

  function openExecFromSetup(){
    if (!_lastSetup){ toast('⚠ Construiește întâi un setup', 'warn'); return; }
    const s = _lastSetup;
    if (typeof onOpenExec === 'function'){
      onOpenExec(s);
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
      return '<div class="setup-check-row"><span>' + (e.dir === 'long' ? '📈' : '📉') + '</span><div style="flex:1"><b>' + escHtml(e.ticker) + '</b> ' + escHtml(e.dateET) + ' · E ' + fmtJ(e.entry) + '/ SL ' + fmtJ(e.sl) + '</div><span style="color:' + color + '">' + stTxt + '</span><button type="button" class="act sb-del" data-id="' + escHtml(e.id) + '">🗑</button></div>';
    }).join('');
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
      el.addEventListener('input', refreshSetupDisplay);
      el.addEventListener('change', refreshSetupDisplay);
    });
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
    if ($('fNotes')) $('fNotes').value = 'Setup Builder · confluență ' + (s.confluence || '?') + '/' + (s.totalChecks || '?') + ' · Danger ' + (s.dangerScore || '?');
  }

  function init(opts){
    opts = opts || {};
    if (opts.$) $ = opts.$;
    if (opts.escHtml) escHtml = opts.escHtml;
    if (opts.toast) toast = opts.toast;
    if (opts.onOpenExec) onOpenExec = opts.onOpenExec;
    if (opts.onTabSetup) onTabSetup = opts.onTabSetup;
    wireSetup();
    renderSignalJournal();
  }

  global.SB = {
    init, buildSetup, consumePrefill, renderSignalJournal,
    prefillExecForm, getLastSetup: () => _lastSetup,
    saveLastSetup, alertFromSetup, deleteJournalEntry
  };
})(typeof window !== 'undefined' ? window : globalThis);