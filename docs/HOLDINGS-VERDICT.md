# Verdict AI pentru o deținere

Selectarea explicită a unei poziții, inclusiv navigarea anterior/următor, deschide dialogul Verdict AI și pornește analiza. Cardul păstrează un buton Verdict AI. Încărcarea portofoliului nu antrenează automat toate deținerile. Legăturile către registrele predicțiilor păstrează accesul direct la registru.

Dialogul verifică o singură sursă OHLC EOD de maximum cinci ani, instrumentul, moneda, sesiunea și închiderea. Actualizează analiza tehnică a acelei poziții. Aceleași observații ajung succesiv la Neural + Gradient Boosting, HMM, Isolation Forest, Regresie cu cuantile și GARCH(1,1). Workers primesc numai barele publice, momentul și ID-ul temporar; nu primesc date broker, cantități, chei sau identificatorul contului. Un eșec individual este afișat și permite celorlalte modele să termine.

Rezultatele recente pot fi reutilizate numai după verificarea versiunii, raportului valid, instrumentului, monedei, sesiunii, ultimei observații, închiderii și programului bursei și amprentei întregului istoric OHLCV. Limita este 30 de minute; Reanalizează toate ocolește reutilizarea. Demo rulează pe un singur istoric fictiv comun, inclusiv Isolation Forest, și păstrează rezultatele în memorie.

## Concluzie

Sunt necesare șase rezultate actuale. Neural și Gradient Boosting trebuie să aibă avantaj istoric repetat și clase compatibile. Mediana cuantilelor trebuie să aibă validare descriptivă și aceeași clasă: mișcare de cel puțin +1 ATR = avans, cel mult −1 ATR = declin, altfel mixt. HMM trebuie să aibă un regim descriptiv care nu contrazice direcția; Isolation trebuie să descrie o observație obișnuită. Aceste două modele oferă context și nu votează prețul.

GARCH estimează volatilitatea cumulată la 5 și 20 de sesiuni. Nu votează direcția. Numai după avantaj istoric repetat față de varianța constantă și EWMA, volatilitatea ridicată adaugă prudență, păstrând clasa direcției. Rezultatul GARCH exploratoriu, limitat sau în drift este explicat fără să modifice concluzia celorlalte modele. Lipsa sau invaliditatea raportului GARCH păstrează verdictul incomplet. Protocol: `docs/HOLDINGS-GARCH.md`.

Datele lipsă sau erorile produc verdict incomplet. Lipsa avantajului, validarea slabă sau drift produc verdict neconcludent. Estimările incompatibile produc semnale contradictorii; o anomalie sau clasificare de graniță cere prudență. Nu se însumează probabilități sau voturi și nu se calculează încredere de profit. Orizontul este închiderea la +5 sesiuni, iar știrile, earnings, costurile și riscul portofoliului sunt evaluate separat. Nu se execută ordine.

Închiderea, Escape, Oprește analiza și schimbarea contului, simbolului, monedei, sesiunii sau prețului EOD anulează lucrul deținut de dialog. Mesajele întârziate nu pot actualiza alt context. O analiză manuală deja activă nu este oprită de dialog; este cerută reluarea după finalizarea ei.

Demo funcțional cu verificare desktop/390 px: `tools/holdings-verdict-demo.html`. Teste: `holdings-verdict`, `holdings-model-runner`, `holdings-verdict-managed` și suitele existente pentru UI/model.

Rapoartele finalizate sau reutilizate care nu mai trec verificarea apar cu „Reanalizează”, nu „În așteptare”. Cardul precizează motivul: expirare, istoric schimbat, alt EOD, instrument, monedă, închidere, versiune sau verificare eșuată. Mesajul real al unui Worker eșuat este păstrat; excepțiile interne ale validării nu sunt afișate. Un status de succes nu conține un mesaj generic de eroare. Reutilizarea unui Forest temporar păstrează avertismentul despre retenția numai în sesiunea curentă.

## Urmărirea concluziei finale

După încheierea analizei cu 6/6 rezultate acceptate, dialogul păstrează automat primul verdict pe instrument și EOD în Predicții vs. realitate: titlu, clasă sau abținere, motive, șase rezumate și amprenta sursei comune. Reafișarea și reanalizarea nu înlocuiesc prima concluzie. Un verdict incomplet sau o analiză oprită nu se salvează. Captura respectă limita prospectivă conservatoare și verificarea identității/EOD; o eroare de stocare rămâne explicită și nu invalidează rezultatul calculat.

La +5 închideri efective, clasa se compară cu mișcarea normalizată prin ATR inițial. Concluziile weak, conflict și caution sunt abțineri, excluse din acuratețe și numărate separat. Nu sunt convertite retroactiv în predicții. Registrul și monitorul cer minimum 20 concluzii evaluate pe orizonturi separate pentru pragul de dovezi. Detalii: [HOLDINGS-FORECAST.md](HOLDINGS-FORECAST.md).
