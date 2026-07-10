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

  function ccCell(lbl, val, sub, lvl, href){
    return '<a href="' + (href || './macro-dashboard/') + '" class="ht-cc-cell lvl-' + (lvl || 'neut') + '">' +
      '<span class="ht-m-lbl">' + esc(lbl) + '</span>' +
      '<span class="ht-m-val">' + val + '</span>' +
      (sub ? '<span class="ht-m-sub">' + sub + '</span>' : '') +
      '</a>';
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

  function tileCell(lbl, t){
    if (!t || !t.v) return '';
    return '<a href="./macro-dashboard/" class="ht-tile-cell"><span class="ht-m-lbl">' + esc(lbl) +
      '</span><span class="ht-m-val">' + esc(t.v) + '</span>' +
      (t.sub ? '<span class="ht-m-sub">' + esc(t.sub) + '</span>' : '') + '</a>';
  }

  function macroTilesRow(tiles){
    if (!tiles) return '';
    let surp = '—', surpSub = 'fără rezultate';
    if (tiles.surprise){
      const s = tiles.surprise.score;
      surp = (s >= 0 ? '+' : '') + s.toFixed(0);
      surpSub = tiles.surprise.n + ' date';
    }
    const earn = tiles.earnings;
    const earnVal = earn ? String(earn.count || 0) : '—';
    const earnSub = earn && earn.symbols && earn.symbols.length ? earn.symbols.join(' · ') : 'mega-cap 7z';
    return '<div class="ht-tiles-row">' +
      tileCell('VIX', tiles.vix) +
      tileCell('DXY', tiles.dxy) +
      tileCell('10Y', tiles.tenY) +
      tileCell('BTC', tiles.btc) +
      tileCell('ETH', tiles.eth) +
      tileCell('F&G', tiles.fng) +
      '<a href="./earnings-hub/" class="ht-tile-cell"><span class="ht-m-lbl">Earnings 7z</span><span class="ht-m-val">' +
        esc(earnVal) + '</span><span class="ht-m-sub">' + esc(earnSub) + '</span></a>' +
      '<a href="./macro-dashboard/" class="ht-tile-cell"><span class="ht-m-lbl">Surprise</span><span class="ht-m-val">' +
        esc(surp) + '</span><span class="ht-m-sub">' + esc(surpSub) + '</span></a>' +
    '</div>';
  }

  function macroRow(){
    const snap = global.MCTX && MCTX.hubSnapshot ? MCTX.hubSnapshot() : null;
    if (!snap || !snap.regime){
      return '<a href="./macro-dashboard/" class="ht-macro-cta">🌍 Deschide Macro Dashboard → calculează Command Center</a>';
    }
    const r = snap.regime;
    const d = snap.danger || {};
    const stale = snap.stale ? '<span class="ht-stale">📦 ' + snap.ageMin + 'm</span>' : '';
    const regVal = esc(String(r.label || '—').replace(/^.\s*/, ''));
    const regSub = 'score ' + (r.composite >= 0 ? '+' : '') + r.composite + (r.trend ? ' · ' + esc(r.trend) : '') + stale;
    const regLvl = r.partial ? 'na' : macroLvl(r.label);
    const dFacts = (d.factors && d.factors.length) ? d.factors.slice(0, 2).join(' · ') : 'mediu calm';
    const dSub = 'sizing ' + esc(d.mult || '—') + ' · ' + esc(dFacts);
    const dLvl = d.cls === 'bear' ? 'bear' : d.cls === 'warn' ? 'warn' : 'ok';
    const c = snap.curve;
    const t = snap.tilt;
    let bd = '';
    if (r.breakdown){
      bd = '<div class="ht-macro-bd">🛡 ' + esc(r.breakdown) + (r.held ? ' · ⚓' : '') + '</div>';
    }
    return '<div class="ht-cc-row">' +
      ccCell('Regim risc', regVal, regSub, regLvl) +
      ccCell('Danger', (d.score != null ? d.score : '—') + '<span class="ht-dim">/100 · ' + esc(d.level || '') + '</span>', dSub, dLvl) +
      ccCell('Curbă 10Y-3M', esc(c && c.label ? c.label : 'N/A'), esc(c && c.sub ? c.sub : 'proxy'), curveLvl(c)) +
      ccCell('Cross-asset', esc(t && t.word ? t.word : '—'), esc(t && t.sub ? t.sub : ''), tiltLvl(t)) +
    '</div>' + macroTilesRow(snap.tiles) + bd;
  }

  function macroActionBar(){
    if (!global.MCTX) return '';
    const act = MCTX.actionLine();
    if (!act.phrases.length) return '';
    return '<div class="ht-macro-act">→ AZI: <strong>' + esc(act.phrases.join(' · ')) + '</strong></div>';
  }

  function macroEventsHint(){
    if (!global.MCTX) return '';
    const upcoming = MCTX.eventsUpcoming({ limit: 1, winFutureMs: 7 * 86400000 });
    if (!upcoming.length) return '<span class="ht-ev-empty">fără HIGH în 7z</span>';
    const e = upcoming[0];
    const name = esc(String(e.event).replace('Non-Farm Payrolls + Unemployment Rate', 'NFP').replace('CPI YoY + Core CPI', 'CPI'));
    const til = e.tilMs < 86400000 ? Math.round(e.tilMs / 3600000) + 'h' : Math.round(e.tilMs / 86400000) + 'z';
    return '<span class="ht-ev-next">urm: <b>' + name + '</b> T-' + til + '</span>';
  }

  function metricsRow(){
    let verdict = '—', verdictCls = '', riskPct = null, riskStale = false, openN = 0, driftPct = null, driftWarn = false;
    try {
      if (global.GV && GV.status){
        const st = GV.status();
        const lb = GV.labelOf ? GV.labelOf(st.verdict) : { text: st.verdict };
        verdict = lb.text || st.verdict;
        verdictCls = st.verdict === 'HALTED' ? 'neg' : st.verdict === 'CAUTION' ? 'wrn' : 'pos';
      }
      if (global.CD && CD.unified){
        const pf = CD.unified().portfolio || {};
        riskPct = pf.riskPct;
        riskStale = !!pf.liveStale;
        openN = pf.count || 0;
      }
      if (global.JR && JR.all) openN = JR.all().filter(e => JR.isOpen(e)).length;
      if (global.EQ && EQ.drift){
        const d = EQ.drift();
        driftPct = d.driftPct;
        driftWarn = d.warn || d.stale;
      }
    } catch (e) {}
    let rWeek = '—', rCls = '';
    if (global.JI && JI.weekRStats){
      const wr = JI.weekRStats();
      if (wr.n > 0 && wr.netR != null){
        rWeek = (wr.netR >= 0 ? '+' : '') + wr.netR.toFixed(1) + 'R';
        rCls = wr.lossR >= wr.budgetR ? 'neg' : wr.lossR >= wr.budgetR * 0.6 ? 'wrn' : '';
      } else rWeek = '0R';
    }
    const riskCls = riskPct != null && riskPct >= (CD.RISK_HALT_PCT || 4) ? 'neg' : riskPct != null && riskPct >= (CD.RISK_WARN_PCT || 2) ? 'wrn' : '';
    const cell = (tab, lbl, val, cls) =>
      '<a href="./journal/#' + tab + '" class="ht-metric ' + (cls || '') + '"><span class="ht-m-lbl">' + esc(lbl) +
      '</span><span class="ht-m-val">' + val + '</span></a>';
    return '<div class="ht-metrics">' +
      cell('desk', 'Desk', escHtml(verdict), verdictCls) +
      cell('portfolio', 'Risc', riskPct != null ? riskPct.toFixed(1) + '%' + (riskStale ? ' ⏳' : '') : '—', riskCls) +
      cell('exec', 'Open', String(openN), '') +
      cell('desk', 'R săpt', escHtml(rWeek), rCls) +
      cell('capital', 'Drift', driftPct != null ? (driftPct >= 0 ? '+' : '') + driftPct.toFixed(1) + '%' : '—', driftWarn ? 'wrn' : '') +
    '</div>';
  }

  function escHtml(s){ return esc(s); }

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

  function wire(el){
    const plans = el.querySelector('[data-ht-action="plans"]');
    if (plans && !plans.dataset.wired){
      plans.dataset.wired = '1';
      plans.addEventListener('click', () => { if (typeof global.openTradeTracker === 'function') openTradeTracker(); });
    }
    const chk = $('htBtnCheck');
    if (chk && !chk.dataset.wired){
      chk.dataset.wired = '1';
      chk.addEventListener('click', () => {
        const cl = $('hubChecklist');
        if (!cl) return;
        const show = cl.style.display === 'none' || !cl.style.display;
        cl.style.display = show ? 'flex' : 'none';
        if (show) cl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  }

  function render(){
    const el = $('hubTableau');
    if (!el) return;
    el.innerHTML =
      '<div class="ht-top">' +
        '<p class="ht-tagline">Journal central <span class="ht-arr">→</span> Plan <span class="ht-arr">→</span> Scan <span class="ht-arr">→</span> Review</p>' +
        '<div class="ht-pills">' + statusPills() + '</div>' +
      '</div>' +
      macroRow() +
      macroActionBar() +
      navHtml() +
      metricsRow() +
      '<div class="ht-tape-wrap">' +
        '<span class="ht-tape-lbl">Evenimente</span>' +
        '<div id="hubEventTape" class="ht-tape-host"></div>' +
        '<span id="hubEventHint" class="ht-tape-hint"></span>' +
      '</div>';
    const hint = $('hubEventHint');
    if (hint) hint.innerHTML = macroEventsHint();
    if (global.ET && ET.render) ET.render($('hubEventTape'));
    wire(el);
  }

  global.HT = { render };
})(typeof window !== 'undefined' ? window : global);