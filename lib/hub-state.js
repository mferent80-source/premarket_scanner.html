// hub-state.js — agregat hub (desk, GO, macro, stale audit) I-160
(function(global){
  'use strict';

  const MKT_LINKS = { SPY: './nasdaq-scanner/', QQQ: './nasdaq-scanner/', VIX: './macro-dashboard/' };
  const MKT_STALE_MS = 5 * 60 * 1000;

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
      driftPct: null, driftWarn: false, driftStale: false, snapshotAgeDays: null,
      rWeek: '—', wr: null,
      goScore: '—', goLabel: '…', goCls: 'neut', sizingMult: null, tradesLeft: null,
      sessionLabel: '—', sessionSub: '—', session: '', sessionLvl: 'neut',
      actionPhrases: [], rtPayload: null, marketTone: null
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
        d.driftStale = !!dr.stale;
        d.snapshotAgeDays = dr.snapshotAgeDays;
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
    if (global.MCTX && MCTX.marketTone){
      try { d.marketTone = MCTX.marketTone(); } catch (e) {}
    }
    return d;
  }

  function invalidateRtEval(){ lastRtEval = null; }

  function marketHref(sym){ return MKT_LINKS[sym] || './router/'; }

  function marketQuoteLvl(sym, q){
    if (!q || typeof q.chgPct !== 'number') return 'neut';
    if (sym === 'VIX'){
      const up = q.chgPct < 0;
      if (typeof q.price === 'number'){
        if (q.price >= 25) return 'bear';
        if (q.price >= 18) return 'warn';
      }
      return up ? 'ok' : 'bear';
    }
    if (Math.abs(q.chgPct) < 0.12) return 'neut';
    return q.chgPct >= 0 ? 'ok' : 'bear';
  }

  function setCardLvl(el, lvl){
    if (!el) return;
    el.className = el.className.replace(/\blvl-\w+/g, '').trim() + ' lvl-' + (lvl || 'neut');
  }

  function patchMarketCards(){
    const m = global.__hubMkt;
    if (!m || !m.quotes) return;
    const map = {
      SPY: ['wSPY'],
      QQQ: ['wQQQ'],
      VIX: ['wVIX']
    };
    const tone = global.MCTX && MCTX.marketTone ? MCTX.marketTone() : null;
    Object.keys(map).forEach(sym => {
      const q = m.quotes[sym];
      const wrap = document.getElementById(map[sym][0]);
      if (!wrap || !q) return;
      let lvl = marketQuoteLvl(sym, q);
      if ((sym === 'SPY' || sym === 'QQQ') && tone && tone.cls){
        if (tone.cls === 'up' && lvl === 'neut') lvl = 'ok';
        if (tone.cls === 'down' && lvl === 'neut') lvl = 'bear';
      }
      setCardLvl(wrap, lvl);
      if (sym === 'SPY' && tone && tone.tone) wrap.title = tone.tone;
      else wrap.title = 'Deschide ' + sym;
    });
  }

  function bumpWorst(worst, cls){
    if (cls === 'err') return 'err';
    if (cls === 'warn' && worst === 'ok') return 'warn';
    return worst;
  }

  function staleAudit(){
    const items = [];
    let worst = 'ok';

    const snap = global.MCTX && MCTX.hubSnapshot ? MCTX.hubSnapshot() : null;
    const macro = resolveMacro(snap);
    if (!macro || !macro.regime){
      items.push({ id: 'macro', label: 'Macro — deschide Command Center', cls: 'warn', href: './macro-dashboard/' });
      worst = bumpWorst(worst, 'warn');
    } else if (macro.source === 'fallback'){
      items.push({ id: 'macro', label: 'Macro parțial (cache local)', cls: 'warn', href: './macro-dashboard/' });
      worst = bumpWorst(worst, 'warn');
    } else if (macro.stale){
      const cls = macro.ageMin != null && macro.ageMin > 360 ? 'err' : 'warn';
      items.push({ id: 'macro', label: 'Macro snapshot ' + (macro.ageMin != null ? macro.ageMin + 'm' : 'vechi'), cls, href: './macro-dashboard/' });
      worst = bumpWorst(worst, cls);
    }

    if (global.EQ && EQ.drift){
      const dr = EQ.drift();
      if (!dr.snapshot){
        items.push({ id: 'equity', label: 'Fără snapshot equity', cls: 'warn', href: './journal/#capital' });
        worst = bumpWorst(worst, 'warn');
      } else if (dr.stale || (dr.snapshotAgeDays != null && dr.snapshotAgeDays > 14)){
        items.push({ id: 'equity', label: 'Snapshot equity ' + dr.snapshotAgeDays + 'z', cls: 'err', href: './journal/#capital' });
        worst = bumpWorst(worst, 'err');
      } else if (dr.snapshotAgeDays != null && dr.snapshotAgeDays > 7){
        items.push({ id: 'equity', label: 'Snapshot equity ' + dr.snapshotAgeDays + 'z', cls: 'warn', href: './journal/#capital' });
        worst = bumpWorst(worst, 'warn');
      }
    }

    let mkt = global.__hubMkt;
    if (!mkt || !mkt.ts){
      try {
        const cached = JSON.parse(localStorage.getItem('tt_hub_mkt_v1') || 'null');
        if (cached && cached.ts) mkt = cached;
      } catch (e) {}
    }
    if (!mkt || !mkt.ts || !mkt.quotes || !Object.keys(mkt.quotes).length){
      items.push({ id: 'market', label: 'SPY/QQQ/VIX — fără quote', cls: 'warn', href: './' });
      worst = bumpWorst(worst, 'warn');
    } else if (Date.now() - mkt.ts > MKT_STALE_MS){
      const ageM = Math.round((Date.now() - mkt.ts) / 60000);
      items.push({ id: 'market', label: 'Piață ' + ageM + 'm fără refresh', cls: ageM > 30 ? 'err' : 'warn', href: './' });
      worst = bumpWorst(worst, ageM > 30 ? 'err' : 'warn');
    }

    if (global.CD && CD.unified){
      try {
        const pf = CD.unified().portfolio || {};
        if (pf.count > 0 && pf.liveStale){
          items.push({ id: 'portfolio', label: 'Risc live stale — scan Portfolio', cls: 'warn', href: './journal/#portfolio' });
          worst = bumpWorst(worst, 'warn');
        }
      } catch (e) {}
    }

    try {
      const live = global.SUITE_VERSION_SHORT || '';
      const cached = localStorage.getItem('tt_sw_version') || '';
      if (cached && live && cached !== live){
        items.push({ id: 'sw', label: 'Cache SW vechi (' + cached + ')', cls: 'warn', href: './update.html' });
        worst = bumpWorst(worst, 'warn');
      }
    } catch (e) {}

    return { items, worst, count: items.length };
  }

  function renderStaleNav(){
    const el = document.getElementById('hubStaleNav');
    if (!el) return;
    const a = staleAudit();
    if (!a.count){
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
      return;
    }
    el.hidden = false;
    el.setAttribute('aria-hidden', 'false');
    el.className = 'hub-stale-nav ' + a.worst;
    el.textContent = a.worst === 'err' ? '📦 ' + a.count + ' stale' : '📦 ' + a.count;
    el.title = a.items.map(i => i.label).join(' · ');
  }

  global.HS = {
    macroLvl, curveLvl, tiltLvl, tileClsToLvl, deskLvl, riskLvl, openLvl, rWeekLvl,
    driftLvl, earnLvl, surpLvl, goLvl, sessionLvl, dangerLvlFromScore,
    resolveMacro, hubState, invalidateRtEval,
    marketHref, marketQuoteLvl, setCardLvl, patchMarketCards,
    staleAudit, renderStaleNav
  };
})(typeof window !== 'undefined' ? window : global);