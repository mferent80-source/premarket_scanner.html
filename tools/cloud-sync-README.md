# PC ↔ telefon — activare Google și sincronizare

## Stare la publicare

Codul, interfața și testele sunt implementate. Configurația aplicației păstrează `enabled:false`, cu `autoActivate:true`: sincronizarea devine disponibilă când `/api/cloud/status` confirmă protocolul, Google, criptarea, bindingul și schema D1. Nicio sesiune, înregistrare sau cheie Trading 212 nu este trimisă în această verificare. Protocolul actual include și istoricul semnalelor Europa și setările de risc.

### Publicare automată din GitHub

`wrangler.toml` din rădăcină publică `tools/cloud-sync-worker.mjs` în Workerul **premarket-scanner-html**, cu rutele Google și releul Trading 212 împreună. În Cloudflare → Worker → Settings → Build, rădăcina proiectului este rădăcina repo, iar comanda de deploy este `npx wrangler deploy --config wrangler.toml`. Bindingul `CLOUD_DB` este declarat explicit către baza existentă `trading-tools-sync`, ID `e3c26a28-a937-4b13-baa4-4b9befdd202c`. `keep_vars:true` păstrează variabilele din dashboard, iar Wrangler păstrează secretele existente la deploy. Nu creează o altă bază și nu schimbă cheia de criptare.

`tools/cloud-sync-wrangler.jsonc` oferă aceeași configurație și același ID D1 pentru deploy explicit cu `--config`. Deploy-ul atașează baza existentă prin `CLOUD_DB`, inclusiv dacă legătura lipsea din dashboard. Schema SQL, `GOOGLE_CLIENT_ID`, `CLOUD_ENCRYPTION_KEY` și modul Trading 212 trebuie configurate la prima instalare. La o instalare în alt cont, actualizează numele și ID-ul D1 în ambele fișiere.

Configurația veche a proxy-ului de piață **tt-proxy**, inclusiv data de compatibilitate și triggerul declarat, este păstrată separat în `tools/cf-proxy-wrangler.toml`. Publicarea lui este explicită: `npx wrangler deploy --config tools/cf-proxy-wrangler.toml --keep-vars`. Deploy-ul implicit al serviciului Google nu publică proxy-ul de piață.

### Pachet pregătit pentru Cloudflare Dashboard

`tools/cloud-sync-worker.bundle.mjs` este Workerul într-un singur fișier, cu releul Trading 212 și validările incluse. Poate înlocui codul din **Edit code** al Workerului existent `premarket-scanner-html`; nu are importuri externe și nu conține secrete. `tools/cloud-sync-schema.sql` conține numai creări idempotente de tabele/indexuri. Înainte de publicare, păstrează variabilele, secretele și rutele Workerului existent.

1. Creează baza D1 `trading-tools-sync` în același cont Cloudflare; în Console aplică schema SQL.
2. În Worker → Bindings, adaugă un binding D1 numit exact `CLOUD_DB` la această bază. Nu reutiliza o bază a unui alt proiect.
3. Configurează clientul Google descris mai jos. În Worker → Settings → Variables and Secrets, adaugă `GOOGLE_CLIENT_ID` și `CLOUD_ENCRYPTION_KEY` ca secrete. Păstrează cheia de criptare existentă dacă a fost creată anterior; nu o regenera la o republicare. `T212_AUTH_MODE` trebuie să păstreze modul de autentificare al releului existent.
4. Publică pachetul Worker. Verifică `/api/cloud/status` cu originea aplicației; trebuie să întoarcă protocolul `tt-cloud-sync-v1`, `enabled:true` și toate cele patru verificări adevărate.
5. În aplicație → Cont & sincronizare → **Reverifică serviciul**, apoi conectează același cont Google pe PC și telefon. Nu este necesară o nouă publicare a aplicației după configurarea serverului.

Pachetul se reconstruiește local, fără instalarea unor dependențe:

