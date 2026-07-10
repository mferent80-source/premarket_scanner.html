// desk-macro-rail.js — Macro Rail pe Journal → Desk (DMR.render)
(function(global){
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function tilStr(tilMs){
    if (tilMs < 0) return 'PUBLICAT';
    if (tilMs < 3600000) return 'T-' + Math.round(tilMs / 60000) + 'min';
    return 'T-' + Math.round(tilMs / 3600000) + 'h';
  }

  function renderBar(reg, dng, tone){
    const MC = global.MC;
    const parts = [];
    if (reg.label && !reg.stale){
      const streak = reg.streak >= 2 ? ` <span class="dmr-muted">(ziua ${reg.streak})</span>` : '';
      parts.push(`<span class="dmr-chip reg" style="--dmr-c:${MC.regimeColor(reg.label)}">${MC.regimeEmoji(reg.label)} ${esc(reg.label)}${streak}</span>`);
    } else {
      parts.push('<span class="dmr-chip na">⚪ Regim n/a — <a href="../macro-dashboard/">Macro →</a></span>');
    }
    if (dng.score != null && !dng.stale){
      parts.push(`<span class="dmr-chip dng" style="--dmr-c:${dng.color}">⚠️ ${dng.score}/100 · ${esc(dng.band)}</span>`);
    } else if (dng.score != null && dng.stale){
      parts.push(`<span class="dmr-chip dng stale">⚠️ ${dng.score}/100 · 📦 ${esc(dng.dateET || 'stale')}</span>`);
    } else {
      parts.push('<span class="dmr-chip na">⚠️ Danger n/a — <a href="../macro-dashboard/">Macro →</a></span>');
    }
    if (tone){
      const cls = tone.cls === 'up' ? 'pos' : tone.cls === 'down' ? 'neg' : '';
      parts.push(`<span class="dmr-chip mkt ${cls}">${esc(tone.tone)}</span>`);
    }
    return `<div class="dmr-bar">${parts.join('')}</div>`;
  }

  function renderAction(act){
    if (!act.phrases.length){
      return '<p class="dmr-note">Nicio restricție macro acționabilă azi — sizing la discreția ta (Governor rămâne sursa de halt).</p>';
    }
    return `<p class="dmr-action">→ AZI: <strong>${esc(act.phrases.join(' · '))}</strong></p>`
      + '<p class="dmr-note">Informativ — nu blochează execuțiile. Governor decide TRADE/HALT.</p>';
  }

  function renderCalendar(events){
    if (!events.length){
      return '<p class="dmr-note">📭 Niciun eveniment US recurent în următoarele 24h.</p>';
    }
    const rows = events.map(e => {
      const imm = e.tilMs < 3600000 && e.tilMs > 0;
      return `<tr>
        <td class="dmr-time${imm ? ' imm' : ''}">${esc(e.hm)} ET (${esc(e.roTime)} RO)<br><span class="dmr-til">${tilStr(e.tilMs)}</span></td>
        <td>${esc(e.event)}</td>
        <td><span class="dmr-impact ${e.impact === 'high' ? 'hi' : 'med'}">${e.impact === 'high' ? '🔴 HIGH' : '🟡 MED'}</span></td>
      </tr>`;
    }).join('');
    return `<table class="dmr-cal"><thead><tr><th>Ora</th><th>Eveniment</th><th>Impact</th></tr></thead><tbody>${rows}</tbody></table>`
      + '<p class="dmr-foot">NFP/CPI/FOMC = date oficiale 2026 · PPI/claims/retail/ISM = estimative</p>';
  }

  function render(){
    const host = $('deskMacroRail');
    if (!host) return;
    if (!global.MC){
      host.innerHTML = '<p class="dmr-note">Modul macro indisponibil.</p>';
      return;
    }
    const MC = global.MC;
    const reg = MC.regime();
    const dng = MC.danger();
    const tone = MC.marketTone();
    const act = MC.actionLine();
    const events = MC.eventsUpcoming({ limit: 3 });

    host.innerHTML = `
      <div class="dmr-head">
        <h2>🌍 Macro context</h2>
        <div class="dmr-btns">
          <button type="button" class="btn ghost" id="btnMacroRefresh" title="Reîmprospătează din cache">↻</button>
          <a class="btn ghost" href="../macro-dashboard/" target="ttools-macro" rel="noopener">Macro →</a>
        </div>
      </div>
      ${renderBar(reg, dng, tone)}
      <details class="dmr-panel" open>
        <summary>Acțiune azi</summary>
        <div class="dmr-body">${renderAction(act)}</div>
      </details>
      <details class="dmr-panel">
        <summary>Calendar <span class="dmr-count">${events.length}</span></summary>
        <div class="dmr-body">${renderCalendar(events)}</div>
      </details>`;

    const btn = $('btnMacroRefresh');
    if (btn && !btn._dmrBound){
      btn._dmrBound = true;
      btn.addEventListener('click', () => render());
    }
  }

  global.DMR = { render };
})(typeof window !== 'undefined' ? window : global);