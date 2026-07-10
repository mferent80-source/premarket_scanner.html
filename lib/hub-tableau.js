// hub-tableau.js — Command tableau hub (HT.render) I-160
(function(global){
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  const NAV = [
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

  function regimeCell(){
    if (!global.MCTX) return '<div class="ht-regime-cell na"><span class="ht-rc-lbl">Regim</span><span class="ht-rc-val">n/a</span></div>';
    const r = MCTX.regime();
    if (!r.label || r.stale){
      return '<a href="./macro-dashboard/" class="ht-regime-cell na"><span class="ht-rc-lbl">Regim</span><span class="ht-rc-val">Macro →</span></a>';
    }
    const comp = r.composite != null ? (r.composite >= 0 ? '+' : '') + r.composite.toFixed(0) : '';
    const lvl = /RISK-OFF|STRESS/.test(r.label) ? 'bear' : /CAUTIOUS/.test(r.label) ? 'warn' : /RISK-ON|LEAN/.test(r.label) ? 'ok' : 'neut';
    const streak = r.streak >= 2 ? '<span class="ht-rc-sub">ziua ' + r.streak + '</span>' : '';
    return '<div class="ht-regime-cell lvl-' + lvl + '"><span class="ht-rc-lbl">Regim</span><span class="ht-rc-val">' +
      esc(r.label.replace(/^.\s*/, '')) + (comp ? ' <em>' + esc(comp) + '</em>' : '') + '</span>' + streak + '</div>';
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
      '<div class="ht-head">' +
        regimeCell() +
        '<p class="ht-tagline">Journal central <span class="ht-arr">→</span> Plan <span class="ht-arr">→</span> Scan <span class="ht-arr">→</span> Review</p>' +
        '<div class="ht-pills">' + statusPills() + '</div>' +
      '</div>' +
      navHtml() +
      metricsRow() +
      '<div class="ht-tape-wrap">' +
        '<span class="ht-tape-lbl">Macro</span>' +
        '<div id="hubEventTape" class="ht-tape-host"></div>' +
      '</div>';
    if (global.ET && ET.render) ET.render($('hubEventTape'));
    wire(el);
  }

  global.HT = { render };
})(typeof window !== 'undefined' ? window : global);