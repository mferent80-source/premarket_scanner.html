# Trading 212 Invest — conectare direct din aplicație

## Pentru utilizator

Aplicație → Mai multe → Trading 212 Invest → API Key + API Secret → Conectează Trading 212. Selectează Invest real sau Demo pentru cheia respectivă. Folosește o cheie Trading 212 cu permisiuni **numai de citire** pentru cont, portofoliu și istorice.

Nu mai sunt cerute adresa backendului sau un cod separat. Cheia nu se introduce în chat, GitHub sau fișiere publice. După conectarea reușită, credențialele sunt salvate criptat AES-GCM în IndexedDB pe dispozitiv, împreună cu o CryptoKey neexportabilă; nu sunt salvate în localStorage sau în fișiere publice. Formularul este golit după conectare. La redeschidere sunt decriptate local pentru reconectare. Criptarea nu protejează împotriva scripturilor malicioase care rulează pe aceeași origine sau a accesului la sesiunea de browser. Butonul Șterge conexiunea salvată elimină cheia locală și credențialele. Transferul pe alt dispozitiv este voluntar, cu cod criptat AES-GCM și parolă PBKDF2-SHA256/600000 iterații; Sincronizarea Google PC/telefon este implementată separat, dar necesită activarea infrastructurii descrise în `tools/cloud-sync-README.md`; până atunci transferul manual rămâne disponibil. Sunt transmise prin HTTPS către releul integrării și Trading 212 la fiecare citire. Infrastructura furnizorilor poate păstra metadate potrivit propriilor politici.

## Stare actuală

Formularul și releul Trading 212 sunt publicate; `app/trading212-config.json` este activat pe Workerul `premarket-scanner-html.mferent80.workers.dev`. Utilizatorul a confirmat conectarea. Sincronizarea Google între dispozitive este încă neactivată; vezi `tools/cloud-sync-README.md`.

Trading 212 nu permite conectarea directă de pe originea GitHub Pages verificată: cererea OPTIONS pentru Authorization a răspuns 405 fără antete CORS. Un releu HTTPS este necesar, dar rămâne în afara pașilor utilizatorului.

## Activare unică de către administrator

Cu contul Cloudflare conectat, din rădăcina repository-ului:

```sh
npx wrangler deploy --config tools/trading212-wrangler.jsonc
```

Configurația folosește `T212_AUTH_MODE=session`. Nu se configurează API Key, API Secret sau un token de client în secretele serverului. Cheile sunt primite tranzitoriu, doar în antetul Authorization, niciodată în URL.

După publicare, configurează `app/trading212-config.json`:

```json
{"enabled":true,"endpoint":"https://ADRESA-REALĂ.workers.dev","directCredentials":true}
```

Folosește numai URL-ul exact al Workerului publicat și verificat. Nu activa un server necunoscut și nu pune credențiale în acest fișier. Releul autentifică fiecare cerere prin Trading 212 și nu oferă date fără o pereche validă de chei. Un cod suplimentar nu este necesar.

## Protecții și limite

- Cinci rute fixe GET: sumar, poziții, istoric ordine, dividende, mișcări de bani. Fără plasare sau anulare de ordine și fără proxy către destinații arbitrare.
- Originea autorizată: `https://mferent80-source.github.io`. Contul este cel asociat credențialelor fiecărei cereri. Nu există chei sau conturi comune păstrate de Worker.
- Credențialele și răspunsurile brokerului nu sunt logate în cod; observabilitatea Workerului este dezactivată. Răspunsurile au `Cache-Control: private, no-store`.
- Doar două destinații broker fixe, `live.trading212.com` și `demo.trading212.com`. Redirecturile upstream sunt refuzate.
- Pagini de cel mult 50 înregistrări, încărcate la cerere. 429 afișează timpul de așteptare. Alte aplicații împart limitele aceluiași cont.
- Monedele prețurilor instrumentelor și ale sumelor din cont sunt afișate separat. Valorile lipsă rămân `—`; nu sunt transformate în zero.
- P&L realizat vine numai din câmpurile oficiale ale sumarului/execuției. Nu se presupune că fiecare vânzare închide o poziție. Datele brokerului nu modifică planurile Shadow sau jurnalul manual.
- După 5 minute ecranul marchează datele neactualizate. Sincronizarea contului și pozițiilor este automată la 60 secunde, cât timp aplicația este activă.
- API-ul este beta; Invest și Stocks ISA sunt suportate, CFD nu.

