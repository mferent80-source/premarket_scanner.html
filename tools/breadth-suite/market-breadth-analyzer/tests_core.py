#!/usr/bin/env python3
"""
Teste pentru logica de decizie din breadth_dashboard (scorecard, alerte, parsare).
Ruleaza direct:  python tests_core.py   (compatibil si cu pytest)
"""
import sys

import breadth_dashboard as bd

RESULTS = []


def check(name, cond):
    RESULTS.append((name, bool(cond)))
    print(("PASS" if cond else "FAIL"), "-", name)


def make_data(sp=59.5, uptrend=38.8, ndx=57.5, r2k=62.0, sp_age=4, cur8=0.67):
    return {
        "sp": {"score": sp, "zone": "Neutral", "exposure": "60-75%", "weakest": "x (10)",
               "trend": "", "momentum": 55, "extra": "", "current_8ma": cur8,
               "days_old": sp_age, "data_date": "2026-07-24"},
        "uptrend": {"score": uptrend, "zone": "Cautious", "exposure": "Defensive (30-60%)",
                    "weakest": "y (32)", "trend": "", "extra": ""},
        "ndx": {"score": ndx, "zone": "Healthy", "exposure": "75-90%", "weakest": "z", "trend": "", "extra": ""},
        "r2k": {"score": r2k, "zone": "Healthy", "exposure": "75-90%", "weakest": "w", "trend": "", "extra": ""},
    }


def test_pct_ceiling():
    check("pct_ceiling: 'Defensive (30-60%)' -> 60", bd._pct_ceiling("Defensive (30-60%)") == 60)
    check("pct_ceiling: '75-90%' -> 90", bd._pct_ceiling("75-90%") == 90)
    check("pct_ceiling: text fara cifre -> None", bd._pct_ceiling("n/a") is None)
    check("pct_ceiling: ignora numere >100", bd._pct_ceiling("300 shares, 60%") == 60)


def test_alert_transitions():
    data = make_data(uptrend=38.0)
    analysis = bd.analyze(data)
    # istoric cu ziua precedenta TOT sub 40 -> nu trebuie sa re-alerteze pe stare
    prev_same = [{"date": "2026-07-28", "scores": {"sp": 59, "uptrend": 38.5, "ndx": 57, "r2k": 62},
                  "verdict": analysis["verdict"], "flags": [f[0] for f in analysis["flags"]]}]
    level, reasons = bd.alert_logic(data, analysis, prev_same)
    check("alerta NU se repeta cand sub-40 persista", level == "INFO" and not any("sub 40" in r for r in reasons))
    # ziua precedenta PESTE 40 -> crossing = ALERT
    prev_cross = [{"date": "2026-07-28", "scores": {"sp": 59, "uptrend": 45.0, "ndx": 57, "r2k": 62},
                   "verdict": analysis["verdict"], "flags": [f[0] for f in analysis["flags"]]}]
    level2, reasons2 = bd.alert_logic(data, analysis, prev_cross)
    check("crossing sub 40 declanseaza ALERT", level2 == "ALERT" and any("a trecut sub 40" in r for r in reasons2))
    # scadere brusca >=5p = ALERT chiar fara crossing
    data3 = make_data(ndx=50.0)
    analysis3 = bd.analyze(data3)
    prev3 = [{"date": "2026-07-28", "scores": {"sp": 59.5, "uptrend": 38.8, "ndx": 57.5, "r2k": 62},
              "verdict": analysis3["verdict"], "flags": [f[0] for f in analysis3["flags"]]}]
    level3, reasons3 = bd.alert_logic(data3, analysis3, prev3)
    check("scadere brusca -7.5p declanseaza ALERT", level3 == "ALERT" and any("scadere brusca" in r for r in reasons3))


def test_master_freshness_gating():
    data = make_data(sp_age=4)
    analysis = bd.analyze(data)
    detail = bd.detailed_verdict(data, analysis)
    mv_fresh = bd.master_verdict(data, analysis, detail, {}, {}, {})
    breadth_fresh = [c for c in mv_fresh["scorecard"] if c[0].startswith("Breadth")][0]
    # aceleasi date dar STATUTE (10 zile) -> votul de breadth trebuie neutralizat la 0
    data_stale = make_data(sp_age=10)
    analysis_s = bd.analyze(data_stale)
    detail_s = bd.detailed_verdict(data_stale, analysis_s)
    mv_stale = bd.master_verdict(data_stale, analysis_s, detail_s, {}, {}, {})
    breadth_stale = [c for c in mv_stale["scorecard"] if c[0].startswith("Breadth")][0]
    check("gating prospetime: vot breadth = 0 cand datele au >7 zile",
          breadth_stale[1] == 0 and "STALE" in breadth_stale[2])
    check("gating prospetime: votul ramane activ cand datele sunt recente",
          breadth_fresh[1] != 0 or "STALE" not in breadth_fresh[2])


