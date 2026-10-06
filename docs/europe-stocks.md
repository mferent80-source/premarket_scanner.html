# Acțiuni Europa

Pagina `europe-stocks/` apare separat în meniul aplicației, inclusiv în „Mai multe” pe telefon.
Pornește automat scanarea la deschidere și verifică din nou la cinci minute când este vizibilă.

Universul folosește PDF-ul Salt Bank furnizat de utilizator, consultat la 6 octombrie 2026:
https://salt.bank/storage/app/efsfiles/media/investitii/Lista%20intrumente%20disponibile%20pentru%20tranzactionare.pdf

Documentul are 17 pagini și 572 de ISIN-uri distincte: 370 Common Stock, 166 ETF,
10 ETN și 26 ETC. Cele 208 acțiuni cu jurisdicție europeană sunt păstrate în
`salt-list.js`, cu ISIN, denumirea sursei, tip, jurisdicție și pagina PDF. Numai
rândurile cu o listare europeană mapată sunt scanate (204 acțiuni pe 10 piețe); excluderile au motiv explicit
în „Acoperire”. Identitatea sursei include hash-ul PDF-ului și al corespondențelor.
PDF-ul nu indică bursa de execuție sau moneda disponibilă în Salt Bank. Același
ISIN se poate tranzacționa pe mai multe burse; cotația scannerului reprezintă bursa
mapată și trebuie comparată cu instrumentul din aplicația băncii după ISIN.

Corespondențele provin din căutarea Yahoo Finance după ISIN; cazurile în care
rezultatul indică altă piață sunt verificate separat în sursele emitentului sau
bursei. Sectorul provine din metadatele Yahoo și este tradus. Jurisdicția emitentului
și țara bursei sunt câmpuri distincte, de exemplu Airbus: NL / Paris. Clasele
ordinare și preferențiale rămân instrumente distincte, fără deduplicare pe companie.

Filtre: bursă, Watchlist ∩ Salt Europa, simbol, companie, ISIN și sector. Watchlist-ul
personal nu este modificat de filtrare. Simbolurile arbitrare și acțiunile din afara
PDF-ului nu extind universul. Fiecare top are maximum zece rezultate și trei din
același sector.

Cele patru categorii sunt distincte:

- **În creștere:** preț peste EMA21, EMA21 peste EMA50, randament 20 sesiuni pozitiv,
  RSI 50–72, extensie maximum 6%, forță relativă pozitivă față de indicele bursei.
- **Early Long:** structura early a motorului MEB după pullback, fără o scădere de 20%
  față de maximul disponibil, EMA21 aproape de EMA50; semnal de monitorizare.
- **Reversal:** scădere de minimum 20%, structură MEB confirmată, revenire 2–30%
  față de minimul de 60 sesiuni și extensie limitată față de EMA21.
- **Early Reversal:** scădere de minimum 20%, structură MEB early, revenire 1–15%
  față de minimul de 60 sesiuni; semnal de monitorizare.

Se reutilizează D.fetchStock, DailySeries, TI și MEB. Barele din sesiunea deschisă
sunt eliminate înainte de calcul. Identitatea, moneda și data sesiunii se verifică;
seriile vechi sau necorespunzătoare sunt excluse și raportate. Calendarul sărbătorilor
nu este modelat: absența sesiunii așteptate exclude seria chiar dacă este sărbătoare.
RS folosește un indice local cu aceeași dată. Nu există date fictive în scanarea reală.

Cotațiile GBX sunt convertite în GBP pentru toate prețurile, ATR, nivelurile și rulajul.
Pragurile de rulaj sunt politici în moneda locală, nu conversii FX: EUR 3m, GBP 2,5m,
CHF 3m, DKK 22m, SEK 30m. Prețurile europene nu sunt introduse în planul USD din Desk.
Nivelurile ATR afișate sunt repere tehnice; earnings nu este verificat automat.
Governor și lipsa indicelui sunt afișate separat. Scorul nu este o probabilitate.

Rezultatele folosesc o cheie locală separată (`tt_europe_scan_v2`), fără suprascrierea
scanărilor comune, jurnalului sau setărilor de sincronizare. Cache-ul include
identitatea documentului, lista filtrată și ISIN-ul fiecărui rezultat; rezultatele
anterioare selecției Salt nu sunt reutilizate. Pe pagina Europa se poate
adăuga sau elimina o acțiune din Watchlist și deschide graficul sursei.

Validare: teste pentru monede/GBX, indice și dată, separarea categoriilor, lipsa datelor,
Governor, diversificarea topurilor, integritatea ISIN-urilor, clasele de acțiuni,
apartenența Watchlist și izolarea cache-ului, navigare și active locale; verificare vizuală pe telefon și PC.
