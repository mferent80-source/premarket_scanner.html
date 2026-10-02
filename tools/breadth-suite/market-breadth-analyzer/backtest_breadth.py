#!/usr/bin/env python3
"""
#10 Backtest - valideaza daca semnalele de breadth au precedat slabiciune in S&P500.
Foloseste istoricul complet TraderMonty (2016->prezent) si masoara randamentele FORWARD
(20/60 zile) + cel mai rau drawdown forward pe 60z, per semnal vs baseline (toate zilele).

Semnale testate:
  - low_breadth_05 : 8MA < 0.50 (piata selectiva)
  - low_breadth_04 : 8MA < 0.40 (slabiciune extrema)
  - narrow_diverg  : S&P +>2% pe 60z DAR breadth 8MA in scadere pe 60z  (proxy pt ALERT-ul 'ingust')
  - ma8_below_200  : 8MA sub 200MA (deteriorare)
  - bearish_flag   : Bearish_Signal activ (semnal backtestat al sursei)
"""
import argparse
import csv
import io
import json
import statistics as st
from datetime import datetime

import requests

DETAIL_URL = "https://tradermonty.github.io/market-breadth-analysis/market_breadth_data.csv"


def fetch_rows():
    txt = requests.get(DETAIL_URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=30).text
    rows = list(csv.DictReader(io.StringIO(txt)))
    out = []
    for r in rows:
        try:
            out.append({
                "date": r["Date"],
                "price": float(r["S&P500_Price"]),
                "ma8": float(r["Breadth_Index_8MA"]),
                "ma200": float(r["Breadth_Index_200MA"]),
                "bearish": str(r.get("Bearish_Signal", "")).strip() in ("1", "1.0", "True", "TRUE", "true"),
            })
        except (KeyError, ValueError):
            continue
    return out


def fwd_return(rows, i, n):
    if i + n >= len(rows):
        return None
    return rows[i + n]["price"] / rows[i]["price"] - 1


def fwd_worst(rows, i, n):
    """Cel mai rau randament forward in urmatoarele n sesiuni (masura de downside)."""
    end = min(i + n, len(rows) - 1)
    if end <= i:
        return None
    base = rows[i]["price"]
    return min(rows[j]["price"] / base - 1 for j in range(i + 1, end + 1))


def pct(x):
    return f"{x*100:+.2f}%"


