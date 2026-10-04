# Predicții vs. realitate

Registru prospectiv local, separat de testele retrospective și de sintezele păstrate manual. Se află în **Analiza deținerilor → Modele AI → Predicții vs. realitate**.

## Captură

După finalizarea unui model se salvează automat prima estimare pe instrument, monedă, model și sesiune EOD. Butonul manual poate salva rezultatele actuale existente. Registrul are o cheie distinctă pentru cont, ticker broker, simbol de piață, monedă și tipul datelor. Demo-ul folosește numai memorie.

Estimările conțin versiunea modelului, momentul antrenării și al salvării, timestampul barei de origine, fusul bursei, închiderea și ATR inițial, estimarea și reperul fixat. Fără cantități, solduri, chei API sau ponderi antrenate. Modelele blocate de drift/disagreement nu sunt capturate ca predicții de direcție; rezultatele fără avantaj istoric pot fi urmărite, cu starea lor explicită.

Reantrenarea nu suprascrie primul rezultat, nici dacă aplicația schimbă versiunea modelului. Numai modelele recente, compatibile și legate de sesiunea verificată pot produce o înregistrare. Rezultatele Neural vechi fără metadata sursei nu se importă retrospectiv. Captura este refuzată de la începutul următoarei zile lucrătoare în fusul bursei, chiar înainte de deschidere; este o regulă conservatoare, care poate refuza și o zi de sărbătoare. Data actuală trebuie să corespundă sesiunii EOD așteptate.

## Verificare

La deschiderea filei Modele AI pentru o deținere cu estimări mai vechi decât EOD disponibil, verificarea solicită o singură dată pe sesiune o serie publică de până la cinci ani, fără cache. Butonul **Verifică rezultatele** permite reîncercarea. Nu există monitorizare când aplicația este închisă. Schimbarea contului, monedei, instrumentului sau EOD pe durata cererii anulează folosirea răspunsului.

`DailySeries.read` verifică identitatea, moneda, programul și sesiunea încheiată. Rezultatul este a cincea bară zilnică după timestampul de origine, nu cinci zile calendaristice și nu închiderea cea mai recentă. Înainte de cinci bare: pending. Dacă sursa nu poate confirma originea, a revizuit prețurile, are bare duplicate, un salt zilnic peste 25% sau un gol de peste șapte zile: neverificabil, exclus din agregate.

Prima închidere finalizată și cele cinci timestampuri/prețuri sunt păstrate. Revizuirea ulterioară nu schimbă rezultatul; îl exclude până când o verificare poate confirma din nou aceleași date. O eroare de rețea păstrează ultimul raport și afișează imposibilitatea actualizării. Ajustările mici și barele intermediare omise pot rămâne nedetectate; calendarul bursier complet nu este implementat.

## Măsuri separate

- Neural / Boosting: clasă după randamentul închiderii împărțit la ATR inițial, praguri ≤−1 / între / ≥1. Reperul este clasa majoritară din antrenare. Acuratețea echilibrată lipsește când nu sunt reprezentate toate clasele.
- Cuantile: acoperire inclusivă, eroare absolută a medianei și scor de interval pentru ținta nominală 80%, toate erorile normalizate cu ATR inițial. Reperul este intervalul cuantilelor istorice cu ajustarea proprie, înghețat la salvare.
- HMM / Isolation: contextul salvat și randamentul ulterior al închiderii; nu se calculează acuratețe fără etichete externe. Mișcarea ulterioară nu demonstrează cauza anomaliei sau corectitudinea regimului.

Agregatele principale aleg cronologic orizonturi care nu se ating și nu se suprapun. Se afișează separat numărul total finalizat, pending și exclus. Sub 20 orizonturi separate: rezultat exploratoriu. Semnale descriptive prestabilite: acoperire sub 70%, lipsa avantajului față de reper; deteriorare între două blocuri consecutive de 20 dacă eroarea medianei crește cu peste 25% și 0,1 ATR, sau acuratețea scade cu peste 10 puncte procentuale. Nu sunt teste statistice și nu garantează rezultate sau profit.

## Demo și persistență

Butonul **Încarcă simularea verificării** construiește 24 orizonturi separate pe istoric fictiv, cu estimări ilustrative prestabilite. Sunt distincte de rezultatele celor cinci modele antrenate în demo. Nu reprezintă observații prospective reale. Încărcarea repetată nu dublează datele.

Maximum 500 înregistrări și 1,5 milioane caractere pe instrument. La limită sau la registru ilizibil, scrierea se oprește păstrând datele existente. Exportul JSON conține întregul registru și agregatele. Nu există import, ștergere automată, migrare a istoricului vechi sau sincronizare între dispozitive. Stocarea browserului nu constituie dovadă criptografică împotriva modificării locale a datelor.

## Validare

`tools/holdings-forecast.test.mjs` verifică cronologia, deduplicarea, identitatea, cinci sesiuni, revizuiri, limite, agregate și stocare. `tools/holdings-forecast-ui.test.mjs` verifică captura celor cinci modele, excluderea driftului, demo-ul, filtrele, exportul, schimbarea contului în timpul cererii și frecvența actualizării.

Principii: [scikit-learn TimeSeriesSplit](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html), [regresie cu cuantile](https://scikit-learn.org/stable/modules/linear_model.html#quantile-regression). Aceste referințe descriu metode; nu validează performanța aplicației.
