# -*- coding: utf-8 -*-
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
p = ROOT / "index.html"
html = p.read_text(encoding="utf-8")

HUB_CSS = r"""
/* === HUB COCKPIT v542 === */
.hub-session{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:14px 0 6px;padding:8px 12px;background:var(--bg2);border:1px solid var(--b1);border-radius:var(--rs)}
.hub-session-lbl{font-family:var(--mono);font-size:10px;color:var(--t3);font-weight:700;margin-right:4px}
.hub-mode{display:inline-flex;border:1px solid var(--b1);border-radius:8px;overflow:hidden}
.hub-mode button{background:var(--bg3);border:none;color:var(--t3);padding:6px 11px;font-size:10px;font-weight:800;cursor:pointer;font-family:var(--mono)}
.hub-mode button.on{background:rgba(247,147,26,.15);color:var(--crypto-2)}
.hub-health-pill{margin-left:auto;font-family:var(--mono);font-size:10px;font-weight:800;padding:5px 10px;border-radius:999px;border:1px solid var(--b1);cursor:pointer;background:var(--bg3);color:var(--t2)}
.hub-health-pill.ok{border-color:rgba(34,214,107,.35);color:var(--green)}
.hub-health-pill.warn{border-color:rgba(212,137,44,.35);color:#d4892c}
.hub-health-pill.err{border-color:rgba(255,77,77,.35);color:#ff4d4d}
.hub-cmd{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:12px 0;grid-column:1/-1}
@media(max-width:900px){.hub-cmd{grid-template-columns:repeat(3,1fr)}}
@media(max-width:550px){.hub-cmd{grid-template-columns:1fr 1fr}}
.hub-cmd-cell{background:linear-gradient(135deg,var(--bg2),var(--bg3));border:1px solid var(--b1);border-radius:10px;padding:10px 12px;position:relative;overflow:hidden}
.hub-cmd-cell::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--indigo,#5bb0ff)}
.hub-cmd-cell.lvl-ok::before{background:var(--green)}.hub-cmd-cell.lvl-warn::before{background:#d4892c}.hub-cmd-cell.lvl-bear::before{background:#ff4d4d}
.hub-cmd-lbl{font-family:var(--mono);font-size:9px;text-transform:uppercase;color:var(--t3);font-weight:700}
.hub-cmd-val{font-size:17px;font-weight:800;margin-top:2px;line-height:1.2}
.hub-cmd-sub{font-family:var(--mono);font-size:9.5px;color:var(--t2);margin-top:3px}
.hub-cmd-dim{font-size:11px;color:var(--t3)}
.hub-cmd-spark{margin-top:4px;opacity:.9}
.hub-cmd-val .go-go{color:var(--green)}.hub-cmd-val .go-caution{color:#d4892c}.hub-cmd-val .go-nogo{color:#ff4d4d}
.hub-cockpit{background:linear-gradient(135deg,rgba(247,147,26,.10),rgba(91,176,255,.07));border:1px solid rgba(247,147,26,.28);border-radius:12px;padding:14px 16px;margin:10px 0 14px;display:grid;grid-template-columns:1fr auto;gap:14px;align-items:start}
.hub-cockpit.stay{background:linear-gradient(135deg,rgba(255,77,77,.12),rgba(20,26,40,.5));border-color:rgba(255,77,77,.45)}
.hub-cockpit-lbl{font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--crypto-1);margin-bottom:4px}
.hub-cockpit.stay .hub-cockpit-lbl{color:#ff4d4d}
.hub-strat{font-size:24px;font-weight:900;line-height:1.1}
.hub-rule{font-family:var(--mono);font-size:11px;color:#5bb0ff;margin-top:5px;font-weight:700}
.hub-meta,.hub-plan{font-family:var(--mono);font-size:11px;color:var(--t2);margin-top:6px;line-height:1.45}
.hub-blockers{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.hub-block{font-family:var(--mono);font-size:9px;font-weight:800;padding:4px 8px;border-radius:5px;border:1px solid var(--b1)}
.hub-block.bear{background:rgba(255,77,77,.12);color:#ff4d4d;border-color:rgba(255,77,77,.35)}
.hub-block.warn{background:rgba(212,137,44,.1);color:#d4892c;border-color:rgba(212,137,44,.35)}
.hub-go{text-align:right;min-width:100px}
.hub-go-num{font-size:36px;font-weight:900;line-height:1}
.hub-go-num.go{color:var(--green)}.hub-go-num.caution{color:#d4892c}.hub-go-num.nogo{color:#ff4d4d}
.hub-go-lbl{font-family:var(--mono);font-size:10px;color:var(--t3);margin-top:4px}
.hub-go-track{height:6px;background:var(--bg3);border-radius:4px;margin-top:8px;overflow:hidden;border:1px solid var(--b1)}
.hub-go-fill{height:100%;border-radius:4px;transition:width .35s}
.hub-cockpit-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;grid-column:1/-1}
.hub-cockpit-actions a{font-size:11px;font-weight:800;padding:6px 11px;border-radius:8px;border:1px solid var(--b1);background:var(--bg3);color:var(--t1);text-decoration:none}
.hub-cockpit-actions a.primary{border-color:rgba(91,176,255,.4);background:rgba(91,176,255,.12);color:#5bb0ff}
.hub-freeze-top{display:none;border-radius:10px;padding:9px 12px;margin-bottom:8px;font-family:var(--mono);font-size:12px;font-weight:700}
.hub-freeze-top.red{display:block;background:rgba(255,77,77,.14);border:1px solid rgba(255,77,77,.5);color:#ffb3b3}
.hub-freeze-top.amber{display:block;background:rgba(212,137,44,.14);border:1px solid rgba(212,137,44,.5);color:#d4892c}
.pb-diff-hero{display:none;border-radius:10px;padding:10px 12px;margin-bottom:10px;font-family:var(--mono);font-size:12px;background:rgba(212,137,44,.1);border:1px solid rgba(212,137,44,.35);color:#ffe8c8}
.hub-sl-mini{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-top:6px}
.hub-sl-chip{font-family:var(--mono);font-size:9px;padding:3px 7px;border-radius:5px;background:var(--bg4);border:1px solid var(--b1);color:var(--t2)}
.hub-sl-link{font-size:10px;color:#5bb0ff;margin-left:4px}
.pb-tier2 summary.pb-tier-sum{cursor:pointer;list-style:none;padding:10px 14px;font-family:var(--mono);font-size:11px;font-weight:800;color:var(--t3);border:1px dashed var(--b1);border-radius:8px;margin-bottom:10px}
.pb-tier2 summary.pb-tier-sum::-webkit-details-marker{display:none}
.pb-tier2[open] summary.pb-tier-sum{color:var(--crypto-2);border-color:rgba(247,147,26,.35)}
.wf-section{margin-top:28px}
.wf-head{font-family:var(--mono);font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--t3);margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--b1)}
.wf-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
body[data-hub-mode="pre"] .card[data-phase="review"]{opacity:.55}
body[data-hub-mode="rth"] .card[data-phase="plan"]{opacity:.85}
body[data-hub-mode="review"] .card[data-phase="scan"]{opacity:.55}
.tt-fab.journal-fab{background:linear-gradient(135deg,#a78bfa,#22d66b);box-shadow:0 6px 20px rgba(167,139,250,.35)}
"""

