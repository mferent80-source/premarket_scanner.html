# Git push — mereu după modificări

În `premarket_scanner`, la finalul fiecărui task cu fișiere modificate:

- Commit + push pe `origin/main` este **obligatoriu**
- Nu lăsa modificări doar locale și nu aștepta userul să întrebe „ai făcut push?"
- La conflict remote: `git pull --rebase origin main` apoi push
- Menționează hash-ul commit în răspuns

Skip doar dacă userul spune explicit să nu faci push.