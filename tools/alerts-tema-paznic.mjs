#!/usr/bin/env node
// alerts-tema-paznic.mjs — pagina alerts în designul PAZNIC-CRYPTO (11.10.2026, Marius: „aplică”, după demo).
// Aceeași transformare ca la Crypto Radar v100.151: DOAR aspect — culori după rol → paleta PAZNIC, colțuri 3–5 px
// (cercurile rămân), fără umbre și sticlă, degradeurile doar-închise plate, greutăți ≤600, etichete fără MAJUSCULE
// spațiate, scrisul mare puțin strâns. Nu atinge selectorii, display-ul sau ordinea ⇒ ce e pe pagină rămâne pe pagină.
//
//   node tools/alerts-tema-paznic.mjs            regenerează alerts/tema-paznic-suita.css (copia transformată a foilor
//                                                comune theme-light.css + suite-ui.css, pe care alte 22 de pagini le folosesc
//                                                neschimbate). Rulează-l după orice schimbare în ele (testul cere asta).
//   node tools/alerts-tema-paznic.mjs --aplica   o singură dată: transformă lib/radar-ui.css (doar al paginii alerts) și
//                                                <style>-ul din alerts/index.html; nu face nimic dacă tema e deja pusă.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const PALETA = { f0: '#0E141A', f1: '#141C24', f2: '#1A242E', f3: '#22303C', li: '#26333F', li2: '#35485A',
  t0: '#E6EDF3', t1: '#9FB3C4', t2: '#8799AA', sus: '#26A96C', jos: '#E0524A', aur: '#E9B949', info: '#5B8FC7' };
const P = PALETA;
const hex2rgb = (h) => { h = h.slice(1); if (h.length === 3) h = [...h].map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return [h, s, l];
}
const PALETA_SUS = new Set(Object.values(P).map((x) => x.toUpperCase()));
function rol(rgb, hexOriginal) {
  if (hexOriginal && PALETA_SUS.has(hexOriginal.toUpperCase())) return null; // deja din paletă: rămâne (transformarea e idempotentă)
  const [r, g, b] = rgb; if (r === 255 && g === 255 && b === 255) return null; if (r === 0 && g === 0 && b === 0) return null;
  const [h, s, l] = hsl(rgb);
  if (s < 0.4 || l < 0.16) {
    if (l < 0.06) return P.f0; if (l < 0.09) return P.f1; if (l < 0.12) return P.f2; if (l < 0.16) return P.f3;
    if (l < 0.24) return P.li; if (l < 0.34) return P.li2; if (l < 0.62) return P.t2; if (l < 0.78) return P.t1; return P.t0;
  }
  if (l > 0.86) return P.t0;
  if (h >= 85 && h < 170) return P.sus; if (h >= 330 || h < 18) return P.jos; if (h >= 18 && h < 65) return P.aur; if (h >= 170 && h < 255) return P.info;
  return null; // movul (volatilitatea) rămâne
}
const rgbStr = (h, a) => { const [r, g, b] = hex2rgb(h); return a == null ? h : `rgba(${r},${g},${b},${a})`; };
function inchisa(c) {
  let rgb; if (c.startsWith('#')) rgb = hex2rgb(c); else { const x = c.match(/\d+(\.\d+)?/g).map(Number); rgb = x.slice(0, 3); if (x[3] != null && x[3] < 0.2) return 'transp'; }
  return hsl(rgb)[2] < 0.3 ? 'inchis' : 'viu';
}
const strange = (n) => (n <= 13 ? n : Math.round((13 + (n - 13) * 0.6) * 2) / 2);

export function tema(css) {
  const n = { culori: 0, colturi: 0, umbre: 0 };
  css = css.replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/g, (m) => { const x = rol(hex2rgb(m), m); if (x) { n.culori++; return x; } return m; });
  css = css.replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/g, (m, r, g, b, a) => {
    const x = rol([+r, +g, +b]); if (!x) return m; const nou = rgbStr(x, a); if (nou.replace(/\s/g, '') === m.replace(/\s/g, '')) return m; n.culori++; return nou;
  });
  css = css.replace(/border-radius\s*:\s*([^;}]+)/g, (m, v) => {
    if (/%/.test(v)) return m;
    const nou = v.replace(/(\d+(?:\.\d+)?)px/g, (x, k) => { k = +k; return k <= 5 ? x : (k >= 100 ? '3px' : k >= 10 ? '5px' : '4px'); });
    if (nou === v) return m; n.colturi++; return 'border-radius:' + nou;
  });
  css = css.replace(/(--(?:r|rs|radius)\s*:\s*)(\d+)px/g, (m, a, k) => (+k > 6 ? a + '5px' : m));
  css = css.replace(/box-shadow\s*:\s*([^;}]+)/g, (m, v) => {
    if (/^\s*(none|inherit|var\(--focus)/.test(v) || /^\s*0 0 0 \d/.test(v) || /inset [0-9]px 0 0 /.test(v)) return m; n.umbre++; return 'box-shadow:none';
  });
  css = css.replace(/(--(?:shadow|topbar-shadow)\s*:\s*)(?!none)[^;}]+/g, '$1none');
  css = css.replace(/text-shadow\s*:\s*(?!none)[^;}]+/g, 'text-shadow:none');
  css = css.replace(/(-webkit-)?backdrop-filter\s*:\s*(?!none)[^;}]+/g, '$1backdrop-filter:none');
  css = css.replace(/(radial|linear)-gradient\(((?:[^()]|\([^()]*\))*)\)/g, (m) => {
    const cul = m.match(/#[0-9a-fA-F]{3,6}\b|rgba?\([^)]*\)/g) || [];
    if (/transparent/.test(m) && cul.length === 0) return m; const tip = cul.map(inchisa); if (tip.some((t) => t === 'viu')) return m;
    const prim = cul.find((c, i) => tip[i] === 'inchis'); return prim ? `linear-gradient(${prim},${prim})` : 'linear-gradient(transparent,transparent)';
  });
  css = css.replace(/font-weight\s*:\s*(700|800|900|bold)\b/g, 'font-weight:600');
  css = css.replace(/text-transform\s*:\s*uppercase/g, 'text-transform:none');
  css = css.replace(/letter-spacing\s*:\s*\.?0?\.\d+em/g, 'letter-spacing:0');
  css = css.replace(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g, (m, k) => { k = +k; return k <= 13 ? m : `font-size:${strange(k)}px`; });
  return { css, n };
}

