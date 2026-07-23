// Suite bottom dock — navigare pe toate tool-urile, jos-centru, pe ORICE pagină.
// Include: <script src="<root>nav.js" data-nav-root="<root>"></script>
//   Hub: data-nav-root="./"   · sub-pagini: data-nav-root="../"
// În shell (iframe): fără dock — click pe link intern → postMessage către shell.
(function () {
  'use strict';

  var SEGS = [
    'nasdaq-scanner/', 'watchlist-monitor/', 'market-events/', 'smart-trade-long/', 'pump-radar/',
    'earnings-hub/', 'sector-rotation/', 'macro-dashboard/', 'markov-lab/', 'alerts/', 'guide/',
    'journal/', 'portfolio/', 'weekly/', 'health/', 'router/', 'equity/', 'shadow-book/', 'postmortem/',
    'hub-demo/', 'governor/'
  ];

  // ── iframe: fără dock, link-uri interne → shell ──
  if (window.self !== window.top) {
    var hrefToSeg = function (href) {
      var abs;
      try { abs = new URL(href, location.href).pathname.replace(/index\.html$/, ''); } catch (_) { return null; }
      for (var i = 0; i < SEGS.length; i++) {
        if (abs.indexOf('/' + SEGS[i]) >= 0) return SEGS[i];
      }
      if (/\/premarket_scanner\.html\/?$/.test(abs) || /\/$/.test(abs) && abs.indexOf('/journal') < 0) {
        // hub root rough
        if (abs.indexOf('/macro-dashboard') < 0 && abs.indexOf('/nasdaq') < 0) {
          try {
            var u = new URL(href, location.href);
            if (/premarket_scanner\.html\/?$/.test(u.pathname) || /premarket_scanner\.html\/index\.html$/.test(u.pathname))
              return '';
          } catch (_) {}
        }
      }
      return null;
    };
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (/^(https?:|mailto:|tel:|javascript:)/i.test(href) && href.indexOf(location.host) < 0 && !/^\.\.?\//.test(href) && href.charAt(0) !== '#') {
        // external absolute — leave; relative suite links continue
      }
      if (/^(mailto:|tel:|javascript:)/i.test(href)) return;
      if (href.charAt(0) === '#' && href.indexOf('/') < 0) return;
      var seg = hrefToSeg(href);
      if (seg === null && /^\.\.?\//.test(href)) {
        // try again with path segments
        for (var j = 0; j < SEGS.length; j++) {
          if (href.indexOf(SEGS[j]) >= 0) { seg = SEGS[j]; break; }
        }
        if (href === '../' || href === './' || /index\.html$/.test(href) && href.indexOf('/') <= 2) seg = '';
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

  // Toate tool-urile (ordine workflow: hub → plan → scan → exec → review)
  var PAGES = [
    { u: '', n: 'Hub', e: '🏠' },
    { u: 'router/', n: 'Router', e: '🧭' },
    { u: 'macro-dashboard/', n: 'Macro', e: '🌍' },
    { u: 'sector-rotation/', n: 'Sector', e: '🔄' },
    { u: 'nasdaq-scanner/', n: 'Nasdaq', e: '📈' },
    { u: 'smart-trade-long/', n: 'STL', e: '🚀' },
    { u: 'watchlist-monitor/', n: 'Watch', e: '👁' },
    { u: 'market-events/', n: 'Events', e: '📊' },
    { u: 'pump-radar/', n: 'Pump', e: '🔥' },
    { u: 'earnings-hub/', n: 'Earn', e: '📅' },
    { u: 'alerts/', n: 'Alerts', e: '🔔' },
    { u: 'journal/', n: 'Journal', e: '📓' },
    { u: 'journal/#desk', n: 'Desk', e: '🛑' },
    { u: 'journal/#portfolio', n: 'Port', e: '🛡' },
    { u: 'journal/#capital', n: 'Cap', e: '⚖' },
    { u: 'markov-lab/', n: 'Markov', e: '🔗' },
    { u: 'weekly/', n: 'Weekly', e: '🗓' },
    { u: 'postmortem/', n: 'PM', e: '🔬' },
    { u: 'shadow-book/', n: 'Shadow', e: '👻' },
    { u: 'health/', n: 'Health', e: '💚' },
    { u: 'guide/', n: 'Ghid', e: '📖' }
  ];

  function detectActive() {
    var path = location.pathname.replace(/index\.html$/, '');
    var hash = (location.hash || '').replace(/^#/, '');
    if (path.indexOf('/journal') >= 0) {
      if (hash === 'portfolio' || hash.indexOf('portfolio') === 0) return 'journal/#portfolio';
      if (hash === 'capital' || hash.indexOf('capital') === 0) return 'journal/#capital';
      if (hash === 'desk' || hash.indexOf('desk') === 0) return 'journal/#desk';
      return 'journal/';
    }
    for (var i = 1; i < PAGES.length; i++) {
      var u = PAGES[i].u;
      if (u.indexOf('#') >= 0) continue;
      if (u && path.indexOf('/' + u) >= 0) return u;
    }
    return '';
  }

  var activeU = detectActive();

  if (document.getElementById('tt-dock')) return;

  var css = document.createElement('style');
  css.id = 'tt-dock-css';
  css.textContent =
    '#tt-dock{position:fixed;left:50%;transform:translateX(-50%);' +
    'bottom:calc(8px + env(safe-area-inset-bottom,0px));z-index:2147483646;' +
    'display:flex;gap:2px;justify-content:flex-start;align-items:stretch;' +
    'max-width:min(980px,calc(100vw - 12px));width:max-content;max-width:min(980px,calc(100vw - 12px));' +
    'overflow-x:auto;overflow-y:hidden;' +
    'background:linear-gradient(180deg,rgba(20,37,51,.97),rgba(11,15,23,.98));' +
    'border:1px solid #4a5874;border-radius:16px;' +
    'padding:5px 6px;scrollbar-width:none;-webkit-overflow-scrolling:touch;' +
    'box-shadow:0 8px 28px rgba(0,0,0,.45),0 0 0 1px rgba(0,0,0,.2)}' +
    '#tt-dock::-webkit-scrollbar{display:none}' +
    '#tt-dock a{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;' +
    'min-width:48px;padding:4px 6px;border-radius:10px;text-decoration:none;color:#c8d0e0;' +
    'font-family:\'DM Mono\',ui-monospace,system-ui,sans-serif;font-size:9px;font-weight:700;' +
    'line-height:1.15;transition:background .12s,color .12s,border-color .12s;border:1px solid transparent}' +
    '#tt-dock a:hover{color:#fafbfc;background:rgba(138,200,255,.1);border-color:rgba(138,200,255,.25)}' +
    '#tt-dock a .tt-ico{font-size:15px;line-height:1}' +
    '#tt-dock a .tt-lbl{letter-spacing:.02em;white-space:nowrap;opacity:.92}' +
    '#tt-dock a.tt-active{color:#0b0f17;background:linear-gradient(135deg,#f7931a,#ffd86b);border-color:transparent}' +
    '#tt-dock a.tt-active .tt-lbl{opacity:1}' +
    'body.tt-has-dock{padding-bottom:calc(68px + env(safe-area-inset-bottom,0px))!important}' +
    /* FABs hub deasupra dock-ului */
    'body.tt-has-dock .tt-fab,body.tt-has-dock .hub-fabs .tt-fab,body.tt-has-dock .hub-fabs{bottom:calc(72px + env(safe-area-inset-bottom,0px))!important}' +
    '@media (max-width:480px){#tt-dock a{min-width:44px;padding:4px 5px;font-size:8.5px}#tt-dock a .tt-ico{font-size:14px}}';
  document.head.appendChild(css);

  var bar = document.createElement('nav');
  bar.id = 'tt-dock';
  bar.setAttribute('aria-label', 'Navigare tool-uri suite');
  bar.innerHTML = PAGES.map(function (p) {
    var active = p.u === activeU ? ' tt-active' : '';
    return '<a class="' + (active ? 'tt-active' : '') + '" href="' + root + p.u + '" title="' + p.n + '">' +
      '<span class="tt-ico" aria-hidden="true">' + p.e + '</span>' +
      '<span class="tt-lbl">' + p.n + '</span></a>';
  }).join('');
  document.body.appendChild(bar);
  document.body.classList.add('tt-has-dock');

  // scroll la item-ul activ
  var act = bar.querySelector('a.tt-active');
  if (act && act.scrollIntoView) {
    try { act.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (_) {}
  }

  // hash change pe journal → re-marchează activ
  window.addEventListener('hashchange', function () {
    var now = detectActive();
    bar.querySelectorAll('a').forEach(function (a, idx) {
      var u = PAGES[idx] && PAGES[idx].u;
      a.classList.toggle('tt-active', u === now);
    });
  });
})();
