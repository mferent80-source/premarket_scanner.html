#!/usr/bin/env python3
"""
Breadth Dashboard - agregator peste 4 surse de breadth.
Citeste ultimul JSON din fiecare sursa, calculeaza:
  #2 divergenta intre piete, #3 verdict combinat + actiune, #1 alerte pe praguri,
  #4 raport HTML cu istoric, #6 componenta slaba per piata, #7 log + retentie.
Nu descarca date el insusi - doar agrega output-urile scripturilor.
"""
import argparse
import glob
import json
import math
import os
import re
import sys
from datetime import datetime

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE = os.path.dirname(os.path.abspath(__file__))

SOURCES = {
    "sp":      {"label": "S&P500",     "dir": os.path.join(BASE, "reports"),                         "prefix": "market_breadth_"},
    "uptrend": {"label": "Broad2800",  "dir": os.path.join(BASE, "..", "uptrend-analyzer", "reports"), "prefix": "uptrend_analysis_"},
    "ndx":     {"label": "Nasdaq*",  "dir": os.path.join(BASE, "nasdaq100", "reports"),             "prefix": "nasdaq100_breadth_"},
    "r2k":     {"label": "Small-cap*",  "dir": os.path.join(BASE, "russell2000", "reports"),           "prefix": "russell2000_breadth_"},
}


DASH_CSS = """
:root{
 --surface-0:#f4f4f2;--surface-1:#fcfcfb;--surface-2:#ffffff;
 --ink:#0b0b0b;--ink2:#52514e;--muted:#8a8984;--border:#e6e5e1;
 --series-1:#2a78d6;--series-7:#4a3aa7;
 --good:#0ca30c;--warning:#fab219;--serious:#ec835a;--critical:#d03b3b;
 color-scheme:light dark;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
 --surface-0:#121211;--surface-1:#1a1a19;--surface-2:#232322;
 --ink:#ffffff;--ink2:#c3c2b7;--muted:#8f8e85;--border:#2e2e2b;
 --series-1:#3987e5;--series-7:#9085e9;
}}
:root[data-theme="dark"]{
 --surface-0:#121211;--surface-1:#1a1a19;--surface-2:#232322;
 --ink:#ffffff;--ink2:#c3c2b7;--muted:#8f8e85;--border:#2e2e2b;
 --series-1:#3987e5;--series-7:#9085e9;
}
*{box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--surface-0);color:var(--ink);margin:0;padding:0 24px 40px;max-width:none;margin:0 auto}
h1{font-size:26px;margin:0} h2{font-size:20px;margin:20px 0 8px;color:var(--ink)} h3{font-size:17px;margin:14px 0 6px;color:var(--ink2)}
.muted,.sub{color:var(--muted);font-size:12px} p{font-size:15px;color:var(--ink2)}
.topbar{display:flex;justify-content:space-between;align-items:center;padding:16px 0 10px;position:sticky;top:0;background:var(--surface-0);z-index:5}
.tools button{background:var(--surface-2);color:var(--ink);border:1px solid var(--border);border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer;margin-left:8px}
.delta{background:var(--surface-1);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:12px;margin-bottom:14px}
.delta b{color:var(--ink);margin-right:6px}
.chip{display:inline-block;background:var(--surface-2);border:1px solid var(--border);border-radius:20px;padding:2px 10px;margin:2px 4px 2px 0;font-size:11px;color:var(--ink2)}
.chip.c-good{border-color:var(--good);color:var(--good)} .chip.c-bad{border-color:var(--critical);color:var(--critical)} .chip.c-warn{border-color:var(--warning);color:var(--ink)}
.cockpit{display:grid;grid-template-columns:minmax(280px,1.6fr) auto 2fr;gap:16px;align-items:center;margin-bottom:18px}
.semaphore{display:flex;gap:14px;align-items:center;padding:16px;border-radius:12px;border-left:6px solid var(--muted);background:var(--surface-1)}
.semaphore.s-good{border-color:var(--good)} .semaphore.s-warning{border-color:var(--warning)} .semaphore.s-serious{border-color:var(--serious)} .semaphore.s-critical{border-color:var(--critical)}
.sicon{font-size:34px;line-height:1}
.s-good .sicon{color:var(--good)} .s-warning .sicon{color:var(--warning)} .s-serious .sicon{color:var(--serious)} .s-critical .sicon{color:var(--critical)}
.slabel{font-size:10px;letter-spacing:1px;color:var(--muted)} .sstance{font-size:22px;font-weight:800;line-height:1.1;margin:2px 0} .ssub{font-size:11px;color:var(--ink2)}
.gaugebox{text-align:center} .gauge{width:180px;height:116px} .gauge .gv{font-size:26px;font-weight:800;fill:var(--ink)} .gauge .gl{font-size:11px;fill:var(--muted)} .gsub{font-size:11px;color:var(--muted)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:10px}
.kpi{background:var(--surface-1);border:1px solid var(--border);border-radius:10px;padding:10px 8px;text-align:center}
.kpi .kv{font-size:22px;font-weight:800;color:var(--ink)} .kpi .kl{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}
.kpi.k-good .kv{color:var(--good)} .kpi.k-warning .kv{color:var(--warning)} .kpi.k-critical .kv{color:var(--critical)}
.tabs{display:flex;gap:4px;border-bottom:2px solid var(--border);margin-bottom:16px;position:sticky;top:52px;background:var(--surface-0);z-index:4}
.tab{background:none;border:none;border-bottom:2px solid transparent;margin-bottom:-2px;padding:9px 16px;font-size:13px;color:var(--muted);cursor:pointer}
.tab.active{color:var(--ink);border-color:var(--series-1);font-weight:600}
.pane{display:none} .pane.active{display:block}
.master{background:var(--surface-1);border:2px solid var(--border);border-radius:12px;padding:16px 20px;margin-bottom:16px}
.mhead{display:flex;align-items:baseline;gap:14px} .mstance{font-size:24px;font-weight:800} .mscore{font-size:13px;color:var(--muted)}
.maction{font-size:14px;color:var(--ink);margin:6px 0} .mmeta{font-size:12px;color:var(--ink2);margin-bottom:10px}
.verdict{background:var(--surface-1);border:1px solid var(--border);border-left:4px solid var(--warning);padding:12px 16px;border-radius:8px;margin-bottom:14px}
.verdict b{font-size:15px} .verdict .act{color:var(--ink2);margin-top:4px;font-size:13px}
.alert{background:var(--surface-1);border:1px solid var(--critical);border-left:4px solid var(--critical);padding:10px 16px;border-radius:8px;margin-bottom:14px}
.detail{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;margin:8px 0}
.ideasgrid{grid-template-columns:repeat(auto-fit,minmax(360px,1fr))}
.dcol{background:var(--surface-1);border:1px solid var(--border);border-radius:10px;padding:12px 16px;overflow-x:auto}
table.ideas td,table.ideas th{white-space:nowrap}
ul{margin:6px 0 0 18px;padding:0} li{font-size:12px;margin:3px 0;color:var(--ink2)}
table{border-collapse:collapse;width:100%;font-size:14px;margin-top:8px}
th,td{padding:6px 8px;text-align:left;border-bottom:1px solid var(--border)} th{color:var(--muted);font-weight:600}
table.ideas b{color:var(--ink)}
table.scorecard th,table.scorecard td{vertical-align:top}
.mrecon li{font-size:11px;color:var(--muted)}
table.hmtx{border-collapse:separate;border-spacing:3px;margin-top:2px} table.hmtx th:not(:first-child):not(.ht){text-align:right}
table.hmtx th,table.hmtx td{border-bottom:none;padding:5px 9px} table.hmtx td{border-radius:6px}
table.hmtx td.hv{text-align:right;font-variant-numeric:tabular-nums;font-weight:700;color:var(--ink);min-width:52px}
table.hmtx td.hn{white-space:nowrap;background:var(--surface-2)} table.hmtx .ht{text-align:center}
.duo{display:grid;grid-template-columns:minmax(360px,1.5fr) minmax(300px,1fr);gap:12px;margin:8px 0;align-items:start}
.sboard{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:16px}
.scard{background:var(--surface-1);border:1px solid var(--border);border-top:3px solid var(--muted);border-radius:12px;padding:12px 14px}
.scard[data-src]{cursor:pointer;transition:border-color .15s,transform .15s}
.scard[data-src]:hover{border-color:var(--series-1);transform:translateY(-1px)}
.scard .sbl{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.scard .sbv{font-size:34px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.scard .sbz{font-size:11px;color:var(--ink2);margin-top:5px}
.scard .sbspark{margin-top:6px;opacity:.85}
#histtbl.hl-sp .c-sp,#histtbl.hl-uptrend .c-uptrend,#histtbl.hl-ndx .c-ndx,#histtbl.hl-r2k .c-r2k{background:rgba(42,120,214,.14)}
.sdelta{font-size:11px;font-weight:600;border:1px solid var(--border);border-radius:10px;padding:1px 8px;margin-left:8px;vertical-align:4px}
.sd-up{color:var(--good);border-color:var(--good)} .sd-dn{color:var(--critical);border-color:var(--critical)} .sd-flat{color:var(--muted)}
.rrg{width:100%;max-width:360px;height:auto} .qlab{font-size:10px;fill:var(--muted)} .rlab{font-size:9px;fill:var(--ink2)}
.linechart{width:100%;height:auto} .grid{stroke:var(--border);stroke-width:1} .axt{font-size:9px;fill:var(--muted)} .endlab{font-size:10px;font-weight:600}
.riskgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:6px}
.rcard{background:var(--surface-1);border:1px solid var(--border);border-radius:10px;padding:12px 16px}
.rmeta{font-size:12px;color:var(--ink2);margin-top:6px}
.rbar{display:grid;grid-template-columns:70px 1fr 110px;gap:8px;align-items:center;margin:5px 0;font-size:11px}
.rbl{color:var(--ink);font-weight:600} .rbt{background:var(--surface-0);border-radius:4px;height:10px;overflow:hidden} .rbf{background:var(--serious);height:100%} .rbv{color:var(--muted);text-align:right}
.badges{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.fbadge{font-size:11px;border-radius:6px;padding:3px 8px;border:1px solid var(--border)}
.fbadge.f-fresh{color:var(--good);border-color:var(--good)} .fbadge.f-stale{color:var(--warning)} .fbadge.f-old{color:var(--critical);border-color:var(--critical)}
.tag{font-size:10px;border-radius:4px;padding:1px 6px;margin-left:4px} .t-good{color:var(--good)} .t-bad{color:var(--critical)} .t-warn{color:var(--serious)}
[title]{cursor:help}
@media (max-width:820px){.cockpit{grid-template-columns:1fr}.riskgrid{grid-template-columns:1fr}.duo{grid-template-columns:1fr}}
@media print{.tools,.tabs{display:none}.pane{display:block!important}.topbar{position:static}body{max-width:none}}
"""


def latest_json(folder, prefix):
    files = [f for f in glob.glob(os.path.join(folder, prefix + "*.json"))
             if "history" not in os.path.basename(f)]
    if not files:
        return None
    files.sort(key=os.path.getmtime, reverse=True)
    try:
        return json.load(open(files[0], encoding="utf-8"))
    except Exception:
        return None


def latest_json_age_days(folder, prefix):
    """Varsta (zile) a celui mai nou fisier al sursei - ca sa NU construim tacut
    verdictul pe output-ul de ieri cand scriptul sursei a esuat azi."""
    import time as _t
    files = [f for f in glob.glob(os.path.join(folder, prefix + "*.json"))
             if "history" not in os.path.basename(f)]
    if not files:
        return None
    newest = max(os.path.getmtime(f) for f in files)
    return round((_t.time() - newest) / 86400, 1)


def atomic_json_dump(obj, path):
    """Scriere atomica (temp + os.replace) - fara JSON corupt la rulari suprapuse."""
    tmp = path + ".tmp"
    json.dump(obj, open(tmp, "w", encoding="utf-8"), indent=2)
    os.replace(tmp, path)


def read_all():
    out = {}
    # S&P (skill oficial)
    d = latest_json(SOURCES["sp"]["dir"], SOURCES["sp"]["prefix"])
    if d:
        c = d.get("composite", {})
        comps = d.get("components", {})
        mom = comps.get("ma_crossover", {}).get("score")
        cur8 = comps.get("breadth_level_trend", {}).get("current_8ma")
        sp_date = d.get("metadata", {}).get("data_freshness", {}).get("latest_date")
        sp_old = d.get("metadata", {}).get("data_freshness", {}).get("days_old")
        out["sp"] = {
            "current_8ma": cur8,
            "data_date": sp_date, "days_old": sp_old,
            "score": round(float(c.get("composite_score", 0)), 1),
            "zone": c.get("zone", "?"),
            "exposure": c.get("exposure_guidance", "?"),
            "weakest": f"{c.get('weakest_health', {}).get('label', '?')} ({c.get('weakest_health', {}).get('score', '?')})",
            "trend": _tr(d.get("trend_summary", {}).get("direction"), d.get("trend_summary", {}).get("delta")),
            "momentum": mom,
            "extra": f"momentum(8/200MA) {mom}" if mom is not None else "",
        }
    # Uptrend (universul larg ~2800)
    d = latest_json(SOURCES["uptrend"]["dir"], SOURCES["uptrend"]["prefix"])
    if d:
        c = d.get("composite", {})
        w = c.get("weakest_component", {})
        wl = w.get("label") or w.get("component") or "?"
        ws = w.get("score", "?")
        warns = c.get("active_warnings", []) or []
        out["uptrend"] = {
            "score": round(float(c.get("composite_score", 0)), 1),
            "zone": c.get("zone", "?"),
            "exposure": c.get("exposure_guidance", "?"),
            "weakest": f"{wl} ({ws})",
            "trend": "",  # istoric propriu gestionat mai jos
            "extra": (f"{len(warns)} warning-uri" if warns else "fara warning-uri"),
        }
    # Nasdaq & Russell (scripturi proprii, aceeasi schema)
    for key in ("ndx", "r2k"):
        d = latest_json(SOURCES[key]["dir"], SOURCES[key]["prefix"])
        if d:
            p200 = d.get("pct_above_200ma"); p50 = d.get("pct_above_50ma")
            # #6 componenta slaba = veriga cea mai joasa dintre trend(MM200) si momentum(MM50)
            if p200 is not None and p50 is not None:
                weakest = f"momentum MM50 ({p50}%)" if p50 < p200 else f"trend MM200 ({p200}%)"
            else:
                weakest = "?"
            out[key] = {
                "score": round(float(d.get("composite_score", 0)), 1),
                "zone": d.get("zone", "?"),
                "exposure": d.get("exposure_guidance", "?"),
                "weakest": weakest,
                "trend": _tr(d.get("trend", {}).get("direction"), d.get("trend", {}).get("delta")),
                "extra": f">MM200 {p200}% | >MM50 {p50}%",
            }
    # varsta fisierului sursa (detecteaza scriptul-sursa esuat azi -> output de ieri)
    for k in out:
        out[k]["_file_age"] = latest_json_age_days(SOURCES[k]["dir"], SOURCES[k]["prefix"])
    from yahoo_cache import business_age
    for key in list(out):
        original = latest_json(SOURCES[key]["dir"], SOURCES[key]["prefix"]) or {}
        meta = original.get("metadata", {})
        date = original.get("data_date") or meta.get("latest_data_date") or meta.get("data_freshness", {}).get("latest_date")
        if business_age(date) > 2:
            del out[key]
        else:
            out[key]["data_date"] = date
    return out


