#!/usr/bin/env python3
"""
#1 Auto-validarea verdictului master - se noteaza singur.
A) PROXY ISTORIC: reconstruieste logica verdictului pe tot istoricul S&P (2016-2026)
   din CSV-ul TraderMonty si masoara randamentele FORWARD (20/60z) per stance.
   -> valoare imediata: are logica edge, sau nu?
B) TRACKING LIVE: citeste stance-urile zilnice din dashboard_history.json, le imperecheaza
   cu randamentul forward realizat (SPY) si construieste un track-record REAL in timp.
Output: dashboard\\validate.json (citit de agregator).
"""
import argparse
import csv
import io
import json
import os
import statistics as st
from datetime import datetime

import requests

DETAIL_URL = "https://tradermonty.github.io/market-breadth-analysis/market_breadth_data.csv"
STANCES = ["RISK-OFF", "PRUDENTA", "MIXT", "CONSTRUCTIV", "RISK-ON"]


def fetch_csv():
    txt = requests.get(DETAIL_URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=30).text
    rows = []
    for r in csv.DictReader(io.StringIO(txt)):
        try:
            rows.append({"date": r["Date"], "price": float(r["S&P500_Price"]),
                         "ma8": float(r["Breadth_Index_8MA"]), "ma200": float(r["Breadth_Index_200MA"])})
        except (KeyError, ValueError):
            continue
    return rows


def proxy_stance(rows, i):
    """Reconstruieste scorul verdictului din semnale disponibile istoric."""
    if i < 60:
        return None
    ma8 = rows[i]["ma8"]; ma200 = rows[i]["ma200"]; price = rows[i]["price"]
    price_ma50 = st.mean([rows[j]["price"] for j in range(i - 49, i + 1)]) if i >= 49 else price
    breadth_rising = ma8 > rows[i - 20]["ma8"]
    narrow = (price / rows[i - 60]["price"] - 1 > 0.02) and (ma8 - rows[i - 60]["ma8"] < 0)
    score = 0
    score += 1 if ma8 >= 0.60 else 0
    score += 1 if breadth_rising else -1
    score -= 1 if narrow else 0
    score -= 1 if price < price_ma50 else 0            # proxy distribution/corectie
    score += 1 if ma8 < 0.40 else 0                    # washout contrarian (lectie backtest)
    # bucket -> stance
    if score >= 3: return "RISK-ON"
    if score >= 1: return "CONSTRUCTIV"
    if score >= 0: return "MIXT"
    if score >= -1: return "PRUDENTA"
    return "RISK-OFF"


def fwd(rows, i, n):
    return rows[i + n]["price"] / rows[i]["price"] - 1 if i + n < len(rows) else None


def worst(rows, i, n):
    end = min(i + n, len(rows) - 1)
    return min((rows[j]["price"] / rows[i]["price"] - 1 for j in range(i + 1, end + 1)), default=None) if end > i else None


def historical_proxy(rows):
    buckets = {s: {"r20": [], "r60": [], "dd": []} for s in STANCES}
    for i in range(len(rows)):
        s = proxy_stance(rows, i)
        if not s:
            continue
        r20, r60, dd = fwd(rows, i, 20), fwd(rows, i, 60), worst(rows, i, 60)
        if r20 is not None: buckets[s]["r20"].append(r20)
        if r60 is not None: buckets[s]["r60"].append(r60)
        if dd is not None: buckets[s]["dd"].append(dd)
    out = []
    for s in STANCES:
        b = buckets[s]
        if not b["r60"]:
            continue
        out.append({"stance": s, "n": len(b["r60"]),
                    "med20": round(st.median(b["r20"]) * 100, 2) if b["r20"] else None,
                    "med60": round(st.median(b["r60"]) * 100, 2),
                    "pos60": round(sum(1 for x in b["r60"] if x > 0) / len(b["r60"]) * 100),
                    "dd60": round(st.mean(b["dd"]) * 100, 2) if b["dd"] else None})
    # verdict monotonicitate: creste fwd60 median de la RISK-OFF spre RISK-ON?
    order = {o["stance"]: o["med60"] for o in out}
    seq = [order[s] for s in STANCES if s in order]
    mono = all(seq[k] <= seq[k + 1] + 1.0 for k in range(len(seq) - 1)) if len(seq) > 1 else False
    return out, mono


