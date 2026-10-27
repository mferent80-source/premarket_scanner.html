# Verdictul pieței — regulile și proba înainte (I-676 / I-677)

Scris pe **17.10.2026**, înaintea primei zile notate de robot. Codul: `lib/market-verdict.js` (regulile), `lib/macro-regime.js` (regimul macro, copiat fidel din Crypto Radar), `tools/verdict-piata-robot.mjs` (notarea și proba).

## Ce descrie verdictul

Scala **Defensiv (≤ −3) · Prudent (−2…−1) · Neutru (0…2) · Favorabil (≥ 3)** e suma a 6 indicatori (fiecare −2…+1; necitit = nu se numără; sub 3 citiți = „Neconfirmat”):

| Indicator | Regula |
|---|---|
| Trendul (SPY, QQQ) | +1 peste mediile de 50 și 200 de zile, −1 sub amândouă, altfel 0 (media celor două, rotunjită simetric: ±0,5 ⇒ ±1) |
| Participarea | % S&P 500 peste media de 50 de zile: ≥ 60 → +1, ≤ 40 → −1 |
| Volatilitatea (VIX) | < 16 → +1, ≤ 22 → 0, ≤ 30 → −1, peste → −2; **salt ≥ 15% într-o zi** sau **VIX pe 9 zile peste VIX pe 3 luni** (ipoteză, I-679) ⇒ cel mult −1 |
| Dobânzi și credit | dobânda pe 10 ani pe 21 de sesiuni: > +25 pb → −1, < −25 pb → +1; **HYG / IEF cu peste 1% sub media de 50 de zile** (ipoteză, I-680) ⇒ cel mult −1 |
| Regimul macro | treptele Crypto Radar (5 semnale): risk-on / înclinat → +1, neutru → 0, prudent → −1, risk-off / stres → −2; date parțiale = necitit |
| Sectoarele care conduc | 2 din primele 3 defensive → −1; toate 3 ciclice → +1 |

Informații fără scor: mișcarea tipică pe zi din VIX (±VIX/√252), maximele / minimele noi, zilele de distribuție, companiile mici, expirarea opțiunilor (a treia vineri; quad witching în martie / iunie / septembrie / decembrie), rezultatele celor mai mari 15 companii (calendarul Nasdaq), futures doar între 04:00 și 09:30 la New York, beta portofoliului (I-678).

## Notarea (I-676)

Robotul de noapte (`.github/workflows/verdict-piata.yml`) calculează verdictul cu aceleași reguli și notează o linie pe sesiune în `candidate-engine/generated/verdict-piata-istoric.jsonl`. **Prima notare a zilei rămâne**, fișierul doar crește (gardă), iar o linie contează la probă doar dacă a fost notată **înainte de deschiderea sesiunii următoare**.

## Proba (I-677)

- **Ipoteza:** după zilele „Prudent / Defensiv”, S&P (SPY) are o cădere maximă mai mare în următoarele **5 sesiuni** decât după zilele „Neutru / Favorabil”. (Scala servește la dozarea riscului; asta trebuie să facă.)
- **Măsura:** căderea maximă a închiderii SPY față de închiderea zilei verdictului, în următoarele 5 sesiuni; randamentul pe 5 sesiuni e raportat, nu judecat.
- **Zile separate:** se păstrează doar zilele la cel puțin 5 sesiuni una de alta (orizonturile nu se suprapun).
- **Testul:** Welch unilateral pe căderi (grupul „redus” mai negativ), **α = 0,05**.
- **Verdict:** abia după **≥ 20 de zile separate în fiecare grup**; până atunci „în probă” (scris pe panou). „Ajută” = căderea medie mai mare în grupul „redus” și p < 0,05; altfel „nu ajută” — verdictul rămâne descriere, nu avertizare.
- **Mărimea testului, verificată prin simulare înainte de livrare** (date fără niciun efect, 2000 de repetări): 4,0% „ajută” fals cu etichete aleatoare, 4,3% cu etichete care persistă (α nominal 5%).
- Regulile de mai sus nu se schimbă după ce apar rezultate; o regulă nouă înseamnă o probă nouă, de la zero.

