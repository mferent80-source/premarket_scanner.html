# Adăugiri la politica de risc — lotul F (probele în timp și statistica), 27.10.2026

Pentru coordonator: paragrafele de mai jos intră în `docs/politica-de-risc.md` la secțiunile numite; textul e gata de lipit. Nicio limită
a contului nu se schimbă; se schimbă doar **când** și **cum** poate o probă să ridice un plafon.

## § 2 — rândul „Risc pe plan” (completare la „Top Long în probă”)

- **Top Long rămâne plafonat la 0,25 %** până la un „Top Long ajută” la **judecata unică** a probei `premarket-proba-2`
  (`docs/premarket-proba-protocol.md`, § „Protocolul v2”): 16 perioade de 5 sesiuni (cel devreme ~februarie–mai 2027) pentru orizontul
  secundar, 60 de perioade de 20 de sesiuni (cel devreme ~2031) pentru cel principal. Plafonul îl ridică doar verdictul **orizontului
  principal** (cum citește deja desk-ul). Un „ajută” cu rezerve (persistență ≥ 0,2) nu ridică plafonul fără o decizie scrisă în § 6.
- „Nu s-a văzut un avantaj” **nu** ridică și nu coboară nimic: plafonul rămâne 0,25 % (prudență, nu dovadă).

## § 5 — Revizuirea (înlocuiește a treia liniuță)

- Probele în timp (Top Long, Reguli V1, Trend 12 luni, verdictul pieței, Clasificatorul, stopul Reversal în umbră) au protocoalele lor cu
  praguri **și mărimea testului** scrise înainte (`docs/*-protocol.md`; puterea și data estimată a primului verdict în fișierul fiecărui robot:
  `putere`, `primulVerdict`, `judecata`). Verdictul lor poate schimba doar riscul pe plan al motorului respectiv, nu limitele contului.
- **Un verdict se dă o singură dată**, pe eșantionul fix scris în protocol (excepție declarată: Trend și umbra, cu praguri alese pentru
  privirile repetate). Un verdict recalculat zilnic nu poate schimba un plafon.
- **Codul care judecă e înghețat ca motorul** (amprenta judecătorului, `tools/probe-amprente.test.mjs` și `docs/clasificator-versiuni.md`):
  o schimbare de regulă sau de judecată = probă nouă, scrisă înainte; jurnalele vechi rămân sub versiunea veche, nu se șterg.
- Orice „avantaj” viitor se corectează pe numărul real de încercări al familiei lui (`docs/cercetare/registru.md`, § 1g: ≈ 101 pe aplicație).

## § 6 — Istoricul schimbărilor (rând nou)

| Data | Ce | De la → la | De ce | Unde |
|---|---|---|---|---|
| 2026-10-27 | Probele Reguli V1 și Top Long: judecată unică, perioadele cerute de putere (I-741 / I-743); verdictul pieței: o singură judecată, doar regula v2.1 | verdict recalculat la fiecare perioadă după 8 → o judecată la 16 / 60 perioade; verdictul pieței rejudecat nocturn → o judecată la primul 20 / 20 | „ajută” fals ≈ 15 % / an (V1 / Top Long) și 9–14 % (verdictul pieței) cu rejudecarea; puterea la 8 perioade 12–39 % | `lib/v1-proba.mjs`, `lib/premarket-proba.mjs`, `tools/verdict-piata-robot.mjs`, protocoalele |
