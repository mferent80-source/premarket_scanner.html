/* 27.10.2026 (lotul A, I-747 / I-748 + contractele lotului 2): cardurile Health ale Decision App care DOAR CITESC:
   - proba de ecran după publicare (health/generated/proba-ecran.json, scris de .github/workflows/proba-ecran.yml);
   - reconcilierea aplicație ⇆ broker (tt_reconciliere_v1, scrisă de pagina contului după fiecare citire a brokerului);
   - oprirea de urgență (tt_governor_oprire_v1: OPRIT / armat; re-armarea se face DOAR din formularul Governor, cu motiv);
   - securitatea sincronizării (allowlist Google, sesiunile active, ultimul login — din TTCloud.state().security).
   Ce lipsește sau are altă formă se spune, nu trece drept verde. Orice text venit din date trece prin esc(). Pur: fără rețea, fără scrieri. */
(function (g) {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fin = Number.isFinite, F1 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const n1 = (v) => (fin(v) ? F1.format(v) : '—'), sec = (ms) => (fin(ms) ? F1.format(ms / 1000) + ' s' : '—');
  const when = (t) => { const x = typeof t === 'number' ? t : Date.parse(t); return fin(x) ? new Date(x).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; };
  const iso = (v) => typeof v === 'string' && fin(Date.parse(v));
  const sym = (t) => String(t || '').replace(/_[A-Z]{2}_EQ$/, '');
  const parse = (raw) => { if (raw == null) return { lipsa: true }; try { return { v: typeof raw === 'string' ? JSON.parse(raw) : raw }; } catch (_) { return { stricat: true }; } };
  const obj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  /** Ultima probă de ecran după publicare; `publicata` = versiunea din app/version.json (null dacă nu s-a putut citi). */
  function probaEcran(j, publicata, now = Date.now()) {
    if (!obj(j) || j.versiune !== 'proba-ecran-v1') return { cls: 'warn', html: '<b class="warn">Nicio probă de ecran automată publicată încă.</b> Robotul „Proba de ecran după publicare” (GitHub Actions) scrie rezultatul după prima publicare cu o versiune nouă; până atunci proba rămâne pas manual (node tools/proba-ecran-decizie.mjs).' };
    const verde = j.verdict === 'verde', n = Number.isInteger(j.nMotive) ? j.nMotive : (Array.isArray(j.motive) ? j.motive.length : 0);
    let cls = verde ? 'ok' : 'err';
    const lines = ['<b class="' + (verde ? 'ok' : 'err') + '">' + (verde ? 'VERDE' : 'ROȘU — ' + n + (n === 1 ? ' motiv' : ' motive')) + '</b> · versiunea probată ' + esc(j.versiunePublicata || '—') + (j.suitaPublicata ? ' · suita ' + esc(j.suitaPublicata) : '') + ' · ' + when(j.la) + ' · durata ' + sec(j.durataMs) + (j.browser ? ' · ' + esc(j.browser) : '') + (typeof j.rulare === 'string' && /^https:\/\//.test(j.rulare) ? ' · <a href="' + esc(j.rulare) + '" target="_blank" rel="noopener">jurnalul rulării</a>' : '')];
    if (publicata && j.versiunePublicata !== publicata) { if (cls === 'ok') cls = 'warn'; lines.push('<span class="warn">proba e pentru ' + esc(j.versiunePublicata || '—') + '; publicată acum ' + esc(publicata) + '</span> — proba versiunii noi rulează după publicare.'); }
    if (Array.isArray(j.pagini) && j.pagini.length) lines.push(j.pagini.map((p) => (p && p.ok ? '✓ ' : '✗ ') + esc(p && p.nume) + ' 1: ' + sec(p && p.continut1) + ' · 2: ' + sec(p && p.continut2)).join(' &nbsp; '));
    if (!verde && Array.isArray(j.motive)) for (const m of j.motive.slice(0, 5)) lines.push('<span class="err">✗</span> ' + esc(m));
    if (!verde && n > 5) lines.push('… încă ' + (n - 5) + ' în jurnalul rulării.');
    if (j.eroareProba) lines.push('<span class="err">Proba nu a putut rula:</span> ' + esc(j.eroareProba));
    if (fin(j.nAvertismente) && j.nAvertismente) lines.push(j.nAvertismente + (j.nAvertismente === 1 ? ' avertisment' : ' avertismente') + ' (nu fac roșu).');
    return { cls, html: lines.join('<br>') };
  }

  const VALOARE_RECON = (d) => obj(d) && ['pozitie', 'numerar', 'ordin'].includes(d.tip) && (d.ticker == null || typeof d.ticker === 'string') && (d.app == null || fin(d.app)) && (d.broker == null || fin(d.broker)) && (d.text == null || typeof d.text === 'string');
  /** tt_reconciliere_v1 (contractul cu lotul E): {la, scope, ok, diferente:[{tip, ticker, app, broker, text}]}. */
  function reconciliere(raw, now = Date.now()) {
    const p = parse(raw);
    if (p.lipsa) return { cls: 'warn', html: '<b class="warn">Nicio reconciliere notată pe acest aparat încă.</b> Pagina contului o scrie după fiecare citire a brokerului: pozițiile, numerarul și ordinele din copiile aplicației comparate cu Trading 212.' };
    const v = p.v;
    if (p.stricat || !obj(v) || !iso(v.la) || typeof v.ok !== 'boolean' || !Array.isArray(v.diferente) || !v.diferente.every(VALOARE_RECON)) return { cls: 'err', html: '<b class="err">Reconcilierea are o formă necunoscută</b> (tt_reconciliere_v1) — nu o pot verifica; Governor o tratează ca necitită.' };
    const vechi = now - Date.parse(v.la) > 86400000, tip = { pozitie: 'poziție', numerar: 'numerar', ordin: 'ordin' };
    if (v.ok && !v.diferente.length) return { cls: vechi ? 'warn' : 'ok', html: '<b class="' + (vechi ? 'warn' : 'ok') + '">Copiile aplicației = brokerul</b> · ' + when(v.la) + (vechi ? ' · <span class="warn">mai veche de 24 h</span> — deschide pagina contului pentru o citire nouă' : '') + '.' };
    const lines = ['<b class="err">Diferențe între aplicație și broker: ' + v.diferente.length + '</b> · ' + when(v.la) + (vechi ? ' · <span class="warn">mai veche de 24 h</span>' : '')];
    for (const d of v.diferente.slice(0, 8)) lines.push('• ' + esc(d.ticker ? sym(d.ticker) : tip[d.tip]) + ' · aplicație ' + n1(d.app) + ' · broker ' + n1(d.broker) + (d.text ? ' — ' + esc(d.text) : ''));
    if (v.diferente.length > 8) lines.push('… încă ' + (v.diferente.length - 8) + '.');
    lines.push('Governor și Risc & capital trec pe CAUTION cât timp există diferențe.');
    return { cls: 'err', html: lines.join('<br>') };
  }

  /** tt_governor_oprire_v1 (contractul cu loturile C / E). Doar citire: re-armarea se face din formularul Governor, cu motiv. */
  function oprire(raw) {
    const p = parse(raw);
    if (p.lipsa) return { cls: 'ok', html: 'Oprirea de urgență („Oprește tot”) nu a fost folosită pe acest cont — nicio stare notată.' };
    const v = p.v;
    if (p.stricat || !obj(v) || typeof v.activ !== 'boolean' || !iso(v.la) || typeof v.motiv !== 'string' || !Array.isArray(v.ordineAnulate) || !(v.rearmatLa == null || iso(v.rearmatLa))) return { cls: 'err', html: '<b class="err">Starea opririi are o formă necunoscută</b> (tt_governor_oprire_v1) — nu pot spune dacă e OPRIT; verifică în pagina contului și în Governor.' };
    const ord = v.ordineAnulate.filter(obj), lista = ord.slice(0, 8).map((o) => esc(sym(o.ticker) || o.id || '?') + (fin(o.stopPrice) ? ' @ ' + n1(o.stopPrice) : '')).join(', ');
    const anulate = ord.length + (ord.length === 1 ? ' ordin anulat' : ' ordine anulate') + (ord.length ? ': ' + lista + (ord.length > 8 ? ' …' : '') : '');
    if (v.activ) return { cls: 'err', html: '<b class="err">OPRIT</b> din ' + when(v.la) + (v.aparat ? ' pe ' + esc(v.aparat) : '') + ' · motiv: ' + esc(v.motiv || '—') + '<br>' + anulate + '.<br>Planurile noi sunt blocate (Governor HALTED). Re-armarea se face DOAR din formularul Governor, cu motiv scris.' };
    return { cls: 'ok', html: '<b class="ok">Armat</b>' + (v.rearmatLa ? ' · re-armat ' + when(v.rearmatLa) + (v.rearmatMotiv ? ' — ' + esc(v.rearmatMotiv) : '') : '') + ' · ultima oprire ' + when(v.la) + (v.motiv ? ' (' + esc(v.motiv) + ')' : '') + ' · ' + anulate + '.' };
  }

  /** Starea de securitate a sincronizării (I-748): allowlist-ul Google, sesiunile active, ultimul login. */
  function securitate(st) {
    if (!obj(st)) return { cls: null, html: '' };
    if (!st.setup) return { cls: 'warn', html: 'Securitatea serviciului: neverificată încă (serviciul de sincronizare nu a răspuns).' };
    const x = obj(st.security) ? st.security : {}, ok = x.allowlist === true;
    const parts = ['Allowlist Google: ' + (ok ? '<span class="ok">activ</span> (doar contul tău poate intra)' : '<span class="err">LIPSĂ</span> — orice cont Google poate folosi serviciul ca stocare; pune GOOGLE_ALLOWED_SUB în Cloudflare')];
    if (st.connected && Number.isInteger(x.sessions)) parts.push('Sesiuni active: ' + x.sessions);
    if (st.connected && fin(x.lastLogin) && x.lastLogin > 0) parts.push('ultimul login ' + when(x.lastLogin));
    return { cls: ok ? 'ok' : 'err', html: parts.join(' · ') };
  }

  g.TTHealthDecision = { probaEcran, reconciliere, oprire, securitate };
})(typeof window !== 'undefined' ? window : globalThis);
