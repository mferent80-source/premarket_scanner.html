# GARCH(1,1) · volatilitate la 5 și 20 de sesiuni

Al șaselea model din Verdict AI estimează amplitudinea fluctuațiilor. Nu estimează direcția, un interval de preț, pierderea maximă sau probabilitatea de profit. Rulează automat după cuantile, pe același istoric EOD verificat; are și secțiune proprie în Model Lab, reestimare manuală și export JSON.

## Protocol fix

- 510–2000 bare OHLCV cronologice, volume pozitive, fără bare viitoare, goluri de peste șapte zile sau salturi zilnice peste 25%. Datele trebuie verificate separat pentru ajustări și evenimente.
- Randament logaritmic zilnic în procente: `100 × log(close / previousClose)`. Media și varianța inițială sunt calculate numai în antrenare.
- `h[t+1] = omega + alpha × (r[t] − mu)^2 + beta × h[t]`. Parametrii sunt pozitivi, iar `alpha + beta < 0.995`.
- Estimare prin cvasi-verosimilitate Gaussiană: media lui `0.5 × (log(h) + residual²/h)`. Nu presupunem că piața are o distribuție Gaussiană exactă.
- Nelder–Mead determinist, trei porniri `(alpha,beta) = (0.05,0.90), (0.15,0.70), (0.30,0.30)`, maximum 320 de iterații fiecare. În spațiul transformat, diametrul simplexului sub `0.0001` încheie căutarea. Selectăm obiectivul cel mai mic din antrenare, fără scoruri de test.
- Varianța pe termen lung este limitată la `[0.05,20] × varianța din antrenare`; persistența și proporția alpha sunt transformate logistic cu limite `[-8,8]`. Parametrii la limita căutării și lipsa convergenței produc interpretare limitată. Solverul nu certifică un optim global.

## Evaluare fără date viitoare

La minimum 733 bare avem trei ferestre consecutive de câte 160 randamente și minimum 252 randamente înaintea primului test. Antrenarea se extinde înaintea fiecărei ferestre. Sub acest minimum păstrăm un singur test recent și interpretare limitată.

Parametrii fiecărei ferestre sunt fixați înainte de test. Starea se actualizează numai după observarea fiecărui randament. Pentru prognoza curentă folosim parametrii estimați înaintea testului recent, filtrați prin toate observațiile deja disponibile. Actualizarea stării nu reestimează parametrii.

Prima varianță viitoare folosește șocul cunoscut cel mai recent. Următoarele folosesc recurența așteptată `omega + (alpha+beta) × previousExpectedVariance`. Fluctuația cumulată este rădăcina sumei varianțelor prognozate. Echivalentul zilnic este rădăcina mediei lor. Raportul la nivelul istoric folosește varianța din antrenarea recentă.

Repere identice ca informație disponibilă: varianța constantă din antrenare și EWMA cu lambda 0.94 fixat. EWMA se actualizează după fiecare observație; așteptarea multi-pas a varianței este constantă la originea prognozei.

QLIKE este `log(predictedVariance) + observedResidualVariance / predictedVariance`. Pentru 5 și 20 de sesiuni folosim suma pătratelor reziduurilor viitoare și suma varianțelor prognozate. Reziduurile sunt centrate la media fixă din antrenare. Scorul mai mic este mai bun și poate fi negativ; comparăm modele numai în același orizont. Blocurile dintr-un orizont nu au randamente comune: 32 blocuri de 5 și 8 blocuri de 20 per fereastră. Pot rămâne corelate; orizonturile se suprapun între ele.

## Interpretare și Verdict

Interpretarea descriptivă cere trei ferestre, minimum 20 blocuri per orizont în total, convergență fără limite atinse și avantaj QLIKE de peste 0.02 față de ambele repere în cel puțin două ferestre, inclusiv cea recentă, la ambele orizonturi. Protocolul nu se ajustează după rezultate. Ultimul șoc peste șase deviații condiționale ascunde estimarea până la verificarea datelor.

GARCH nu votează direcția. Numai după această validare, un raport de volatilitate la 5 sesiuni de cel puțin 1.5× adaugă prudență în Verdict, fără schimbarea clasei de direcție. Cel puțin 2.5× este „foarte ridicată”. Sub 0.75× este „sub nivelul istoric”, fără garanție de risc redus. Aceste praguri descriptive sunt fixe și nu au fost calibrate pentru profit.

Un raport actual GARCH fără avantaj, limitat sau în drift este afișat și explicat, dar nu modifică concluzia celorlalte modele. Un rezultat absent, invalid sau incompatibil păstrează Verdict incomplet. Cardul și exportul modelului conțin evaluarea retrospectivă. Finalizarea unui calcul eligibil păstrează automat prognoze prospective distincte la 5 și 20 sesiuni în Predicții vs. realitate, cu media și varianțele celor două repere fixate. Rezultatele la origine în drift nu sunt capturate. Verificarea așteaptă toate închiderile orizontului și folosește proxy-ul reziduurilor centrate, fără acuratețe de direcție. Protocol: [HOLDINGS-FORECAST.md](HOLDINGS-FORECAST.md). Registrele vechi și istoricul sintezei sunt păstrate.

Workers primesc numai bare, momentul și ID-ul temporar. Stocarea reală este izolată pe cont și ticker; demo rămâne în memorie. Anularea și schimbarea contextului resping mesaje întârziate. Reutilizarea în Verdict cere raport verificabil și proveniență comună, maximum 30 de minute.

## Verificare publică și limite

`node tools/holdings-garch-benchmark.mjs` evaluează universul fix MSFT, JPM, XOM, SPY și scrie `docs/garch-validation-latest.json`. Toate instrumentele rămân în raport, inclusiv fără avantaj sau cu sursă blocată. Pagina `tools/holdings-garch-validation.html` afișează scorurile și ferestrele. Evaluarea este retrospectivă, nu un holdout prospectiv nou.

Datele și ajustările furnizorului nu sunt certificate independent. GARCH simetric nu separă șocurile negative. Știrile, earnings, gapurile, FX, costurile și riscul portofoliului nu sunt modelate. Volatilitatea prognozată nu este limită de pierdere; nici scorul de test, nici pragurile de interpretare nu dovedesc profitabilitate.

Recurențe și prognoze: [documentația oficială arch](https://arch.readthedocs.io/en/stable/univariate/forecasting.html), [specificația GARCH](https://arch.readthedocs.io/en/stable/univariate/generated/arch.univariate.GARCH.html), [EWMA](https://arch.readthedocs.io/en/stable/univariate/generated/arch.univariate.EWMAVariance.html).
