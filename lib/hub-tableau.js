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
  const H = () => global.HS;

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
    const hide = opts.hidden ? ' hidden' : '';
    const style = opts.style || '';
    const styleAttr = (opts.hidden || style) ? ' style="' + (opts.hidden ? 'display:none' : '') + style + '"' : '';
    const cls = opts.extraCls ? ' ' + opts.extraCls : '';
    const title = opts.title ? ' title="' + esc(opts.title) + '"' : '';
    const click = opts.onclick ? ' onclick="' + opts.onclick + '"' : '';
    const open = tag === 'a'
      ? '<a href="' + (href || '#') + '" class="ht-card lvl-' + (lvl || 'neut') + tierCls + span + cls + hide + '"' + id + styleAttr + title + click + '>'
      : '<div class="ht-card lvl-' + (lvl || 'neut') + tierCls + span + cls + hide + '"' + id + styleAttr + title + click + '>';
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

  function heroDangerCard(md, spark){
    const dLvl = H().dangerLvlFromScore(md.score, md.cls);
    let dSub = 'sizing ' + esc(md.mult || '—');
    if (md.level) dSub += ' · ' + esc(md.level);
    return card('a', './macro-dashboard/', 'Danger',
      (md.score != null ? md.score : '—') + '<span class="ht-dim">/100</span>',
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

  function buildGridCells(st){
    const d = st;
    const macro = st.macro;
    const cells = [];

    cells.push(card('a', './router/', 'GO',
      '<span class="ht-go-num go-' + esc(d.goCls) + '">' + esc(String(d.goScore)) + '</span>',
      esc(goSubLine(d)), H().goLvl(d.goCls), 'hero', { id: 'htGoCard' }));
    cells.push(card('a', './journal/#desk', 'Desk', esc(d.verdict), 'verdict Governor', H().deskLvl(d.verdictRaw), 'hero', { id: 'htCardDesk' }));

    if (st.layout === 'none'){
      cells.push(card('a', './macro-dashboard/', 'Macro', '🌍', 'Deschide Command Center', 'warn', 'hero',
        { id: 'htCardMacroCta', span: 6, extraCls: 'ht-macro-cta' }));
    } else {
      const r = macro.regime;
      const md = macro.danger || {};
      const staleNote = macro.source === 'fallback' ? ' · LS cache' : (macro.stale && macro.ageMin != null ? ' · 📦' + macro.ageMin + 'm' : '');
      const regVal = esc(String(r.label || '—').replace(/^.\s*/, ''));
      const regSub = (r.composite != null ? 'score ' + (r.composite >= 0 ? '+' : '') + r.composite : 'fără score') + staleNote;
      cells.push(card('a', './macro-dashboard/', 'Regim risc', regVal, regSub, r.partial ? 'na' : H().macroLvl(r.label), 'hero', { id: 'htCardRegime' }));
      cells.push(heroDangerCard(md, dangerSparkHtml()));
    }
    cells.push(rowBreak());

    cells.push(card('a', './router/', 'Sesiune', esc(d.sessionLabel), esc(d.sessionSub), d.sessionLvl, 'core', { id: 'htCardSession' }));
    cells.push(card('a', './journal/#portfolio', 'Risc',
      d.riskPct != null ? d.riskPct.toFixed(1) + '%' + (d.riskStale ? ' ⏳' : '') : '—',
      'agregat @ SL', H().riskLvl(d.riskPct, d.riskStale), 'core', { id: 'htCardRisk' }));
    cells.push(card('a', './journal/#exec', 'Open', String(d.openN), 'poziții deschise', H().openLvl(d.openN), 'core', { id: 'htCardOpen' }));
    cells.push(card('a', './journal/#desk', 'R săpt', esc(d.rWeek), 'realizat săptămâna asta', H().rWeekLvl(d.wr), 'core', { id: 'htCardRWeek' }));
    cells.push(marketCell('SPY', 'wSPY', 'spyVal', 'spySub', 'core'));
    cells.push(marketCell('QQQ', 'wQQQ', 'qqqVal', 'qqqSub', 'core'));
    cells.push(rowBreak());

    cells.push(marketCell('VIX', 'wVIX', 'vixVal', 'vixSub', 'core'));

    if (st.layout === 'full'){
      const c = macro.curve;
      const t = macro.tilt;
      cells.push(card('a', './macro-dashboard/', 'Cross-asset',
        esc(t && t.word ? t.word : '—'), esc(t && t.sub ? t.sub : ''), H().tiltLvl(t), 'compact', { id: 'htCardCross' }));
      cells.push(card('a', './macro-dashboard/', 'Curbă 10Y-3M',
        esc(c && c.label ? c.label : 'N/A'), esc(c && c.sub ? c.sub : 'proxy'), H().curveLvl(c), 'compact', { id: 'htCardCurve' }));
    }

    cells.push(card('a', './journal/#capital', 'Drift',
      d.driftPct != null ? (d.driftPct >= 0 ? '+' : '') + d.driftPct.toFixed(1) + '%' : '—',
      'sim vs snapshot', H().driftLvl(d.driftPct, d.driftWarn), 'compact', { id: 'htCardDrift' }));
    cells.push(
      '<a href="./watchlist-monitor/" class="ht-card ht-core lvl-neut" id="wWL" title="Watchlist stocks"><span class="ht-m-lbl">WL</span><span class="ht-m-val" id="wlVal">—</span><span class="ht-m-sub" id="wlSub">—</span></a>',
      '<div class="ht-card ht-core lvl-neut" id="wWLBreakdown" style="cursor:pointer" title="Click → lista simboluri"><span class="ht-m-lbl">Mix</span><span class="ht-m-val ht-m-val-sm" id="wlBreakdownVal">—</span><span class="ht-m-sub" id="wlBreakdownSub">—</span></div>'
    );

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
      cells.push(rowBreak());
      const macroTiles = [
        tileCard('htCardDxy', 'DXY', tiles.dxy),
        tileCard('htCard10y', '10Y', tiles.tenY),
        tileCard('htCardBtc', 'BTC', tiles.btc),
        tileCard('htCardEth', 'ETH', tiles.eth),
        tileCard('htCardFng', 'F&G', tiles.fng),
        card('a', './earnings-hub/', 'Earnings 7z', esc(earnVal), esc(earnSub), H().earnLvl(earn), 'compact', { id: 'htCardEarn' }),
        card('a', './macro-dashboard/', 'Surprise', esc(surpVal), esc(surpSub), H().surpLvl(surp), 'compact', { id: 'htCardSurp' })
      ].filter(Boolean);
      cells.push(...macroTiles);
    }

    cells.push(
      '<div class="ht-card ht-compact lvl-neut" id="wAlerts" style="display:none;cursor:pointer" title="Alerte preț armate" onclick="location.href=\'alerts/\'"><span class="ht-m-lbl">🔔 Alerte</span><span class="ht-m-val" id="alertsVal">—</span><span class="ht-m-sub" id="alertsSub">—</span></div>'
    );
    return cells;
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
      '<span class="ht-go-num go-' + esc(d.goCls) + '">' + esc(String(d.goScore)) + '</span>',
      goSubLine(d), H().goLvl(d.goCls));
    patchCard('htCardDesk', esc(d.verdict), 'verdict Governor', H().deskLvl(d.verdictRaw));
    patchCard('htCardSession', esc(d.sessionLabel), d.sessionSub, d.sessionLvl);
    patchCard('htCardRisk',
      d.riskPct != null ? d.riskPct.toFixed(1) + '%' + (d.riskStale ? ' ⏳' : '') : '—',
      'agregat @ SL', H().riskLvl(d.riskPct, d.riskStale));
    patchCard('htCardOpen', String(d.openN), 'poziții deschise', H().openLvl(d.openN));
    patchCard('htCardRWeek', d.rWeek, 'realizat săptămâna asta', H().rWeekLvl(d.wr));
    patchCard('htCardDrift',
      d.driftPct != null ? (d.driftPct >= 0 ? '+' : '') + d.driftPct.toFixed(1) + '%' : '—',
      'sim vs snapshot', H().driftLvl(d.driftPct, d.driftWarn));

    if (st.layout !== 'none' && macro && macro.regime){
      const r = macro.regime;
      const md = macro.danger || {};
      const staleNote = macro.source === 'fallback' ? ' · LS cache' : (macro.stale && macro.ageMin != null ? ' · 📦' + macro.ageMin + 'm' : '');
      const regVal = esc(String(r.label || '—').replace(/^.\s*/, ''));
      const regSub = (r.composite != null ? 'score ' + (r.composite >= 0 ? '+' : '') + r.composite : 'fără score') + staleNote;
      patchCard('htCardRegime', regVal, regSub, r.partial ? 'na' : H().macroLvl(r.label));
      const dEl = $('htCardDanger');
      if (dEl){
        let dSub = 'sizing ' + (md.mult || '—');
        if (md.level) dSub += ' · ' + md.level;
        patchCard('htCardDanger', (md.score != null ? md.score : '—') + '<span class="ht-dim">/100</span>', dSub, H().dangerLvlFromScore(md.score, md.cls));
        let spark = dEl.querySelector('.ht-danger-spark');
        const sparkHtml = dangerSparkHtml();
        if (sparkHtml){
          if (spark) spark.outerHTML = sparkHtml;
          else dEl.insertAdjacentHTML('beforeend', sparkHtml);
        } else if (spark) spark.remove();
      }
    }

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
      patchTile('htCardFng', tiles.fng);
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

  function statusPills(){
    let check = '', health = '';
    if (global.MC && MC.items){
      const mc = MC.items();
      const ok = mc.done >= mc.total - 2;
      check = '<button type="button" class="ht-pill ht-check' + (ok ? ' ok' : '') + '" id="htBtnCheck" title="Morning checklist">Check ' +
        mc.done + '/' + mc.total + '</button>';
    }
    try {
      const hp = global.CD && CD.healthProbe ? CD.healthProbe() : null;
      if (hp){
        const cls = hp.cls === 'ok' ? 'ok' : hp.cls === 'warn' ? 'warn' : 'bad';
        health = '<a href="./health/" class="ht-pill ht-health ' + cls + '">' + (hp.cls === 'ok' ? 'Health OK' : 'Health ' + esc(hp.cls)) + '</a>';
      }
    } catch (e) {}
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
    el.innerHTML =
      '<div class="ht-top">' +
        '<p class="ht-tagline">Journal central <span class="ht-arr">→</span> Plan <span class="ht-arr">→</span> Scan <span class="ht-arr">→</span> Review</p>' +
        '<div class="ht-pills" id="htPills"></div>' +
      '</div>' +
      '<div class="ht-gold-bar">' +
        '<div class="ht-gold-act" id="htGoldAct"></div>' +
        '<div class="ht-gold-ev-wrap">' +
          '<span class="ht-gold-ev-lbl">Evenimente</span>' +
          '<div id="hubGoldEvents" class="ht-gold-events" aria-label="Evenimente high-impact"></div>' +
        '</div>' +
      '</div>' +
      '<div id="htStaleSlot"></div>' +
      '<div id="htGridSlot"></div>' +
      '<div id="htNavSlot"></div>';
    const nav = $('htNavSlot');
    if (nav) nav.innerHTML = navHtml();
  }

  function rebuildGrid(st){
    const slot = $('htGridSlot');
    if (!slot) return;
    const saved = captureMarket();
    slot.innerHTML = '<div class="ht-command-grid" id="htCommandGrid">' + buildGridCells(st).join('') + '</div>';
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
      if (e.target.closest('#htBtnCheck')){
        const cl = $('hubChecklist');
        if (!cl) return;
        const show = cl.style.display === 'none' || !cl.style.display;
        cl.style.display = show ? 'flex' : 'none';
        if (show) cl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    const st = H() ? H().hubState() : { layout: 'none', macro: null, actionPhrases: [] };
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
    if (H()){
      H().patchMarketCards();
      H().renderStaleNav();
    }
  }

  global.HT = {
    render,
    postRender,
    hubState: () => H() ? H().hubState() : null
  };
})(typeof window !== 'undefined' ? window : global);