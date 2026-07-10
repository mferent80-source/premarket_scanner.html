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

  function macroLvl(label){
    const l = String(label || '');
    if (/RISK-OFF|STRESS/.test(l)) return 'bear';
    if (/CAUTIOUS/.test(l)) return 'warn';
    if (/RISK-ON|LEAN/.test(l)) return 'ok';
    return 'neut';
  }

  function curveLvl(c){
    if (!c) return 'na';
    if (c.label === 'INVERSATĂ') return 'bear';
    if (c.label === 'Plată') return 'warn';
    return 'ok';
  }

  function tiltLvl(t){
    if (!t || !t.word) return 'na';
    if (t.word.includes('RISK-ON')) return 'ok';
    if (t.word.includes('RISK-OFF')) return 'bear';
    return 'neut';
  }

  function tileClsToLvl(cls, sub){
    if (cls === 'bull' || cls === 'high') return 'ok';
    if (cls === 'bear') return 'bear';
    if (cls === 'warn' || cls === 'gold') return 'warn';
    const s = String(sub || '');
    if (/▼|down/i.test(s)) return 'bear';
    if (/▲|up/i.test(s)) return 'ok';
    return 'neut';
  }

  const INVERTED_TILES = { VIX: true };

  function deskLvl(verdict){
    if (verdict === 'HALTED') return 'bear';
    if (verdict === 'CAUTION') return 'warn';
    return 'ok';
  }

  function riskLvl(pct, stale){
    if (pct == null) return 'neut';
    const halt = (global.CD && CD.RISK_HALT_PCT) || 4;
    const warn = (global.CD && CD.RISK_WARN_PCT) || 2;
    if (pct >= halt) return 'bear';
    if (pct >= warn) return 'warn';
    return stale ? 'warn' : 'ok';
  }

  function openLvl(n){
    if (!n) return 'ok';
    if (n <= 3) return 'neut';
    return 'warn';
  }

  function rWeekLvl(wr){
    if (!wr || !wr.n) return 'neut';
    if (wr.lossR >= wr.budgetR) return 'bear';
    if (wr.lossR >= wr.budgetR * 0.6) return 'warn';
    if (wr.netR > 0) return 'ok';
    if (wr.netR < 0) return 'bear';
    return 'neut';
  }

  function driftLvl(pct, warn){
    if (warn) return 'warn';
    if (pct == null) return 'neut';
    if (pct <= -3) return 'bear';
    if (pct >= 3) return 'ok';
    return 'neut';
  }

  function earnLvl(earn){
    const n = earn && (earn.count != null ? earn.count : parseInt(earn.v, 10));
    if (!n) return 'neut';
    if (n >= 3) return 'warn';
    return 'ok';
  }

  function surpLvl(surp){
    if (!surp) return 'neut';
    if (surp.cls) return tileClsToLvl(surp.cls, surp.sub);
    if (typeof surp.score === 'number'){
      if (surp.score > 15) return 'ok';
      if (surp.score < -15) return 'bear';
      return 'warn';
    }
    return 'neut';
  }

  function goLvl(cls){
    if (cls === 'go') return 'ok';
    if (cls === 'caution') return 'warn';
    if (cls === 'nogo') return 'bear';
    return 'neut';
  }

  function sessionLvl(session){
    if (session === 'open') return 'ok';
    if (session === 'pre' || session === 'after') return 'warn';
    return 'neut';
  }

  function marketCell(lbl, wrapId, valId, subId, tier){
    return '<div class="ht-card ht-market ht-' + (tier || 'core') + ' lvl-neut" id="' + wrapId + '">' +
      '<span class="ht-m-lbl">' + esc(lbl) + '</span>' +
      '<span class="ht-m-val" id="' + valId + '">—</span>' +
      '<span class="ht-m-sub" id="' + subId + '">…</span></div>';
  }

  function card(tag, href, lbl, val, sub, lvl, tier, opts){
    opts = opts || {};
    const tierCls = tier === 'hero' ? ' ht-hero' : tier === 'core' ? ' ht-core' : ' ht-compact';
    const span = opts.span ? ' ht-span-' + opts.span : '';
    const id = opts.id ? ' id="' + opts.id + '"' : '';
    const style = opts.hidden ? ' style="display:none"' : (opts.style || '');
    const cls = opts.extraCls ? ' ' + opts.extraCls : '';
    const title = opts.title ? ' title="' + esc(opts.title) + '"' : '';
    const click = opts.onclick ? ' onclick="' + opts.onclick + '"' : '';
    const open = tag === 'a'
      ? '<a href="' + (href || '#') + '" class="ht-card lvl-' + (lvl || 'neut') + tierCls + span + cls + '"' + id + style + title + click + '>'
      : '<div class="ht-card lvl-' + (lvl || 'neut') + tierCls + span + cls + '"' + id + style + title + click + '>';
    const close = tag === 'a' ? '</a>' : '</div>';
    return open +
      '<span class="ht-m-lbl">' + esc(lbl) + '</span>' +
      '<span class="ht-m-val">' + val + '</span>' +
      (sub != null && sub !== '' ? '<span class="ht-m-sub">' + sub + '</span>' : '') +
      close;
  }

  function collectData(){
    const d = {
      snap: global.MCTX && MCTX.hubSnapshot ? MCTX.hubSnapshot() : null,
      verdict: '—', verdictRaw: '', riskPct: null, riskStale: false, openN: 0,
      driftPct: null, driftWarn: false, rWeek: '—', wr: null,
      goScore: '—', goLabel: '…', goCls: 'neut', sizingMult: null, tradesLeft: null,
      sessionLabel: '—', sessionSub: '—', session: '', sessionLvl: 'neut'
    };
    try {
      if (global.GV && GV.status){
        const st = GV.status();
        const lb = GV.labelOf ? GV.labelOf(st.verdict) : { text: st.verdict };
        d.verdict = lb.text || st.verdict;
        d.verdictRaw = st.verdict || '';
      }
      if (global.CD && CD.unified){
        const pf = CD.unified().portfolio || {};
        d.riskPct = pf.riskPct;
        d.riskStale = !!pf.liveStale;
        d.openN = pf.count || 0;
      }
      if (global.JR && JR.all) d.openN = JR.all().filter(e => JR.isOpen(e)).length;
      if (global.EQ && EQ.drift){
        const dr = EQ.drift();
        d.driftPct = dr.driftPct;
        d.driftWarn = dr.warn || dr.stale;
      }
    } catch (e) {}
    if (global.JI && JI.weekRStats){
      d.wr = JI.weekRStats();
      if (d.wr.n > 0 && d.wr.netR != null) d.rWeek = (d.wr.netR >= 0 ? '+' : '') + d.wr.netR.toFixed(1) + 'R';
      else d.rWeek = '0R';
    }
    if (global.RT && RT.evaluate){
      try {
        const p = RT.evaluate();
        const c = p.context || (RT.buildContext ? RT.buildContext() : {});
        d.goScore = p.goScore;
        d.goLabel = p.goLabel || '—';
        d.goCls = p.goCls || 'caution';
        d.sizingMult = p.sizingMult;
        d.tradesLeft = p.tradesLeftToday;
        d.sessionLabel = c.sessionLabel || '—';
        d.session = c.session || '';
        d.sessionSub = (c.sessionDetail && c.sessionDetail.countdown) ? c.sessionDetail.countdown : '—';
        d.sessionLvl = sessionLvl(d.session);
      } catch (e) {}
    }
    return d;
  }

  function macroCompactTiles(tiles){
    if (!tiles) return [];
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
    const mk = (lbl, t) => {
      if (!t || !t.v || t.v === '—') return '';
      let lvl = tileClsToLvl(t.cls, t.sub);
      return card('a', './macro-dashboard/', lbl, esc(t.v), esc(t.sub), lvl, 'compact');
    };
    return [
      mk('DXY', tiles.dxy),
      mk('10Y', tiles.tenY),
      mk('BTC', tiles.btc),
      mk('ETH', tiles.eth),
      mk('F&G', tiles.fng),
      card('a', './earnings-hub/', 'Earnings 7z', esc(earnVal), esc(earnSub), earnLvl(earn), 'compact'),
      card('a', './macro-dashboard/', 'Surprise', esc(surpVal), esc(surpSub), surpLvl(surp), 'compact')
    ].filter(Boolean);
  }

  function rowBreak(){
    return '<div class="ht-row-break" aria-hidden="true"></div>';
  }

  function goSubLine(d){
    const parts = [d.goLabel];
    if (d.sizingMult != null) parts.push('×' + d.sizingMult);
    if (typeof d.tradesLeft === 'number') parts.push(d.tradesLeft + ' trades');
    return parts.join(' · ');
  }

  function commandGrid(){
    const d = collectData();
    const snap = d.snap;
    const cells = [];

    // ── Tier 1: decizie (mare) — GO · Desk · Regim · Danger ──
    cells.push(card('a', './router/', 'GO',
      '<span class="ht-go-num go-' + esc(d.goCls) + '">' + esc(String(d.goScore)) + '</span>',
      esc(goSubLine(d)), goLvl(d.goCls), 'hero', { id: 'htGoCard' }));
    cells.push(card('a', './journal/#desk', 'Desk', esc(d.verdict), 'verdict Governor', deskLvl(d.verdictRaw), 'hero'));

    if (!snap || !snap.regime){
      cells.push(card('a', './macro-dashboard/', 'Macro', '🌍', 'Deschide Command Center', 'warn', 'hero', { span: 6, extraCls: 'ht-macro-cta' }));
    } else {
      const r = snap.regime;
      const md = snap.danger || {};
      const stale = snap.stale ? ' · 📦' + snap.ageMin + 'm' : '';
      const regVal = esc(String(r.label || '—').replace(/^.\s*/, ''));
      const regSub = 'score ' + (r.composite >= 0 ? '+' : '') + r.composite + stale;
      const regLvl = r.partial ? 'na' : macroLvl(r.label);
      const dSub = 'sizing ' + esc(md.mult || '—');
      const dLvl = md.cls === 'bear' ? 'bear' : md.cls === 'warn' ? 'warn' : 'ok';
      cells.push(card('a', './macro-dashboard/', 'Regim risc', regVal, regSub, regLvl, 'hero'));
      cells.push(card('a', './macro-dashboard/', 'Danger',
        (md.score != null ? md.score : '—') + '<span class="ht-dim">/100</span>',
        dSub, dLvl, 'hero'));
    }
    cells.push(rowBreak());

    // ── Tier 2: execuție + piață (mediu) ──
    cells.push(card('a', './router/', 'Sesiune', esc(d.sessionLabel), esc(d.sessionSub), d.sessionLvl, 'core'));
    cells.push(card('a', './journal/#portfolio', 'Risc',
      d.riskPct != null ? d.riskPct.toFixed(1) + '%' + (d.riskStale ? ' ⏳' : '') : '—',
      'agregat @ SL', riskLvl(d.riskPct, d.riskStale), 'core'));
    cells.push(card('a', './journal/#exec', 'Open', String(d.openN), 'poziții deschise', openLvl(d.openN), 'core'));
    cells.push(card('a', './journal/#desk', 'R săpt', esc(d.rWeek), 'realizat săptămâna asta', rWeekLvl(d.wr), 'core'));
    cells.push(marketCell('SPY', 'wSPY', 'spyVal', 'spySub', 'core'));
    cells.push(marketCell('QQQ', 'wQQQ', 'qqqVal', 'qqqSub', 'core'));
    cells.push(rowBreak());

    // ── Tier 3: context — VIX live · structură · journal · macro aux ──
    cells.push(marketCell('VIX', 'wVIX', 'vixVal', 'vixSub', 'core'));

    if (snap && snap.regime){
      const c = snap.curve;
      const t = snap.tilt;
      cells.push(card('a', './macro-dashboard/', 'Cross-asset',
        esc(t && t.word ? t.word : '—'),
        esc(t && t.sub ? t.sub : ''), tiltLvl(t), 'compact'));
      cells.push(card('a', './macro-dashboard/', 'Curbă 10Y-3M',
        esc(c && c.label ? c.label : 'N/A'),
        esc(c && c.sub ? c.sub : 'proxy'), curveLvl(c), 'compact'));
    }

    cells.push(card('a', './journal/#capital', 'Drift',
      d.driftPct != null ? (d.driftPct >= 0 ? '+' : '') + d.driftPct.toFixed(1) + '%' : '—',
      'sim vs snapshot', driftLvl(d.driftPct, d.driftWarn), 'compact'));
    cells.push(
      '<a href="./watchlist-monitor/" class="ht-card ht-core lvl-neut" id="wWL" title="Watchlist stocks"><span class="ht-m-lbl">WL</span><span class="ht-m-val" id="wlVal">—</span><span class="ht-m-sub" id="wlSub">—</span></a>',
      '<div class="ht-card ht-core lvl-neut" id="wWLBreakdown" style="cursor:pointer" title="Click → lista simboluri"><span class="ht-m-lbl">Mix</span><span class="ht-m-val ht-m-val-sm" id="wlBreakdownVal">—</span><span class="ht-m-sub" id="wlBreakdownSub">—</span></div>'
    );

    if (snap && snap.regime){
      cells.push(rowBreak());
      cells.push(...macroCompactTiles(snap.tiles));
    }

    cells.push(
      '<div class="ht-card ht-compact lvl-neut" id="wAlerts" style="display:none;cursor:pointer" title="Alerte preț armate" onclick="location.href=\'alerts/\'"><span class="ht-m-lbl">🔔 Alerte</span><span class="ht-m-val" id="alertsVal">—</span><span class="ht-m-sub" id="alertsSub">—</span></div>'
    );

    return '<div class="ht-command-grid">' + cells.join('') + '</div>';
  }

  function goldBar(){
    let act = '';
    if (global.MCTX){
      const line = MCTX.actionLine();
      if (line.phrases.length){
        act = '<div class="ht-gold-act"><span class="ht-gold-arrow">→</span> AZI: <strong>' + esc(line.phrases.join(' · ')) + '</strong></div>';
      }
    }
    return '<div class="ht-gold-bar">' + act +
      '<div class="ht-gold-ev-wrap">' +
        '<span class="ht-gold-ev-lbl">Evenimente</span>' +
        '<div id="hubGoldEvents" class="ht-gold-events" aria-label="Evenimente high-impact"></div>' +
      '</div></div>';
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

  let wlPop = null;

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

  function wire(el){
    ensureDelegation(el);
  }

  function postRender(){
    if (typeof global.hubRestoreMarketWidgets === 'function') hubRestoreMarketWidgets();
    if (typeof global.hubRefreshAuxWidgets === 'function') hubRefreshAuxWidgets();
  }

  function render(){
    const el = $('hubTableau');
    if (!el) return;
    el.innerHTML =
      '<div class="ht-top">' +
        '<p class="ht-tagline">Journal central <span class="ht-arr">→</span> Plan <span class="ht-arr">→</span> Scan <span class="ht-arr">→</span> Review</p>' +
        '<div class="ht-pills">' + statusPills() + '</div>' +
      '</div>' +
      goldBar() +
      commandGrid() +
      navHtml();
    if (global.ET && ET.render) ET.render($('hubGoldEvents'));
    wire(el);
    postRender();
  }

  global.HT = { render, postRender };
})(typeof window !== 'undefined' ? window : global);