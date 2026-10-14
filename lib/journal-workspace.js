// journal-workspace.js — I-146..I-151: exec ledger, close sheet, badges, capital lite, ctx strip (JWS.*)
(function(global){
  'use strict';

  let deps = null;
  let execView = 'open';
  let execFilter = 'all';
  let closeTargetId = null;
  let closeReturnFocus = null;

  function enabled(){
    if (!global.JR || !JR.getSettings) return false;
    return JR.getSettings().workspaceV2 !== false;
  }

  function capMode(){
    if (!global.JR || !JR.getSettings) return 'full';
    const m = JR.getSettings().capViewMode;
    return m === 'lite' ? 'lite' : 'full';
  }

  function setCapMode(mode){
    if (global.JR && JR.saveSettings) JR.saveSettings({ capViewMode: mode === 'lite' ? 'lite' : 'full' });
    applyCapitalMode();
    if (deps && deps.renderCapitalPanel) deps.renderCapitalPanel();
  }

  function disableWorkspaceV2(){
    if (global.JR && JR.saveSettings) JR.saveSettings({ workspaceV2: false });
    location.reload();
  }

  function $(id){ return deps && deps.$ ? deps.$(id) : document.getElementById(id); }

  function syncExecControls(){
    const host = $('execSubtabs');
    if (host) host.querySelectorAll('[data-exec-view]').forEach(b => {
      const active = b.dataset.execView === execView;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    const filters = $('execClosedFilters');
    if (filters) {
      filters.style.display = execView === 'closed' ? '' : 'none';
      filters.querySelectorAll('[data-exec-filter]').forEach(b => {
        const active = b.dataset.execFilter === execFilter;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
    }
  }

  function selectRequestedExecView(){
    const requested = (new URLSearchParams(location.search).get('symbol') || '').trim().toUpperCase();
    if (!requested || !global.JR || !deps.isOpenE) return false;
    const matches = global.JR.all().filter(e => String(e?.sym || '').toUpperCase() === requested);
    const closed = global.JR.closedOnly ? global.JR.closedOnly(matches) : matches.filter(e => e.exit != null);
    if (matches.some(e => deps.isOpenE(e)) || !closed.length) return false;
    execView = 'closed';
    return true;
  }

  function bindExecSubtabs(){
    const host = $('execSubtabs');
    if (!host) return;
    host.querySelectorAll('[data-exec-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        execView = btn.dataset.execView === 'closed' ? 'closed' : 'open';
        syncExecControls();
        if (enabled()) renderExecTable(); else renderLegacyOpen();
      });
    });
    const fl = $('execClosedFilters');
    if (fl) {
      fl.querySelectorAll('[data-exec-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
          execFilter = btn.dataset.execFilter || 'all';
          syncExecControls();
          if (enabled()) renderExecTable(); else renderLegacyOpen();
        });
      });
    }
    syncExecControls();
  }

  function closedFilterOpts(){
    if (execFilter === 'today') return { today: true };
    if (execFilter === '7d') return { days: 7 };
    if (execFilter === 'stl' || execFilter === 'nasdaq' || execFilter === 'macro' || execFilter === 'manual') return { source: execFilter };
    return {};
  }

  function executionQuery(){
    return ($('jrExecSearch') && $('jrExecSearch').value || '').trim().toUpperCase();
  }

  function filterExecutionRows(rows){
    const query = executionQuery();
    return query ? rows.filter(e => String(e.sym || '').toUpperCase().includes(query)) : rows;
  }

  function moneyText(v){
    return v != null ? (v >= 0 ? '+' : '') + deps.fmt$(v).replace('$-', '-$') : '—';
  }

  function executionActions(e, open){
    const esc = deps.esc;
    return '<button type="button" class="act" data-edit="' + esc(e.id) + '" aria-label="Editează execuția ' + esc(e.sym) + '">Editează</button> ' +
      (open ? '<button type="button" class="act" data-mark="' + esc(e.id) + '" aria-label="Preț manual pentru ' + esc(e.sym) + '">Preț manual</button> ' : '') +
      '<button type="button" class="act act-danger" data-del="' + esc(e.id) + '" aria-label="Șterge execuția ' + esc(e.sym) + '">Șterge</button>';
  }

  function closeAction(e){
    return '<button type="button" class="act exec-primary" data-close="' + deps.esc(e.id) + '" aria-label="Închide execuția ' + deps.esc(e.sym) + '">Închide execuția</button>';
  }

  function postmortemAction(e){
    return '<a class="act" href="../postmortem/?id=' + encodeURIComponent(e.id) + '" aria-label="Analiza execuției ' + deps.esc(e.sym) + '">Analizează</a>';
  }

  function tagsHtml(e){
    return (e.tags || []).map(t => '<span class="mini">' + deps.esc(t) + '</span>').join('') || '—';
  }

  function cardDetails(fields){
    return '<dl class="exec-card-fields">' + fields.map(f => '<div><dt>' + f[0] + '</dt><dd>' + f[1] + '</dd></div>').join('') + '</dl>';
  }

  function executionCard(e, open, pnl, fields, extraPnl){
    const esc = deps.esc;
    const ticker = open ? '<a href="#portfolio" data-jtab-link="portfolio" data-pf-sym="' + esc(e.sym) + '">' + esc(e.sym) + '</a>' : esc(e.sym);
    const pnlClass = pnl == null ? '' : pnl >= 0 ? 'pos' : 'neg';
    return '<article class="exec-card ' + (open ? 'openrow' : pnl == null ? '' : pnl >= 0 ? 'win' : 'loss') + '" role="listitem" data-execution-id="' + esc(e.id) + '">' +
      '<div class="exec-card-heading"><h3>' + ticker + '</h3><span class="exec-card-state">' + (open ? 'În curs' : 'Închisă') + ' · ' + (e.dir === 'short' ? 'SHORT' : 'LONG') + '</span></div>' +
      '<div class="exec-card-result"><span>' + (open ? 'PnL nerealizat · estimare' : 'PnL net realizat') + '</span><strong class="' + pnlClass + '">' + moneyText(pnl) + '</strong>' + (extraPnl || '') + '</div>' +
      '<div class="exec-card-primary">' + (open ? closeAction(e) : postmortemAction(e)) + '</div>' +
      '<details class="exec-card-details"><summary>Detalii și editare <span class="jr-sr-only">pentru ' + esc(e.sym) + '</span></summary>' +
      cardDetails(fields) + '<div class="exec-card-secondary">' + executionActions(e, open) + '</div></details></article>';
  }

  function bindExecutionActions(wrap){
    wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => openCloseSheet(b.dataset.close)));
    wrap.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
      const e = global.JR.all().find(x => x.id === b.dataset.edit);
      if (e && deps.fillForm) deps.fillForm(e);
    }));
    wrap.querySelectorAll('[data-mark]').forEach(b => b.addEventListener('click', ev => {
      ev.stopPropagation();
      const e = global.JR.all().find(x => x.id === b.dataset.mark);
      if (!e) return;
      const v = prompt('Mark manual pentru ' + e.sym, e.markPrice != null ? String(e.markPrice) : '');
      if (v == null) return;
      global.JR.update(e.id, { markPrice: parseFloat(v) || null });
      if (deps.renderAll) deps.renderAll();
    }));
    wrap.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      if (confirm('Șterg execuția din jurnal?')) {
        global.JR.remove(b.dataset.del);
        if (deps.renderAll) deps.renderAll();
      }
    }));
  }

  function renderClosedTable(){
    const esc = deps.esc, JR = global.JR, wrap = $('tblWrap');
    if ($('openPanelTitle')) $('openPanelTitle').textContent = 'Execuții închise';
    if ($('btnRefreshMarks')) $('btnRefreshMarks').style.display = 'none';
    if ($('openUnrealSum')) $('openUnrealSum').textContent = '';
    const rows = filterExecutionRows(JR.listClosed ? JR.listClosed(closedFilterOpts()) : JR.closedOnly(JR.all()));
    const limited = rows.slice(0, 80);
    if (!limited.length) {
      wrap.innerHTML = '<div class="empty">Nicio execuție închisă' + (execFilter !== 'all' || executionQuery() ? ' pentru filtrul ales' : '') + '.</div>';
      return;
    }
    const rendered = limited.map(e => {
      const p = JR.pnl(e), r = JR.rMult(e);
      const date = e.closeTs ? new Date(e.closeTs).toLocaleDateString('ro-RO') : '—';
      const rText = r != null ? (r >= 0 ? '+' : '') + r.toFixed(2) + 'R' : '—';
      const pnlCls = p == null ? '' : p >= 0 ? 'pos' : 'neg';
      const rowCls = p == null ? '' : p >= 0 ? 'win' : 'loss';
      const fields = [['Închis la', date], ['Intrare', JR.quotePrice(e, e.entry)], ['Ieșire', JR.quotePrice(e, e.exit)], ['Cantitate', esc(String(e.size))], ['Stop la intrare', e.slAtEntry != null ? JR.quotePrice(e, e.slAtEntry) : '—'], ['Comisioane USD', esc(deps.fmt$(e.fees || 0))], ['R-multiple', rText], ['Sursă', esc(e.source || '?')], ['Regim', esc(e.regime || '?')], ['Taguri', tagsHtml(e)], ['Note', esc(e.notes || '—')]];
      return {
        table: '<tr class="' + rowCls + '"><td class="sym l">' + esc(e.sym) + '</td><td class="l">' + date + '</td><td class="' + pnlCls + '">' + moneyText(p) + '</td><td>' + rText + '</td><td class="l">' + esc(e.source || '?') + '</td><td class="l">' + esc(e.regime || '?') + '</td><td class="l">' + tagsHtml(e) + '</td><td class="exec-table-actions">' + postmortemAction(e) + ' ' + executionActions(e, false) + '</td></tr>',
        card: executionCard(e, false, p, fields)
      };
    });
    wrap.innerHTML = '<div class="exec-desktop-table" role="region" aria-label="Tabel execuții închise" tabindex="0"><table class="exec-ledger"><thead><tr><th scope="col" class="l">Ticker</th><th scope="col" class="l">Închis</th><th scope="col">PnL</th><th scope="col">R</th><th scope="col" class="l">Sursă</th><th scope="col" class="l">Regim</th><th scope="col" class="l">Taguri</th><th scope="col">Acțiuni</th></tr></thead><tbody>' + rendered.map(r => r.table).join('') + '</tbody></table></div>' +
      '<div class="exec-mobile-cards" role="list" aria-label="Execuții închise">' + rendered.map(r => r.card).join('') + '</div>' +
      (rows.length > 80 ? '<p class="note">+' + (rows.length - 80) + ' mai vechi — folosește filtrele sau Scorecard în Risc & capital.</p>' : '');
    bindExecutionActions(wrap);
  }

  function renderOpenTable(){
    const esc = deps.esc, JR = global.JR, wrap = $('tblWrap');
    const openPriceCache = deps.openPriceCache || {};
    if ($('openPanelTitle')) $('openPanelTitle').textContent = 'Execuții în curs';
    if ($('btnRefreshMarks')) $('btnRefreshMarks').style.display = '';
    const entries = filterExecutionRows(JR.all().filter(e => deps.isOpenE(e)).sort((a, b) => (b.openTs || 0) - (a.openTs || 0)));
    if (!entries.length) {
      wrap.innerHTML = executionQuery() ? '<div class="empty">Nicio execuție în curs pentru tickerul căutat.</div>' : JR.all().length
        ? '<div class="empty">Nicio execuție în curs. Vezi Închise sau Scorecard în Risc & capital.</div>'
        : '<div class="empty">Jurnal gol. Adaugă prima execuție din formularul de mai jos sau sincronizează trackerul din Instrumente.</div>';
      if ($('openUnrealSum')) $('openUnrealSum').textContent = '';
      return;
    }
    let totalUnreal = 0, hasUnreal = false;
    const rendered = entries.map(e => {
      const mk = JR.markPriceFor ? JR.markPriceFor(e, openPriceCache) : null;
      const unreal = mk && JR.unrealizedPnl ? JR.unrealizedPnl(e, mk.price) : null;
      if (unreal != null) { totalUnreal += unreal; hasUnreal = true; }
      const manual = mk && mk.manual ? '<span class="badge-mark">Manual</span>' : '';
      const unrealCell = '<span class="' + (unreal == null ? '' : unreal >= 0 ? 'pos' : 'neg') + '">' + moneyText(unreal) + '</span>' + manual;
      const markCell = mk ? JR.quotePrice(e, mk.price) + manual : e.markPrice ? JR.quotePrice(e, e.markPrice) : '—';
      const date = e.openTs ? new Date(e.openTs).toLocaleDateString('ro-RO') : '—';
      const stopCell = e.slAtEntry != null ? JR.quotePrice(e, e.slAtEntry) : '<span class="wrn">Fără stop</span>';
      const fields = [['Deschis la', date], ['Intrare', JR.quotePrice(e, e.entry)], ['Preț curent', markCell], ['Cantitate', esc(String(e.size))], ['Stop la intrare', stopCell], ['Comisioane USD', esc(deps.fmt$(e.fees || 0))], ['Sursă', esc(e.source || '?')], ['Regim', esc(e.regime || '?')], ['Taguri', tagsHtml(e)], ['Note', esc(e.notes || '—')]];
      return {
        table: '<tr class="openrow"><td class="sym l"><a href="#portfolio" data-jtab-link="portfolio" data-pf-sym="' + esc(e.sym) + '">' + esc(e.sym) + '</a>' + (global.JI && JI.earningsBadgeHtml ? JI.earningsBadgeHtml(e.sym) : '') + '</td><td class="l"><span class="badge-open">În curs</span><br>' + closeAction(e) + '</td><td class="l">' + date + '</td><td>' + (e.dir === 'short' ? 'SHORT' : 'LONG') + '</td><td>' + JR.quotePrice(e, e.entry) + '</td><td>' + markCell + '</td><td>' + unrealCell + '</td><td>' + e.size + '</td><td>' + stopCell + '</td><td class="l">' + esc(e.source || '?') + '</td><td class="l">' + tagsHtml(e) + '</td><td class="exec-table-actions">' + executionActions(e, true) + '</td></tr>',
        card: executionCard(e, true, unreal, fields, manual)
      };
    });
    wrap.innerHTML = '<div class="exec-desktop-table" role="region" aria-label="Tabel execuții în curs" tabindex="0"><table class="exec-ledger"><thead><tr><th scope="col" class="l">Ticker</th><th scope="col" class="l">Stare</th><th scope="col" class="l">Deschis</th><th scope="col">Direcție</th><th scope="col">Intrare</th><th scope="col">Preț curent</th><th scope="col">≈PnL</th><th scope="col">Cantitate</th><th scope="col">Stop</th><th scope="col" class="l">Sursă</th><th scope="col" class="l">Taguri</th><th scope="col">Acțiuni</th></tr></thead><tbody>' + rendered.map(r => r.table).join('') + '</tbody></table></div>' +
      '<div class="exec-mobile-cards" role="list" aria-label="Execuții în curs">' + rendered.map(r => r.card).join('') + '</div>';
    if ($('openUnrealSum')) $('openUnrealSum').textContent = hasUnreal ? 'PnL nerealizat ' + (executionQuery() ? 'pentru filtrul ales' : 'total') + ': ' + moneyText(totalUnreal) : '';
    bindExecutionActions(wrap);
  }

  function renderLegacyOpen(){
    if (!deps) return false;
    if (execView === 'closed') renderClosedTable();
    else renderOpenTable();
    return true;
  }

  function renderExecTable(){
    if (!enabled()) return false;
    if (execView === 'closed') renderClosedTable();
    else renderOpenTable();
    return true;
  }

  function suggestExit(e){
    const JR = global.JR;
    const cache = deps.openPriceCache || {};
    const mk = JR.markPriceFor ? JR.markPriceFor(e, cache) : null;
    if (mk && mk.price > 0) return mk.price;
    if (e.markPrice > 0) return e.markPrice;
    return '';
  }

  function previewClosePnl(e, exit, fees){
    const JR = global.JR;
    const ex = parseFloat(exit);
    if (!isFinite(ex) || ex <= 0) return null;
    const tmp = Object.assign({}, e, { exit: ex, fees: parseFloat(fees) || 0, status: 'closed' });
    return JR.pnl(tmp);
  }

  function openCloseSheet(id){
    const JR = global.JR;
    const e = JR.all().find(x => x.id === id);
    if (!e) return;
    if (JR.quoteCurrency && JR.quoteCurrency(e) !== 'USD') { if (deps.fillForm) deps.fillForm(e); alert('Completează Exit și FX ieșire în formular, apoi salvează.'); return; }
    closeTargetId = id;
    closeReturnFocus = document.activeElement;
    const sheet = $('jrCloseSheet');
    if (!sheet) {
      const v = prompt('Preț exit pentru ' + e.sym, suggestExit(e));
      if (v) legacyClose(id, v, e.fees || 0);
      return;
    }
    $('jrCloseSym').textContent = e.sym + ' · entry ' + JR.quotePrice(e, e.entry) + (e.slAtEntry != null ? ' · SL ' + JR.quotePrice(e, e.slAtEntry) : '');
    $('jrCloseExit').value = suggestExit(e);
    $('jrCloseFees').value = e.fees || 0;
    $('jrClosePreview').textContent = '—';
    $('jrCloseTagRow').innerHTML = (deps.TAGS || []).map(t =>
      '<button type="button" class="tagchip' + ((e.tags || []).includes(t) ? ' on' : '') + '" aria-pressed="' + ((e.tags || []).includes(t) ? 'true' : 'false') + '" data-close-tag="' + deps.esc(t) + '">' + deps.esc(t) + '</button>').join('');
    $('jrCloseTagRow').querySelectorAll('.tagchip').forEach(c => c.addEventListener('click', () => { const on = c.classList.toggle('on'); c.setAttribute('aria-pressed', String(on)); }));
    if ($('jrCloseRuleOk')) $('jrCloseRuleOk').checked = e.ruleOk === true;
    if ($('jrCloseRepeat')) $('jrCloseRepeat').value = e.wouldRepeat || '';
    if (typeof sheet.showModal === 'function') { if (!sheet.open) sheet.showModal(); }
    else { sheet.setAttribute('open', ''); sheet.setAttribute('aria-modal', 'true'); }
    updateClosePreview();
    $('jrCloseExit').focus();
  }

  function updateClosePreview(){
    const JR = global.JR;
    const e = JR.all().find(x => x.id === closeTargetId);
    const prev = $('jrClosePreview');
    if (!e || !prev) return;
    const p = previewClosePnl(e, $('jrCloseExit').value, $('jrCloseFees').value);
    prev.textContent = p != null ? 'PnL net estimat: ' + (p >= 0 ? '+' : '') + deps.fmt$(p).replace('$-', '-$') : '—';
    prev.className = 'note ' + (p != null ? (p >= 0 ? 'pos' : 'neg') : '');
  }

  function legacyClose(id, v, fees){
    const JR = global.JR;
    const closeE = deps.closeE;
    if (JR.close) {
      if (!JR.close(id, v, null, fees)) { alert('Preț invalid.'); return; }
    } else if (!closeE(id, v)) { alert('Preț invalid.'); return; }
    else JR.update(id, { fees });
    if (deps.renderAll) deps.renderAll();
  }

  function confirmClose(){
    const JR = global.JR;
    const id = closeTargetId;
    const e = JR.all().find(x => x.id === id);
    if (!e) return;
    const exit = parseFloat($('jrCloseExit').value);
    const fees = parseFloat($('jrCloseFees').value) || 0;
    if (!isFinite(exit) || exit <= 0) { alert('Preț exit invalid'); return; }
    const tags = [...$('jrCloseTagRow').querySelectorAll('.tagchip.on')].map(c => c.dataset.closeTag);
    const mergedTags = Array.from(new Set([...(e.tags || []), ...tags]));
    const ruleOk = $('jrCloseRuleOk') ? !!$('jrCloseRuleOk').checked : null;
    const wouldRepeat = $('jrCloseRepeat') ? ($('jrCloseRepeat').value || null) : null;
    let closedOk = false;
    if (JR.close) closedOk = JR.close(id, exit, null, fees);
    else { deps.closeE(id, exit); closedOk = true; }
    if (!closedOk){ alert('Nu am putut închide execuția — verifică prețul exit.'); return; }
    JR.update(id, { tags: mergedTags, fees, ruleOk, wouldRepeat });
    closeCloseSheet();
    if (deps.renderAll) deps.renderAll();
    if ($('jrExecActionStatus')) $('jrExecActionStatus').textContent = 'Execuția ' + e.sym + ' a fost închisă. O găsești în Închise.';
    if ($('openPanelTitle')) $('openPanelTitle').focus();
  }

  function closeCloseSheet(){
    closeTargetId = null;
    const sheet = $('jrCloseSheet');
    if (sheet) {
      if (typeof sheet.close === 'function' && sheet.open) sheet.close();
      else sheet.removeAttribute('open');
    }
    restoreCloseFocus();
  }

  function restoreCloseFocus(){
    const target = closeReturnFocus;
    closeReturnFocus = null;
    if (target && target.isConnected !== false && typeof target.focus === 'function') target.focus();
  }

  function bindCloseSheet(){
    const sheet = $('jrCloseSheet');
    if (!sheet) return;
    sheet.addEventListener('cancel', ev => { ev.preventDefault(); closeCloseSheet(); });
    sheet.addEventListener('close', () => { closeTargetId = null; restoreCloseFocus(); });
    sheet.addEventListener('click', ev => {
      if (ev.target !== sheet || !sheet.getBoundingClientRect) return;
      const rect = sheet.getBoundingClientRect();
      if (ev.clientX < rect.left || ev.clientX > rect.right || ev.clientY < rect.top || ev.clientY > rect.bottom) closeCloseSheet();
    });
    $('jrCloseCancel') && $('jrCloseCancel').addEventListener('click', closeCloseSheet);
    $('jrCloseBackdrop') && $('jrCloseBackdrop').addEventListener('click', closeCloseSheet);
    $('jrCloseConfirm') && $('jrCloseConfirm').addEventListener('click', confirmClose);
    $('jrCloseRefresh') && $('jrCloseRefresh').addEventListener('click', async () => {
      if (deps.refreshMarks) await deps.refreshMarks();
      const e = global.JR.all().find(x => x.id === closeTargetId);
      if (e) $('jrCloseExit').value = suggestExit(e);
      updateClosePreview();
    });
    $('jrCloseExit') && $('jrCloseExit').addEventListener('input', updateClosePreview);
    $('jrCloseFees') && $('jrCloseFees').addEventListener('input', updateClosePreview);
  }

  function updateTabBadges(){
    if (!enabled()) return;
    const pfWarn = $('jrTabPfWarn');
    const capWarn = $('jrTabCapWarn');
    const deskWarn = $('jrTabDeskWarn');
    const execWarn = $('jrTabExecWarn');
    if (global.CD && CD.unified) {
      const b = CD.unified();
      const pf = b.portfolio || {};
      if (pfWarn) {
        const show = pf.count > 0 && ((pf.riskPct != null && pf.riskPct >= (CD.RISK_WARN_PCT || 2)) || pf.liveStale);
        pfWarn.style.display = show ? '' : 'none';
        pfWarn.title = pf.liveStale ? 'Risc stale — scan Portfolio' : (pf.riskPct != null ? pf.riskPct.toFixed(1) + '% risc' : '');
      }
    }
    if (global.GV && GV.status && deskWarn) {
      const st = GV.status();
      deskWarn.style.display = st.verdict === 'HALTED' ? '' : 'none';
      deskWarn.title = st.verdict === 'HALTED' ? 'Desk HALTED' : '';
    }
    if (global.EQ && EQ.drift && capWarn) {
      const drift = EQ.drift();
      capWarn.style.display = (drift.warn || drift.stale) ? '' : 'none';
    }
    if (execWarn && global.JR) {
      const open = JR.all().filter(e => deps.isOpenE(e));
      const noSl = open.filter(e => e.slAtEntry == null).length;
      execWarn.style.display = noSl > 0 ? '' : 'none';
      execWarn.title = noSl ? noSl + ' open fără SL' : '';
    }
  }

  function fmtUsd0(v){
    return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function renderContextStrip(){
    const el = $('jrCtxStrip');
    if (!el || !enabled()) { if (el) el.innerHTML = ''; return; }
    const tab = (location.hash || '').replace('#', '').split('&')[0];
    if (tab === 'setup' && global.SB && SB.getCtxStripHtml) {
      el.innerHTML = SB.getCtxStripHtml();
      el.querySelectorAll('[data-jtab-link]').forEach(a => a.addEventListener('click', ev => {
        ev.preventDefault();
        if (global.setJTab) setJTab(a.dataset.jtabLink);
      }));
      return;
    }
    let verdict = '—', verdictCls = '', riskPct = null, riskStale = false, openN = 0, driftPct = null, driftWarn = false;
    if (global.GV && GV.status) {
      const st = GV.status();
      const lb = GV.labelOf ? GV.labelOf(st.verdict) : { text: st.verdict };
      verdict = lb.text || st.verdict;
      verdictCls = st.verdict === 'HALTED' ? 'neg' : st.verdict === 'CAUTION' ? 'wrn' : 'pos';
    }
    if (global.CD && CD.unified) {
      const pf = CD.unified().portfolio || {};
      riskPct = pf.riskPct;
      riskStale = !!pf.liveStale;
      openN = pf.count || 0;
    }
    if (global.JR) openN = JR.all().filter(e => deps.isOpenE(e)).length;
    if (global.EQ && EQ.drift) {
      const d = EQ.drift();
      driftPct = d.driftPct;
      driftWarn = d.warn || d.stale;
    }
    const riskCls = riskPct != null && riskPct >= (CD.RISK_HALT_PCT || 4) ? 'neg' : riskPct != null && riskPct >= (CD.RISK_WARN_PCT || 2) ? 'wrn' : '';
    let rWeek = '—', rCls = '';
    if (global.JI && JI.weekRStats) {
      const wr = JI.weekRStats();
      if (wr.n > 0 && wr.netR != null) {
        rWeek = (wr.netR >= 0 ? '+' : '') + wr.netR.toFixed(1) + 'R';
        rCls = wr.lossR >= wr.budgetR ? 'neg' : wr.lossR >= wr.budgetR * 0.6 ? 'wrn' : '';
      } else rWeek = '0R';
      if (wr.weekBudgetPct != null && wr.weekBudgetPct >= 75) rCls = rCls || 'wrn';
    }
    el.innerHTML =
      '<button type="button" class="jr-ctx-cell ' + verdictCls + '" data-jtab-link="desk" title="Risk Desk">' +
        '<span class="jr-ctx-lbl">Risc & capital</span><span class="jr-ctx-val">' + verdict + '</span></button>' +
      '<button type="button" class="jr-ctx-cell ' + riskCls + '" data-jtab-link="portfolio" title="Risc agregat @ SL">' +
        '<span class="jr-ctx-lbl">Risc</span><span class="jr-ctx-val">' + (riskPct != null ? riskPct.toFixed(1) + '%' : '—') + (riskStale ? ' ⏳' : '') + '</span></button>' +
      '<button type="button" class="jr-ctx-cell" data-jtab-link="exec" title="Poziții open">' +
        '<span class="jr-ctx-lbl">În curs</span><span class="jr-ctx-val">' + openN + '</span></button>' +
      '<button type="button" class="jr-ctx-cell ' + rCls + '" data-jtab-link="desk" title="R realizat săptămâna asta (închise cu SL)">' +
        '<span class="jr-ctx-lbl">R săpt</span><span class="jr-ctx-val">' + rWeek + '</span></button>' +
      '<button type="button" class="jr-ctx-cell ' + (driftWarn ? 'wrn' : '') + '" data-jtab-link="capital" title="Drift Sim vs Snap">' +
        '<span class="jr-ctx-lbl">Drift</span><span class="jr-ctx-val">' + (driftPct != null ? (driftPct >= 0 ? '+' : '') + driftPct.toFixed(1) + '%' : '—') + '</span></button>';
    el.querySelectorAll('[data-jtab-link]').forEach(a => a.addEventListener('click', ev => {
      ev.preventDefault();
      if (global.setJTab) setJTab(a.dataset.jtabLink);
    }));
  }

  function applyCapitalMode(){
    if (!enabled()) return;
    const lite = $('capLitePanel');
    const full = $('capFullPanel');
    const mode = capMode();
    if (lite) lite.style.display = mode === 'lite' ? '' : 'none';
    if (full) full.style.display = mode === 'lite' ? 'none' : '';
    document.querySelectorAll('[data-cap-mode]').forEach(b => b.classList.toggle('active', b.dataset.capMode === mode));
  }

  function renderCapitalLite(){
    const el = $('capLiteHero');
    if (!el || !global.EQ) return;
    const drift = EQ.drift();
    const dd = EQ.drawdownStats();
    const unreal = deps.calcUnrealizedTotal ? deps.calcUnrealizedTotal() : { tot: 0, n: 0 };
    el.innerHTML = [
      { l: 'SIMULAT', v: fmtUsd0(dd.current) },
      { l: 'SNAPSHOT', v: drift.snapshot ? fmtUsd0(drift.snapshot.equity) : '—', c: drift.stale ? 'wrn' : '' },
      { l: 'DRIFT', v: drift.driftPct != null ? (drift.driftPct >= 0 ? '+' : '') + drift.driftPct.toFixed(1) + '%' : '—', c: drift.warn ? 'wrn' : 'pos' },
      { l: 'ESTIMAT', v: fmtUsd0(dd.current + unreal.tot), c: 'accent' }
    ].map(x => '<div class="scard"><div class="lbl">' + x.l + '</div><div class="val' + (x.c ? ' ' + x.c : '') + '">' + x.v + '</div></div>').join('');
    const hint = $('capLiteHint');
    if (hint) {
      hint.textContent = drift.snapshot
        ? 'Snapshot ' + drift.snapshot.day + (drift.stale ? ' · vechi ' + drift.snapshotAgeDays + 'z' : '') + ' — mod Lite'
        : 'Fără snapshot — adaugă total Trade212 mai jos';
    }
  }

  function bindCapitalMode(){
    document.querySelectorAll('[data-cap-mode]').forEach(b => {
      b.addEventListener('click', () => setCapMode(b.dataset.capMode));
    });
    $('btnCapExpand') && $('btnCapExpand').addEventListener('click', () => setCapMode('full'));
  }

  function bindRevert(){
    $('btnWsRevert') && $('btnWsRevert').addEventListener('click', () => {
      if (confirm('Revii la UI Journal clasic (v581)? Pagina se reîncarcă.')) disableWorkspaceV2();
    });
  }

  function bindWorkspaceTools(){
    if (global.parent && global.parent !== global) document.body.classList.add('jr-embedded');
    const tools = $('jrTools');
    if (tools) {
      tools.querySelectorAll('button,a').forEach(b => b.addEventListener('click', () => { tools.open = false; }));
      tools.addEventListener('keydown', ev => { if (ev.key === 'Escape') { tools.open = false; tools.querySelector('summary').focus(); } });
    }
    const search = $('jrExecSearch');
    if (search) {
      const query = new URLSearchParams(location.search);
      search.value = query.get('symbol') || query.get('q') || '';
      search.addEventListener('input', () => enabled() ? renderExecTable() : renderLegacyOpen());
    }
  }

  function init(userDeps){
    deps = userDeps || {};
    deps.renderExecTable = renderExecTable;
    bindWorkspaceTools();
    bindCloseSheet();
    const linkedClosed = selectRequestedExecView();
    const sub = $('execSubtabs');
    const fl = $('execClosedFilters');
    if (!enabled()) {
      if (sub) sub.style.display = linkedClosed ? '' : 'none';
      if (fl) fl.style.display = linkedClosed ? '' : 'none';
      if (linkedClosed) bindExecSubtabs();
      return;
    }
    document.body.classList.add('jr-ws-v2');
    bindExecSubtabs();
    bindCapitalMode();
    bindRevert();
    document.querySelectorAll('[data-cap-mode]').forEach(b => b.classList.toggle('active', b.dataset.capMode === capMode()));
    applyCapitalMode();
  }

  global.JWS = {
    enabled, init, renderExecTable, renderLegacyOpen, renderContextStrip, updateTabBadges,
    renderCapitalLite, applyCapitalMode, setCapMode, disableWorkspaceV2,
    openCloseSheet, execView: () => execView
  };
})(typeof window !== 'undefined' ? window : global);
