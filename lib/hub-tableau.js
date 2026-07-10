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
  let lastRtEval = null;

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

  function dangerLvlFromScore(score, cls){
    if (cls === 'bear' || cls === 'warn' || cls === 'ok') return cls;
    if (score == null) return 'neut';
    if (score >= 70) return 'bear';
    if (score >= 45) return 'warn';
    return 'ok';
  }

  function resolveMacro(snap){
    if (snap && snap.regime){
      return Object.assign({}, snap, { full: true, source: 'snapshot' });
    }
    if (!global.MCTX) return null;
    const reg = MCTX.regime();
    const dng = MCTX.danger();
    if (!reg.label && dng.score == null) return null;
    const dCls = dng.score >= 70 ? 'bear' : dng.score >= 45 ? 'warn' : 'ok';
    return {
      ts: reg.ts || 0,
      stale: true,
      ageMin: null,
      full: false,
      source: 'fallback',
      regime: reg.label ? {
        label: reg.label,
        composite: reg.composite,
        partial: true,
        trend: reg.stale ? 'cache LS' : ''
      } : null,
      danger: dng.score != null ? {
        score: dng.score,
        mult: dng.mult,
        level: String(dng.band || '').split('·')[0].trim(),
        cls: dCls
      } : null,
      curve: null,
      tilt: null,
      tiles: null
    };
  }

  function hubState(){
    const snap = global.MCTX && MCTX.hubSnapshot ? MCTX.hubSnapshot() : null;
    const macro = resolveMacro(snap);
    const layout = !macro || !macro.regime ? 'none' : (macro.full ? 'full' : 'partial');
    const d = {
      snap,
      macro,
      layout,
      verdict: '—', verdictRaw: '', riskPct: null, riskStale: false, openN: 0,
      driftPct: null, driftWarn: false, rWeek: '—', wr: null,
      goScore: '—', goLabel: '…', goCls: 'neut', sizingMult: null, tradesLeft: null,
      sessionLabel: '—', sessionSub: '—', session: '', sessionLvl: 'neut',
      actionPhrases: [], rtPayload: null
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
        if (!lastRtEval) lastRtEval = RT.evaluate();
        const p = lastRtEval;
        d.rtPayload = p;
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
    if (global.MCTX && MCTX.actionLine){
      try { d.actionPhrases = MCTX.actionLine().phrases || []; } catch (e) {}
    }
    return d;
  }

  function invalidateRtEval(){ lastRtEval = null; }

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

  function marketCell(lbl, wrapId, valId, subId, tier){
    return '<div class="ht-card ht-market ht-' + (tier || 'core') + ' lvl-neut" id="' + wrapId + '">' +
      '<span class="ht-m-lbl">' + esc(lbl) + '</span>' +
      '<span class="ht-m-val" id="' + valId + '">—</span>' +
      '<span class="ht-m-sub" id="' + subId + '">…</span></div>';
  }

  function heroDangerCard(md, spark){
    const dLvl = dangerLvlFromScore(md.score, md.cls);
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
      esc(goSubLine(d)), goLvl(d.goCls), 'hero', { id: 'htGoCard' }));
    cells.push(card('a', './journal/#desk', 'Desk', esc(d.verdict), 'verdict Governor', deskLvl(d.verdictRaw), 'hero', { id: 'htCardDesk' }));

    if (st.layout === 'none'){
      cells.push(card('a', './macro-dashboard/', 'Macro', '🌍', 'Deschide Command Center', 'warn', 'hero',
        { id: 'htCardMacroCta', span: 6, extraCls: 'ht-macro-cta' }));
    } else {
      const r = macro.regime;
      const md = macro.danger || {};
      const staleNote = macro.source === 'fallback' ? ' · LS cache' : (macro.stale && macro.ageMin != null ? ' · 📦' + macro.ageMin + 'm' : '');
      const regVal = esc(String(r.label || '—').replace(/^.\s*/, ''));
      const regSub = (r.composite != null ? 'score ' + (r.composite >= 0 ? '+' : '') + r.composite : 'fără score') + staleNote;
      cells.push(card('a', './macro-dashboard/', 'Regim risc', regVal, regSub, r.partial ? 'na' : macroLvl(r.label), 'hero', { id: 'htCardRegime' }));
      cells.push(heroDangerCard(md, dangerSparkHtml()));
    }
    cells.push(rowBreak());

    cells.push(card('a', './router/', 'Sesiune', esc(d.sessionLabel), esc(d.sessionSub), d.sessionLvl, 'core', { id: 'htCardSession' }));
    cells.push(card('a', './journal/#portfolio', 'Risc',
      d.riskPct != null ? d.riskPct.toFixed(1) + '%' + (d.riskStale ? ' ⏳' : '') : '—',
      'agregat @ SL', riskLvl(d.riskPct, d.riskStale), 'core', { id: 'htCardRisk' }));
    cells.push(card('a', './journal/#exec', 'Open', String(d.openN), 'poziții deschise', openLvl(d.openN), 'core', { id: 'htCardOpen' }));
    cells.push(card('a', './journal/#desk', 'R săpt', esc(d.rWeek), 'realizat săptămâna asta', rWeekLvl(d.wr), 'core', { id: 'htCardRWeek' }));
    cells.push(marketCell('SPY', 'wSPY', 'spyVal', 'spySub', 'core'));
    cells.push(marketCell('QQQ', 'wQQQ', 'qqqVal', 'qqqSub', 'core'));
    cells.push(rowBreak());

    cells.push(marketCell('VIX', 'wVIX', 'vixVal', 'vixSub', 'core'));

    if (st.layout === 'full'){
      const c = macro.curve;
      const t = macro.tilt;
      cells.push(card('a', './macro-dashboard/', 'Cross-asset',
        esc(t && t.word ? t.word : '—'), esc(t && t.sub ? t.sub : ''), tiltLvl(t), 'compact', { id: 'htCardCross' }));
      cells.push(card('a', './macro-dashboard/', 'Curbă 10Y-3M',
        esc(c && c.label ? c.label : 'N/A'), esc(c && c.sub ? c.sub : 'proxy'), curveLvl(c), 'compact', { id: 'htCardCurve' }));
    }

    cells.push(card('a', './journal/#capital', 'Drift',
      d.driftPct != null ? (d.driftPct >= 0 ? '+' : '') + d.driftPct.toFixed(1) + '%' : '—',
      'sim vs snapshot', driftLvl(d.driftPct, d.driftWarn), 'compact', { id: 'htCardDrift' }));
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
        return card('a', href || './macro-dashboard/', lbl, esc(t.v), esc(t.sub), tileClsToLvl(t.cls, t.sub), 'compact', { id: id });
      };
      cells.push(rowBreak());
      const macroTiles = [
        tileCard('htCardDxy', 'DXY', tiles.dxy),
        tileCard('htCard10y', '10Y', tiles.tenY),
        tileCard('htCardBtc', 'BTC', tiles.btc),
        tileCard('htCardEth', 'ETH', tiles.eth),
        tileCard('htCardFng', 'F&G', tiles.fng),
        card('a', './earnings-hub/', 'Earnings 7z', esc(earnVal), esc(earnSub), earnLvl(earn), 'compact', { id: 'htCardEarn' }),
        card('a', './macro-dashboard/', 'Surprise', esc(surpVal), esc(surpSub), surpLvl(surp), 'compact', { id: 'htCardSurp' })
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

  function setCardLvl(el, lvl){
    if (!el) return;
    el.className = el.className.replace(/\blvl-\w+/g, '').trim() + ' lvl-' + (lvl || 'neut');
  }

  function patchCard(id, valHtml, subText, lvl){
    const el = $(id);
    if (!el) return;
    const v = el.querySelector('.ht-m-val');
    const s = el.querySelector('.ht-m-sub');
    if (v) v.innerHTML = valHtml;
    if (s && subText != null) s.textContent = subText;
    setCardLvl(el, lvl);
  }

  function patchGrid(st){
    const d = st;
    const macro = st.macro;

    patchCard('htGoCard',
      '<span class="ht-go-num go-' + esc(d.goCls) + '">' + esc(String(d.goScore)) + '</span>',
      goSubLine(d), goLvl(d.goCls));
    patchCard('htCardDesk', esc(d.verdict), 'verdict Governor', deskLvl(d.verdictRaw));
    patchCard('htCardSession', esc(d.sessionLabel), d.sessionSub, d.sessionLvl);
    patchCard('htCardRisk',
      d.riskPct != null ? d.riskPct.toFixed(1) + '%' + (d.riskStale ? ' ⏳' : '') : '—',
      'agregat @ SL', riskLvl(d.riskPct, d.riskStale));
    patchCard('htCardOpen', String(d.openN), 'poziții deschise', openLvl(d.openN));
    patchCard('htCardRWeek', d.rWeek, 'realizat săptămâna asta', rWeekLvl(d.wr));
    patchCard('htCardDrift',
      d.driftPct != null ? (d.driftPct >= 0 ? '+' : '') + d.driftPct.toFixed(1) + '%' : '—',
      'sim vs snapshot', driftLvl(d.driftPct, d.driftWarn));

    if (st.layout !== 'none' && macro && macro.regime){
      const r = macro.regime;
      const md = macro.danger || {};
      const staleNote = macro.source === 'fallback' ? ' · LS cache' : (macro.stale && macro.ageMin != null ? ' · 📦' + macro.ageMin + 'm' : '');
      const regVal = esc(String(r.label || '—').replace(/^.\s*/, ''));
      const regSub = (r.composite != null ? 'score ' + (r.composite >= 0 ? '+' : '') + r.composite : 'fără score') + staleNote;
      patchCard('htCardRegime', regVal, regSub, r.partial ? 'na' : macroLvl(r.label));
      const dEl = $('htCardDanger');
      if (dEl){
        let dSub = 'sizing ' + (md.mult || '—');
        if (md.level) dSub += ' · ' + md.level;
        patchCard('htCardDanger', (md.score != null ? md.score : '—') + '<span class="ht-dim">/100</span>', dSub, dangerLvlFromScore(md.score, md.cls));
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
        patchCard(id, esc(t.v), t.sub || '', tileClsToLvl(t.cls, t.sub));
      };
      patchTile('htCardDxy', tiles.dxy);
      patchTile('htCard10y', tiles.tenY);
      patchTile('htCardBtc', tiles.btc);
      patchTile('htCardEth', tiles.eth);
      patchTile('htCardFng', tiles.fng);
      const earn = tiles.earnings || {};
      patchCard('htCardEarn', esc(earn.v || String(earn.count || 0)), earn.sub || 'mega-cap 7z', earnLvl(earn));
      const surp = tiles.surprise;
      if (surp){
        let sv = '—', ss = 'fără rezultate';
        if (surp.v && surp.v !== '—') sv = surp.v;
        else if (typeof surp.score === 'number') sv = (surp.score >= 0 ? '+' : '') + surp.score.toFixed(0);
        ss = surp.sub || (surp.n ? surp.n + ' date' : 'date vs așteptări');
        patchCard('htCardSurp', esc(sv), ss, surpLvl(surp));
      }
      if (macro.curve) patchCard('htCardCurve', esc(macro.curve.label || 'N/A'), esc(macro.curve.sub || 'proxy'), curveLvl(macro.curve));
      if (macro.tilt) patchCard('htCardCross', esc(macro.tilt.word || '—'), esc(macro.tilt.sub || ''), tiltLvl(macro.tilt));
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
    invalidateRtEval();
    const st = hubState();
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
  }

  global.HT = { render, postRender, hubState };
})(typeof window !== 'undefined' ? window : global);