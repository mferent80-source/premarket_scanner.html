# Trading 212 Invest — conectare direct din aplicație

## Pentru utilizator

Aplicație → Mai multe → Trading 212 Invest → API Key + API Secret → Conectează Trading 212. Selectează Invest real sau Demo pentru cheia respectivă. Folosește o cheie Trading 212 cu permisiuni **numai de citire** pentru cont, portofoliu și istorice.

Nu mai sunt cerute adresa backendului sau un cod separat. Cheia nu se introduce în chat, GitHub sau fișiere publice. Nu se salvează în localStorage, sessionStorage, cookie-uri sau IndexedDB. Formularul este golit după conectare, iar credențialele sunt ținute doar în memoria paginii până la deconectare/închidere. Sunt transmise prin HTTPS către releul integrării și Trading 212 la fiecare citire. Infrastructura furnizorilor poate păstra metadate potrivit propriilor politici.

## Stare actuală

Formularul și releul sunt implementate și testate cu răspunsuri simulate. Releul online nu este încă publicat. `app/trading212-config.json` rămâne dezactivat, iar câmpurile sunt blocate până la activare. Nu introduce cheia deocamdată. Nu au fost importate date reale.

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
- După 5 minute ecranul marchează datele neactualizate. Sincronizarea este manuală.
- API-ul este beta; Invest și Stocks ISA sunt suportate, CFD nu.

Modul vechi compatibil: fără `T212_AUTH_MODE=session`, Workerul poate utiliza perechea de secrete server și T212_CLIENT_TOKEN pentru citire. Interfața simplă folosește exclusiv modul session.

## Verificare

```sh
node --test tools/trading212.test.mjs tools/trading212-client.test.mjs tools/decision-app-navigation.test.mjs tools/phone-install.test.mjs
```

Documentație oficială: https://docs.trading212.com/ și https://helpcentre.trading212.com/hc/en-us/articles/14584770928157-Trading-212-API-key
