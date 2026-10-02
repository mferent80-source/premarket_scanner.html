#!/usr/bin/env python3
"""
Market timing O'Neil (bazat pe volum, complementar breadth-ului):
  - Distribution days: indice in scadere >=0.2% pe volum MAI MARE ca ziua precedenta
    (vanzare institutionala). 4-5+ in 25 sesiuni = piata sub presiune.
  - Follow-through day: dupa o corectie, zi cu +1.25%+ pe volum in crestere = reluare trend confirmata.
Indici: SPY (S&P500), QQQ (Nasdaq100), IWM (Russell2000). Sursa: Yahoo (gratuit).
"""
import argparse
import json
import os
import time
from datetime import datetime

import requests

INDICES = {"SPY": "S&P500", "QQQ": "Nasdaq100", "IWM": "Russell2000"}
UA = {"User-Agent": "Mozilla/5.0"}


import yahoo_cache


def fetch_ohlcv(symbol):
    rows = yahoo_cache.get_ohlcv(symbol, "1y")
    return [{"close": r["close"], "vol": r["vol"]} for r in rows] if rows else None


def sma(vals, w):
    return sum(vals[-w:]) / w if len(vals) >= w else None


def analyze_index(rows, window=25):
    closes = [r["close"] for r in rows]
    last = closes[-1]
    ma50 = sma(closes, 50); ma200 = sma(closes, 200)

    # Distribution days in ultimele `window` sesiuni (regula O'Neil de expirare:
    # o zi de distributie IESE din numaratoare daca indicele urca +5% peste
    # close-ul acelei zile - presiunea a fost absorbita).
    dist_days = []
    for i in range(len(rows) - window, len(rows)):
        if i <= 0:
            continue
        chg = rows[i]["close"] / rows[i - 1]["close"] - 1
        if chg <= -0.002 and rows[i]["vol"] > rows[i - 1]["vol"]:
            if closes[-1] < rows[i]["close"] * 1.05:  # inca activa (nu s-a rally-uit 5%)
                dist_days.append(i)
    dist_count = len(dist_days)

    # Follow-through day (O'Neil): +1.25%+ pe volum in crestere, in ZIUA 4+ a unei
    # incercari de rally (nu orice salt de langa un minim - ziua 1-3 e zgomot).
    ftd = None
    for i in range(len(rows) - window, len(rows)):
        if i < 15:
            continue
        chg = rows[i]["close"] / rows[i - 1]["close"] - 1
        if chg >= 0.0125 and rows[i]["vol"] > rows[i - 1]["vol"]:
            # gaseste minimul recent si ziua lui; FTD valid doar in ziua 4+ dupa minim
            lo_win = closes[max(0, i - 30):i]
            lo_val = min(lo_win)
            lo_idx = max(0, i - 30) + lo_win.index(lo_val)
            rally_day = i - lo_idx
            if rally_day >= 4 and closes[lo_idx] <= lo_val * 1.001:
                ftd = len(rows) - 1 - i  # cu cate sesiuni in urma
    # status
    above50 = ma50 is not None and last > ma50
    above200 = ma200 is not None and last > ma200
    if not above50:
        status = "CORECTIE" if not above200 else "sub MM50 (slabiciune)"
    elif dist_count >= 6:
        status = f"UPTREND SUB PRESIUNE GRAVA ({dist_count} dist.)"
    elif dist_count >= 4:
        status = f"uptrend sub presiune ({dist_count} dist.)"
    else:
        status = "uptrend confirmat"
    return {"dist_count": dist_count, "above_ma50": above50, "above_ma200": above200,
            "ftd_days_ago": ftd, "status": status}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboard", "market_timing.json"))
    args = ap.parse_args()
    os.makedirs(os.path.dirname(args.output), exist_ok=True)

    out = {"generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "indices": {}}
    worst = 0
    for sym, name in INDICES.items():
        rows = fetch_ohlcv(sym)
        if not rows:
            out["indices"][sym] = {"name": name, "error": "indisponibil"}; continue
        a = analyze_index(rows)
        a["name"] = name
        out["indices"][sym] = a
        worst = max(worst, a["dist_count"])
        ftd_txt = f", follow-through acum {a['ftd_days_ago']}z" if a["ftd_days_ago"] is not None else ""
        print(f"  {sym:<4} {name:<11} {a['dist_count']} dist.days -> {a['status']}{ftd_txt}")

    # Semnal agregat
    if worst >= 6:
        out["signal"] = f"ALERTA: pana la {worst} distribution days - vanzare institutionala grea"
    elif worst >= 4:
        out["signal"] = f"Precautie: pana la {worst} distribution days - presiune institutionala"
    else:
        out["signal"] = f"OK: max {worst} distribution days - fara presiune notabila"
    out["max_dist_count"] = worst
    out["note"] = ("Distribution day = indice -0.2%+ pe volum crescator (expira dupa rally +5%). "
                   "FTD = +1.25%+ pe volum, in ziua 4+ a incercarii de rally. "
                   "LIMITARE: volum ETF (SPY/QQQ/IWM) ca PROXY, nu volumul compozit NYSE/Nasdaq - "
                   "numaratoarea difera de cea oficiala IBD.")
    json.dump(out, open(args.output, "w", encoding="utf-8"), indent=2)
    print(f"\n{out['signal']}\nSalvat: {args.output}")


if __name__ == "__main__":
    main()
