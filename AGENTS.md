# Trading Tools — reguli proiect

## Git push obligatoriu

După orice modificare de cod în acest repo, agentul **commit-uiește și face push** pe `origin/main`
(fără să întrebe userul dacă vrea push).

1. `git add` — doar fișierele din task
2. `git commit -m "tip(scope): descriere scurtă"`
3. La respingere: `git pull --rebase origin main` apoi `git push origin main`
4. Raportează hash-ul commit și confirmarea push

Excepții: userul cere explicit „fără push", sau task read-only fără modificări.

Repo: `https://github.com/mferent80-source/premarket_scanner.html.git`
## Versiunea aplicației

La modificări ale aplicației vizibile utilizatorului, actualizează împreună:
- `app/index.html`: `data-app-version`, badge-ul inițial și query-ul `version.js`;
- `app/version.json`: `version`, `releasedAt` și `notes`.
Folosește o versiune nouă în format `YY.MM.DD.HHMM`. Nu reutiliza versiunea unei publicări anterioare. Păstrează jurnalul și setările locale la actualizare.
