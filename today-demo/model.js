/* Read-only data adapter for the Today design preview. No financial storage writes. */
(function (g) {
  'use strict';
  const PORTFOLIO = 'tt_trading212_portfolio_v1', HISTORY = 'tt_trading212_account_history_v1', FILLS = 'tt_trading212_fills_v1';
  const DAY = 86400000, CACHE = 600000, DB = 'tt-broker-fills-v1', STORE = 'records';
  const finite = Number.isFinite, object = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const currency = x => typeof x === 'string' && /^[A-Z]{3}$/.test(x);
  const symbol = x => typeof x === 'string' && /^[A-Z][A-Z0-9.-]{0,23}$/.test(x);
  const stamp = x => typeof x === 'string' && finite(Date.parse(x)) ? Date.parse(x) : null;
  const dayStamp = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && new Date(x + 'T12:00:00Z').toISOString().slice(0, 10) === x ? Date.parse(x + 'T12:00:00Z') : null;
  const safeURL = x => { try { const u = new URL(x); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch (_) { return null; } };
  const number = (x, positive = false) => finite(x) && (!positive || x >= 0) ? x : null;
  const clone = x => JSON.parse(JSON.stringify(x));
  const environment = key => { try { return g[key]; } catch (_) { return undefined; } };

  // Opening a nonexistent database aborts its upgrade; the preview never creates a store.
  async function readExistingFills(indexedDB, timeout = 4000) {
    if (!indexedDB || typeof indexedDB.open !== 'function') throw Error('Stocarea execuțiilor nu este disponibilă.');
    if (typeof indexedDB.databases === 'function') {
      const databases = await indexedDB.databases();
      if (Array.isArray(databases) && !databases.some(x => x.name === DB)) return null;
    }
    return new Promise((resolve, reject) => {
      let db, request, missing = false, finished = false;
      const done = (error, value) => { if (finished) return; finished = true; clearTimeout(timer); try { db?.close(); } catch (_) {} error ? reject(error) : resolve(value); };
      const timer = setTimeout(() => done(Error('Registrul execuțiilor nu a răspuns.')), timeout);
      try {
        request = indexedDB.open(DB);
        request.onupgradeneeded = () => { missing = true; try { request.transaction.abort(); } catch (_) { done(Error('Registrul execuțiilor nu poate fi citit fără modificări.')); } };
        request.onerror = () => missing ? done(null, null) : done(Error('Registrul execuțiilor nu poate fi citit.'));
        request.onblocked = () => done(Error('Registrul execuțiilor este ocupat.'));
        request.onsuccess = () => {
          db = request.result;
          if (finished) { try { db.close(); } catch (_) {} return; }
          try {
            if (!db.objectStoreNames.contains(STORE)) throw Error('Registrul execuțiilor este incompatibil.');
            const tx = db.transaction(STORE, 'readonly'), get = tx.objectStore(STORE).get(FILLS); let result;
            get.onsuccess = () => { result = get.result ?? null; };
            get.onerror = () => done(Error('Execuțiile nu pot fi citite.'));
            tx.oncomplete = () => done(null, result);
            tx.onerror = tx.onabort = () => done(Error('Citirea execuțiilor a fost întreruptă.'));
          } catch (error) { done(error); }
        };
      } catch (error) { done(error); }
    });
  }

  function create({ storage = environment('localStorage'), data = g.D, series = g.DailySeries, indicators = g.TI, events = g.HoldingsEvents,
    snapshot = g.T212Snapshot, breadth = g.TTBreadth, indexedDB = environment('indexedDB'), fetch = g.fetch?.bind(g), now = () => Date.now(),
    readFillsRecord = () => readExistingFills(indexedDB), fillsStore = null, newsKey = () => g.FH_KEY?.get?.() || '', loadBreadth = null, requestTimeout = 9000 } = {}) {
    let marketCache = null, newsCache = null;
    const timeout = finite(requestTimeout) && requestTimeout > 0 ? Math.min(requestTimeout, 10000) : 9000;
    const bounded = async promise => { let timer; try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Sursa nu a răspuns în intervalul de așteptare.')), timeout); })]); } finally { clearTimeout(timer); } };
    const read = (key, fallback) => { if (!storage || typeof storage.getItem !== 'function') throw Error('Stocarea locală nu poate fi citită.'); const raw = storage.getItem(key); return raw == null ? fallback : JSON.parse(raw); };
    const selected = () => {
      const value = read(PORTFOLIO, {});
      if (!object(value)) throw Error('Snapshot-ul contului este incompatibil.');
      if (snapshot?.select) return snapshot.select(value, 'live');
      return Object.entries(value).filter(([, a]) => object(a) && a.environment === 'live').sort((a, b) => Number(b[1].active === true) - Number(a[1].active === true) || (stamp(b[1].fetchedAt) || 0) - (stamp(a[1].fetchedAt) || 0))[0] || null;
    };
    const accountEmpty = () => ({ state: 'missing', scope: null, currency: null, total: null, available: null, invested: null, unrealized: null, realized: null, at: null, fresh: false, positions: [], points: [], historyReason: 'Istoricul începe la prima sincronizare a contului.', chartCurrency: null, cashWarning: 'Depunerile și retragerile schimbă valoarea contului. Graficul nu reprezintă randamentul.', newsSymbols: [], issues: [] });

    function account({ days = 30 } = {}) {
      const out = accountEmpty(), current = now();
      try {
        const entry = selected(); if (!entry) return out;
        const [scope, a] = entry, at = stamp(a.fetchedAt); out.scope = scope;
        if (at === null || at > current + 60000) return { ...out, state: 'error', issues: ['Ora snapshot-ului nu poate fi verificată.'] };
        out.at = at; out.fresh = current - at <= 300000;
        const s = object(a.summary) ? a.summary : {};
        out.currency = currency(s.currency) ? s.currency : null;
        if (out.currency) for (const k of ['total', 'available', 'invested', 'unrealized', 'realized']) out[k] = number(s[k === 'total' ? 'totalValue' : k], !['unrealized', 'realized'].includes(k));
        if (out.total === null) out.issues.push('Valoarea sau moneda contului nu este confirmată.');
        if (!Array.isArray(a.positions)) out.issues.push('Lista pozițiilor nu este disponibilă pentru această citire.');
        for (const p of Array.isArray(a.positions) ? a.positions : []) {
          if (!object(p) || typeof p.ticker !== 'string' || !p.ticker || !finite(p.quantity) || p.quantity < 0) { out.issues.push('O poziție are date incompatibile.'); continue; }
          if (!p.quantity) continue;
          const c = currency(p.currency) ? p.currency : null, value = number(p.value, true);
          out.positions.push({ ticker: p.ticker.slice(0, 100), name: typeof p.name === 'string' ? p.name.slice(0, 160) : p.ticker, quantity: p.quantity, value, unrealized: number(p.unrealized), currency: c, weight: c === out.currency && value !== null && out.total > 0 ? value / out.total * 100 : null });
          const m = /^([A-Z][A-Z0-9.-]{0,23})_US_EQ$/.exec(p.ticker); if (m) out.newsSymbols.push(m[1]);
        }
        out.positions.sort((a, b) => (b.weight ?? -1) - (a.weight ?? -1)); out.newsSymbols = [...new Set(out.newsSymbols)];
        try {
          const h = read(HISTORY, {}), xs = object(h) && Object.hasOwn(h, scope) ? h[scope] : [];
          if (!Array.isArray(xs) || xs.length > 500) throw Error('Istoricul valorii contului este incompatibil.');
          const points = new Map();
          for (const x of xs) {
            const t = stamp(x?.at);
            if (!object(x) || t === null || t > current + 60000 || !finite(x.total) || x.total < 0 || !out.currency || x.currency !== out.currency) throw Error('Istoricul are valori, ore sau monede incompatibile; graficul nu combină aceste date.');
            if (points.has(t) && points.get(t) !== x.total) throw Error('Istoricul conține valori contradictorii la aceeași oră.');
            points.set(t, x.total);
          }
          const cutoff = finite(days) && days > 0 ? current - days * DAY : -Infinity;
          out.points = [...points].filter(([t]) => t >= cutoff).sort((a, b) => a[0] - b[0]).map(([at, value]) => ({ at, value }));
          out.chartCurrency = out.currency; out.historyReason = out.points.length >= 2 ? 'Valoarea contului observată la sincronizări; include depuneri și retrageri.' : out.points.length === 1 ? 'Există o singură observație confirmată. Graficul începe după a doua citire din altă zi.' : 'Nu există observații pentru intervalul ales; istoricul începe la prima sincronizare.';
        } catch (error) { out.historyReason = error.message; out.issues.push(error.message); }
        out.state = out.total === null || !Array.isArray(a.positions) ? 'partial' : out.fresh ? 'ready' : 'stale';
        return out;
      } catch (_) { return { ...out, state: 'error', issues: ['Datele locale ale contului nu pot fi citite. Datele existente sunt păstrate.'] }; }
    }

    const markets = [{ symbol: 'SPY', label: 'S&P 500 · ETF SPY', unit: 'USD', currency: 'USD' }, { symbol: 'QQQ', label: 'Nasdaq 100 · ETF QQQ', unit: 'USD', currency: 'USD' }, { symbol: '^VIX', label: 'Volatilitate · VIX', unit: 'puncte', currency: null }, { symbol: '^TNX', label: 'Randament SUA · 10 ani', unit: '%', currency: null }];
    const marketEmpty = m => ({ ...m, price: null, changePct: null, asOf: null, source: 'Yahoo Finance · sesiuni încheiate', readAt: null, state: 'error', reason: '', points: [], indicators: { rsi14: null, sma50: null, distanceSma50: null, change20d: null } });
    async function marketItem(m) {
      const out = marketEmpty(m), current = now();
      try {
        if (!data?.fetchStock || !series?.read) throw Error('Sursa de prețuri sau validarea sesiunilor nu este disponibilă.');
        const input = await bounded(data.fetchStock(m.symbol, { range: '1y', interval: '1d', ttl: 0 })), meta = input?.meta;
        if (!meta || meta.symbol !== m.symbol || !finite(meta.retrievedAt) || meta.retrievedAt > current + 60000 || meta.provider !== 'Yahoo Finance') throw Error('Identitatea, sursa sau ora seriei nu poate fi verificată.');
        out.readAt = meta.retrievedAt;
        if (m.currency && meta.currency !== m.currency) throw Error('Moneda seriei nu corespunde instrumentului.');
        let completed;
        try { completed = series.read(input, m.symbol, current); }
        catch (error) { if (/DATE STALE/.test(error?.message || '')) out.state = 'stale'; throw error; }
        const bars = completed.bars;
        if (!Array.isArray(bars) || bars.length < 2 || !bars.every(b => finite(b.t) && b.t <= current + 60000 && finite(b.c) && b.c > 0)) throw Error('Sunt necesare cel puțin două sesiuni încheiate valide.');
        const closes = bars.map(b => b.c), last = closes.at(-1), previous = closes.at(-2), sma = indicators?.calcSMA?.(closes, 50), rsi = indicators?.calcRSI?.(closes, 14);
        out.price = last; out.changePct = (last / previous - 1) * 100; out.asOf = completed.asOf;
        out.points = bars.slice(-300).map(b => ({ at: b.t, value: b.c }));
        out.indicators = { rsi14: finite(rsi) && rsi >= 0 && rsi <= 100 ? rsi : null, sma50: finite(sma) && sma > 0 ? sma : null, distanceSma50: finite(sma) && sma > 0 ? (last / sma - 1) * 100 : null, change20d: closes.length >= 21 ? (last / closes.at(-21) - 1) * 100 : null };
        out.state = 'ready'; out.reason = 'Ultima sesiune încheiată · nu este cotație executabilă live.';
        return out;
      } catch (error) { out.reason = error?.message || 'Datele pieței nu au putut fi confirmate.'; return out; }
    }

    async function breadthResult() {
      const out = { state: 'error', asOf: null, stance: null, score: null, coverage: 'S&P 500 · seria originală', above50: null, above200: null, points: [], reason: '', source: 'Market Breadth · seria originală S&P 500' };
      try {
        let raw;
        if (loadBreadth) raw = await bounded(loadBreadth());
        else if (fetch) {
          const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
          try { const r = await bounded(fetch('../market-breadth/data/latest.json?v=' + Math.floor(now() / 300000), { cache: 'no-store', signal: controller.signal })); if (!r.ok) throw Error('Raportul breadth nu poate fi citit.'); raw = await bounded(r.json()); } finally { clearTimeout(timer); }
        } else if (breadth?.load) {
          const result = await bounded(breadth.load('../market-breadth/data/latest.json')); raw = result.raw;
        } else throw Error('Sursa breadth nu este disponibilă.');
        if (!object(raw) || raw.schemaVersion !== 1 || !object(raw.sources)) throw Error('Raportul breadth este incompatibil.');
        const s = raw.sources.sp500, current = now(), expected = series?.expected?.(current, 'America/New_York', 960), t = dayStamp(s?.asOf);
        if (!object(s) || s.fetchStatus !== 'OK' || t === null || t > current + DAY || expected && s.asOf > expected) throw Error('Sursa originală S&P 500 nu poate fi verificată.');
        const above = x => finite(x) && x >= 0 && x <= 1 ? x * 100 : null;
        out.asOf = s.asOf; out.above50 = above(s.latest?.above50); out.above200 = above(s.latest?.above200);
        if (out.above50 === null || out.above200 === null) throw Error('Indicatorii breadth S&P 500 nu sunt confirmați.');
        if (!Array.isArray(s.history)) throw Error('Istoricul breadth nu este disponibil.');
        const points = new Map();
        for (const x of s.history) { const at = dayStamp(x?.date), value = above(x?.above50); if (at === null || at > t || value === null || points.has(at) && points.get(at) !== value) throw Error('Istoricul breadth conține valori incompatibile.'); points.set(at, value); }
        out.points = [...points].sort((a, b) => a[0] - b[0]).slice(-90).map(([at, value]) => ({ at, value }));
        if (!out.points.length) throw Error('Istoricul breadth nu are observații.');
        out.state = expected && s.asOf === expected ? 'ready' : 'stale';
        const view = breadth?.view?.(raw, current), master = raw.full?.engine?.master, sources = raw.full?.sources || {}, keys = Object.keys(raw.full?.engine?.data || {}), allCurrent = keys.length > 0 && keys.every(k => sources[k]?.usable === true && sources[k]?.asOf === expected && sources[k]?.fetchStatus === 'OK');
        if (out.state === 'ready' && (view?.engineFresh === true || !view && allCurrent)) { out.stance = typeof master?.stance === 'string' ? master.stance.slice(0, 100) : null; out.score = number(master?.score); }
        out.coverage = 'S&P 500 · seria originală' + (keys.length ? ' · ' + keys.length + '/4 surse pentru verdict' : '');
        out.reason = (out.state === 'ready' ? 'Participație în seria originală S&P 500; eșantionul separat Yahoo nu este combinat cu această serie.' : 'Ultimul raport este mai vechi sau calendarul sesiunilor nu poate fi confirmat.') + ' Istoric disponibil: ' + out.points.length + ' observații.';
        return out;
      } catch (error) { out.state = 'error'; out.points = []; out.above50 = null; out.above200 = null; out.reason = error?.message || 'Datele breadth nu pot fi confirmate.'; return out; }
    }

    async function market({ force = false } = {}) {
      const current = now(); if (!force && marketCache && current >= marketCache.at && current - marketCache.at < CACHE) return clone(marketCache);
      const [items, b] = await Promise.all([Promise.all(markets.map(marketItem)), breadthResult()]);
      marketCache = { items, breadth: b, at: now() }; return clone(marketCache);
    }

    async function news({ symbols = ['SPY', 'QQQ'], force = false } = {}) {
      const names = [...new Set(symbols.filter(symbol))].slice(0, 3), current = now(), key = names.join('|');
      if (!force && newsCache?.key === key && current >= newsCache.value.at && current - newsCache.value.at < CACHE) return clone(newsCache.value);
      const results = await Promise.all(names.map(async name => {
        try {
          if (!data?.fetchJSON || !events?.news) throw Error('Fluxul de știri nu este disponibil.');
          const payload = await bounded(data.fetchJSON('https://query1.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(name) + '&quotesCount=1&newsCount=15', { ttl: 0, bust: 60, timeout: 5000, cacheKey: 'today-demo-news:' + name, validate: x => Array.isArray(x?.news) && Array.isArray(x?.quotes) && x.quotes.some(q => q.symbol === name) }));
          if (!object(payload) || !Array.isArray(payload.news) || !Array.isArray(payload.quotes) || !payload.quotes.some(q => q.symbol === name)) throw Error('Știrile Yahoo nu au un răspuns verificabil.');
          return { available: true, items: events.news(payload, name, now()).map(x => ({ ...x, symbol: name, source: 'Yahoo Finance' })) };
        } catch (_) {
          // Reuse an existing account key only, without requesting or storing credentials.
          let existing = ''; try { existing = newsKey(); } catch (_) {}
          if (existing && events?.fetchNews) { try { const r = await bounded(events.fetchNews(name, existing, now())); if (r?.available === true && r.source === 'Finnhub' && Array.isArray(r.news)) return { available: true, items: r.news.map(x => ({ ...x, symbol: name, source: 'Finnhub' })) }; } catch (_) {} }
          return { available: false, items: [] };
        }
      }));
      const seen = new Set(), items = results.flatMap(x => x.items).filter(x => {
        const url = safeURL(x.url), valid = typeof x.title === 'string' && x.title.trim() && typeof x.publisher === 'string' && x.publisher.trim() && finite(x.publishedAt) && x.publishedAt > 0 && x.publishedAt <= now() + 60000 && now() - x.publishedAt <= 7 * DAY && url && !seen.has(url);
        if (valid) { seen.add(url); x.url = url; } return valid;
      }).sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 6).map(x => ({ title: x.title.trim().slice(0, 350), url: x.url, publisher: x.publisher.trim().slice(0, 100), publishedAt: x.publishedAt, symbol: x.symbol, source: x.source }));
      const available = results.filter(x => x.available).length, state = !names.length || !available ? 'error' : available < names.length ? 'partial' : items.length ? 'ready' : 'empty';
      const value = { state, items, at: now(), reason: state === 'error' ? 'Fluxurile de știri nu au putut fi verificate.' : state === 'partial' ? 'O parte dintre sursele cerute nu a răspuns.' : state === 'empty' ? 'Sursa a răspuns, dar nu există articole recente asociate exact simbolurilor selectate.' : 'Articole asociate simbolurilor; ora afișată este publicarea raportată de provider.' };
      newsCache = { key, value }; return clone(value);
    }

    async function activity({ scope, limit = 4, side = 'ALL' } = {}) {
      const out = { state: 'missing', items: [], reason: 'Nu există execuții confirmate pentru contul selectat.' };
      if (typeof scope !== 'string' || !scope) return out;
      try {
        let value;
        if (fillsStore) { const confirmed = fillsStore.peek(); if (!object(confirmed) || !object(confirmed.data)) throw Error('Registru incompatibil.'); value = confirmed.data; }
        else {
          const record = await readFillsRecord();
          if (record !== null && record !== undefined) {
            if (!object(record) || !Number.isSafeInteger(record.revision) || record.revision < 1 || record.revision >= Number.MAX_SAFE_INTEGER || !(record.raw === null || typeof record.raw === 'string') || !(record.localRaw === null || typeof record.localRaw === 'string')) throw Error('Registru incompatibil.');
            let legacy; try { legacy = storage?.getItem(FILLS) ?? null; } catch (_) {}
            if (legacy !== undefined && legacy !== record.localRaw && legacy !== record.raw) throw Error('Copiile execuțiilor sunt incompatibile.');
            value = record.raw === null ? { accounts: {} } : JSON.parse(record.raw);
          } else value = read(FILLS, { accounts: {} });
        }
        if (!object(value) || !object(value.accounts)) throw Error('Registru incompatibil.');
        const a = Object.hasOwn(value.accounts, scope) ? value.accounts[scope] : null;
        if (!a) return out;
        if (!object(a) || a.environment !== 'live' || !Array.isArray(a.items)) throw Error('Contul execuțiilor nu corespunde selecției Invest.');
        const seen = new Map(); let rejected = 0;
        for (const x of a.items) {
          const at = stamp(x?.date), id = typeof x?.id === 'string' || typeof x?.id === 'number' ? String(x.id) : '';
          if (!object(x) || !id || typeof x.ticker !== 'string' || !x.ticker || !['BUY', 'SELL'].includes(x.side) || at === null || at > now() + 60000 || !finite(x.quantity) || x.quantity <= 0 || !finite(x.price) || x.price <= 0) { rejected++; continue; }
          if (seen.has(id) && JSON.stringify(seen.get(id)) !== JSON.stringify(x)) throw Error('Execuții contradictorii.'); seen.set(id, x);
        }
        out.items = [...seen.values()].filter(x => !['BUY', 'SELL'].includes(side) || x.side === side).sort((a, b) => stamp(b.date) - stamp(a.date)).slice(0, Math.max(1, Math.min(20, Number.isSafeInteger(limit) ? limit : 4))).map(x => ({ id: String(x.id), ticker: x.ticker.slice(0, 100), side: x.side, at: stamp(x.date), quantity: x.quantity, price: x.price, currency: currency(x.priceCurrency) ? x.priceCurrency : null, realized: currency(x.currency) && finite(x.realized) ? x.realized : null, realizedCurrency: currency(x.currency) ? x.currency : null }));
        out.state = rejected || a.complete !== true || a.syncStatus === 'error' || a.syncStatus === 'loading' || a.syncError ? 'partial' : out.items.length ? 'ready' : 'missing';
        out.reason = out.state === 'partial' ? 'Import parțial; sunt afișate doar execuțiile confirmate disponibile.' : out.items.length ? 'Execuții importate; o vânzare parțială nu reprezintă automat o poziție închisă.' : out.reason;
        return out;
      } catch (_) { return { state: 'error', items: [], reason: 'Registrul execuțiilor nu poate fi citit. Copiile existente sunt păstrate; nu folosim o copie locală posibil mai veche.' }; }
    }
    return { account, market, news, activity };
  }
  g.TodayDashboardModel = { create, readExistingFills };
})(typeof window !== 'undefined' ? window : globalThis);
