#!/usr/bin/env python3
"""
#8 - Reimprospateaza lista de constituenti Nasdaq-100 din Wikipedia
si rescrie blocul NDX100 din nasdaq100_breadth.py.
Ruleaza ocazional (ex. trimestrial, dupa rebalansari). Nu face parte din rularea zilnica.
Fara dependinte externe in afara de `requests`.
"""
import os
import re
import sys

import requests

SCRIPT = os.path.join(os.path.dirname(__file__), "nasdaq100_breadth.py")
WIKI = "https://en.wikipedia.org/wiki/Nasdaq-100"


def scrape_tickers():
    html = requests.get(WIKI, headers={"User-Agent": "Mozilla/5.0"}, timeout=20).text
    # Gaseste tabelul de constituenti: randuri cu link la simbol pe NASDAQ.
    # Simbolurile apar in celule; extragem candidati 1-5 litere majuscule.
    # Strategie robusta: ia sectiunea dupa "Components" si extrage tickere din <td>.
    idx = html.find("Ticker")
    section = html[idx:idx + 60000] if idx != -1 else html
    # tickere din celule table: <td>...<a ...>SYMB</a>
    cands = re.findall(r"<td[^>]*>\s*(?:<a[^>]*>)?([A-Z]{1,5})(?:</a>)?\s*</td>", section)
    # filtreaza zgomot comun
    bad = {"USA", "US", "N", "A", "INC", "CORP", "LTD", "PLC", "NA"}
    seen, out = set(), []
    for c in cands:
        if c in bad or c in seen:
            continue
        seen.add(c); out.append(c)
    return out


def main():
    print("Descarc lista Nasdaq-100 din Wikipedia...")
    try:
        tickers = scrape_tickers()
    except Exception as e:
        print(f"EROARE scraping: {e}"); sys.exit(1)

    if not (80 <= len(tickers) <= 110):
        print(f"AVERTISMENT: am extras {len(tickers)} tickere (asteptat ~100). "
              f"Verifica manual inainte de a suprascrie. Nu am modificat scriptul.")
        print("Extras:", ", ".join(tickers))
        sys.exit(2)

    # Formateaza in blocul Python (10 per rand)
    rows = []
    for i in range(0, len(tickers), 10):
        chunk = tickers[i:i + 10]
        rows.append("    " + ",".join(f'"{t}"' for t in chunk) + ",")
    block = "NDX100 = [\n" + "\n".join(rows) + "\n]"

    src = open(SCRIPT, encoding="utf-8").read()
    new_src, n = re.subn(r"NDX100 = \[.*?\n\]", block, src, count=1, flags=re.DOTALL)
    if n != 1:
        print("EROARE: nu am gasit blocul NDX100 in script."); sys.exit(3)

    # backup
    open(SCRIPT + ".bak", "w", encoding="utf-8").write(src)
    open(SCRIPT, "w", encoding="utf-8").write(new_src)
    print(f"OK: lista actualizata cu {len(tickers)} tickere. Backup: {os.path.basename(SCRIPT)}.bak")
    print("Verifica cu o rulare: python nasdaq100_breadth.py")


if __name__ == "__main__":
    main()
