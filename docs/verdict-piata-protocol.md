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
