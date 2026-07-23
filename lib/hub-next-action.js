// hub-next-action.js — I-211 Next Action pe hub live (HNA.*)
// Scara: safety → capital → freeze → data → gappers → manage → GO → review → default
(function (global) {
  'use strict';

  const $ = id => document.getElementById(id);
  const RISK_HALT = (global.CD && CD.RISK_HALT_PCT) || 4;
  const CTX_KEY = 'tt_ctx_v1';

  function lsJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function ageMin(ts) {
    if (!Number.isFinite(ts) || ts <= 0) return null;
    const t = ts < 1e12 ? ts * 1000 : ts;
    return (Date.now() - t) / 60000;
  }

  function usSession() {
    if (global.SES && SES.info) {
      const s = SES.info().state;
      return s === 'holiday' ? 'closed' : s;
    }
    if (global.HM && HM.usSession) return HM.usSession();
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit'
      }).formatToParts(new Date()).map(x => [x.type, x.value]));
      if (p.weekday === 'Sat' || p.weekday === 'Sun') return 'weekend';
      const mins = (+p.hour) * 60 + (+p.minute);
      if (mins >= 240 && mins < 570) return 'pre';
      if (mins >= 570 && mins < 960) return 'rth';
      if (mins >= 960 && mins < 1200) return 'after';
      return 'closed';
    } catch (e) { return 'closed'; }
  }

  function buildState() {
    const st = (global.HS && HS.hubState) ? HS.hubState() : {};
    const session = st.session || usSession();
    let freeze = false;
    try {
      const c = st.rtPayload && st.rtPayload.context;
      freeze = !!(c && c.macroFreeze && c.macroFreeze.active);
    } catch (e) {}
    if (!freeze) {
      try {
        const r = lsJson('tt_router_state_v1') || {};
        const c = r.context || {};
        freeze = !!(c.macroFreeze && c.macroFreeze.active);
      } catch (e) {}
    }

    let trustPct = 100;
    try {
      if (global.HS && HS.dataTrust) {
        const t = HS.dataTrust();
        if (t && typeof t.pct === 'number') trustPct = t.pct;
        else if (t && t.fresh != null && t.total) trustPct = Math.round(100 * t.fresh / t.total);
        else if (t && t.degraded) trustPct = 40;
      }
    } catch (e) {}

    const mkt = lsJson('tt_hub_mkt_v1') || {};
    const spy = mkt.quotes && mkt.quotes.SPY;
    let mktAgeMin = mkt.ts ? ageMin(mkt.ts) : (spy && spy.ts ? ageMin(spy.ts) : null);

    // trust din surse simple dacă dataTrust nu dă pct
    if (trustPct === 100 && !(global.HS && HS.dataTrust)) {
      const checks = [
        !!(spy && spy.ts && ageMin(spy.ts) < 15),
        st.goScore != null && st.goScore !== '—',
        !!(st.macro && st.macro.regime),
        !!(st.verdictRaw || (st.verdict && st.verdict !== '—'))
      ];
      trustPct = Math.round(100 * checks.filter(Boolean).length / checks.length);
    }

    const gappers = lsJson('pm_gappers_cache') || {};
    const gapList = Array.isArray(gappers.data) ? gappers.data : [];
    const gapAgeMin = ageMin(gappers.ts);
    const gapsFresh = gapList.length > 0 && (gapAgeMin == null || gapAgeMin < 15);

    let govReasons = [];
    try {
      const gov = lsJson('tt_governor_state_v1') || {};
      if (Array.isArray(gov.reasons)) govReasons = gov.reasons;
    } catch (e) {}

    const strategy = (st.rtPayload && st.rtPayload.strategy) || '—';
    const verdictRaw = st.verdictRaw || st.verdict || '—';

    return {
      session,
      goScore: st.goScore,
      goLabel: st.goLabel || '—',
      goCls: st.goCls || 'neut',
      strategy,
      freeze,
      verdict: verdictRaw === 'HALTED' || verdictRaw === 'CAUTION' || verdictRaw === 'TRADE'
        ? verdictRaw
        : (String(st.verdict || '').indexOf('HALT') >= 0 ? 'HALTED'
          : String(st.verdict || '').indexOf('CAUTION') >= 0 ? 'CAUTION'
            : String(st.verdict || '').indexOf('TRADE') >= 0 ? 'TRADE' : verdictRaw),
      govReasons,
      riskPct: st.riskPct,
      riskStale: !!st.riskStale,
      openN: st.openN || 0,
      mktAgeMin,
      trustPct,
      gapList,
      gapsFresh
    };
  }

  function evaluate(st) {
    const isHalt = st.verdict === 'HALTED';
    const riskHot = Number.isFinite(st.riskPct) && st.riskPct >= RISK_HALT;
    const trustBad = st.trustPct < 50 || (st.mktAgeMin != null && st.mktAgeMin > 45);
    const canOpp = (st.session === 'pre' || st.session === 'after') && st.gapsFresh && st.gapList.length;
    const manageOpen = st.openN > 0
      && (st.verdict === 'CAUTION' || st.goCls === 'caution' || st.goCls === 'nogo')
      && !isHalt && !riskHot;
    const goClean = st.goCls === 'go' && st.verdict === 'TRADE' && !st.freeze && !trustBad && !riskHot;
    const reviewSess = st.session === 'after' || st.session === 'closed' || st.session === 'weekend';

    const steps = [
      { id: 'halt', active: isHalt },
      { id: 'risk', active: riskHot },
      { id: 'freeze', active: st.freeze },
      { id: 'trust', active: trustBad },
      { id: 'gap', active: canOpp },
      { id: 'manage', active: manageOpen },
      { id: 'go', active: goClean },
      { id: 'review', active: reviewSess },
      { id: 'default', active: true }
    ];
    let winnerId = 'default';
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].active) { winnerId = steps[i].id; break; }
    }

    let action;
    if (winnerId === 'halt') {
      action = {
        prio: 'halt', kicker: 'STOP · SAFETY',
        title: 'Desk e HALTED — zero trade nou',
        why: (st.govReasons && st.govReasons[0])
          ? st.govReasons[0]
          : 'Governor a blocat ziua. Nu căuta setup-uri; verifică motivele pe Desk.',
        cta: { label: 'Deschide Risk Desk', href: './journal/#desk' },
        sec: { label: 'Capital →', href: './journal/#capital' }
      };
    } else if (winnerId === 'risk') {
      action = {
        prio: 'halt', kicker: 'STOP · CAPITAL',
        title: 'Risc @ SL ' + Number(st.riskPct).toFixed(1) + '% — peste prag',
        why: 'Bugetul de risc e plin sau depășit. Reduce / închide înainte de setup nou.',
        cta: { label: 'Portfolio live', href: './journal/#portfolio' },
        sec: { label: 'Desk →', href: './journal/#desk' }
      };
    } else if (winnerId === 'freeze') {
      action = {
        prio: 'halt', kicker: 'STOP · MACRO',
        title: 'FREEZE pe eveniment — stai pe mâini',
        why: 'High-impact în fereastră. Gap-urile și scan-urile pot fi zgomot.',
        cta: { label: 'Calendar Macro', href: './macro-dashboard/' },
        sec: { label: 'Router →', href: './router/' }
      };
    } else if (winnerId === 'trust') {
      action = {
        prio: 'warn', kicker: 'VERIFY · DATA',
        title: 'Nu te baza pe GO — date slabe',
        why: 'Trust ' + st.trustPct + '%' +
          (st.mktAgeMin != null ? ' · piețe acum ' + Math.round(st.mktAgeMin) + 'm' : '') +
          '. Reîmprospătează sursele înainte de decizie.',
        cta: { label: 'Suite Health', href: './health/' },
        sec: { label: 'Macro →', href: './macro-dashboard/' }
      };
    } else if (winnerId === 'gap') {
      const g = st.gapList[0] || {};
      const sym = g.sym || g.symbol || '—';
      const pct = g.gapPct != null ? ((g.gapPct >= 0 ? '+' : '') + Number(g.gapPct).toFixed(1) + '%') : '';
      const wl = g.inWl ? ' · pe watchlist' : '';
      action = {
        prio: 'ok', kicker: 'OPPORTUNITY · ' + String(st.session).toUpperCase(),
        title: 'Urmărește ' + sym + (pct ? ' ' + pct : ''),
        why: 'Top gapper din cache' + wl + '. Verifică spread/volum, apoi plan.',
        cta: { label: 'Deschide ' + sym, href: './nasdaq-scanner/?sym=' + encodeURIComponent(sym) },
        sec: { label: 'Plan Journal →', href: './journal/?sym=' + encodeURIComponent(sym) },
        ctxSym: sym, ctxSource: 'hub-next-gapper'
      };
    } else if (winnerId === 'manage') {
      action = {
        prio: 'warn', kicker: 'MANAGE · OPEN',
        title: st.openN + ' open · regim CAUTION',
        why: 'Ai poziții și semnalul nu e GO. Gestionează riscul existent, nu adăuga size.',
        cta: { label: 'Execuții open', href: './journal/#exec' },
        sec: { label: 'Portfolio →', href: './journal/#portfolio' }
      };
    } else if (winnerId === 'go') {
      action = {
        prio: 'ok', kicker: 'GO · PLAYBOOK',
        title: 'GO ' + st.goScore + ' — confirmă playbook-ul',
        why: (st.strategy && st.strategy !== '—' ? st.strategy + ' · ' : '') +
          'Următorul pas e Router Deep, nu scan la întâmplare.',
        cta: { label: 'Router Deep', href: './router/' },
        sec: { label: 'STL →', href: './smart-trade-long/' }
      };
    } else if (winnerId === 'review') {
      action = {
        prio: 'warn', kicker: 'REVIEW · SESSION',
        title: 'Închide ziua corect',
        why: 'Sesiune ' + st.session + '. Execuții, PnL, greșeli — nu forța setup out-of-hours.',
        cta: { label: 'Journal / exec', href: './journal/#exec' },
        sec: { label: 'Weekly →', href: './weekly/' }
      };
    } else {
      action = {
        prio: 'warn', kicker: 'PLAN · CAUTION',
        title: 'Filtrează — nu forța size full',
        why: 'GO ' + st.goScore + ' (' + st.goLabel + ') · Desk ' + st.verdict +
          '. Preferă watchlist + plan mic până se aliniază regimul.',
        cta: { label: 'Router / morning', href: './router/' },
        sec: { label: 'Watchlist →', href: './watchlist-monitor/' }
      };
    }
    action.ruleId = winnerId;
    return { action, winnerId, st };
  }

  function writeCtx(st, action) {
    const payload = {
      v: 1,
      ts: Date.now(),
      session: st.session,
      goScore: st.goScore,
      goLabel: st.goLabel,
      goCls: st.goCls,
      verdict: st.verdict,
      riskPct: st.riskPct,
      openN: st.openN,
      trustPct: st.trustPct,
      ruleId: action.ruleId,
      sym: action.ctxSym || null,
      source: action.ctxSource || 'hub-next',
      nextAction: action.title,
      href: action.cta && action.cta.href
    };
    try { localStorage.setItem(CTX_KEY, JSON.stringify(payload)); } catch (e) {}
  }

  function render() {
    const root = $('hubNextAction');
    if (!root) return null;
    const { action, winnerId, st } = evaluate(buildState());
    root.className = 'hub-na prio-' + (action.prio || 'warn');
    root.innerHTML =
      '<div class="hub-na-main">' +
        '<div class="hub-na-kicker">' + esc(action.kicker) + '</div>' +
        '<div class="hub-na-title">' + esc(action.title) + '</div>' +
        '<div class="hub-na-why">' + esc(action.why) + '</div>' +
        '<div class="hub-na-meta">#' + esc(action.ruleId) +
          (st.session ? ' · ' + esc(st.session) : '') +
          (st.trustPct != null ? ' · trust ' + st.trustPct + '%' : '') +
        '</div>' +
      '</div>' +
      '<div class="hub-na-actions">' +
        '<a class="hub-na-cta" id="hubNaCta" href="' + esc(action.cta.href) + '">' + esc(action.cta.label) + '</a>' +
        '<a class="hub-na-sec" href="' + esc(action.sec.href) + '">' + esc(action.sec.label) + '</a>' +
      '</div>';
    const cta = $('hubNaCta');
    if (cta) {
      cta.addEventListener('click', function () { writeCtx(st, action); });
    }
    root.dataset.rule = winnerId;
    root.hidden = false;
    return action;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  let inited = false;
  function init() {
    if (inited) return;
    inited = true;
    render();
    window.addEventListener('hub:market', function () { try { render(); } catch (e) {} });
    setInterval(function () { try { render(); } catch (e) {} }, 60000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) try { render(); } catch (e) {}
    });
  }

  global.HNA = { init, render, evaluate, buildState };
})(typeof window !== 'undefined' ? window : global);
