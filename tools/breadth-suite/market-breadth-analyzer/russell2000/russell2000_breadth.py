#!/usr/bin/env python3
"""
Russell 2000 / US Small-Cap Breadth Analyzer (proxy pe esantion)
Masoara participarea small-caps ca gauge de risk-appetite:
  - % din esantion peste MM200 (breadth de fond)
  - % din esantion peste MM50  (momentum scurt)
NOTA: nu foloseste toti cei 2000 membri (imposibil de tras zilnic fara rate-limit).
Foloseste un ESANTION reprezentativ, diversificat pe sectoare, ~120 small/mid-caps US.
Sursa: Yahoo Finance chart API (gratuit, fara API key). Doar `requests`.
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

import requests

# Esantion reprezentativ de small/mid-caps US (proxy Russell 2000), diversificat pe sectoare.
SMALLCAP_SAMPLE = [
    # Regional banks / financials
    "WAL","PB","CADE","SNV","WBS","VLY","FHB","ONB","UMBF","HWC",
    "ABCB","FFIN","GBCI","INDB","PPBI","WSFS","FULT","BANF","CATY","TCBI",
    # Industrials
    "AIT","MLI","GTLS","RBC","KAI","ATKR","EXPO","SITE","AAON","CSWI",
    "TREX","BCC","GVA","STRL","ROAD","MYRG","POWL","GVA",
    # Technology
    "FORM","POWI","SITM","RMBS","CRUS","DIOD","AMBA","EXTR","CALX","SMTC",
    "PLXS","NOVT","BMI",
    # Healthcare / biotech
    "HALO","MMSI","TNDM","IRTC","CYTK","HRMY","ANIP","LNTH","VCEL","INSP",
    "PCRX","ADMA",
    # Consumer / retail
    "SHAK","WING","BOOT","CROX","FLWS","CAKE","PLAY","DIN","CBRL","SHOO",
    "PATK","HELE","FOXF","THRM","LCII","DORM",
    # Energy
    "MGY","CIVI","CHRD","SM","PR","GPOR","TALO","VTLE","WKC",
    # Materials
    "CMC","CRS","MP","HCC","CDE","UEC","SXC","UEC",
    # REITs / real estate
    "STAG","LXP","EPR","NSA","IRT","ELME","UE","CVCO",
    # Misc / other
    "SCS","MTX","KFY","SLVM","ENV","AVAV","KTOS","MTRN",
]


sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import yahoo_cache  # noqa: E402


def fetch_closes(symbol, session, range_="1y"):
    return yahoo_cache.get_closes(symbol, range_, min_len=200)


def sma(values, window):
    return sum(values[-window:]) / window if len(values) >= window else None


def classify(pct200):
    if pct200 >= 70: return "Strong", "90-100%", "Small-caps larg participante; risk-on puternic."
    if pct200 >= 55: return "Healthy", "75-90%", "Participare small-cap sanatoasa; apetit de risc bun."
    if pct200 >= 40: return "Neutral", "60-75%", "Small-caps mixte; selectiv."
    if pct200 >= 25: return "Weakening", "40-60%", "Small-caps slabesc; risk-off incipient."
    return "Critical", "25-40%", "Small-caps foarte slabe; aversiune la risc."


def main():
    ap = argparse.ArgumentParser(description="Russell 2000 / Small-Cap Breadth (proxy)")
    ap.add_argument("--output-dir", default=os.path.join(os.path.dirname(__file__), "reports"))
    ap.add_argument("--range", default="1y")
    args = ap.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)
    now = datetime.now(timezone.utc)
    stamp = now.strftime("%Y-%m-%d_%H%M%S"); today = now.strftime("%Y-%m-%d")

    tickers = sorted(set(SMALLCAP_SAMPLE))
    print("=" * 70)
    print("Russell 2000 / Small-Cap Breadth (proxy pe esantion, Yahoo Finance)")
    print("=" * 70)
    print(f"\nDescarc date pentru {len(tickers)} small-caps (esantion)...")

    session = requests.Session()
    above200 = above50 = valid = 0
    failed = []
    observed = []
    expected_date = yahoo_cache.observation_date("SPY", args.range)
    for i, sym in enumerate(tickers, 1):
        closes = fetch_closes(sym, session, args.range)
        if not closes or yahoo_cache.observation_date(sym, args.range) != expected_date:
            failed.append(sym); print(f"  [{i:>3}/{len(tickers)}] {sym:<6} -- indisponibil"); continue
        observed.append(yahoo_cache.observation_date(sym, args.range))
        last = closes[-1]; ma200 = sma(closes, 200); ma50 = sma(closes, 50); valid += 1
        a200 = ma200 is not None and last > ma200
        a50 = ma50 is not None and last > ma50
        above200 += 1 if a200 else 0; above50 += 1 if a50 else 0
        print(f"  [{i:>3}/{len(tickers)}] {sym:<6} {last:>9.2f}  {'A200' if a200 else '----'} {'A50' if a50 else '---'}")

    if valid == 0:
        print("\nEROARE: niciun ticker descarcat."); sys.exit(2)

    today = min(observed)
    if valid / len(tickers) < 0.80:
        raise RuntimeError("Coverage below 80%; breadth excluded")

    pct200 = round(100 * above200 / valid, 1)
    pct50 = round(100 * above50 / valid, 1)
    composite = round(0.6 * pct200 + 0.4 * pct50, 1)
    zone, exposure, guidance = classify(pct200)

    hist_path = os.path.join(args.output_dir, "russell2000_breadth_history.json")
    history = []
    if os.path.exists(hist_path):
        try: history = json.load(open(hist_path, encoding="utf-8"))
        except Exception: history = []
    prev = history[-1] if history else None
    trend_dir, delta = "stable", 0
    if prev and prev.get("data_date") != today:
        delta = round(composite - prev["composite"], 1)
        trend_dir = "improving" if delta > 1 else "deteriorating" if delta < -1 else "stable"
    entry = {"data_date": today, "composite": composite, "pct_above_200ma": pct200,
             "pct_above_50ma": pct50, "recorded_at": now.strftime("%Y-%m-%d %H:%M:%S")}
    history = [h for h in history if h.get("data_date") != today] + [entry]
    json.dump(history[-30:], open(hist_path, "w", encoding="utf-8"), indent=2)

    result = {
        "generated_at": now.strftime("%Y-%m-%d %H:%M:%S UTC"), "data_date": today,
        "source": "Yahoo Finance chart API", "basis": "Russell 2000 proxy (esantion small-cap)",
        "constituents_total": len(tickers), "constituents_valid": valid, "constituents_failed": failed,
        "pct_above_200ma": pct200, "pct_above_50ma": pct50, "composite_score": composite,
        "zone": zone, "exposure_guidance": exposure, "guidance": guidance,
        "trend": {"direction": trend_dir, "delta": delta},
    }
    json.dump(result, open(os.path.join(args.output_dir, f"russell2000_breadth_{stamp}.json"), "w", encoding="utf-8"), indent=2)

    md = f"""# Russell 2000 / Small-Cap Breadth (proxy pe esantion)

