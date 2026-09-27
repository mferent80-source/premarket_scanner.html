// PROBA DE ECRAN — pagina alerts (v116): sectiunile "Din Radar" randate dintr-o poza de proba (window.__probaPoza),
// la 1920 si la 390 px, in Chrome/Edge real prin CDP. Fara retea spre worker (poza vine injectata), fara SW.
// Rulare: node tools/proba-ecran-alerts.mjs [gazda]     (implicit http://127.0.0.1:8777, pornit cu `python -m http.server 8777`)
// Pozele: tools/poze/alerts-1920.png, tools/poze/alerts-390.png (neversionate).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GAZDA = (process.argv[2] || "http://127.0.0.1:8777").replace(/\/+$/, "");
const URL_P = GAZDA + "/alerts/";
const POZE = path.join(ROOT, "tools", "poze"); mkdirSync(POZE, { recursive: true });
const FIXTURE = readFileSync(path.join(ROOT, "tools", "fixtures", "poza-radar.json"), "utf8");
const BROWSER = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find((c) => existsSync(c));
const asteapta = (ms) => new Promise((r) => setTimeout(r, ms));

// inainte de scripturile paginii: poza de proba (fara retea), SW oprit, fara dialoguri blocante
const BOOTSTRAP = (cuPoza) => `(() => {
  ${cuPoza ? "window.__probaPoza = " + FIXTURE + ";" : ""}
  window.confirm = () => true; window.prompt = () => null; window.alert = () => {};
  if (navigator.serviceWorker) { try { navigator.serviceWorker.register = () => Promise.reject(new Error("proba: sw dezactivat")); } catch {} }
})();`;

