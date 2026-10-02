#!/usr/bin/env python3
"""
Stock screens pe S&P 500 (un singur fetch, concurent):
  - Sectoare in crestere (11 ETF SPDR) + top 5 momentum/RS per sector, cu marcaj VCP
  - Categorie CONTRARIAN: distrus (mult sub max 52s) DAR in stabilizare (recucereste MM20)
  - New highs - new lows (52s) = internal de breadth
NU e recomandare financiara - screening/watchlist. Valideaza intrare/stop.
Sursa: S&P500 sector map (GitHub datahub) + preturi Yahoo Finance (gratuit).
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

CONSTITUENTS_URL = "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv"
SECTOR_ETF = {
    "Information Technology": "XLK", "Financials": "XLF", "Health Care": "XLV",
    "Consumer Discretionary": "XLY", "Consumer Staples": "XLP", "Energy": "XLE",
    "Industrials": "XLI", "Materials": "XLB", "Real Estate": "XLRE",
    "Utilities": "XLU", "Communication Services": "XLC",
}


UA = {"User-Agent": "Mozilla/5.0"}


def y_symbol(t):
    return t.replace(".", "-").strip().upper()


def yahoo_crumb(session):
    """Crumb Yahoo pt quoteSummary (acelasi mecanism ca in actionable.py)."""
    try:
        session.get("https://fc.yahoo.com", headers=UA, timeout=10)
        r = session.get("https://query1.finance.yahoo.com/v1/test/getcrumb", headers=UA, timeout=10)
        r.raise_for_status()
        text = r.text.strip()
        return text if len(text) < 100 and "<" not in text and "\n" not in text else None
    except Exception:
        return None


def earnings_date(session, crumb, symbol):
    if not crumb:
        return None
    try:
        r = session.get(f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{symbol}",
                        params={"modules": "calendarEvents", "crumb": crumb}, headers=UA, timeout=12)
        res = r.json()["quoteSummary"]["result"][0]["calendarEvents"]["earnings"]["earningsDate"]
        return res[0]["fmt"] if res else None
    except Exception:
        return None


import yahoo_cache

# Clase duplicate de actiuni (aceeasi companie de 2 ori in indice) - pastram una singura
# ca breadth-ul sa nu numere aceeasi companie de doua ori.
DUAL_CLASS_SKIP = {"GOOG", "FOX", "NWS"}


def fetch_closes(symbol, range_="1y"):
    return yahoo_cache.get_closes(symbol, range_, min_len=200)


def fetch_all(symbols, workers=8):
    cache = {}
    def task(sym): return sym, fetch_closes(sym)
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for sym, closes in ex.map(task, symbols):
            if closes:
                cache[sym] = closes
    return cache


def sma(v, w):
    return sum(v[-w:]) / w if len(v) >= w else None


def ret(c, n):
    return c[-1] / c[-1 - n] - 1 if len(c) > n else None


def vol(seg):
    rets = [seg[i] / seg[i - 1] - 1 for i in range(1, len(seg))]
    return st.pstdev(rets) if len(rets) > 1 else 0


def analyze(c):
    last = c[-1]
    ma20 = sma(c, 20); ma50 = sma(c, 50); ma200 = sma(c, 200)
    ma20_prev = sma(c[:-5], 20) if len(c) >= 25 else None
    ma50_prev = sma(c[:-20], 50) if len(c) >= 70 else None
    hi52 = max(c[-252:]) if len(c) >= 60 else max(c)
    lo40 = min(c[-40:])
    return {
        "last": last, "ma20": ma20, "ma50": ma50, "ma200": ma200,
        "ma20_rising": bool(ma20 and ma20_prev and ma20 > ma20_prev),
        "ma50_rising": bool(ma50 and ma50_prev and ma50 > ma50_prev),
        "above_ma200": bool(ma200 and last > ma200),
        "above_ma50": bool(ma50 and last > ma50),
        "pct_from_high": (last / hi52 - 1) * 100 if hi52 else 0,
        "off_low": (last / lo40 - 1) * 100 if lo40 else 0,
        "ret_1w": ret(c, 5), "ret_15d": ret(c, 11),
        "ret_1m": ret(c, 21), "ret_3m": ret(c, 63), "ret_6m": ret(c, 126),
        "at_high": last >= hi52 * 0.98, "at_low": last <= (min(c[-252:]) if len(c) >= 60 else min(c)) * 1.02,
    }


def vcp_mark(c):
    """VCP-lite: volatilitate in contractie pe 3 ferestre + aproape de pivot + peste MM50."""
    if len(c) < 60:
        return False
    ma50 = sma(c, 50)
    if not (ma50 and c[-1] > ma50):
        return False
    w = 15
    v1, v2, v3 = vol(c[-w:]), vol(c[-2 * w:-w]), vol(c[-3 * w:-2 * w])
    contracting = 0 < v1 < v2 < v3
    piv = max(c[-40:])
    near_pivot = c[-1] >= piv * 0.92
    return bool(contracting and near_pivot)


def load_sectors():
    txt = requests.get(CONSTITUENTS_URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=20).text
    reader = csv.DictReader(io.StringIO(txt))
    sectors, all_syms = {}, []
    for row in reader:
        sec = row.get("GICS Sector", "").strip(); sym = row.get("Symbol", "").strip()
        if sec and sym:
            s = y_symbol(sym)
            if s in DUAL_CLASS_SKIP:
                continue  # evita dubla numarare a aceleiasi companii
            sectors.setdefault(sec, []).append(s); all_syms.append(s)
    return sectors, all_syms


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboard", "sector_ideas.json"))
    ap.add_argument("--top", type=int, default=5)
    ap.add_argument("--contra-top", type=int, default=8)
    args = ap.parse_args()
    os.makedirs(os.path.dirname(args.output), exist_ok=True)

    print("Incarc maparea S&P500 -> sector...")
    sectors, all_syms = load_sectors()
    print(f"{len(all_syms)} constituenti, {len(sectors)} sectoare.")

    # Baseline + ETF-uri sectoriale
    print("Descarc SPY + 11 ETF-uri sectoriale...")
    etf_cache = fetch_all(["SPY"] + list(SECTOR_ETF.values()))
    spy = etf_cache.get("SPY")
    if not spy:
        raise RuntimeError("SPY baseline unavailable; RS cannot be computed")
    asof = yahoo_cache.observation_date("SPY")
    etf_cache = {s:c for s,c in etf_cache.items() if yahoo_cache.observation_date(s) == asof}
    spy_1w = ret(spy, 5) if spy else 0
    spy_15d = ret(spy, 11) if spy else 0
    spy_1m = ret(spy, 21) if spy else 0
    spy_3m = ret(spy, 63) if spy else 0
    spy_6m = ret(spy, 126) if spy else 0

    sector_rows = []
    for sec, etf in SECTOR_ETF.items():
        c = etf_cache.get(etf)
        if not c:
            continue
        a = analyze(c)
        rs_3m = (a["ret_3m"] or 0) - (spy_3m or 0)
        rs_1m = (a["ret_1m"] or 0) - (spy_1m or 0)  # axa de momentum RRG
        # ferestre scurte pt heatmap multi-orizont (5/11 sesiuni ~ 1 sapt / 15 zile calendar)
        rs_1w = (a["ret_1w"] or 0) - (spy_1w or 0)
        rs_15d = (a["ret_15d"] or 0) - (spy_15d or 0)
        rising = a["above_ma200"] and a["ma50_rising"] and rs_3m > 0
        sector_rows.append({"sector": sec, "etf": etf, "rs_3m": round(rs_3m * 100, 1),
                            "rs_1m": round(rs_1m * 100, 1),
                            "rs_1w": round(rs_1w * 100, 1), "rs_15d": round(rs_15d * 100, 1),
                            "above_ma200": a["above_ma200"], "ma50_rising": a["ma50_rising"], "rising": rising})
    sector_rows.sort(key=lambda x: x["rs_3m"], reverse=True)
    rising = [s for s in sector_rows if s["rising"]]
    print(f"Sectoare in crestere: {', '.join(s['etf'] for s in rising) or 'niciunul'}")

    # UN SINGUR fetch pentru tot S&P 500 (concurent) - folosit de toate screen-urile
    print(f"Descarc {len(all_syms)} constituenti S&P500 (concurent, ~1-2 min)...")
    cache = fetch_all(all_syms, workers=8)
    print(f"Descarcate: {len(cache)}/{len(all_syms)}")
    cache = {s:c for s,c in cache.items() if yahoo_cache.observation_date(s) == asof}
    if len(cache)/len(all_syms) < .80:
        raise RuntimeError("S&P sample coverage below 80%; ideas excluded")
    stats = {sym: analyze(c) for sym, c in cache.items()}

    # 1) Momentum ideas per sector in crestere (RS + trend) + marcaj VCP
    for srow in rising:
        cand = []
        for sym in sectors.get(srow["sector"], []):
            a = stats.get(sym)
            if not a:
                continue
            if not (a["above_ma200"] and a["above_ma50"] and a["ma50_rising"]):
                continue
            if a["pct_from_high"] < -25:
                continue
            rs = ((a["ret_3m"] or 0) - (spy_3m or 0)) * 0.5 + ((a["ret_6m"] or 0) - (spy_6m or 0)) * 0.5
            cand.append({"ticker": sym, "last": round(a["last"], 2), "rs_score": round(rs * 100, 1),
                         "ret_3m": round((a["ret_3m"] or 0) * 100, 1), "ret_6m": round((a["ret_6m"] or 0) * 100, 1),
                         "pct_from_high": round(a["pct_from_high"], 1), "vcp": vcp_mark(cache[sym])})
        cand.sort(key=lambda x: x["rs_score"], reverse=True)
        srow["ideas"] = cand[:args.top]

    # 2b) EARLY BUY - pullback in trend: lider RS 6L peste MM200, corectie 6-20% de la max,
    # a fost sub MM20 in ultimele 10 sesiuni si a recuperat-o (revenire PROASPATA, nu extensie).
    # Complementar contrarianului (ala = distrus; asta = calitate in corectie normala).
    sec_of = {}
    for sec, syms in sectors.items():
        for sym in syms:
            sec_of[sym] = sec
    early = []
    for sym, a in stats.items():
        c = cache.get(sym)
        if not c or not a.get("ma20") or len(c) < 30:
            continue
        rs6 = (a["ret_6m"] or 0) - (spy_6m or 0)
        if not a["above_ma200"] or rs6 <= 0:
            continue
        if not (-20 <= a["pct_from_high"] <= -6):
            continue
        if not (a["last"] > a["ma20"] and min(c[-10:]) < a["ma20"]):
            continue
        sec = sec_of.get(sym, "")
        early.append({"ticker": sym, "last": round(a["last"], 2), "sector": sec,
                      "etf": SECTOR_ETF.get(sec, ""), "rs_6m": round(rs6 * 100, 1),
                      "pct_from_high": round(a["pct_from_high"], 1),
                      "ret_1m": round((a["ret_1m"] or 0) * 100, 1), "vcp": vcp_mark(c)})
    early.sort(key=lambda x: x["rs_6m"], reverse=True)
    early = early[:10]

    # 2) CONTRARIAN: distrus (<= -25% sub max) + stabilizare (>MM20, MM20 in urcare, off-low >= 8%)
    contra = []
    for sym, a in stats.items():
        if a["pct_from_high"] <= -25 and a["last"] > (a["ma20"] or 1e9) and a["ma20_rising"] and a["off_low"] >= 8:
            contra.append({"ticker": sym, "last": round(a["last"], 2),
                           "pct_from_high": round(a["pct_from_high"], 1), "off_low": round(a["off_low"], 1),
                           "ret_1m": round((a["ret_1m"] or 0) * 100, 1), "vcp": vcp_mark(cache[sym])})
    # Sortare pe stabilizari PROASPETE (off_low mic = abia s-a intors, nu chase dupa
    # cele deja saltate +30%). Filtru anti-chase: exclude bounce-uri extinse >35%.
    contra = [c for c in contra if c["off_low"] <= 35]
    contra.sort(key=lambda x: x["off_low"])
    contra = contra[:args.contra_top]

    # 2c) Earnings guard pe numele FILTRATE (idei momentum + early buy, ~40 nume, nu tot
    # S&P): raportare in <=7 zile = risc de gap -> marcata in dashboard (A+/early).
    sess = requests.Session()
    crumb = yahoo_crumb(sess)
    today = datetime.now().date()

    def annotate_earnings(items):
        for it in items:
            ed = earnings_date(sess, crumb, it["ticker"])
            d2e, warn = None, False
            if ed:
                try:
                    d2e = (datetime.strptime(ed, "%Y-%m-%d").date() - today).days
                    warn = 0 <= d2e <= 7
                    if d2e < 0:
                        ed = None; d2e = None
                except Exception:
                    pass
            it["earnings"] = ed; it["days_to_earnings"] = d2e; it["earnings_warn"] = warn

    for srow in rising:
        annotate_earnings(srow.get("ideas", []))
    annotate_earnings(early)
    annotate_earnings(contra)

    # 3) New highs - new lows (52s)
    nh = sum(1 for a in stats.values() if a["at_high"])
    nl = sum(1 for a in stats.values() if a["at_low"])
    tot = len(stats)
    nhnl = {"new_highs": nh, "new_lows": nl, "net": nh - nl, "total": tot,
            "pct_high": round(100 * nh / tot, 1) if tot else 0, "pct_low": round(100 * nl / tot, 1) if tot else 0,
            "read": ("sanatos (NH domina)" if nh > nl * 2 else "slab (NL domina)" if nl > nh else "mixt")}

    for rows in [early, contra] + [s.get("ideas", []) for s in sector_rows]:
        for it in rows:
            it["asOf"] = asof
            it["sector"] = sec_of.get(it["ticker"], "")
            it["state"] = "MONITORIZARE EOD"
            it["earnings_status"] = "PROVIDER_DATE_UNCONFIRMED" if it.get("earnings") else "NEVERIFICAT"
            bars = yahoo_cache.get_ohlcv(it["ticker"]) or []
            vols = [b["vol"] for b in bars[-21:-1]]
            avg = sum(vols)/len(vols) if vols else 0
            it["rvol"] = round(bars[-1]["vol"]/avg, 2) if bars and avg else None
    ideas_count = sum(len(s.get("ideas", [])) for s in rising)
    out = {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "asOf": asof, "coverage_valid": len(cache), "coverage_total": len(all_syms),
        "nhnl_basis": "Close within 2% of 252-session high/low; proxy, not true exchange NH/NL",
        "sp_sample": {"asOf":asof, "valid":len(stats), "total":len(all_syms), "above200":sum(a["above_ma200"] for a in stats.values())/len(stats), "above50":sum(a["above_ma50"] for a in stats.values())/len(stats)},
        "spy_ret_3m": round((spy_3m or 0) * 100, 1),
        "rising_sectors": [s["etf"] for s in rising], "rising_count": len(rising),
        "ideas_count": ideas_count, "sectors": sector_rows,
        "early_buy": early, "early_count": len(early),
        "contrarian": contra, "contrarian_count": len(contra),
        "nh_nl": nhnl,
        "coverage": f"{len(cache)}/{len(all_syms)}",
        "disclaimer": "Screening/watchlist, NU recomandare financiara. Contrarian = risc mare, contra-trend. Valideaza intrare, stop, context.",
    }
    json.dump(out, open(args.output, "w", encoding="utf-8"), indent=2)
    print(f"\nSalvat: {args.output}")
    print(f"Rezumat: {len(rising)} sectoare in crestere / {ideas_count} idei momentum, "
          f"{len(early)} early buy (pullback), {len(contra)} contrarian, "
          f"NH-NL net={nh-nl} ({nh} sus / {nl} jos)")


if __name__ == "__main__":
    main()