def _tr(direction, delta):
    m = {"improving": "in crestere", "deteriorating": "in scadere", "stable": "stabil"}
    ro = m.get(str(direction), "")
    if not ro:
        return ""
    if delta not in (None, 0):
        sign = f"+{delta}" if (isinstance(delta, (int, float)) and delta > 0) else f"{delta}"
        return f"{ro} ({sign})"
    return ro


def analyze(data):
    """#2 divergenta + #3 verdict combinat."""
    def sc(k):
        return data.get(k, {}).get("score")
    scores = {k: sc(k) for k in ("sp", "uptrend", "ndx", "r2k") if sc(k) is not None}
    if not scores:
        return {"verdict": "Date indisponibile", "action": "Verifica scripturile.", "flags": [], "regime": "unknown"}

    idx_vals = [v for k, v in scores.items() if k in ("sp", "ndx")]
    idx_avg = sum(idx_vals) / len(idx_vals) if idx_vals else None
    broad = scores.get("uptrend")
    small = scores.get("r2k")

    flags = []
    if broad is not None and idx_avg is not None and broad < idx_avg - 12:
        flags.append(("narrow_market", f"⚠️ Piata larga (2800) {round(broad,1)} << large-cap {round(idx_avg,1)} → raliu INGUST: RISC/volatilitate ridicata (nu implica randament slab - vezi backtest)"))

    # Flag contrarian: breadth extrem de slab = washout istoric bullish (backtest: 8MA<0.40 -> +9.9%/60z, 81% pozitiv)
    cur8 = data.get("sp", {}).get("current_8ma")
    if cur8 is not None:
        if cur8 < 0.40:
            flags.append(("washout_contrarian", f"✓ CONTRARIAN: 8MA {cur8:.2f} < 0.40 = washout. Istoric BULLISH: +9.9%/60z (81% pozitiv). Urmareste trough pt re-intrare."))
        elif cur8 < 0.50:
            flags.append(("low_breadth_watch", f"ⓘ 8MA {cur8:.2f} < 0.50 (piata selectiva). Istoric: randamente forward PESTE medie (+3pp/60z) dar drawdown mai mare."))
    if small is not None and idx_avg is not None:
        if small < idx_avg - 8:
            flags.append(("smallcap_lag", f"⚠️ Small-caps {round(small,1)} raman in urma → apetit de risc in scadere"))
        elif small > idx_avg + 8:
            flags.append(("smallcap_lead", f"✓ Small-caps {round(small,1)} conduc → risk-on sanatos"))

    lo = min(scores.values()); hi = max(scores.values())
    flag_keys = {f[0] for f in flags}
    if lo >= 60:
        regime, verdict, action = "risk_on", "Risk-ON larg", "Participare larga pe toate segmentele. Pozitii pline, favorizeaza momentum."
    elif "narrow_market" in flag_keys and idx_avg and idx_avg >= 52:
        regime, verdict, action = "narrow", "INGUST (risc ridicat)", "Large-cap tine indicii, piata larga e slaba. Backtest: NU prezice randament slab, DAR asociat cu volatilitate/drawdown mai mare. Deci: pastreaza expunerea in lideri, strange stopurile, nu supra-dimensiona."
    elif hi < 40:
        regime, verdict, action = "risk_off", "Risk-OFF", "Breadth slab pe toate. Prezervare capital, ridica cash, asteapta stabilizare."
    elif idx_avg and idx_avg >= 50 and (small is None or small >= 45):
        regime, verdict, action = "constructive", "Constructiv, selectiv", "Regim OK dar nu euforic. Adauga risc selectiv, in nume cu forta relativa."
    else:
        regime, verdict, action = "mixed", "Mixt / racire", "Semnale mixte. Redu marimea pozitiilor noi, prioritizeaza calitatea."

    return {"verdict": verdict, "action": action, "flags": flags, "regime": regime,
            "idx_avg": round(idx_avg, 1) if idx_avg else None, "min": round(lo, 1), "max": round(hi, 1)}


def _pct_ceiling(s):
    """Extrage plafonul (nr. maxim %) dintr-un string de expunere, ex. 'Defensive (30-60%)' -> 60."""
    nums = re.findall(r"(\d+)\s*%?", str(s))
    nums = [int(n) for n in nums if int(n) <= 100]
    return max(nums) if nums else None


def detailed_verdict(data, analysis):
    """Verdict detaliat: diagnostic pe segmente, plafon net expunere, plan, ce urmaresc, incredere."""
    def sc(k): return data.get(k, {}).get("score")
    sp, ndx, r2k, brd = sc("sp"), sc("ndx"), sc("r2k"), sc("uptrend")
    idx_avg = analysis.get("idx_avg")
    flag_keys = {f[0] for f in analysis["flags"]}

    # Plafon net de expunere = cel mai conservator plafon dintre surse (constrangerea care leaga)
    ceilings = []
    for k in ("sp", "uptrend", "ndx", "r2k"):
        c = _pct_ceiling(data.get(k, {}).get("exposure"))
        if c is not None:
            ceilings.append((SOURCES[k]["label"], c))
    net_ceiling = min(c for _, c in ceilings) if ceilings else None
    binder = min(ceilings, key=lambda x: x[1])[0] if ceilings else "?"

    # Diagnostic pe segmente
    diag = []
    if sp is not None and ndx is not None:
        z = data["sp"]["zone"]
        diag.append(f"Large-cap: S&P {sp} ({z}), Nasdaq {ndx} — {'sustin indicii' if idx_avg and idx_avg>=50 else 'slabesc'}. "
                    f"Momentum S&P (8/200MA): {data['sp'].get('momentum','?')}.")
    if brd is not None:
        gap = round((idx_avg - brd), 1) if idx_avg is not None else None
        diag.append(f"Piata larga (~2800 actiuni): {brd} ({data['uptrend']['zone']})"
                    + (f", cu {gap} pct SUB large-cap" if gap and gap > 0 else "")
                    + f". Veriga slaba: {data['uptrend'].get('weakest','?')}.")
    if r2k is not None and idx_avg is not None:
        rel = "conduc (risk-on)" if r2k > idx_avg + 8 else "raman in urma (risk-off incipient)" if r2k < idx_avg - 8 else "in linie cu large-cap"
        diag.append(f"Small-caps (R2K* {r2k}): {rel}. Veriga slaba: {data['r2k'].get('weakest','?')}.")

    # trenduri notabile
    trends = []
    for k in ("sp", "ndx", "r2k"):
        t = data.get(k, {}).get("trend")
        if t and ("crestere" in t or "scadere" in t):
            trends.append(f"{SOURCES[k]['label']} {t}")
    if trends:
        diag.append("Dinamica: " + "; ".join(trends) + ".")

    # Plan de actiune pe regim
    regime = analysis["regime"]
    playbook = {
        "risk_on": [
            "Expunere aproape de plafon; poti tine pozitii pline.",
            "Favorizeaza momentum/growth cu forta relativa.",
            "Stopuri normale; lasa castigatorii sa curga.",
        ],
        "narrow": [
            f"Plafoneaza expunerea NETA la ~{net_ceiling}% (leaga {binder}) - pt volatilitate, nu pt ca 'pica'.",
            "Concentreaza-te pe lideri cu forta relativa; evita numele slabe din coada.",
            "Strange stopurile: backtest arata drawdown-uri mai mari in acest regim.",
            "NU vinde in panica pe breadth slab - istoric a fost contrarian bullish, nu bearish.",
        ],
        "constructive": [
            f"Expunere pana la ~{net_ceiling}%, adaugi selectiv.",
            "Prioritizeaza calitate + forta relativa; intra la retrageri, nu in extensie.",
            "Stopuri normale-spre-stranse.",
        ],
        "mixed": [
            f"Expunere prudenta (~{net_ceiling}%), pozitii noi mai mici.",
            "Prioritizeaza calitatea; evita sectoarele lagging.",
            "Ridica putin cash daca breadth continua sa scada.",
        ],
        "risk_off": [
            f"Prezervare capital; expunere sub ~{net_ceiling}%, ridica cash.",
            "Fara pozitii noi speculative; protejeaza castigurile.",
            "Asteapta stabilizarea breadth (trough) inainte de reangajare.",
        ],
        "unknown": ["Date insuficiente - verifica sursele."],
    }.get(regime, [])

    # Ce urmaresc (praguri care schimba regimul)
    watch = []
    if brd is not None:
        watch.append(f"Broad2800: peste 45 → iese din 'ingust'; sub 30 → risk-off.")
    if r2k is not None and idx_avg is not None:
        watch.append(f"R2K*: sub {round(idx_avg-8,1)} → small-caps lag (risk-off incipient); peste {round(idx_avg+8,1)} → conduc.")
    if sp is not None:
        watch.append(f"S&P: peste 60 → Healthy (upgrade); sub 40 → Weakening (alerta).")

    # Incredere = cat de acord sunt sursele
    vals = [v for v in (sp, ndx, r2k, brd) if v is not None]
    spread = (max(vals) - min(vals)) if len(vals) >= 2 else 0
    if spread <= 8:
        conf = f"RIDICATA (surse aliniate, spread {round(spread,1)})"
    elif spread <= 18:
        conf = f"MEDIE (spread {round(spread,1)} — divergenta moderata)"
    else:
        conf = f"SCAZUTA (spread {round(spread,1)} — surse in dezacord, semnalul e fragil)"

    return {"net_ceiling": net_ceiling, "binder": binder, "ceilings": ceilings,
            "diagnosis": diag, "playbook": playbook, "watch": watch, "confidence": conf, "spread": round(spread, 1)}


def master_verdict(data, analysis, detail, ideas, conf, mt, im=None):
    """Sinteza TUTUROR semnalelor intr-un verdict unic, cu scorecard si impacarea conflictelor."""
    card = []  # (dimensiune, vot int, citire text)

    # 1. Breadth participare (4 surse) - din regim.
    # GATING PROSPETIME: daca datele S&P (CSV TraderMonty) sunt mai vechi de 7 zile,
    # votul de breadth e NEUTRALIZAT (0) - nu votam pe date statute.
    reg = analysis.get("regime")
    reg_vote = {"risk_on": 2, "constructive": 1, "mixed": 0, "narrow": -1, "risk_off": -2}.get(reg, 0)
    sp_age = data.get("sp", {}).get("days_old")
    breadth_note = f"{analysis.get('verdict')} (idx {analysis.get('idx_avg')}, min {analysis.get('min')})"
    if sp_age is not None and sp_age > 7:
        reg_vote = 0
        breadth_note += f" ⚠️ STALE {sp_age}z - vot neutralizat"
    elif sp_age is not None and sp_age > 3:
        breadth_note += f" (date vechi de {sp_age}z)"
    card.append((f"Breadth participare ({len(data)}/4 surse valide)", reg_vote, breadth_note))

    # 2. Market timing O'Neil (volum EOD, sesiuni incheiate)
    if mt and sum(not a.get("error") for a in mt.get("indices", {}).values()) >= 3:
        worst = mt.get("max_dist_count", 0)
        below50 = sum(1 for a in mt["indices"].values() if not a.get("above_ma50", True) and not a.get("error"))
        ftd = any(a.get("ftd_days_ago") is not None for a in mt["indices"].values() if not a.get("error"))
        if worst >= 6 or below50 >= 2:
            mv = -2
        elif worst >= 4:
            mv = -1
        else:
            mv = 1
        if ftd and mv < 0:
            mv += 1  # incercare de revenire atenueaza
        card.append(("Market timing (distribution days)", mv,
                     f"max {worst} dist.days, {below50}/3 sub MM50" + (", follow-through recent" if ftd else "")))

    # 3. Confirmare risc (VIX + credit + equal-weight)
    if conf and conf.get("verdict"):
        cv = 2 if conf.get("score", 0) >= 2 else -2 if conf.get("score", 0) <= -2 else (1 if conf.get("score", 0) > 0 else (-1 if conf.get("score", 0) < 0 else 0))
        card.append(("Confirmare risc (VIX/credit/breadth pret)", cv, f"{conf['verdict']} (VIX {conf.get('vix','?')})"))

    # 4. New highs - new lows (internal)
    if ideas and ideas.get("nh_nl"):
        n = ideas["nh_nl"]
        nv = 1 if (n["net"] > 0 and n["new_highs"] > 2 * max(n["new_lows"], 1)) else (-1 if n["net"] < 0 else 0)
        card.append(("New Highs - New Lows", nv, f"{n['new_highs']}▲/{n['new_lows']}▼ (net {n['net']:+d}), {n['read']}"))

    # 5. Intermarket / macro (VIX term + credit + dolar)
    if im and im.get("verdict"):
        iv = 1 if im.get("score", 0) >= 2 else -1 if im.get("score", 0) <= -2 else 0
        if im.get("backwardation"):
            iv = -2  # backwardation VIX = stres acut, penalizare mai grea
        card.append(("Intermarket / macro", iv, f"{im['verdict']} (VIX term {im.get('vix_term','?')})"))

    # 6. Divergente notabile
    fk = {f[0] for f in analysis.get("flags", [])}
    if "washout_contrarian" in fk:
        card.append(("Washout contrarian (8MA<0.40)", 1, "istoric BULLISH (+9.9%/60z)"))
    if "smallcap_lag" in fk:
        card.append(("Small-caps", -1, "raman in urma (risk-off incipient)"))
    elif "smallcap_lead" in fk:
        card.append(("Small-caps", 1, "conduc (risk-on)"))

    score = sum(v for _, v, _ in card)
    n = len(card)
    pos = sum(1 for _, v, _ in card if v > 0)
    neg = sum(1 for _, v, _ in card if v < 0)

    if not data:
        return {"score":None, "stance":"NEVERIFICAT", "action":"Breadth indisponibil; verdict suspendat.", "confidence":"INSUFICIENTA", "conflict":False, "net_ceiling":None, "scorecard":card, "reconciliation":[], "pos":pos, "neg":neg}

    # Pozitie neta
    if score >= 4:
        stance, action = "RISK-ON", "Poti tine pozitii pline; favorizeaza lideri cu forta relativa."
    elif score >= 2:
        stance, action = "CONSTRUCTIV", "Adauga selectiv in lideri; stopuri normale."
    elif score >= -1:
        stance, action = "MIXT / PRUDENTA SELECTIVA", "Selectiv, pozitii noi mai mici, stopuri stranse. Nu supra-dimensiona."
    elif score >= -3:
        stance, action = "PRUDENTA / DEFENSIV", "Redu expunerea, ridica cash, doar setup-uri A+. Protejeaza castigurile."
    else:
        stance, action = "RISK-OFF", "Prezervare capital; fara pozitii noi speculative; asteapta stabilizare."

    # Incredere = cat de acord sunt dimensiunile
    if pos and neg:
        conflict = True
        conf_txt = f"SCAZUTA - semnale in conflict ({pos} pozitive / {neg} negative)"
    elif pos + neg >= 3 and len(data) == 4:
        conflict = False
        conf_txt = "RIDICATA - dimensiunile sunt aliniate"
    else:
        conflict = False
        conf_txt = "MEDIE - acoperire partiala sau consens insuficient"

    # Impacarea conflictelor (naratiune)
    recon = []
    if conflict:
        bull = [c[0] for c in card if c[1] > 0]
        bear = [c[0] for c in card if c[1] < 0]
        recon.append(f"Semnale POZITIVE: {', '.join(bull)}.")
        recon.append(f"Semnale NEGATIVE: {', '.join(bear)}.")
        # regula: market timing pe date live are prioritate cand contrazice breadth-ul lag
        mt_neg = any(c[0].startswith("Market timing") and c[1] < 0 for c in card)
        if mt_neg:
            recon.append("Market timing foloseste sesiuni EOD incheiate (mai proaspete ca breadth-ul) - cand semnaleaza vanzare, are prioritate ca avertisment timpuriu.")
        recon.append("Conflictul in sine = incertitudine: redu marimea, nu paria puternic intr-o directie.")
    else:
        recon.append("Dimensiunile converg - verdict cu incredere mai mare.")

    net_ceiling = detail.get("net_ceiling")
    # ajusteaza plafonul in jos daca pozitia e defensiva
    if score <= -2 and net_ceiling:
        net_ceiling = min(net_ceiling, 40)
    elif score <= -1 and net_ceiling:
        net_ceiling = min(net_ceiling, 60)

    return {"score": score, "stance": stance, "action": action, "confidence": conf_txt,
            "conflict": conflict, "net_ceiling": net_ceiling, "scorecard": card, "reconciliation": recon,
            "pos": pos, "neg": neg}


