#!/usr/bin/env python3
"""
Email digest de dimineata: compune si trimite rezumatul zilnic (verdict + semnale + idei).
Config: dashboard\\email_config.json = {"from","app_password","to"}  (Gmail app password).
Fara config valid -> nu trimite (doar scrie preview). Ruleaza in wrapper dupa agregator.
"""
import argparse
import json
import os
import smtplib
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

BASE = os.path.dirname(os.path.abspath(__file__))


def load(name):
    p = os.path.join(BASE, "dashboard", name)
    try:
        return json.load(open(p, encoding="utf-8-sig"))
    except Exception:
        return {}


def build_body(payload, ideas, act, html_path):
    lines = payload.get("lines", [])
    txt = payload.get("title", "Market Breadth") + "\n" + "=" * 40 + "\n"
    txt += "\n".join("• " + l for l in lines)
    # idei momentum top
    tops = []
    for s in ideas.get("sectors", []):
        if s.get("rising"):
            tops += [f"{it['ticker']}({s['etf']})" for it in s.get("ideas", [])[:2]]
    if tops:
        txt += "\n\nIdei momentum: " + ", ".join(tops[:12])
    if ideas.get("contrarian"):
        txt += "\nContrarian: " + ", ".join(c["ticker"] for c in ideas["contrarian"][:6])
    if act and act.get("rows"):
        ew = [r["ticker"] for r in act["rows"] if r.get("earnings_warn")]
        if ew:
            txt += "\n\n⚠️ Earnings curand: " + ", ".join(ew)
    txt += f"\n\nDashboard local: {html_path}"
    txt += f"\n\n(generat {datetime.now():%Y-%m-%d %H:%M})"
    return txt


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", action="store_true", help="doar afiseaza, nu trimite")
    args = ap.parse_args()

    payload = load("notification_payload.json")
    ideas = load("sector_ideas.json")
    act = load("actionable.json")
    html_path = os.path.join(BASE, "dashboard", "breadth_dashboard.html")
    subject = payload.get("title", "Market Breadth Digest")
    body = build_body(payload, ideas, act, html_path)

    cfg = load("email_config.json")
    sender = cfg.get("from"); pw = cfg.get("app_password"); to = cfg.get("to") or sender

    if args.preview or not (sender and pw and to):
        print("=== PREVIEW EMAIL ===")
        print("Subiect:", subject)
        print(body)
        if not (sender and pw and to):
            print("\n[Nu trimit: completeaza dashboard\\email_config.json cu from/app_password/to]")
        return

    msg = MIMEMultipart()
    msg["From"] = sender; msg["To"] = to; msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain", "utf-8"))
    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as s:
            s.starttls(); s.login(sender, pw); s.sendmail(sender, [to], msg.as_string())
        print(f"Email trimis catre {to}: {subject}")
    except Exception as e:
        print(f"EROARE trimitere email: {e}")


if __name__ == "__main__":
    main()