**Data:** {today}  |  **Sursa:** Yahoo Finance  |  **Esantion valid:** {valid}/{len(tickers)}

## Scor compozit: {composite}/100 - {zone}
- **% peste MM200:** {pct200}% ({above200}/{valid})
- **% peste MM50:** {pct50}% ({above50}/{valid})
- **Expunere:** {exposure}
- **Trend:** {trend_dir} ({'+' if delta>0 else ''}{delta})

{guidance}

> NOTA: proxy pe un esantion reprezentativ de ~{len(tickers)} small-caps, NU toti cei 2000 membri.
"""
    open(os.path.join(args.output_dir, f"russell2000_breadth_{stamp}.md"), "w", encoding="utf-8").write(md)

    print("\n" + "=" * 70)
    print(f"  Scor compozit : {composite}/100  ({zone})")
    print(f"  % peste MM200 : {pct200}%   ({above200}/{valid})")
    print(f"  % peste MM50  : {pct50}%   ({above50}/{valid})")
    print(f"  Expunere      : {exposure}   |  Trend: {trend_dir} ({'+' if delta>0 else ''}{delta})")
    if failed: print(f"  Fara date     : {len(failed)} ({', '.join(failed[:8])}{'...' if len(failed)>8 else ''})")
    print("=" * 70)


if __name__ == "__main__":
    main()
