// hub-tableau.js — Command tableau hub (HT.render) I-160
(function(global){
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  const NAV = [
    { id: 'macro', label: 'Macro', icon: '🌍', href: './macro-dashboard/', pri: true },
    { id: 'router', label: 'Router', icon: '🧭', href: './router/', pri: true },
    { id: 'desk', label: 'Desk', icon: '🛑', href: './journal/#desk', pri: true },
    { id: 'journal', label: 'Journal', icon: '📓', href: './journal/', pri: true },
    { id: 'portfolio', label: 'Portfolio', icon: '🛡️', href: './journal/#portfolio' },
    { id: 'capital', label: 'Capital', icon: '⚖', href: './journal/#capital' },
    { id: 'plans', label: 'Plans', icon: '📋', action: 'plans' },
    { id: 'health', label: 'Health', icon: '💚', href: './health/' },
    { id: 'guide', label: 'Guide', icon: '📖', href: './guide/' },
    { id: 'crypto', label: 'Crypto', icon: '🪙', href: 'https://mferent80-source.github.io/scanner/', external: true }
  ];

  let wlPop = null;
  // Stub cu niveluri neutre pentru cazul în care hub-state.js nu s-a încărcat
  // (404 tranzitoriu / SW versiuni mixte la deploy). Fără el, buildGridCells/
  // patchGrid dereferențiau H().goLvl NEGUARDAT → TypeError → tableau complet
  // gol, anulând fallback-ul layout:'none' intenționat. Deciziile de hubState
  // testează global.HS real (nu stub-ul), ca fallback-ul să funcționeze.
  const _lvl = () => 'neut';
  const HSTUB = {
    goLvl: _lvl, deskLvl: _lvl, riskLvl: _lvl, openLvl: _lvl, rWeekLvl: _lvl,
    driftLvl: _lvl, macroLvl: _lvl, dangerLvlFromScore: _lvl, tiltLvl: _lvl,
    curveLvl: _lvl, earnLvl: _lvl, surpLvl: _lvl, marketQuoteLvl: _lvl, tileClsToLvl: _lvl,
    regimeStreak: () => 0, marketHref: () => './router/',
    setCardLvl: () => {}, renderStaleNav: () => {}, invalidateRtEval: () => {},
    patchMarketCards: () => {}, exportDigestForBot: () => {}, maybeSendMorningDigest: () => {},
    hubState: () => null
  };
  const H = () => global.HS || HSTUB;

  function goSubLine(d){
    const parts = [d.goLabel];
    if (d.sizingMult != null) parts.push('×' + d.sizingMult);
    if (typeof d.tradesLeft === 'number') parts.push(d.tradesLeft + ' trades');
    return parts.join(' · ');
  }

  function dangerSparkHtml(){
    let h = [];
    try { h = JSON.parse(localStorage.getItem('md_danger_daily') || '[]'); } catch (e) {}
    if (!Array.isArray(h) || h.length < 2) return '';
    const vals = h.slice(-7).map(x => typeof x.score === 'number' ? x.score : null).filter(v => v != null);
    if (vals.length < 2) return '';
    if (global.RT && RT.dangerSparkSvg) {
      return '<div class="ht-danger-spark">' + RT.dangerSparkSvg(vals, 108, 20) + '</div>';
    }
    return '';
  }

  function rowBreak(){
    return '<div class="ht-row-break" aria-hidden="true"></div>';
  }

  function card(tag, href, lbl, val, sub, lvl, tier, opts){
    opts = opts || {};
    const tierCls = tier === 'hero' ? ' ht-hero' : tier === 'core' ? ' ht-core' : ' ht-compact';
    const span = opts.span ? ' ht-span-' + opts.span : '';
    const id = opts.id ? ' id="' + opts.id + '"' : '';
    const style = opts.style || '';
    const styleAttr = style ? ' style="' + style + '"' : '';
    const cls = opts.extraCls ? ' ' + opts.extraCls : '';
    const title = opts.title ? ' title="' + esc(opts.title) + '"' : '';
    const click = opts.onclick ? ' onclick="' + opts.onclick + '"' : '';
    const open = tag === 'a'
      ? '<a href="' + (href || '#') + '" class="ht-card lvl-' + (lvl || 'neut') + tierCls + span + cls + '"' + id + styleAttr + title + click + '>'
      : '<div class="ht-card lvl-' + (lvl || 'neut') + tierCls + span + cls + '"' + id + styleAttr + title + click + '>';
    const close = tag === 'a' ? '</a>' : '</div>';
    const extra = opts.extraHtml || '';
    return open +
      '<span class="ht-m-lbl">' + esc(lbl) + '</span>' +
      '<span class="ht-m-val">' + val + '</span>' +
      (sub != null && sub !== '' ? '<span class="ht-m-sub">' + sub + '</span>' : '') +
      extra + close;
  }

  function marketCell(sym, wrapId, valId, subId, tier){
    const href = H() ? H().marketHref(sym) : './router/';
    return '<a href="' + href + '" class="ht-card ht-market ht-' + (tier || 'core') + ' lvl-neut" id="' + wrapId + '" title="Deschide ' + esc(sym) + '">' +
      '<span class="ht-m-lbl">' + esc(sym) + '</span>' +
      '<span class="ht-m-val" id="' + valId + '">—</span>' +
      '<span class="ht-m-sub" id="' + subId + '">…</span></a>';
  }

  // Crypto Fear & Greed — card hub (mereu pe grilă)
  function fngLvl(v){
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return 'neut';
    if (n <= 25) return 'bear';
    if (n <= 45) return 'warn';
    if (n <= 55) return 'neut';
    if (n <= 75) return 'ok';
    return 'ok';
  }
  function fngCardHtml(t){
    if (t && t.v && t.v !== '—'){
      return card('a', './macro-dashboard/', 'F&G', esc(t.v), esc(t.sub || 'Crypto Fear&Greed'),
        H().tileClsToLvl ? H().tileClsToLvl(t.cls, t.sub) : fngLvl(t.v), 'compact', { id: 'htCardFng', title: 'Crypto Fear & Greed (alternative.me)' });
    }
    // cache local (refreshFng) — ca să nu stea „…” la fiecare rebuild
    try {
      const c = JSON.parse(localStorage.getItem('tt_fng_cache_v1') || 'null');
      if (c && c.v != null && Date.now() - c.ts < 6 * 3600000){
        return card('a', './macro-dashboard/', 'F&G', esc(String(c.v)), esc(c.label || 'Crypto Fear&Greed'),
          fngLvl(c.v), 'compact', { id: 'htCardFng', title: 'Crypto Fear & Greed (cache)' });
      }
    } catch (e) {}
    return card('a', './macro-dashboard/', 'F&G', '…', 'Crypto Fear&Greed', 'neut', 'compact', { id: 'htCardFng', title: 'Crypto Fear & Greed — se încarcă' });
  }
  function paintFngCard(v, label, lvl){
    const el = $('htCardFng');
    if (!el) return;
    const valEl = el.querySelector('.ht-m-val');
    const subEl = el.querySelector('.ht-m-sub');
    if (valEl) valEl.textContent = String(v);
    if (subEl) subEl.textContent = label || 'Crypto Fear&Greed';
    if (H() && H().setCardLvl) H().setCardLvl(el, lvl || fngLvl(v));
    else el.className = el.className.replace(/\blvl-\w+/g, '').trim() + ' lvl-' + (lvl || fngLvl(v));
  }
  let _fngInflight = null;
  async function refreshFng(force){
    // 1) din snapshot Macro (dacă e proaspăt)
    try {
      const st = H() && H().hubState ? H().hubState() : null;
      const t = st && st.macro && st.macro.tiles && st.macro.tiles.fng;
      if (!force && t && t.v && t.v !== '—'){
        paintFngCard(t.v, t.sub || 'Crypto Fear&Greed', H().tileClsToLvl ? H().tileClsToLvl(t.cls, t.sub) : fngLvl(t.v));
        return;
      }
    } catch (e) {}
    // 2) cache 30 min
    if (!force){
      try {
        const c = JSON.parse(localStorage.getItem('tt_fng_cache_v1') || 'null');
        if (c && c.v != null && Date.now() - c.ts < 30 * 60000){
          paintFngCard(c.v, c.label || 'Crypto Fear&Greed', fngLvl(c.v));
          return;
        }
      } catch (e) {}
    }
    if (_fngInflight) return _fngInflight;
    _fngInflight = (async () => {
      try {
        const ctrl = new AbortController();
        const tm = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch('https://api.alternative.me/fng/?limit=1', { signal: ctrl.signal });
        clearTimeout(tm);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        const item = d && d.data && d.data[0];
        if (!item) throw new Error('empty');
        const v = parseInt(item.value, 10);
        const label = (item.value_classification || 'Crypto F&G') + ' · Crypto';
        if (!Number.isFinite(v)) throw new Error('nan');
        try { localStorage.setItem('tt_fng_cache_v1', JSON.stringify({ v, label, ts: Date.now() })); } catch (e) {}
        paintFngCard(v, label, fngLvl(v));
      } catch (e) {
        const el = $('htCardFng');
        if (el){
          const sub = el.querySelector('.ht-m-sub');
          const val = el.querySelector('.ht-m-val');
          if (val && (val.textContent === '…' || val.textContent === '—')) val.textContent = '—';
          if (sub) sub.textContent = 'indisponibil · Macro →';
        }
      } finally { _fngInflight = null; }
    })();
    return _fngInflight;
  }

  function heroDangerCard(md, spark){
    const dLvl = H().dangerLvlFromScore(md.score, md.cls);
    let dSub = 'sizing ' + esc(md.mult || '—');
    if (md.level) dSub += ' · ' + esc(md.level);
    // esc pe score — vine din snapshot LS scris de altă pagină; toate celelalte
    // call-site-uri escapă manual, ăsta era singurul uitat (val = raw HTML)
    return card('a', './macro-dashboard/', 'Danger',
      esc(String(md.score != null ? md.score : '—')) + '<span class="ht-dim">/100</span>',
      dSub, dLvl, 'hero', { id: 'htCardDanger', extraCls: 'ht-danger-hero', extraHtml: spark || '' });
  }

  function macroStaleBannerHtml(macro){
    if (!macro || !macro.regime) return '';
    if (macro.source === 'fallback') {
      return '<div class="ht-stale-bar">📋 Date parțiale din cache local — <a href="./macro-dashboard/">deschide Macro → Command Center complet</a></div>';
    }
    if (macro.stale && macro.ageMin != null) {
      return '<div class="ht-stale-bar">📦 Snapshot Macro ' + macro.ageMin + 'm — <a href="./macro-dashboard/">🔄 reîmprospătează</a></div>';
    }
    return '';
  }

  // I-206 — asterisc pe GO când sursele decizionale nu-s toate fresh
  function trustMark(){
    try {
      const tr = H() && H().dataTrust ? H().dataTrust() : null;
      return tr && tr.degraded ? '<span title="date parțial stale — vezi Încredere date în cockpit">*</span>' : '';
    } catch (e) { return ''; }
  }

  function buildGridCells(st){
    const d = st;
    const macro = st.macro;
    const cells = [];

    const primary = [];
    primary.push(card('a', './router/', 'GO',
      '<span class="ht-go-num go-' + esc(d.goCls) + '">' + esc(String(d.goScore)) + trustMark() + '</span>',
      esc(goSubLine(d)), H().goLvl(d.goCls), 'hero', { id: 'htGoCard' }));
    primary.push(card('a', './journal/#desk', 'Desk', esc(d.verdict), 'verdict Governor', H().deskLvl(d.verdictRaw), 'hero', { id: 'htCardDesk' }));

    if (st.layout === 'none'){
      primary.push(card('a', './macro-dashboard/', 'Macro', '🌍', 'Deschide Command Center', 'warn', 'hero',
        { id: 'htCardMacroCta', span: 6, extraCls: 'ht-macro-cta' }));
    } else {
      const r = macro.regime;
      const md = macro.danger || {};
      const staleNote = macro.source === 'fallback' ? ' · LS cache' : (macro.stale && macro.ageMin != null ? ' · 📦' + macro.ageMin + 'm' : '');
      const regVal = esc(String(r.label || '—').replace(/^[^\s]+\s+/, '')); // token intreg, nu un code unit (emoji surrogate)
      const streakZ = H() && H().regimeStreak ? H().regimeStreak(r.label) : 0;
      const regSub = (r.composite != null ? 'score ' + (r.composite >= 0 ? '+' : '') + r.composite : 'fără score') + staleNote + (streakZ > 1 ? ' · ' + streakZ + 'z' : '');
      primary.push(card('a', './macro-dashboard/', 'Regim risc', regVal, regSub, r.partial ? 'na' : H().macroLvl(r.label), 'hero', { id: 'htCardRegime' }));
      primary.push(heroDangerCard(md, dangerSparkHtml()));
    }

    primary.push(card('a', './router/', 'Sesiune', esc(d.sessionLabel), esc(d.sessionSub), d.sessionLvl, 'core', { id: 'htCardSession' }));
    primary.push(card('a', './journal/#portfolio', 'Risc',
      Number.isFinite(d.riskPct) ? d.riskPct.toFixed(1) + '%' + (d.riskStale ? ' ⏳' : '') : '—',
      'agregat @ SL', H().riskLvl(d.riskPct, d.riskStale), 'core', { id: 'htCardRisk' }));
    primary.push(card('a', './journal/#exec', 'Open', String(d.openN), 'poziții deschise', H().openLvl(d.openN), 'core', { id: 'htCardOpen' }));
    primary.push(marketCell('SPY', 'wSPY', 'spyVal', 'spySub', 'core'));
    primary.push(marketCell('QQQ', 'wQQQ', 'qqqVal', 'qqqSub', 'core'));
    primary.push(marketCell('VIX', 'wVIX', 'vixVal', 'vixSub', 'core'));

    cells.push(card('a', './journal/#desk', 'R săpt', esc(d.rWeek), 'realizat săptămâna asta', H().rWeekLvl(d.wr), 'core', { id: 'htCardRWeek' }));

    if (st.layout === 'full'){
      const c = macro.curve;
      const t = macro.tilt;
      cells.push(card('a', './macro-dashboard/', 'Cross-asset',
        esc(t && t.word ? t.word : '—'), esc(t && t.sub ? t.sub : ''), H().tiltLvl(t), 'compact', { id: 'htCardCross' }));
      cells.push(card('a', './macro-dashboard/', 'Curbă 10Y-3M',
        esc(c && c.label ? c.label : 'N/A'), esc(c && c.sub ? c.sub : 'proxy'), H().curveLvl(c), 'compact', { id: 'htCardCurve' }));
    }

    cells.push(card('a', './journal/#capital', 'Drift',
      Number.isFinite(d.driftPct) ? (d.driftPct >= 0 ? '+' : '') + d.driftPct.toFixed(1) + '%' : '—',
      'sim vs snapshot', H().driftLvl(d.driftPct, d.driftWarn), 'compact', { id: 'htCardDrift' }));
    cells.push(
      '<a href="./watchlist-monitor/" class="ht-card ht-core lvl-neut" id="wWL" title="Watchlist stocks"><span class="ht-m-lbl">WL</span><span class="ht-m-val" id="wlVal">—</span><span class="ht-m-sub" id="wlSub">—</span></a>',
      '<div class="ht-card ht-core lvl-neut" id="wWLBreakdown" style="cursor:pointer" title="Click → lista simboluri"><span class="ht-m-lbl">Mix</span><span class="ht-m-val ht-m-val-sm" id="wlBreakdownVal">—</span><span class="ht-m-sub" id="wlBreakdownSub">—</span></div>'
    );

    // F&G e mereu pe grilă (nu doar layout full + tile din snapshot Macro).
    // Înainte: tileCard returna '' când fng lipsea din md_hub_macro_v1 → card
    // invizibil pe hub deși alternative.me e free + CORS. Placeholder + refreshFng().
    cells.push(rowBreak());
    cells.push(fngCardHtml(macro && macro.tiles && macro.tiles.fng));

    if (st.layout === 'full' && macro.tiles){
      const tiles = macro.tiles;
      const earn = tiles.earnings || {};
      const earnVal = earn.v || String(earn.count != null ? earn.count : 0);
      const earnSub = earn.sub || (earn.symbols && earn.symbols.length ? earn.symbols.join(' · ') : 'mega-cap 7z');
      const surp = tiles.surprise;
      let surpVal = '—', surpSub = 'fără rezultate';
      if (surp){
        if (surp.v && surp.v !== '—') surpVal = surp.v;
        else if (typeof surp.score === 'number') surpVal = (surp.score >= 0 ? '+' : '') + surp.score.toFixed(0);
        surpSub = surp.sub || (surp.n ? surp.n + ' date' : 'date vs așteptări');
      }
      const tileCard = (id, lbl, t, href) => {
        if (!t || !t.v || t.v === '—') return '';
        return card('a', href || './macro-dashboard/', lbl, esc(t.v), esc(t.sub), H().tileClsToLvl(t.cls, t.sub), 'compact', { id: id });
      };
      const macroTiles = [
        tileCard('htCardDxy', 'DXY', tiles.dxy),
        tileCard('htCard10y', '10Y', tiles.tenY),
        tileCard('htCardBtc', 'BTC', tiles.btc),
        tileCard('htCardEth', 'ETH', tiles.eth),
        // F&G deja adăugat mai sus (mereu vizibil)
        card('a', './earnings-hub/', 'Earnings 7z', esc(earnVal), esc(earnSub), H().earnLvl(earn), 'compact', { id: 'htCardEarn' }),
        card('a', './macro-dashboard/', 'Surprise', esc(surpVal), esc(surpSub), H().surpLvl(surp), 'compact', { id: 'htCardSurp' })
      ].filter(Boolean);
      cells.push(...macroTiles);
    }

    cells.push(
      '<a href="./alerts/" class="ht-card ht-compact lvl-neut" id="wAlerts" style="display:none" title="Alerte preț armate"><span class="ht-m-lbl">🔔 Alerte</span><span class="ht-m-val" id="alertsVal">—</span><span class="ht-m-sub" id="alertsSub">—</span></a>'
    );
    return { primary: primary, more: cells };
  }

  function captureMarket(){
    const out = {};
    ['SPY', 'QQQ', 'VIX'].forEach(sym => {
      const map = { SPY: ['spyVal', 'spySub', 'wSPY'], QQQ: ['qqqVal', 'qqqSub', 'wQQQ'], VIX: ['vixVal', 'vixSub', 'wVIX'] }[sym];
      const v = $(map[0]), s = $(map[1]), w = $(map[2]);
      if (v && v.textContent !== '—') out[sym] = { val: v.textContent, sub: s ? s.innerHTML : '', wrapCls: w ? w.className : '' };
    });
    return out;
  }

  function restoreMarket(saved){
    if (!saved) return;
    Object.keys(saved).forEach(sym => {
      const map = { SPY: ['spyVal', 'spySub', 'wSPY'], QQQ: ['qqqVal', 'qqqSub', 'wQQQ'], VIX: ['vixVal', 'vixSub', 'wVIX'] }[sym];
      const item = saved[sym];
      const v = $(map[0]), s = $(map[1]), w = $(map[2]);
      if (v) v.textContent = item.val;
      if (s) s.innerHTML = item.sub;
      if (w && item.wrapCls) w.className = item.wrapCls;
    });
  }

  function patchCard(id, valHtml, subText, lvl){
    const el = $(id);
    if (!el) return;
    const v = el.querySelector('.ht-m-val');
    const s = el.querySelector('.ht-m-sub');
    if (v) v.innerHTML = valHtml;
    if (s && subText != null) s.textContent = subText;
    if (H()) H().setCardLvl(el, lvl);
  }

  function patchGrid(st){
    const d = st;
    const macro = st.macro;

    patchCard('htGoCard',
      '<span class="ht-go-num go-' + esc(d.goCls) + '">' + esc(String(d.goScore)) + trustMark() + '</span>',
      goSubLine(d), H().goLvl(d.goCls));
    patchCard('htCardDesk', esc(d.verdict), 'verdict Governor', H().deskLvl(d.verdictRaw));
    patchCard('htCardSession', esc(d.sessionLabel), d.sessionSub, d.sessionLvl);
    patchCard('htCardRisk',
      Number.isFinite(d.riskPct) ? d.riskPct.toFixed(1) + '%' + (d.riskStale ? ' ⏳' : '') : '—',
      'agregat @ SL', H().riskLvl(d.riskPct, d.riskStale));
    patchCard('htCardOpen', String(d.openN), 'poziții deschise', H().openLvl(d.openN));
    patchCard('htCardRWeek', d.rWeek, 'realizat săptămâna asta', H().rWeekLvl(d.wr));
    patchCard('htCardDrift',
      Number.isFinite(d.driftPct) ? (d.driftPct >= 0 ? '+' : '') + d.driftPct.toFixed(1) + '%' : '—',
      'sim vs snapshot', H().driftLvl(d.driftPct, d.driftWarn));

    if (st.layout !== 'none' && macro && macro.regime){
      const r = macro.regime;
      const md = macro.danger || {};
      const staleNote = macro.source === 'fallback' ? ' · LS cache' : (macro.stale && macro.ageMin != null ? ' · 📦' + macro.ageMin + 'm' : '');
      const regVal = esc(String(r.label || '—').replace(/^[^\s]+\s+/, '')); // token intreg, nu un code unit (emoji surrogate)
      const streakZ = H() && H().regimeStreak ? H().regimeStreak(r.label) : 0;
      const regSub = (r.composite != null ? 'score ' + (r.composite >= 0 ? '+' : '') + r.composite : 'fără score') + staleNote + (streakZ > 1 ? ' · ' + streakZ + 'z' : '');
      patchCard('htCardRegime', regVal, regSub, r.partial ? 'na' : H().macroLvl(r.label));
      const dEl = $('htCardDanger');
      if (dEl){
        let dSub = 'sizing ' + (md.mult || '—');
        if (md.level) dSub += ' · ' + md.level;
        patchCard('htCardDanger', esc(String(md.score != null ? md.score : '—')) + '<span class="ht-dim">/100</span>', esc(dSub), H().dangerLvlFromScore(md.score, md.cls));
        let spark = dEl.querySelector('.ht-danger-spark');
        const sparkHtml = dangerSparkHtml();
        if (sparkHtml){
          if (spark) spark.outerHTML = sparkHtml;
          else dEl.insertAdjacentHTML('beforeend', sparkHtml);
        } else if (spark) spark.remove();
      }
    }

    // F&G: patch din snapshot dacă există; altfel refreshFng (nu ascunde cardul)
    try {
      const tf = macro && macro.tiles && macro.tiles.fng;
      if (tf && tf.v && tf.v !== '—'){
        paintFngCard(tf.v, tf.sub || 'Crypto Fear&Greed', H().tileClsToLvl ? H().tileClsToLvl(tf.cls, tf.sub) : fngLvl(tf.v));
      } else {
        refreshFng(false);
      }
    } catch (e) { refreshFng(false); }

    if (st.layout === 'full' && macro && macro.tiles){
      const tiles = macro.tiles;
      const patchTile = (id, t) => {
        const el = $(id);
        if (!el) return;
        if (!t || !t.v || t.v === '—'){ el.style.display = 'none'; return; }
        el.style.display = '';
        patchCard(id, esc(t.v), t.sub || '', H().tileClsToLvl(t.cls, t.sub));
      };
      patchTile('htCardDxy', tiles.dxy);
      patchTile('htCard10y', tiles.tenY);
      patchTile('htCardBtc', tiles.btc);
      patchTile('htCardEth', tiles.eth);
      const earn = tiles.earnings || {};
      patchCard('htCardEarn', esc(earn.v || String(earn.count || 0)), earn.sub || 'mega-cap 7z', H().earnLvl(earn));
      const surp = tiles.surprise;
      if (surp){
        let sv = '—', ss = 'fără rezultate';
        if (surp.v && surp.v !== '—') sv = surp.v;
        else if (typeof surp.score === 'number') sv = (surp.score >= 0 ? '+' : '') + surp.score.toFixed(0);
        ss = surp.sub || (surp.n ? surp.n + ' date' : 'date vs așteptări');
        patchCard('htCardSurp', esc(sv), ss, H().surpLvl(surp));
      }
      if (macro.curve) patchCard('htCardCurve', esc(macro.curve.label || 'N/A'), esc(macro.curve.sub || 'proxy'), H().curveLvl(macro.curve));
      if (macro.tilt) patchCard('htCardCross', esc(macro.tilt.word || '—'), esc(macro.tilt.sub || ''), H().tiltLvl(macro.tilt));
    }
  }

  function sessionMode(){
    if (global.HB && HB.sessionMode) return HB.sessionMode();
    try {
      const o = localStorage.getItem('hub_session_mode');
      if (o === 'pre' || o === 'rth' || o === 'after' || o === 'review') return o;
    } catch (e) {}
    return 'rth';
  }
  function sessionModeLock(){
    if (global.HB && HB.sessionModeLock) return HB.sessionModeLock();
    try {
      const o = localStorage.getItem('hub_session_mode');
      if (o === 'pre' || o === 'rth' || o === 'after' || o === 'review') return o;
    } catch (e) {}
    return 'auto';
  }

  // I-215: bar principal e #hubSessBar; pills HT rămân scurtături (incl. Auto + AH)
  function sessionModePills(){
    const mode = sessionMode();
    const lock = sessionModeLock();
    const labels = { auto: '⟳', pre: '🌅 Pre', rth: '📈 RTH', after: '🌙 AH', review: '🔬' };
    return '<div class="ht-mode-group" role="group" aria-label="Mod sesiune hub">' +
      ['auto', 'pre', 'rth', 'after', 'review'].map(m => {
        const on = (m === 'auto' && lock === 'auto') || (m !== 'auto' && lock === m);
        return '<button type="button" class="ht-pill ht-mode' + (on ? ' on' : '') +
          (m !== 'auto' && mode === m && lock === 'auto' ? ' soft' : '') +
          '" data-ht-mode="' + m + '" title="' + m + '">' + labels[m] + '</button>';
      }).join('') + '</div>';
  }

  function statusPills(){
    let check = '', health = '';
    if (global.MC && MC.items){
      const mc = MC.items();
      const ok = mc.done >= mc.total - 2;
      const crit = global.MC.criticalOk ? MC.criticalOk() : ok;
      check = '<button type="button" class="ht-pill ht-check' + (ok ? ' ok' : '') + (crit ? '' : ' warn') + '" id="htBtnCheck" title="Morning checklist — click expand">✓ ' +
        mc.done + '/' + mc.total + '</button>';
    }
    if (global.HUB_HEALTH && HUB_HEALTH.pillHtml){
      health = HUB_HEALTH.pillHtml();
    } else {
      try {
        const hp = global.CD && CD.healthProbe ? CD.healthProbe() : null;
        if (hp){
          const cls = hp.cls === 'ok' ? 'ok' : hp.cls === 'warn' ? 'warn' : 'bad';
          health = '<a href="./health/" class="ht-pill ht-health ' + cls + '" id="htHealthPill">' + (hp.cls === 'ok' ? 'Health OK' : 'Health ' + esc(hp.cls)) + '</a>';
        }
      } catch (e) {}
    }
    return check + health;
  }

  function navHtml(){
    return '<nav class="ht-nav" aria-label="Navigare rapidă">' + NAV.map(n => {
      const pri = n.pri ? ' pri' : '';
      if (n.action === 'plans'){
        return '<button type="button" class="ht-nav-item' + pri + '" data-ht-action="plans"><span class="ht-n-ico">' + n.icon +
          '</span><span class="ht-n-lbl">' + esc(n.label) + '</span></button>';
      }
      const ext = n.external ? ' target="_blank" rel="noopener"' : '';
      return '<a href="' + n.href + '" class="ht-nav-item' + pri + '"' + ext + '><span class="ht-n-ico">' + n.icon +
        '</span><span class="ht-n-lbl">' + esc(n.label) + '</span></a>';
    }).join('') + '</nav>';
  }

  function patchChrome(st){
    const pills = $('htPills');
    if (pills) pills.innerHTML = statusPills();
    const act = $('htGoldAct');
    if (act){
      if (st.actionPhrases.length){
        act.innerHTML = '<span class="ht-gold-arrow">→</span> AZI: <strong>' + esc(st.actionPhrases.join(' · ')) + '</strong>';
        act.style.display = '';
      } else act.style.display = 'none';
    }
    const stale = $('htStaleSlot');
    if (stale) stale.innerHTML = macroStaleBannerHtml(st.macro);
  }

  function buildShell(el){
    // I-212: fără al doilea rând de nav (dock + launch pad acoperă navigarea)
    // Gappers = bandă FULL-WIDTH separată (nu înghesuită în gold-bar cu evenimente)
    el.innerHTML =
      '<div class="ht-top">' +
        '<div class="ht-pills" id="htPills"></div>' +
      '</div>' +
      '<div id="hubGappersSlot" class="ht-gappers-slot" aria-label="Pre-market gappers" hidden></div>' +
      '<div class="ht-gold-bar">' +
        '<div class="ht-gold-act" id="htGoldAct"></div>' +
        '<div class="ht-gold-ev-wrap">' +
          '<span class="ht-gold-ev-lbl">Evenimente</span>' +
          '<div id="hubGoldEvents" class="ht-gold-events" aria-label="Evenimente high-impact"></div>' +
        '</div>' +
      '</div>' +
      '<div id="htStaleSlot"></div>' +
      '<div id="htGridSlot"></div>';
  }

  function rebuildGrid(st){
    const slot = $('htGridSlot');
    if (!slot) return;
    const saved = captureMarket();
    const wasMore = $('htMore') && $('htMore').open;
    const parts = buildGridCells(st);
    const more = (parts.more || []).filter(Boolean);
    let html = '<div class="ht-command-grid" id="htCommandGrid">' + (parts.primary || []).join('') + '</div>';
    if (more.length){
      html += '<details class="ht-more" id="htMore"><summary>Mai multe cifre</summary>' +
        '<div class="ht-command-grid">' + more.join('') + '</div></details>';
    }
    slot.innerHTML = html;
    if (wasMore && $('htMore')) $('htMore').open = true;
    restoreMarket(saved);
  }

  function closeWlPop(){
    if (wlPop){ wlPop.remove(); wlPop = null; }
  }

  function toggleWlPop(anchor){
    if (wlPop){ closeWlPop(); return; }
    const d = global.__hubWlData || { stockWL: [], cryptoWL: [] };
    const chip = (s, c) => '<span class="ht-wl-chip" style="color:' + c + '">' + esc(s) + '</span>';
    wlPop = document.createElement('div');
    wlPop.className = 'ht-wl-pop';
    wlPop.innerHTML =
      '<div class="ht-wl-pop-h">📈 STOCKS (' + d.stockWL.length + ')</div>' +
      (d.stockWL.length ? d.stockWL.map(s => chip(s, 'var(--crypto-2)')).join('') : '<span class="ht-wl-empty">gol</span>') +
      '<div class="ht-wl-pop-h">🪙 CRYPTO (' + d.cryptoWL.length + ')</div>' +
      (d.cryptoWL.length ? d.cryptoWL.map(s => chip(s, '#5bb0ff')).join('') : '<span class="ht-wl-empty">gol</span>');
    const r = anchor.getBoundingClientRect();
    wlPop.style.left = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - 330)) + 'px';
    wlPop.style.top = (r.bottom + window.scrollY + 6) + 'px';
    document.body.appendChild(wlPop);
    setTimeout(() => {
      document.addEventListener('click', function closer(ev){
        if (!wlPop){ document.removeEventListener('click', closer); return; }
        if (!anchor.contains(ev.target) && !wlPop.contains(ev.target)){ closeWlPop(); document.removeEventListener('click', closer); }
      });
    }, 0);
  }

  function ensureDelegation(root){
    if (!root || root.dataset.htDelegated) return;
    root.dataset.htDelegated = '1';
    root.addEventListener('click', e => {
      const modeBtn = e.target.closest('[data-ht-mode]');
      if (modeBtn){
        const m = modeBtn.getAttribute('data-ht-mode');
        if (m){
          try { localStorage.setItem('hub_session_mode', m === 'auto' ? 'auto' : m); } catch (e2) {}
          if (global.HB && HB.applySessionMode) HB.applySessionMode();
          else render();
        }
        return;
      }
      if (e.target.closest('#htBtnCheck')){
        const cl = $('hubChecklist');
        if (!cl) return;
        const show = cl.style.display === 'none' || !cl.style.display;
        cl.style.display = show ? 'flex' : 'none';
        cl.dataset.expanded = show ? '1' : '0';
        if (show) cl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        if (global.HB && HB.renderChecklist) HB.renderChecklist();
        return;
      }
      if (e.target.closest('[data-ht-action="plans"]')){
        if (typeof global.openTradeTracker === 'function') openTradeTracker();
        return;
      }
      const mix = e.target.closest('#wWLBreakdown');
      if (mix && !e.target.closest('a')){
        e.stopPropagation();
        toggleWlPop(mix);
      }
    });
  }

  function postRender(opts){
    opts = opts || {};
    if (opts.restoreMarket && typeof global.hubRestoreMarketWidgets === 'function') hubRestoreMarketWidgets();
    if (typeof global.hubRefreshAuxWidgets === 'function') hubRefreshAuxWidgets();
  }

  function render(){
    const el = $('hubTableau');
    if (!el) return;
    if (H()) H().invalidateRtEval();
    // stub complet — fără goScore/verdict/rWeek, cardurile randau literal „undefined"
    const st = global.HS ? H().hubState() : {
      layout: 'none', macro: null, actionPhrases: [],
      goScore: '—', goLabel: '…', goCls: 'neut', verdict: '—', verdictRaw: '',
      rWeek: '—', wr: null, riskPct: null, riskStale: false, openN: 0,
      driftPct: null, driftWarn: false, sessionLabel: '—', sessionSub: '—',
      session: '', sessionLvl: 'neut', rtPayload: null, marketTone: null
    };
    const layout = st.layout;

    if (!el.dataset.htShell){
      buildShell(el);
      ensureDelegation(el);
      el.dataset.htShell = '1';
      rebuildGrid(st);
      el.dataset.htLayout = layout;
      patchChrome(st);
    } else if (el.dataset.htLayout !== layout){
      rebuildGrid(st);
      el.dataset.htLayout = layout;
      patchChrome(st);
      postRender({ restoreMarket: true });
    } else {
      patchGrid(st);
      patchChrome(st);
      postRender({ restoreMarket: false });
    }

    if (global.ET && ET.render) ET.render($('hubGoldEvents'));
    if (global.HG){
      if (HG.render) HG.render($('hubGappersSlot'));
      if (HG.tick) HG.tick();
    }
    if (global.HUB_HEALTH && HUB_HEALTH.syncCheck) HUB_HEALTH.syncCheck();
    if (global.HS){
      H().patchMarketCards();
      H().renderStaleNav();
      H().exportDigestForBot();
      H().maybeSendMorningDigest();
    }
    if (global.HB && HB.updateSessionPill) HB.updateSessionPill();
    if (global.HCL && HCL.render) HCL.render();
    // F&G mereu reîmprospătat (snapshot Macro sau alternative.me direct)
    refreshFng(false);
  }

  global.HT = {
    render,
    postRender,
    refreshFng,
    hubState: () => global.HS ? H().hubState() : null
  };
})(typeof window !== 'undefined' ? window : global);