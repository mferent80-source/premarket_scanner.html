#!/usr/bin/env python3
"""
Backtest pe screen-ul "Early buy - pullback in trend": lider RS 6L peste MM200, corectie
6-20% de la max 52s, care recupereaza MM20 dupa un dip sub ea in ultimele 10 sesiuni.
Intrebarea: intrarea timpurie pe revenire chiar are edge vs piata, sau e zgomot?
Criterii IDENTICE cu screen-ul live din sector_ideas.py.

Limite ONESTE: constituentii ACTUALI (survivorship bias - favorizeaza screen-ul, liderii
de azi au "supravietuit"), ferestre forward suprapuse, fara costuri -> DIRECTIONAL.
Refoloseste cache-ul 5y al backtest_rotation_stocks -> ruleaza LUNAR din wrapper.
"""
import argparse
import json
import os
import statistics as st
import sys
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import yahoo_cache
from sector_ideas import load_sectors

BASE = os.path.dirname(os.path.abspath(__file__))
FWD = 60
GAP = 10   # dedupe: un semnal nou pe acelasi ticker abia dupa 10 sesiuni


def rolling_max(c, w):
    """Max pe fereastra w terminata la fiecare pozitie (deque monotonica, O(n))."""
    out = [None] * len(c)
    dq = deque()
    for i, v in enumerate(c):
        while dq and c[dq[-1]] <= v:
            dq.pop()
        dq.append(i)
        while dq[0] <= i - w:
            dq.popleft()
        out[i] = c[dq[0]]
    return out


def main():
    ap = argparse.ArgumentParser(description="Backtest screen Early buy (pullback in trend)")
    ap.add_argument("--output", default=os.path.join(BASE, "dashboard", "backtest_earlybuy.json"))
    ap.add_argument("--range", default="5y")
    args = ap.parse_args()
    os.makedirs(os.path.dirname(args.output), exist_ok=True)

    spy = yahoo_cache.get_closes("SPY", args.range, min_len=300)
    if not spy:
        json.dump({"error": "SPY indisponibil"}, open(args.output, "w", encoding="utf-8"))
        print("SPY indisponibil - backtest sarit."); return
    n_spy = len(spy)
    spy_pref = [0.0]
    for v in spy:
        spy_pref.append(spy_pref[-1] + v)

    print("Incarc maparea S&P500...")
    _, all_syms = load_sectors()
    print(f"Descarc/citesc {len(all_syms)} constituenti ({args.range}, cache comun)...")
    cache = {}
    def task(sym):
        return sym, yahoo_cache.get_closes(sym, args.range, min_len=300)
    with ThreadPoolExecutor(max_workers=8) as ex:
        for sym, c in ex.map(task, all_syms):
            if c:
                cache[sym] = c

    sig_rel, base_rel = [], []
    n_signals = 0
    for sym, c in cache.items():
        n = len(c)
        pref = [0.0]
        for v in c:
            pref.append(pref[-1] + v)
        hi252 = rolling_max(c, 252)

        def ma(p, w):
            return (pref[p + 1] - pref[p + 1 - w]) / w if p + 1 - w >= 0 else None

        last_sig = -GAP
        # aliniere pe coada cu SPY: j = sesiuni inainte de final
        max_j = min(n, n_spy) - 1
        for j in range(max_j - 253, FWD - 1, -1):
            p = n - 1 - j
            ps = n_spy - 1 - j
            if p - 252 < 0 or ps - 126 < 0:
                continue
            ma200 = ma(p, 200); ma20 = ma(p, 20)
            if not ma200 or not ma20 or c[p] <= ma200:
                continue
            rs6 = (c[p] / c[p - 126] - 1) - (spy[ps] / spy[ps - 126] - 1)
            fwd_rel = (c[p + FWD] / c[p] - 1) - (spy[ps + FWD] / spy[ps] - 1)
            # baseline: toate zilele valide "in trend" (peste MM200) - comparatie corecta
            base_rel.append(fwd_rel)
            if rs6 <= 0:
                continue
            pfh = (c[p] / hi252[p] - 1) * 100
            if not (-20 <= pfh <= -6):
                continue
            if not (c[p] > ma20 and min(c[p - 9:p + 1]) < ma20):
                continue
            if p - last_sig < GAP:
                continue
            last_sig = p
            n_signals += 1
            sig_rel.append(fwd_rel)

    if len(sig_rel) < 30:
        json.dump({"error": f"prea putine semnale ({len(sig_rel)})"}, open(args.output, "w", encoding="utf-8"))
        print(f"Prea putine semnale ({len(sig_rel)})."); return

    sm, bm = round(st.median(sig_rel) * 100, 2), round(st.median(base_rel) * 100, 2)
    edge = round(sm - bm, 2)
    posp = round(100 * sum(1 for x in sig_rel if x > 0) / len(sig_rel), 1)
    if edge >= 0.5:
        verdict = f"SCREEN VALIDAT: early buy bate baseline-ul in-trend cu {edge:+.2f}pp/60z rel SPY"
    elif edge <= -0.5:
        verdict = f"SCREEN INVALIDAT: pullback-urile recuperate au SUBperformat ({edge:+.2f}pp/60z) — nu-l folosi ca trigger"
    else:
        verdict = f"FARA EDGE CLAR ({edge:+.2f}pp/60z): early buy ≈ orice zi in trend — folosestel ca timing de intrare, nu ca selectie"

    out = {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "range": args.range, "fwd": FWD, "gap": GAP,
        "n_signals": n_signals, "coverage": f"{len(cache)}/{len(all_syms)}",
        "signal_rel60_med": sm, "signal_pos60": posp,
        "baseline_rel60_med": bm, "edge_pp": edge,
        "verdict": verdict,
        "note": ("Criterii identice cu screen-ul live (MM200 + RS6L>0 + corectie 6-20% + reclaim MM20, "
                 "dedupe 10 sesiuni). Baseline = toate zilele peste MM200 (comparatie in-trend). "
                 "Constituenti actuali (survivorship bias PRO screen), ferestre suprapuse, fara costuri "
                 "-> DIRECTIONAL, nu dovada."),
    }
    tmp = args.output + ".tmp"
    json.dump(out, open(tmp, "w", encoding="utf-8"), indent=2)
    os.replace(tmp, args.output)
    print(f"Semnale: {n_signals} · rel60 med {sm:+.2f}% ({posp}%+) vs baseline {bm:+.2f}% · edge {edge:+.2f}pp")
    print(verdict)
    print(f"Salvat: {args.output}")


if __name__ == "__main__":
    main()
