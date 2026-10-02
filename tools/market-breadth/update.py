"""Import dated public breadth observations. No API key or third-party packages.

Each source keeps its observation date; a successful download is not freshness.
Sector observations come from the dated timeseries, not the undated summary.
"""
import csv
import io
import json
import math
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
UPTREND = "https://raw.githubusercontent.com/tradermonty/uptrend-dashboard/main/data/uptrend_ratio_timeseries.csv"
SP500 = "https://tradermonty.github.io/market-breadth-analysis/market_breadth_data.csv"
SECTORS = {
    "basicmaterials": "Basic Materials", "communicationservices": "Communication Services",
    "consumercyclical": "Consumer Cyclical", "consumerdefensive": "Consumer Defensive",
    "energy": "Energy", "financial": "Financial Services", "healthcare": "Healthcare",
    "industrials": "Industrials", "realestate": "Real Estate",
    "technology": "Technology", "utilities": "Utilities",
}


def number(value):
    n = float(value)
    if not math.isfinite(n):
        raise ValueError("Non-finite value")
    return n


def observation_date(value, today):
    d = date.fromisoformat(value)
    if d > today:
        raise ValueError("Future observation date")
    return value


def ratio(value):
    n = number(value)
    if not 0 <= n <= 1:
        raise ValueError("Ratio outside [0, 1]")
    return n


def parse_uptrend(text, today):
    latest = {}
    groups = {}
    for r in csv.DictReader(io.StringIO(text)):
        key = r["worksheet"]
        if key != "all" and key not in {"sec_" + k for k in SECTORS}:
            continue
        d = observation_date(r["date"], today)
        count, total = int(r["count"]), int(r["total"])
        if total <= 0 or not 0 <= count <= total:
            raise ValueError("Invalid coverage counts")
        p = ratio(r["ratio"])
        if abs(p - count / total) > .00001:
            raise ValueError("Ratio/count mismatch")
        row = {"date": d, "count": count, "total": total, "ratio": p,
               "ma10": ratio(r["ma_10"]) if r["ma_10"] else None,
               "slope": number(r["slope"]) if r["slope"] else None,
               "trend": r["trend"] if r["trend"] in ("up", "down", "neutral") else "unknown"}
        groups.setdefault(key, {})[d] = row
        if key not in latest or d > latest[key]["date"]:
            latest[key] = row
    if "all" not in latest:
        raise ValueError("No market aggregate")
    market = latest["all"]
    sectors = [{"name": SECTORS[k[4:]], **v} for k, v in latest.items() if k.startswith("sec_")]
    sectors.sort(key=lambda s: s["ratio"], reverse=True)
    history = [groups["all"][d] for d in sorted(groups["all"])[-60:]]
    return {"asOf": market["date"], "market": market, "sectors": sectors, "history": history}


def parse_sp500(text, today):
    rows = []
    for r in csv.DictReader(io.StringIO(text)):
        d = observation_date(r["Date"], today)
        rows.append({"date": d, "above200": ratio(r["Breadth_Index_Raw"]),
                     "above50": ratio(r["Breadth_50_Index_Raw"]) if r.get("Breadth_50_Index_Raw") else None,
                     "ma8": ratio(r["Breadth_Index_8MA"]), "ma200": ratio(r["Breadth_Index_200MA"]),
                     "bearish": r["Bearish_Signal"].lower() == "true"})
    if not rows:
        raise ValueError("Empty S&P500 CSV")
    rows.sort(key=lambda r: r["date"])
    return {"asOf": rows[-1]["date"], "latest": rows[-1], "history": rows[-60:]}


def fetch_source(key, url, parser, today, previous):
    try:
        with urlopen(Request(url, headers={"User-Agent": "TradingTools-Breadth/1.0"}), timeout=45) as res:
            text = res.read(8_000_001)
        if len(text) > 8_000_000:
            raise ValueError("CSV size limit exceeded")
        parsed = parser(text.decode("utf-8-sig"), today)
        old = previous.get("sources", {}).get(key, {})
        if old.get("asOf", "") > parsed["asOf"]:
            raise ValueError("Source date regressed")
        return key, {"url": url, "fetchStatus": "OK", **parsed}
    except Exception as e:
        old = previous.get("sources", {}).get(key, {})
        # Retain last known observation with original date and an explicit error.
        return key, {**old, "url": url, "fetchStatus": "ERROR", "error": str(e)[:180]}


def main():
    target = ROOT / "market-breadth/data/latest.json"
    previous = json.loads(target.read_text()) if target.exists() else {}
    now = datetime.now(timezone.utc)
    today = now.astimezone(ZoneInfo("America/New_York")).date()
    specs = [("uptrend", UPTREND, parse_uptrend), ("sp500", SP500, parse_sp500)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(fetch_source, k, u, p, today, previous) for k, u, p in specs]
        sources = dict(f.result() for f in futures)
    model = {"schemaVersion": 1, "checkedAt": now.isoformat(), "sources": sources}
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_suffix(".tmp")
    temp.write_text(json.dumps(model, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    os.replace(temp, target)
    for key, src in sources.items():
        print(key, src.get("asOf", "MISSING"), src["fetchStatus"])
    if all(s["fetchStatus"] == "ERROR" for s in sources.values()):
        print("WARNING: all sources failed; retained observations remain dated and non-actionable.")


if __name__ == "__main__":
    main()
