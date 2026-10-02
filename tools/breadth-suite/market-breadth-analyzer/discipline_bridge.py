#!/usr/bin/env python3
"""
Punte disciplina: ruleaza drawdown-circuit-breaker peste jurnalul trader-memory-core
si traduce rezultatul in dashboard\\discipline_state.json (citit de agregator).
  TRADING_ALLOWED -> new_risk_allowed: true
  COOLDOWN/HALTED -> new_risk_allowed: false (+ motiv)
Config: dashboard\\discipline_config.json  {account_size, state_dir}. Fara account_size -> neutru.
"""
import argparse
import glob
import json
import os
import subprocess
import sys
import tempfile

BASE = os.path.dirname(os.path.abspath(__file__))
CB = os.path.join(BASE, "..", "drawdown-circuit-breaker", "scripts", "check_circuit_breaker.py")
DEFAULT_STATE = os.path.join(BASE, "_trader_state", "theses")


def write_state(path, allowed, reason="", note=""):
    obj = {"new_risk_allowed": allowed, "generated_at": _now()}
    if reason:
        obj["reason"] = reason
    if note:
        obj["note"] = note
    json.dump(obj, open(path, "w", encoding="utf-8"), indent=2)


def _now():
    from datetime import datetime
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-dir", default=os.path.join(BASE, "dashboard"))
    args = ap.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)
    state_out = os.path.join(args.out_dir, "discipline_state.json")
    cfg_path = os.path.join(args.out_dir, "discipline_config.json")

    # Config
    cfg = {}
    if os.path.exists(cfg_path):
        try:
            cfg = json.load(open(cfg_path, encoding="utf-8-sig"))  # tolereaza BOM
        except Exception:
            cfg = {}
    else:
        # scrie un template ca sa stie userul ce sa completeze
        json.dump({"account_size": None, "state_dir": DEFAULT_STATE,
                   "_hint": "Completeaza account_size (USD) ca sa activezi poarta din circuit breaker."},
                  open(cfg_path, "w", encoding="utf-8"), indent=2)

    account_size = cfg.get("account_size")
    state_dir = cfg.get("state_dir", DEFAULT_STATE)

    if not account_size:
        write_state(state_out, True, note="Poarta neconfigurata: seteaza account_size in discipline_config.json.")
        print("account_size lipsa -> gate neutru (permis).")
        return

    # Ruleaza circuit breaker in folder temporar
    tmp = tempfile.mkdtemp()
    cmd = [sys.executable, CB, "--state-dir", state_dir, "--account-size", str(account_size),
           "--output-dir", tmp, "--json-only"]
    try:
        subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    except Exception as e:
        write_state(state_out, True, note=f"Circuit breaker a esuat: {e}")
        print(f"Eroare circuit breaker: {e}"); return

    jsons = sorted(glob.glob(os.path.join(tmp, "*.json")), key=os.path.getmtime, reverse=True)
    if not jsons:
        write_state(state_out, True, note="Circuit breaker nu a produs raport (probabil fara tranzactii jurnalizate).")
        print("Fara output circuit breaker -> permis (fara date)."); return

    res = json.load(open(jsons[0], encoding="utf-8"))
    rec = res.get("recommendation", "TRADING_ALLOWED")
    rationale = res.get("rationale", "")
    dq = res.get("data_quality", "")

    if rec == "TRADING_ALLOWED":
        write_state(state_out, True, note=f"Circuit breaker: {rec}. {dq}")
    else:
        write_state(state_out, False, reason=f"{rec}: {rationale or dq}")
    print(f"Circuit breaker -> {rec}")


if __name__ == "__main__":
    main()
