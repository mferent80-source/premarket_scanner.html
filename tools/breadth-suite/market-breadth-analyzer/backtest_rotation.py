#!/usr/bin/env python3
"""
Backtest pe semnalul de "rotatie scurta" din dashboard: sector LIDER pe 3 luni (RS 3L > 0)
care iese pe 1 saptamana (RS 1S <= -1pp vs SPY) - aceleasi praguri ca alerta live.
Intrebarea: dupa alerta, sectorul continua sa subperformeze SPY (semnal real) sau
revine (zgomot / dip cumparat inapoi)?
Testeaza si variante mai stricte (-2pp, -3pp, 2 zile consecutive) - poate pragul live
e prea zgomotos si o varianta stricta are edge real.
Onest: ferestre forward suprapuse + fara costuri -> concluzia e DIRECTIONALA, nu dovada.
Ruleaza saptamanal din wrapper (concluzia nu se schimba zilnic).
"""
import argparse
import json
import os
import statistics as st
import sys
from datetime import datetime

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import yahoo_cache
from sector_ideas import SECTOR_ETF

BASE = os.path.dirname(os.path.abspath(__file__))
FWD = (20, 60)          # orizonturi forward (sesiuni)
GAP = 5                 # dedupe: minim 5 sesiuni intre doua semnale pe acelasi ETF

# variante de semnal: pragul pe RS 1S + cerinta de persistenta (2 zile consecutive)
VARIANTS = [
    {"key": "live", "label": "RS1S <= -1pp (alerta live)", "thr": -0.01, "consec": False},
    {"key": "p2",   "label": "RS1S <= -2pp",               "thr": -0.02, "consec": False},
    {"key": "p3",   "label": "RS1S <= -3pp",               "thr": -0.03, "consec": False},
    {"key": "c2",   "label": "2 zile consecutive <= -1pp", "thr": -0.01, "consec": True},
]


def ret(c, i, n):
    return c[i] / c[i - n] - 1


def med_pct(v):
    return round(st.median(v) * 100, 2) if v else None


def pos_pct(v):
    return round(100 * sum(1 for x in v if x > 0) / len(v), 1) if v else None