def observation_day(data, ideas=None):
    from yahoo_cache import business_age
    dates = [v.get("data_date") for v in data.values() if business_age(v.get("data_date")) <= 2]
    if ideas and business_age(ideas.get("asOf")) <= 2:
        dates.append(ideas["asOf"])
    return max(dates) if dates else datetime.now().strftime("%Y-%m-%d")


def alert_logic(data, analysis, hist):
    """#1 alerte pe praguri fata de ultima rulare (zi diferita)."""
    reasons = []
    prev = None
    today = observation_day(data)
    for h in reversed(hist):
        if h.get("date") != today:
            prev = h
            break

    # ALERTE PE TRANZITIE, nu pe stare: o conditie care persista (ex. "sub 40" a treia zi)
    # NU mai declanseaza ALERT zilnic - previne alert fatigue. Alerta = ceva NOU s-a intamplat.
    for k in ("sp", "uptrend", "ndx", "r2k"):
        cur = data.get(k, {}).get("score")
        if cur is None:
            continue
        if prev:
            pv = prev.get("scores", {}).get(k)
            if pv is not None:
                if pv >= 40 and cur < 40:
                    reasons.append(f"{SOURCES[k]['label']} a trecut sub 40 ({pv}→{cur})")
                if cur - pv <= -5:
                    reasons.append(f"{SOURCES[k]['label']} scadere brusca ({pv}→{cur})")
        elif cur < 40:
            # doar la PRIMA observatie (fara istoric) semnalam nivelul absolut
            reasons.append(f"{SOURCES[k]['label']} sub 40 ({cur}) [prima observatie]")

    # verdict schimbat
    if prev and prev.get("verdict") and prev.get("verdict") != analysis["verdict"]:
        reasons.append(f"Verdict schimbat: {prev['verdict']} → {analysis['verdict']}")
    # divergenta noua periculoasa
    cur_flags = {f[0] for f in analysis["flags"]}
    prev_flags = set(prev.get("flags", [])) if prev else set()
    for danger in ("narrow_market", "smallcap_lag"):
        if danger in cur_flags and danger not in prev_flags:
            reasons.append(f"Divergenta noua: {danger}")

    level = "ALERT" if reasons else "INFO"
    return level, reasons


def build_history(data, analysis, level, path, mv=None, ideas=None):
    today = observation_day(data)
    hist = []
    if os.path.exists(path):
        try:
            hist = json.load(open(path, encoding="utf-8"))
        except Exception:
            hist = []
    idea_tickers, rising = [], []
    if ideas:
        for s in ideas.get("sectors", []):
            if s.get("rising"):
                rising.append(s["etf"])
                idea_tickers += [it["ticker"] for it in s.get("ideas", [])]
        idea_tickers += [e["ticker"] for e in ideas.get("early_buy", [])]
        idea_tickers += [c["ticker"] for c in ideas.get("contrarian", [])]
    entry = {
        "date": today,
        "recorded_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "scores": {k: data.get(k, {}).get("score") for k in ("sp", "uptrend", "ndx", "r2k")},
        "verdict": analysis["verdict"],
        "regime": analysis["regime"],
        "flags": [f[0] for f in analysis["flags"]],
        "alert": level,
        "master_stance": (mv or {}).get("stance"),
        "master_score": (mv or {}).get("score"),
        "idea_tickers": idea_tickers,
        "rising_sectors": rising,
        # sectoare in rotatie negativa pe 1S (pt chip 'doar la schimbare' a doua zi)
        "rotation_sectors": [r[2] for r in _rotation_list(ideas)] if ideas else [],
        # subsetul sever (<= -3pp) - treapta cu edge in backtest; escaladarea usoara->severa realerteaza
        "rotation_severe": [r[2] for r in _rotation_split(ideas)[1]] if ideas else [],
        # pozitia zilnica (rs_3m, rs_1m) per ETF - alimenteaza coada RRG (ultimele 5 zile)
        "sector_rs": ({s["etf"]: [s.get("rs_3m"), s.get("rs_1m")] for s in ideas.get("sectors", [])}
                      if ideas else {}),
        # lista A+ a zilei - pt masurarea performantei setup-urilor afisate, peste cateva luni
        "aplus_tickers": [it["ticker"] for it in aplus_list(ideas)] if ideas else [],
    }
    hist = [h for h in hist if h.get("date") != today] + [entry]
    hist = hist[-90:]
    return hist


def sparkline_svg(values, w=180, h=34, color="var(--series-1)"):
    vals = [v for v in values if v is not None]
    if len(vals) < 2:
        return f'<svg width="{w}" height="{h}"></svg>'
    lo, hi = min(vals), max(vals)
    rng = (hi - lo) or 1
    pts = []
    n = len(vals)
    for i, v in enumerate(vals):
        x = i / (n - 1) * (w - 6) + 3
        y = h - 3 - (v - lo) / rng * (h - 6)
        pts.append(f"{x:.1f},{y:.1f}")
    last = vals[-1]
    cx, cy = pts[-1].split(",")
    return (f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'<polyline fill="none" stroke="{color}" stroke-width="2" points="{" ".join(pts)}"/>'
            f'<circle cx="{cx}" cy="{cy}" r="2.5" fill="{color}"/></svg>')


def zone_color(score):
    if score is None: return "#888"
    if score >= 60: return "var(--good)"
    if score >= 40: return "var(--warning)"
    return "var(--critical)"


def _vcp(it):
    return (' <span style="color:var(--series-1);font-weight:700" title="VCP-lite: doar contractie de volatilitate '
            'pe 3 ferestre + aproape de pivot 40z. NU e analiza VCP completa Minervini (fara volum, lungime baza, '
            'context) - valideaza cu vcp-screener inainte de intrare.">VCP-lite</span>') if it.get("vcp") else ""


def _earn_cell(it):
    """Celula Earnings: rosie cand raportarea e in <=7 zile (risc de gap)."""
    if it.get("earnings_warn"):
        return f"<td style='color:var(--critical)'>⚠ {it.get('earnings')} ({it.get('days_to_earnings')}z)</td>"
    return f"<td>{it.get('earnings') or '—'}</td>"


def aplus_list(ideas):
    """Setup-uri A+ = filtrul compus al dashboardului: sector in crestere FARA rotatie
    severa + ticker cu VCP-lite + aproape de max (>= -8%). Restul (grafic, earnings,
    poarta) se valideaza manual - lista e candidatura, nu ordin."""
    sev = {r[2] for r in _rotation_split(ideas)[1]}
    out = []
    for s in (ideas or {}).get("sectors", []):
        if not s.get("rising") or s["etf"] in sev:
            continue
        for it in s.get("ideas", []):
            if it.get("vcp") and it.get("pct_from_high", -99) >= -8:
                out.append({**it, "sector": s["sector"], "etf": s["etf"], "rs_1w": s.get("rs_1w")})
    # cele mai "curate" primele: fara earnings iminente, apoi dupa RS
    out.sort(key=lambda x: (bool(x.get("earnings_warn")), -(x.get("rs_score") or 0)))
    return out


def render_aplus_html(ideas, disc):
    if not (ideas or {}).get("sectors"):
        return ""
    ap = aplus_list(ideas)
    allowed = disc.get("new_risk_allowed", False) if disc else False
    gate = ('<span class="tag t-good">poarta disciplina: OK</span>' if allowed
            else f'<span class="tag t-bad">⛔ poarta: risc nou blocat ({disc.get("reason","")})</span>')
    if disc.get("status") == "NEVERIFICAT":
        gate = '<span class="tag t-warn">poarta personala: NEVERIFICATA · verifica Guardrail</span>'
    head = (f'<h2>Setup-uri A+ EOD <span class="sub">(sector in crestere fara rotatie severa + VCP-lite + '
            f'max -8% sub varf · cele fara earnings iminente primele · graficul il validezi TU)</span> {gate}</h2>')
    if not ap:
        return head + ('<p class="muted">Niciun setup nu trece azi filtrul complet — normal in regim '
                       'defensiv/rotatie. Lista goala E informatia corecta: nu forta intrari.</p>')
    rows = ""
    for it in ap:
        rows += (f"<tr><td><b>{it['ticker']}</b>{_vcp(it)}</td><td>{SECTOR_SHORT.get(it['sector'], it['etf'])}</td>"
                 f"<td>{it['last']}</td><td style='color:var(--good)'>+{it['rs_score']}</td>"
                 f"<td>{it['pct_from_high']:.1f}%</td><td>{(it.get('rs_1w') or 0):+.1f}pp</td>{_earn_cell(it)}</tr>")
    return (head + f'<table class="ideas"><tr><th>Ticker</th><th>Sector</th><th>Pret</th><th>RS</th>'
            f'<th>vs max</th><th>sector 1S</th><th>Earnings</th></tr>{rows}</table>'
            '<p class="sub">A+ = filtrul compus al dashboardului, nu garantie. Dimensioneaza dupa plafonul '
            'din verdictul master; stop obligatoriu sub pivot.</p>')


def render_ideas_html(ideas, beb=None):
    if not ideas:
        return ""
    out = ""
    # gate rotatie severa: nu cumpara lideri dintr-un sector care iese dur pe 1S
    # (backtest ≤-3pp: sectorul continua sa subperformeze ~-1.8pp/60z)
    sev_etfs = {r[2] for r in _rotation_split(ideas)[1]}
    # A) Momentum pe sectoare in crestere
    rising = [s for s in ideas.get("sectors", []) if s.get("rising")]
    if rising:
        blocks = ""
        for s in rising:
            rows = ""
            for it in s.get("ideas", []):
                rows += (f"<tr><td><b>{it['ticker']}</b>{_vcp(it)}</td><td>{it['last']}</td>"
                         f"<td style='color:var(--good)'>+{it['rs_score']}</td>"
                         f"<td>{it['ret_3m']:+.1f}%</td><td>{it['ret_6m']:+.1f}%</td>"
                         f"<td>{it['pct_from_high']:.1f}%</td></tr>")
            gate = (f' <span class="tag t-bad" title="Sectorul iese cu {s.get("rs_1w", 0):+.1f}pp/1S sub SPY '
                    f'(≤-3pp = rotatie severa). Backtest: dupa astfel de iesiri sectorul a continuat sa '
                    f'subperformeze (~-1.8pp/60z) — prudenta la intrari noi aici.">⚠ rotatie severa 1S</span>'
                    if s["etf"] in sev_etfs else "")
            blocks += (f'<div class="dcol"><h3>{s["sector"]} <span style="color:var(--good)">'
                       f'({s["etf"]} · RS3m +{s["rs_3m"]})</span>{gate}</h3>'
                       f'<table class="ideas"><tr><th>Ticker</th><th>Pret</th><th>RS</th><th>3L</th><th>6L</th><th>vs max</th></tr>{rows}</table></div>')
        out += (f'<h2>Idei momentum pe sectoare in crestere <span class="sub">'
                f'({ideas["rising_count"]} sectoare, {ideas["ideas_count"]} idei · RS vs SPY + trend · '
                f'<span style="color:var(--series-1)">VCP-lite</span> = contractie vol, NU analiza completa)</span></h2>'
                f'<div class="detail ideasgrid">{blocks}</div>')
    else:
        out += '<h2>Idei momentum</h2><p class="sub">Niciun sector nu trece filtrul de crestere azi.</p>'

    # A2) EARLY BUY - pullback in trend (revenire proaspata peste MM20, nu momentum extins)
    early = ideas.get("early_buy", [])
    if early:
        sev = {r[2] for r in _rotation_split(ideas)[1]}
        rows = ""
        for it in early:
            warn = (' <span class="tag t-bad" title="sector in rotatie severa pe 1S — backtest: si liderii cad">⚠ sector</span>'
                    if it.get("etf") in sev else "")
            rows += (f"<tr><td><b>{it['ticker']}</b>{_vcp(it)}{warn}</td>"
                     f"<td>{SECTOR_SHORT.get(it.get('sector'), it.get('etf') or '—')}</td><td>{it['last']}</td>"
                     f"<td style='color:var(--good)'>+{it['rs_6m']}</td>"
                     f"<td>{it['pct_from_high']:.1f}%</td><td>{it['ret_1m']:+.1f}%</td>{_earn_cell(it)}</tr>")
        bt = ""
        if beb and beb.get("edge_pp") is not None:
            bt = f' · backtest: edge {beb["edge_pp"]:+.2f}pp/60z rel SPY (tab Validare)'
        out += (f'<h2>Early buy — pullback in trend <span class="sub">({len(early)} nume · lider RS 6L peste MM200 · '
                f'corectie 6-20% de la max · a recuperat MM20 in ultimele 10 sesiuni = revenire timpurie, anti-chase{bt})</span></h2>'
                f'<table class="ideas"><tr><th>Ticker</th><th>Sector</th><th>Pret</th><th>RS 6L</th>'
                f'<th>vs max</th><th>1 luna</th><th>Earnings</th></tr>{rows}</table>'
                f'<p class="sub">Stop natural: sub minimul pullback-ului. Verifica volumul pe revenire inainte de intrare.</p>')

    # B) Contrarian (distrus + stabilizare)
    contra = ideas.get("contrarian", [])
    if contra:
        rows = ""
        for it in contra:
            rows += (f"<tr><td><b>{it['ticker']}</b>{_vcp(it)}</td><td>{it['last']}</td>"
                     f"<td style='color:var(--critical)'>{it['pct_from_high']:.1f}%</td>"
                     f"<td style='color:var(--good)'>+{it['off_low']:.1f}%</td>"
                     f"<td>{it['ret_1m']:+.1f}%</td></tr>")
        out += (f'<h2>Oportunitati CONTRARIAN <span class="sub">({ideas.get("contrarian_count",0)} nume · '
                f'distrus (&lt;-25% sub max) DAR se stabilizeaza · sortate pe stabilizari PROASPETE (bounce 8-35%), '
                f'anti-chase · FARA filtru fundamental — pot fi value traps)</span></h2>'
                f'<table class="ideas"><tr><th>Ticker</th><th>Pret</th><th>vs max 52s</th><th>revenit de la min</th><th>1 luna</th></tr>{rows}</table>'
                f'<p class="sub" style="margin-top:4px">⚠️ RISC MARE / contra-trend. Backtest: breadth slab a fost istoric bullish, dar numele individuale pot continua sa cada. Stop obligatoriu sub minim.</p>')

    # C) New highs - new lows
    n = ideas.get("nh_nl")
    if n:
        col = "var(--good)" if n["net"] > 0 else "var(--critical)"
        out += (f'<h2>New Highs − New Lows (52s)</h2>'
                f'<p><span style="color:var(--good)">▲ {n["new_highs"]} maxime noi ({n["pct_high"]}%)</span> &nbsp;·&nbsp; '
                f'<span style="color:var(--critical)">▼ {n["new_lows"]} minime noi ({n["pct_low"]}%)</span> &nbsp;·&nbsp; '
                f'<b style="color:{col}">net {n["net"]:+d}</b> &nbsp;→&nbsp; {n["read"]} '
                f'<span class="sub">(din {n["total"]} S&P500)</span></p>')

    out += f'<p class="sub" style="margin-top:4px">⚠️ {ideas.get("disclaimer","")}</p>'
    return out