```sh
node tools/cloud-sync-bundle.mjs
node tools/cloud-sync-bundle.mjs --check
```

## Configurare unică de administrator

1. În Google Cloud → Google Auth Platform, configurează branding/audience și creează un client **Web application**. Authorized JavaScript origins: `https://mferent80-source.github.io`. Se folosește Google Identity Services cu callback JavaScript, nu redirect OAuth server; nu este necesar un client secret Google. În modul Testing, adaugă contul folosit pe PC și telefon la test users. Permisiuni: identitate Google (`openid`, email), fără Drive/Gmail.
2. În Cloudflare Dashboard creează `trading-tools-sync` numai dacă nu există deja. Aplică `tools/cloud-sync-schema.sql` în consola bazei și leagă baza la Worker prin bindingul **CLOUD_DB**. La o republicare păstrează baza existentă.
3. Numele Workerului din ambele configurații este `premarket-scanner-html`. Modul releului existent trebuie păstrat; pentru credențiale furnizate de aplicație, configurează `T212_AUTH_MODE=session` în dashboard.
4. Configurează Client ID Google și cheia de criptare **ca secrete ale Workerului**, nu în GitHub. Comenzile următoare sunt pentru prima configurare; la o republicare execută numai deploy, fără a regenera cheia:

```sh
npx wrangler secret put GOOGLE_CLIENT_ID
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))" | npx wrangler secret put CLOUD_ENCRYPTION_KEY
npx wrangler deploy
```

**Generează cheia de criptare o singură dată.** Păstrează o copie în managerul tău de secrete; schimbarea ei face înregistrările existente imposibil de decriptat fără migrare. Nu introduce API Key/Secret Trading 212 în comenzi sau fișiere. Acestea sunt preluate din conexiunea salvată numai după autentificarea în aplicație.

5. Verifică, fără chei Trading 212:

```sh
curl -H 'Origin: https://mferent80-source.github.io' https://premarket-scanner-html.mferent80.workers.dev/api/cloud/status
```

Rezultatul trebuie să aibă `enabled:true` și Client ID-ul corect. Testează și citirea Trading 212 cu integrarea existentă, ca să nu regreseze releul.
6. În aplicație → Cont & sincronizare → **Reverifică serviciul** → același cont Google pe PC și telefon. `autoActivate:true` permite conectarea doar când serverul a trecut verificările, fără o republicare a aplicației. Prima conectare importă datele existente; diferențele incompatibile cer alegere, fără suprascriere silențioasă. Pentru oprirea completă a verificării/sincronizării setează ambele opțiuni `enabled:false` și `autoActivate:false`.
7. Opțional, după prima conectare, limitează proiectul la identitatea proprie cu `GOOGLE_ALLOWED_SUB` (Google `sub`, nu emailul). Copiază identificatorul numai în configurația privată a serverului. Datele sunt separate după `sub` chiar și fără această limitare.

## Modelul de sincronizare

