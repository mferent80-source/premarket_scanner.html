/* theme.js — comutator de temă suite-wide (light / dark / auto)
 * ------------------------------------------------------------------
 * Stare: localStorage['tt_theme'] ∈ 'auto' | 'light' | 'dark'  (default 'auto').
 * Se încarcă SINCRON în <head>, ÎNAINTE de CSS-ul paginii, ca `data-theme`
 * să fie scris pe <html> înainte de primul paint (zero flash de temă greșită).
 *
 * De ce merge fără să atingem paletele existente:
 *   `:root[data-theme="light"]` are specificitate (0,1,1) > `:root` (0,1,0),
 *   deci overrides-urile din theme-light.css bat variabilele din <style>-ul
 *   fiecărei pagini indiferent de ordinea în cascadă.
 *
 * Cross-page: localStorage e comun pe origin → navigarea normală păstrează
 * alegerea, iar evenimentul `storage` propagă schimbarea instant în celelalte
 * tab-uri deschise ale suitei.
 *
 * Integrare nasdaq-scanner: pagina aia are toggle propriu bazat pe `body.dark`.
 * Aici sincronizăm clasa în ambele sensuri (noi → body.dark, toggle-ul vechi →
 * tt_theme, via MutationObserver) și NU injectăm al doilea buton.
 *
 * API: window.TTTheme = { get(), set(mode), cycle(), resolved(), sync() }
 */
