#!/usr/bin/env python3
"""
Nasdaq-100 Breadth Analyzer
Calculeaza cat de larga e participarea in Nasdaq-100:
  - % din componente peste MM200 (breadth clasic, trend de fond)
  - % din componente peste MM50  (momentum pe termen scurt)
Sursa: Yahoo Finance chart API (gratuit, fara API key).
Fara dependinte externe in afara de `requests`.
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

import requests

# Nasdaq-100 constituents (aproximativ, ~2025-2026). Lista se schimba ocazional;
# pentru breadth (procent din intreg) 1-2 nume lipsa nu afecteaza semnificativ.
NDX100 = [
    "AAPL","MSFT","NVDA","AMZN","META","AVGO","GOOGL","TSLA","COST",
    # NOTA: GOOG (clasa C) e exclus desi e in indice - GOOGL acopera Alphabet;
    # a numara ambele clase ar dubla ponderea aceleiasi companii in breadth.
    "NFLX","AMD","PEP","ADBE","LIN","CSCO","TMUS","INTU","QCOM","TXN",
    "AMGN","ISRG","AMAT","BKNG","HON","CMCSA","VRTX","ADP","PANW","GILD",
    "ADI","REGN","MU","SBUX","LRCX","MDLZ","KLAC","SNPS","CDNS","PYPL",
    "MELI","CRWD","MAR","ABNB","CTAS","ORLY","CEG","MRVL","NXPI","PCAR",
    "ROP","CSX","WDAY","MNST","ADSK","FTNT","AEP","DASH","PAYX","KDP",
    "CHTR","TTD","ROST","IDXX","FANG","EA","DDOG","XEL","VRSK",
    "CPRT","EXC","KHC","CTSH","FAST","BKR","GEHC","CCEP","MCHP","DXCM",
    "ON","BIIB","ZS","GFS","TEAM","CDW","WBD","ILMN","TTWO",
    "MDB","ARM","SMCI","LULU","PDD","APP","PLTR","MSTR","AXON",
]


sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import yahoo_cache  # noqa: E402


def fetch_closes(symbol, session, range_="1y"):
    """Returneaza lista de close-uri (float) pentru simbol, sau None. Cache pe zi."""
    return yahoo_cache.get_closes(symbol, range_, min_len=200)


def sma(values, window):
    if len(values) < window:
        return None
    return sum(values[-window:]) / window


def classify(pct200):
    if pct200 >= 70:
        return "Strong", "90-100%", "Participare foarte larga; trend puternic."
    if pct200 >= 55:
        return "Healthy", "75-90%", "Raliu larg-bazat, sanatos."
    if pct200 >= 40:
        return "Neutral", "60-75%", "Semnale mixte; selectiv, stopuri stranse."
    if pct200 >= 25:
        return "Weakening", "40-60%", "Participare in scadere; ridica cash."
    return "Critical", "25-40%", "Breadth foarte slab; prezervare capital."


def main():
    ap = argparse.ArgumentParser(description="Nasdaq-100 Breadth Analyzer")
    ap.add_argument("--output-dir", default=os.path.join(os.path.dirname(__file__), "reports"))
    ap.add_argument("--range", default="1y", help="fereastra Yahoo (1y suficient pentru MM200)")
    args = ap.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)
    now = datetime.now(timezone.utc)
    stamp = now.strftime("%Y-%m-%d_%H%M%S")
    today = now.strftime("%Y-%m-%d")

    print("=" * 70)
    print("Nasdaq-100 Breadth Analyzer  (sursa: Yahoo Finance, fara API key)")
    print("=" * 70)
    print(f"\nDescarc date pentru {len(NDX100)} componente...")

    session = requests.Session()
    above200 = above50 = valid = 0
    failed = []
    observed = []
    expected_date = yahoo_cache.observation_date("SPY", args.range)
    for i, sym in enumerate(NDX100, 1):
        closes = fetch_closes(sym, session, args.range)
        if not closes or yahoo_cache.observation_date(sym, args.range) != expected_date:
            failed.append(sym)
            print(f"  [{i:>3}/{len(NDX100)}] {sym:<6} -- date indisponibile")
            continue
        observed.append(yahoo_cache.observation_date(sym, args.range))
        last = closes[-1]
        ma200 = sma(closes, 200)
        ma50 = sma(closes, 50)
        valid += 1
        a200 = ma200 is not None and last > ma200
        a50 = ma50 is not None and last > ma50
        above200 += 1 if a200 else 0
        above50 += 1 if a50 else 0
        flag = ("A200" if a200 else "----") + " " + ("A50" if a50 else "---")
        print(f"  [{i:>3}/{len(NDX100)}] {sym:<6} {last:>9.2f}  {flag}")

    if valid == 0:
        print("\nEROARE: nicio componenta descarcata. Verifica internetul.")
        sys.exit(2)

    today = min(observed)
    if valid / len(NDX100) < 0.80:
        raise RuntimeError("Coverage below 80%; breadth excluded")

    pct200 = round(100 * above200 / valid, 1)
    pct50 = round(100 * above50 / valid, 1)
    composite = round(0.6 * pct200 + 0.4 * pct50, 1)
    zone, exposure, guidance = classify(pct200)

    # Istoric + trend
    hist_path = os.path.join(args.output_dir, "nasdaq100_breadth_history.json")
    history = []
    if os.path.exists(hist_path):
        try:
            history = json.load(open(hist_path, encoding="utf-8"))
        except Exception:
            history = []
    prev = history[-1] if history else None
    trend_dir, delta = "stable", 0
    if prev and prev.get("data_date") != today:
        delta = round(composite - prev["composite"], 1)
        trend_dir = "improving" if delta > 1 else "deteriorating" if delta < -1 else "stable"
    entry = {"data_date": today, "composite": composite, "pct_above_200ma": pct200,
             "pct_above_50ma": pct50, "recorded_at": now.strftime("%Y-%m-%d %H:%M:%S")}
    history = [h for h in history if h.get("data_date") != today] + [entry]
    history = history[-30:]
    json.dump(history, open(hist_path, "w", encoding="utf-8"), indent=2)

    result = {
        "generated_at": now.strftime("%Y-%m-%d %H:%M:%S UTC"),
        "data_date": today,
        "source": "Yahoo Finance chart API",
        "basis": "Nasdaq sample: original approximate 2025–2026 list; not certified current index",
        "constituents_total": len(NDX100),
        "constituents_valid": valid,
        "constituents_failed": failed,
        "pct_above_200ma": pct200,
        "pct_above_50ma": pct50,
        "composite_score": composite,
        "zone": zone,
        "exposure_guidance": exposure,
        "guidance": guidance,
        "trend": {"direction": trend_dir, "delta": delta},
    }

    json_path = os.path.join(args.output_dir, f"nasdaq100_breadth_{stamp}.json")
    json.dump(result, open(json_path, "w", encoding="utf-8"), indent=2)

    md = f"""# Nasdaq-100 Breadth Report