- Doar o listă explicită de chei: jurnal manual/setări, execuții și snapshot broker, teze/tickere/benchmark, watchlist, temă, selecție cont, conexiune broker, istoric semnale Europa și setări calculator risc Europa. Nu se trimit toate datele localStorage, alte API keys sau cache-uri de piață.
- Registrele și modelele AI stocate separat în IndexedDB nu sunt incluse în acest protocol. Exporturile lor rămân disponibile în Analiza deținerilor; transferul lor cloud cere integrarea registrelor cu păstrarea estimărilor originale și a verificărilor.
- Europa: observațiile distincte se unesc după ID; aceeași primă sesiune păstrează prețul, categoria și suportul originale. Actualizările folosesc data sesiunii, nu ora dispozitivului; randamentele deja calculate se păstrează. Reviziile prețului suspendă randamentele. Episoadele suprapuse, valori diferite pentru același rezultat sau depășirea limitei de 1.500 cer alegere. Setările de risc se aleg ca un pachet, fără a combina bugetul unui dispozitiv cu limita celuilalt.
- Serverul anunță `supportedKeys`; un Worker anterior nu primește noile chei Europa, iar datele rămân locale. După publicarea pachetului actual, **Reverifică serviciul** activează și aceste chei.
- Trei variante pentru reconciliere: ultima variantă acceptată, dispozitivul curent, serverul. Editările independente se combină; editările incompatibile sunt oprite și prezentate cu previzualizări și alegere explicită.
- Revizia serverului este verificată atomic în D1. 409 amână reconcilierea; nu folosește un overwrite forțat.
- Snapshot-urile brokerului folosesc `fetchedAt` al sursei. Listele de execuții se unesc după ID; valori diferite ale aceleiași execuții cer revizuire. Cheia și secretul nu se combină separat din două versiuni diferite.
- Asocierea cu contul Google este păstrată în stocarea privată criptată înainte de orice upload. Marcajul localStorage rămâne compatibil cu versiunile vechi; cota lui plină nu poate anula asocierea sau permite amestecarea altui cont.
- Până la cinci copii locale înainte de aplicarea datelor cloud. Acestea, sesiunea și baza reconcilierii sunt criptate AES-GCM în IndexedDB pe dispozitiv. Restaurarea permite recuperarea datelor locale; următorul sync verifică din nou diferențele.
- Poll la 30 secunde cât timp app este vizibilă; reconectare la revenire online/în prim-plan. Fără scanare broker server 24/7 și fără promisiune de execuție în fundal pe telefon.
- Google sign-out revocă sesiunea acestui dispozitiv; jurnalul local și conexiunea broker locală rămân. Sesiunea aplicației expiră în 30 zile și atunci cere Google din nou.
- Ștergerea cheii cloud produce o înregistrare null care împiedică alte dispozitive să o republice automat. Copiile lor locale nu se șterg de la distanță. Pentru invalidarea completă revocă cheia în Trading 212. Republicarea este explicită: „Salvează conexiunea curentă în cloud”.

## Protecții

- Google token verificat criptografic RS256, JWKS Google, `aud`, `iss`, `exp`, `iat`, `email_verified`, nonce server unic cu expirare 5 minute, consum atomic. Identitatea este exclusiv `sub` verificat.
- Origine CORS fixă, JSON numai, token bearer în antet, niciodată URL, fără cookies cross-site. Session tokens random 256-bit; doar hash SHA-256 pe server, revocare și expirare. Nicio credențială în logurile codului, observabilitatea Workerului dezactivată.
- Înregistrări AES-GCM cu o cheie server 256-bit, IV random și AAD care leagă Google sub, cheia înregistrării și revizia. Același server decriptează și livrează datele dispozitivelor autentificate: **nu este end-to-end encryption**. Administratorul infrastructurii și scripturile compromise de aceeași origine pot accesa datele; criptarea at-rest nu rezolvă aceste amenințări.
- Max 1 MB/înregistrare, chei fixe, respingere proprietăți prototype. Limită login 20 cereri/min/IP hash, 120 cereri/min/sesiune. Clientul serializează sync per dispozitiv și revizia server protejează concurența între dispozitive.
- Rutele brokerului delegă releul existent, doar GET către cele cinci destinații fixe, fără ordine de tranzacționare.

## Teste

```sh
node --test tools/cloud-sync.test.mjs tools/cloud-sync-client.test.mjs tools/cloud-sync-bundle.test.mjs tools/cloud-sync-devices.test.mjs tools/cloud-sync-europe.test.mjs tools/trading212.test.mjs tools/trading212-vault.test.mjs tools/app-version.test.mjs tools/decision-app-navigation.test.mjs
```

Surse oficiale folosite pentru implementare:
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- https://developers.google.com/identity/gsi/web/reference/js-reference
- https://developers.cloudflare.com/d1/worker-api/
- https://developers.cloudflare.com/workers/configuration/secrets/
