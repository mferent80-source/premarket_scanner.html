/* 18.10.2026 (el: „mai departe?” → „poți face”): Mișcări de capital se completează singur din Trading 212.
   O dată pe zi (ziua New York a citirii), valoarea contului din instantaneul T212 (summary.totalValue) devine un snapshot în registrul
   de capital, convertit în USD la cursul BCE verificat (registrul și jurnalul manual sunt în USD). Fără cont conectat, dintr-o citire mai
   veche de 24 de ore sau fără curs verificat: nimic salvat, motivul la vedere. Un snapshot pus de mână în aceeași zi are prioritate. */
(function (g) {
  'use strict';
  const NOTE = 'Trading 212 automat';
  const nyDay = (t) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t)); } catch (_) { return new Date(t).toISOString().slice(0, 10); } };
  async function run(deps) {
    const { EQ, ACCT, T212Snapshot, Finance } = deps || {};
    if (!EQ || !T212Snapshot) return { status: 'none', detail: 'Modulele contului nu s-au încărcat.' };
    let a = null; try { a = T212Snapshot.read('live')?.[1] || null; } catch (_) { a = null; }
    const total = Number(a?.summary?.totalValue), cur = String(a?.summary?.currency || ''), at = Date.parse(a?.fetchedAt);
    if (!a || !(total > 0) || !/^[A-Z]{3}$/.test(cur) || !Number.isFinite(at)) return { status: 'none', detail: 'Trading 212 nu are o valoare a contului sincronizată.' };
    if (Date.now() - at > 24 * 3600000) return { status: 'stale', detail: 'Ultima citire Trading 212 are peste 24 de ore; snapshot-ul automat așteaptă o citire nouă.' };
    const day = nyDay(at);
    // 19.10.2026 (I-700): cursul se verifică la fiecare citire nouă (nu doar o dată pe zi) și rămâne pe aparat (ACCT.saveBrokerFx),
    // ca Drafturile, Planurile și Governorul să folosească valoarea din Trading 212 în USD chiar dacă snapshot-ul zilei există deja.
    const exista = (EQ.snapshots() || []).some((s) => s && s.day === day);
    let rate = 1, date = null;
    if (cur !== 'USD') {
      try { const c = Finance.conversion(await Finance.loadRates(), cur, 'USD'); rate = c.rate; date = c.date; }
      catch (e) { if (exista) return { status: 'today', detail: 'Snapshot-ul zilei ' + day + ' există deja.' }; return { status: 'fx', detail: (e && e.message) || 'Cursul nu poate fi verificat.' }; }
    }
    if (ACCT && typeof ACCT.saveBrokerFx === 'function') ACCT.saveBrokerFx(cur, rate, date);
    if (exista) return { status: 'today', detail: 'Snapshot-ul zilei ' + day + ' există deja.' };
    const usd = Math.round(total * rate * 100) / 100;
    const note = NOTE + ' · ' + total + ' ' + cur + (cur !== 'USD' ? ' × ' + rate.toFixed(4) + ' (BCE ' + date + ')' : '');
    const rec = EQ.addSnapshot(usd, note, { ts: Math.min(at, Date.now()) });
    if (!rec) return { status: 'none', detail: 'Snapshot-ul nu a putut fi salvat local.' };
    if (ACCT && typeof ACCT.syncAll === 'function') ACCT.syncAll(rec.equity, 'snapshot');
    return { status: 'saved', rec, detail: 'Snapshot automat ' + day + ': $' + usd.toLocaleString('en-US') + ' (' + total + ' ' + cur + ').' };
  }
  g.CapitalAuto = { run, NOTE };
})(typeof window !== 'undefined' ? window : globalThis);
