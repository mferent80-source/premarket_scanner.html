#!/usr/bin/env python3
"""
Strat de confirmare a riscului - cross-check independent de breadth:
  - VIX (^VIX): nivel de frica
  - Credit: HYG/LQD - spread-uri high-yield (rising ratio = risk-on, spreads se string)
  - Breadth pret: RSP/SPY - equal-weight vs cap-weight (rising = participare se largeste)
Sursa: Yahoo Finance (gratuit). Output JSON pt dashboard.
"""
import argparse
import json
import os
import time
from datetime import datetime

import requests


import yahoo_cache


def fetch_closes(symbol, range_="6mo"):
    return yahoo_cache.get_closes(symbol, range_, min_len=1)


def trend_20d(series):
    """+1 daca ratia/valoarea a crescut pe 20 sesiuni, -1 daca a scazut."""
    if not series or len(series) < 21:
        return 0, 0.0
    chg = series[-1] / series[-21] - 1
    return (1 if chg > 0.002 else -1 if chg < -0.002 else 0), chg * 100


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboard", "confirmation.json"))
    args = ap.parse_args()
    os.makedirs(os.path.dirname(args.output), exist_ok=True)

    vix = fetch_closes("^VIX")
    hyg = fetch_closes("HYG"); lqd = fetch_closes("LQD")
    rsp = fetch_closes("RSP"); spy = fetch_closes("SPY")

    signals = []
    score = 0  # >0 risk-on confirmat, <0 risk-off

    # VIX
    vix_level = vix[-1] if vix else None
    if vix_level is not None:
        if vix_level < 15: s, txt = 1, f"VIX {vix_level:.1f} - calm (risk-on)"
        elif vix_level < 20: s, txt = 0, f"VIX {vix_level:.1f} - normal"
        elif vix_level < 30: s, txt = -1, f"VIX {vix_level:.1f} - ridicat (prudenta)"
        else: s, txt = -2, f"VIX {vix_level:.1f} - frica (risk-off)"
        score += s; signals.append(txt)

    # Credit HYG/LQD
    if hyg and lqd and len(hyg) == len(lqd):
        ratio = [h / l for h, l in zip(hyg, lqd)]
        d, chg = trend_20d(ratio)
        score += d
        signals.append(f"Credit HYG/LQD {'se string (risk-on)' if d>0 else 'se largesc (risk-off)' if d<0 else 'plate'} ({chg:+.1f}% / 20z)")

    # RSP/SPY (equal vs cap weight)
    if rsp and spy and len(rsp) == len(spy):
        ratio = [r / s for r, s in zip(rsp, spy)]
        d, chg = trend_20d(ratio)
        score += d
        signals.append(f"RSP/SPY {'se largeste (broad)' if d>0 else 'se ingusteaza (narrow)' if d<0 else 'plat'} ({chg:+.1f}% / 20z)")

    if score >= 2: verdict = "RISK-ON confirmat"
    elif score <= -2: verdict = "RISK-OFF confirmat"
    else: verdict = "Mixt / neconcludent"

    out = {"generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
           "score": score, "verdict": verdict, "signals": signals,
           "vix": round(vix_level, 1) if vix_level else None}
    json.dump(out, open(args.output, "w", encoding="utf-8"), indent=2)
    print(f"Confirmare: {verdict} (scor {score:+d})")
    for s in signals:
        print("  - " + s)
    print(f"Salvat: {args.output}")


if __name__ == "__main__":
    main()
