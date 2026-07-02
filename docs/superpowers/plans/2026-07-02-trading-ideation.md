# trading-ideation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Editarea skill-ului sub superpowers:writing-skills (RED baseline înainte de scriere, GREEN după).

**Goal:** Skill personal nou `trading-ideation` — 4 moduri de ideație (tool / suită / tool-uri noi / backlog), mini-spec-uri prioritizate, backlog persistent în repo, validat cu 4 evals RED-GREEN.

**Architecture:** Un singur SKILL.md (moduri + 4 lentile + format mini-spec + reguli backlog + granițe); regulile transversale se CITESC din `trading-code-craft/references/` (trader.md, design.md), nu se duplică. Backlog-ul e `docs/ideas/backlog.md` în repo — singura scriere permisă skill-ului.

**Tech Stack:** Markdown (skill + backlog), JSON (evals). Fără cod de producție.

**Sursa de adevăr:** `docs/superpowers/specs/2026-07-02-trading-ideation-design.md` (aprobat). Conflict → spec-ul câștigă.

## Global Constraints

- Skill-ul trăiește în `C:\Users\Cimin\.claude\skills\trading-ideation\` (în afara repo-ului); backlog-ul în repo la `docs/ideas/backlog.md`.
- Limba: română cu diacritice complete; termeni tehnici în engleză.
- Description frontmatter sub ~1024 caractere, YAML `>-`, doar condiții de declanșare (fără rezumat de workflow — regula SDO din writing-skills).
- **Read-only pe codul suitei** — skill-ul nu are voie să propună editarea de cod în livrare; singura scriere: backlog + commit `docs(ideas): …`.
- Prioritizare: valoare de trading > risc redus > timp câștigat > efort mic; exprimare P1–P4 + efort S/M/L separat.
- Fără references/ proprii (YAGNI) — dependință citită: `trading-code-craft/references/trader.md` și `design.md`.
- Iron Law writing-skills: baseline RED înainte de a scrie SKILL.md.

---

### Task 1: RED — baseline pe cele 4 scenarii fără skill

**Files:**
- Nimic scris în skill; doar rulări de subagenți + notițe în conversație.

**Interfaces:**
- Produces: lista eșecurilor/rationalizărilor de bază, folosită la formularea SKILL.md (Task 3).

- [ ] **Step 1:** Lansează 4 subagenți în paralel (background), FĂRĂ skill de ideație (dar cu mediul real: pot citi repo + Downloads + skill-urile existente, care se pot declanșa natural). Prompturile:
  1. „Dă-mi idei de îmbunătățire pentru pump-radar." (mod Tool)
  2. „Ce-ar merita îmbunătățit în suita mea trading-tools? Fă-mi un top." (mod Suită)
  3. „Ce tool-uri îmi lipsesc din workflow-ul de trading? Propune-mi ceva nou." (mod Tool-uri noi)
  4. Pentru backlog: creează întâi un fixture temporar `docs/ideas/backlog.md` NU e nevoie —
     testul de backlog nu are sens fără skill (nu există fișierul); baseline-ul lui e conceptual:
     rulează promptul „Am respins ideea de heatmap în trecut. Dă-mi idei pentru sector-rotation."
     și observă dacă agentul re-propune heatmap-ul.
  Fiecare agent: livrare text-only, max ~100 de linii, cu secțiune META (ce surse a folosit, ce structură a ales, dacă a propus implementare directă).
- [ ] **Step 2:** Documentează per scenariu: structura livrării (are efort? prioritate? fișiere atinse? riscuri?), dacă a implementat/propus cod nesolicitat, dacă a verificat existența funcționalității înainte de a propune, dacă a re-propus ideea respinsă. Eșecurile așteptate: idei fără efort/prioritate/fișiere, fără lentile declarate, fără persistență, re-propunerea respinsului.

### Task 2: Backlog inițial în repo

**Files:**
- Create: `C:\Users\Cimin\premarket_scanner\.claude\worktrees\infallible-goldberg-5f1bd3\docs\ideas\backlog.md`

**Interfaces:**
- Produces: formatul exact de backlog pe care SKILL.md (Task 3) și evals (Task 4) îl referențiază.

- [ ] **Step 1:** Scrie scheletul:

```markdown
# Backlog de idei — trading suite

