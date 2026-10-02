#!/usr/bin/env python3
"""
Intermarket & regim macro (complementar breadth-ului):
  - VIX term structure (^VIX vs ^VIX3M): backwardation = stres acut
  - DXY (dolar), Gold, Oil, HY (HYG) - trenduri 20z ca backdrop de risc
Sursa: Yahoo Finance. Output JSON pt dashboard.
"""
import argparse
import json
import os
import time
from datetime import datetime

import requests

UA = {"User-Agent": "Mozilla/5.0"}
TICKERS = {"^VIX": "VIX", "^VIX3M": "VIX3M", "DX-Y.NYB": "DXY", "GC=F": "Gold", "CL=F": "Oil", "HYG": "HYG"}


import yahoo_cache


def closes(sym):
    return yahoo_cache.get_closes(sym, "3mo", min_len=1)


def trend20(c):
    return (c[-1] / c[-21] - 1) * 100 if c and len(c) > 21 else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboard", "intermarket.json"))
    args = ap.parse_args()
    os.makedirs(os.path.dirname(args.output), exist_ok=True)

    data = {k: closes(k) for k in TICKERS}
    vix = data["^VIX"][-1] if data["^VIX"] else None
    vix3 = data["^VIX3M"][-1] if data["^VIX3M"] else None
    term = round(vix / vix3, 3) if vix and vix3 else None
    backwardation = term is not None and term > 1.0

    signals = []
    score = 0
    if term is not None:
        if backwardation:
            signals.append(f"VIX term {term} > 1 - BACKWARDATION (stres acut, risk-off)"); score -= 2
        elif term < 0.9:
            signals.append(f"VIX term {term} - contango normal (calm)"); score += 1
        else:
            signals.append(f"VIX term {term} - neutru")
    dxy = trend20(data["DX-Y.NYB"])
    if dxy is not None:
        # dolar puternic = headwind pt actiuni/risc
        signals.append(f"DXY {dxy:+.1f}% / 20z" + (" (dolar puternic = headwind)" if dxy > 1 else " (dolar slab = tailwind)" if dxy < -1 else ""))
        score += -1 if dxy > 1.5 else 1 if dxy < -1.5 else 0
    hy = trend20(data["HYG"])
    if hy is not None:
        signals.append(f"HY (HYG) {hy:+.1f}% / 20z" + (" (credit risk-on)" if hy > 0 else " (credit risk-off)"))
        score += 1 if hy > 0.5 else -1 if hy < -0.5 else 0
    gold = trend20(data["GC=F"]); oil = trend20(data["CL=F"])
    if gold is not None: signals.append(f"Aur {gold:+.1f}% / 20z" + (" (fuga spre siguranta)" if gold > 3 else ""))
    if oil is not None: signals.append(f"Petrol {oil:+.1f}% / 20z")

    verdict = "Macro RISK-ON" if score >= 2 else "Macro RISK-OFF" if score <= -2 else "Macro neutru/mixt"
    out = {"generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
           "vix": vix, "vix3m": vix3, "vix_term": term, "backwardation": backwardation,
           "score": score, "verdict": verdict, "signals": signals}
    json.dump(out, open(args.output, "w", encoding="utf-8"), indent=2)
    print(f"{verdict} (scor {score:+d}) | VIX term {term}")
    for s in signals: print("  - " + s)


if __name__ == "__main__":
    main()
