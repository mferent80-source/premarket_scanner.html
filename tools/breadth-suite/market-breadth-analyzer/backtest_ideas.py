#!/usr/bin/env python3
"""
Backtest al screening-ului de IDEI: valideaza daca liderii de forta relativa (RS)
bat media pietei forward. La mai multe date-ancora din istoric, alege top quintila
dupa RS (randament 126z) si masoara randamentul forward 60z vs media universului.
Univers: ~120 nume liliale S&P500. Sursa: Yahoo (2y). Output pt dashboard.
"""
import argparse
import csv
import io
import json
import os
import statistics as st
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import requests

BASE = os.path.dirname(os.path.abspath(__file__))
UA = {"User-Agent": "Mozilla/5.0"}
CONSTITUENTS = "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv"


import yahoo_cache


def closes(sym):
    return yahoo_cache.get_closes(sym, "2y", min_len=400)


def universe(n=120):
    txt = requests.get(CONSTITUENTS, headers=UA, timeout=20).text
    syms = [row["Symbol"].replace(".", "-") for row in csv.DictReader(io.StringIO(txt)) if row.get("Symbol")]
    step = max(1, len(syms) // n)
    return syms[::step][:n]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", default=os.path.join(BASE, "dashboard", "backtest_ideas.json"))
    args = ap.parse_args()
    os.makedirs(os.path.dirname(args.output), exist_ok=True)

    print("Backtest idei: descarc univers ~120 nume (2y)...")
    syms = universe(120)
    with ThreadPoolExecutor(max_workers=8) as ex:
        cache = {s: c for s, c in zip(syms, ex.map(closes, syms)) if c}
    print(f"Descarcate: {len(cache)}")

    L = min(len(c) for c in cache.values())
    series = {s: c[-L:] for s, c in cache.items()}
    anchors = [L - 60 - k for k in (189, 126, 63) if L - 60 - k > 126]  # date-ancora, lasa 60z forward

    top_fwd, all_fwd = [], []
    for t in anchors:
        rs = []
        for s, c in series.items():
            if c[t] and c[t - 126]:
                rs.append((s, c[t] / c[t - 126] - 1))
        if len(rs) < 20:
            continue
        rs.sort(key=lambda x: x[1], reverse=True)
        q = max(3, len(rs) // 5)
        top = {s for s, _ in rs[:q]}
        for s, _ in rs:
            fwd = series[s][t + 60] / series[s][t] - 1
            all_fwd.append(fwd)
            if s in top:
                top_fwd.append(fwd)

    if not top_fwd:
        json.dump({"error": "date insuficiente"}, open(args.output, "w", encoding="utf-8"))
        print("Date insuficiente."); return

    top_med = st.median(top_fwd) * 100
    all_med = st.median(all_fwd) * 100
    edge = top_med - all_med
    top_pos = sum(1 for x in top_fwd if x > 0) / len(top_fwd) * 100
    out = {"generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
           "anchors": len(anchors), "universe": len(cache),
           "top_quintile_fwd60_med": round(top_med, 2), "universe_fwd60_med": round(all_med, 2),
           "edge_pp": round(edge, 2), "top_pos_pct": round(top_pos), "n_top": len(top_fwd),
           "verdict": (f"Liderii RS BAT piata: +{edge:.2f}pp forward 60z" if edge > 0.5 else
                       f"Liderii RS NU bat clar piata ({edge:+.2f}pp) - momentum slab in acest esantion" if edge < -0.5 else
                       f"Fara edge clar ({edge:+.2f}pp)"),
           "note": ("LIMITARI SERIOASE: (1) SURVIVORSHIP BIAS - universul e S&P500 de AZI testat "
                    "pe trecut, deci edge-ul poate fi partial artefact; (2) doar 3 ancore cu ferestre "
                    "forward suprapuse = observatii corelate, fara semnificatie statistica; "
                    "(3) fara costuri de tranzactionare. Trateaza ca DIRECTIONAL, nu ca dovada.")}
    json.dump(out, open(args.output, "w", encoding="utf-8"), indent=2)
    print(f"Top quintila fwd60: {top_med:+.2f}% vs univers {all_med:+.2f}% -> edge {edge:+.2f}pp ({top_pos:.0f}% pozitive)")
    print(out["verdict"])


if __name__ == "__main__":
    main()