def render_actionable_html(act):
    if not act or not act.get("rows"):
        return ""
    rows = ""
    for r in act["rows"]:
        if r.get("error"):
            rows += f"<tr><td><b>{r['ticker']}</b></td><td colspan='7'>{r['error']}</td></tr>"
            continue
        ew = (f"<span style='color:var(--critical)'>⚠️ {r['earnings']} ({r['days_to_earnings']}z)</span>"
              if r.get("earnings_warn") else (r.get("earnings") or "—"))
        rows += (f"<tr><td><b>{r['ticker']}</b></td><td>{r['entry']}</td>"
                 f"<td style='color:var(--critical)'>{r['stop']} ({r['stop_pct']}%)</td>"
                 f"<td>{r['shares']}</td><td>{r['position_value']:,.0f}</td>"
                 f"<td>{r['pos_pct']}%</td><td>${r['risk_dollar']:,.0f}</td><td>{ew}</td></tr>")
    over = act.get("over_ceiling")
    tot_col = "var(--critical)" if over else "var(--good)"
    warn = (f' <span style="color:var(--critical)">⚠️ PESTE plafon {act["exposure_ceiling_pct"]}% '
            f'(${act["exposure_ceiling_val"]:,.0f}) — redu riscul sau alege mai putine</span>' if over else " ✓ in plafon")
    return (f'<h2>Pachet actionabil <span class="tag t-warn">IPOTETIC</span> <span class="sub">(stop {act.get("atr_mult")}×ATR14 · risc {act.get("risk_pct")}%/tranzactie · '
            f'cont ${act.get("account_size"):,.0f} · earnings &lt;{act.get("earnings_days")}z)</span></h2>'
            f'<p class="muted">⚠ Dimensioneaza TOATE tezele ca si cum le-ai deschide azi — NU reflecta pozitiile tale reale. '
            f'Alarma de plafon e pe portofoliul ipotetic complet.</p>'
            f'<table class="ideas"><tr><th>Ticker</th><th>Entry</th><th>Stop (ATR)</th><th>Actiuni</th>'
            f'<th>Valoare</th><th>%cont</th><th>Risc $</th><th>Earnings</th></tr>{rows}</table>'
            f'<p><b style="color:{tot_col}">Total expunere: ${act.get("total_position_value"):,.0f} '
            f'({act.get("total_pos_pct")}% cont)</b>{warn}</p>'
            f'<p class="sub">⚠️ {act.get("disclaimer","")}</p>')


def render_timing_html(mt):
    if not mt or not mt.get("indices"):
        return ""
    worst = mt.get("max_dist_count", 0)
    col = "var(--critical)" if worst >= 6 else "var(--warning)" if worst >= 4 else "var(--good)"
    rows = ""
    for sym, a in mt["indices"].items():
        if a.get("error"):
            rows += f"<tr><td><b>{sym}</b></td><td colspan='4'>{a['error']}</td></tr>"; continue
        dc = a["dist_count"]
        dcol = "var(--critical)" if dc >= 6 else "var(--warning)" if dc >= 4 else "var(--good)"
        ftd = f"acum {a['ftd_days_ago']}z" if a.get("ftd_days_ago") is not None else "—"
        rows += (f"<tr><td><b>{sym}</b> {a.get('name','')}</td>"
                 f"<td style='color:{dcol}'>{dc}</td>"
                 f"<td>{'da' if a['above_ma50'] else 'NU'}</td>"
                 f"<td>{'da' if a['above_ma200'] else 'NU'}</td>"
                 f"<td>{ftd}</td><td>{a['status']}</td></tr>")
    return (f'<h2>Market timing O\'Neil <span class="sub">(distribution days = vanzare institutionala · volum)</span></h2>'
            f'<div class="verdict" style="border-left-color:{col}"><b>{mt.get("signal","")}</b></div>'
            f'<table class="ideas"><tr><th>Indice</th><th>Dist.days (25z)</th><th>&gt;MM50</th><th>&gt;MM200</th>'
            f'<th>Follow-through</th><th>Status</th></tr>{rows}</table>'
            f'<p class="sub">{mt.get("note","")}</p>')


def render_confirmation_html(conf):
    if not conf or not conf.get("signals"):
        return ""
    col = "var(--good)" if conf.get("score", 0) >= 2 else "var(--critical)" if conf.get("score", 0) <= -2 else "var(--warning)"
    items = "".join(f"<li>{s}</li>" for s in conf["signals"])
    return (f'<h2>Confirmare risc (independent de breadth) <span class="sub">'
            f'— cross-check VIX + credit + equal-weight</span></h2>'
            f'<div class="verdict" style="border-left-color:{col}"><b>{conf["verdict"]}</b> '
            f'(scor {conf.get("score",0):+d})<ul>{items}</ul></div>')


SIGNAL_RO = {
    "low_breadth_05": "8MA < 0.50 (selectiv)",
    "low_breadth_04": "8MA < 0.40 (washout)",
    "narrow_diverg": "Divergenta 'ingust'",
    "ma8_below_200": "8MA sub 200MA",
    "bearish_flag": "Semnal bearish",
}


def render_backtest_html(bt):
    if not bt or not bt.get("signals"):
        return ""
    b = bt.get("baseline", {})
    rows = ""
    for k, s in bt["signals"].items():
        edge = s.get("edge60_pp", 0)
        col = "var(--good)" if edge > 0.5 else "var(--critical)" if edge < -0.5 else "#9aa0ad"
        verdict = "putere (contrarian)" if edge > 0.5 else "slabiciune" if edge < -0.5 else "fara edge"
        rows += (f"<tr><td>{SIGNAL_RO.get(k,k)}</td><td>{s.get('n')}</td>"
                 f"<td>{s.get('med60'):+.1f}%</td><td>{s.get('pos60')}%</td>"
                 f"<td style='color:{col}'>{edge:+.1f}pp</td>"
                 f"<td>{s.get('dd60'):+.1f}%</td><td style='color:{col}'>{verdict}</td></tr>")
    return (f'<h2>Track-record semnale <span class="sub">(backtest {bt.get("period","")}, '
            f'{bt.get("days","")} zile · randament forward 60z)</span></h2>'
            f'<table><tr><th>Semnal</th><th>N</th><th>fwd60 med</th><th>%+</th>'
            f'<th>edge vs baseline</th><th>drawdown60</th><th>verdict</th></tr>'
            f'<tr style="opacity:.7"><td>baseline (toate zilele)</td><td>{bt.get("days","")}</td>'
            f'<td>{b.get("med60"):+.1f}%</td><td>{b.get("pos60")}%</td><td>—</td>'
            f'<td>{b.get("dd60"):+.1f}%</td><td>referinta</td></tr>{rows}</table>'
            f'<p class="sub" style="margin-top:4px">Lectie cheie: breadth slab a fost istoric CONTRARIAN BULLISH (nu vinde in panica). '
            f'Semnalele indica mai degraba VOLATILITATE/drawdown decat randament slab. Esantion 2016-2026 (piata bull seculara).</p>')


def render_validate_html(val):
    if not val or not val.get("proxy"):
        return ""
    rows = ""
    for o in val["proxy"]:
        rows += (f"<tr><td>{o['stance']}</td><td>{o['n']}</td>"
                 f"<td>{o.get('med20')}%</td><td>{o['med60']}%</td><td>{o['pos60']}%</td>"
                 f"<td>{o.get('dd60')}%</td></tr>")
    mono = val.get("proxy_monotonic")
    col = "var(--good)" if mono else "var(--warning)"
    live = val.get("live", {})
    live_txt = f"Tracking live: {live.get('observations',0)} obs. mature / {live.get('tracked_days',0)} zile — {live.get('note','')}"
    return (f'<h2>Auto-validare verdict <span class="sub">(se noteaza singur · {val.get("period","")})</span></h2>'
            f'<div class="verdict" style="border-left-color:{col}"><b>{val.get("verdict","")}</b>'
            f'<div class="act">{live_txt}</div></div>'
            f'<table class="ideas"><tr><th>Stance (proxy)</th><th>N</th><th>fwd20</th><th>fwd60 med</th><th>%+</th><th>DD60</th></tr>{rows}</table>'
            f'<p class="sub">{val.get("note","")}</p>')


def render_master_html(mv):
    if not mv:
        return ""
    scol = "var(--good)" if mv["score"] >= 2 else "var(--warning)" if mv["score"] >= -1 else "var(--critical)"
    rows = ""
    for dim, vote, txt in mv["scorecard"]:
        vcol = "var(--good)" if vote > 0 else "var(--critical)" if vote < 0 else "#9aa0ad"
        badge = ("▲ +" + str(vote)) if vote > 0 else ("▼ " + str(vote)) if vote < 0 else "● 0"
        rows += (f"<tr><td>{dim}</td><td style='color:{vcol};font-weight:700;white-space:nowrap'>{badge}</td>"
                 f"<td>{txt}</td></tr>")
    recon = "".join(f"<li>{r}</li>" for r in mv.get("reconciliation", []))
    return (f'<div class="master" style="border-color:{scol}">'
            f'<div class="mhead"><span class="mstance" style="color:{scol}">{mv["stance"]}</span>'
            f'<span class="mscore">scor net {mv["score"]:+d}</span></div>'
            f'<div class="maction">→ {mv["action"]}</div>'
            f'<div class="mmeta"><b>Plafon expunere: {mv.get("net_ceiling")}%</b> &nbsp;·&nbsp; Incredere: {mv["confidence"]}</div>'
            f'<div class="mmeta" style="color:var(--serious)">⚠ Gauge de RISC/volatilitate, NU predictor de randament — '
            f'backtestul propriu arata ca stance-urile defensive NU au precedat randamente slabe (tab Validare).</div>'
            f'<table class="scorecard"><tr><th>Semnal</th><th>Vot</th><th>Citire</th></tr>{rows}</table>'
            f'<ul class="mrecon">{recon}</ul></div>')


def render_discipline_html(disc):
    if disc.get("status") == "NEVERIFICAT":
        return '<div class="verdict"><b>Poarta personala: NEVERIFICATA aici</b><p>Valideaza Guardrail, portofoliul si bugetul de risc in Decision Desk.</p></div>'
    if not disc:
        return ('<div class="verdict" style="border-left-color:#9aa0ad"><b>Poarta disciplina: neconfigurata</b>'
                '<div class="act">Creeaza dashboard\\discipline_state.json '
                '(ex. {"new_risk_allowed": false, "reason": "3 pierderi la rand"}) sau alimenteaza-l din '
                'skill-urile drawdown-circuit-breaker / pre-trade-discipline-gate.</div></div>')
    allowed = disc.get("new_risk_allowed", True)
    if allowed:
        return ('<div class="verdict" style="border-left-color:var(--good)"><b>✓ Poarta disciplina: risc nou PERMIS azi</b>'
                + (f'<div class="act">{disc.get("note","")}</div>' if disc.get("note") else "") + "</div>")
    return ('<div class="alert"><b>⛔ POARTA DISCIPLINA: RISC NOU BLOCAT AZI</b>'
            f'<div class="act">Motiv: {disc.get("reason","cooldown")}. '
            'Ideile de mai jos sunt DOAR informative - nu deschide pozitii noi azi.</div></div>')


STANCE_STATUS = {
    "RISK-ON": ("good", "▲"), "CONSTRUCTIV": ("good", "▲"),
    "MIXT / PRUDENTA SELECTIVA": ("warning", "◆"), "MIXT": ("warning", "◆"),
    "PRUDENTA / DEFENSIV": ("serious", "▼"), "RISK-OFF": ("critical", "■"),
}


def _stance_status(stance):
    return STANCE_STATUS.get(stance, ("warning", "◆"))


def _arc_point(cx, cy, r, frac):
    ang = math.pi * (1 - frac)  # 180deg (stanga) -> 0deg (dreapta)
    return cx + r * math.cos(ang), cy - r * math.sin(ang)


def svg_gauge(value, vmax=100, label="expunere", sub=""):
    if value is None:
        value = 0
    frac = max(0.0, min(1.0, value / vmax))
    cx, cy, r = 90, 92, 70
    x0, y0 = _arc_point(cx, cy, r, 0)
    x1, y1 = _arc_point(cx, cy, r, 1)
    vx, vy = _arc_point(cx, cy, r, frac)
    col = "var(--good)" if value >= 75 else "var(--warning)" if value >= 50 else "var(--serious)" if value >= 30 else "var(--critical)"
    large = 1
    return (f'<svg viewBox="0 0 180 116" class="gauge" role="img" aria-label="{label} {value}%">'
            f'<path d="M {x0:.1f} {y0:.1f} A {r} {r} 0 {large} 1 {x1:.1f} {y1:.1f}" fill="none" stroke="var(--border)" stroke-width="12" stroke-linecap="round"/>'
            f'<path d="M {x0:.1f} {y0:.1f} A {r} {r} 0 {1 if frac>0.5 else 0} 1 {vx:.1f} {vy:.1f}" fill="none" stroke="{col}" stroke-width="12" stroke-linecap="round"/>'
            f'<text x="90" y="86" text-anchor="middle" class="gv">{value:.0f}%</text>'
            f'<text x="90" y="104" text-anchor="middle" class="gl">{label}</text></svg>'
            + (f'<div class="gsub">{sub}</div>' if sub else ""))


def _kpi(value, label, status="", tip=""):
    cls = f" k-{status}" if status else ""
    tt = f' title="{tip}"' if tip else ""
    return f'<div class="kpi{cls}"{tt}><div class="kv">{value}</div><div class="kl">{label}</div></div>'


