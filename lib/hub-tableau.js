// hub-tableau.js — Command tableau hub (HT.render) I-160
(function(global){
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  const NAV = [
    { id: 'crypto', label: 'Crypto', icon: '🪙', href: 'https://mferent80-source.github.io/scanner/', external: true },
    { id: 'router', label: 'Router', icon: '🧭', href: './router/' },
    { id: 'plans', label: 'Plans', icon: '📋', action: 'plans' },
    { id: 'desk', label: 'Desk', icon: '🛑', href: './journal/#desk' },
    { id: 'portfolio', label: 'Portfolio', icon: '🛡️', href: './journal/#portfolio' },
    { id: 'capital', label: 'Capital', icon: '⚖', href: './journal/#capital' },
    { id: 'journal', label: 'Journal', icon: '📓', href: './journal/' },
    { id: 'health', label: 'Health', icon: '💚', href: './health/' },
    { id: 'guide', label: 'Guide', icon: '📖', href: './guide/' }
  ];

  function regimeBadge(){
    if (!global.MCTX) return '<span class="ht-reg na">⚪ regim n/a</span>';
    const r = MCTX.regime();
    if (!r.label || r.stale) return '<span class="ht-reg na">⚪ regim n/a · <a href="./macro-dashboard/">Macro</a></span>';
    const comp = r.composite != null ? (r.composite >= 0 ? '+' : '') + r.composite.toFixed(0) : '';
    const streak = r.streak >= 2 ? ' <span class="ht-muted">ziua ' + r.streak + '</span>' : '';
    const col = MCTX.regimeColor(r.label);
    return '<span class="ht-reg" style="--ht-c:' + col + '">' + MCTX.regimeEmoji(r.label) + ' ' + esc(r.label) +
      (comp ? ' <b>' + esc(comp) + '</b>' : '') + streak + '</span>';
  }

  function morningBadge(){
    if (!global.MC || !MC.items) return '';
    const mc = MC.items();
    const ok = mc.done >= mc.total - 2;
    return '<button type="button" class="ht-pill ht-check' + (ok ? ' ok' : '') + '" id="htBtnCheck" title="Morning checklist">' +
      '✓ ' + mc.done + '/' + mc.total + '</button>';
  }

  function healthBadge(){
    try {
      const hp = global.CD && CD.healthProbe ? CD.healthProbe() : null;
      if (!hp) return '<span class="ht-pill ht-health">Health —</span>';
      const cls = hp.cls === 'ok' ? 'ok' : hp.cls === 'warn' ? 'warn' : 'bad';
      return '<a href="./health/" class="ht-pill ht-health ' + cls + '">Health ' + (hp.cls === 'ok' ? 'OK' : esc(hp.cls)) + '</a>';
    } catch (e) {
      return '';
    }
  }

  function navHtml(){
    return NAV.map(n => {
      if (n.action === 'plans'){
        return '<button type="button" class="ht-nav-chip" data-ht-action="plans">' + n.icon + ' ' + esc(n.label) + '</button>';
      }
      const ext = n.external ? ' target="_blank" rel="noopener"' : '';
      return '<a href="' + n.href + '" class="ht-nav-chip"' + ext + '>' + n.icon + ' ' + esc(n.label) + '</a>';
    }).join('');
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
        const open = cl.style.display !== 'none' && cl.style.display !== '';
        cl.style.display = open ? 'none' : 'flex';
        if (!open) cl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  }

  function render(){
    const el = $('hubTableau');
    if (!el) return;
    el.innerHTML =
      '<div class="ht-row ht-status">' +
        regimeBadge() +
        '<span class="ht-flow">Journal central → Plan → Scan → Review</span>' +
        morningBadge() +
        healthBadge() +
      '</div>' +
      '<div class="ht-row ht-nav">' + navHtml() + '</div>' +
      '<div class="ht-row ht-tape"><div id="hubEventTape" class="ht-tape-host"></div></div>';
    if (global.ET && ET.render) ET.render($('hubEventTape'));
    wire(el);
  }

  global.HT = { render };
})(typeof window !== 'undefined' ? window : global);