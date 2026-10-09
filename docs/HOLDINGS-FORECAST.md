# Predicții vs. realitate

Registru prospectiv local, separat de testele retrospective și de sintezele păstrate manual. Se află în **Analiza deținerilor → Modele AI → Predicții vs. realitate**.

## Captură

După finalizarea unui model se salvează automat prima estimare pe instrument, monedă, model, orizont și sesiune EOD. GARCH păstrează două estimări distincte, la 5 și 20 de sesiuni. După terminarea dialogului cu șase rezultate verificate se păstrează automat și verdictul final la 5 sesiuni, inclusiv titlul, motivele și rezumatele celor șase modele. Un verdict neconcludent, contradictoriu sau de prudență rămâne abținere. Butonul manual poate salva rezultatele modelelor actuale existente; captura verdictului se face prin dialogul complet. Registrul are o cheie distinctă pentru cont, ticker broker, simbol de piață, monedă și tipul datelor. Demo-ul folosește numai memorie.

Estimările conțin versiunea modelului, momentul antrenării și al salvării, timestampul barei de origine, fusul bursei, închiderea și ATR inițial, estimarea și reperul fixat. Fără cantități, solduri, chei API sau ponderi antrenate. Modelele blocate de drift/disagreement nu sunt capturate ca predicții de direcție; rezultatele fără avantaj istoric pot fi urmărite, cu starea lor explicită.

Reantrenarea nu suprascrie primul rezultat, nici dacă aplicația schimbă versiunea modelului. Numai modelele recente, compatibile și legate de sesiunea verificată pot produce o înregistrare. Rezultatele Neural vechi fără metadata sursei nu se importă retrospectiv. Pentru calendarele bursiere acoperite și verificate, captura se oprește la următoarea deschidere reală, ținând cont de sărbători și fusul bursei. Calendarele neacoperite păstrează regula conservatoare veche: refuz de la începutul următoarei zile lucrătoare. Zilele scurte cu ora finală nepublicată blochează captura în acea zi. Acoperirea și sursele sunt documentate în PROFESSIONAL-UPGRADE.md. Data actuală trebuie să corespundă sesiunii EOD așteptate.

## Verificare

La deschiderea filei Modele AI pentru o deținere cu estimări care necesită actualizare, verificarea solicită o singură dată pe EOD așteptat o serie publică de până la cinci ani, fără cache. Programul salvat în registru stabilește EOD-ul, independent de o analiză curentă veche sau absentă. Dacă ultima verificare păstrată acoperă deja sesiunea așteptată, cererea automată este omisă și după redeschiderea paginii. Butonul **Verifică rezultatele** permite reîncercarea. Nu există monitorizare când aplicația este închisă. Schimbarea contului, monedei, instrumentului sau EOD al analizei pe durata cererii anulează folosirea răspunsului.

`DailySeries.read` verifică identitatea, moneda, programul și sesiunea încheiată. Rezultatul este a cincea bară zilnică după timestampul de origine, respectiv a douăzecea pentru GARCH la acel orizont; nu zile calendaristice și nu închiderea cea mai recentă. Înainte de numărul cerut de bare: pending. Dacă sursa nu poate confirma originea, a revizuit prețurile, are bare duplicate, un salt zilnic peste 25% sau un gol de peste șapte zile: neverificabil, exclus din agregate.

Prima închidere finalizată și toate timestampurile/prețurile orizontului sunt păstrate. Revizuirea ulterioară nu schimbă rezultatul; îl exclude până când o verificare poate confirma din nou aceleași date. O eroare de rețea păstrează ultimul raport și afișează imposibilitatea actualizării. Ajustările mici și barele intermediare omise pot rămâne nedetectate; calendarul bursier complet nu este implementat.

## Măsuri separate

- Neural / Boosting: clasă după randamentul închiderii împărțit la ATR inițial, praguri ≤−1 / între / ≥1. Reperul este clasa majoritară din antrenare. Acuratețea echilibrată lipsește când nu sunt reprezentate toate clasele.
- Cuantile: acoperire inclusivă, eroare absolută a medianei și scor de interval pentru ținta nominală 80%, toate erorile normalizate cu ATR inițial. Reperul este intervalul cuantilelor istorice cu ajustarea proprie, înghețat la salvare.
- GARCH: media din ultima antrenare, varianța cumulată a modelului și ambele repere (constant și EWMA) sunt fixate la origine. Proxy-ul observat este `sum((100 × log(close[t]/close[t−1]) − mu)^2)` pe cele 5 sau 20 închideri, centrat la media păstrată. Afișăm rădăcina acestui proxy în procente și QLIKE `log(variance) + proxy / variance`, separat pentru model și fiecare reper. Scorul poate fi negativ; mai mic este mai bun. Comparăm numai același orizont și aceleași observații. Proxy-ul bazat pe închideri nu este volatilitate intraday măsurată și nu produce acuratețe de direcție.
- Verdict final: clasa congelată (declin, mixt, avans) se compară cu randamentul la +5 normalizat cu ATR inițial, cu aceleași praguri ±1 ATR. Cazurile fără clasă sunt abțineri și sunt numărate separat; acuratețea și acuratețea echilibrată folosesc numai verdicturile cu clasă. Minimum 20 asemenea observații separate pentru pragul de dovezi; multe abțineri nu îl completează. Motivele și rezumatele rămân cele din prima concluzie.
- HMM / Isolation: contextul salvat și randamentul ulterior al închiderii; nu se calculează acuratețe fără etichete externe. Mișcarea ulterioară nu demonstrează cauza anomaliei sau corectitudinea regimului.

