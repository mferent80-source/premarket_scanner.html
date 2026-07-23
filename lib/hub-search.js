// hub-search.js — filtru live pe carduri hub (HSEARCH.*)
(function(global){
  'use strict';

  function init(){
    const input = document.getElementById('hubSearch');
    const clearBtn = document.getElementById('hubSearchClear');
    const wrap = document.getElementById('hubSearchWrap');
    const noResults = document.getElementById('hubNoResults');
    if (!input || input.dataset.bound) return;
    input.dataset.bound = '1';

    const cards = document.querySelectorAll('#hubCards .card, #hubCards .wf-grid .card');
    const searchableCards = Array.from(cards).map(card => {
      const heading = card.querySelector('.card-title')?.textContent || '';
      const desc = card.querySelector('.card-desc')?.textContent || '';
      const features = Array.from(card.querySelectorAll('.feat')).map(f => f.textContent).join(' ');
      return { el: card, text: (heading + ' ' + desc + ' ' + features).toLowerCase() };
    });

    function applySearch(){
      const q = input.value.trim().toLowerCase();
      if (wrap) wrap.classList.toggle('has-text', !!q);
      // catalog e pliat by default — la căutare îl deschidem ca rezultatele să fie vizibile
      const cat = document.getElementById('hubCatalogFold');
      const sfold = document.getElementById('hubSearchFold');
      if (q){
        if (cat) cat.open = true;
        if (sfold) sfold.open = true;
      }
      let visible = 0;
      for (const sc of searchableCards){
        const match = !q || sc.text.includes(q);
        sc.el.classList.toggle('hidden-by-search', !match);
        if (match) visible++;
      }
      if (noResults) noResults.classList.toggle('visible', q && visible === 0);
    }

    input.addEventListener('input', applySearch);
    if (clearBtn){
      clearBtn.addEventListener('click', () => {
        input.value = '';
        applySearch();
        input.focus();
      });
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape'){ input.value = ''; applySearch(); }
    });
  }

  global.HSEARCH = { init };
})(typeof window !== 'undefined' ? window : global);