if "HUB COCKPIT v542" not in html:
    html = html.replace("/* === TODAY'S PLAYBOOK", HUB_CSS + "\n/* === TODAY'S PLAYBOOK", 1)

html = html.replace("tt-v537", '<span id="suiteVerBadge">tt-v542</span>')
html = html.replace('<span id="suiteVerBadge">tt-v542</span>', 'tt-v542')  # fix double if re-run
html = re.sub(
    r'<span title="Versiune cache[^"]*"[^>]*>tt-v542</span>',
    '<span id="suiteVerBadge" title="Versiune cache suită" style="font-family:var(--mono,monospace);font-size:10px;font-weight:700;color:var(--crypto-1,#f7931a);border:1px solid rgba(247,147,26,.4);background:rgba(247,147,26,.12);padding:2px 7px;border-radius:6px;margin-left:8px">tt-v542</span>',
    html, count=1
)

# Dash: remove wRisk/wDanger, add hubCmd full width
old_dash_end = """    <div class="widget" id="wRisk" style="display:none">
      <div class="w-lbl">🔄 Regim de risc</div>
      <div class="w-val" id="riskVal" style="font-size:18px">—</div>
      <div class="w-sub" id="riskSub">se calculează…</div>
    </div>
    <div class="widget" id="wDanger" style="display:none;cursor:pointer" onclick="location.href='macro-dashboard/'" title="Danger Score al zilei (din Macro Dashboard) — click">
      <div class="w-lbl">⚠️ Danger Score</div>
      <div class="w-val" id="dangerVal" style="font-size:18px">—</div>
      <div class="w-sub" id="dangerSub">mediul zilei</div>
    </div>
"""
if old_dash_end in html:
    html = html.replace(old_dash_end, "    <div class=\"hub-cmd\" id=\"hubCmd\"><div class=\"hub-cmd-cell lvl-neut\"><div class=\"hub-cmd-lbl\">Desk</div><div class=\"hub-cmd-val\">⏳</div></div></div>\n")

