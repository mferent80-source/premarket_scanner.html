(function () {
  'use strict';
  var pending = null;
  var buttons = document.querySelectorAll('[data-install]');
  var help = document.getElementById('installHelp');
  function installed() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  }
  function render() { buttons.forEach(function (b) { b.hidden = installed(); }); }
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault(); pending = event; render();
  });
  window.addEventListener('appinstalled', function () {
    pending = null; buttons.forEach(function (b) { b.hidden = true; });
    if (help.open) help.close();
  });
  buttons.forEach(function (button) {
    button.addEventListener('click', async function () {
      var menu = document.getElementById('mobileMenu');
      if (menu.open) menu.close();
      if (!pending) { help.showModal(); return; }
      var prompt = pending; pending = null;
      try { await prompt.prompt(); await prompt.userChoice; }
      catch (_) { help.showModal(); }
      render();
    });
  });
  document.getElementById('closeInstallHelp').onclick = function () { help.close(); };
  help.addEventListener('click', function (event) { if (event.target === help) help.close(); });
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
      .catch(function (error) { console.warn('Instalare: service worker indisponibil', error.message); });
  }
  render();
})();