def main():
    ap = argparse.ArgumentParser(description="Backtest semnal rotatie sectoriala")
    ap.add_argument("--output", default=os.path.join(BASE, "dashboard", "backtest_rotation.json"))
    ap.add_argument("--range", default="10y")
    args = ap.parse_args()
    os.makedirs(os.path.dirname(args.output), exist_ok=True)

    spy = yahoo_cache.get_closes("SPY", args.range, min_len=300)
    if not spy:
        json.dump({"error": "SPY indisponibil"}, open(args.output, "w", encoding="utf-8"))
        print("SPY indisponibil - backtest sarit."); return

    # arrays per varianta; baseline comuna (toate zilele, toti ETF-ii)
    sig_abs = {v["key"]: {h: [] for h in FWD} for v in VARIANTS}
    sig_rel = {v["key"]: {h: [] for h in FWD} for v in VARIANTS}
    spy_after = {h: [] for h in FWD}   # doar pt varianta live
    base_abs = {h: [] for h in FWD}
    base_rel = {h: [] for h in FWD}
    per_etf = []

    for sec, etf in SECTOR_ETF.items():
        c = yahoo_cache.get_closes(etf, args.range, min_len=300)
        if not c:
            per_etf.append({"etf": etf, "n": 0, "note": "date insuficiente"}); continue
        n = min(len(c), len(spy))
        cc, ss = c[-n:], spy[-n:]   # aliniere pe coada (acelasi calendar bursier US)
        last = {v["key"]: -GAP for v in VARIANTS}
        count_live = 0
        for i in range(64, n - max(FWD)):   # de la 64 ca sa existe si RS-ul zilei precedente
            fa = {h: ret(cc, i + h, h) for h in FWD}
            fs = {h: ret(ss, i + h, h) for h in FWD}
            for h in FWD:
                base_abs[h].append(fa[h]); base_rel[h].append(fa[h] - fs[h])
            rs3 = ret(cc, i, 63) - ret(ss, i, 63)
            rs1 = ret(cc, i, 5) - ret(ss, i, 5)
            prs1 = ret(cc, i - 1, 5) - ret(ss, i - 1, 5)
            if rs3 <= 0:
                continue
            for v in VARIANTS:
                hit = rs1 <= v["thr"] and (not v["consec"] or prs1 <= v["thr"])
                if hit and i - last[v["key"]] >= GAP:
                    last[v["key"]] = i
                    for h in FWD:
                        sig_abs[v["key"]][h].append(fa[h])
                        sig_rel[v["key"]][h].append(fa[h] - fs[h])
                    if v["key"] == "live":
                        count_live += 1
                        for h in FWD:
                            spy_after[h].append(fs[h])
        per_etf.append({"etf": etf, "n": count_live})

    if not sig_rel["live"][60]:
        json.dump({"error": "niciun semnal in fereastra"}, open(args.output, "w", encoding="utf-8"))
        print("Niciun semnal gasit."); return

    def edge60(key):
        if not sig_rel[key][60]:
            return None
        return round((st.median(sig_rel[key][60]) - st.median(base_rel[60])) * 100, 2)

    variants_out = []
    for v in VARIANTS:
        k = v["key"]
        variants_out.append({
            "key": k, "label": v["label"], "n": len(sig_rel[k][60]),
            "rel20_med": med_pct(sig_rel[k][20]), "rel60_med": med_pct(sig_rel[k][60]),
            "rel_pos60": pos_pct(sig_rel[k][60]), "rel_edge60_pp": edge60(k),
        })

    rel_edge = edge60("live")
    if rel_edge <= -0.5:
        verdict = ("SLABICIUNE REALA: dupa alerta, sectorul a continuat istoric sa subperformeze "
                   "SPY - ia alerta in serios (evita/reduce sectorul)")
    elif rel_edge >= 0.5:
        verdict = ("CONTRARIAN: iesirea pe 1S a fost istoric recuperata - alerta e dip, "
                   "nu inceput de subperformanta")
    else:
        verdict = "FARA EDGE CLAR: alerta e context de risc/rotatie, NU semnal tranzactionabil"

    # exista o varianta stricta cu edge real (si esantion decent)?
    strict = [x for x in variants_out if x["key"] != "live" and x["rel_edge60_pp"] is not None
              and abs(x["rel_edge60_pp"]) >= 0.5 and x["n"] >= 30]
    if strict:
        best = max(strict, key=lambda x: abs(x["rel_edge60_pp"]))
        variant_note = (f"Varianta '{best['label']}' arata edge {best['rel_edge60_pp']:+.2f}pp/60z "
                        f"pe {best['n']} semnale - pragul merita atentie (tot directional).")
    else:
        variant_note = "Nicio varianta mai stricta nu arata edge >=0.5pp - concluzia 'context, nu semnal' tine si la praguri dure."

    out = {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "range": args.range, "n_signals": len(sig_rel["live"][60]), "gap_sessions": GAP,
        "signal": {"fwd20_med": med_pct(sig_abs["live"][20]), "fwd60_med": med_pct(sig_abs["live"][60]),
                   "pos60": pos_pct(sig_abs["live"][60]),
                   "rel20_med": med_pct(sig_rel["live"][20]), "rel60_med": med_pct(sig_rel["live"][60]),
                   "rel_pos60": pos_pct(sig_rel["live"][60])},
        "baseline": {"fwd20_med": med_pct(base_abs[20]), "fwd60_med": med_pct(base_abs[60]),
                     "pos60": pos_pct(base_abs[60]),
                     "rel20_med": med_pct(base_rel[20]), "rel60_med": med_pct(base_rel[60]),
                     "rel_pos60": pos_pct(base_rel[60])},
        "spy_after": {"fwd20_med": med_pct(spy_after[20]), "fwd60_med": med_pct(spy_after[60]),
                      "pos60": pos_pct(spy_after[60])},
        "rel_edge60_pp": rel_edge,
        "variants": variants_out,
        "variant_note": variant_note,
        "per_etf": per_etf,
        "verdict": verdict,
        "note": ("Praguri identice cu alerta live (RS3L>0, RS1S<=-1pp, dedupe 5 sesiuni) + variante stricte. "
                 "Ferestre forward suprapuse + fara costuri -> DIRECTIONAL, nu dovada statistica."),
    }
    tmp = args.output + ".tmp"
    json.dump(out, open(tmp, "w", encoding="utf-8"), indent=2)
    os.replace(tmp, args.output)
    print(f"Semnale (live): {out['n_signals']} · rel edge 60z: {rel_edge:+.2f}pp · {verdict}")
    for x in variants_out:
        print(f"  {x['label']:32s} n={x['n']:4d} rel60={x['rel60_med']}% edge={x['rel_edge60_pp']:+.2f}pp %+rel={x['rel_pos60']}%")
    print(f"  {variant_note}")
    print(f"Salvat: {args.output}")


if __name__ == "__main__":
    main()