## Schimbări

- **17.10.2026 (revizia independentă, înainte de orice rezultat al probei):** media trendului se rotunjește simetric (`Math.round(−0,5)` dădea 0, iar `Math.round(0,5)` dădea 1 — favoriza „Favorabil”); raportul HYG / IEF se calculează pe zilele comune (aliniat pe dată). Istoricul avea 1–2 notări; nu se rescrie.
- **27.10.2026 (auditul F, I-743; scris înaintea oricărui verdict: 7 zile notate, 1 zi separată „redus” și 0 „normal”):**
  - **Versiunea regulii pe fiecare linie.** Liniile noi din `verdict-piata-istoric.jsonl` poartă `regula: "v2.1"` (regula din `docs/setup-filtru-piata.md`, versiunea 2.1). Liniile vechi nu se rescriu (fișierul doar crește); o linie fără `regula` contează ca v2.1 doar dacă a fost notată după revizia de mai sus (17.10.2026, 13:06 UTC). **16.10 (notat la 10:25 UTC, „Defensiv”, −3) a fost notat sub regula dinaintea reviziei ⇒ rămâne în istoric, dar nu intră în probă** — „o regulă nouă înseamnă o probă nouă” se aplică și aici. Fișierul probei arată liniile excluse (`proba.excluse`). Efectul azi: singura zi „redus” iese, proba are 0 „redus” și 1 „normal”.
  - **Judecata o singură dată (eșantion fix).** Verdictul se dă **o singură dată**, pe zilele separate de până în ziua în care ambele grupuri ajung **prima dată** la 20; zilele de după sunt doar monitorizare (`proba.monitorizare`), fără alt verdict. De ce: regula de până azi rejudeca în fiecare noapte după 20 / 20 — simularea (20.000 de lumi, mulberry32, etichete independente de viitor, SPY cu pași N(0; 1 %)) dă „ajută” fals în **8,6–14,4 %** din lumi cu rejudecarea zilnică, față de **3,8–5,3 %** la eșantion fix (30 % zile „redus” cu persistență, respectiv 50 % fără). Mărimea „4,0 / 4,3 %” de mai sus era a eșantionului fix.
  - **Mărimea și puterea, simulate înainte, în depozit** (`rataAjuta` / `lumeVerdict` din `tools/verdict-piata-robot.mjs`, testul `tools/verdict-piata-robot.test.mjs`, 2000 de lumi, 30 % zile „redus”, persistența 0,8): „ajută” fals **4,0 %**; o cădere maximă **în plus de 0,5 puncte procentuale** după zilele „redus” e văzută în **14,3 %** din cazuri, una de **1 punct** în **34,9 %**. Proba vede doar o diferență mare; „nu ajută” va fi rezultatul cel mai probabil și nu înseamnă „s-a dovedit că nu”.
  - **Amprenta judecătorului: `jv-0612f187c9e9`** (funcțiile `deRegula`, `welch`, `proba`, `tcdf` + pragurile); robotul o scrie în `verdict-piata.json` (`judecator`), garda `tools/probe-amprente.test.mjs` pică dacă codul de azi dă alta. Regula verdictului (`lib/market-verdict.js`) NU e amprentată (scorurile și textele stau în aceleași funcții): o schimbare de scor cere `REGULA` nouă (`v2.2`) și o linie aici.
  - **Primul verdict posibil:** când ambele grupuri au câte 20 de zile separate — cu 30 % zile „redus”, ~**23.02.2028**; cu 20 %, ~**11.10.2028** (aproximativ, dincolo de calendarul oficial NYSE). Robotul o recalculează în fiecare noapte (`primulVerdict`), din ponderea văzută și din sesiunile pierdute.
