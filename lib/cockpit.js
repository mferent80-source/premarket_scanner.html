// cockpit.js — bandă cockpit compactă shared (CKB.mount / CKB.refresh)
//
// Ce e: o bandă ORIZONTALĂ slim (~64px) cu regimul de risc + gauge apetit + Danger
// Score + prospețimea datelor. Se montează pe hub (index.html) și pe nasdaq-scanner.
//
// Ce NU e: nu e cockpit-ul complet din macro-dashboard (acela rămâne neatins) și nu
// duplică „macro rail"-ul textual din tableau-ul hub-ului — banda e strict semafor +
// gauge + danger + vechime, fără KPI-uri de cotații.
//
// Sursa de date: EXCLUSIV lib/macro-context.js (MCTX) — citire read-only din
// localStorage scris de pagina Macro. ZERO fetch-uri noi aici.
//
// Onestitate (regula casei): dacă MCTX zice `stale`, banda NU prezintă datele drept
// live — semafor gri, marcaj „📦 din <data>", gauge gri 50% etichetat „estimare".
// Decizia de stale vine MEREU din MCTX (el deține TTL-urile), nu din calcule locale;
// aici Date.now() se folosește doar ca să AFIȘEZE vechimea, niciodată ca să o judece.
(function(global){
  'use strict';

  const CSS_ID = 'ck-band-css';
  const REFRESH_MS = 60000;

  // toate montările active — refresh() le re-randează pe toate
  const mounts = [];
  let timer = null;
  let lsBound = false;

  // ---------- utilitare pure ----------

  // tot ce vine din localStorage (scris de altă pagină) trece pe aici înainte de innerHTML
  // ── tema deschisă: culorile inline (venite din MCTX) sunt prea slabe pe fundal
  // alb → le traducem. CSS-ul claselor .ckb-* e acoperit din lib/theme-light.css.
  const LIGHT_COLOR = {
    '#22d66b': '#059669', '#5bb0ff': '#1d6fd0', '#d4892c': '#b45309',
    '#ff4d4d': '#dc2626', '#a3adc1': '#6b6a65', '#7f8b9e': '#6b6a65',
    '#f0f4fa': '#3f3e3a', '#e6ebf3': '#0b0b0b', '#98a3b6': '#6b6a65'
  };
  function isLightTheme(){
    try { return document.documentElement.getAttribute('data-theme') === 'light'; }
    catch (e) { return false; }
  }
  function col(c){
    return isLightTheme() ? (LIGHT_COLOR[String(c).toLowerCase()] || c) : c;
  }

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[m]));
  }

  // composite [-10..+10] → [0..100]% (aceeași mapare ca în cockpit-ul din macro-dashboard).
  // Orice non-număr → 50% („nu știu", nu „neutru confirmat").
  function gaugePct(composite){
    if (typeof composite !== 'number' || !isFinite(composite)) return 50;
    return Math.max(0, Math.min(100, Math.round((composite + 10) * 5)));
  }

  // vechime umană dintr-un delta în ms
  function fmtAge(ms){
    if (typeof ms !== 'number' || !isFinite(ms) || ms < 0) return '—';
    if (ms < 60000) return 'acum';
    if (ms < 3600000) return Math.round(ms / 60000) + ' min';
    if (ms < 86400000) return Math.round(ms / 3600000) + 'h';
    return Math.round(ms / 86400000) + ' zile';
  }

  function signed(n){
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    return (n >= 0 ? '+' : '') + n;
  }

  // ---------- context ----------

  // Prefixul relativ către rădăcina suitei, dedus din <script src=".../lib/cockpit.js">.
  // Hub: 'lib/cockpit.js' → ''. Nasdaq: '../lib/cockpit.js' → '../'.
  // Fallback: '' (rădăcină). Poate fi suprascris cu opts.macroHref sau
  // data-macro-href pe elementul gazdă.
  function baseHref(){
    try {
      const list = document.getElementsByTagName('script');
      for (let i = 0; i < list.length; i++){
        const raw = list[i].getAttribute('src') || '';
        const m = raw.match(/^(.*?)lib\/cockpit\.js(\?|$)/);
        if (m) return m[1] || '';
      }
    } catch (e) {}
    return '';
  }

  function macroHrefFor(opts, el){
    if (opts && opts.macroHref) return opts.macroHref;
    if (el && el.getAttribute && el.getAttribute('data-macro-href')) return el.getAttribute('data-macro-href');
    const b = baseHref();
    return (b || './') + 'macro-dashboard/';
  }

  // Trendul zilnic al regimului: ultima intrare din md_regime_daily dintr-o zi
  // ANTERIOARĂ celei de azi (ET). Formatul real scris de macro-dashboard
  // (snapshotRegimeDaily): [{ dateET, composite, label }, ...] sortat crescător.
  function regimeTrend(){
    try {
      const MC = global.MCTX;
      const today = MC && MC.todayET ? MC.todayET() : '';
      const h = JSON.parse(localStorage.getItem('md_regime_daily') || '[]');
      if (!Array.isArray(h)) return null;
      const past = h.filter(x => x && x.dateET && (!today || x.dateET < today));
      return past.length ? past[past.length - 1] : null;
    } catch (e) { return null; }
  }

  // ---------- CSS (injectat o singură dată, clase prefixate ckb-) ----------

  function injectCss(){
    if (document.getElementById(CSS_ID)) return;
    const st = document.createElement('style');
    st.id = CSS_ID;
    st.textContent = [
      '.ckb-band{display:flex;align-items:center;gap:14px;flex-wrap:nowrap;',
      'background:var(--panel,#1b2028);border:1px solid var(--b1,#3a4250);border-radius:12px;',
      'padding:7px 14px;margin:0 0 12px;min-height:52px;max-height:64px;overflow:hidden;',
      'color:var(--t1,#e6e8ec);font-size:12px;line-height:1.35;font-variant-numeric:tabular-nums;',
      'font-family:inherit;box-sizing:border-box}',
      '.ckb-band *{box-sizing:border-box}',
      '.ckb-cell{display:flex;align-items:center;gap:9px;white-space:nowrap;min-width:0}',
      '.ckb-dot{font-size:20px;line-height:1;text-shadow:none;flex:0 0 auto}',
      '.ckb-lbl{font-size:8.5px;letter-spacing:1.6px;color:var(--t3,#8b929e);text-transform:uppercase;',
      'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.ckb-val{font-size:14px;font-weight:800;letter-spacing:.2px;line-height:1.2}',
      '.ckb-sub{font-size:10.5px;color:var(--t3,#8b929e);font-variant-numeric:tabular-nums;',
      'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.ckb-sub b{color:var(--t1,#e6e8ec);font-weight:700}',
      '.ckb-up{color:var(--green,#5f9a74)}.ckb-dn{color:var(--red,#c46b6b)}.ckb-flat{color:var(--t3,#8b929e)}',
      '.ckb-sep{width:1px;align-self:stretch;background:var(--b1,#3a4250);flex:0 0 auto;margin:2px 0}',
      '.ckb-gauge{width:90px;height:58px;flex:0 0 auto;display:block}',
      '.ckb-gauge .ckb-gv{font-size:15px;font-weight:800;fill:#e6ebf3}',
      '.ckb-gauge .ckb-gl{font-size:6.5px;fill:#7f8b9e;',
      'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.ckb-spacer{flex:1 1 auto;min-width:8px}',
      '.ckb-src{display:flex;align-items:center;gap:8px;white-space:nowrap;flex:0 0 auto}',
      '.ckb-src .ckb-sub{font-size:10px}',
      '.ckb-link{font-size:11px;font-weight:700;color:var(--t1,#e6e8ec);text-decoration:none;',
      'border:1px solid var(--b1,#3a4250);border-radius:7px;padding:3px 9px;',
      'background:var(--panel2,#222830);transition:border-color .15s ease}',
      '.ckb-link:hover{border-color:var(--accent,#8a9aab)}',
      '.ckb-stale{color:#d4892c}',
      '@media(max-width:700px){',
      '.ckb-band{max-height:none;overflow-x:auto;overflow-y:hidden;gap:11px;padding:7px 11px;',
      '-webkit-overflow-scrolling:touch}',
      '.ckb-gauge{display:none}',
      '.ckb-spacer{min-width:4px}}'
    ].join('');
    (document.head || document.documentElement).appendChild(st);
  }

  // ---------- randare ----------

  function gaugeSvg(pct, color, estimare){
    // semicerc: centru (45,46), rază 35 — jumătatea gauge-ului din macro-dashboard.
    // Unghiul central al arcului de valoare e π·pct/100 ∈ [0, π] ⇒ MEREU arc minor
    // ⇒ large-arc-flag CONSTANT 0 (același fix ca în cockpit-ul mare).
    const ang = Math.PI * pct / 100;
    const x = 45 - 35 * Math.cos(ang);
    const y = 46 - 35 * Math.sin(ang);
    return '<svg viewBox="0 0 90 58" class="ckb-gauge" role="img" aria-label="apetit de risc ' + pct + '%">'
      + '<path d="M 10 46 A 35 35 0 1 1 80 46" fill="none" stroke="rgba(255,255,255,.09)" stroke-width="6" stroke-linecap="round"/>'
      + '<path d="M 10 46 A 35 35 0 0 1 ' + x.toFixed(1) + ' ' + y.toFixed(1) + '" fill="none" stroke="' + color + '" stroke-width="6" stroke-linecap="round"/>'
      + '<text x="45" y="42" text-anchor="middle" class="ckb-gv">' + pct + '%</text>'
      + '<text x="45" y="53" text-anchor="middle" class="ckb-gl">' + (estimare ? 'estimare' : 'apetit risc') + '</text>'
      + '</svg>';
  }

  function semaphoreCell(reg, trend){
    const MC = global.MCTX;
    const GRAY = col('#a3adc1');
    if (!reg.label || reg.stale){
      // fără date proaspete: gri + marcaj 📦 cu data ultimei valori (dacă există)
      const when = reg.ts ? new Date(reg.ts).toLocaleDateString('ro-RO') : null;
      const sub = reg.label
        ? '📦 din ' + esc(when || '?') + (reg.composite != null ? ' · scor <b>' + esc(signed(reg.composite)) + '</b>' : '')
        : 'fără date Macro';
      const val = reg.label ? esc(reg.label) : '—';
      return '<div class="ckb-cell">'
        + '<span class="ckb-dot" style="color:' + GRAY + '">◆</span>'
        + '<span><span class="ckb-lbl">REGIM</span>'
        + '<div class="ckb-val" style="color:' + GRAY + '">' + val + '</div>'
        + '<div class="ckb-sub ckb-stale">' + sub + '</div></span></div>';
    }
    const color = col(MC.regimeColor(reg.label));
    let trendStr = '';
    if (trend && typeof trend.composite === 'number' && typeof reg.composite === 'number'){
      const d = reg.composite - trend.composite;
      const dir = d > 0 ? '<span class="ckb-up">↑</span>' : d < 0 ? '<span class="ckb-dn">↓</span>' : '<span class="ckb-flat">→</span>';
      trendStr = ' · ieri ' + esc(trend.label || '—') + ' ' + dir;
    }
    const streak = reg.streak >= 2 ? ' · ziua ' + esc(String(reg.streak)) : '';
    return '<div class="ckb-cell">'
      + '<span class="ckb-dot" style="color:' + color + '">◆</span>'
      + '<span><span class="ckb-lbl">REGIM</span>'
      + '<div class="ckb-val" style="color:' + color + '">' + esc(reg.label) + '</div>'
      + '<div class="ckb-sub">scor <b>' + esc(signed(reg.composite)) + '</b>' + trendStr + streak + '</div></span></div>';
  }

  function dangerCell(dng){
    if (dng.score == null){
      return '<div class="ckb-cell"><span><span class="ckb-lbl">DANGER</span>'
        + '<div class="ckb-val" style="color:' + col('#a3adc1') + '">—</div>'
        + '<div class="ckb-sub ckb-stale">fără date</div></span></div>';
    }
    const color = col(dng.stale ? '#a3adc1' : dng.color);
    const sub = dng.stale
      ? '📦 din ' + esc(dng.dateET || '?')
      : 'sizing <b>' + esc(dng.mult || '—') + '</b>';
    return '<div class="ckb-cell"><span><span class="ckb-lbl">DANGER</span>'
      + '<div class="ckb-val" style="color:' + color + '">' + esc(String(dng.score)) + '<span style="font-size:10px;color:' + col('#7f8b9e') + '">/100</span></div>'
      + '<div class="ckb-sub' + (dng.stale ? ' ckb-stale' : '') + '">' + sub + '</div></span></div>';
  }

  function bandHtml(el, opts){
    const MC = global.MCTX;
    const href = macroHrefFor(opts, el);
    if (!MC || typeof MC.regime !== 'function'){
      return '<div class="ckb-band"><div class="ckb-cell">'
        + '<span class="ckb-dot" style="color:' + col('#a3adc1') + '">◆</span>'
        + '<span><span class="ckb-lbl">REGIM</span><div class="ckb-val" style="color:' + col('#a3adc1') + '">—</div>'
        + '<div class="ckb-sub ckb-stale">modul macro indisponibil</div></span></div>'
        + '<div class="ckb-spacer"></div>'
        + '<div class="ckb-src"><a class="ckb-link" href="' + esc(href) + '">→ Macro</a></div></div>';
    }
    const reg = MC.regime();
    const dng = MC.danger();
    const trend = reg.stale ? null : regimeTrend();

    // gauge gri + „estimare" ori de câte ori regimul nu e proaspăt
    const fresh = !!(reg.label && !reg.stale);
    const pct = fresh ? gaugePct(reg.composite) : 50;
    const gcol = col(fresh ? MC.regimeColor(reg.label) : '#a3adc1');

    // vechimea e DOAR informativă; stale/fresh vine din MCTX
    const ageStr = reg.ts ? fmtAge(Date.now() - reg.ts) : '—';
    const srcTxt = fresh
      ? '📡 date din Macro · ' + esc(ageStr)
      : '📦 date vechi din Macro' + (reg.ts ? ' · ' + esc(ageStr) : '');

    return '<div class="ckb-band">'
      + semaphoreCell(reg, trend)
      + '<div class="ckb-sep"></div>'
      + gaugeSvg(pct, gcol, !fresh)
      + '<div class="ckb-sep"></div>'
      + dangerCell(dng)
      + '<div class="ckb-spacer"></div>'
      + '<div class="ckb-src"><span class="ckb-sub' + (fresh ? '' : ' ckb-stale') + '">' + srcTxt + '</span>'
      + '<a class="ckb-link" href="' + esc(href) + '" title="Deschide Macro Dashboard">→ Macro</a></div>'
      + '</div>';
  }

  function renderOne(m){
    if (!m || !m.el || !m.el.isConnected) return;
    try { m.el.innerHTML = bandHtml(m.el, m.opts); } catch (e) {}
  }

  function refresh(){
    for (let i = 0; i < mounts.length; i++) renderOne(mounts[i]);
  }

  function startTimer(){
    if (timer) return; // guard: mount repetat NU dublează intervalul
    timer = setInterval(refresh, REFRESH_MS);
    if (!lsBound){
      lsBound = true;
      // pagina Macro rulează în alt tab → repictăm imediat, nu la următorul tick
      try {
        global.addEventListener('storage', e => {
          if (!e || !e.key) return;
          if (e.key === 'md_risk_regime' || e.key === 'md_danger_daily' || e.key === 'md_regime_daily') refresh();
        });
        // schimbarea temei (lib/theme.js) → culorile inline se recalculează prin col()
        document.addEventListener('tt:themechange', refresh);
      } catch (err) {}
    }
  }

  function mount(elOrId, opts){
    const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    if (!el) return null;
    injectCss();
    let m = null;
    for (let i = 0; i < mounts.length; i++) if (mounts[i].el === el) m = mounts[i];
    if (m) m.opts = opts || m.opts || {};
    else { m = { el, opts: opts || {} }; mounts.push(m); }
    renderOne(m);
    startTimer();
    return m;
  }

  // auto-mount pe #ckBand — paginile n-au nevoie de script inline
  function autoMount(){
    const el = document.getElementById('ckBand');
    if (el) mount(el);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount);
  else autoMount();

  global.CKB = { mount, refresh };
})(typeof window !== 'undefined' ? window : globalThis);
