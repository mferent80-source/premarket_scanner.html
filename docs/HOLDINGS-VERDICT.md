# Verdict AI pentru o deținere

Selectarea explicită a unei poziții, inclusiv navigarea anterior/următor, deschide dialogul Verdict AI și pornește analiza. Cardul păstrează un buton Verdict AI. Încărcarea portofoliului nu antrenează automat toate deținerile. Legăturile către registrele predicțiilor păstrează accesul direct la registru.

Dialogul verifică o singură sursă OHLC EOD de maximum cinci ani, instrumentul, moneda, sesiunea și închiderea. Actualizează analiza tehnică a acelei poziții. Aceleași observații ajung succesiv la Neural + Gradient Boosting, HMM, Isolation Forest și Regresie cu cuantile. Workers primesc numai barele publice, momentul și ID-ul temporar; nu primesc date broker, cantități, chei sau identificatorul contului. Un eșec individual este afișat și permite celorlalte modele să termine.

Rezultatele recente pot fi reutilizate numai după verificarea versiunii, raportului valid, instrumentului, monedei, sesiunii, ultimei observații, închiderii și programului bursei și amprentei întregului istoric OHLCV. Limita este 30 de minute; Reanalizează toate ocolește reutilizarea. Demo rulează pe un singur istoric fictiv comun, inclusiv Isolation Forest, și păstrează rezultatele în memorie.

## Concluzie

Sunt necesare cinci rezultate actuale. Neural și Gradient Boosting trebuie să aibă avantaj istoric repetat și clase compatibile. Mediana cuantilelor trebuie să aibă validare descriptivă și aceeași clasă: mișcare de cel puțin +1 ATR = avans, cel mult −1 ATR = declin, altfel mixt. HMM trebuie să aibă un regim descriptiv care nu contrazice direcția; Isolation trebuie să descrie o observație obișnuită. Aceste două modele oferă context și nu votează prețul.

Datele lipsă sau erorile produc verdict incomplet. Lipsa avantajului, validarea slabă sau drift produc verdict neconcludent. Estimările incompatibile produc semnale contradictorii; o anomalie sau clasificare de graniță cere prudență. Nu se însumează probabilități sau voturi și nu se calculează încredere de profit. Orizontul este închiderea la +5 sesiuni, iar știrile, earnings, costurile și riscul portofoliului sunt evaluate separat. Nu se execută ordine.

Închiderea, Escape, Oprește analiza și schimbarea contului, simbolului, monedei, sesiunii sau prețului EOD anulează lucrul deținut de dialog. Mesajele întârziate nu pot actualiza alt context. O analiză manuală deja activă nu este oprită de dialog; este cerută reluarea după finalizarea ei.

Demo funcțional cu verificare desktop/390 px: `tools/holdings-verdict-demo.html`. Teste: `holdings-verdict`, `holdings-model-runner`, `holdings-verdict-managed` și suitele existente pentru UI/model.
