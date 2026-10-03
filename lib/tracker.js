// tracker.js — Trade Plans UI (TT.*) — Journal-first din v564
// tt_journal_v1 = sursa unică; trade_plans_v1 = legacy (migrat + arhivat la primul load).
(function(global){
  'use strict';
  const LEGACY_KEY = 'trade_plans_v1';
  const ARCHIVE_KEY = 'trade_plans_v1_archive';
  const MIGRATE_FLAG = 'tt_tracker_migrated_v564';

  function isMigrated(){
    try { return localStorage.getItem(MIGRATE_FLAG) === '1'; } catch(e){ return false; }
  }
  function legacyPlans(){
    try {
      const a = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
      return Array.isArray(a) ? a.filter(Boolean) : [];
    } catch(e){ return []; }
  }

  function findJournalId(id){
    if (!global.JR || !id) return null;
    const j = JR.all();
    const direct = j.find(e => e && e.id === id);
    if (direct) return direct.id;
    const linked = j.find(e => e && e.srcId === id);
    return linked ? linked.id : null;
  }

  function isTrackerEntry(e){
    return !!e && (e.source === 'tracker' || !!e.srcId);
  }

  function statusFromEntry(e){
    if (!e) return 'open';
    if (global.JR && JR.isOpen(e)) return 'open';
    if (e.exit == null) return 'open';
    const pnl = global.JR && JR.pnl ? JR.pnl(e) : null;
    if (pnl == null) return 'loss';
    return pnl >= 0 ? 'win' : 'loss';
  }

  function cleanNotes(notes){
    return String(notes || '').replace(/\s*·?\s*\[sync tracker\]/g, '').trim();
  }

  function planFromEntry(e){
    if (!e) return null;
    const st = statusFromEntry(e);
    const pnl = (st === 'open' || !global.JR) ? null : JR.pnl(e);
    return {
      id: e.id,
      journalId: e.id,
      ticker: e.sym,
      entry: e.entry,
      sl: e.slAtEntry,
      tp: e.tpAtEntry,
      size: e.size,
      dir: e.dir === 'short' ? 'short' : 'long',
      notes: cleanNotes(e.notes),
      status: st,
      opened: e.openTs,
      closed: e.closeTs,
      exit: e.exit,
      fees: e.fees || 0,
      pnl: pnl
    };
  }

  function all(){
    if (!global.JR) return legacyPlans();
    return JR.all()
      .filter(isTrackerEntry)
      .map(planFromEntry)
      .filter(Boolean)
      .sort((a, b) => (b.opened || b.closed || 0) - (a.opened || a.closed || 0));
  }

  function hasOpen(sym){
    const s = String(sym || '').trim().toUpperCase();
    return all().some(p => p && p.status === 'open' && String(p.ticker).toUpperCase() === s);
  }

  function calcPnL(t){
    const e = parseFloat(t.entry), exit = parseFloat(t.exit), size = parseFloat(t.size) || 0;
    if (!e || !exit || !size) return 0;
    const gross = t.dir === 'short' ? (e - exit) * size : (exit - e) * size;
    return gross - (parseFloat(t.fees) || 0);
  }

  function add(plan){
    if (!global.JR) {
      console.warn('[TT] journal.js lipsă — planul nu a fost salvat (journal-first obligatoriu)');
      return null;
    }
    const sym = String(plan.ticker || plan.sym || '').trim().toUpperCase();
    const rec = JR.add({
      sym,
      dir: plan.dir === 'short' ? 'short' : 'long',
      entry: plan.entry,
      size: plan.size,
      slAtEntry: plan.sl,
      tpAtEntry: plan.tp,
      source: 'tracker',
      notes: plan.notes || '',
      openTs: plan.opened || Date.now()
    });
    return rec ? planFromEntry(rec) : null;
  }

  function update(id, patch){
    const jid = findJournalId(id);
    if (!jid || !global.JR) return null;
    const map = {};
    if (patch.ticker != null) map.sym = String(patch.ticker).toUpperCase();
    if (patch.entry != null) map.entry = patch.entry;
    if (patch.size != null) map.size = patch.size;
    if (patch.sl != null) map.slAtEntry = patch.sl;
    if (patch.tp != null) map.tpAtEntry = patch.tp;
    if (patch.notes != null) map.notes = patch.notes;
    if (patch.dir != null) map.dir = patch.dir === 'short' ? 'short' : 'long';
    if (!JR.update(jid, map)) return null;
    const e = JR.all().find(x => x && x.id === jid);
    return e ? planFromEntry(e) : null;
  }

  function remove(id){
    const jid = findJournalId(id);
    if (jid && global.JR) return JR.remove(jid);
    if (!isMigrated()) {
      const arr = legacyPlans().filter(p => p && p.id !== id);
      try { localStorage.setItem(LEGACY_KEY, JSON.stringify(arr)); } catch(e){}
      if (global.JR && JR.unsyncPlan) JR.unsyncPlan(id);
      return true;
    }
    return false;
  }

  function close(id, status, exit, fees){
    const jid = findJournalId(id);
    if (!jid || !global.JR) return null;
    const feeN = parseFloat(fees) || 0;
    if (!JR.close(jid, exit, Date.now(), feeN)) return null;
    JR.update(jid, { tags: status === 'win' ? ['good-exec'] : [] });
    const e = JR.all().find(x => x && x.id === jid);
    return e ? planFromEntry(e) : null;
  }

  function migrateLegacy(){
    if (isMigrated()) return { migrated: 0, archived: false, already: true };
    const plans = legacyPlans();
    try { if(!Array.isArray(JSON.parse(localStorage.getItem(LEGACY_KEY)||'[]')))throw Error('shape'); }catch(e){return {migrated:0,archived:false,error:'unreadable'};}
    if (!global.JR) return { migrated: 0, archived: false, pending: plans.length };
    if (!plans.length) {
      try { localStorage.setItem(MIGRATE_FLAG, '1'); } catch(e){}
      return { migrated: 0, archived: false, already: false };
    }
    // Save a cumulative archive BEFORE importing. Rejected rows stay in the source.
    try {
      const old = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '{"plans":[]}');
      if (!Array.isArray(old.plans)) throw Error('Archive shape');
      const archive = [...old.plans];
      for (const p of plans) if (!archive.some(x => JSON.stringify(x) === JSON.stringify(p))) archive.push(p);
      localStorage.setItem(ARCHIVE_KEY, JSON.stringify({ ts: Date.now(), plans: archive }));
    } catch(e){ return { migrated: 0, archived: false, pending: plans.length }; }
    const pending = []; let synced = 0;
    for (const p of plans) {
      if (JR.syncPlan && JR.syncPlan(p)) synced++;
      else pending.push(p);
    }
    try {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(pending));
      if (!pending.length) localStorage.setItem(MIGRATE_FLAG, '1');
    } catch(e){ return { migrated: synced, archived: true, pending: plans.length, error: 'storage' }; }
    return { migrated: synced, archived: true, pending: pending.length, total: plans.length };
  }

  global.TT = {
    all, add, update, remove, close, calcPnL, hasOpen, migrateLegacy, isMigrated,
    planFromEntry, findJournalId, legacyPlans,
    KEY: LEGACY_KEY, LEGACY_KEY, ARCHIVE_KEY, MIGRATE_FLAG
  };
})(typeof window !== 'undefined' ? window : globalThis);