# Session bar + cockpit before brief
COCKPIT_BLOCK = """
  <div class="hub-session" id="hubSessionBar">
    <span class="hub-session-lbl">Mod sesiune</span>
    <div class="hub-mode">
      <button type="button" id="hubModePre">🌅 Pre</button>
      <button type="button" id="hubModeRth" class="on">📈 RTH</button>
      <button type="button" id="hubModeReview">🔬 Review</button>
    </div>
    <button type="button" class="hub-health-pill" id="hubHealthPill" title="Suite Health">🩺 …</button>
  </div>

  <div id="hubFreezeTop" class="hub-freeze-top"></div>
  <section class="hub-cockpit" id="hubCockpit">
    <div>
      <div class="hub-cockpit-lbl">☀️ MORNING COCKPIT — azi tradez?</div>
      <div class="hub-strat" id="hubStrat">se evaluează…</div>
      <div class="hub-rule" id="hubRule">—</div>
      <div class="hub-meta" id="hubMeta">—</div>
      <div class="hub-plan" id="hubPlan">—</div>
      <div class="hub-blockers" id="hubBlockers"></div>
      <div class="hub-sl-mini" id="hubSlMini"></div>
    </div>
    <div class="hub-go">
      <div class="hub-go-num caution" id="hubGoNum">—</div>
      <div class="hub-go-lbl" id="hubGoLbl">GO score</div>
      <div class="hub-go-track"><div class="hub-go-fill" id="hubGoFill" style="width:0"></div></div>
    </div>
    <div class="hub-cockpit-actions">
      <a class="primary" href="./router/">🧭 Router Deep →</a>
      <a href="./governor/">🛑 Governor</a>
      <a href="./portfolio/">🛡️ Portfolio</a>
      <a href="./journal/">📓 Journal</a>
    </div>
  </section>

"""
if 'id="hubCockpit"' not in html:
    html = html.replace('  <!-- TODAY\'S PLAYBOOK', COCKPIT_BLOCK + "  <!-- TODAY'S PLAYBOOK", 1)

# pbDiff hero + tier2
if 'id="pbDiffHero"' not in html:
    html = html.replace(
        '<div class="pb-hero" id="pbHero">',
        '<div class="pb-diff-hero" id="pbDiffHero"></div>\n      <div class="pb-hero" id="pbHero">',
        1
    )

tier_marker = '      <div class="pb-section">\n        <div class="pb-section-head"><h3>🤖 Nota AI de dimineață</h3>'
tier_replace = """      <details class="pb-tier2" id="pbTier2">
        <summary class="pb-tier-sum">📂 Mai mult azi — earnings · sector · picks · STL · sugestii · WL events · AI</summary>
"""
if 'id="pbTier2"' not in html and tier_marker in html:
    html = html.replace(tier_marker, tier_replace + tier_marker, 1)
    # close tier2 before pbRefreshInfo
    html = html.replace(
        '      <div style="font-family:var(--mono);font-size:10.5px;color:var(--t3);text-align:right" id="pbRefreshInfo">—</div>',
        '      </details>\n      <div style="font-family:var(--mono);font-size:10.5px;color:var(--t3);text-align:right" id="pbRefreshInfo">—</div>',
        1
    )

# Workflow sections for cards - assign data-phase via regex on main grid
PHASES = {
    "macro-dashboard": "plan", "sector-rotation": "plan", "governor": "plan", "router": "plan",
    "nasdaq-scanner": "scan", "watchlist-monitor": "scan", "pump-radar": "scan", "smart-trade-long": "scan",
    "market-events": "scan", "earnings-hub": "scan", "markov-lab": "scan", "alerts": "execute",
    "journal": "execute", "portfolio": "execute",
    "weekly": "review", "postmortem": "review", "equity": "review", "shadow-book": "review", "health": "review",
    "guide": "review",
}
if 'class="wf-section"' not in html:
    m = re.search(r'<main class="grid" id="hubCards">\s*\n', html)
    if m:
        insert = m.group(0)
        # We'll wrap by replacing main content - simpler: add data-phase to each card href
        for slug, phase in PHASES.items():
            html = re.sub(
                rf'(<a href="\./{re.escape(slug)}/"[^>]*class="card)',
                rf'\1" data-phase="{phase}',
                html, count=1
            )
        # Fix broken class attr - the regex added wrong. Let me fix approach.