def render_scoreboard(data, hist):
    """Cele 4 scoruri de breadth, mari si colorate pe zona, cu delta fata de ziua precedenta
    + sparkline 30 zile. Sta deasupra tab-urilor ca sa fie vizibile mereu; click = istoricul
    sursei in tab-ul Date (coloana evidentiata)."""
    prev = hist[-2].get("scores", {}) if len(hist) >= 2 else {}
    cards = ""
    for k in ("sp", "uptrend", "ndx", "r2k"):
        s = data.get(k)
        if not s:
            continue
        col = zone_color(s["score"])
        pv = prev.get(k)
        if pv is not None:
            d = round(s["score"] - pv, 1)
            cls, txt = ("sd-up", f"▲ +{d:g}") if d > 0 else ("sd-dn", f"▼ {d:g}") if d < 0 else ("sd-flat", "● 0")
            delta = f'<span class="sdelta {cls}" title="fata de ziua precedenta ({pv})">{txt}</span>'
        else:
            delta = ""
        series = [h.get("scores", {}).get(k) for h in hist[-30:]]
        spark = (f'<div class="sbspark">{sparkline_svg(series, w=150, h=26, color=col)}</div>'
                 if len([v for v in series if v is not None]) >= 2 else "")
        cards += (f'<div class="scard" data-src="{k}" style="border-top-color:{col}" '
                  f'title="{SOURCES[k]["label"]} · scor {s["score"]}/100 · {s["zone"]} · click: istoricul sursei (tab Date)">'
                  f'<div class="sbl">{SOURCES[k]["label"]}</div>'
                  f'<div><span class="sbv" style="color:{col}">{s["score"]:.0f}</span>{delta}</div>'
                  f'<div class="sbz">{s["zone"]} · expunere {s["exposure"]}</div>{spark}</div>')
    return f'<div class="sboard">{cards}</div>' if cards else ""


def render_cockpit(mv, data, ideas, conf, mt, detail):
    st, icon = _stance_status(mv.get("stance", ""))
    nn = (ideas or {}).get("nh_nl", {})
    nhnl = f'{nn.get("net","—"):+d}' if nn.get("net") is not None else "—"
    dist = (mt or {}).get("max_dist_count", "—")
    vix = (conf or {}).get("vix", "—")
    nideas = (ideas or {}).get("ideas_count", 0) + (ideas or {}).get("contrarian_count", 0)
    dist_status = "critical" if isinstance(dist, int) and dist >= 6 else "warning" if isinstance(dist, int) and dist >= 4 else "good"
    nhnl_status = "good" if nn.get("net", 0) and nn["net"] > 0 else "critical" if nn.get("net", 0) and nn["net"] < 0 else ""
    vix_status = "good" if isinstance(vix, (int, float)) and vix < 15 else "warning" if isinstance(vix, (int, float)) and vix < 25 else "critical" if isinstance(vix, (int, float)) else ""
    tiles = "".join([
        _kpi(vix, "VIX", vix_status, "Volatilitate implicita S&P. <15 calm, >25 frica."),
        _kpi(nhnl, "New H−L", nhnl_status, "Maxime noi minus minime noi (52s) din S&P500."),
        _kpi(dist, "Dist. days", dist_status, "Zile de vanzare institutionala (25 sesiuni). 4-5+ = presiune."),
        _kpi(nideas, "Idei", "", "Idei momentum + contrarian in tab-ul Idei."),
    ])
    return (f'<div class="cockpit">'
            f'<div class="semaphore s-{st}">'
            f'<div class="sicon">{icon}</div>'
            f'<div><div class="slabel">VERDICT MASTER</div>'
            f'<div class="sstance">{mv.get("stance","—")}</div>'
            f'<div class="ssub">scor {mv.get("score",0):+d} · incredere {("SCAZUTA" if mv.get("conflict") else "OK")} · {mv.get("action","")}</div></div></div>'
            f'<div class="gaugebox">{svg_gauge(mv.get("net_ceiling"), label="plafon expunere")}</div>'
            f'<div class="kpis">{tiles}</div></div>')


def _rotation_list(ideas):
    """Sectoare 'lider 3L dar iese pe 1S': RS 3 luni pozitiv, sub SPY cu >=1pp pe 5 sesiuni.
    Prinde cazul 'lider pe 3 luni dar banii ies ACUM' (ex. XLK 2026-07-30)."""
    rot = []
    for s in (ideas or {}).get("sectors", []):
        if s.get("rs_3m", 0) > 0 and s.get("rs_1w") is not None and s["rs_1w"] <= -1.0:
            rot.append((s["rs_1w"], SECTOR_SHORT.get(s["sector"], s["etf"]), s["etf"]))
    rot.sort()
    return rot


# pragul de SEVERITATE vine din backtest_rotation (variante): sub -3pp edge-ul devine
# slabiciune reala (~-1.8pp/60z, doar ~36% pozitive); intre -1 si -3pp e doar context.
SEVERE_PP = -3.0


def _rotation_split(ideas):
    """(usoare, severe) - rotatia usoara e context, cea severa are edge in backtest."""
    rot = _rotation_list(ideas)
    return [r for r in rot if r[0] > SEVERE_PP], [r for r in rot if r[0] <= SEVERE_PP]


def _rotation_bt_note(brot):
    """Verdictul backtestului, atasat chip-ului de rotatie - sa nu iei niciodata alerta
    drept trigger daca istoric nu are edge."""
    e = (brot or {}).get("rel_edge60_pp")
    if e is None:
        return ""
    if e <= -0.5:
        return f" · backtest: SLABICIUNE reala (edge {e:+.2f}pp/60z) — ia-o in serios"
    if e >= 0.5:
        return f" · backtest: CONTRARIAN (edge {e:+.2f}pp/60z) — istoric dip recuperat"
    return f" · backtest: CONTEXT, nu semnal (edge {e:+.2f}pp/60z, fara edge)"


def _severe_bt_note(brot):
    for v in (brot or {}).get("variants", []):
        if v.get("key") == "p3" and v.get("rel_edge60_pp") is not None:
            return f" · backtest ≤-3pp: edge {v['rel_edge60_pp']:+.2f}pp/60z, {v.get('rel_pos60')}% pozitive — slabiciune reala"
    return ""


def _rotation_chips(ideas, prev_rot=None, prev_sev=None, brot=None):
    """Chip de rotatie DOAR la schimbare (anti alert-fatigue), pe doua trepte:
    severa (<= -3pp, c-bad - are edge in backtest) si usoara (context, c-warn).
    prev_*=None (istoric vechi, fara cheile respective) = prima observatie."""
    mild, severe = _rotation_split(ideas)
    rot = mild + severe
    labels = {s["etf"]: SECTOR_SHORT.get(s["sector"], s["etf"]) for s in (ideas or {}).get("sectors", [])}
    chips = []
    fresh_sev = severe if prev_sev is None else [r for r in severe if r[2] not in set(prev_sev)]
    if fresh_sev:
        txt = ", ".join(f"{name} {rs:+.1f}pp/1S" for rs, name, _ in sorted(fresh_sev)[:3])
        chips.append(f'<span class="chip c-bad" title="Lider 3L care iese cu ≥3pp sub SPY pe 5 sesiuni'
                     f'{_severe_bt_note(brot)} — prudenta la intrari noi in sector">'
                     f'⛔ rotatie SEVERA iese din: {txt}</span>')
    fresh = mild if prev_rot is None else [r for r in mild if r[2] not in set(prev_rot)]
    if fresh:
        txt = ", ".join(f"{name} {rs:+.1f}pp/1S" for rs, name, _ in fresh[:3])
        chips.append(f'<span class="chip c-warn" title="RS 3 luni pozitiv, dar sub SPY pe ultimele 5 sesiuni — '
                     f'banii ies pe termen scurt{_rotation_bt_note(brot)}">'
                     f'rotatie scurta iese din: {txt}</span>')
    if prev_rot:
        ended = [e for e in prev_rot if e not in {r[2] for r in rot}]
        if ended:
            chips.append(f'<span class="chip c-good" title="sector care ieri era in rotatie negativa pe 1S si azi nu mai e">'
                         f'rotatie incheiata: {", ".join(labels.get(e, e) for e in ended[:3])}</span>')
    return chips


def sector_rotation_lines(ideas, brot=None):
    """Linii pt notificare: top acceleratii/deceleratii (norm 1S vs 3L, acelasi prag 0.25 ca
    Δ din heatmap) + alerta de rotatie scurta — vezi rotatia fara sa deschizi dashboardul."""
    secs = [s for s in (ideas or {}).get("sectors", []) if s.get("rs_1w") is not None and s.get("rs_3m") is not None]
    if not secs:
        return []
    mx1 = max(abs(s["rs_1w"]) for s in secs) or 1
    mx3 = max(abs(s["rs_3m"]) for s in secs) or 1
    def dn(s): return s["rs_1w"] / mx1 - s["rs_3m"] / mx3
    acc = sorted([s for s in secs if dn(s) > 0.25], key=dn, reverse=True)[:2]
    dec = sorted([s for s in secs if dn(s) < -0.25], key=dn)[:2]
    out, parts = [], []
    if dec:
        parts.append("↘ " + ", ".join(SECTOR_SHORT.get(s["sector"], s["etf"]) for s in dec))
    if acc:
        parts.append("↗ " + ", ".join(SECTOR_SHORT.get(s["sector"], s["etf"]) for s in acc))
    if parts:
        out.append("Rotatie sectoriala (1S vs 3L): " + " · ".join(parts))
    mild, severe = _rotation_split(ideas)
    if severe:
        out.append("⛔ Rotatie SEVERA (≤-3pp) iese din: "
                   + ", ".join(f"{name} {rs:+.1f}pp/1S" for rs, name, _ in sorted(severe)[:3])
                   + " [backtest: slabiciune reala — prudenta in sector]")
    if mild:
        e = (brot or {}).get("rel_edge60_pp")
        bt = ""
        if e is not None:
            bt = (" [backtest: ia-o in serios]" if e <= -0.5
                  else " [backtest: dip recuperat istoric]" if e >= 0.5
                  else " [context, nu semnal]")
        out.append("⚠️ Rotatie scurta iese din: "
                   + ", ".join(f"{name} {rs:+.1f}pp/1S" for rs, name, _ in mild[:3]) + bt)
    return out


def render_delta(hist, ideas=None, brot=None):
    if len(hist) < 2:
        return ('<div class="delta"><b>Ce s-a schimbat:</b> prima zi urmarita — fara comparatie inca. '
                + "".join(_rotation_chips(ideas, brot=brot)) + '</div>')
    cur, prev = hist[-1], hist[-2]
    chips = _rotation_chips(ideas, prev.get("rotation_sectors"), prev.get("rotation_severe"), brot)
    if cur.get("master_stance") and cur.get("master_stance") != prev.get("master_stance"):
        chips.append(f'<span class="chip c-warn">stance {prev.get("master_stance")} → {cur.get("master_stance")}</span>')
    if cur.get("master_score") is not None and prev.get("master_score") is not None and cur["master_score"] != prev["master_score"]:
        d = cur["master_score"] - prev["master_score"]
        chips.append(f'<span class="chip">scor {"+" if d>0 else ""}{d}</span>')
    ct, pt = set(cur.get("idea_tickers", [])), set(prev.get("idea_tickers", []))
    new, drop = sorted(ct - pt), sorted(pt - ct)
    if new:
        chips.append(f'<span class="chip c-good">+{len(new)} idei noi: {", ".join(new[:6])}{"…" if len(new)>6 else ""}</span>')
    if drop:
        chips.append(f'<span class="chip c-bad">−{len(drop)} iesite: {", ".join(drop[:6])}{"…" if len(drop)>6 else ""}</span>')
    cs, ps = set(cur.get("rising_sectors", [])), set(prev.get("rising_sectors", []))
    if cs - ps:
        chips.append(f'<span class="chip c-good">sector nou verde: {", ".join(sorted(cs-ps))}</span>')
    if ps - cs:
        chips.append(f'<span class="chip c-bad">sector iesit: {", ".join(sorted(ps-cs))}</span>')
    # setup-urile A+ - cele mai actionabile, deci schimbarile lor merita chip propriu
    ca, pa = set(cur.get("aplus_tickers", [])), prev.get("aplus_tickers")
    if pa is None:
        if ca:
            chips.append(f'<span class="chip c-good">urmarim {len(ca)} setup-uri A+ (tracking nou)</span>')
    else:
        pa = set(pa)
        if ca - pa:
            chips.append(f'<span class="chip c-good">A+ nou: {", ".join(sorted(ca - pa)[:6])}</span>')
        if pa - ca:
            chips.append(f'<span class="chip c-bad">A+ iesit: {", ".join(sorted(pa - ca)[:6])}</span>')
    nf = set(cur.get("flags", [])) - set(prev.get("flags", []))
    if nf:
        chips.append(f'<span class="chip c-warn">flag nou: {", ".join(nf)}</span>')
    if not chips:
        chips.append('<span class="chip">fara schimbari notabile fata de ultima rulare</span>')
    return f'<div class="delta"><b>Ce s-a schimbat de ieri:</b> {"".join(chips)}</div>'


