#!/usr/bin/env python3
"""
Auto-inregistrare teze: ia idei din dashboard\\sector_ideas.json si le inregistreaza
in trader-memory-core (ca IDEA) prin adaptorul 'manual'. Cu DEDUP - nu re-inregistreaza
tickere care au deja o teza. NU e rulat zilnic automat (ar inunda jurnalul) - il rulezi
cand vrei sa actionezi pe idei.

Moduri:
  --mode vcp        (implicit) doar idei momentum marcate VCP (intrare tehnica)
  --mode contrarian doar candidatii contrarian
  --mode tickers --tickers AAPL,MSFT   doar aceste simboluri (din oricare lista)
  --mode all        toate ideile momentum + contrarian
  --dry-run         arata ce ar inregistra, fara sa scrie
"""
import argparse
import glob
import json
import os
import subprocess
import sys
import tempfile

BASE = os.path.dirname(os.path.abspath(__file__))
INGEST = os.path.join(BASE, "..", "trader-memory-core", "scripts", "thesis_ingest.py")


def _resolve_state_dir():
    cfg = os.path.join(BASE, "dashboard", "discipline_config.json")
    try:
        sd = json.load(open(cfg, encoding="utf-8-sig")).get("state_dir")
        if sd:
            return sd
    except Exception:
        pass
    return os.path.join(BASE, "_trader_state", "theses")


DEFAULT_STATE = _resolve_state_dir()


def existing_tickers(state_dir):
    """Tickerele cu teza activa (non-terminala) din _index.json."""
    out = set()
    idx_path = os.path.join(state_dir, "_index.json")
    terminal = {"CLOSED", "INVALIDATED", "EXPIRED", "ARCHIVED"}
    try:
        idx = json.load(open(idx_path, encoding="utf-8"))
        for _id, meta in idx.get("theses", {}).items():
            t = (meta.get("ticker") or "").upper()
            if t and str(meta.get("status", "")).upper() not in terminal:
                out.add(t)
    except Exception:
        pass
    return out


def collect(ideas, mode, tickers):
    recs = []
    momentum = []
    for s in ideas.get("sectors", []):
        if not s.get("rising"):
            continue
        for it in s.get("ideas", []):
            it = dict(it); it["_sector"] = s["sector"]
            momentum.append(it)
    contra = ideas.get("contrarian", [])

    def mom_record(it):
        vcp = it.get("vcp")
        return {
            "ticker": it["ticker"],
            "thesis_type": "pivot_breakout" if vcp else "growth_momentum",
            "setup_type": "VCP" if vcp else "RS leader",
            "thesis_statement": (f"{it['ticker']}: lider forta relativa in {it.get('_sector','?')} "
                                 f"(sector in crestere). RS {it.get('rs_score')}, "
                                 f"{it.get('pct_from_high')}% sub max 52s"
                                 + (", setup VCP la pivot." if vcp else ".")),
            "notes": f"Auto din breadth-dashboard. RS3m {it.get('ret_3m')}%, RS6m {it.get('ret_6m')}%.",
        }

    def contra_record(it):
        return {
            "ticker": it["ticker"],
            "thesis_type": "mean_reversion",
            "setup_type": "contrarian washout",
            "thesis_statement": (f"{it['ticker']}: contrarian - {it.get('pct_from_high')}% sub max DAR "
                                 f"revenit +{it.get('off_low')}% de la minim, peste MM20 in urcare."),
            "notes": f"Auto din breadth-dashboard (contrarian). 1L {it.get('ret_1m')}%. STOP sub minim recent obligatoriu.",
        }

    if mode == "vcp":
        recs = [mom_record(i) for i in momentum if i.get("vcp")]
    elif mode == "contrarian":
        recs = [contra_record(i) for i in contra]
    elif mode == "all":
        recs = [mom_record(i) for i in momentum] + [contra_record(i) for i in contra]
    elif mode == "tickers":
        want = {t.strip().upper() for t in tickers.split(",") if t.strip()}
        recs = [mom_record(i) for i in momentum if i["ticker"].upper() in want]
        recs += [contra_record(i) for i in contra if i["ticker"].upper() in want]
    return recs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-json", default=os.path.join(BASE, "dashboard", "sector_ideas.json"))
    ap.add_argument("--state-dir", default=DEFAULT_STATE)
    ap.add_argument("--mode", choices=["vcp", "contrarian", "tickers", "all"], default="vcp")
    ap.add_argument("--tickers", default="")
    ap.add_argument("--allow-dup", action="store_true", help="nu sari tickerele deja inregistrate")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not os.path.exists(args.source_json):
        print(f"Lipseste {args.source_json}. Ruleaza intai sector_ideas.py."); sys.exit(1)
    ideas = json.load(open(args.source_json, encoding="utf-8"))
    recs = collect(ideas, args.mode, args.tickers)

    if not args.allow_dup:
        have = existing_tickers(args.state_dir)
        before = len(recs)
        recs = [r for r in recs if r["ticker"].upper() not in have]
        skipped = before - len(recs)
        if skipped:
            print(f"Dedup: {skipped} tickere sarite (au deja teza).")

    if not recs:
        print(f"Nimic de inregistrat in modul '{args.mode}' (dupa dedup)."); return

    print(f"De inregistrat ({args.mode}): {', '.join(r['ticker'] for r in recs)}")
    for r in recs:
        print(f"  - {r['ticker']:<6} [{r['thesis_type']}/{r['setup_type']}] {r['thesis_statement'][:70]}...")

    if args.dry_run:
        print("\n(dry-run: nimic scris)"); return

    tmp = os.path.join(tempfile.mkdtemp(), "manual_theses.json")
    json.dump(recs, open(tmp, "w", encoding="utf-8"), indent=2)
    cmd = [sys.executable, INGEST, "--source", "manual", "--input", tmp, "--state-dir", args.state_dir]
    res = subprocess.run(cmd, capture_output=True, text=True)
    print("\n" + (res.stdout or "").strip())
    if res.returncode != 0:
        print("EROARE ingest:\n" + (res.stderr or "").strip()); sys.exit(res.returncode)
    print(f"\nInregistrate {len(recs)} teze in {args.state_dir}")


if __name__ == "__main__":
    main()