def live_tracking(hist_path, rows):
    """Imperecheaza stance-urile live cu randamentul forward realizat (din pretul CSV)."""
    if not os.path.exists(hist_path):
        return {"observations": 0, "note": "Fara istoric inca."}
    try:
        hist = json.load(open(hist_path, encoding="utf-8"))
    except Exception:
        return {"observations": 0, "note": "Istoric necitibil."}
    by_date = {r["date"]: idx for idx, r in enumerate(rows)}
    dates_sorted = [r["date"] for r in rows]
    per = {}
    matured = 0
    for h in hist:
        s = h.get("master_stance"); d = h.get("date")
        if not s:
            continue
        # ANTI-LOOK-AHEAD: verdictul e emis la 10:00 RO (inainte de deschiderea US),
        # pe date pana la close-ul ANTERIOR. Randamentul forward trebuie masurat de la
        # PRIMUL close DUPA emitere (urmatoarea zi de tranzactionare >= data verdictului),
        # nu de la close-ul aceleiasi zile (care includea o miscare necunoscuta la 10:00).
        i = by_date.get(d)
        if i is None:
            # data verdictului nu e zi de tranzactionare US (weekend/sarbatoare)
            # -> intrarea realizabila e close-ul primei zile de tranzactionare urmatoare
            later = [k for k, dt in enumerate(dates_sorted) if dt > d]
            if not later:
                continue
            i = later[0]
        r20 = fwd(rows, i, 20)
        if r20 is None:
            continue
        matured += 1
        per.setdefault(s, []).append(r20)
    rowsout = [{"stance": s, "n": len(v), "med20": round(st.median(v) * 100, 2)} for s, v in per.items()]
    return {"observations": matured, "tracked_days": len(hist), "per_stance": rowsout,
            "note": "In acumulare - track-record real creste cu fiecare zi." if matured < 20 else "Track-record live activ."}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboard", "validate.json"))
    ap.add_argument("--history", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboard", "dashboard_history.json"))
    args = ap.parse_args()
    os.makedirs(os.path.dirname(args.output), exist_ok=True)

    print("Descarc istoric breadth pentru validare...")
    rows = fetch_csv()
    proxy, mono = historical_proxy(rows)
    live = live_tracking(args.history, rows)

    out = {"generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
           "period": f"{rows[0]['date']} → {rows[-1]['date']}",
           "proxy": proxy, "proxy_monotonic": mono, "live": live,
           "verdict": ("Logica are edge: stance-uri mai defensive -> randamente forward mai slabe (monotonic)."
                       if mono else
                       "ATENTIE: logica NU e monotonica pe istoric (breadth slab a fost adesea contrarian bullish). "
                       "Foloseste verdictul ca gauge de RISC/volatilitate, nu ca predictor de randament."),
           "note": "Proxy = reconstructie a logicii pe date istorice disponibile, nu formula master exacta. Esantion 2016-2026 (bull secular)."}
    json.dump(out, open(args.output, "w", encoding="utf-8"), indent=2)

    print(f"\nPROXY ISTORIC ({out['period'].replace(chr(0x2192), '->')}) - randament forward 60z per stance:")
    print(f"{'Stance':<13}{'N':>6}{'fwd20':>9}{'fwd60':>9}{'%+60':>7}{'DD60':>9}")
    for o in proxy:
        print(f"{o['stance']:<13}{o['n']:>6}{o['med20']:>8}%{o['med60']:>8}%{o['pos60']:>6}%{o['dd60']:>8}%")
    print(f"\nMonotonic (defensiv->randament mai mic): {'DA' if mono else 'NU'}")
    print(f"Verdict: {out['verdict']}")
    print(f"\nTRACKING LIVE: {live['observations']} observatii mature / {live.get('tracked_days',0)} zile. {live['note']}")
    print(f"Salvat: {args.output}")


if __name__ == "__main__":
    main()
