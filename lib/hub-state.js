// hub-state.js — agregat hub (desk, GO, macro, stale audit) I-160
(function(global){
  'use strict';

  const MKT_LINKS = {
    SPY: './nasdaq-scanner/?sym=SPY',
    QQQ: './nasdaq-scanner/?sym=QQQ',
    VIX: './macro-dashboard/'
  };
  const DIGEST_LS_KEY = 'tt_stale_digest_sent_v1';
  const DIGEST_EXPORT_KEY = 'tt_hub_stale_digest_export_v1';
  const MKT_STALE_MS = 5 * 60 * 1000;

  let lastRtEval = null;

  function macroLvl(label){
    const l = String(label || '');
    if (/RISK-OFF|STRESS/.test(l)) return 'bear';
    if (/CAUTIOUS/.test(l)) return 'warn';
    if (/RISK-ON|LEAN/.test(l)) return 'ok';
    return 'neut';
  }

  function regimeStreak(label){
    let lbl = String(label || '').trim();
    if (!lbl){
      try {
        const r = JSON.parse(localStorage.getItem('md_risk_regime') || 'null');
        lbl = r && r.label ? String(r.label).trim() : '';
      } catch (e) { return 0; }
    }
    if (!lbl) return 0;
    let streak = 0;
    try {
      const rh = JSON.parse(localStorage.getItem('md_regime_daily') || '[]');
      if (Array.isArray(rh)){
        for (let i = rh.length - 1; i >= 0; i--){
          if (rh[i] && rh[i].label === lbl) streak++;
          else break;
        }
      }
    } catch (e) {}
    return streak;
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
    if (!Number.isFinite(pct)) return 'neut'; // NaN trecea de toate pragurile → card verde fals
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
    // try/catch SEPARAT per sursă — un throw în CD.unified() nu mai sare
    // silențios peste JR/EQ (Open/Drift rămâneau pe defaults fără indicație)
    try {
      if (global.GV && GV.status){
        const st = GV.status();
        const lb = GV.labelOf ? GV.labelOf(st.verdict) : { text: st.verdict };
        d.verdict = lb.text || st.verdict;
        d.verdictRaw = st.verdict || '';
      }
    } catch (e) {}
    try {
      if (global.CD && CD.unified){
        const pf = CD.unified().portfolio || {};
        d.riskPct = pf.riskPct;
        d.riskStale = !!pf.liveStale;
        d.openN = pf.count || 0;
      }
    } catch (e) {}
    try {
      if (global.JR && JR.all) d.openN = JR.all().filter(e => JR.isOpen(e)).length;
    } catch (e) {}
    try {
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
        d.goCls = p.goCls || 'neut'; // fallback unificat cu initul (era 'caution' — două culori pt aceeași stare necunoscută)
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
      // banda neutra ca la SPY/QQQ — un uptick infim (+0.01%) colora
      // cardul rosu desi VIX-ul era calm; sub 0.5% = zgomot, nu semnal
      if (Math.abs(q.chgPct) < 0.5) return 'neut';
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

    const eqAge = equityAgeDays();
    if (eqAge === null){
      items.push({ id: 'equity', label: 'Fără snapshot equity', cls: 'warn', href: './journal/#capital' });
      worst = bumpWorst(worst, 'warn');
    } else if (eqAge > 14){
      items.push({ id: 'equity', label: 'Snapshot equity ' + eqAge + 'z', cls: 'err', href: './journal/#capital' });
      worst = bumpWorst(worst, 'err');
    } else if (eqAge > 7){
      items.push({ id: 'equity', label: 'Snapshot equity ' + eqAge + 'z', cls: 'warn', href: './journal/#capital' });
      worst = bumpWorst(worst, 'warn');
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
    } else {
      // ts-ul global e proaspăt cât timp UN simbol reușește — verifică și
      // per-quote (VIX picat repetat colora cardul de risc cu date vechi)
      const staleSyms = Object.entries(mkt.quotes)
        .filter(([, q]) => q && Number.isFinite(q.ts) && Date.now() - q.ts > MKT_STALE_MS)
        .map(([k]) => k);
      if (staleSyms.length){
        items.push({ id: 'market-sym', label: staleSyms.join('/') + ' fără refresh (restul OK)', cls: 'warn', href: './' });
        worst = bumpWorst(worst, 'warn');
      }
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

  // I-206 — Data Trust: câte surse decizionale sunt proaspete ACUM.
  // GO score-ul se afișa ferm chiar când inputurile erau vechi de ore;
  // gate-ul face degradarea vizibilă (nu schimbă formula GO, doar onestitatea).
  function dataTrust(){
    const a = staleAudit();
    const TOTAL = 6; // macro · equity · piață · quotes/simbol · portfolio-live · cache SW
    const bad = new Set(a.items.map(i => i.id)).size;
    const fresh = Math.max(0, TOTAL - Math.min(TOTAL, bad));
    const pct = Math.round(fresh / TOTAL * 100);
    return { fresh, total: TOTAL, pct, degraded: pct < 70 || a.worst === 'err', worst: a.worst, items: a.items };
  }

  function equityAgeDays(){
    if (global.EQ && EQ.drift){
      try {
        const dr = EQ.drift();
        if (dr.snapshotAgeDays != null) return dr.snapshotAgeDays;
        if (!dr.snapshot) return null;
      } catch (e) {}
    }
    try {
      const snaps = JSON.parse(localStorage.getItem('tt_equity_snapshots_v1') || '[]');
      if (!Array.isArray(snaps) || !snaps.length) return null;
      // tiebreak pe day: snapshot-urile din schema veche n-au ts (toate 0) —
      // sortul stabil lasa ordinea de append si [0] era cel mai VECHI
      const last = snaps.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0) || String(b.day || '').localeCompare(String(a.day || '')))[0];
      if (!last || !last.day) return null;
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const d0 = new Date(last.day + 'T12:00:00Z').getTime();
      const d1 = new Date(today + 'T12:00:00Z').getTime();
      const diff = Math.max(0, Math.round((d1 - d0) / 86400000));
      // `day` malformat → NaN care trecea de TOATE pragurile de stale
      // (NaN>14 e false) — snapshot corupt raportat ca proaspăt
      return Number.isFinite(diff) ? diff : null;
    } catch (e) { return null; }
  }

  function formatStaleDigestHtml(a){
    if (!a || !a.count) return '☀️ <b>Hub OK</b> — toate sursele proaspete.';
    const icon = a.worst === 'err' ? '🚨' : '⚠️';
    // escape minimal pe labels — parse_mode HTML; un < sau & din tt_sw_version
    // rupea tot mesajul Telegram
    const escTg = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return icon + ' <b>Hub stale (' + a.count + ')</b>\n' +
      a.items.map(i => '• ' + escTg(i.label)).join('\n') +
      '\n<i>Hub → Health pentru detalii</i>';
  }

  function staleDigestPayload(){
    const a = staleAudit();
    return {
      enabled: true,
      lastSent: null,
      updatedAt: new Date().toISOString(),
      worst: a.worst,
      count: a.count,
      items: a.items.map(i => ({ id: i.id, label: i.label, cls: i.cls })),
      note: 'Lipește în tools/hub-stale-digest.json (păstrează enabled/lastSent) — digest server 07:00-09:59 ET'
    };
  }

  function exportDigestForBot(){
    const payload = staleDigestPayload();
    try { localStorage.setItem(DIGEST_EXPORT_KEY, JSON.stringify(payload)); } catch (e) {}
    return payload;
  }

  async function copyText(txt){
    try {
      if (navigator.clipboard && navigator.clipboard.writeText){
        await navigator.clipboard.writeText(txt);
        return true;
      }
    } catch (e) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch (e) { return false; }
  }

  async function copyStaleDigestPayload(){
    const payload = staleDigestPayload();
    exportDigestForBot();
    return copyText(JSON.stringify(payload, null, 2));
  }

  function etMorningWindow(){
    try {
      const h = parseInt(new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York', hour: 'numeric', hour12: false
      }), 10);
      return h >= 7 && h <= 9;
    } catch (e) { return false; }
  }

  function etDayKey(){
    try {
      return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    } catch (e) { return new Date().toISOString().slice(0, 10); }
  }

  // flag sincron ANTI-DUBLURA: functia e chemata fire-and-forget din HT.render,
  // care ruleaza in rafala (2x per quote din stashMkt) — fara flag, apelurile
  // concurente treceau toate de check-ul LS in fereastra RTT a lui TG.send
  // si digestul pleca de 2-6 ori pe Telegram
  let digestBusy = false;
  async function maybeSendMorningDigest(){
    if (digestBusy) return false;
    if (!etMorningWindow()) return false;
    const a = staleAudit();
    exportDigestForBot();
    if (!a.count) return false;
    let sent = '';
    try { sent = localStorage.getItem(DIGEST_LS_KEY) || ''; } catch (e) {}
    if (sent === etDayKey()) return false;
    if (global.TG && TG.send){
      digestBusy = true;
      // cheia LS se scrie OPTIMIST înainte de send — două TABURI deschise
      // treceau amândouă de check în fereastra RTT (digestBusy e per-tab);
      // la eșec facem revert ca ziua să nu rămână „trimisă" fals
      try { localStorage.setItem(DIGEST_LS_KEY, etDayKey()); } catch (e) {}
      try {
        const ok = await TG.send(formatStaleDigestHtml(a));
        if (ok) return true;
        try { localStorage.removeItem(DIGEST_LS_KEY); } catch (e) {}
      } catch (e) {
        try { localStorage.removeItem(DIGEST_LS_KEY); } catch (e2) {}
      }
      finally { digestBusy = false; }
    }
    return false;
  }

  function bindStaleNav(el){
    if (!el || el.dataset.staleBound) return;
    el.dataset.staleBound = '1';
    el.addEventListener('click', async (e) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      const prev = el.textContent;
      el.textContent = '…';
      const ok = await copyStaleDigestPayload();
      el.textContent = ok ? '✓ copiat' : '✗ eșec';
      setTimeout(() => {
        if (el.textContent === '✓ copiat' || el.textContent === '✗ eșec') renderStaleNav(el.id);
        else el.textContent = prev;
      }, 2200);
    });
  }

  function renderStaleNav(elId){
    const el = document.getElementById(elId || 'hubStaleNav');
    if (!el) return;
    bindStaleNav(el);
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
    const labels = a.items.map(i => i.label).join(' · ');
    el.title = labels + ' — click → Health · Shift+click → copiază digest server';
  }

  global.HS = {
    macroLvl, regimeStreak, curveLvl, tiltLvl, tileClsToLvl, deskLvl, riskLvl, openLvl, rWeekLvl,
    driftLvl, earnLvl, surpLvl, goLvl, sessionLvl, dangerLvlFromScore,
    resolveMacro, hubState, invalidateRtEval,
    marketHref, marketQuoteLvl, setCardLvl, patchMarketCards,
    staleAudit, dataTrust, renderStaleNav, formatStaleDigestHtml, staleDigestPayload, exportDigestForBot,
    copyStaleDigestPayload, maybeSendMorningDigest, equityAgeDays
  };
})(typeof window !== 'undefined' ? window : global);