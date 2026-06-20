# Backup automat — Trading Tools (CITEȘTE ÎNTÂI)

Ești un agent (Claude Code) pornit în `E:\Backup-Claude\`. Acest folder e un **sistem de backup
automat** pentru munca userului (Marius) la trading tools. Citește regulile înainte de a face orice.

## ⚠️ DIRECTIVĂ OBLIGATORIE

**Orice proiect, fișier sau unealtă NOUĂ la care lucrezi pentru user → adaug-o în
`_config\watchlist.json` (și în `watchlist.sample.json` din repo) ca să intre AUTOMAT în backup-ul de
aici, cu păstrarea celor 3 versiuni.** Nu lăsa muncă importantă în afara backup-ului. Reflexul, când
creezi ceva nou semnificativ: întâi adaugă-l în watchlist, apoi lucrează.

**Păstrează structura existentă.** Folderele de aici și gruparea pe categorii rămân cum sunt — NU
redenumi, NU reorganiza, NU comasa și NU șterge categorii existente. Poți DOAR să adaugi o categorie
nouă când apare un tip de muncă nou (un folder nou + item în watchlist), fără să atingi ce există deja.

**Rutare Pine:** orice cod Pine (TradingView, fișiere `.pine`, indicatori/strategii/dashboard-uri) merge
EXCLUSIV în categoria `pine-scripts` — și DOAR acolo. Nu-l amesteca în `crypto-scanner`, `premarket-suite`
sau altă categorie. Când apare un folder/fișier Pine local, adaugă-l în watchlist cu `"category": "pine-scripts"`.

## Ce e aici

La finalul fiecărui task, un hook `Stop` din `~/.claude/settings.json` rulează `_backup.ps1`, care
salvează pe categorii ce s-a schimbat și **păstrează DOAR ultimele 3 versiuni** per item (restul șterse).

```
E:\Backup-Claude\
├── _backup.ps1          ← entry (apelat de hook; iese mereu cu 0, non-blocant)
├── _backup-lib.ps1      ← funcțiile (hash, snapshot, rotație, excludere secrete)
├── _config\watchlist.json   ← sursele urmărite (fișier sau folder + categorie + excluderi)
├── _state\hashes.json       ← ultimul hash per item (detecție „s-a schimbat?")
├── _log\backup-log.txt      ← jurnal: ce, când, acțiune
├── crypto-scanner\      ← max 3 snapshot-uri (.html timestamped) ale Crypto Scanner Pro
├── premarket-suite\     ← max 3 arhive .zip ale repo-ului premarket_scanner
├── docs-specs\          ← max 3 arhive .zip cu spec/plan-uri
└── pine-scripts\        ← gol până se adaugă o cale Pine
```

## REGULA CARDINALĂ

**Maxim 3 versiuni per item. Întotdeauna. Restul se șterg.** Nu schimba asta fără cerere explicită.

## Sursa de adevăr (NU edita aici orbește)

Scripturile de aici sunt **copii deployate**. Sursa versionată în git e în repo:
`C:\Users\Cimin\premarket_scanner\tools\backup-system\` (`_backup-lib.ps1`, `_backup.ps1`,
`_backup.tests.ps1`, `watchlist.sample.json`).

**Flux corect la orice modificare a sistemului:**
1. Editezi în repo (`tools\backup-system\`), NU direct pe E:.
2. Rulezi testele: `powershell -NoProfile -ExecutionPolicy Bypass -File "tools\backup-system\_backup.tests.ps1"` → trebuie `0 FAIL`.
3. Redeployezi pe E: copiind `_backup.ps1`, `_backup-lib.ps1` (și `watchlist.sample.json` → `_config\watchlist.json`).
4. Scripturile `.ps1` se salvează **UTF-8 cu BOM** (PowerShell 5.1 le citește fără BOM ca ANSI → strică diacriticele din log).

## Cum adaugi ceva nou la backup

Adaugă un item în `_config\watchlist.json` (și în `watchlist.sample.json` din repo):
`{ "name": "...", "category": "...", "path": "C:\\...", "type": "file" | "folder", "exclude": [] }`

**REGULĂ — niciodată căi din `.claude\worktrees\` în watchlist.** Worktree-urile git sunt
temporare (se curăță) → calea devine moartă și backup-ul dă „LIPSĂ" la fiecare rulare. Dacă un
fișier de protejat trăiește într-un worktree, consolidează-l ÎNTÂI într-o cale stabilă din repo
main (ex. `tools\pine\`, `tools\backup-system\`), comite în git, ABIA APOI pune calea stabilă în
watchlist. `premarket-suite` oricum exclude `.claude\worktrees`, deci munca de acolo nu intră în zip.

**REGULĂ — fără căi/foldere inexistente în watchlist.** Înainte de a adăuga un item, verifică pe
disc că `path` există. Un item către un folder care nu există (ex. un `docs\` neapărut încă) produce
„LIPSĂ" la fiecare backup — adaugă-l doar când chiar există.

## Reguli de siguranță

- NU pune secrete în watchlist; scriptul oricum exclude tipare gen `*.key`, `.env`, `sk-ant-*`, `ghp_*`.
- NU modifica/șterge snapshot-urile manual decât la cerere — sunt copia de siguranță a userului.
- Rulare manuală oricând: `powershell -NoProfile -ExecutionPolicy Bypass -File "E:\Backup-Claude\_backup.ps1"`.

## Context proiect

Munca principală e în repo-ul `C:\Users\Cimin\premarket_scanner` (suită PWA trading-tools) + un scanner
crypto standalone „Crypto Scanner Pro" în `C:\Users\Cimin\Downloads\` (ținut intenționat separat).
Limba de lucru: română (cu diacritice). Userul ține mult la: versionare la fiecare modificare și
păstrarea celor 3 versiuni de backup.