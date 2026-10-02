#!/usr/bin/env python3
"""
Pachet actionabil pe tezele inregistrate (sau --tickers):
  - Stop pe ATR (entry - atr_mult x ATR14)
  - Position size (risc % din cont / risc pe actiune) via skill-ul position-sizer
  - Earnings guard: marcheaza numele cu raportare in <N zile (risc de gap)
Config: dashboard\\discipline_config.json {account_size}. Sursa preturi/earnings: Yahoo.
NU e recomandare - sizing sugerat; verifica tu inainte de ordin.
"""
import argparse
import glob
import json
import os
import statistics as st
import sys
import time
from datetime import datetime, timezone

import requests

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE, "..", "position-sizer", "scripts"))
import position_sizer as ps  # noqa: E402

UA = {"User-Agent": "Mozilla/5.0"}


def resolve_state_dir():
    """State dir din discipline_config.json, altfel fallback local sub skill."""
    cfg = os.path.join(BASE, "dashboard", "discipline_config.json")
    try:
        sd = json.load(open(cfg, encoding="utf-8-sig")).get("state_dir")
        if sd:
            return sd
    except Exception:
        pass
    return os.path.join(BASE, "_trader_state", "theses")


DEFAULT_STATE = resolve_state_dir()


import yahoo_cache


def fetch_ohlc(symbol):
    rows = yahoo_cache.get_ohlcv(symbol, "1y", min_len=20)
    return [(r["high"], r["low"], r["close"]) for r in rows] if rows else None


def atr14(rows):
    trs = []
    for i in range(1, len(rows)):
        hi, lo, _ = rows[i]; prev_close = rows[i - 1][2]
        trs.append(max(hi - lo, abs(hi - prev_close), abs(lo - prev_close)))
    return st.mean(trs[-14:]) if len(trs) >= 14 else (st.mean(trs) if trs else None)


def yahoo_crumb(session):
    try:
        session.get("https://fc.yahoo.com", headers=UA, timeout=10)
        return session.get("https://query1.finance.yahoo.com/v1/test/getcrumb", headers=UA, timeout=10).text.strip()
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


def theses_tickers(state_dir):
    idx = os.path.join(state_dir, "_index.json")
    out = []
    try:
        data = json.load(open(idx, encoding="utf-8"))
        for _id, m in data.get("theses", {}).items():
            if str(m.get("status", "")).upper() not in {"CLOSED", "INVALIDATED", "EXPIRED", "ARCHIVED"}:
                out.append(m.get("ticker", "").upper())
    except Exception:
        pass
    return sorted(set(t for t in out if t))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--state-dir", default=DEFAULT_STATE)
    ap.add_argument("--tickers", default="", help="lista explicita in loc de teze")
    ap.add_argument("--risk-pct", type=float, default=1.0)
    ap.add_argument("--atr-mult", type=float, default=2.0)
    ap.add_argument("--exposure-ceiling", type=float, default=60.0, help="%% expunere neta maxima")
    ap.add_argument("--earnings-days", type=int, default=7)
    ap.add_argument("--output", default=os.path.join(BASE, "dashboard", "actionable.json"))
    args = ap.parse_args()
    os.makedirs(os.path.dirname(args.output), exist_ok=True)

    # account_size din config disciplina
    cfg_path = os.path.join(BASE, "dashboard", "discipline_config.json")
    account = None
    try:
        account = json.load(open(cfg_path, encoding="utf-8-sig")).get("account_size")
    except Exception:
        pass
    if not account:
        json.dump({"error": "account_size lipsa - seteaza in discipline_config.json", "rows": []},
                  open(args.output, "w", encoding="utf-8"), indent=2)
        print("account_size lipsa -> nu pot dimensiona. Seteaza in discipline_config.json."); return

    tickers = ([t.strip().upper() for t in args.tickers.split(",") if t.strip()]
               if args.tickers else theses_tickers(args.state_dir))
    if not tickers:
        json.dump({"account_size": account, "rows": [], "note": "Nicio teza/ticker."},
                  open(args.output, "w", encoding="utf-8"), indent=2)
        print("Nicio teza de dimensionat."); return

    print(f"Cont: ${account:,.0f} | risc/tranzactie: {args.risk_pct}% | stop: {args.atr_mult}xATR14 | {len(tickers)} nume")
    session = requests.Session()
    crumb = yahoo_crumb(session)
    today = datetime.now(timezone.utc).date()

    rows = []
    for t in tickers:
        oh = fetch_ohlc(t)
        if not oh:
            rows.append({"ticker": t, "error": "date indisponibile"}); continue
        entry = oh[-1][2]
        atr = atr14(oh)
        p = ps.SizingParameters(account_size=account, entry_price=entry, risk_pct=args.risk_pct,
                                atr=atr, atr_multiplier=args.atr_mult)
        r = ps.calculate_atr_based(p)
        stop = r["stop_price"]; shares = r["shares"]
        pos_val = round(shares * entry, 2)
        stop_pct = round((stop / entry - 1) * 100, 1)
        ed = earnings_date(session, crumb, t)
        d2e = None; warn = False
        if ed:
            try:
                d2e = (datetime.strptime(ed, "%Y-%m-%d").date() - today).days
                warn = 0 <= d2e <= args.earnings_days
            except Exception:
                pass
        rows.append({"ticker": t, "entry": round(entry, 2), "atr": round(atr, 2),
                     "stop": stop, "stop_pct": stop_pct, "shares": shares,
                     "position_value": pos_val, "risk_dollar": r["dollar_risk"],
                     "pos_pct": round(100 * pos_val / account, 1),
                     "earnings": ed, "days_to_earnings": d2e, "earnings_warn": warn})

    total_val = sum(r.get("position_value", 0) for r in rows)
    ceiling_val = account * args.exposure_ceiling / 100
    over = total_val > ceiling_val
    out = {"generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
           "account_size": account, "risk_pct": args.risk_pct, "atr_mult": args.atr_mult,
           "exposure_ceiling_pct": args.exposure_ceiling, "exposure_ceiling_val": round(ceiling_val, 0),
           "total_position_value": round(total_val, 0), "total_pos_pct": round(100 * total_val / account, 1),
           "over_ceiling": over, "earnings_days": args.earnings_days, "rows": rows,
           "disclaimer": "Sizing sugerat (ATR stop, risc fix). NU e recomandare. Verifica inainte de ordin."}
    json.dump(out, open(args.output, "w", encoding="utf-8"), indent=2)

    print(f"\n{'Ticker':<7}{'Entry':>9}{'Stop':>9}{'Stop%':>7}{'Actiuni':>9}{'Valoare':>11}{'%cont':>7}  Earnings")
    for r in rows:
        if "error" in r:
            print(f"{r['ticker']:<7}  {r['error']}"); continue
        ew = f"  [!] {r['earnings']} ({r['days_to_earnings']}z)" if r.get("earnings_warn") else (f"  {r['earnings']}" if r.get("earnings") else "")
        print(f"{r['ticker']:<7}{r['entry']:>9}{r['stop']:>9}{r['stop_pct']:>6}%{r['shares']:>9}"
              f"{r['position_value']:>11,.0f}{r['pos_pct']:>6}%{ew}")
    print(f"\nTotal expunere: ${total_val:,.0f} ({out['total_pos_pct']}% cont) | plafon {args.exposure_ceiling}% = ${ceiling_val:,.0f}"
          + ("  [!] PESTE PLAFON" if over else "  OK"))
    print(f"Salvat: {args.output}")


if __name__ == "__main__":
    main()