export const FINAL = `
/* ===== TEMA PAZNIC (11.10.2026) — tools/alerts-tema-paznic.mjs; doar aspect, la finalul stilului paginii ===== */
:root,:root[data-theme] body.al-page,:root[data-theme] body.suite-page{color-scheme:dark;--bg:${P.f0};--suite-bg:${P.f0};--panel:${P.f1};--panel2:${P.f2};--panel3:${P.f3};--b1:${P.li2};--b2:${P.li};
  --t1:${P.t0};--t2:${P.t1};--t3:${P.t2};--text:${P.t0};--muted:${P.t1};--text-dim:${P.t2};--suite-t1:${P.t0};--suite-t2:${P.t1};--suite-t3:${P.t2};
  --accent:${P.info};--acc-1:${P.info};--acc-2:${P.info};--on-accent:${P.f0};--bull-s:${P.sus};--bear-s:${P.jos};--warn:${P.aur};--gold:${P.aur};
  --bull-bg:rgba(38,169,108,.14);--bear-bg:rgba(224,82,74,.14);--warn-bg:rgba(233,185,73,.12);--topbar-bg:${P.f1};--shadow:none;--topbar-shadow:none;--r:5px;--rs:3px}
:root[data-theme] body.al-page{background:${P.f0}!important;color:${P.t0}!important;font-family:"IBM Plex Sans",system-ui,"Segoe UI",sans-serif!important;font-variant-numeric:tabular-nums}
body.al-page header.al-topbar{background:${P.f1}!important;border-bottom:1px solid ${P.li}!important}
body.al-page .num:not(table):not(tbody):not(tr),body.al-page code,body.al-page kbd{font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace!important}
body.al-page ::selection{background:${P.aur};color:${P.f0}}
body.al-page :focus-visible{outline:1px solid ${P.aur}!important;outline-offset:1px}
`;

export function copieSuita(themeLight, suiteUi) {
  return '/* GENERAT de tools/alerts-tema-paznic.mjs — NU se editează de mână.\n' +
    '   Copia transformată în designul PAZNIC a foilor comune lib/theme-light.css + lib/suite-ui.css, încărcată DOAR de\n' +
    '   pagina alerts, după originale (care rămân neschimbate pentru celelalte pagini). */\n' +
    tema(themeLight).css + '\n' + tema(suiteUi).css + '\n';
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fis = (f) => path.join(ROOT, f);
function citeste(f) { const b = readFileSync(fis(f)); const crlf = b.includes('\r\n'); return { t: b.toString('utf8').replace(/\r\n/g, '\n'), crlf }; }
function scrie(f, t, crlf) { if (!t.trim()) throw new Error('gol: ' + f); writeFileSync(fis(f), crlf ? t.replace(/\n/g, '\r\n') : t); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tl = citeste('lib/theme-light.css').t, su = citeste('lib/suite-ui.css').t;
  const copie = copieSuita(tl, su);
  scrie('alerts/tema-paznic-suita.css', copie, false);
  console.log('alerts/tema-paznic-suita.css regenerat (' + copie.length + ' octeți)');
  if (process.argv.includes('--aplica')) {
    const h = citeste('alerts/index.html');
    if (h.t.includes('TEMA PAZNIC')) { console.log('alerts: tema e deja pusă - nimic de făcut'); process.exit(0); }
    const m = h.t.match(/<style>([\s\S]*?)<\/style>/);
    if (!m) throw new Error('alerts: fără <style>');
    const st = tema(m[1]);
    let t = h.t.replace(m[0], '<style>' + st.css.replace(/\s*$/, '\n') + FINAL + '</style>');
    const link = /(<link rel="stylesheet" href="\.\.\/lib\/suite-ui\.css\?v=\d+">\n)/;
    if (!link.test(t)) throw new Error('alerts: nu găsesc link-ul spre suite-ui.css');
    t = t.replace(link, '$1<link rel="stylesheet" href="tema-paznic-suita.css?v=1">\n');
    scrie('alerts/index.html', t, h.crlf);
    const rr = citeste('lib/radar-ui.css'); const rt = tema(rr.t);
    scrie('lib/radar-ui.css', rt.css, rr.crlf);
    console.log('aplicat · <style> alerts: ' + JSON.stringify(st.n) + ' · radar-ui.css: ' + JSON.stringify(rt.n));
  }
}
