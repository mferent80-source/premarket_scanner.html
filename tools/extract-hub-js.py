# -*- coding: utf-8 -*-
"""
Maintenance helper — NU regenera hub-brief.js din index.html (v607+).

hub-brief.js, hub-market.js, hub-gappers.js, hub-tableau.js sunt module
hand-maintained în lib/. Acest script poate doar re-împacheta hub-ledger.js
dacă blocul ledger e încă inline în index.html (marker: hub-ledger.js script tag absent).
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
src_path = ROOT / "index.html"
src = src_path.read_text(encoding="utf-8")

if 'lib/hub-brief.js' in src:
    print("hub-brief.js: skip (deja extras în lib/)")
else:
    print("WARN: hub-brief.js lipsește din index.html — editează lib/hub-brief.js direct", file=sys.stderr)

# Ledger: caută IIFE Signal Ledger în index.html (legacy)
marker = "// hub-ledger.js — Signal Ledger"
if marker in (ROOT / "lib" / "hub-ledger.js").read_text(encoding="utf-8"):
    print("hub-ledger.js: deja există în lib/ — skip")
    sys.exit(0)

start = src.find('// Signal Ledger scorecard')
if start < 0:
    print("Nu am găsit bloc ledger inline — nimic de extras.")
    sys.exit(0)

end = src.find('})();', start)
if end < 0:
    print("Bloc ledger incomplet — abort.", file=sys.stderr)
    sys.exit(1)

ledger_body = src[start:end].strip()
if ledger_body.startswith('//'):
    ledger_body = ledger_body.split('\n', 1)[1] if '\n' in ledger_body else ''

LEDGER_EXTRA = r'''
  function slMiniReview(){
    const el = $('hubSlMini');
    if (!el) return;
    const entries = (global.LEDGER ? LEDGER.all() : []).slice();
    if (!entries.length){ el.innerHTML = '<span class="hub-sl-empty">Ledger gol</span>'; return; }
    const bySrc = {};
    entries.forEach(e => (bySrc[e.src]=bySrc[e.src]||[]).push(e));
    const top = Object.keys(bySrc).sort((a,b)=>bySrc[b].length-bySrc[a].length).slice(0,3);
    el.innerHTML = top.map(s=>'<span class="hub-sl-chip">'+escHtml(s)+' <b>'+bySrc[s].length+'</b></span>').join('') + ' <a href="#slWrap" class="hub-sl-link">Ledger →</a>';
  }
  global.HB_SL_MINI = { renderReview: slMiniReview };
'''

ledger_wrap = (
    marker + " scorecard\n"
    "(function(global){\n'use strict';\n"
    + ledger_body + "\n"
    + LEDGER_EXTRA
    + "\n})(typeof window !== 'undefined' ? window : global);\n"
)
(ROOT / "lib" / "hub-ledger.js").write_text(ledger_wrap, encoding="utf-8")
print("hub-ledger.js scris:", len(ledger_wrap), "bytes")