**Data:** {today}  |  **Sursa:** Yahoo Finance  |  **Componente valide:** {valid}/{len(NDX100)}

## Scor compozit: {composite}/100 — {zone}
- **% peste MM200 (breadth de fond):** {pct200}%  ({above200}/{valid})
- **% peste MM50 (momentum scurt):** {pct50}%  ({above50}/{valid})
- **Expunere recomandata:** {exposure}
- **Trend fata de ultima rulare:** {trend_dir} ({'+' if delta>0 else ''}{delta})

{guidance}
"""
    if failed:
        md += f"\n> Note: {len(failed)} simboluri fara date: {', '.join(failed)}\n"
    md_path = os.path.join(args.output_dir, f"nasdaq100_breadth_{stamp}.md")
    open(md_path, "w", encoding="utf-8").write(md)

    print("\n" + "=" * 70)
    print(f"  Scor compozit : {composite}/100  ({zone})")
    print(f"  % peste MM200 : {pct200}%   ({above200}/{valid})")
    print(f"  % peste MM50  : {pct50}%   ({above50}/{valid})")
    print(f"  Expunere      : {exposure}")
    print(f"  Trend         : {trend_dir} ({'+' if delta>0 else ''}{delta})")
    if failed:
        print(f"  Fara date     : {len(failed)} ({', '.join(failed[:8])}{'...' if len(failed)>8 else ''})")
    print(f"  JSON          : {json_path}")
    print("=" * 70)


if __name__ == "__main__":
    main()
