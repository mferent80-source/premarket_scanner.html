# -*- coding: utf-8 -*-
import pathlib

p = pathlib.Path(__file__).resolve().parents[1] / "index.html"
h = p.read_text(encoding="utf-8")

old = """      <details class="pb-tier2" id="pbTier2">
        <summary class="pb-tier-sum">📂 Mai mult azi — earnings · sector · picks · STL · sugestii · WL events · AI</summary>
      <div class="pb-section">
        <div class="pb-section-head"><h3>🤖 Nota AI de dimineață</h3><button class="pb-refresh-btn" id="pbAiBtn">✨ Generează</button></div>
        <div class="pb-section-body" id="pbBodyAi"><div class="pb-ai-empty">Apasă „✨ Generează" — AI sintetizează regim + piață + calendar + sectoare + semnale într-un verdict scurt pe azi (o dată/zi, cache).</div></div>
      </div>
      <div class="pb-section">"""

new = """      <div class="pb-section">"""

if old in h:
    h = h.replace(old, new, 1)
    print("removed AI from tier2 top")

marker = """        <div class="pb-section-body" id="pbBodyEvents"><div class="pb-loading">calendar economic…</div></div>
      </div>
      <div class="pb-section">
        <div class="pb-section-head"><h3>📊 Earnings next 7 zile (watchlist + mega-caps)</h3><span class="pb-count" id="pbCntEarnings">—</span><a class="pb-go" href="./earnings-hub/">Open Earnings →</a></div>"""

insert = """        <div class="pb-section-body" id="pbBodyEvents"><div class="pb-loading">calendar economic…</div></div>
      </div>
      <details class="pb-tier2" id="pbTier2">
        <summary class="pb-tier-sum">📂 Mai mult azi — earnings · sector · picks · STL · sugestii · WL events · AI</summary>
      <div class="pb-section">
        <div class="pb-section-head"><h3>🤖 Nota AI de dimineață</h3><button class="pb-refresh-btn" id="pbAiBtn">✨ Generează</button></div>
        <div class="pb-section-body" id="pbBodyAi"><div class="pb-ai-empty">Apasă „✨ Generează" — AI sintetizează regim + piață + calendar + sectoare + semnale într-un verdict scurt pe azi (o dată/zi, cache).</div></div>
      </div>
      <div class="pb-section">
        <div class="pb-section-head"><h3>📊 Earnings next 7 zile (watchlist + mega-caps)</h3><span class="pb-count" id="pbCntEarnings">—</span><a class="pb-go" href="./earnings-hub/">Open Earnings →</a></div>"""

if marker in h:
    h = h.replace(marker, insert, 1)
    print("moved tier2 start")

p.write_text(h, encoding="utf-8")