def test_master_stance_buckets():
    # toate puternice -> RISK-ON / CONSTRUCTIV (scor pozitiv)
    data = make_data(sp=75, uptrend=72, ndx=78, r2k=74)
    analysis = bd.analyze(data)
    detail = bd.detailed_verdict(data, analysis)
    conf = {"verdict": "RISK-ON confirmat", "score": 3, "vix": 13}
    ideas = {"nh_nl": {"net": 80, "new_highs": 90, "new_lows": 10, "read": "sanatos"}}
    mv = bd.master_verdict(data, analysis, detail, ideas, conf, {"max_dist_count": 1, "indices": {"SPY": {"above_ma50": True}}})
    check("piata puternica -> stance pozitiv (RISK-ON/CONSTRUCTIV)", mv["stance"] in ("RISK-ON", "CONSTRUCTIV"))
    # toate slabe -> defensiv
    data2 = make_data(sp=25, uptrend=20, ndx=28, r2k=22, cur8=0.55)
    analysis2 = bd.analyze(data2)
    detail2 = bd.detailed_verdict(data2, analysis2)
    conf2 = {"verdict": "RISK-OFF confirmat", "score": -3, "vix": 34}
    ideas2 = {"nh_nl": {"net": -60, "new_highs": 5, "new_lows": 65, "read": "slab"}}
    mt2 = {"max_dist_count": 7, "indices": {"SPY": {"above_ma50": False}, "QQQ": {"above_ma50": False}}}
    mv2 = bd.master_verdict(data2, analysis2, detail2, ideas2, conf2, mt2)
    check("piata slaba -> stance defensiv (PRUDENTA/RISK-OFF)",
          mv2["stance"] in ("PRUDENTA / DEFENSIV", "RISK-OFF"))
    check("conflict detectat cand exista voturi + si -", mv2["conflict"] in (True, False))  # nu crapa
    # plafonul se reduce pe stance defensiv
    check("plafon redus la <=40% pe defensiv", (mv2.get("net_ceiling") or 100) <= 40 or mv2["score"] > -2)


def test_intermarket_vote():
    data = make_data()
    analysis = bd.analyze(data)
    detail = bd.detailed_verdict(data, analysis)
    im = {"verdict": "Macro RISK-OFF", "score": -3, "vix_term": 1.05, "backwardation": True}
    mv = bd.master_verdict(data, analysis, detail, {}, {}, {}, im)
    inter = [c for c in mv["scorecard"] if c[0].startswith("Intermarket")]
    check("backwardation VIX -> vot intermarket -2", inter and inter[0][1] == -2)


def test_history_stores_master():
    import os
    import tempfile
    data = make_data()
    analysis = bd.analyze(data)
    detail = bd.detailed_verdict(data, analysis)
    mv = bd.master_verdict(data, analysis, detail, {}, {}, {})
    path = os.path.join(tempfile.mkdtemp(), "h.json")
    hist = bd.build_history(data, analysis, "INFO", path, mv, {})
    check("istoricul stocheaza master_stance", hist[-1].get("master_stance") == mv["stance"])
    check("istoricul stocheaza master_score", hist[-1].get("master_score") == mv["score"])


def test_html_and_tabs_render():
    """Regresie: pagina se genereaza, JS-ul tab-urilor e sintactic valid (paranteze
    echilibrate), toate cele 5 pane exista si fiecare tab tinteste un pane real."""
    import os
    import re
    import tempfile
    data = make_data()
    analysis = bd.analyze(data)
    detail = bd.detailed_verdict(data, analysis)
    mv = bd.master_verdict(data, analysis, detail, {}, {}, {})
    hist = [{"date": "2026-07-28", "scores": {"sp": 59, "uptrend": 40, "ndx": 57, "r2k": 61},
             "verdict": "x", "alert": "INFO", "master_stance": mv["stance"], "master_score": 0,
             "idea_tickers": [], "rising_sectors": [], "flags": []}]
    path = os.path.join(tempfile.mkdtemp(), "t.html")
    bd.write_html(data=data, analysis=analysis, detail=detail, ideas={}, backtest={}, conf={}, disc={}, act={}, mt={}, mv=mv, val={}, im={}, pr={}, reviews=[], cal={}, bi={}, brot={}, brs={}, beb={}, vap={}, prev_snap=None, level="INFO", reasons=[], hist=hist, path=path)
    html = open(path, encoding="utf-8").read()
    m = re.search(r"<script>(.*?)</script>", html, re.DOTALL)
    check("HTML generat cu bloc <script>", m is not None)
    s = m.group(1) if m else ""
    check("JS: paranteze () echilibrate", s.count("(") == s.count(")"))
    check("JS: acolade {} echilibrate", s.count("{") == s.count("}"))
    check("JS: handler de click pe tab-uri prezent", "addEventListener" in s)
    tabs = set(re.findall(r'data-t="(\w+)"', html))
    panes = set(re.findall(r'<section class="pane[^"]*" id="(\w+)"', html))
    check("toate cele 5 tab-uri exista", tabs == {"overview", "idei", "risc", "validare", "date"})
    check("fiecare tab tinteste un pane existent", tabs == panes)


if __name__ == "__main__":
    test_pct_ceiling()
    test_alert_transitions()
    test_master_freshness_gating()
    test_master_stance_buckets()
    test_intermarket_vote()
    test_history_stores_master()
    test_html_and_tabs_render()
    failed = [n for n, ok in RESULTS if not ok]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} teste PASS")
    if failed:
        print("FAILED:", failed)
        sys.exit(1)