Agregatele principale aleg cronologic orizonturi care nu se ating și nu se suprapun. Se afișează separat numărul total finalizat, pending și exclus. Sub 20 orizonturi separate: rezultat exploratoriu. Semnale descriptive prestabilite: acoperire sub 70%, lipsa avantajului față de reper; deteriorare între două blocuri consecutive de 20 dacă eroarea medianei crește cu peste 25% și 0,1 ATR, sau acuratețea scade cu peste 10 puncte procentuale. Pentru GARCH, lipsa avantajului înseamnă QLIKE cel puțin egal cu cel mai bun reper, la minimum 20 blocuri. Degradarea înseamnă că diferența de pierdere față de cel mai bun reper crește cu peste 0,1 între două blocuri de 20; nu comparăm QLIKE brut între regimuri sau orizonturi. Pentru Verdict, degradarea cere două blocuri cu câte 20 concluzii evaluate și scăderea acurateții cu peste 10 puncte. Nu sunt teste statistice și nu garantează rezultate sau profit.

## Demo și persistență

Butonul **Încarcă simularea verificării** construiește 24 orizonturi separate pe istoric fictiv pentru fiecare dintre cele șase modele, ambele orizonturi GARCH și verdict (192 înregistrări per instrument), cu estimări ilustrative prestabilite. Verdicturile includ 18 concluzii cu clasă și 6 abțineri. Sunt distincte de rezultatele modelelor antrenate în demo. Nu reprezintă observații prospective reale. Încărcarea repetată nu dublează datele.

Protocolul și cheia `holdings-forecast-v1` rămân compatibile cu cele cinci tipuri vechi; acestea nu se rescriu când se adaugă noile tipuri. ID-ul GARCH include orizontul; toate celelalte modele păstrează ID-ul `model|EOD`.

Maximum 500 înregistrări și 1,5 milioane caractere pe instrument. La limită sau la registru ilizibil, scrierea se oprește păstrând datele existente. Exportul JSON conține întregul registru, agregatele și un manifest verificat. **Backup și restaurare** permite import selectiv cu previzualizare, duplicate și conflicte, arhivarea copiei anterioare și anularea numai a estimărilor adăugate. Rezultatele importate cer reverificare publică înainte să intre în scoruri. Detalii: [HOLDINGS-FORECAST-BACKUP.md](HOLDINGS-FORECAST-BACKUP.md). Nu există ștergere automată, migrare a istoricului vechi sau sincronizare automată între dispozitive. Stocarea browserului și fișierele nu constituie dovadă criptografică a momentului predicției sau împotriva modificării locale a datelor.

## Validare

`tools/holdings-forecast.test.mjs` verifică cronologia, deduplicarea, identitatea, cinci sesiuni, revizuiri, limite, agregate și stocare. `tools/holdings-forecast-ui.test.mjs` verifică captura celor șase modele și a verdictului, excluderea driftului, demo-ul, filtrele, exportul, schimbarea contului în timpul cererii și frecvența actualizării.

`tools/holdings-forecast-garch-verdict.test.mjs` verifică orizonturile, QLIKE și reperele cu un model GARCH antrenat efectiv, abținerile, păstrarea v1, revizuirile și filtrele monitorului. `tools/holdings-verdict-ui.test.mjs` verifică finalizarea, reafișarea, reluarea și eșecul salvării.

Principii: [scikit-learn TimeSeriesSplit](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html), [regresie cu cuantile](https://scikit-learn.org/stable/modules/linear_model.html#quantile-regression). Aceste referințe descriu metode; nu validează performanța aplicației.

Metode pentru volatilitate: [documentația oficială arch](https://arch.readthedocs.io/en/latest/univariate/forecasting.html), [Patton (2011), Volatility forecast comparison using imperfect volatility proxies](https://public.econ.duke.edu/~ap172/Patton_vol_proxies_JoE_2011.pdf). Referințele descriu metode și limite ale proxy-urilor, nu validează performanța aplicației.
