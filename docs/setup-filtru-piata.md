# Filtrul de piață din constructorul de setup (Jurnal → Drafturi)

## Versiunea 2: verdictul pieței (18.10.2026, hotărâtă de Marius)

**De ce s-a schimbat:** sursa veche, Danger Score din pagina Macro, e retrasă din 12.10.2026, când regimul macro s-a mutat în
Crypto Radar. Până pe 18.10, lipsa ei devenea 35/100 inventat, cu GO posibil. Între 18.10 și această versiune a fost „neverificat”:
dimensionare ×0,75 și niciodată GO.

**Sursa:** `candidate-engine/generated/verdict-piata.json`, robotul zilnic cu 6 indicatori: trend, participare, VIX, dobânzi /
credit, regim, sectoare. E același verdict ca pe Astăzi.

| Verdict | Dimensionare | GO permis |
|---|---|---|
| favorabil | ×1 | da |
| neutru | ×1 | da |
| prudent | ×0,75 | da |
| defensiv | ×0,5 | nu |
| lipsă sau mai vechi de 4 zile | ×0,75 | nu („neverificat”) |

- Un Danger Score de azi, dacă reapare vreodată, are prioritate (versiunea 1, pragul 45).
- **Statut:** regulă de PRUDENȚĂ aleasă de el dintre variantele A (verdictul pieței), B (doar VIX), fără filtru, neschimbat. Nu e un
  avantaj dovedit. Nu există un istoric al setup-urilor pe care să fi fost probată.
- Treptele de dimensionare sunt cele ale vechiului Danger Score.
- **Ce ar schimba regula:** o probă în timp a draft-urilor (Signal Journal) pe verdict, cu pragurile scrise înainte, ca la
  `docs/v1-proba-protocol.md`.

## Versiunea 1: Danger Score macro (până pe 12.10.2026)

- Scorul de la 0 la 100; dimensionare ×1 sub 25, ×0,75 între 25 și 44, ×0,5 între 45 și 69, ×0,35 de la 70 în sus.
- GO doar sub 45.
