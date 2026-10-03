# Trading 212 Invest — integrare numai pentru citire

Modulul se găsește în aplicație → Mai multe → Trading 212 Invest.

## Stare

Interfața și Workerul sunt implementate. Configurația publică rămâne dezactivată până când backendul privat este publicat și secretele sunt introduse de proprietar. Nu există date reale preîncărcate. Fără configurare, modulul afișează explicit că nu este conectat.

## Activare backend

1. În Trading 212 Invest generează o pereche API Key/API Secret cu permisiuni de **citire** pentru cont, portofoliu și istorice (ordine, dividende, tranzacții). Nu activa plasarea/anularea ordinelor.
2. Din rădăcina repo-ului, cu Wrangler instalat din registrul oficial npm și contul Cloudflare conectat:

```sh
npx wrangler secret put T212_API_KEY --config tools/trading212-wrangler.jsonc
npx wrangler secret put T212_API_SECRET --config tools/trading212-wrangler.jsonc
npx wrangler secret put T212_CLIENT_TOKEN --config tools/trading212-wrangler.jsonc
npx wrangler deploy --config tools/trading212-wrangler.jsonc
```

Introdu valorile numai în prompturile private Wrangler. T212_CLIENT_TOKEN este un cod aleatoriu separat de cheia brokerului, minimum 32 caractere (recomandat 32 octeți aleatorii, 64 caractere hex), generat într-un manager de parole. El permite citirea informațiilor contului; păstrează-l privat. Nu introduce nicio cheie în chat, cod, URL, GitHub sau fișiere publice.

3. Configurația pornește în `demo`. Pentru contul Invest real, setează `T212_ENV` la `live` în configurația Wrangler și publică din nou; cheia trebuie creată pentru același mediu.
4. În aplicație, introdu adresa HTTPS `*.workers.dev` publicată de Cloudflare și **codul T212_CLIENT_TOKEN**. Cheia API brokerului nu se introduce în interfață. Alternativ, după activare actualizează `app/trading212-config.json` cu `{ "enabled": true, "endpoint": "https://ADRESA-REALĂ.workers.dev" }`. Acest fișier conține numai adresa, niciodată un secret.

## Protecții și limite

- Workerul acceptă numai GET pe cinci rute fixe, și OPTIONS pentru CORS. Nu există plasare/anulare de ordine sau proxy arbitrar.
- Originea autorizată este `https://mferent80-source.github.io`. CORS nu înlocuiește autentificarea: fiecare citire verifică separat codul privat.
- API Key/Secret rămân în secretele Cloudflare. Codul de acces și datele sunt ținute în memoria paginii și eliminate la deconectare/închidere; nu se folosesc localStorage sau cache pentru cont.
- Cererile și răspunsurile de cont nu sunt logate de aplicație. Configurația Workerului dezactivează observabilitatea. Infrastructura furnizorilor poate păstra metadate conform propriilor politici.
- Istoricul se încarcă la cerere, 50 înregistrări/pagină. Limitele Trading 212 sunt respectate pe client; răspunsurile 429 afișează timpul de așteptare. Alte aplicații/dispozitive împart limita aceluiași cont.
- Sumele și monedele vin din broker. Valorile absente rămân `—`, niciodată 0 inventat. Prețul instrumentului și impactul în moneda contului sunt afișate separat.
- P&L realizat al contului vine din sumar; P&L al execuției vine din fill.walletImpact, fără a presupune că o vânzare închide integral o poziție. Tranzacțiile brokerului nu modifică automat planurile Shadow sau jurnalul manual.
- După 5 minute ecranul marchează datele neactualizate. Sincronizarea este manuală în această versiune.
- API Trading 212 este beta și acceptă Invest/Stocks ISA, nu CFD.

Documentație: https://docs.trading212.com/ și https://helpcentre.trading212.com/hc/en-us/articles/14584770928157-Trading-212-API-key

## Verificare

```sh
node --test tools/trading212.test.mjs tools/decision-app-navigation.test.mjs
```

Testele folosesc răspunsuri simulate conforme schemei oficiale; nu certifică autentificarea contului real. Pentru verificarea live sunt necesare backendul activ și cheia privată.