App shell păstrează un iframe broker separat pentru sincronizare cât timp aplicația este deschisă și tab-ul vizibil. Browserul poate suspenda aplicația pe telefon în fundal; aceasta nu este sincronizare server 24/7.

Modul vechi compatibil: fără `T212_AUTH_MODE=session`, Workerul poate utiliza perechea de secrete server și T212_CLIENT_TOKEN pentru citire. Interfața simplă folosește exclusiv modul session.

## Verificare

```sh
node --test tools/trading212.test.mjs tools/trading212-client.test.mjs tools/decision-app-navigation.test.mjs tools/phone-install.test.mjs
```

Documentație oficială: https://docs.trading212.com/ și https://helpcentre.trading212.com/hc/en-us/articles/14584770928157-Trading-212-API-key

## Câștiguri și pierderi în pagina brokerului

Secțiunea principală grupează pozițiile deschise după P&L-ul nerealizat raportat în `walletImpact` și moneda sumelor. Cele mai mari pierderi și câștiguri sunt clicabile pentru filtrarea listei. Filtrele după nume, rezultat și monedă și sortările după P&L, variație de preț, valoare și pondere nu schimbă totalurile portofoliului. Lista afișează separat propriul subtotal; filtrele se păstrează la actualizare și se golesc la schimbarea conexiunii. Soldul și sumarul contului se află în secțiunea pliabilă de mai jos.

Variația de preț este `(currentPrice / averagePrice − 1) × 100`; revenirea la prețul mediu este `(averagePrice / currentPrice − 1) × 100` când prețul este pozitiv și sub medie. Aceste rapoarte folosesc moneda instrumentului, inclusiv GBp, fără FX sau costuri. Ponderea în cont folosește `value / summary.totalValue`, inclusiv numerarul din valoarea contului. Partea din pierderi/câștiguri folosește sumele negative/pozitive distincte în aceeași monedă, nu P&L-ul net. Nu se estimează randament total, rezultatul de azi sau momentul recuperării.

Pozițiile fără rezultat ori monedă nu devin automat zero. Dublurile aceluiași ticker și cantitățile incompatibile sunt excluse; acoperirea și diferența față de sumar sunt afișate explicit. O citire de poziții eșuată elimină vechile clasamente; sumarul lipsă nu ascunde P&L-ul unei poziții, dar lasă ponderea indisponibilă. Datele mai vechi de cinci minute sunt marcate.

„Rezultate din vânzări, pe simbol” folosește același registru verificat ca Performance Control, numai pentru scope-ul conexiunii curente. Intervalele 30/90/365 zile și moneda selectată se aplică execuțiilor SELL cu P&L raportat. Vânzările parțiale rămân execuții distincte. Istoricul parțial sau întrerupt și datele vechi sunt etichetate; alte conturi și alte medii nu sunt folosite ca fallback.

`broker/?demo=1` previzualizează numai date fictive în memorie: nu citește credențialele salvate, nu accesează releul și nu scrie snapshot-uri sau execuții. Modul Demo al brokerului conectat este distinct de acest preview. Metodologia folosește [definițiile oficiale ale pozițiilor](https://docs.trading212.com/api/positions); valorile lipsă din schema normalizată existentă nu sunt reconstruite prin schimbarea releului.

Verificare suplimentară: `tools/trading212-portfolio.test.mjs` și testele clientului verifică FX, GBp, recuperarea după −20%, monedele distincte, lipsurile, dublurile, acoperirea, izolarea contului și preview-ul fără credențiale.

Verificarea generică a contului se deschide separat, în secțiunea pliabilă „Starea verificărilor contului”, fără a împinge clasamentele sub un bloc de verdict. Preview-ul fictiv nu afișează această evaluare a contului real.
