#!/usr/bin/env python3
"""
Backtest la nivel de ACTIUNE pentru rotatia severa (RS 1S <= -3pp): cand un sector-lider
iese dur pe o saptamana, liderii RS individuali din sector rezista sau cad si ei?
Raspunsul decide daca gate-ul "⚠ rotatie severa" de pe ideile momentum e justificat
(liderii cad odata cu sectorul) sau prea agresiv (liderii rezista).

Limite ONESTE: constituentii ACTUALI ai S&P500 (survivorship bias - supraestimeaza
rezistenta liderilor), ferestre forward suprapuse, fara costuri -> DIRECTIONAL.
E cel mai scump backtest (~500 fetch-uri 5y) -> ruleaza LUNAR din wrapper.
"""
import argparse
import json
import os
import statistics as st
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import yahoo_cache
from sector_ideas import SECTOR_ETF, load_sectors

BASE = os.path.dirname(os.path.abspath(__file__))
SEVERE = -0.03   # acelasi prag ca treapta severa din dashboard (SEVERE_PP)
GAP = 5          # dedupe semnale pe acelasi sector
FWD = 60         # orizont forward (sesiuni)
TOPN = 5         # "liderii" = top 5 RS 3L din sector la data semnalului (ca in tabul Idei)


def p_end(c, j):
    """Pozitia la j sesiuni inainte de final (aliniere pe coada - toate seriile US
    se termina in aceeasi zi de bursa)."""
    return len(c) - 1 - j


def rr(c, p, n):
    """Randament pe n sesiuni terminat la pozitia p (None daca nu e istoric destul)."""
    if p - n < 0 or p >= len(c):
        return None
    return c[p] / c[p - n] - 1


def med_pct(v):
    return round(st.median(v) * 100, 2) if v else None


def pos_pct(v):
    return round(100 * sum(1 for x in v if x > 0) / len(v), 1) if v else None


def main():
    ap = argparse.ArgumentParser(description="Backtest rotatie severa la nivel de actiune")
    ap.add_argument("--output", default=os.path.join(BASE, "dashboard", "backtest_rotation_stocks.json"))
    ap.add_argument("--range", default="5y")
    args = ap.parse_args()
    os.makedirs(os.path.dirname(args.output), exist_ok=True)

    spy = yahoo_cache.get_closes("SPY", args.range, min_len=300)
    if not spy:
        json.dump({"error": "SPY indisponibil"}, open(args.output, "w", encoding="utf-8"))
        print("SPY indisponibil - backtest sarit."); return

    print("Incarc maparea S&P500 -> sector...")
    sectors, all_syms = load_sectors()

    print(f"Descarc {len(all_syms)} constituenti ({args.range}, concurent)...")
    cache = {}
    def task(sym):
        return sym, yahoo_cache.get_closes(sym, args.range, min_len=300)
    with ThreadPoolExecutor(max_workers=8) as ex:
        for sym, c in ex.map(task, all_syms):
            if c:
                cache[sym] = c
    print(f"Serii valide: {len(cache)}/{len(all_syms)}")

    leaders_rel, all_rel, etf_rel = [], [], []
    n_signals = 0
    per_sector = []

    for sec, etf in SECTOR_ETF.items():
        ec = yahoo_cache.get_closes(etf, args.range, min_len=300)
        if not ec:
            continue
        n = min(len(ec), len(spy))
        syms = [s for s in sectors.get(sec, []) if s in cache]
        count, last_j = 0, None
        # j = sesiuni inainte de final; descrescator = cronologic
        for j in range(n - 65, FWD - 1, -1):
            pe, ps = p_end(ec, j), p_end(spy, j)
            r3e, r3s = rr(ec, pe, 63), rr(spy, ps, 63)
            r1e, r1s = rr(ec, pe, 5), rr(spy, ps, 5)
            if None in (r3e, r3s, r1e, r1s):
                continue
            if not (r3e - r3s > 0 and r1e - r1s <= SEVERE):
                continue
            if last_j is not None and last_j - j < GAP:
                continue
            last_j = j
            # forward relativ la SPY pt ETF-ul sectorului
            fs = spy[ps + FWD] / spy[ps] - 1
            etf_rel.append(ec[pe + FWD] / ec[pe] - 1 - fs)
            # actiunile din sector la data semnalului: RS 3L + forward relativ
            rows = []
            for sym in syms:
                c = cache[sym]
                p = p_end(c, j)
                r3 = rr(c, p, 63)
                if r3 is None or p + FWD >= len(c):
                    continue
                rows.append((r3 - r3s, c[p + FWD] / c[p] - 1 - fs))
            if len(rows) < 10:
                continue  # esantion prea mic (sector abia listat in fereastra)
            n_signals += 1; count += 1
            rows.sort(key=lambda x: x[0], reverse=True)
            leaders_rel += [fr for _, fr in rows[:TOPN]]
            all_rel += [fr for _, fr in rows]
        per_sector.append({"etf": etf, "n": count})

    if not leaders_rel:
        json.dump({"error": "niciun semnal cu esantion suficient"}, open(args.output, "w", encoding="utf-8"))
        print("Niciun semnal utilizabil."); return

    lm, am, em = med_pct(leaders_rel), med_pct(all_rel), med_pct(etf_rel)
    if lm <= -0.5:
        verdict = ("GATE JUSTIFICAT: si liderii RS subperformeaza SPY dupa rotatia severa "
                   f"({lm:+.2f}%/60z) — nu cumpara lideri din sectorul care iese dur")
    elif lm >= 0.5:
        verdict = (f"GATE PREA AGRESIV: liderii RS rezista ({lm:+.2f}%/60z rel SPY) — "
                   "marcheaza sectorul, dar nu evita liderii")
    else:
        verdict = (f"NEUTRU: liderii nici nu cad, nici nu conduc ({lm:+.2f}%/60z rel) — "
                   "gate-ul ramane avertisment, nu interdictie")

    out = {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "range": args.range, "severe_pp": SEVERE * 100, "fwd": FWD, "topn": TOPN,
        "n_signals": n_signals, "n_leader_obs": len(leaders_rel),
        "leaders_rel60_med": lm, "leaders_rel_pos60": pos_pct(leaders_rel),
        "sector_all_rel60_med": am, "sector_all_pos60": pos_pct(all_rel),
        "etf_rel60_med": em,
        "coverage": f"{len(cache)}/{len(all_syms)}",
        "per_sector": per_sector,
        "verdict": verdict,
        "note": ("Constituenti ACTUALI (survivorship bias - supraestimeaza liderii), ferestre "
                 "forward suprapuse, fara costuri -> DIRECTIONAL, nu dovada. Lideri = top "
                 f"{TOPN} RS 3L din sector la data semnalului."),
    }
    tmp = args.output + ".tmp"
    json.dump(out, open(tmp, "w", encoding="utf-8"), indent=2)
    os.replace(tmp, args.output)
    print(f"Semnale: {n_signals} · lideri rel60 med: {lm:+.2f}% ({pos_pct(leaders_rel)}%+) · "
          f"tot sectorul: {am:+.2f}% · ETF: {em:+.2f}%")
    print(verdict)
    print(f"Salvat: {args.output}")


if __name__ == "__main__":
    main()