def svg_line_chart(hist):
    pts = [h for h in hist if h.get("scores")]
    if len(pts) < 2:
        return '<p class="muted">Istoric insuficient pentru grafic (creste cu fiecare zi).</p>'
    W, H, PL, PR, PT, PB = 720, 240, 34, 12, 14, 26
    n = len(pts)
    keys = [("sp", "S&P", "var(--series-1)"), ("uptrend", "Broad", "var(--series-7)"),
            ("ndx", "NDX", "var(--good)"), ("r2k", "R2K", "var(--warning)")]

    def X(i): return PL + i / (n - 1) * (W - PL - PR)
    def Y(v): return PT + (100 - v) / 100 * (H - PT - PB)
    grid = "".join(f'<line x1="{PL}" y1="{Y(v):.0f}" x2="{W-PR}" y2="{Y(v):.0f}" class="grid"/>'
                   f'<text x="{PL-6}" y="{Y(v)+3:.0f}" text-anchor="end" class="axt">{v}</text>' for v in (0, 25, 50, 75, 100))
    lines = ""
    for k, lab, col in keys:
        seq = [(i, h["scores"].get(k)) for i, h in enumerate(pts) if h["scores"].get(k) is not None]
        if len(seq) < 2:
            continue
        pth = " ".join(f"{X(i):.1f},{Y(v):.1f}" for i, v in seq)
        dots = "".join(f'<circle cx="{X(i):.1f}" cy="{Y(v):.1f}" r="2.6" fill="{col}"><title>{pts[i]["date"]} · {lab} {v}</title></circle>' for i, v in seq)
        lx, lv = seq[-1]
        lines += (f'<polyline points="{pth}" fill="none" stroke="{col}" stroke-width="2"/>{dots}'
                  f'<text x="{X(lx)+5:.1f}" y="{Y(lv)+3:.1f}" class="endlab" fill="{col}">{lab}</text>')
    xl = "".join(f'<text x="{X(i):.0f}" y="{H-6}" text-anchor="middle" class="axt">{pts[i]["date"][5:]}</text>'
                 for i in range(0, n, max(1, n // 6)))
    return f'<svg viewBox="0 0 {W} {H}" class="linechart" role="img" aria-label="Istoric scoruri breadth">{grid}{lines}{xl}</svg>'


SECTOR_SHORT = {"Information Technology": "Tech", "Financials": "Financiar", "Health Care": "Sanatate",
                "Consumer Discretionary": "Consum disc.", "Consumer Staples": "Consum baza", "Energy": "Energie",
                "Industrials": "Industrial", "Materials": "Materiale", "Real Estate": "Imobiliare",
                "Utilities": "Utilitati", "Communication Services": "Comunicatii"}


# ferestrele heatmapului: (cheie in sector_ideas.json, eticheta, nr. sesiuni)
HEAT_WINDOWS = [("rs_1w", "1S", 5), ("rs_15d", "15Z", 11), ("rs_1m", "1L", 21), ("rs_3m", "3L", 63)]


def _heat_bg(val, mx):
    if val is None:
        return "transparent"
    inten = min(1, abs(val) / mx) if mx else 0
    base = "12,163,12" if val >= 0 else "208,59,59"  # good / critical rgb
    return f"rgba({base},{0.10 + 0.55*inten:.2f})"


def heatmap_snapshot(ideas, out_dir):
    """Arhiva saptamanala a heatmapului (heatmap_YYYY-WNN.json, saptamana ISO): scrie/
    actualizeaza snapshotul saptamanii curente (ultima rulare din saptamana ramane) si
    intoarce snapshotul saptamanii PRECEDENTE pentru comparatie. Retentie 26 saptamani."""
    secs = (ideas or {}).get("sectors", [])
    if not secs:
        return {}
    arch = os.path.join(out_dir, "heatmap_archive")
    os.makedirs(arch, exist_ok=True)
    observation = datetime.strptime(ideas.get("asOf") or datetime.now().strftime("%Y-%m-%d"), "%Y-%m-%d")
    yw = observation.strftime("%G-W%V")
    keep = ("sector", "etf", "rs_1w", "rs_15d", "rs_1m", "rs_3m", "rising")
    snap = {"week": yw, "date": observation.strftime("%Y-%m-%d"),
            "sectors": [{k: s.get(k) for k in keep} for s in secs]}
    atomic_json_dump(snap, os.path.join(arch, f"heatmap_{yw}.json"))
    files = sorted(glob.glob(os.path.join(arch, "heatmap_*.json")))  # lexicografic = cronologic
    for f in files[:-26]:
        try: os.remove(f)
        except Exception: pass
    prev = [f for f in files if not f.endswith(f"heatmap_{yw}.json")]
    if not prev:
        return {}
    try:
        return json.load(open(prev[-1], encoding="utf-8"))
    except Exception:
        return {}


def render_heatmap(ideas, prev_snap=None):
    secs = (ideas or {}).get("sectors", [])
    if not secs:
        return ""
    prevw = (prev_snap or {}).get("week", "")
    prev_map = {s["etf"]: s.get("rs_3m") for s in (prev_snap or {}).get("sectors", [])
                if s.get("rs_3m") is not None}
    srt = sorted(secs, key=lambda s: s.get("rs_3m", 0), reverse=True)
    # doar ferestrele prezente in JSON (compatibil cu sector_ideas.json vechi, fara 1S/15Z)
    wins = [(k, lab, n) for k, lab, n in HEAT_WINDOWS if any(k in s for s in srt)]
    # intensitate normalizata PER fereastra - orizonturile scurte au amplitudini mult mai mici
    mx = {k: (max((abs(s[k]) for s in srt if s.get(k) is not None), default=1) or 1) for k, _, _ in wins}
    has_trend = "rs_1w" in mx and "rs_3m" in mx
    head = ("".join(f"<th>{lab}</th>" for _, lab, _ in wins)
            + ('<th class="ht" title="tendinta: RS 1S vs RS 3L, normalizate pe coloana">Δ</th>' if has_trend else "")
            + (f'<th class="ht" title="schimbarea RS 3L fata de snapshotul saptamanii precedente ({prevw})">S-1</th>' if prev_map else ""))
    rows = ""
    for s in srt:
        mark = (' <span class="tag t-good" title="trece filtrul de crestere (>MM200 + MM50 in urcare + RS3m>0)">▲</span>'
                if s.get("rising") else "")
        cells = ""
        for k, lab, _ in wins:
            v = s.get(k)
            # pe coloana 3L, tooltip-ul compara cu snapshotul saptamanii precedente
            wk = (f" · {prevw}: {prev_map[s['etf']]:+.1f}" if k == "rs_3m" and s["etf"] in prev_map else "")
            cells += (f'<td class="hv" style="background:{_heat_bg(v, mx[k])}" '
                      f'title="{s["sector"]} · RS {lab} vs SPY{wk}">' + (f"{v:+.1f}" if v is not None else "—") + "</td>")
        if has_trend:
            # accelerare/decelerare: pozitia relativa pe termen scurt vs lung (fiecare in scara coloanei ei)
            dn = (s.get("rs_1w", 0) / mx["rs_1w"]) - (s.get("rs_3m", 0) / mx["rs_3m"])
            sym, col, tip = (("↗", "var(--good)", "accelereaza: mai puternic pe 1S decat pe 3L") if dn > 0.25
                             else ("↘", "var(--critical)", "decelereaza: mai slab pe 1S decat pe 3L") if dn < -0.25
                             else ("→", "var(--muted)", "stabil: 1S in linie cu 3L"))
            cells += f'<td class="ht" style="color:{col};font-weight:800" title="{s["sector"]} · {tip}">{sym}</td>'
        if prev_map:
            pv = prev_map.get(s["etf"])
            if pv is None:
                cells += '<td class="ht">—</td>'
            else:
                dw = round(s.get("rs_3m", 0) - pv, 1)
                sym2, col2 = (("↑", "var(--good)") if dw >= 0.3
                              else ("↓", "var(--critical)") if dw <= -0.3 else ("=", "var(--muted)"))
                cells += (f'<td class="ht" style="color:{col2};font-weight:700;white-space:nowrap" '
                          f'title="{s["sector"]} · RS 3L acum {s.get("rs_3m", 0):+.1f} vs {prevw}: {pv:+.1f}">{sym2} {dw:+.1f}</td>')
        rows += (f'<tr><td class="hn"><b>{SECTOR_SHORT.get(s["sector"], s["sector"])}</b> '
                 f'<span class="muted">{s["etf"]}</span>{mark}</td>{cells}</tr>')
    ses = ", ".join(f"{lab}={n}" for _, lab, n in wins)
    return (f'<h3>Heatmap sectorial multi-orizont <span class="muted">(RS vs SPY, pp · sortat pe 3L)</span></h3>'
            f'<table class="hmtx"><tr><th>Sector</th>{head}</tr>{rows}</table>'
            f'<p class="muted" style="margin-top:6px">Sesiuni de bursa: {ses} · verde = peste SPY, rosu = sub SPY '
            f'(intensitate normalizata pe coloana) · ▲ = trece filtrul de crestere · Δ = 1S vs 3L (↗ accelereaza, ↘ decelereaza)'
            + (f' · S-1 = schimbarea 3L fata de sapt. {prevw}.' if prev_map else '.') + '</p>')


def svg_rrg(ideas, hist=None):
    secs = [s for s in (ideas or {}).get("sectors", []) if "rs_1m" in s]
    if not secs:
        return ""
    # coada = pozitiile din ultimele 5 zile de istoric (cheia sector_rs; include ziua curenta)
    trails = {}
    for h in (hist or [])[-5:]:
        for etf, xy in (h.get("sector_rs") or {}).items():
            if xy and xy[0] is not None and xy[1] is not None:
                trails.setdefault(etf, []).append((xy[0], xy[1]))
    W = H = 340
    cx, cy = W / 2, H / 2
    xs = [s["rs_3m"] for s in secs] + [p[0] for t in trails.values() for p in t]
    ys = [s.get("rs_1m", 0) for s in secs] + [p[1] for t in trails.values() for p in t]
    mx = max(max(abs(v) for v in xs), 1); my = max(max(abs(v) for v in ys), 1)

    def PX(v): return cx + (v / mx) * (W / 2 - 34)
    def PY(v): return cy - (v / my) * (H / 2 - 30)
    quad = (f'<rect x="{cx:.0f}" y="14" width="{W/2-14:.0f}" height="{H/2-14:.0f}" fill="rgba(12,163,12,0.07)"/>'
            f'<rect x="14" y="14" width="{W/2-14:.0f}" height="{H/2-14:.0f}" fill="rgba(250,178,25,0.07)"/>'
            f'<rect x="14" y="{cy:.0f}" width="{W/2-14:.0f}" height="{H/2-14:.0f}" fill="rgba(208,59,59,0.07)"/>'
            f'<rect x="{cx:.0f}" y="{cy:.0f}" width="{W/2-14:.0f}" height="{H/2-14:.0f}" fill="rgba(236,131,90,0.07)"/>')
    labs = (f'<text x="{W-18}" y="26" text-anchor="end" class="qlab">Leading</text>'
            f'<text x="18" y="26" class="qlab">Improving</text>'
            f'<text x="18" y="{H-16}" class="qlab">Lagging</text>'
            f'<text x="{W-18}" y="{H-16}" text-anchor="end" class="qlab">Weakening</text>')
    axes = (f'<line x1="{cx}" y1="14" x2="{cx}" y2="{H-14}" class="grid"/>'
            f'<line x1="14" y1="{cy}" x2="{W-14}" y2="{cy}" class="grid"/>')
    trail_svg = ""
    for s in secs:
        t = trails.get(s["etf"], [])
        if len(t) < 2:
            continue
        col = "var(--good)" if s.get("rising") else "var(--muted)"
        pts = " ".join(f"{PX(a):.1f},{PY(b):.1f}" for a, b in t)
        trail_svg += (f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="1.2" opacity="0.4"/>'
                      + "".join(f'<circle cx="{PX(a):.1f}" cy="{PY(b):.1f}" r="1.8" fill="{col}" opacity="0.4"/>'
                                for a, b in t[:-1]))
    dots = ""
    for s in secs:
        x, y = PX(s["rs_3m"]), PY(s.get("rs_1m", 0))
        col = "var(--good)" if s.get("rising") else "var(--muted)"  # fix: --text-secondary nu exista in CSS
        dots += (f'<circle cx="{x:.1f}" cy="{y:.1f}" r="5" fill="{col}"><title>{s["sector"]} · RS3m {s["rs_3m"]:+.1f} · mom1m {s.get("rs_1m",0):+.1f}</title></circle>'
                 f'<text x="{x+7:.1f}" y="{y+3:.1f}" class="rlab">{s["etf"]}</text>')
    tail_note = " · coada = ultimele 5 zile" if trail_svg else ""
    return (f'<h3>RRG sectorial <span class="muted">(X=forta relativa 3L, Y=momentum 1L · vs SPY{tail_note})</span></h3>'
            f'<svg viewBox="0 0 {W} {H}" class="rrg" role="img" aria-label="Relative Rotation Graph sectorial">{quad}{axes}{labs}{trail_svg}{dots}</svg>')


def render_risk_panel(act, disc, mv):
    if not act or not act.get("rows"):
        return '<p class="muted">Fara teze de dimensionat (inregistreaza idei cu register_theses.py).</p>'
    valid = [r for r in act["rows"] if not r.get("error")]
    over = act.get("over_ceiling")
    gauge = svg_gauge(act.get("total_pos_pct", 0), vmax=100, label="expunere / cont")
    ceil = act.get("exposure_ceiling_pct", 60)
    total_risk = sum(r.get("risk_dollar", 0) for r in valid)
    maxrisk = max((r.get("risk_dollar", 0) for r in valid), default=1) or 1
    bars = ""
    for r in sorted(valid, key=lambda x: x.get("risk_dollar", 0), reverse=True):
        w = 100 * r.get("risk_dollar", 0) / maxrisk
        ew = ' <span class="tag t-warn">earnings</span>' if r.get("earnings_warn") else ""
        bars += (f'<div class="rbar"><div class="rbl">{r["ticker"]}{ew}</div>'
                 f'<div class="rbt"><div class="rbf" style="width:{w:.0f}%"></div></div>'
                 f'<div class="rbv">${r.get("risk_dollar",0):,.0f} · {r.get("pos_pct",0)}%</div></div>')
    allowed = disc.get("new_risk_allowed", False) if disc else False
    cb = (f'<span class="tag t-good">✓ risc nou permis</span>' if allowed
          else f'<span class="tag t-bad">⛔ blocat: {disc.get("reason","")}</span>')
    warn = (f'<span class="tag t-bad">⚠️ {act.get("total_pos_pct")}% &gt; plafon {ceil}%</span>' if over
            else f'<span class="tag t-good">in plafon {ceil}%</span>')
    return (f'<p class="muted">⚠ Panou IPOTETIC: presupune ca toate tezele ar fi pozitii deschise la sizing-ul sugerat. '
            f'Nu citeste pozitiile reale din broker.</p>'
            f'<div class="riskgrid">'
            f'<div class="rcard"><div class="gaugebox">{gauge}</div>'
            f'<div class="rmeta">Total expunere ${act.get("total_position_value",0):,.0f} · '
            f'risc deschis ${total_risk:,.0f}<br>{warn} {cb}</div></div>'
            f'<div class="rcard"><h3>Risc pe pozitie</h3>{bars}</div></div>'
            f'<p class="muted">Sizing: {act.get("atr_mult")}×ATR14 stop · risc {act.get("risk_pct")}%/tranzactie · cont ${act.get("account_size",0):,.0f}. '
            f'⚠️ {act.get("disclaimer","")}</p>')


def render_freshness(data, ideas, conf, mt, act):
    from yahoo_cache import business_age
    def badge(label, asof):
        days = business_age(asof)
        cls = "fresh" if days <= 2 else "old"
        return f'<span class="fbadge f-{cls}">{label}: {asof or "NEVERIFICAT"} · {"EOD" if days <= 2 else "EXCLUS"}</span>'
    badges = "".join(badge(SOURCES[k]["label"], data.get(k, {}).get("data_date")) for k in SOURCES)
    badges += badge("Idei / sectoare", (ideas or {}).get("asOf"))
    badges += badge("Confirmare", (conf or {}).get("asOf"))
    badges += badge("Market timing", (mt or {}).get("asOf"))
    missing = [SOURCES[k]["label"] for k in SOURCES if k not in data]
    return (f'<h3>Prospetime & integritate date</h3><div class="badges">{badges}</div>'
            f'<p>Acoperire idei S&P: {(ideas or {}).get("coverage", "—")} · surse excluse: {", ".join(missing) or "niciuna"}.</p>'
            '<p>Nasdaq: lista aproximativa originala. Small-cap: proxy pe esantion. '
            'NH/NL: inchideri in 2% de extremele pe 252 sesiuni, nu statistici oficiale ale bursei. '
            'Date de pret: sesiuni EOD incheiate; varsta pe zile luni–vineri.</p>')


def render_intermarket_html(im):
    if not im or not im.get("signals"):
        return ""
    col = "var(--good)" if im.get("score", 0) >= 2 else "var(--critical)" if im.get("score", 0) <= -2 else "var(--warning)"
    if im.get("backwardation"):
        col = "var(--critical)"
    items = "".join(f"<li>{s}</li>" for s in im["signals"])
    return (f'<h3>Intermarket / macro <span class="muted">(VIX term structure + dolar + credit + marfuri)</span></h3>'
            f'<div class="verdict" style="border-left-color:{col}"><b>{im["verdict"]}</b> '
            f'(scor {im.get("score",0):+d})<ul>{items}</ul></div>')


def render_portfolio_html(pr):
    if not pr:
        return ""
    if pr.get("note"):
        return f'<h3>Risc de portofoliu</h3><p class="muted">{pr["note"]} Stance: {pr.get("stance","?")} → risc sugerat {pr.get("regime_risk_pct","?")}%/tranzactie.</p>'
    warn = ('<span class="tag t-bad">⚠️ concentrare mare</span>' if pr.get("concentration_warn")
            else '<span class="tag t-good">diversificat</span>')
    hc = "".join(f'<li>{a}–{b}: <b>{c}</b></li>' for a, b, c in pr.get("high_corr_pairs", [])) or "<li>fara perechi corelate ≥0.7</li>"
    scalar = pr.get("vol_target_scalar")
    scal_txt = (f'Vol portofoliu {pr.get("portfolio_vol_annual")}% vs tinta {pr.get("target_vol")}% → '
                f'scalar expunere <b>{scalar}</b> ({"redu" if scalar and scalar<1 else "poti creste"} expunerea bruta)') if scalar else ""
    return (f'<h3>Risc de portofoliu <span class="muted">(sizing pe regim + corelatie + vol targeting)</span></h3>'
            f'<div class="verdict"><b>Stance {pr.get("stance","?")} → risc {pr.get("regime_risk_pct")}%/tranzactie</b> {warn}'
            f'<div class="act">Corelatie medie: {pr.get("avg_correlation","?")}. {scal_txt}</div>'
            f'<div class="act">Perechi corelate (risc ascuns): <ul>{hc}</ul></div></div>')


def render_backtest_ideas_html(bi):
    if not bi or bi.get("error"):
        return ""
    edge = bi.get("edge_pp", 0)
    col = "var(--good)" if edge > 0.5 else "var(--critical)" if edge < -0.5 else "var(--warning)"
    return (f'<h2>Validare screening idei <span class="muted">(bat liderii RS piata forward?)</span></h2>'
            f'<div class="verdict" style="border-left-color:{col}"><b>{bi.get("verdict","")}</b>'
            f'<div class="act">Top quintila RS: <b>{bi.get("top_quintile_fwd60_med")}%</b> fwd 60z vs univers {bi.get("universe_fwd60_med")}% '
            f'→ edge <b style="color:{col}">{edge:+.2f}pp</b> ({bi.get("top_pos_pct")}% pozitive, {bi.get("n_top")} obs).</div>'
            f'<div class="act muted">{bi.get("note","")}</div></div>')


def render_backtest_rotation_html(brot):
    if not brot or brot.get("error") or not brot.get("n_signals"):
        return ""
    edge = brot.get("rel_edge60_pp", 0) or 0
    col = "var(--critical)" if edge <= -0.5 else "var(--good)" if edge >= 0.5 else "var(--warning)"
    s, b, sp = brot.get("signal", {}), brot.get("baseline", {}), brot.get("spy_after", {})
    return (f'<h2>Validare semnal rotatie sectoriala <span class="sub">(lider 3L iese pe 1S · '
            f'{brot.get("n_signals")} semnale, {brot.get("range")})</span></h2>'
            f'<div class="verdict" style="border-left-color:{col}"><b>{brot.get("verdict","")}</b>'
            f'<div class="act">Edge relativ la SPY, 60z forward: <b style="color:{col}">{edge:+.2f}pp</b> vs baseline.</div></div>'
            f'<table class="ideas"><tr><th></th><th>fwd20 med</th><th>fwd60 med</th><th>%+ (60z)</th>'
            f'<th>vs SPY 20z</th><th>vs SPY 60z</th><th>%+ rel</th></tr>'
            f'<tr><td><b>Sector dupa semnal</b></td><td>{s.get("fwd20_med")}%</td><td>{s.get("fwd60_med")}%</td>'
            f'<td>{s.get("pos60")}%</td><td>{s.get("rel20_med")}%</td><td>{s.get("rel60_med")}%</td><td>{s.get("rel_pos60")}%</td></tr>'
            f'<tr style="opacity:.7"><td>Baseline (toate zilele)</td><td>{b.get("fwd20_med")}%</td><td>{b.get("fwd60_med")}%</td>'
            f'<td>{b.get("pos60")}%</td><td>{b.get("rel20_med")}%</td><td>{b.get("rel60_med")}%</td><td>{b.get("rel_pos60")}%</td></tr>'
            f'<tr style="opacity:.7"><td>SPY dupa semnal</td><td>{sp.get("fwd20_med")}%</td><td>{sp.get("fwd60_med")}%</td>'
            f'<td>{sp.get("pos60")}%</td><td>—</td><td>—</td><td>—</td></tr></table>'
            + _rotation_variants_table(brot)
            + f'<p class="sub" style="margin-top:4px">⚠️ {brot.get("note","")}</p>')


def _rotation_variants_table(brot):
    var = brot.get("variants") or []
    if not var:
        return ""
    rows = ""
    for x in var:
        e = x.get("rel_edge60_pp")
        col = "#9aa0ad" if e is None else "var(--critical)" if e <= -0.5 else "var(--good)" if e >= 0.5 else "#9aa0ad"
        verdict = ("—" if e is None else "slabiciune reala" if e <= -0.5 else "contrarian" if e >= 0.5 else "fara edge")
        etxt = f"{e:+.2f}pp" if e is not None else "—"
        rows += (f'<tr><td>{x["label"]}</td><td>{x["n"]}</td><td>{x.get("rel60_med")}%</td>'
                 f'<td style="color:{col}">{etxt}</td><td>{x.get("rel_pos60")}%</td>'
                 f'<td style="color:{col}">{verdict}</td></tr>')
    return (f'<h3>Variante de prag <span class="muted">(pragul live e prea zgomotos? test la -2pp / -3pp / persistenta 2 zile)</span></h3>'
            f'<table class="ideas"><tr><th>Varianta</th><th>N</th><th>rel60 med</th><th>edge vs baseline</th>'
            f'<th>%+ rel</th><th>verdict</th></tr>{rows}</table>'
            f'<p class="sub">{brot.get("variant_note","")}</p>')


def render_validate_aplus_html(vap):
    if not vap or vap.get("error") or not vap.get("observations"):
        return ""
    n60 = vap.get("mature60", 0)
    m60 = vap.get("rel60_med")
    col = ("var(--warning)" if n60 < 10 or m60 is None
           else "var(--good)" if m60 >= 0.5 else "var(--critical)" if m60 <= -0.5 else "var(--warning)")
    if vap.get("mature20"):
        stats = (f'20z: {vap.get("rel20_med")}% rel SPY ({vap.get("rel20_pos")}%+, {vap.get("mature20")} obs) · '
                 f'60z: {vap.get("rel60_med")}% rel ({vap.get("rel60_pos")}%+, {n60} obs)')
    else:
        stats = (f'{vap.get("observations", 0)} observatii urmarite din {vap.get("days_tracked", 0)} zile — '
                 f'prima maturare la ~20 sesiuni de la afisare')
    return (f'<h3>Auto-validare setup-uri A+ <span class="muted">(randament REALIZAT al listelor afisate, nu backtest)</span></h3>'
            f'<div class="verdict" style="border-left-color:{col}"><b>{vap.get("verdict","")}</b>'
            f'<div class="act">{stats}</div>'
            f'<div class="act muted">{vap.get("note","")}</div></div>')


def render_backtest_earlybuy_html(beb):
    if not beb or beb.get("error") or not beb.get("n_signals"):
        return ""
    e = beb.get("edge_pp", 0) or 0
    col = "var(--good)" if e >= 0.5 else "var(--critical)" if e <= -0.5 else "var(--warning)"
    return (f'<h3>Validare screen Early buy <span class="muted">(pullback in trend · '
            f'{beb.get("n_signals")} semnale, {beb.get("range")})</span></h3>'
            f'<div class="verdict" style="border-left-color:{col}"><b>{beb.get("verdict","")}</b>'
            f'<div class="act">Semnal: <b>{beb.get("signal_rel60_med")}%</b> rel SPY/60z '
            f'({beb.get("signal_pos60")}% pozitive) · baseline in-trend: {beb.get("baseline_rel60_med")}% · '
            f'edge <b style="color:{col}">{e:+.2f}pp</b></div>'
            f'<div class="act muted">⚠️ {beb.get("note","")}</div></div>')


def render_backtest_rotation_stocks_html(brs):
    if not brs or brs.get("error") or not brs.get("n_signals"):
        return ""
    lm = brs.get("leaders_rel60_med", 0) or 0
    col = "var(--critical)" if lm <= -0.5 else "var(--good)" if lm >= 0.5 else "var(--warning)"
    return (f'<h3>Rotatie severa la nivel de actiune <span class="muted">(liderii RS rezista? · '
            f'{brs.get("n_signals")} semnale, {brs.get("range")}, top {brs.get("topn")} RS/sector)</span></h3>'
            f'<div class="verdict" style="border-left-color:{col}"><b>{brs.get("verdict","")}</b>'
            f'<div class="act">Lideri: <b>{brs.get("leaders_rel60_med")}%</b> rel SPY/60z '
            f'({brs.get("leaders_rel_pos60")}% pozitive) · tot sectorul: {brs.get("sector_all_rel60_med")}% · '
            f'ETF sector: {brs.get("etf_rel60_med")}%</div>'
            f'<div class="act muted">⚠️ {brs.get("note","")}</div></div>')


def render_calendar_html(cal, act):
    today = datetime.now().date()
    items = []
    for e in (cal or {}).get("events", []):
        try:
            d = datetime.strptime(e["date"][:10], "%Y-%m-%d").date()
        except Exception:
            continue
        dd = (d - today).days
        if 0 <= dd <= 14:
            imp = "t-bad" if e.get("impact") == "high" else "t-warn"
            items.append((dd, f'<li><b>{e["date"][5:]}</b> ({dd}z) <span class="tag {imp}">macro</span> {e.get("event","")}</li>'))
    for r in (act or {}).get("rows", []):
        if r.get("days_to_earnings") is not None and 0 <= r["days_to_earnings"] <= 14:
            items.append((r["days_to_earnings"], f'<li><b>{r.get("earnings","")[5:]}</b> ({r["days_to_earnings"]}z) <span class="tag t-warn">earnings</span> {r["ticker"]}</li>'))
    if not items:
        return '<h3>Calendar (14 zile)</h3><p class="muted">Fara evenimente in fereastra. Editeaza dashboard\\macro_calendar.json pentru FOMC/CPI.</p>'
    items.sort(key=lambda x: x[0])
    return f'<h3>Calendar evenimente (14 zile) <span class="muted">(nu deschide risc nou inainte de high-impact)</span></h3><ul>{"".join(i[1] for i in items)}</ul>'


def render_reviews_html(reviews):
    if not reviews:
        return ""
    due = [r for r in reviews if r["due"]]
    if not due:
        return f'<p class="muted">Review teze: niciuna scadenta azi ({len(reviews)} active).</p>'
    rows = "".join(f'<li><b>{r["ticker"]}</b> — review {r["date"]} ({r["days"]:+d}z){" ⚠️ intarziat" if r["days"]<0 else ""}</li>' for r in due)
    return f'<h3>⏰ Teze de revizuit <span class="muted">({len(due)} scadente)</span></h3><ul>{rows}</ul>'


def compute_reviews(state_dir):
    idx = os.path.join(state_dir, "_index.json")
    out = []
    today = datetime.now().date()
    try:
        d = json.load(open(idx, encoding="utf-8"))
        for m in d.get("theses", {}).values():
            nd = m.get("next_review_date")
            if not nd or str(m.get("status", "")).upper() in {"CLOSED", "INVALIDATED", "EXPIRED", "ARCHIVED"}:
                continue
            try:
                days = (datetime.strptime(nd[:10], "%Y-%m-%d").date() - today).days
            except Exception:
                continue
            out.append({"ticker": m.get("ticker", "?"), "date": nd[:10], "days": days, "due": days <= 0})
    except Exception:
        pass
    return sorted(out, key=lambda x: x["days"])


def write_html(data, analysis, detail, ideas, backtest, conf, disc, act, mt, mv, val, im, pr, reviews, cal, bi, brot, brs, beb, vap, prev_snap, level, reasons, hist, path):
    hist_rows = ""
    for h in reversed(hist[-30:]):
        sc = h.get("scores", {})
        hist_rows += (f"<tr><td>{h['date']}</td>"
                      + "".join(f'<td class="c-{k}" style="color:{zone_color(sc.get(k))}">{sc.get(k) if sc.get(k) is not None else "-"}</td>' for k in ("sp", "uptrend", "ndx", "r2k"))
                      + f"<td>{h.get('master_stance') or h.get('verdict','')}</td><td>{h.get('alert','')}</td></tr>")
    flags_html = "".join(f'<li>{f[1]}</li>' for f in analysis["flags"]) or "<li>Fara divergente notabile.</li>"
    alert_html = ('<div class="alert"><b>⚠️ ALERTE:</b><ul>' + "".join(f"<li>{r}</li>" for r in reasons) + "</ul></div>") if level == "ALERT" else ""
    detail_cols = (f'<div class="detail">'
                   f'<div class="dcol"><h3>Diagnostic pe segmente</h3><ul>{"".join(f"<li>{d}</li>" for d in detail.get("diagnosis", []))}</ul></div>'
                   f'<div class="dcol"><h3>Plan de actiune</h3><ul>{"".join(f"<li>{p}</li>" for p in detail.get("playbook", []))}</ul></div>'
                   f'<div class="dcol"><h3>Ce urmaresc (praguri)</h3><ul>{"".join(f"<li>{w}</li>" for w in detail.get("watch", []))}</ul></div></div>')

    body = f"""
<header class="topbar">
  <div><h1>Market Breadth Terminal</h1>
  <div class="sub">Generat {datetime.now().strftime('%Y-%m-%d %H:%M')} · sinteza tuturor semnalelor · date end-of-day</div></div>
  <div class="tools"><button onclick="tt()">◐ Tema</button><button onclick="window.print()">⎙ PDF</button></div>
</header>
{render_delta(hist, ideas, brot)}
{render_cockpit(mv, data, ideas, conf, mt, detail)}
{render_scoreboard(data, hist)}
<nav class="tabs">
  <button class="tab active" data-t="overview">Overview</button>
  <button class="tab" data-t="idei">Idei</button>
  <button class="tab" data-t="risc">Risc</button>
  <button class="tab" data-t="validare">Validare</button>
  <button class="tab" data-t="date">Date</button>
</nav>
<main>
  <section class="pane active" id="overview">
    {render_master_html(mv)}
    <h2>Istoric scoruri</h2>{svg_line_chart(hist)}
    {render_timing_html(mt)}
    {render_confirmation_html(conf)}
    {render_intermarket_html(im)}
    {render_calendar_html(cal, act)}
    {detail_cols}
    <h2>Divergente intre piete</h2><ul>{flags_html}</ul>
  </section>
  <section class="pane" id="idei">
    {render_aplus_html(ideas, disc)}
    {f'<div class="duo"><div class="dcol">{render_heatmap(ideas, prev_snap)}</div><div class="dcol">{svg_rrg(ideas, hist)}</div></div>' if (ideas or {}).get("sectors") else ""}
    {render_actionable_html(act)}
    {render_ideas_html(ideas, beb)}
  </section>
  <section class="pane" id="risc">
    {render_discipline_html(disc)}
    {render_reviews_html(reviews)}
    {alert_html}
    <h2>Panou de risc</h2>{render_risk_panel(act, disc, mv)}
    {render_portfolio_html(pr)}
  </section>
  <section class="pane" id="validare">
    {render_validate_html(val)}
    {render_validate_aplus_html(vap)}
    {render_backtest_ideas_html(bi)}
    {render_backtest_rotation_html(brot)}
    {render_backtest_rotation_stocks_html(brs)}
    {render_backtest_earlybuy_html(beb)}
    {render_backtest_html(backtest)}
  </section>
  <section class="pane" id="date">
    {render_freshness(data, ideas, conf, mt, act)}
    <h2>Istoric (30 zile)</h2>
    <table id="histtbl"><tr><th>Data</th><th class="c-sp">S&P</th><th class="c-uptrend">Broad</th><th class="c-ndx">NDX</th><th class="c-r2k">R2K</th><th>Stance</th><th>Alert</th></tr>{hist_rows}</table>
    <p class="muted">* R2K = proxy pe esantion small-cap · Broad = uptrend-analyzer (~2800 actiuni) · Fara API key.</p>
  </section>
</main>"""

    html = ('<!doctype html><html lang="ro"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            f'<title>Market Breadth Terminal {datetime.now().strftime("%Y-%m-%d")}</title>'
            '<style>' + DASH_CSS + '</style></head>'
            '<body data-palette="#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#008300,#4a3aa7,#e34948">'
            + body +
            '<script>'
            'document.querySelectorAll(".tab").forEach(function(b){'
            'b.addEventListener("click",function(){'
            'document.querySelectorAll(".tab").forEach(function(x){x.classList.remove("active");});'
            'document.querySelectorAll(".pane").forEach(function(x){x.classList.remove("active");});'
            'b.classList.add("active");'
            'var p=document.getElementById(b.dataset.t);if(p){p.classList.add("active");}'
            'window.scrollTo(0,0);});});'
            'document.querySelectorAll(".scard[data-src]").forEach(function(c){'
            'c.addEventListener("click",function(){'
            'var t=document.querySelector(".tab[data-t=\'date\']");if(t){t.click();}'
            'var tb=document.getElementById("histtbl");if(tb){tb.className="hl-"+c.dataset.src;'
            'tb.scrollIntoView({behavior:"smooth",block:"start"});}});});'
            'function tt(){var r=document.documentElement;var c=r.getAttribute("data-theme");'
            'r.setAttribute("data-theme",c==="light"?"dark":"light");}'
            '</script></body></html>')
    open(path, "w", encoding="utf-8").write(html)


def cleanup(folder, prefix, keep=30):
    """#7 retentie: pastreaza ultimele `keep` rapoarte .json/.md per sursa."""
    for ext in (".json", ".md"):
        files = [f for f in glob.glob(os.path.join(folder, prefix + "*" + ext))
                 if "history" not in os.path.basename(f)]
        files.sort(key=os.path.getmtime, reverse=True)
        for f in files[keep:]:
            try: os.remove(f)
            except Exception: pass


def main():
    ap = argparse.ArgumentParser(description="Breadth Dashboard aggregator")
    ap.add_argument("--output-dir", default=os.path.join(BASE, "dashboard"))
    args = ap.parse_args()
    os.makedirs(args.output_dir, exist_ok=True)

    data = read_all()
    analysis = analyze(data)
    detail = detailed_verdict(data, analysis)

    # Incarca semnalele auxiliare inainte de master + istoric
    ideas_path = os.path.join(args.output_dir, "sector_ideas.json")
    ideas = json.load(open(ideas_path, encoding="utf-8")) if os.path.exists(ideas_path) else {}
    bt_path = os.path.join(args.output_dir, "backtest.json")
    backtest = json.load(open(bt_path, encoding="utf-8")) if os.path.exists(bt_path) else {}
    conf_path = os.path.join(args.output_dir, "confirmation.json")
    conf = json.load(open(conf_path, encoding="utf-8")) if os.path.exists(conf_path) else {}
    disc_path = os.path.join(args.output_dir, "discipline_state.json")
    disc = json.load(open(disc_path, encoding="utf-8")) if os.path.exists(disc_path) else {}
    act_path = os.path.join(args.output_dir, "actionable.json")
    act = json.load(open(act_path, encoding="utf-8")) if os.path.exists(act_path) else {}
    mt_path = os.path.join(args.output_dir, "market_timing.json")
    mt = json.load(open(mt_path, encoding="utf-8")) if os.path.exists(mt_path) else {}
    validate_path = os.path.join(args.output_dir, "validate.json")
    validate = json.load(open(validate_path, encoding="utf-8")) if os.path.exists(validate_path) else {}
    im_path = os.path.join(args.output_dir, "intermarket.json")
    im = json.load(open(im_path, encoding="utf-8")) if os.path.exists(im_path) else {}
    pr_path = os.path.join(args.output_dir, "portfolio_risk.json")
    pr = json.load(open(pr_path, encoding="utf-8")) if os.path.exists(pr_path) else {}
    # review teze (din trader-memory-core)
    _sd = {}
    try:
        _sd = json.load(open(os.path.join(args.output_dir, "discipline_config.json"), encoding="utf-8-sig"))
    except Exception:
        pass
    reviews = compute_reviews(_sd.get("state_dir") or os.path.join(BASE, "_trader_state", "theses"))
    cal_path = os.path.join(args.output_dir, "macro_calendar.json")
    cal = json.load(open(cal_path, encoding="utf-8-sig")) if os.path.exists(cal_path) else {}
    bi_path = os.path.join(args.output_dir, "backtest_ideas.json")
    bi = json.load(open(bi_path, encoding="utf-8")) if os.path.exists(bi_path) else {}
    brot_path = os.path.join(args.output_dir, "backtest_rotation.json")
    brot = json.load(open(brot_path, encoding="utf-8")) if os.path.exists(brot_path) else {}
    brs_path = os.path.join(args.output_dir, "backtest_rotation_stocks.json")
    brs = json.load(open(brs_path, encoding="utf-8")) if os.path.exists(brs_path) else {}
    beb_path = os.path.join(args.output_dir, "backtest_earlybuy.json")
    beb = json.load(open(beb_path, encoding="utf-8")) if os.path.exists(beb_path) else {}
    vap_path = os.path.join(args.output_dir, "validate_aplus.json")
    vap = json.load(open(vap_path, encoding="utf-8")) if os.path.exists(vap_path) else {}
    # snapshot saptamanal heatmap (scrie saptamana curenta, intoarce saptamana precedenta)
    prev_snap = heatmap_snapshot(ideas, args.output_dir)

    mv = master_verdict(data, analysis, detail, ideas, conf, mt, im)
    atomic_json_dump({"data":data, "master":mv, "analysis":analysis, "detail":detail}, os.path.join(args.output_dir, "engine.json"))

    hist_path = os.path.join(args.output_dir, "dashboard_history.json")
    hist_existing = json.load(open(hist_path, encoding="utf-8")) if os.path.exists(hist_path) else []
    level, reasons = alert_logic(data, analysis, hist_existing)
    hist = build_history(data, analysis, level, hist_path, mv, ideas)
    atomic_json_dump(hist, hist_path)

    html_path = os.path.join(args.output_dir, "breadth_dashboard.html")
    write_html(data, analysis, detail, ideas, backtest, conf, disc, act, mt, mv, validate, im, pr, reviews, cal, bi, brot, brs, beb, vap, prev_snap, level, reasons, hist, html_path)

    # Arhiva snapshot zilnic (deruleaza istoric vizual)
    try:
        arch_dir = os.path.join(args.output_dir, "archive")
        os.makedirs(arch_dir, exist_ok=True)
        import shutil
        shutil.copy(html_path, os.path.join(arch_dir, f"breadth_{datetime.now():%Y-%m-%d}.html"))
        for old in sorted(glob.glob(os.path.join(arch_dir, "breadth_*.html")), key=os.path.getmtime, reverse=True)[60:]:
            os.remove(old)
    except Exception:
        pass

    # Export watchlist CSV (idei momentum + contrarian) pt broker/TradingView
    try:
        import csv as _csv
        with open(os.path.join(args.output_dir, "watchlist.csv"), "w", newline="", encoding="utf-8") as f:
            w = _csv.writer(f); w.writerow(["ticker", "tip", "sector", "rs_or_pctfromhigh", "vcp"])
            for s in ideas.get("sectors", []):
                if s.get("rising"):
                    for it in s.get("ideas", []):
                        w.writerow([it["ticker"], "momentum", s["sector"], it.get("rs_score"), it.get("vcp")])
            for e in ideas.get("early_buy", []):
                w.writerow([e["ticker"], "early_buy", e.get("sector", ""), e.get("rs_6m"), e.get("vcp")])
            for c in ideas.get("contrarian", []):
                w.writerow([c["ticker"], "contrarian", "", c.get("pct_from_high"), c.get("vcp")])
    except Exception:
        pass

    # #7 retentie rapoarte vechi + curatare cache preturi
    for key, s in SOURCES.items():
        cleanup(s["dir"], s["prefix"], keep=30)
    try:
        import yahoo_cache
        yahoo_cache.cleanup_cache(keep_days=2)
    except Exception:
        pass

    # payload pentru notificare (citit de PowerShell)
    def line(k):
        s = data.get(k)
        if not s: return f"{SOURCES[k]['label']}: indisponibil"
        t = f" | trend {s['trend']}" if s.get("trend") else ""
        return f"{SOURCES[k]['label']}: {s['score']}/100 {s['zone']}{t}"
    scores_txt = " ".join(f"{SOURCES[k]['label'][:3]}{data[k]['score']:.0f}" for k in ("sp","uptrend","ndx","r2k") if k in data)
    title = ("⚠️ " if level == "ALERT" else "") + f"Verdict: {mv['stance']}  ({scores_txt})"
    lines = []
    lines.append(f"◆ VERDICT MASTER: {mv['stance']} (scor {mv['score']:+d}) — plafon {mv.get('net_ceiling')}%")
    lines.append(f"→ {mv['action']}")
    lines.append(f"Incredere: {mv['confidence']}")
    lines += [line(k) for k in ("sp","uptrend","ndx","r2k")]
    lines.append(f"Breadth: {analysis['verdict']} (plafon breadth {detail.get('net_ceiling')}%, leaga {detail.get('binder')})")
    lines.append(f"→ {analysis['action']}")
    for f in analysis["flags"]:
        lines.append(f[1])
    if detail.get("playbook"):
        lines.append("Plan: " + detail["playbook"][0])
    if detail.get("watch"):
        lines.append("Urmaresc: " + detail["watch"][0])
    lines.append("Incredere: " + detail.get("confidence", "?"))
    if mt and mt.get("signal"):
        lines.append(f"Market timing: {mt['signal']}")
    if im and im.get("verdict"):
        lines.append(f"Intermarket: {im['verdict']} (VIX term {im.get('vix_term','?')})")
    _due = [r for r in reviews if r["due"]] if reviews else []
    if _due:
        lines.append(f"⏰ {len(_due)} teze de revizuit: {', '.join(r['ticker'] for r in _due[:5])}")
    # garda calitate date: surse lipsa, acoperire slaba SI fisiere-sursa statute
    _missing = [SOURCES[k]["label"] for k in SOURCES if k not in data]
    _stale = [f"{SOURCES[k]['label']}({data[k]['_file_age']}z)" for k in data
              if data[k].get("_file_age") is not None and data[k]["_file_age"] > 1.5]
    _cov = ideas.get("coverage", "")
    _covbad = False
    try:
        a, b = _cov.split("/"); _covbad = int(a) < 0.9 * int(b)
    except Exception:
        pass
    if _missing or _covbad or _stale:
        parts = []
        if _missing: parts.append("surse lipsa: " + ",".join(_missing))
        if _stale: parts.append("output vechi (script esuat azi?): " + ",".join(_stale))
        if _covbad: parts.append("acoperire " + _cov)
        lines.append("⚠️ Calitate date: " + " | ".join(parts))
    if conf and conf.get("verdict"):
        lines.append(f"Confirmare risc: {conf['verdict']} (VIX {conf.get('vix','?')})")
    if ideas and ideas.get("nh_nl"):
        nn = ideas["nh_nl"]
        lines.append(f"New Highs-Lows: {nn['new_highs']}▲ / {nn['new_lows']}▼ (net {nn['net']:+d}) - {nn['read']}")
    if ideas and ideas.get("rising_count"):
        lines.append(f"Sectoare in crestere: {ideas['rising_count']} → {ideas['ideas_count']} idei momentum + {ideas.get('contrarian_count',0)} contrarian (dashboard)")
    lines += sector_rotation_lines(ideas, brot)
    if ideas and ideas.get("sectors"):
        lines.append(f"Setup-uri A+: {len(aplus_list(ideas))} · Early buy (pullback in trend): "
                     f"{ideas.get('early_count', 0)} — tab Idei")
    if disc and not disc.get("new_risk_allowed", True):
        lines.append(f"⛔ DISCIPLINA: risc nou BLOCAT azi ({disc.get('reason','cooldown')})")
    if act and act.get("rows"):
        ew = [r["ticker"] for r in act["rows"] if r.get("earnings_warn")]
        parts = []
        if act.get("over_ceiling"):
            parts.append(f"expunere {act.get('total_pos_pct')}% > plafon {act.get('exposure_ceiling_pct')}%")
        if ew:
            parts.append("earnings curand: " + ", ".join(ew))
        if parts:
            lines.append("Actionabil: " + " | ".join(parts))
    if level == "ALERT":
        lines.append("ALERTE: " + "; ".join(reasons))

    payload = {"title": title, "lines": lines, "alert_level": level,
               "alert_reasons": reasons, "html_path": html_path,
               "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
    atomic_json_dump(payload, os.path.join(args.output_dir, "notification_payload.json"))

    # log
    with open(os.path.join(args.output_dir, "run_log.txt"), "a", encoding="utf-8") as lg:
        missing = [SOURCES[k]["label"] for k in SOURCES if k not in data]
        lg.write(f"{datetime.now():%Y-%m-%d %H:%M:%S} | {level} | {analysis['verdict']} | "
                 f"scores={payload['title']} | missing={missing or 'none'} | reasons={reasons or 'none'}\n")

    print("=" * 70)
    print(f"  {title}")
    for l in lines: print("  " + l)
    print(f"  HTML: {html_path}")
    print("=" * 70)


if __name__ == "__main__":
    main()
