// Suite bottom nav — jos-centru, pe ORICE pagină (nu doar PWA).
// Bara scurtă (principale) + buton „Toate” → grilă completă grupată.
// Include: <script src="<root>nav.js" data-nav-root="<root>"></script>
//   Hub: data-nav-root="./"   · sub-pagini: data-nav-root="../"
// În shell (iframe): fără dock — click pe link intern → postMessage către shell.
(function () {
  'use strict';

  var SEGS = [
    'nasdaq-scanner/', 'watchlist-monitor/', 'market-events/', 'smart-trade-long/', 'pump-radar/',
    'earnings-hub/', 'sector-rotation/', 'macro-dashboard/', 'markov-lab/', 'alerts/', 'guide/',
    'journal/', 'portfolio/', 'weekly/', 'health/', 'router/', 'equity/', 'shadow-book/', 'postmortem/',
    'hub-demo/', 'governor/', 'proxy/'
  ];

  // ── iframe: fără dock, link-uri interne → shell ──
  if (window.self !== window.top) {
    var hrefToSeg = function (href) {
      var abs;
      try { abs = new URL(href, location.href).pathname.replace(/index\.html$/, ''); } catch (_) { return null; }
      for (var i = 0; i < SEGS.length; i++) {
        if (abs.indexOf('/' + SEGS[i]) >= 0) return SEGS[i];
      }
      try {
        var u = new URL(href, location.href);
        if (/premarket_scanner\.html\/?$/.test(u.pathname) || /premarket_scanner\.html\/index\.html$/.test(u.pathname))
          return '';
      } catch (_) {}
      return null;
    };
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (/^(mailto:|tel:|javascript:)/i.test(href)) return;
      if (href.charAt(0) === '#' && href.indexOf('/') < 0) return;
      var seg = hrefToSeg(href);
      if (seg === null && /^\.\.?\//.test(href)) {
        for (var j = 0; j < SEGS.length; j++) {
          if (href.indexOf(SEGS[j]) >= 0) { seg = SEGS[j]; break; }
        }
        if (href === '../' || href === './' || (/index\.html$/.test(href) && href.indexOf('/') <= 2)) seg = '';
      }
      if (seg === null) return;
      e.preventDefault();
      e.stopPropagation();
      var hash = '';
      try { hash = (new URL(href, location.href).hash || '').replace(/^#/, ''); } catch (_) {}
      try { parent.postMessage({ ttOpen: seg, ttHash: hash }, location.origin); } catch (_) {}
    }, true);
    return;
  }

  var s = document.querySelector('script[data-nav-root]');
  var root = (s && s.getAttribute('data-nav-root')) || './';
  if (root.slice(-1) !== '/' && root !== './' && root !== '../') root += '/';

  // Grupe complete — TOATE tool-urile din suite
  var GROUPS = [
    {
      title: 'Hub & plan',
      items: [
        { u: '', n: 'Hub', e: '🏠' },
        { u: 'router/', n: 'Router', e: '🧭' },
        { u: 'macro-dashboard/', n: 'Macro', e: '🌍' },
        { u: 'sector-rotation/', n: 'Sector', e: '🔄' }
      ]
    },
    {
      title: 'Scan',
      items: [
        { u: 'nasdaq-scanner/', n: 'Nasdaq', e: '📈' },
        { u: 'smart-trade-long/', n: 'Smart Long', e: '🚀' },
        { u: 'watchlist-monitor/', n: 'Watchlist', e: '👁' },
        { u: 'market-events/', n: 'Events', e: '📊' },
        { u: 'pump-radar/', n: 'Pump Radar', e: '🔥' },
        { u: 'earnings-hub/', n: 'Earnings', e: '📅' },
        { u: 'markov-lab/', n: 'Markov', e: '🔗' },
        { u: 'alerts/', n: 'Alerts', e: '🔔' }
      ]
    },
    {
      title: 'Capital & exec',
      items: [
        { u: 'journal/', n: 'Journal', e: '📓' },
        { u: 'journal/#desk', n: 'Risk Desk', e: '🛑' },
        { u: 'journal/#exec', n: 'Execuții', e: '⚡' },
        { u: 'journal/#portfolio', n: 'Portfolio', e: '🛡' },
        { u: 'journal/#capital', n: 'Capital', e: '⚖' }
      ]
    },
    {
      title: 'Review',
      items: [
        { u: 'weekly/', n: 'Weekly', e: '🗓' },
        { u: 'postmortem/', n: 'Post-Mortem', e: '🔬' },
        { u: 'shadow-book/', n: 'Shadow Book', e: '👻' },
        { u: 'health/', n: 'Health', e: '💚' },
        { u: 'proxy/', n: 'Transport', e: '🔌' },
        { u: 'guide/', n: 'Ghid', e: '📖' },
        { u: 'hub-demo/', n: 'Hub Demo', e: '🧪' }
      ]
    }
  ];

  // Bara scurtă (mereu vizibilă) — restul e în panoul „Toate”
  var QUICK = [
    { u: '', n: 'Hub', e: '🏠' },
    { u: 'router/', n: 'Router', e: '🧭' },
    { u: 'macro-dashboard/', n: 'Macro', e: '🌍' },
    { u: 'nasdaq-scanner/', n: 'Nasdaq', e: '📈' },
    { u: 'journal/', n: 'Journal', e: '📓' },
    { u: 'journal/#desk', n: 'Desk', e: '🛑' },
    { u: 'alerts/', n: 'Alerts', e: '🔔' },
    { u: 'health/', n: 'Health', e: '💚' }
  ];

  function flatPages() {
    var out = [];
    GROUPS.forEach(function (g) { g.items.forEach(function (it) { out.push(it); }); });
    return out;
  }

  function detectActive() {
    var path = location.pathname.replace(/index\.html$/, '');
    var hash = (location.hash || '').replace(/^#/, '');
    if (path.indexOf('/journal') >= 0) {
      if (hash === 'portfolio' || hash.indexOf('portfolio') === 0) return 'journal/#portfolio';
      if (hash === 'capital' || hash.indexOf('capital') === 0) return 'journal/#capital';
      if (hash === 'desk' || hash.indexOf('desk') === 0) return 'journal/#desk';
      if (hash === 'exec' || hash.indexOf('exec') === 0) return 'journal/#exec';
      return 'journal/';
    }
    if (path.indexOf('/hub-demo') >= 0) return 'hub-demo/';
    var all = flatPages();
    for (var i = 0; i < all.length; i++) {
      var u = all[i].u;
      if (!u || u.indexOf('#') >= 0) continue;
      if (path.indexOf('/' + u) >= 0) return u;
    }
    return '';
  }

  if (document.getElementById('tt-dock')) return;

  var activeU = detectActive();

  if (!document.getElementById('tt-plex')) {
    var plex = document.createElement('link');
    plex.id = 'tt-plex';
    plex.rel = 'stylesheet';
    plex.href = root + 'lib/plex.css?v=743';
    document.head.appendChild(plex);
  }

  var css = document.createElement('style');
  css.id = 'tt-dock-css';
  css.textContent =
    '#tt-dock-wrap{position:fixed;left:50%;transform:translateX(-50%);' +
    'bottom:calc(8px + env(safe-area-inset-bottom,0px));z-index:2147483646;' +
    'display:flex;flex-direction:column;align-items:center;gap:6px;' +
    'width:min(720px,calc(100vw - 12px));pointer-events:none}' +
    '#tt-dock-wrap *{pointer-events:auto}' +
    /* panou TOATE tool-urile */
    '#tt-dock-panel{display:none;width:100%;max-height:min(58vh,420px);overflow:auto;' +
    'background:linear-gradient(180deg,rgba(20,37,51,.98),rgba(11,15,23,.99));' +
    'border:1px solid #4a5874;border-radius:14px;padding:10px 10px 8px;' +
    'box-shadow:0 12px 36px rgba(0,0,0,.5);scrollbar-width:thin}' +
    '#tt-dock-wrap.tt-open #tt-dock-panel{display:block}' +
    '#tt-dock-panel .tt-g{margin-bottom:8px}' +
    '#tt-dock-panel .tt-g:last-child{margin-bottom:0}' +
    '#tt-dock-panel .tt-gt{font-family:\'IBM Plex Sans\',system-ui,sans-serif;font-size:10px;font-weight:600;' +
    'letter-spacing:.04em;text-transform:uppercase;color:#8b929e;margin:0 0 5px 2px}' +
    '#tt-dock-panel .tt-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}' +
    '@media(min-width:520px){#tt-dock-panel .tt-grid{grid-template-columns:repeat(5,minmax(0,1fr))}}' +
    '@media(min-width:700px){#tt-dock-panel .tt-grid{grid-template-columns:repeat(6,minmax(0,1fr))}}' +
    '#tt-dock-panel a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;' +
    'padding:8px 4px;border-radius:10px;text-decoration:none;color:#e6e8ec;font-size:10px;font-weight:600;' +
    'font-family:\'IBM Plex Sans\',system-ui,sans-serif;border:1px solid #3a4250;background:rgba(34,40,48,.72);' +
    'min-height:52px;text-align:center;line-height:1.15}' +
    '#tt-dock-panel a:hover{border-color:#8a9aab;background:rgba(110,130,148,.16);color:#e6e8ec}' +
    '#tt-dock-panel a.tt-active{color:#14181f;background:#6e8294;border-color:transparent}' +
    '#tt-dock-panel a .tt-ico{font-size:16px;line-height:1}' +
    '#tt-dock-panel a .tt-lbl{opacity:.95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}' +
    /* bară scurtă */
    '#tt-dock{display:flex;gap:3px;align-items:stretch;justify-content:center;flex-wrap:nowrap;' +
    'width:100%;overflow-x:auto;scrollbar-width:none;' +
    'background:linear-gradient(180deg,rgba(20,37,51,.97),rgba(11,15,23,.98));' +
    'border:1px solid #4a5874;border-radius:16px;padding:5px 6px;' +
    'box-shadow:0 8px 28px rgba(0,0,0,.45)}' +
    '#tt-dock::-webkit-scrollbar{display:none}' +
    '#tt-dock a,#tt-dock button.tt-more{flex:1 1 0;min-width:0;max-width:72px;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;gap:1px;padding:5px 4px;border-radius:10px;' +
    'text-decoration:none;color:#b4bac4;font-family:\'IBM Plex Sans\',system-ui,sans-serif;' +
    'font-size:9px;font-weight:500;line-height:1.15;border:1px solid transparent;background:transparent;cursor:pointer}' +
    '#tt-dock a:hover,#tt-dock button.tt-more:hover{color:#e6e8ec;background:rgba(110,130,148,.14);border-color:rgba(138,154,171,.28)}' +
    '#tt-dock a .tt-ico,#tt-dock button.tt-more .tt-ico{font-size:15px;line-height:1}' +
    '#tt-dock a .tt-lbl,#tt-dock button.tt-more .tt-lbl{letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}' +
    '#tt-dock a.tt-active{color:#14181f;background:#6e8294}' +
    '#tt-dock button.tt-more.tt-open{color:#c4b08a;border-color:rgba(138,154,171,.4);background:rgba(110,130,148,.16)}' +
    'body.tt-has-dock{padding-bottom:calc(72px + env(safe-area-inset-bottom,0px))!important}' +
    'body.tt-has-dock.tt-nav-open{padding-bottom:calc(min(58vh,420px) + 80px + env(safe-area-inset-bottom,0px))!important}' +
    'body.tt-has-dock .tt-fab,body.tt-has-dock .hub-fabs .tt-fab,body.tt-has-dock .hub-fabs{bottom:calc(76px + env(safe-area-inset-bottom,0px))!important}' +
    '#tt-dock-scrim{display:none;position:fixed;inset:0;z-index:2147483645;background:rgba(0,0,0,.35)}' +
    '#tt-dock-wrap.tt-open ~ #tt-dock-scrim,body.tt-nav-open #tt-dock-scrim{display:block}';
  document.head.appendChild(css);

  var scrim = document.createElement('div');
  scrim.id = 'tt-dock-scrim';
  scrim.setAttribute('aria-hidden', 'true');

  var wrap = document.createElement('div');
  wrap.id = 'tt-dock-wrap';

  // panel full
  var panel = document.createElement('div');
  panel.id = 'tt-dock-panel';
  panel.setAttribute('role', 'navigation');
  panel.setAttribute('aria-label', 'Toate tool-urile');
  panel.innerHTML = GROUPS.map(function (g) {
    return '<div class="tt-g"><div class="tt-gt">' + g.title + '</div><div class="tt-grid">' +
      g.items.map(function (p) {
        var act = p.u === activeU ? ' tt-active' : '';
        return '<a class="' + (act ? 'tt-active' : '') + '" href="' + root + p.u + '" data-u="' + p.u + '">' +
          '<span class="tt-ico" aria-hidden="true">' + p.e + '</span>' +
          '<span class="tt-lbl">' + p.n + '</span></a>';
      }).join('') + '</div></div>';
  }).join('');

  // bară quick
  var bar = document.createElement('nav');
  bar.id = 'tt-dock';
  bar.setAttribute('aria-label', 'Navigare rapidă suite');
  bar.innerHTML = QUICK.map(function (p) {
    var act = p.u === activeU ? ' tt-active' : '';
    return '<a class="' + (act ? 'tt-active' : '') + '" href="' + root + p.u + '" data-u="' + p.u + '" title="' + p.n + '">' +
      '<span class="tt-ico" aria-hidden="true">' + p.e + '</span>' +
      '<span class="tt-lbl">' + p.n + '</span></a>';
  }).join('') +
    '<button type="button" class="tt-more" id="ttDockMore" aria-expanded="false" aria-controls="tt-dock-panel" title="Toate tool-urile">' +
    '<span class="tt-ico" aria-hidden="true">▦</span><span class="tt-lbl">Toate</span></button>';

  wrap.appendChild(panel);
  wrap.appendChild(bar);
  document.body.appendChild(scrim);
  document.body.appendChild(wrap);
  document.body.classList.add('tt-has-dock');

  function setOpen(open) {
    wrap.classList.toggle('tt-open', open);
    document.body.classList.toggle('tt-nav-open', open);
    var btn = document.getElementById('ttDockMore');
    if (btn) {
      btn.classList.toggle('tt-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  }

  function paintActive(now) {
    wrap.querySelectorAll('a[data-u]').forEach(function (a) {
      a.classList.toggle('tt-active', a.getAttribute('data-u') === now);
    });
  }

  document.getElementById('ttDockMore').addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(!wrap.classList.contains('tt-open'));
  });
  scrim.addEventListener('click', function () { setOpen(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setOpen(false);
  });
  // la navigare din panou, închide (page unload or same-page hash)
  panel.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (a) setTimeout(function () { setOpen(false); }, 50);
  });

  window.addEventListener('hashchange', function () {
    paintActive(detectActive());
  });
})();