(function (global) {
  'use strict';

  var KEY = 'tt_theme';
  var MODES = ['auto', 'light', 'dark'];
  var ICONS = { auto: '🌗', light: '☀️', dark: '🌙' };
  var TITLES = {
    auto: 'Temă: Auto (urmează sistemul) — click pentru Light',
    light: 'Temă: Light — click pentru Dark',
    dark: 'Temă: Dark — click pentru Auto'
  };

  /* ─────────── funcții pure (testabile în node) ─────────── */

  // Suita e dark-first de la început: fără alegere salvată rămâne DARK, nu 'auto'.
  // Altfel, un Windows setat pe temă deschisă ar comuta singur toată suita în light
  // la prima deschidere după deploy — schimbare de comportament nesolicitată.
  // 'auto' rămâne disponibil, dar DOAR dacă îl alege userul explicit din buton.
  var DEFAULT_MODE = 'dark';

  function normalizeMode(m) {
    return MODES.indexOf(m) >= 0 ? m : DEFAULT_MODE;
  }

  /** 'auto' se rezolvă după prefers-color-scheme; light/dark sunt explicite. */
  function resolveTheme(mode, systemDark) {
    var m = normalizeMode(mode);
    if (m === 'light') return 'light';
    if (m === 'dark') return 'dark';
    return systemDark ? 'dark' : 'light';
  }

  /** auto → light → dark → auto */
  function nextMode(mode) {
    return MODES[(MODES.indexOf(normalizeMode(mode)) + 1) % MODES.length];
  }

  /* ─────────── stare + storage ─────────── */

  var mql = null;
  try {
    if (global && global.matchMedia) mql = global.matchMedia('(prefers-color-scheme: dark)');
  } catch (e) { mql = null; }

  // fallback: suita e dark-first → dacă browserul nu spune nimic, rămâne dark
  function systemDark() { return mql ? !!mql.matches : true; }

  function readMode() {
    try { return normalizeMode(global.localStorage.getItem(KEY)); } catch (e) { return DEFAULT_MODE; }
  }
  function writeMode(m) {
    try { global.localStorage.setItem(KEY, m); } catch (e) { /* private mode */ }
  }

  var mode = DEFAULT_MODE;
  var current = 'dark';        // tema rezolvată curentă
  var expectedDark = null;     // ce am pus NOI pe body.dark (guard anti-buclă)

  /* ─────────── aplicare pe DOM ─────────── */

  function paintButtons(theme) {
    var b = document.getElementById('ttThemeBtn');
    if (b) {
      b.textContent = ICONS[mode] || ICONS.auto;
      b.title = TITLES[mode] || TITLES.auto;
      b.setAttribute('aria-label', b.title);
    }
    // nasdaq-scanner: butonul propriu — convenția lui e „arată unde ajungi"
    var d = document.getElementById('darkModeBtn');
    if (d) {
      d.textContent = theme === 'dark' ? '☀️' : '🌙';
      if (d.style.display === 'none') d.style.display = '';
    }
  }

  function applyDom() {
    var theme = resolveTheme(mode, systemDark());
    current = theme;
    var root = document.documentElement;
    if (root) root.setAttribute('data-theme', theme);

    var body = document.body;
    if (body) {
      expectedDark = (theme === 'dark');
      if (expectedDark) body.classList.add('dark');
      else body.classList.remove('dark');
      // cheia veche, partajată cu crypto-scanner
      try { global.localStorage.setItem('darkMode', expectedDark ? '1' : '0'); } catch (e) {}
    }
    paintButtons(theme);
    // consumatori care desenează inline (ex. lib/cockpit.js) se repictează
    try {
      document.dispatchEvent(new CustomEvent('tt:themechange', { detail: { theme: theme, mode: mode } }));
    } catch (e) {}
    return theme;
  }

  /* ─────────── API ─────────── */

  function get() { return mode; }
  function resolved() { return current; }
  function set(m) { mode = normalizeMode(m); writeMode(mode); return applyDom(); }
  function cycle() { return set(nextMode(mode)); }
  function sync() { return applyDom(); }

  var API = {
    KEY: KEY, MODES: MODES,
    normalizeMode: normalizeMode, resolveTheme: resolveTheme, nextMode: nextMode,
    get: get, set: set, cycle: cycle, resolved: resolved, sync: sync
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (global) global.TTTheme = API;

  if (typeof document === 'undefined') return;   // rulare în node (teste)

  mode = readMode();
  applyDom();   // <html> există deja în <head> → data-theme înainte de primul paint

  /* ─────────── observatori ─────────── */

  var bodyObserved = false;
  function observeBodyClass() {
    if (bodyObserved || !global.MutationObserver || !document.body) return;
    bodyObserved = true;
    new global.MutationObserver(function () {
      var isDark = document.body.classList.contains('dark');
      if (expectedDark === null || isDark === expectedDark) return;  // e mutația noastră
      // a apăsat cineva toggle-ul propriu al paginii → persistăm alegerea suite-wide
      mode = isDark ? 'dark' : 'light';
      current = mode;
      expectedDark = isDark;
      writeMode(mode);
      document.documentElement.setAttribute('data-theme', mode);
      paintButtons(mode);
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  // aplică pe <body> imediat ce apare (înainte de DOMContentLoaded → fără flash)
  if (!document.body && global.MutationObserver) {
    var mo = new global.MutationObserver(function () {
      if (!document.body) return;
      mo.disconnect();
      applyDom();
      observeBodyClass();
    });
    mo.observe(document.documentElement, { childList: true });
  }

  /* ─────────── butonul de comutare (auto-injectat) ─────────── */

  var HEADER_SEL = [
    'header.suite-cockpit', '.suite-cockpit', '.macro-cockpit', '.hub-head-compact',
    'header.hdr', '.scanner-cockpit', 'header'
  ];

  function findHeader() {
    for (var i = 0; i < HEADER_SEL.length; i++) {
      var el = document.querySelector(HEADER_SEL[i]);
      if (el) return el;
    }
    return null;
  }

  function injectBtn() {
    if (document.getElementById('ttThemeBtn')) return;
    // pagina are deja toggle propriu (nasdaq-scanner) → ne integrăm, nu dublăm
    if (document.getElementById('darkModeBtn')) return;

    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'ttThemeBtn';
    b.className = 'tt-theme-btn icon-btn';
    b.addEventListener('click', function (ev) { ev.preventDefault(); cycle(); });

    var h = findHeader();
    if (h) h.appendChild(b);
    else {
      b.classList.add('tt-theme-btn-float');
      document.body.appendChild(b);
    }
    paintButtons(current);
  }

  function boot() { applyDom(); observeBodyClass(); injectBtn(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* ─────────── propagare cross-tab + sistem ─────────── */

  global.addEventListener('storage', function (e) {
    if (!e) return;
    if (e.key === KEY || e.key === null) {   // null = localStorage.clear()
      mode = readMode();
      applyDom();
    }
  });

  function onSystemChange() { if (mode === 'auto') applyDom(); }
  if (mql) {
    if (mql.addEventListener) mql.addEventListener('change', onSystemChange);
    else if (mql.addListener) mql.addListener(onSystemChange);
  }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
