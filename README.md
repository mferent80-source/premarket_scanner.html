# Trading Tools

Suite de instrumente web pentru analiză și trading multi-asset (crypto + Nasdaq), rulează 100% în browser, fără backend.

🌐 **Live:** [https://mferent80-source.github.io/trading-tools/](https://mferent80-source.github.io/trading-tools/)

---

## 📦 Conținut

| Tool | Versiune | Descriere |
|------|----------|-----------|
| [Crypto Opportunity Scanner](./crypto-scanner/) | v3.5.3 | Scaner multi-symbol pentru Pionex/Binance cu confluență MTF, scoring, ATR risk, heatmap, signal log |
| [Nasdaq Opportunity Scanner](./nasdaq-scanner/) | v2.9.1 | Scaner Nasdaq cu indicatori tehnici, multi-TF, macro context și tab "Early Buy" |
| [Trading Journal](./trading-journal/) | v1.1 | Jurnal de tranzacții pentru Pionex Futures + Grid Bots cu PnL tracking și statistici |

---

## 🗂️ Structura repository-ului

```
trading-tools/
├── index.html              ← Landing page (hub)
├── crypto-scanner/
│   └── index.html          ← Crypto Scanner v3.5.3
├── nasdaq-scanner/
│   └── index.html          ← Nasdaq Scanner v2.9.1
├── trading-journal/
│   └── index.html          ← Trading Journal v1.1
├── README.md
├── LICENSE
└── .gitignore
```

URL-urile rezultate pe GitHub Pages:
- `/` → hub
- `/crypto-scanner/` → Crypto Scanner
- `/nasdaq-scanner/` → Nasdaq Scanner
- `/trading-journal/` → Trading Journal

---

## 🚀 Deploy pe GitHub Pages

### Varianta 1 — repo nou (recomandat)

```bash
# 1. Inițializează repo local
cd trading-tools
git init
git add .
git commit -m "Initial commit: trading tools suite"

# 2. Creează repo pe GitHub (cu numele "trading-tools")
#    apoi:
git branch -M main
git remote add origin https://github.com/mferent80-source/trading-tools.git
git push -u origin main

# 3. Pe GitHub: Settings → Pages → Source: "Deploy from a branch"
#    Branch: main / (root) → Save
```

După ~1 minut va fi live la:
**`https://mferent80-source.github.io/trading-tools/`**

### Varianta 2 — pe domeniul principal `mferent80-source.github.io`

Dacă vrei ca instrumentele să fie pe domeniul principal (fără `/trading-tools/`),
clonează în repo-ul `mferent80-source.github.io` și pune fișierele la rădăcină.

---

## 🛠️ Dezvoltare locală

Niciun build step. Doar deschizi `index.html` în browser, sau rulează un server static:

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .
```

Apoi: `http://localhost:8080/`

---

## ⚙️ Tech notes

- **Pure HTML/CSS/JS** — fără framework, fără bundler
- **Fonts:** Sora + DM Mono (Google Fonts)
- **APIs externe:**
  - Crypto Scanner → Binance public API
  - Nasdaq Scanner → Yahoo Finance (via proxy CORS pe Vercel)
  - Trading Journal → 100% local (localStorage)
- **Persistență:** localStorage browser
- **Mobile-ready:** viewport + theme-color setate, optimizat pentru WebView/APK

---

## 📝 Versionare

- `v3.5.3` Crypto Scanner — versiune Pionex
- `v2.9.1` Nasdaq Scanner — cu tooltips & tips
- `v1.1`   Trading Journal — Pionex Futures + Grid

---

## Dovezi în Decision Desk — 26.10.08.1523

Desk consultă registrul prospectiv original al contului și instrumentului USD selectate. Neural, Boosting și KNN sunt evaluate pe clase la 5 sesiuni; Cuantile pe intervale; GARCH prin QLIKE la 5 și 20 sesiuni. HMM și Isolation rămân context descriptiv, inclusiv în stările fixate înaintea intrării. Un regim HMM ascendent descrie regimul, fără a primi eticheta unei predicții de preț. Verdictul are rezultate direcționale separate, fără reper comparativ pentru un avantaj validat. Prognozele restaurate nu autentifică momentul capturii și sunt excluse din confirmare. Sub 20 orizonturi separate sau cu clase observate incomplete, rezultatul rămâne exploratoriu. Un model eligibil cu rezultate actuale fără avantaj față de reper, acoperire insuficientă sau degradare cere monitorizare.

În Performance Control, fiecare analiză asociată fără ambiguitate arată execuțiile față de zona inițială, stop și țintă, costurile raportate în monedele lor și P&L-ul brokerului. Verificarea evoluției după intrare folosește numai sesiuni zilnice complete după ultima execuție BUY și înaintea ieșirii. Zilele intrării/ieșirii sunt excluse; spliturile ulterioare capturii, identitățile incompatibile și golurile mari blochează comparația. Prețurile nu confirmă existența unui ordin stop, ordinea stop/țintă intraday sau slippage față de cotația la ordin.

Alertele compacte verifică stopurile documentate, concentrarea, trendul EOD și actualitatea surselor. Verificările automate rulează cu pagina deschisă; nu sunt un serviciu de fundal și nu plasează ordine. Istoricul prognozelor rămâne pe dispozitiv, distinct de capturile de intrare sincronizate în cloud. Verificările și erorile de stocare păstrează originalele.

## 🔒 Licență

[MIT License](./LICENSE) — vezi fișierul LICENSE.

---

Bacău, România
