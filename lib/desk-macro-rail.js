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
    // MCTX, nu MC — rename-ul 7dfa48b a mutat regimeColor/regimeEmoji din MC
    // in MCTX; global.MC e acum morning-check (fara aceste functii / absent
    // pe Journal) -> TypeError la regimeColor
    const MC = global.MCTX;
    const parts = [];
    if (reg.label && !reg.stale){
      const streak = reg.streak >= 2 ? ` <span class="dmr-muted">(ziua ${reg.streak})</span>` : '';
      parts.push(`<span class="dmr-chip reg" style="--dmr-c:${MC.regimeColor(reg.label)}">${MC.regimeEmoji(reg.label)} ${esc(reg.label)}${streak}</span>`);
    } else {
      parts.push('<span class="dmr-chip na">⚪ Regim neverificat</span>');
    }
    if (dng.score != null && !dng.stale){
      parts.push(`<span class="dmr-chip dng" style="--dmr-c:${dng.color}">⚠️ ${dng.score}/100 · ${esc(dng.band)}</span>`);
    } else if (dng.score != null && dng.stale){
      parts.push(`<span class="dmr-chip dng stale">⚠️ ${dng.score}/100 · 📦 ${esc(dng.dateET || 'stale')}</span>`);
    } else {
      parts.push('<span class="dmr-chip na">⚠️ Danger neverificat</span>');
    }
    if (tone){
      const cls = tone.cls === 'up' ? 'pos' : tone.cls === 'down' ? 'neg' : '';
      parts.push(`<span class="dmr-chip mkt ${cls}">${esc(tone.tone)}</span>`);
    }
    return `<div class="dmr-bar">${parts.join('')}</div>`;
  }

  // 18.10.2026 (revizia Jurnalului): pagina Macro e retrasă din 12.10 (regimul e în Crypto Radar), deci regimul și Danger nu mai vin aici.
  // Lipsa lor NU e „nicio restricție”: panoul o spune și arată verdictul pieței de azi (robotul zilnic, generated/verdict-piata.json).
  function renderAction(act, faraDate){
    if (!act.phrases.length && faraDate){
      return '<p class="dmr-note">Regimul macro și Danger Score nu mai vin aici (pagina Macro e retrasă din 12.10). Asta NU înseamnă „nicio restricție” — vezi verdictul pieței de mai sus; Governor rămâne sursa de halt.</p>';
    }
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

  const VERDICT_URL = '../candidate-engine/generated/verdict-piata.json', VERDICT_ETICHETA = { favorabil: 'FAVORABIL', neutru: 'NEUTRU', prudent: 'PRUDENT', defensiv: 'DEFENSIV' };
  function verdictHtml(v, now){
    if (!v || typeof v !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(String(v.asOf || ''))) return '<p class="dmr-note" data-dmr-verdict>Verdictul pieței nu s-a putut citi — fără context de piață azi (nu înseamnă „nicio restricție”).</p>';
    const zile = Math.round((now - Date.parse(v.asOf + 'T21:00:00Z')) / 86400000), vechi = zile > 4;
    const et = VERDICT_ETICHETA[v.label] || String(v.label || '—').toUpperCase(), scor = Number.isFinite(Number(v.score)) ? ' (' + (v.score > 0 ? '+' : v.score < 0 ? '−' : '') + Math.abs(v.score) + ')' : '';
    return '<div class="dmr-verdict" data-dmr-verdict><span class="dmr-chip reg">📊 Verdictul pieței: ' + esc(et) + esc(scor) + ' · EOD ' + esc(v.asOf.split('-').reverse().join('.')) + (vechi ? ' · VECHI' : '') + '</span>'
      + (v.fraza ? '<p class="dmr-action">' + esc(v.fraza) + '</p>' : '') + '<p class="dmr-note">Regula (I-727): favorabil / neutru ×1, prudent ×0,75, defensiv fără plan nou; vechi sau lipsă ×0,75 fără GO. Governor decide TRADE / CAUTION / HALTED. <a href="../today/">Verdictul complet pe Astăzi →</a></p></div>';
  }
  async function incarcaVerdict(host){
    let v = null;
    try { const r = await fetch(VERDICT_URL + '?x=' + Date.now(), { cache: 'no-store' }); if (r && r.ok) v = await r.json(); } catch (e) { v = null; }
    const slot = host.querySelector('[data-dmr-verdict-slot]'); if (slot) slot.innerHTML = verdictHtml(v, Date.now());
  }

  function render(){
    const host = $('deskMacroRail');
    if (!host) return;
    if (!global.MCTX){
      host.innerHTML = '<p class="dmr-note">Modul macro indisponibil.</p>';
      return;
    }
    const MC = global.MCTX;
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
        </div>
      </div>
      ${renderBar(reg, dng, tone)}
      <div data-dmr-verdict-slot><p class="dmr-note">Citesc verdictul pieței…</p></div>
      <details class="dmr-panel" open>
        <summary>Acțiune azi</summary>
        <div class="dmr-body">${renderAction(act, !(reg.label && !reg.stale) && !(dng.score != null && !dng.stale))}</div>
      </details>
      <details class="dmr-panel">
        <summary>Calendar <span class="dmr-count">${events.length}</span></summary>
        <div class="dmr-body">${renderCalendar(events)}</div>
      </details>`;

    if (typeof fetch === 'function') incarcaVerdict(host);
    const btn = $('btnMacroRefresh');
    if (btn && !btn._dmrBound){
      btn._dmrBound = true;
      btn.addEventListener('click', () => render());
    }
  }

  global.DMR = { render, verdictHtml };
})(typeof window !== 'undefined' ? window : global);