def summarize(name, idxs, rows):
    r20 = [fwd_return(rows, i, 20) for i in idxs]
    r60 = [fwd_return(rows, i, 60) for i in idxs]
    dd = [fwd_worst(rows, i, 60) for i in idxs]
    r20 = [x for x in r20 if x is not None]
    r60 = [x for x in r60 if x is not None]
    dd = [x for x in dd if x is not None]
    if not r60:
        return None
    return {
        "name": name, "n": len(idxs),
        "mean20": st.mean(r20) if r20 else 0, "med20": st.median(r20) if r20 else 0,
        "pos20": sum(1 for x in r20 if x > 0) / len(r20) if r20 else 0,
        "mean60": st.mean(r60), "med60": st.median(r60),
        "pos60": sum(1 for x in r60 if x > 0) / len(r60),
        "dd60": st.mean(dd) if dd else 0,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--md", default=None, help="salveaza raport markdown la calea data")
    ap.add_argument("--json", default=None, help="salveaza edge-urile JSON pt dashboard")
    args = ap.parse_args()

    print("Descarc istoricul de breadth (TraderMonty)...")
    rows = fetch_rows()
    n = len(rows)
    print(f"OK: {n} zile, {rows[0]['date']} -> {rows[-1]['date']}\n")

    # Precalcul schimbari pe 60z
    signals = {k: [] for k in
               ["baseline", "low_breadth_05", "low_breadth_04", "narrow_diverg", "ma8_below_200", "bearish_flag"]}
    for i in range(n):
        signals["baseline"].append(i)
        if rows[i]["ma8"] < 0.50:
            signals["low_breadth_05"].append(i)
        if rows[i]["ma8"] < 0.40:
            signals["low_breadth_04"].append(i)
        if rows[i]["ma8"] < rows[i]["ma200"]:
            signals["ma8_below_200"].append(i)
        if rows[i]["bearish"]:
            signals["bearish_flag"].append(i)
        if i >= 60:
            sp_chg = rows[i]["price"] / rows[i - 60]["price"] - 1
            br_chg = rows[i]["ma8"] - rows[i - 60]["ma8"]
            if sp_chg > 0.02 and br_chg < 0:
                signals["narrow_diverg"].append(i)

    base = summarize("baseline", signals["baseline"], rows)
    results = [base]
    for k in ["low_breadth_05", "low_breadth_04", "narrow_diverg", "ma8_below_200", "bearish_flag"]:
        s = summarize(k, signals[k], rows)
        if s:
            results.append(s)

    # Raport
    hdr = f"{'Semnal':<16}{'N':>6}{'fwd20 med':>12}{'%+ 20z':>9}{'fwd60 med':>12}{'%+ 60z':>9}{'DD60 med':>11}"
    lines = ["=" * len(hdr), "BACKTEST BREADTH - randamente FORWARD S&P500 per semnal", "=" * len(hdr), hdr, "-" * len(hdr)]
    for s in results:
        lines.append(f"{s['name']:<16}{s['n']:>6}{pct(s['med20']):>12}{s['pos20']*100:>8.0f}%"
                     f"{pct(s['med60']):>12}{s['pos60']*100:>8.0f}%{pct(s['dd60']):>11}")
    lines.append("-" * len(hdr))

    # Interpretare vs baseline
    lines.append("\nEDGE vs baseline (fwd 60z median, puncte %):")
    for s in results[1:]:
        edge = (s["med60"] - base["med60"]) * 100
        dd_edge = (s["dd60"] - base["dd60"]) * 100
        verdict = "SLABICIUNE confirmata" if edge < -0.5 else "fara edge clar" if abs(edge) <= 0.5 else "PUTERE (contrarian)"
        lines.append(f"  {s['name']:<16} edge60={edge:+5.2f}pp  drawdown60 vs base={dd_edge:+5.2f}pp  -> {verdict}")

    lines.append(f"\nBaseline fwd60 median = {pct(base['med60'])}, %pozitiv60 = {base['pos60']*100:.0f}%, "
                 f"drawdown60 mediu = {pct(base['dd60'])}")
    report = "\n".join(lines)
    print(report)

    if args.json:
        edges = {"period": f"{rows[0]['date']} → {rows[-1]['date']}", "days": n,
                 "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                 "baseline": {"med60": round(base["med60"] * 100, 2), "pos60": round(base["pos60"] * 100),
                              "dd60": round(base["dd60"] * 100, 2)},
                 "signals": {}}
        for s in results[1:]:
            edges["signals"][s["name"]] = {
                "n": s["n"], "med60": round(s["med60"] * 100, 2), "pos60": round(s["pos60"] * 100),
                "dd60": round(s["dd60"] * 100, 2),
                "edge60_pp": round((s["med60"] - base["med60"]) * 100, 2),
                "dd_edge_pp": round((s["dd60"] - base["dd60"]) * 100, 2),
            }
        json.dump(edges, open(args.json, "w", encoding="utf-8"), indent=2)
        print(f"\nEdge JSON salvat: {args.json}")

    if args.md:
        with open(args.md, "w", encoding="utf-8") as f:
            f.write("# Backtest Breadth Signals\n\nGenerat " + datetime.now().strftime("%Y-%m-%d %H:%M")
                    + f"\n\nPerioada: {rows[0]['date']} → {rows[-1]['date']} ({n} zile)\n\n```\n" + report + "\n```\n")
        print(f"\nRaport salvat: {args.md}")


if __name__ == "__main__":
    main()
