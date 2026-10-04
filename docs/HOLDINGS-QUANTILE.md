# Regresie cu cuantile — interval la cinci sesiuni

Modelul al cincilea estimează cuantilele 10%, 50% și 90% ale randamentului închiderii la +5 sesiuni, normalizat cu ATR procentual cunoscut la sesiunea de pornire. Limitele și mediana sunt convertite în moneda instrumentului folosind prețul EOD. Intervalul privește doar închiderea, fără maxime, minime sau traiectorie în interiorul celor cinci sesiuni.

## Antrenare și evaluare

- Aceiași zece indicatori cauzali OHLCV ca Neural; ținta este continuă, fără clase Declin/Mixt/Avans.
- Trei regresii liniare, loss pinball, L2 0,005. Optimizare deterministă cu subgradient până la 180 iterații; selecție la fiecare zece iterații pe validare, inclusiv reperul inițial constant. Nu pretindem un optim exact al problemei convexe.
- Ultimele 60–100 exemple sunt testul. Trecutul anterior se împarte 70% antrenare, 15% validare, 15% referință. Orizonturile care ating următorul set sunt eliminate la fiecare graniță.
- Normalizarea și coeficienții folosesc numai antrenarea. Validarea selectează iterația; referința nu selectează parametri. Cuantilele brute sunt reordonate înaintea ajustării și testării; numărul de încrucișări este raportat.
- Referința păstrează orizonturi cu început strict după închiderea țintei precedente. Ajustarea ne-negativă a limitelor folosește rangul `ceil((n+1)*0,8)` al deviațiilor `max(limită_inferioară−y, y−limită_superioară, 0)`. Nu micșorează intervalul.
- Testul nu selectează modelul, iterația sau ajustarea. Sunt raportate acoperirea observată, lățimea, eroarea medianei, loss pinball și scorul de interval. Scorul penalizează atât lățimea, cât și închiderile ratate; mai mic este mai bun.
- Reperul folosește cuantile constante din antrenare, cu aceeași regulă de ajustare pe referință. Nu alegem retrospectiv reperul mai ușor.
- Trei ferestre recente folosesc aceleași reguli; testele lor sunt separate inclusiv până la ultima etichetă viitoare. Exemplele zilnice din fiecare test se suprapun; controlul separat nu dovedește independență statistică.

## Interpretare și limite

80% este **acoperirea nominală urmărită**, nu o probabilitate verificată pentru următoarea închidere sau pentru profit. Seria financiară poate schimba regimul și nu presupunem interschimbabilitatea observațiilor. Ajustarea pe referință nu oferă o garanție de acoperire viitoare. Un interval larg poate include multe prețuri și totuși să fie puțin util.

`limited`: istoric insuficient pentru trei ferestre, sub 20 orizonturi de referință, sub 15 orizonturi separate de test sau acoperire recentă sub 70%. `no-edge`: scorul recent nu bate reperul sau mai puțin de două ferestre îl bat. `drift`: distanță peste 6 deviații standard față de antrenare ori preț estimat nepozitiv; estimarea curentă este ascunsă. În rest, interpretarea rămâne descriptivă și experimentală. Pragurile sunt reguli fixe de afișare, fără optimizare după test.

Nu include știri, rezultate financiare, fundamentale, FX, costuri, ordine sau expunerea portofoliului. Nu votează cu clasificatorii și nu crește scorul lor de încredere. Demo folosește istoricul fictiv Neural/HMM; Isolation folosește propriul scenariu fictiv cu anomalie.

## Integrare și continuitate

Modelul rulează într-un worker separat, exclusiv față de ceilalți workeri. Datele contului nu intră în antrenare. Raportul local este separat pe cont și ticker; folosirea lui cere instrument, monedă, EOD, timestamp sursă și raport numeric verificabil. Valabilitate: 30 minute după antrenare. Schimbarea contextului anulează lucrările; demo rămâne în memorie.

Sinteza curentă are cinci modele (`holdings-lab-summary-v2`). API-ul fără argumentul `quantile` păstrează formatul anterior cu patru modele. Istoricul citește ambele formate, pe aceeași cheie și fără rescriere la deschidere. La compararea unei sinteze vechi cu una nouă, cuantilele apar drept model nou, nu drept schimbare a pieței. Jurnalele și setările nu sunt mutate sau șterse.

## Reproducere și surse

`node --test tools/holdings-quantile.test.mjs tools/holdings-quantile-ui.test.mjs`

`node tools/holdings-quantile-benchmark.mjs docs/quantile-validation-latest.json` scanează un univers public fix: MSFT, JPM, XOM, SPY. Raportul marchează explicit orice istoric care nu poate fi verificat. Testul este retrospectiv, fără un holdout prospectiv nou.

- [Regresie cu cuantile și loss pinball — scikit-learn](https://scikit-learn.org/stable/auto_examples/linear_model/plot_quantile_regression.html)
- [Separarea antrenării, conformalizării și testului; condițiile de interschimbabilitate — MAPIE](https://github.com/scikit-learn-contrib/MAPIE/blob/master/doc/content/conformal-prediction/split-cross-conformal.md)

Implementarea locală folosește regularizare L2 și subgradient propriu; nu este estimatorul scikit-learn. Sursele explică principiile, fără a certifica performanța acestui model pe acțiuni.
