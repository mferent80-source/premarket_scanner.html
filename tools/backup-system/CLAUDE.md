# Backup automat — Trading Tools (CITE?TE ÎNTÂI)

E?ti un agent (Claude Code) pornit în `E:\Backup-Claude\`. Acest folder e un **sistem de backup
automat** pentru munca userului (Marius) la trading tools. Cite?te regulile înainte de a face orice.

## ?? DIRECTIVÃ OBLIGATORIE

**Orice proiect, fi?ier sau unealtã NOUÃ la care lucrezi pentru user › adaug-o în
`_config\watchlist.json` (?i în `watchlist.sample.json` din repo) ca sã intre AUTOMAT în backup-ul de
aici, cu pãstrarea celor 3 versiuni.** Nu lãsa muncã importantã în afara backup-ului. Reflexul, când
creezi ceva nou semnificativ: întâi adaugã-l în watchlist, apoi lucreazã.

**Pãstreazã structura existentã.** Folderele de aici ?i gruparea pe categorii rãmân cum sunt — NU
redenumi, NU reorganiza, NU comasa ?i NU ?terge categorii existente. Po?i DOAR sã adaugi o categorie
nouã când apare un tip de muncã nou (un folder nou + item în watchlist), fãrã sã atingi ce existã deja.

**Rutare Pine:** orice cod Pine (TradingView, fi?iere `.pine`, indicatori/strategii/dashboard-uri) merge
EXCLUSIV în categoria `pine-scripts` — ?i DOAR acolo. Nu-l amesteca în `crypto-scanner`, `premarket-suite`
sau altã categorie. Când apare un folder/fi?ier Pine local, adaugã-l în watchlist cu `"category": "pine-scripts"`.

## Ce e aici

La finalul fiecãrui task, un hook `Stop` din `~/.claude/settings.json` ruleazã `_backup.ps1`, care
salveazã pe categorii ce s-a schimbat ?i **pãstreazã DOAR ultimele 3 versiuni** per item (restul ?terse).

```
E:\Backup-Claude\
+¦¦ _backup.ps1          ‹ entry (apelat de hook; iese mereu cu 0, non-blocant)
+¦¦ _backup-lib.ps1      ‹ func?iile (hash, snapshot, rota?ie, excludere secrete)
+¦¦ _config\watchlist.json   ‹ sursele urmãrite (fi?ier sau folder + categorie + excluderi)
+¦¦ _state\hashes.json       ‹ ultimul hash per item (detec?ie „s-a schimbat?")
+¦¦ _log\backup-log.txt      ‹ jurnal: ce, când, ac?iune
+¦¦ crypto-scanner\      ‹ max 3 snapshot-uri (.html timestamped) ale Crypto Scanner Pro
+¦¦ premarket-suite\     ‹ max 3 arhive .zip ale repo-ului premarket_scanner
+¦¦ docs-specs\          ‹ max 3 arhive .zip cu spec/plan-uri
L¦¦ pine-scripts\        ‹ gol pânã se adaugã o cale Pine
```

## REGULA CARDINALÃ

**Maxim 3 versiuni per item. Întotdeauna. Restul se ?terg.** Nu schimba asta fãrã cerere explicitã.

## Sursa de adevãr (NU edita aici orbe?te)

Scripturile de aici sunt **copii deployate**. Sursa versionatã în git e în repo:
`C:\Users\Cimin\premarket_scanner\tools\backup-system\` (`_backup-lib.ps1`, `_backup.ps1`,
`_backup.tests.ps1`, `watchlist.sample.json`).

**Flux corect la orice modificare a sistemului:**
1. Editezi în repo (`tools\backup-system\`), NU direct pe E:.
2. Rulezi testele: `powershell -NoProfile -ExecutionPolicy Bypass -File "tools\backup-system\_backup.tests.ps1"` › trebuie `0 FAIL`.
3. Redeployezi pe E: copiind `_backup.ps1`, `_backup-lib.ps1` (?i `watchlist.sample.json` › `_config\watchlist.json`).
4. Scripturile `.ps1` se salveazã **UTF-8 cu BOM** (PowerShell 5.1 le cite?te fãrã BOM ca ANSI › stricã diacriticele din log).

## Cum adaugi ceva nou la backup

Adaugã un item în `_config\watchlist.json` (?i în `watchlist.sample.json` din repo):
`{ "name": "...", "category": "...", "path": "C:\\...", "type": "file" | "folder", "exclude": [] }`

**REGULÃ — niciodatã cãi din `.claude\worktrees\` în watchlist.** Worktree-urile git sunt
temporare (se curã?ã) › calea devine moartã ?i backup-ul dã „LIPSÃ" la fiecare rulare. Dacã un
fi?ier de protejat trãie?te într-un worktree, consolideazã-l ÎNTÂI într-o cale stabilã din repo
main (ex. `tools\pine\`, `tools\backup-system\`), comite în git, ABIA APOI pune calea stabilã în
watchlist. `premarket-suite` oricum exclude `.claude\worktrees`, deci munca de acolo nu intrã în zip.

**REGULÃ — fãrã cãi/foldere inexistente în watchlist.** Înainte de a adãuga un item, verificã pe
disc cã `path` existã. Un item cãtre un folder care nu existã (ex. un `docs\` neapãrut încã) produce
„LIPSÃ" la fiecare backup — adaugã-l doar când chiar existã.

## Reguli de siguran?ã

- NU pune secrete în watchlist; scriptul oricum exclude tipare gen `*.key`, `.env`, `sk-ant-*`, `ghp_*`.
- NU modifica/?terge snapshot-urile manual decât la cerere — sunt copia de siguran?ã a userului.
- Rulare manualã oricând: `powershell -NoProfile -ExecutionPolicy Bypass -File "E:\Backup-Claude\_backup.ps1"`.

## Context proiect

Munca principalã e în repo-ul `C:\Users\Cimin\premarket_scanner` (suitã PWA trading-tools) + un scanner
crypto standalone „Crypto Scanner Pro" în `C:\Users\Cimin\Downloads\` (?inut inten?ionat separat).
Limba de lucru: românã (cu diacritice). Userul ?ine mult la: versionare la fiecare modificare ?i
pãstrarea celor 3 versiuni de backup.