#!/usr/bin/env python3
"""
Risc de portofoliu (nivel pro):
  - Corelatie medie intre teze (concentrare ascunsa)
  - Sizing condiționat de REGIM (master stance -> risc%/tranzactie)
  - Vol targeting: scalar de expunere bruta ca sa tinteasca o volatilitate anuala
Reads: teze din _index.json, stance din dashboard_history.json (ultima).
Sursa preturi: Yahoo. Output: dashboard\\portfolio_risk.json
"""
import argparse
import glob
import json
import math
import os
import statistics as st
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import requests

BASE = os.path.dirname(os.path.abspath(__file__))
UA = {"User-Agent": "Mozilla/5.0"}
# risc %/tranzactie in functie de stance
REGIME_RISK = {"RISK-ON": 1.5, "CONSTRUCTIV": 1.0, "MIXT / PRUDENTA SELECTIVA": 0.75,
               "MIXT": 0.75, "PRUDENTA / DEFENSIV": 0.5, "RISK-OFF": 0.3}


import yahoo_cache


def closes(sym):
    return yahoo_cache.get_closes(sym, "6mo", min_len=1)


def rets(c):
    return [c[i] / c[i - 1] - 1 for i in range(1, len(c))]


def corr(a, b):
    n = min(len(a), len(b)); a, b = a[-n:], b[-n:]
    if n < 20: return None
    ma, mb = st.mean(a), st.mean(b)
    num = sum((a[i] - ma) * (b[i] - mb) for i in range(n))
    da = math.sqrt(sum((x - ma) ** 2 for x in a)); db = math.sqrt(sum((x - mb) ** 2 for x in b))
    return num / (da * db) if da and db else None


def theses_tickers(state_dir):
    idx = os.path.join(state_dir, "_index.json")
    try:
        d = json.load(open(idx, encoding="utf-8"))
        return sorted({m.get("ticker", "").upper() for m in d.get("theses", {}).values()
                       if str(m.get("status", "")).upper() not in {"CLOSED", "INVALIDATED", "EXPIRED", "ARCHIVED"} and m.get("ticker")})
    except Exception:
        return []


def last_stance(hist_path):
    try:
        h = json.load(open(hist_path, encoding="utf-8"))
        return h[-1].get("master_stance") if h else None
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", default=os.path.join(BASE, "dashboard", "portfolio_risk.json"))
    ap.add_argument("--target-vol", type=float, default=12.0, help="volatilitate anuala tinta (%%)")
    args = ap.parse_args()
    os.makedirs(os.path.dirname(args.output), exist_ok=True)

    # config
    cfg = {}
    try:
        cfg = json.load(open(os.path.join(BASE, "dashboard", "discipline_config.json"), encoding="utf-8-sig"))
    except Exception:
        pass
    account = cfg.get("account_size")
    state_dir = cfg.get("state_dir") or os.path.join(BASE, "_trader_state", "theses")

    stance = last_stance(os.path.join(BASE, "dashboard", "dashboard_history.json"))
    regime_risk = REGIME_RISK.get(stance, 0.75)

    tickers = theses_tickers(state_dir)
    out = {"generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
           "stance": stance, "regime_risk_pct": regime_risk, "target_vol": args.target_vol,
           "account_size": account, "tickers": tickers}

    if len(tickers) >= 2:
        with ThreadPoolExecutor(max_workers=8) as ex:
            cache = {t: c for t, c in zip(tickers, ex.map(closes, tickers)) if c}
        series = {t: rets(c) for t, c in cache.items()}
        keys = list(series)
        pairs = []
        for i in range(len(keys)):
            for j in range(i + 1, len(keys)):
                cc = corr(series[keys[i]], series[keys[j]])
                if cc is not None:
                    pairs.append((keys[i], keys[j], round(cc, 2)))
        avg_corr = round(st.mean([p[2] for p in pairs]), 2) if pairs else None
        high = [p for p in pairs if p[2] >= 0.7]
        # vol portofoliu (echiponderat) anualizata
        port_vol = None
        if series:
            n = min(len(s) for s in series.values())
            port = [sum(series[t][-n:][k] for t in keys) / len(keys) for k in range(n)]
            port_vol = round(st.pstdev(port) * math.sqrt(252) * 100, 1) if n > 20 else None
        vol_scalar = round(args.target_vol / port_vol, 2) if port_vol else None
        out.update({"avg_correlation": avg_corr, "high_corr_pairs": high[:8],
                    "portfolio_vol_annual": port_vol, "vol_target_scalar": vol_scalar,
                    "concentration_warn": bool(avg_corr and avg_corr >= 0.6)})
        print(f"Stance {stance} -> risc {regime_risk}%/tranzactie | corelatie medie {avg_corr} | "
              f"vol {port_vol}% -> scalar {vol_scalar} (tinta {args.target_vol}%)")
        if high: print(f"  Perechi corelate >=0.7: {', '.join(f'{a}-{b} {c}' for a,b,c in high[:5])}")
    else:
        out["note"] = "Sub 2 teze - fara corelatie/vol."
        print("Sub 2 teze - fara analiza de portofoliu.")

    json.dump(out, open(args.output, "w", encoding="utf-8"), indent=2)


if __name__ == "__main__":
    main()
