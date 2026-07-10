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
    return '<a href="' + (href || './macro-dashboard/') + '" class="ht-card ht-cc-cell lvl-' + (lvl || 'neut') + '">' +
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

  function tileCell(lbl, t, href){
    if (!t || !t.v || t.v === '—') return '';
    let lvl = tileClsToLvl(t.cls, t.sub);
    if (!t.cls && INVERTED_TILES[lbl]){
      const s = String(t.sub || '');
      if (/▲|up/i.test(s)) lvl = 'bear';
      else if (/▼|down/i.test(s)) lvl = 'ok';
    }
    return '<a href="' + (href || './macro-dashboard/') + '" class="ht-card ht-tile-cell lvl-' + lvl + '"><span class="ht-m-lbl">' + esc(lbl) +
      '</span><span class="ht-m-val">' + esc(t.v) + '</span>' +
      (t.sub ? '<span class="ht-m-sub">' + esc(t.sub) + '</span>' : '') + '</a>';
  }

  function staticTile(href, lbl, val, sub, lvl){
    return '<a href="' + href + '" class="ht-card ht-tile-cell lvl-' + (lvl || 'neut') + '"><span class="ht-m-lbl">' + esc(lbl) +
      '</span><span class="ht-m-val">' + esc(val) + '</span>' +
      (sub ? '<span class="ht-m-sub">' + esc(sub) + '</span>' : '') + '</a>';
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

  function macroTileCells(tiles){
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
    return [
      tileCell('VIX', tiles.vix),
      tileCell('DXY', tiles.dxy),
      tileCell('10Y', tiles.tenY),
      tileCell('BTC', tiles.btc),
      tileCell('ETH', tiles.eth),
      tileCell('F&G', tiles.fng),
      staticTile('./earnings-hub/', 'Earnings 7z', earnVal, earnSub, earnLvl(earn)),
      staticTile('./macro-dashboard/', 'Surprise', surpVal, surpSub, surpLvl(surp))
    ].filter(Boolean);
  }

  function macroCardCells(){
    const snap = global.MCTX && MCTX.hubSnapshot ? MCTX.hubSnapshot() : null;
    if (!snap || !snap.regime){
      return ['<a href="./macro-dashboard/" class="ht-card ht-macro-cta ht-span-all">🌍 Deschide Macro Dashboard → calculează Command Center</a>'];
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
    return [
      ccCell('Regim risc', regVal, regSub, regLvl),
      ccCell('Danger', (d.score != null ? d.score : '—') + '<span class="ht-dim">/100 · ' + esc(d.level || '') + '</span>', dSub, dLvl),
      ccCell('Curbă 10Y-3M', esc(c && c.label ? c.label : 'N/A'), esc(c && c.sub ? c.sub : 'proxy'), curveLvl(c)),
      ccCell('Cross-asset', esc(t && t.word ? t.word : '—'), esc(t && t.sub ? t.sub : ''), tiltLvl(t)),
      ...macroTileCells(snap.tiles)
    ];
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

  function metricCell(tab, lbl, val, lvl){
    return '<a href="./journal/#' + tab + '" class="ht-card ht-metric lvl-' + (lvl || 'neut') + '"><span class="ht-m-lbl">' + esc(lbl) +
      '</span><span class="ht-m-val">' + val + '</span></a>';
  }

  function metricCells(){
    let verdict = '—', verdictRaw = '', riskPct = null, riskStale = false, openN = 0, driftPct = null, driftWarn = false;
    try {
      if (global.GV && GV.status){
        const st = GV.status();
        const lb = GV.labelOf ? GV.labelOf(st.verdict) : { text: st.verdict };
        verdict = lb.text || st.verdict;
        verdictRaw = st.verdict || '';
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
    let rWeek = '—', wr = null;
    if (global.JI && JI.weekRStats){
      wr = JI.weekRStats();
      if (wr.n > 0 && wr.netR != null) rWeek = (wr.netR >= 0 ? '+' : '') + wr.netR.toFixed(1) + 'R';
      else rWeek = '0R';
    }
    return [
      metricCell('desk', 'Desk', escHtml(verdict), deskLvl(verdictRaw)),
      metricCell('portfolio', 'Risc', riskPct != null ? riskPct.toFixed(1) + '%' + (riskStale ? ' ⏳' : '') : '—', riskLvl(riskPct, riskStale)),
      metricCell('exec', 'Open', String(openN), openLvl(openN)),
      metricCell('desk', 'R săpt', escHtml(rWeek), rWeekLvl(wr)),
      metricCell('capital', 'Drift', driftPct != null ? (driftPct >= 0 ? '+' : '') + driftPct.toFixed(1) + '%' : '—', driftLvl(driftPct, driftWarn))
    ];
  }

  function escHtml(s){ return esc(s); }

  function cardsGrid(){
    const cells = macroCardCells().concat(metricCells());
    return '<div class="ht-cards-grid">' + cells.join('') + '</div>';
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
      goldBar() +
      cardsGrid() +
      navHtml();
    if (global.ET && ET.render) ET.render($('hubGoldEvents'));
    wire(el);
  }

  global.HT = { render };
})(typeof window !== 'undefined' ? window : global);