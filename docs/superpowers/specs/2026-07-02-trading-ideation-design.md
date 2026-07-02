# Spec: trading-ideation — skill de ideație pentru suita de trading

**Data:** 2026-07-02
**Status:** aprobat de user (design V1 prezentat și acceptat în sesiune)
**Livrabil:** skill personal NOU `C:\Users\Cimin\.claude\skills\trading-ideation\` + backlog în repo.
**Relație:** complementar cu `trading-code-craft` (executantul) — ideation propune, craft implementează.

## 1. Obiectiv

Un skill care generează **idei noi de features / interfață / îmbunătățiri / tool-uri noi** pentru
ecosistemul de trading al userului (suita PWA, Pine, Crypto Scanner Pro, automation), livrate ca
mini-spec-uri prioritizate și adunate într-un backlog persistent.

## 2. Moduri de operare (detectate din cerere)

1. **Tool** — „dă-mi idei pentru <tool>": citește tool-ul integral + backlog-ul, propune **4–6 idei**
   mini-spec pe tool-ul respectiv.
2. **Suită** — „ce-ar merita îmbunătățit în suită?": survolează hub + toate paginile + automation
   (subagenți pentru citire la nevoie), livrează **top 8–12** idei prioritizate cross-tool.
3. **Tool-uri noi** — „ce-mi lipsește?": pornește de la workflow-ul de trading al userului
   (premarket → scan → semnal → execuție → jurnal → review) și caută **golurile dintre tool-uri**
   (handoff-uri manuale, informații care nu circulă), nu defectele din ele.
4. **Backlog management** — „pune ideile astea în backlog" / „marchează X ca făcut/respins":
   normalizează idei externe (ex. din secțiunile „Idei" ale trading-code-craft) la formatul
   mini-spec și actualizează statusuri.

## 3. Cele 4 lentile obligatorii (per analiză, orice mod)

- **Trader** — valoare de decizie, riscuri prevenite, ce lipsește ca să nu piardă bani; ancorat în
  `trading-code-craft/references/trader.md` (skill-ul îl CITEȘTE, nu îl duplică).
- **Designer** — lizibilitate, stări, densitate, data-viz; ancorat în
  `trading-code-craft/references/design.md`.
- **Inginer** — datorie tehnică, robustețe, refolosire `lib/`, consolidare duplicate.
- **Automator** — ce acțiuni manuale se pot muta pe pipeline (CF Worker/Actions/check-alerts),
  notificări Telegram, cron-uri.

Fiecare livrare declară pe scurt ce a văzut fiecare lentilă (o frază per lentilă e suficientă),
ca ideile să nu fie doar cosmetice.

## 4. Formatul unei idei (mini-spec)

```
### <titlu scurt> · [S|M|L] · scor P1–P4
- Problema/golul: <ce doare azi, concret>
- Soluția: <ce se construiește, 2–4 fraze>
- Impact: <pe criteriul dominant — decizie mai bună / risc prevenit / timp câștigat>
- Riscuri/dependențe: <ce poate merge prost, de ce depinde>
- Fișiere atinse: <căi exacte>
```

Gata de rutat direct în trading-code-craft cu „implementează ideea X".

## 5. Prioritizare

Scor compus, ponderi în ordinea: **valoare de trading > risc redus > timp câștigat > efort mic**.
(Alegere făcută de asistent după ce userul a lăsat întrebarea deschisă — ușor de reponderat.)
Exprimat simplu ca P1 (fă-l acum) / P2 / P3 / P4 (nice-to-have), cu efortul S/M/L separat —
un P1+S e quick win, un P1+L e proiect.

## 6. Backlog persistent

- **Locație:** `docs/ideas/backlog.md` în repo `premarket_scanner` (versionat, vizibil pe GitHub).
- **Format:** tabel markdown per idee: `id · titlu · tool · efort · prioritate · status · sursă · dată`,
  cu mini-spec-urile complete sub tabel (secțiuni ancorate de id).
- **Statusuri:** `propus` / `aprobat` / `făcut` / `respins`.
- **Reguli:**
  - Skill-ul CITEȘTE backlog-ul la fiecare rulare și NU repropune idei `respins`/`făcut`
    (nici reambalate sub alt titlu — verifică pe conținut, nu doar pe titlu).
  - Ideile noi se ADAUGĂ la backlog în aceeași livrare (append, id incremental `I-NNN`).
  - Sursa se notează: `ideation` sau `tcc-idei` (venite din secțiunile Idei ale trading-code-craft).
  - Commit-ul backlog-ului: `docs(ideas): <ce s-a adăugat/actualizat>`.

## 7. Granițe (ce NU face)

- **Read-only pe codul suitei** — nu implementează nimic; implementarea = trading-code-craft.
  (Singura scriere permisă: `docs/ideas/backlog.md` + commit.)
- Nu inventează praguri/strategii „garantate" — ideile de semnale poartă avertismentul de validare
  din trader.md (ipoteze, out-of-sample).
- Web research (ce fac alte tool-uri, API-uri noi) doar la cerere explicită.
- Nu se suprapune cu `auditing-trading-suite` (acela caută defecte; ideation caută oportunități) —
  dacă în timpul analizei găsește bug-uri, le semnalează într-o linie și trimite la audit/craft,
  nu le dezvoltă.

## 8. Structura skill-ului

```
trading-ideation/
├── SKILL.md            — moduri, lentile, format mini-spec, reguli backlog, granițe
└── evals/evals.json    — 4 evals
```
Un singur fișier SKILL.md (regulile transversale trăiesc deja în trading-code-craft/references
și sunt doar citate ca dependință). Fără references/ proprii — YAGNI.

**Description (triggering):** „Use when the user wants idei/propuneri de îmbunătățire sau tool-uri
noi pentru suita de trading — «dă-mi idei pentru X», «ce-ar merita îmbunătățit», «ce-mi lipsește»,
«pune ideile în backlog», «marchează ideea ca făcută» — fără să implementeze nimic."
Diferențiator clar față de trading-code-craft (execuție) și auditing-trading-suite (defecte).

## 9. Evals (4)

| # | Nume | Testează |
|---|------|----------|
| 0 | ideas-for-tool | Mod Tool pe o pagină reală → 4–6 mini-spec-uri complete, 4 lentile declarate, idei adăugate în backlog, read-only pe cod |
| 1 | suite-review | Mod Suită → top 8–12 cross-tool prioritizat P1–P4, nu doar cosmetice (minim câte o idee pe lentilele trader și automator) |
| 2 | new-tools-gaps | Mod Tool-uri noi → idei de tool-uri INEXISTENTE ancorate în golurile workflow-ului, cu verificare că nu există deja echivalent în suită |
| 3 | backlog-no-repropose | Backlog cu o idee `respins` → skill-ul NU o repropune (nici reformulată); idee `făcut` recunoscută |

Metodologie: RED (baseline fără skill) → GREEN (cu skill) → REFACTOR, ca la trading-code-craft v2.

## 10. Livrare & post-pași

- Skill în `~/.claude/skills/trading-ideation/` + backup `E:\Backup-Claude\claude-skills\trading-ideation\`.
- `docs/ideas/backlog.md` inițializat în repo (schelet gol + legendă).
- Memorie nouă `trading-ideation-skill.md` + linie în MEMORY.md, cu legături [[trading-code-craft-skill]].
- Opțional viitor (NU în scope): trading-code-craft să scrie automat secțiunile „Idei" în backlog.