Întreținut de skill-ul `trading-ideation`. Statusuri: `propus` · `aprobat` · `făcut` · `respins`.
Sursă: `ideation` (generat de skill) · `tcc-idei` (din secțiunile „Idei" ale trading-code-craft) · `user`.
Regulă: ideile `respins`/`făcut` NU se repropun (nici reformulate).

| id | titlu | tool | efort | prio | status | sursă | dată |
|----|-------|------|-------|------|--------|-------|------|

## Mini-spec-uri

<!-- Secțiuni per idee, ancorate de id (### I-001 · titlu) -->
```

- [ ] **Step 2:** Commit:
```bash
git add docs/ideas/backlog.md
git commit -m "docs(ideas): initializeaza backlog-ul de idei pentru trading-ideation"
```

### Task 3: SKILL.md

**Files:**
- Create: `C:\Users\Cimin\.claude\skills\trading-ideation\SKILL.md`

**Interfaces:**
- Consumes: eșecurile din Task 1; formatul backlog din Task 2.
- Produces: skill-ul complet, testat în Task 4–5.

- [ ] **Step 1:** Scrie SKILL.md cu secțiunile (conținut conform spec §2–§8, formulat țintit pe eșecurile din baseline):
  - **Frontmatter**: `name: trading-ideation`; description „Use when…" doar cu triggere:
    „dă-mi idei pentru X", „ce-ar merita îmbunătățit în suită", „ce-mi lipsește / propune-mi un tool nou",
    „pune ideile în backlog", „marchează ideea I-NNN ca făcută/respinsă" + diferențiatorii
    (nu implementează — aia e trading-code-craft; nu caută bug-uri — aia e auditing-trading-suite).
  - **Pasul 1 — modul** (Tool / Suită / Tool-uri noi / Backlog) cu semnele de recunoaștere din spec §2
    și numărul de idei per mod (4–6 / 8–12 / 3–5 / n.a.).
  - **Pasul 2 — pregătirea**: citește `docs/ideas/backlog.md` ÎNTÂI (nu repropui `respins`/`făcut`,
    verificat pe conținut nu doar titlu); citește `trading-code-craft/references/trader.md` +
    `design.md`; citește codul țintă (tool-ul integral / hub + eșantion pe suită / harta workflow-ului).
  - **Pasul 3 — cele 4 lentile** (trader / designer / inginer / automator) cu câte 2–3 întrebări
    ghid fiecare (ex. automator: „ce face userul manual azi și s-ar putea muta pe cron/Telegram?");
    livrarea declară o frază per lentilă.
  - **Pasul 4 — livrarea**: formatul mini-spec EXACT din spec §4 (bloc șablon copiabil), prioritizarea
    P1–P4 cu ponderile din spec §5, și **actualizarea backlog-ului în aceeași livrare** (append idei
    noi cu id `I-NNN` incremental + commit `docs(ideas): …`).
  - **Granițe** (spec §7): read-only pe cod (fără diff-uri/cod în livrare — fișierele atinse se
    LISTEAZĂ, nu se modifică); ideile de semnale poartă avertismentul de ipoteză/validare din
    trader.md; web research doar la cerere; bug găsit = o linie + trimitere la craft/audit, nu
    dezvoltat.
  - **Mod Backlog**: normalizarea ideilor externe la mini-spec (sursă `tcc-idei`/`user`),
    schimbarea de status doar la cerere explicită a userului.
- [ ] **Step 2:** Verifică lungimea description-ului (<1024):
```powershell
$t = Get-Content "C:\Users\Cimin\.claude\skills\trading-ideation\SKILL.md" -Raw; $m = [regex]::Match($t, 'description: >-\r?\n([\s\S]*?)\r?\n---'); (($m.Groups[1].Value -replace '\r?\n\s+', ' ').Trim()).Length
```
Expected: număr < 1024.

### Task 4: evals.json

**Files:**
- Create: `C:\Users\Cimin\.claude\skills\trading-ideation\evals\evals.json`
- Create: `C:\Users\Cimin\.claude\skills\trading-ideation\evals\files\backlog-fixture.md` (fixture pentru eval 3)

- [ ] **Step 1:** Scrie fixture-ul backlog cu o idee respinsă și una făcută:

```markdown
# Backlog de idei — trading suite (FIXTURE eval)

| id | titlu | tool | efort | prio | status | sursă | dată |
|----|-------|------|-------|------|--------|-------|------|
| I-001 | Heatmap sectoare în sector-rotation | sector-rotation | M | P2 | respins | user | 2026-06-20 |
| I-002 | Buton copiază sumarul în clipboard | sector-rotation | S | P2 | făcut | ideation | 2026-07-02 |

## Mini-spec-uri

### I-001 · Heatmap sectoare
- Problema/golul: vizualizare comparativă a sectoarelor.
- Soluția: grilă colorată pe Δ1w per sector, în locul tabelului.
- Status: respins — userul preferă tabelul.

### I-002 · Buton copiază sumarul
- Soluția: buton clipboard cu top hot/cold + regim. Implementat în v167.
```

- [ ] **Step 2:** Scrie `evals.json` cu cele 4 evals din spec §9:

```json
{
  "skill_name": "trading-ideation",
  "evals": [
    {
      "id": 0,
      "name": "ideas-for-tool",
      "prompt": "Dă-mi idei de îmbunătățire pentru pump-radar.",
      "expected_output": "4–6 idei în format mini-spec complet (titlu · efort S/M/L · prio P1–P4, problema, soluția, impact, riscuri, fișiere atinse — listate, nu modificate), cu cele 4 lentile declarate (trader/designer/inginer/automator, o frază fiecare), backlog-ul citit înainte și actualizat (append I-NNN + commit docs(ideas)), zero cod/diff în livrare, ideile de semnale marcate ca ipoteze de validat.",
      "files": [],
      "assertions": []
    },
    {
      "id": 1,
      "name": "suite-review",
      "prompt": "Ce-ar merita îmbunătățit în suita mea trading-tools? Fă-mi un top.",
      "expected_output": "Top 8–12 idei cross-tool prioritizate P1–P4 cu efort S/M/L, acoperind minim o idee pe lentila trader și una pe automator (nu doar cosmetice), format mini-spec, backlog actualizat, read-only pe cod, bug-urile eventual găsite semnalate într-o linie cu trimitere la audit/craft fără dezvoltare.",
      "files": [],
      "assertions": []
    },
    {
      "id": 2,
      "name": "new-tools-gaps",
      "prompt": "Ce tool-uri îmi lipsesc din workflow-ul de trading? Propune-mi ceva nou.",
      "expected_output": "3–5 propuneri de tool-uri INEXISTENTE, ancorate în golurile workflow-ului (premarket→scan→semnal→execuție→jurnal→review), fiecare cu verificare explicită că nu există echivalent în suită (numește ce s-a verificat), format mini-spec cu efort/prio, backlog actualizat.",
      "files": [],
      "assertions": []
    },
    {
      "id": 3,
      "name": "backlog-no-repropose",
      "prompt": "Dă-mi idei pentru sector-rotation. (Backlog-ul existent e în fixture-ul backlog-fixture.md — tratează-l ca docs/ideas/backlog.md.)",
      "expected_output": "Ideile livrate NU includ heatmap-ul (I-001 respins) în nicio formă reformulată și NU repropun butonul de clipboard (I-002 făcut); livrarea menționează explicit că backlog-ul a fost citit și ce a fost exclus din cauza statusurilor.",
      "files": ["backlog-fixture.md"],
      "assertions": []
    }
  ]
}
```

- [ ] **Step 3:** Validează JSON:
```powershell
try { $j = Get-Content "C:\Users\Cimin\.claude\skills\trading-ideation\evals\evals.json" -Raw -Encoding UTF8 | ConvertFrom-Json; "JSON OK — $($j.evals.Count) evals" } catch { "JSON INVALID: $($_.Exception.Message)" }
```
Expected: `JSON OK — 4 evals`.

### Task 5: GREEN — rulează cele 4 evals + corecții

**Files:**
- Read: SKILL.md + evals; posibile corecții în SKILL.md.

- [ ] **Step 1:** 4 subagenți în paralel (background), fiecare cu instrucțiunea: citește
  `C:\Users\Cimin\.claude\skills\trading-ideation\SKILL.md` și urmează-l; prompt-ul evalului;
  pentru eval 3, indică fixture-ul drept backlog. Read-only pe cod; scrierea backlog-ului o
  DESCRIU (append-ul exact + mesajul de commit), nu o execută (simulare).
- [ ] **Step 2:** Grading criteriu-cu-criteriu contra `expected_output`. PASS/FAIL per eval.
- [ ] **Step 3:** REFACTOR: la FAIL, corectează formularea din SKILL.md (formă structurală, nu
  rugăminți — vezi Match the Form to the Failure din writing-skills) și re-rulează DOAR evals-urile
  picate. Țintă 4/4.

### Task 6: Livrare — backup E:, memorie, commit

**Files:**
- Create: `E:\Backup-Claude\claude-skills\trading-ideation\` (copie completă)
- Create: `C:\Users\Cimin\.claude\projects\C--Users-Cimin-premarket-scanner\memory\trading-ideation-skill.md`
- Modify: `C:\Users\Cimin\.claude\projects\C--Users-Cimin-premarket-scanner\memory\MEMORY.md` (o linie nouă)

- [ ] **Step 1:** Backup:
```powershell
Copy-Item "C:\Users\Cimin\.claude\skills\trading-ideation" "E:\Backup-Claude\claude-skills\trading-ideation" -Recurse -Force
```
- [ ] **Step 2:** Memorie nouă (frontmatter `type: project`) cu: locația skill-ului, cele 4 moduri,
  formatul mini-spec, backlog-ul `docs/ideas/backlog.md` + statusuri, granițele față de
  [[trading-code-craft-skill]] și [[auditing-trading-suite-skill]], rezultatul evals. Linie în
  MEMORY.md: `- [Skill trading-ideation](trading-ideation-skill.md) — ideație read-only: 4 moduri (tool/suită/tool-uri noi/backlog), mini-spec-uri P1–P4 + S/M/L, backlog persistent docs/ideas/backlog.md; implementarea rămâne la trading-code-craft`.
- [ ] **Step 3:** Commit plan + orice actualizări docs:
```bash
git add docs/
git commit -m "docs(plan): trading-ideation executat"
```

## Self-Review (rulat la scriere)

1. **Acoperire spec:** §2 moduri→Task 3; §3 lentile→Task 3; §4 format→Task 3+4; §5 prioritizare→Task 3; §6 backlog→Task 2+3; §7 granițe→Task 3 (+Global Constraints); §8 structură+description→Task 3; §9 evals→Task 1 (RED) + 4 + 5 (GREEN); §10 livrare→Task 6. Fără găuri.
2. **Placeholders:** conținut concret în fiecare task (șabloane, fixture, comenzi cu expected). OK.
3. **Consistență:** numele fișierelor (`backlog.md`, `backlog-fixture.md`, `trading-ideation`) și statusurile (`propus/aprobat/făcut/respins`) identice în Task 2/3/4. OK.
