# -*- coding: utf-8 -*-
import pathlib
import re

p = pathlib.Path(__file__).resolve().parents[1] / "index.html"
html = p.read_text(encoding="utf-8")

html = html.replace("<script>\n<script src=\"lib/suite-version.js\">", "<script src=\"lib/suite-version.js\">")
html = re.sub(
    r'(\sdata-phase="(?:plan|scan|execute|review)")\s+([^>]*)\sdata-phase="(?:plan|scan|execute|review)"',
    r"\1 \2",
    html,
)
html = re.sub(
    r'class="card"\s+data-phase="(scan|plan|execute|review)\s+(\w+)"',
    r'class="card \2" data-phase="\1"',
    html,
)

if '<section class="wf-section"' not in html:
    start = html.find('<main class="grid" id="hubCards">')
    end = html.find("</main>", start)
    inner = html[start + len('<main class="grid" id="hubCards">'):end]
    groups = [
        ("plan", "📋 Plan — context & risc"),
        ("scan", "🔍 Scan — oportunități"),
        ("execute", "⚡ Execute — poziții & alerte"),
        ("review", "📊 Review — lecții & infrastructură"),
    ]
    built = "\n"
    for phase, title in groups:
        cards = re.findall(
            rf'<a href="[^"]*"[^>]*data-phase="{phase}"[^>]*>.*?</a>\s*',
            inner,
            re.S,
        )
        if not cards:
            continue
        built += f'  <section class="wf-section" data-wf="{phase}">\n'
        built += f'    <div class="wf-head">{title}</div>\n    <div class="wf-grid">\n'
        built += "".join(cards)
        built += "    </div>\n  </section>\n"
    leg = re.findall(
        r'<a href="https://[^"]*"[^>]*class="card legacy"[^>]*>.*?</a>\s*',
        inner,
        re.S,
    )
    if leg:
        built += '  <section class="wf-section" data-wf="legacy">\n'
        built += '    <div class="wf-head">Legacy</div>\n    <div class="wf-grid">\n'
        built += "".join(leg)
        built += "    </div>\n  </section>\n"
    html = html[:start] + "<main id=\"hubCards\">\n" + built + html[end:]

p.write_text(html, encoding="utf-8")
print("ok wf=", "wf-section" in html)