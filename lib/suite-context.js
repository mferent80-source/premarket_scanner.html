// suite-context.js — I-213 handoff cross-pagini (SCTX.*)
// Cheie: tt_ctx_v1 — scris de hub Next Action / gappers / launch; citit de Journal, Nasdaq, STL…
// { v, ts, session, goScore, goLabel, goCls, verdict, riskPct, openN, trustPct,
//   ruleId, sym, source, nextAction, href, notes, regime }
(function (global) {
  'use strict';

  const KEY = 'tt_ctx_v1';
  const MAX_AGE_MS = 60 * 60 * 1000; // 60 min — după asta e 📦 / ignorat

  function now() { return Date.now(); }

  function write(partial) {
    partial = partial || {};
    let prev = null;
    try { prev = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { prev = null; }
    const base = (prev && typeof prev === 'object') ? prev : {};
    const o = Object.assign({}, base, partial, {
      v: 1,
      ts: now()
    });
    // normalize
    if (o.sym) o.sym = String(o.sym).toUpperCase().replace(/[^A-Z0-9.-]/g, '');
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
    return o;
  }

  function read(opts) {
    opts = opts || {};
    const maxAge = opts.maxAgeMs != null ? opts.maxAgeMs : MAX_AGE_MS;
    let o = null;
    try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
    if (!o || typeof o !== 'object') return null;
    if (!Number.isFinite(o.ts)) return null;
    const age = now() - o.ts;
    if (age < 0 || age > maxAge) {
      if (opts.clearStale) clear();
      return null;
    }
    o._ageMin = Math.round(age / 60000);
    o._stale = age > 15 * 60000;
    return o;
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  /** Citește și șterge (one-shot prefill) — dacă keep=true, doar citește */
  function consume(opts) {
    opts = opts || {};
    const o = read(opts);
    if (o && opts.keep !== true) clear();
    return o;
  }

  function fromQuery() {
    try {
      const q = new URLSearchParams(location.search);
      if (!q.has('sym') && !q.has('source') && !q.has('notes')) return null;
      return {
        sym: q.get('sym') || null,
        source: q.get('source') || null,
        notes: q.get('notes') || null,
        ts: now(),
        v: 1
      };
    } catch (e) { return null; }
  }

  /** Scrie din query + hub state opțional (înainte de navigare) */
  function writeFromNav(href, extra) {
    extra = extra || {};
    let sym = extra.sym || null;
    try {
      const u = new URL(href, location.href);
      const qs = u.searchParams.get('sym');
      if (qs) sym = qs;
    } catch (e) {}
    return write(Object.assign({
      source: extra.source || 'nav',
      href: href,
      sym: sym
    }, extra));
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  /** Banner HTML compact pentru Journal / Scanner */
  function bannerHtml(ctx, opts) {
    opts = opts || {};
    if (!ctx) return '';
    const parts = [];
    if (ctx.sym) parts.push('<b>' + esc(ctx.sym) + '</b>');
    if (ctx.nextAction) parts.push(esc(ctx.nextAction));
    else if (ctx.source) parts.push(esc(ctx.source));
    if (ctx.goScore != null && ctx.goScore !== '—') parts.push('GO ' + esc(String(ctx.goScore)));
    if (ctx.verdict && ctx.verdict !== '—') parts.push(esc(String(ctx.verdict)));
    if (ctx.riskPct != null && Number.isFinite(ctx.riskPct)) parts.push('risc ' + Number(ctx.riskPct).toFixed(1) + '%');
    if (ctx.session) parts.push(esc(ctx.session));
    if (ctx._ageMin != null) parts.push(ctx._stale ? '📦 ' + ctx._ageMin + 'm' : ctx._ageMin + 'm');
    const clearBtn = opts.showClear
      ? ' <button type="button" class="sctx-clear" data-sctx-clear style="margin-left:8px;font:inherit;font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px;border:1px solid rgba(255,255,255,.2);background:transparent;color:inherit;cursor:pointer">✕</button>'
      : '';
    return '<div class="sctx-banner" role="status">' +
      '<span class="sctx-ico">📎</span> <span class="sctx-txt">Context suite: ' + parts.join(' · ') + '</span>' +
      clearBtn + '</div>';
  }

  function injectBannerStyles() {
    if (document.getElementById('sctx-css')) return;
    const st = document.createElement('style');
    st.id = 'sctx-css';
    st.textContent =
      '.sctx-banner{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 10px;' +
      'padding:8px 12px;border-radius:10px;font-family:var(--mono,ui-monospace,monospace);font-size:11px;font-weight:600;' +
      'background:rgba(91,176,255,.1);border:1px solid rgba(91,176,255,.35);color:var(--t2,#eef2f8);line-height:1.35}' +
      '.sctx-banner b{color:var(--t1,#fafbfc);font-weight:800}' +
      '.sctx-ico{font-size:13px}' +
      '.sctx-banner.sctx-stale{border-color:rgba(212,137,44,.45);background:rgba(212,137,44,.1)}';
    document.head.appendChild(st);
  }

  function mountBanner(hostId, opts) {
    opts = opts || {};
    const host = typeof hostId === 'string' ? document.getElementById(hostId) : hostId;
    if (!host) return null;
    injectBannerStyles();
    const ctx = read(opts);
    if (!ctx) { host.innerHTML = ''; host.style.display = 'none'; return null; }
    host.style.display = '';
    host.innerHTML = bannerHtml(ctx, { showClear: opts.showClear !== false });
    if (ctx._stale) host.querySelector('.sctx-banner')?.classList.add('sctx-stale');
    const btn = host.querySelector('[data-sctx-clear]');
    if (btn) {
      btn.addEventListener('click', function () {
        clear();
        host.innerHTML = '';
        host.style.display = 'none';
      });
    }
    return ctx;
  }

  global.SCTX = {
    KEY, MAX_AGE_MS,
    write, read, clear, consume, fromQuery, writeFromNav,
    bannerHtml, mountBanner, injectBannerStyles
  };
})(typeof window !== 'undefined' ? window : globalThis);
