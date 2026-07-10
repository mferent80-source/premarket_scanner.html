// journal-workspace.js — I-146..I-151: exec ledger, close sheet, badges, capital lite, ctx strip (JWS.*)
(function(global){
  'use strict';

  let deps = null;
  let execView = 'open';
  let execFilter = 'all';
  let closeTargetId = null;

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

  function bindExecSubtabs(){
    const host = $('execSubtabs');
    if (!host) return;
    host.querySelectorAll('[data-exec-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        execView = btn.dataset.execView === 'closed' ? 'closed' : 'open';
        host.querySelectorAll('[data-exec-view]').forEach(b => b.classList.toggle('active', b.dataset.execView === execView));
        const fl = $('execClosedFilters');
        if (fl) fl.style.display = execView === 'closed' ? '' : 'none';
        if (deps && deps.renderExecTable) deps.renderExecTable();
      });
    });
    const fl = $('execClosedFilters');
    if (fl) {
      fl.querySelectorAll('[data-exec-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
          execFilter = btn.dataset.execFilter || 'all';
          fl.querySelectorAll('[data-exec-filter]').forEach(b => b.classList.toggle('active', b.dataset.execFilter === execFilter));
          if (deps && deps.renderExecTable) deps.renderExecTable();
        });
      });
    }
  }

  function closedFilterOpts(){
    if (execFilter === 'today') return { today: true };
    if (execFilter === '7d') return { days: 7 };
    if (execFilter === 'stl' || execFilter === 'nasdaq' || execFilter === 'macro' || execFilter === 'manual') return { source: execFilter };
    return {};
  }

  function renderClosedTable(){
    const esc = deps.esc;
    const fmt$ = deps.fmt$;
    const JR = global.JR;
    const wrap = $('tblWrap');
    const panelTitle = $('openPanelTitle');
    if (panelTitle) panelTitle.textContent = '📋 Execuții închise';
    if ($('btnRefreshMarks')) $('btnRefreshMarks').style.display = 'none';
    if ($('openUnrealSum')) $('openUnrealSum').textContent = '';

    const rows = JR.listClosed ? JR.listClosed(closedFilterOpts()) : JR.closedOnly(JR.all());
    const limited = rows.slice(0, 80);
    if (!limited.length) {
      wrap.innerHTML = '<div class="empty">Nicio execuție închisă' + (execFilter !== 'all' ? ' pentru filtrul ales' : '') + '.</div>';
      return;
    }
    wrap.innerHTML = '<table><thead><tr><th class="l">Închis</th><th class="l">Ticker</th><th>PnL</th><th>R</th><th class="l">Sursă</th><th class="l">Regim</th><th class="l">Tags</th><th></th></tr></thead><tbody>' +
      limited.map(e => {
        const p = JR.pnl(e), r = JR.rMult(e);
        const pnlCls = p != null && p >= 0 ? 'pos' : 'neg';
        const rowCls = p != null ? (p >= 0 ? 'win' : 'loss') : '';
        return '<tr class="' + rowCls + '">' +
          '<td class="l">' + (e.closeTs ? new Date(e.closeTs).toLocaleDateString('ro-RO') : '—') + '</td>' +
          '<td class="sym l">' + esc(e.sym) + '</td>' +
          '<td class="' + pnlCls + '">' + (p != null ? (p >= 0 ? '+' : '') + fmt$(p).replace('$-', '-$') : '—') + '</td>' +
          '<td>' + (r != null ? (r >= 0 ? '+' : '') + r.toFixed(2) + 'R' : '—') + '</td>' +
          '<td class="l" style="font-size:10px">' + esc(e.source || '?') + '</td>' +
          '<td class="l" style="font-size:10px">' + esc(e.regime || '?') + '</td>' +
          '<td class="l">' + ((e.tags || []).map(t => '<span class="mini">' + esc(t) + '</span>').join('') || '—') + '</td>' +
          '<td class="l" style="white-space:nowrap">' +
            '<a class="act" href="../postmortem/?id=' + encodeURIComponent(e.id) + '" title="Post-mortem">🔬</a> ' +
            '<button class="act" data-edit="' + esc(e.id) + '">✏</button> ' +
            '<button class="act" data-del="' + esc(e.id) + '">🗑</button></td></tr>';
      }).join('') + '</tbody></table>' +
      (rows.length > 80 ? '<p class="note">+' + (rows.length - 80) + ' mai vechi — folosește filtre sau Scorecard pe Desk.</p>' : '');
    wrap.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
      const e = JR.all().find(x => x.id === b.dataset.edit);
      if (e && deps.fillForm) deps.fillForm(e);
    }));
    wrap.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      if (confirm('Șterg execuția din jurnal?')) {
        JR.remove(b.dataset.del);
        if (deps.renderAll) deps.renderAll();
      }
    }));
  }

  function renderOpenTable(){
    const esc = deps.esc;
    const fmt$ = deps.fmt$;
    const JR = global.JR;
    const isOpenE = deps.isOpenE;
    const closeE = deps.closeE;
    const openPriceCache = deps.openPriceCache || {};
    const wrap = $('tblWrap');
    const panelTitle = $('openPanelTitle');
    if (panelTitle) panelTitle.textContent = '⏳ Execuții în curs';
    if ($('btnRefreshMarks')) $('btnRefreshMarks').style.display = '';

    const entries = JR.all().filter(e => isOpenE(e)).sort((a, b) => (b.openTs || 0) - (a.openTs || 0));
    if (!entries.length) {
      const nAll = JR.all().length;
      wrap.innerHTML = nAll
        ? '<div class="empty">✅ Nicio execuție în curs.<br>Comută pe <b>Închise</b> sau vezi <b>Scorecard</b> pe tab Desk.</div>'
        : '<div class="empty">📭 Jurnal gol — adaugă execuție sau Sync tracker.</div>';
      if ($('openUnrealSum')) $('openUnrealSum').textContent = '';
      return;
    }
    let totalUnreal = 0, hasUnreal = false;
    wrap.innerHTML = '<table><thead><tr><th class="l">Stare</th><th class="l">Deschis</th><th class="l">Ticker</th><th>Dir</th><th>Entry</th><th>Mark</th><th>≈PnL</th><th>Size</th><th>SL</th><th class="l">Sursă</th><th class="l">Tags</th><th></th></tr></thead><tbody>' +
      entries.map(e => {
        const mk = JR.markPriceFor ? JR.markPriceFor(e, openPriceCache) : null;
        const unreal = mk && JR.unrealizedPnl ? JR.unrealizedPnl(e, mk.price) : null;
        if (unreal != null) { totalUnreal += unreal; hasUnreal = true; }
        const unrealCell = unreal != null
          ? '<span class="badge-unreal">' + (unreal >= 0 ? '+' : '') + fmt$(unreal).replace('$-', '-$') + '</span>' + (mk.manual ? '<span class="badge-mark">MARK</span>' : '')
          : '<span style="color:var(--t3)">—</span>';
        const markCell = mk ? fmt$(mk.price) + (mk.manual ? '<span class="badge-mark">M</span>' : '') : (e.markPrice ? fmt$(e.markPrice) : '—');
        return '<tr class="openrow">' +
          '<td class="l"><span class="badge-open">⏳ ÎN CURS</span><br><button class="act" data-close="' + esc(e.id) + '" style="margin-top:4px;font-weight:800;background:rgba(34,214,107,.15);border-color:var(--bull-s);color:var(--bull-s)">✓ ÎNCHIDE</button></td>' +
          '<td class="l">' + (e.openTs ? new Date(e.openTs).toLocaleDateString('ro-RO') : '—') + '</td>' +
          '<td class="sym l"><a href="#portfolio" data-jtab-link="portfolio" data-pf-sym="' + esc(e.sym) + '" style="color:var(--accent);text-decoration:none">' + esc(e.sym) + '</a></td>' +
          '<td>' + (e.dir === 'short' ? '🔻S' : '🔺L') + '</td>' +
          '<td>' + fmt$(e.entry) + '</td><td>' + markCell + '</td><td>' + unrealCell + '</td>' +
          '<td>' + e.size + '</td>' +
          '<td>' + (e.slAtEntry != null ? fmt$(e.slAtEntry) : '<span class="wrn">—⚠</span>') + '</td>' +
          '<td class="l" style="font-size:10px">' + esc(e.source) + '</td>' +
          '<td class="l">' + ((e.tags || []).map(t => '<span class="mini">' + esc(t) + '</span>').join('') || '—') + '</td>' +
          '<td><button class="act" data-edit="' + esc(e.id) + '">✏</button> <button class="act" data-mark="' + esc(e.id) + '">$</button> <button class="act" data-del="' + esc(e.id) + '">🗑</button></td></tr>';
      }).join('') + '</tbody></table>';
    if ($('openUnrealSum')) {
      $('openUnrealSum').textContent = hasUnreal ? 'PnL nerealizat total: ' + (totalUnreal >= 0 ? '+' : '') + fmt$(totalUnreal).replace('$-', '-$') : '';
    }
    wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => openCloseSheet(b.dataset.close)));
    wrap.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
      const e = JR.all().find(x => x.id === b.dataset.edit);
      if (e && deps.fillForm) deps.fillForm(e);
    }));
    wrap.querySelectorAll('[data-mark]').forEach(b => b.addEventListener('click', ev => {
      ev.stopPropagation();
      const e = JR.all().find(x => x.id === b.dataset.mark);
      if (!e) return;
      const v = prompt('Mark manual $ pentru ' + e.sym, e.markPrice != null ? String(e.markPrice) : '');
      if (v == null) return;
      JR.update(e.id, { markPrice: parseFloat(v) || null });
      if (deps.renderAll) deps.renderAll();
    }));
    wrap.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      if (confirm('Șterg execuția?')) {
        JR.remove(b.dataset.del);
        if (deps.renderAll) deps.renderAll();
      }
    }));
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
    closeTargetId = id;
    const sheet = $('jrCloseSheet');
    if (!sheet) {
      const v = prompt('Preț exit pentru ' + e.sym, suggestExit(e));
      if (v) legacyClose(id, v, e.fees || 0);
      return;
    }
    $('jrCloseSym').textContent = e.sym + ' · entry ' + deps.fmt$(e.entry) + (e.slAtEntry != null ? ' · SL ' + deps.fmt$(e.slAtEntry) : '');
    $('jrCloseExit').value = suggestExit(e);
    $('jrCloseFees').value = e.fees || 0;
    $('jrClosePreview').textContent = '—';
    $('jrCloseTagRow').innerHTML = (deps.TAGS || []).map(t =>
      '<span class="tagchip" data-close-tag="' + t + '">' + t + '</span>').join('');
    $('jrCloseTagRow').querySelectorAll('.tagchip').forEach(c => c.addEventListener('click', () => c.classList.toggle('on')));
    sheet.style.display = '';
    updateClosePreview();
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
    if (JR.close) JR.close(id, exit, null, fees);
    else deps.closeE(id, exit);
    JR.update(id, { tags: mergedTags, fees });
    closeCloseSheet();
    if (deps.renderAll) deps.renderAll();
  }

  function closeCloseSheet(){
    closeTargetId = null;
    const sheet = $('jrCloseSheet');
    if (sheet) sheet.style.display = 'none';
  }

  function bindCloseSheet(){
    const sheet = $('jrCloseSheet');
    if (!sheet) return;
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
    el.innerHTML =
      '<button type="button" class="jr-ctx-cell ' + verdictCls + '" data-jtab-link="desk" title="Risk Desk">' +
        '<span class="jr-ctx-lbl">Desk</span><span class="jr-ctx-val">' + verdict + '</span></button>' +
      '<button type="button" class="jr-ctx-cell ' + riskCls + '" data-jtab-link="portfolio" title="Risc agregat @ SL">' +
        '<span class="jr-ctx-lbl">Risc</span><span class="jr-ctx-val">' + (riskPct != null ? riskPct.toFixed(1) + '%' : '—') + (riskStale ? ' ⏳' : '') + '</span></button>' +
      '<button type="button" class="jr-ctx-cell" data-jtab-link="exec" title="Poziții open">' +
        '<span class="jr-ctx-lbl">Open</span><span class="jr-ctx-val">' + openN + '</span></button>' +
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

  function init(userDeps){
    deps = userDeps || {};
    if (!enabled()) return;
    document.body.classList.add('jr-ws-v2');
    bindExecSubtabs();
    bindCloseSheet();
    bindCapitalMode();
    bindRevert();
    document.querySelectorAll('[data-cap-mode]').forEach(b => b.classList.toggle('active', b.dataset.capMode === capMode()));
    applyCapitalMode();
  }

  global.JWS = {
    enabled, init, renderExecTable, renderContextStrip, updateTabBadges,
    renderCapitalLite, applyCapitalMode, setCapMode, disableWorkspaceV2,
    openCloseSheet, execView: () => execView
  };
})(typeof window !== 'undefined' ? window : global);