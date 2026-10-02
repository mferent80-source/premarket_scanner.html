#!/usr/bin/env python3
"""
Auto-validare a setup-urilor A+ afisate: citeste listele zilnice `aplus_tickers` din
dashboard_history.json si, dupa 20/60 sesiuni, masoara randamentul REALIZAT al fiecarui
nume relativ la SPY. Dashboard-ul se noteaza singur - acelasi principiu ca validate_verdict.
Ruleaza zilnic (ieftin: doar tickerele A+ istorice, cache comun); observatiile se matureaza
pe masura ce trece timpul.
"""
import argparse
import json
import os
import statistics as st
import sys
from bisect import bisect_right
from datetime import datetime

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import yahoo_cache

BASE = os.path.dirname(os.path.abspath(__file__))
FWD = (20, 60)


def closes_dates(sym, range_="1y"):
    """Lista [(data 'YYYY-MM-DD', close)] - avem nevoie de DATE ca sa ancoram intrarile."""
    res = yahoo_cache.get_chart(sym, range_)
    if not res:
        return None
    ts = res.get("timestamp") or []
    cl = (res.get("indicators", {}).get("quote") or [{}])[0].get("close") or []
    out = [(datetime.fromtimestamp(t).strftime("%Y-%m-%d"), c) for t, c in zip(ts, cl) if c is not None]
    return out or None


def anchor(series_dates, day):
    """Pozitia ultimei sesiuni <= day (intrarea foloseste ultimul close disponibil la rulare)."""
    i = bisect_right(series_dates, day) - 1
    return i if i >= 0 else None


def main():
    ap = argparse.ArgumentParser(description="Auto-validare setup-uri A+ afisate")
    ap.add_argument("--history", default=os.path.join(BASE, "dashboard", "dashboard_history.json"))
    ap.add_argument("--output", default=os.path.join(BASE, "dashboard", "validate_aplus.json"))
    args = ap.parse_args()

    try:
        hist = json.load(open(args.history, encoding="utf-8"))
    except Exception:
        hist = []
    entries = [(h["date"], h["aplus_tickers"]) for h in hist if h.get("aplus_tickers")]
    if not entries:
        json.dump({"note": "inca nicio lista A+ in istoric"}, open(args.output, "w", encoding="utf-8"))
        print("Nicio lista A+ in istoric - nimic de validat."); return

    spy = closes_dates("SPY")
    if not spy:
        json.dump({"error": "SPY indisponibil"}, open(args.output, "w", encoding="utf-8"))
        print("SPY indisponibil."); return
    spy_d = [d for d, _ in spy]

    tick_cache = {}
    rel = {h: [] for h in FWD}
    tracked, pending = 0, 0
    for day, tickers in entries:
        i_spy = anchor(spy_d, day)
        if i_spy is None:
            continue
        for t in tickers:
            tracked += 1
            if t not in tick_cache:
                tick_cache[t] = closes_dates(t)
            cd = tick_cache[t]
            if not cd:
                continue
            i_t = anchor([d for d, _ in cd], day)
            if i_t is None:
                continue
            matured = False
            for h in FWD:
                if i_t + h < len(cd) and i_spy + h < len(spy):
                    r = (cd[i_t + h][1] / cd[i_t][1] - 1) - (spy[i_spy + h][1] / spy[i_spy][1] - 1)
                    rel[h].append(r)
                    matured = True
            if not matured:
                pending += 1

    def med(v): return round(st.median(v) * 100, 2) if v else None
    def pos(v): return round(100 * sum(1 for x in v if x > 0) / len(v), 1) if v else None

    n60 = len(rel[60])
    if n60 >= 10:
        m60 = med(rel[60])
        if m60 >= 0.5:
            verdict = f"A+ FUNCTIONEAZA: {m60:+.2f}% rel SPY/60z pe {n60} obs ({pos(rel[60])}% pozitive)"
        elif m60 <= -0.5:
            verdict = f"A+ SUBperformeaza: {m60:+.2f}% rel SPY/60z pe {n60} obs — revizuieste filtrul"
        else:
            verdict = f"A+ neutru pana acum: {m60:+.2f}% rel SPY/60z pe {n60} obs"
    else:
        verdict = f"TRACKING PORNIT: {tracked} observatii urmarite, {n60} mature la 60z — verdict abia dupa >=10"

    out = {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "days_tracked": len(entries), "observations": tracked, "pending": pending,
        "mature20": len(rel[20]), "mature60": n60,
        "rel20_med": med(rel[20]), "rel20_pos": pos(rel[20]),
        "rel60_med": med(rel[60]), "rel60_pos": pos(rel[60]),
        "verdict": verdict,
        "note": ("Randament REALIZAT al listelor A+ afisate (nu backtest): ancorat pe ultimul close "
                 "disponibil la data afisarii, relativ la SPY. Observatiile se matureaza in timp."),
    }
    tmp = args.output + ".tmp"
    json.dump(out, open(tmp, "w", encoding="utf-8"), indent=2)
    os.replace(tmp, args.output)
    print(f"A+ tracking: {len(entries)} zile, {tracked} obs ({n60} mature 60z) · {verdict}")
    print(f"Salvat: {args.output}")


if __name__ == "__main__":
    main()
