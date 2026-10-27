// 27.10.2026 (audit E 🟡 Y8 / Y7 / 🔵 B10, I-755): configurația Cloudflare spune adevărul — cronul de 5 minute e declarat la workerul care îl
// folosește (monitorul din `premarket-scanner-html`), nu la proxy (dispatch-ul spre GitHub a fost scos pe 27.09); robotul de știri are termen,
// alarmă pe Discord la eșec și identitatea obișnuită a botului; `docs/automation.md` descrie pipeline-ul REAL și e comparat aici cu fișierele.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=f=>readFileSync(join(ROOT,f),'utf8').replace(/\r\n/g,'\n');
const jsonc=text=>JSON.parse(text.replace(/^\s*\/\/.*$/gm,''));

test('cronul */5 e declarat în wrangler-ul workerului de sincronizare (monitorul îl așteaptă) și NU mai e în wrangler-ul proxy-ului',()=>{
  const sync=jsonc(read('tools/cloud-sync-wrangler.jsonc'));
  assert.deepEqual(sync.triggers?.crons,['*/5 * * * *'],'monitorul de 5 minute (lib/cloud-monitor.mjs: schedulerFresh < 15 min) are nevoie de cron declarat, altfel un deploy îl șterge');
  assert.equal(sync.name,'premarket-scanner-html');
  const proxy=read('tools/cf-proxy-wrangler.toml');
  assert.doesNotMatch(proxy,/^\s*\[triggers\]/m,'proxy-ul nu mai pornește nimic: un deploy cu [triggers] ar reporni 288 de rulări/zi');
  assert.doesNotMatch(proxy,/crons\s*=/);
  const worker=read('tools/cf-worker-proxy.js').split('\n').filter(l=>!/^\s*\/\//.test(l)).join('\n'); // codul, fără comentariile care povestesc retragerea
  assert.doesNotMatch(worker,/\bscheduled\s*\(/,'handler-ul scheduled (dispatch spre GitHub) e cod mort de pe 27.09');
  assert.doesNotMatch(worker,/GH_DISPATCH_TOKEN|ghDispatch/);
});
test('docs/automation.md descrie pipeline-ul real și e în acord cu fișierele (cron GitHub la 2 h → check-news-watch → Discord; cron CF doar la monitor)',()=>{
  assert.ok(existsSync(join(ROOT,'docs/automation.md')),'docs/automation.md lipsește');
  const doc=read('docs/automation.md'),wf=read('.github/workflows/price-alerts.yml');
  const cron=/cron:\s*'([^']+)'/.exec(wf)[1];
  assert.ok(doc.includes('`'+cron+'`'),'documentul citează cronul real al robotului de știri ('+cron+')');
  assert.match(doc,/check-news-watch\.mjs/);assert.match(doc,/premarket-scanner-html[^\n]*\*\/5 \* \* \* \*/,'cronul de 5 minute e atribuit workerului de sincronizare');
  assert.match(doc,/tt-proxy[^\n]*(fără cron|niciun cron)/i,'proxy-ul e descris fără cron');
  assert.match(doc,/check-alerts\.mjs[^\n]*retras/,'botul de praguri e descris ca RETRAS, nu ca viu');
  assert.doesNotMatch(doc,/→ node tools\/check-alerts\.mjs/,'lanțul vechi (check-alerts → Telegram) nu mai apare ca pipeline');
  assert.ok(!existsSync(join(ROOT,'tools/check-alerts.mjs')),'botul de praguri (Telegram, nerulat de niciun workflow) e retras');
});
test('price-alerts.yml: termen, alarmă pe Discord la eșec, push ratat ⇒ roșu, identitatea botului cu id-ul GitHub, doar fișierele pe care le scrie robotul',()=>{
  const wf=read('.github/workflows/price-alerts.yml');
  assert.match(wf,/timeout-minutes:\s*\d+/);
  assert.match(wf,/if:\s*failure\(\)/,'pasul Discord la eșec, ca la ceilalți roboți');
  assert.match(wf,/exit 1/,'push ratat de 3 ori ⇒ roșu (starea seen s-ar pierde ⇒ știri retrimise)');
  assert.match(wf,/41898282\+github-actions\[bot\]@users\.noreply\.github\.com/);
  assert.doesNotMatch(wf,/hub-stale-digest\.json|git add tools\/alerts\.json/,'robotul nu mai scrie alerts.json / hub-stale-digest.json');
  assert.doesNotMatch(wf,/check-alerts\.mjs la 15 min|Telegram \(TELEGRAM_TOKEN/,'antetul descrie pipeline-ul real');
});
