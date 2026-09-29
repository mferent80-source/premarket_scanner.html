// v8 health / tt-v853 (el, 29.09: „ok fă ideile”): stocarea originii mferent80-source.github.io era plină. Pe lângă cache-ul de prețuri
// (bugetat în lib/data.js v142), cele mai mari chei moarte erau stl_ticker_cache_v1 + pump_radar_ticker_cache_v1 (~450 K caractere):
// lista de prețuri Binance 24h a aplicației VECHI `scanner` (alt depozit, aceeași origine), neatinsă din mai. Se refac singure ⇒
// intră la „🧨 Curăță tot cache-ul regenerabil”. Datele altor aplicații de pe origine (mercato_*, firebase:*, salt_wl_data, msp_*_log) NU.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(ROOT, 'health/index.html'), 'utf8').replace(/\r\n/g, '\n');
const corp = /const isDeepCandidate = k => \{\n([\s\S]*?)\n    \};/.exec(HTML);
const todayMinus = d => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
const isDeepCandidate = new Function('todayMinus', 'return k => {\n' + corp[1] + '\n};')(todayMinus);

test('Health: cache-urile de prețuri ale aplicației vechi `scanner` intră la curățenia cache-ului regenerabil', () => {
  assert.equal(isDeepCandidate('stl_ticker_cache_v1'), true);
  assert.equal(isDeepCandidate('pump_radar_ticker_cache_v1'), true);
});
test('Health: datele (nu cache-urile) suitei și ale altor aplicații de pe aceeași origine NU se curăță', () => {
  for (const k of ['stl_results_v1', 'stl_list_state', 'pump_radar_cfg', 'salt_wl_data', 'msp_c_signal_log', 'mercato_auth_uid', 'radar_cheie', 'radar_poza',
    'firebase:host:datorii-d10e7-default-rtdb.europe-west1.firebasedatabase.app', 'price_alerts_v2'])
    assert.equal(isDeepCandidate(k), false, k);
  assert.equal(isDeepCandidate('ttd:pd:y1m:AVGO'), true, 'cache-ul de prețuri rămâne curățabil');
});