# Fix data-phase injection - redo properly
for slug, phase in PHASES.items():
    pat = rf'(<a href="\./{re.escape(slug)}/")((?! data-phase)[^>]*)(class="card)'
    html = re.sub(pat, rf'\1 data-phase="{phase}"\2\3', html, count=1)

# Wrap hubCards into workflow sections with python
if 'wf-section' not in html:
    start = html.find('<main class="grid" id="hubCards">')
    end = html.find('</main>', start)
    if start > 0 and end > 0:
        inner = html[start + len('<main class="grid" id="hubCards">'):end]
        groups = {
            'plan': '📋 Plan — context & risc',
            'scan': '🔍 Scan — oportunități',
            'execute': '⚡ Execute — poziții & alerte',
            'review': '📊 Review — lecții & infrastructură',
        }
        built = '\n'
        for phase, title in groups.items():
            cards = re.findall(rf'<a href="[^"]*"[^>]*data-phase="{phase}"[^>]*>.*?</a>\s*', inner, re.S)
            legacy = re.findall(r'<a href="https://[^"]*"[^>]*class="card legacy"[^>]*>.*?</a>\s*', inner, re.S) if phase == 'scan' else []
            if not cards and not legacy:
                continue
            built += f'  <section class="wf-section" data-wf="{phase}">\n    <div class="wf-head">{title}</div>\n    <div class="wf-grid">\n'
            built += ''.join(cards)
            if legacy:
                built += ''.join(legacy)
            built += '    </div>\n  </section>\n'
        # cards without data-phase (alerts etc might have been missed)
        orphan = re.sub(r'<a [^>]*data-phase="[^"]*"[^>]*>.*?</a>\s*', '', inner, flags=re.S)
        orphan = re.sub(r'<a href="https://[^"]*"[^>]*class="card legacy"[^>]*>.*?</a>\s*', '', orphan, flags=re.S)
        if orphan.strip():
            built += f'  <section class="wf-section"><div class="wf-head">Altele</div><div class="wf-grid">{orphan}</div></section>\n'
        html = html[:start] + '<main id="hubCards">\n' + built + html[end:]

# FAB -> journal
html = html.replace(
    '<button class="tt-fab" onclick="openTradeTracker()" title="Trade Plans (entry/SL/TP/status)">📓</button>',
    '<a class="tt-fab journal-fab" href="./journal/" title="Journal — execuții reale">📓</a>'
)
# style tt-fab for anchor
html = html.replace(
    '.tt-fab{position:fixed;bottom:20px;right:20px;',
    '.tt-fab{position:fixed;bottom:20px;right:20px;text-decoration:none;'
)

# Remove playbook + ledger inline JS
html = re.sub(
    r'\n// ============ TODAY\'S PLAYBOOK.*?</script>\n<script src="nav\.js"',
    '\n<script src="lib/suite-version.js"></script>\n<script src="lib/hub-health.js"></script>\n<script src="lib/hub-brief.js?v=1"></script>\n<script src="lib/hub-ledger.js?v=1"></script>\n<script>\n(function(){\n  if (window.SUITE_VERSION_SHORT) {\n    const b = document.getElementById(\'suiteVerBadge\');\n    if (b) b.textContent = window.SUITE_VERSION_SHORT;\n  }\n  if (window.HB) HB.init();\n  if (window.HUB_HEALTH) HUB_HEALTH.init();\n})();\n</script>\n<script src="nav.js"',
    html, count=1, flags=re.S
)

# Dash widgets JS: call renderHubCockpit on market update
if 'renderHubCockpit' not in html and 'hub:market' in html:
    html = html.replace(
        "window.dispatchEvent(new CustomEvent('hub:market'));",
        "window.dispatchEvent(new CustomEvent('hub:market')); if (window.HB) HB.renderCockpit();"
    )

# Remove duplicate telegram.js if present
html = re.sub(r'<script src="lib/telegram\.js"></script>\s*<script src="lib/telegram\.js"></script>', '<script src="lib/telegram.js"></script>', html)

p.write_text(html, encoding="utf-8")
print("patched index.html", len(html))