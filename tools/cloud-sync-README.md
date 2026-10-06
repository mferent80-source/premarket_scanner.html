# PC ↔ telefon — activare Google și sincronizare

## Stare la publicare

Codul, interfața și testele sunt implementate. **Serviciul nu este activat online.** Verificarea din 6 octombrie 2026 a primit `not_found` de la `/api/cloud/status`: Workerul public nu include încă rutele cloud. Configurația păstrează `enabled:false`, cu `autoActivate:true` pentru o verificare anonimă de disponibilitate. Nicio sesiune, înregistrare sau cheie Trading 212 nu este trimisă în această verificare. Sincronizarea devine disponibilă numai după ce serverul confirmă protocolul, Google, criptarea, bindingul și schema D1. Publicarea GitHub Pages nu creează aceste resurse.

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
2. În mediul tău autentificat Cloudflare, din rădăcina repo:

```sh
npx wrangler d1 create trading-tools-sync
```

3. Copiază ID-ul bazei create în `tools/cloud-sync-wrangler.jsonc` în locul `REPLACE_WITH_CREATED_DATABASE_ID`. Numele Workerului este cel deja folosit pentru Trading 212: `premarket-scanner-html`.
4. Aplică schema, apoi configurează Client ID Google și cheia de criptare **ca secrete ale Workerului**, nu în GitHub:

```sh
npx wrangler d1 execute trading-tools-sync --remote --file tools/cloud-sync-schema.sql --config tools/cloud-sync-wrangler.jsonc
npx wrangler secret put GOOGLE_CLIENT_ID --config tools/cloud-sync-wrangler.jsonc
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))" | npx wrangler secret put CLOUD_ENCRYPTION_KEY --config tools/cloud-sync-wrangler.jsonc
npx wrangler deploy --config tools/cloud-sync-wrangler.jsonc --keep-vars
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

- Doar o listă explicită de chei: jurnal manual/setări, execuții și snapshot broker, teze/tickere/benchmark, watchlist, temă, selecție cont și conexiune broker. Nu se trimit toate datele localStorage, alte API keys sau cache-uri de piață.
- Registrele și modelele AI stocate separat în IndexedDB nu sunt incluse în acest protocol. Exporturile lor rămân disponibile în Analiza deținerilor; transferul lor cloud cere integrarea registrelor cu păstrarea estimărilor originale și a verificărilor.
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
node --test tools/cloud-sync.test.mjs tools/cloud-sync-client.test.mjs tools/cloud-sync-bundle.test.mjs tools/cloud-sync-devices.test.mjs tools/trading212.test.mjs tools/trading212-vault.test.mjs tools/app-version.test.mjs tools/decision-app-navigation.test.mjs
```

Surse oficiale folosite pentru implementare:
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- https://developers.google.com/identity/gsi/web/reference/js-reference
- https://developers.cloudflare.com/d1/worker-api/
- https://developers.cloudflare.com/workers/configuration/secrets/