async function porneste(lat, inal, cuPoza) {
  const profil = mkdtempSync(path.join(tmpdir(), "proba-alerts-")), port = 9800 + Math.floor(Math.random() * 150);
  const proc = spawn(BROWSER, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profil}`, `--window-size=${lat},${inal}`,
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  let tinta; for (let i = 0; i < 80 && !tinta; i++) { try { tinta = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((x) => x.type === "page"); } catch {} if (!tinta) await asteapta(250); }
  if (!tinta) { try { proc.kill(); } catch {} throw new Error("browserul nu a pornit"); }
  const ws = new WebSocket(tinta.webSocketDebuggerUrl); let id = 0; const astept = new Map(); const exceptii = [], consola = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && astept.has(m.id)) { astept.get(m.id)(m.result); astept.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") exceptii.push(String(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? "?").slice(0, 300));
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") consola.push(m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300)); };
  await new Promise((r) => { ws.onopen = r; });
  const send = (method, params = {}) => new Promise((res) => { const n = ++id; astept.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
  await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
  await send("Network.setBypassServiceWorker", { bypass: true }); await send("Network.setCacheDisabled", { cacheDisabled: true });
  try { await send("Storage.clearDataForOrigin", { origin: new URL(URL_P).origin, storageTypes: "all" }); } catch {}
  await send("Page.addScriptToEvaluateOnNewDocument", { source: BOOTSTRAP(cuPoza) });
  await send("Emulation.setDeviceMetricsOverride", { width: lat, height: inal, deviceScaleFactor: 1, mobile: lat < 600 });
  return {
    exceptii, consola,
    async ev(expr) { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r?.exceptionDetails) throw new Error("evaluare picata: " + String(r.exceptionDetails?.exception?.description ?? r.exceptionDetails?.text).slice(0, 300)); return r?.result?.value; },
    async navigheaza(url) { await send("Page.navigate", { url }); },
    async poza(fisier) { const h = (await this.ev("document.documentElement.scrollHeight")) || inal; await send("Emulation.setDeviceMetricsOverride", { width: lat, height: Math.min(h, 8000), deviceScaleFactor: 1, mobile: lat < 600 }); await asteapta(300); const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); writeFileSync(fisier, Buffer.from(r.data, "base64")); },
    inchide() { try { ws.close(); } catch {} if (process.platform === "win32" && proc.pid) { try { spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" }); } catch {} } try { proc.kill(); } catch {} setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch {} }, 1500); },
  };
}
async function panaCand(b, expr, ms, ce) { const t0 = Date.now(); while (Date.now() - t0 < ms) { let ok = false; try { ok = await b.ev(expr); } catch {} if (ok) return; await asteapta(300); } throw new Error("am asteptat " + ms + " ms degeaba: " + ce); }

let teste = 0, picate = 0;
async function test(nume, fn) { teste++; try { await fn(); console.log(`  ok   ${nume}`); } catch (e) { picate++; console.log(`  PICA ${nume}\n       ${String(e.message || e).slice(0, 400)}`); } }

const RAD_GATA = `!!document.querySelector('#rad .poz') && !document.querySelector('#rad').innerText.includes('Aduc poza')`;

// ---------- 1920, cu poza ----------
const pc = await porneste(1920, 1000, true);
try {
  await pc.navigheaza(URL_P);
  try { await panaCand(pc, RAD_GATA, 15000, "sectiunile Din Radar nu s-au randat"); }
  catch (e) {   // diagnosticul, ca sa nu ghicim: ce a aruncat pagina si ce e in #rad
    console.log("  exceptii:", pc.exceptii); console.log("  consola:", pc.consola);
    try { console.log("  #rad:", await pc.ev("document.querySelector('#rad') ? document.querySelector('#rad').innerText.slice(0, 300) : 'fara #rad'")); } catch {}
    throw e;
  }
  await asteapta(800);
  await test("pagina se incarca fara erori JS si fara NaN/undefined in #rad", async () => {
    const txt = await pc.ev("document.querySelector('#rad').innerText");
    if (pc.exceptii.length) throw new Error("exceptii: " + pc.exceptii.join(" | "));
    if (/NaN|undefined/.test(txt)) throw new Error("NaN/undefined in text");
  });
  await test("#rad are 3 sectiuni: Trading 212 (7 randuri), Boti (1 rand JTO), Simbolurile tale (9 randuri)", async () => {
    const n = await pc.ev(`[document.querySelectorAll('#radT212 tr.rand').length, document.querySelectorAll('#radBoti tr.rand').length, document.querySelectorAll('#radSimboluri tr.rand').length, document.querySelector('#rad').innerText.includes('JTO')]`);
    if (n[0] !== 7 || n[1] !== 1 || n[2] !== 9 || !n[3]) throw new Error("gasit: " + JSON.stringify(n));
  });
  await test("clic pe randul AVGO desface detaliul (motive, sfat, plan); inca un clic il inchide", async () => {
    await pc.ev(`document.querySelector('#radT212 tr.rand[data-s="AVGO"]').click()`);
    // textContent, nu innerText: titlurile h4 sunt uppercase din CSS, iar innerText intoarce textul transformat
    const d1 = await pc.ev(`(function(){ const d = document.querySelector('#radT212 tr.det[data-det="AVGO"]'); return [!d.hidden, d.textContent.includes('Planul tău'), d.textContent.includes('Aș ieși')]; })()`);
    if (!d1[0] || !d1[1] || !d1[2]) throw new Error("dupa clic: " + JSON.stringify(d1));
    await pc.ev(`document.querySelector('#radT212 tr.rand[data-s="AVGO"]').click()`);
    if (!(await pc.ev(`document.querySelector('#radT212 tr.det[data-det="AVGO"]').hidden`))) throw new Error("nu s-a inchis");
  });
  await test("Adauga NVDA -> apare in Simbolurile tale (fara poza inca) si in localStorage cu kind 'watch'", async () => {
    await pc.ev(`document.getElementById('inpSym').value = 'NVDA'; document.getElementById('inpNote').value = 'proba'; document.getElementById('btnAdd').click()`);
    await panaCand(pc, `!!document.querySelector('#radSimboluri tr.rand[data-s="NVDA"]')`, 5000, "NVDA nu a aparut");
    const st = await pc.ev(`JSON.parse(localStorage.getItem('wl_price_alerts'))`);
    if (!st.NVDA || st.NVDA[0].kind !== 'watch' || st.NVDA[0].note !== 'proba') throw new Error("localStorage: " + JSON.stringify(st.NVDA));
    const rand = await pc.ev(`document.querySelector('#radSimboluri tr.rand[data-s="NVDA"]').innerText`);
    if (!/cere cheia|—|poza următoare/.test(rand) && !/insiderii vin/.test(rand)) throw new Error("randul NVDA: " + rand.slice(0, 200));
  });
  await test("'Scoate din lista' pe NVDA -> dispare din tabel si din localStorage", async () => {
    await pc.ev(`document.querySelector('#radSimboluri tr.rand[data-s="NVDA"]').click()`);
    await pc.ev(`document.querySelector('#radSimboluri [data-fac="scoate"][data-s="NVDA"]').click()`);
    await panaCand(pc, `!document.querySelector('#radSimboluri tr.rand[data-s="NVDA"]')`, 5000, "NVDA nu a disparut");
    const st = await pc.ev(`JSON.parse(localStorage.getItem('wl_price_alerts'))`);
    if (st.NVDA) throw new Error("a ramas in localStorage");
  });
  await test("bara suitei e neschimbata: header.suite-cockpit.al-topbar, 3 file, badge v116; fara praguri in formular", async () => {
    const r = await pc.ev(`[!!document.querySelector('header.suite-cockpit.al-topbar'), document.querySelectorAll('.desk-tabs [data-tab]').length, document.getElementById('verBadge').textContent, !!document.getElementById('inpThr'), !!document.getElementById('inpKind'), !!document.querySelector('#rad #radAdaugaSlot #addForm'), document.querySelectorAll('.refresh-info').length]`);
    if (!r[0] || r[1] !== 3 || r[2] !== 'v116' || r[3] || r[4]) throw new Error(JSON.stringify(r));
    if (!r[5]) throw new Error("formularul de adaugare nu e in panoul Simbolurile tale: " + JSON.stringify(r));
    if (r[6] !== 1) throw new Error("linia 'ultim check' trebuie sa apara o singura data, gasit " + r[6]);
  });
  await test("poza la 1920", async () => { await pc.poza(path.join(POZE, "alerts-1920.png")); });
} finally { pc.inchide(); }

// ---------- 1920, fara poza si fara cheie ----------
const gol = await porneste(1920, 1000, false);
try {
  await gol.navigheaza(URL_P);
  await panaCand(gol, `!!document.querySelector('#rad .caseta') || !!document.querySelector('#rad .pliat')`, 15000, "starea fara cheie nu s-a randat");
  await test("fara poza si fara cheie: caseta 'Pune cheia de citire', sectiunile T212/Boti pliate, simbolurile tot apar (din ce stie pagina)", async () => {
    const r = await gol.ev(`[document.querySelector('#rad').innerText.includes('Pune cheia de citire'), document.querySelectorAll('#rad .pliat').length, document.querySelectorAll('#radSimboluri tr.rand').length >= 0, document.querySelector('#rad').innerText.includes('cere cheia')]`);
    if (!r[0] || r[1] < 2 || !r[3]) throw new Error(JSON.stringify(r));
    if (gol.exceptii.length) throw new Error("exceptii: " + gol.exceptii.join(" | "));
  });
} finally { gol.inchide(); }

// ---------- 390, cu poza ----------
const tel = await porneste(390, 800, true);
try {
  await tel.navigheaza(URL_P);
  await panaCand(tel, RAD_GATA, 15000, "pe telefon sectiunile nu s-au randat");
  await asteapta(800);
  await test("la 390 px nimic nu defileaza orizontal si randurile sunt pe grid", async () => {
    const r = await tel.ev(`[document.documentElement.scrollWidth, getComputedStyle(document.querySelector('#radT212 tr.rand')).display, document.querySelector('#rad').scrollWidth <= document.querySelector('#rad').clientWidth + 1]`);
    if (r[0] > 390 || r[1] !== 'grid' || !r[2]) throw new Error(JSON.stringify(r));
    if (tel.exceptii.length) throw new Error("exceptii: " + tel.exceptii.join(" | "));
  });
  await test("poza la 390", async () => { await tel.poza(path.join(POZE, "alerts-390.png")); });
} finally { tel.inchide(); }

console.log(`PROBA_ECRAN_ALERTS ${picate ? "FAIL" : "PASS"} · ${teste - picate}/${teste}`);
process.exitCode = picate ? 1 : 0;
