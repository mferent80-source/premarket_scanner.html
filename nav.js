// Dock de comutare între paginile suite-ului — vizibil DOAR în PWA instalat (standalone).
// Un PWA e o singură fereastră (nu are tab-uri reale), așa că dock-ul oferă comutare rapidă;
// fiecare pagină își păstrează starea în localStorage, deci revenirea arată ce aveai.
// Include pe fiecare pagină: <script src="<root>nav.js" data-nav-root="<root>"></script>
//   - Hub (rădăcină):   data-nav-root="./"
//   - sub-pagini:       data-nav-root="../"
(function(){
  // Dacă pagina e încărcată ÎNTR-UN IFRAME = rulează în shell-ul cu taburi.
  // Nu desenăm dock-ul (shell-ul are propria navigare); în schimb, click pe un link
  // intern din pagină → cerem shell-ului să deschidă/comute tabul prin postMessage.
  if (window.self !== window.top){
    var SEGS = ['nasdaq-scanner/','watchlist-monitor/','market-events/','smart-trade-long/','pump-radar/',
                'earnings-hub/','sector-rotation/','macro-dashboard/','playbook/','alerts/','guide/'];
    var hrefToSeg = function(href){
      var abs; try { abs = new URL(href, location.href).pathname.replace(/index\.html$/, ''); } catch(_){ return null; }
      for (var i = 0; i < SEGS.length; i++){ if (abs.indexOf('/' + SEGS[i]) >= 0) return SEGS[i]; }
      return /\/$/.test(abs) ? '' : null; // se termină cu „/” fără segment cunoscut = Hub
    };
    document.addEventListener('click', function(e){
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (/^(https?:|mailto:|tel:|#|javascript:)/i.test(href)) return; // extern/ancoră → normal
      var seg = hrefToSeg(href);
      if (seg === null) return; // nu e pagină din suite → comportament normal
      e.preventDefault(); e.stopPropagation();
      try { parent.postMessage({ ttOpen: seg }, '*'); } catch(_){}
    }, true);
    return; // în iframe NU afișăm dock-ul
  }

  var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (!standalone) return; // în browser (top-level) ai tab-uri native — nu afișăm dock-ul

  var s = document.querySelector('script[data-nav-root]');
  var root = (s && s.getAttribute('data-nav-root')) || './';

  var PAGES = [
    { u:'',                   n:'Hub',      e:'🏠' },
    { u:'nasdaq-scanner/',    n:'Nasdaq',   e:'📈' },
    { u:'watchlist-monitor/', n:'Watch',    e:'👁️' },
    { u:'market-events/',     n:'Events',   e:'📊' },
    { u:'smart-trade-long/',  n:'Smart',    e:'🚀' },
    { u:'pump-radar/',        n:'Pump',     e:'🔥' },
    { u:'earnings-hub/',      n:'Earnings', e:'📅' },
    { u:'sector-rotation/',   n:'Sector',   e:'🔄' },
    { u:'macro-dashboard/',   n:'Macro',    e:'🌍' },
    { u:'playbook/',          n:'Playbook', e:'📓' },
    { u:'alerts/',            n:'Alerts',   e:'🔔' },
    { u:'guide/',             n:'Ghid',     e:'📖' }
  ];

  // pagina curentă = prima sub-pagină al cărei segment apare în path; altfel = Hub ('')
  var path = location.pathname;
  var activeU = '';
  for (var i = 1; i < PAGES.length; i++){
    if (path.indexOf('/' + PAGES[i].u) >= 0){ activeU = PAGES[i].u; break; }
  }

  var css = document.createElement('style');
  css.textContent =
    '#tt-dock{position:fixed;left:0;right:0;bottom:0;z-index:2147483646;display:flex;gap:2px;' +
    'justify-content:safe center;' + // centrat când încap; pe ecrane mici revine la stânga + scroll (fără să taie iconițe)
    'overflow-x:auto;background:rgba(11,15,23,.94);backdrop-filter:blur(10px);' +
    '-webkit-backdrop-filter:blur(10px);border-top:1px solid rgba(255,255,255,.10);' +
    'padding:5px 6px calc(5px + env(safe-area-inset-bottom,0px));scrollbar-width:none;' +
    '-webkit-overflow-scrolling:touch;box-shadow:0 -6px 20px rgba(0,0,0,.35)}' +
    '#tt-dock::-webkit-scrollbar{display:none}' +
    '#tt-dock a{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:2px;' +
    'min-width:54px;padding:5px 7px;border-radius:10px;text-decoration:none;color:#9aa4b2;' +
    'font-family:system-ui,-apple-system,sans-serif;font-size:9.5px;font-weight:600;transition:background .15s,color .15s}' +
    '#tt-dock a:hover{color:#e6edf3;background:rgba(255,255,255,.06)}' +
    '#tt-dock a .tt-ico{font-size:17px;line-height:1}' +
    '#tt-dock a .tt-lbl{letter-spacing:.02em;white-space:nowrap}' +
    '#tt-dock a.tt-active{color:#0b0f17;background:linear-gradient(135deg,#f7931a,#ffd86b)}';
  document.head.appendChild(css);

  var bar = document.createElement('nav');
  bar.id = 'tt-dock';
  bar.setAttribute('aria-label', 'Comutare pagini');
  bar.innerHTML = PAGES.map(function(p){
    var active = (p.u === activeU) ? ' tt-active' : '';
    return '<a class="' + (active ? 'tt-active' : '') + '" href="' + root + p.u + '">' +
           '<span class="tt-ico">' + p.e + '</span><span class="tt-lbl">' + p.n + '</span></a>';
  }).join('');
  document.body.appendChild(bar);

  // lasă loc dock-ului ca să nu acopere conținutul de jos
  document.body.style.paddingBottom = 'calc(62px + env(safe-area-inset-bottom,0px))';

  // adu pagina activă în vizor (scroll orizontal)
  var act = bar.querySelector('a.tt-active');
  if (act && act.scrollIntoView) { try { act.scrollIntoView({ inline:'center', block:'nearest' }); } catch(_){} }
})();
