# Acțiuni Europa

Pagina `europe-stocks/` apare separat în meniul aplicației, inclusiv în „Mai multe” pe telefon.
Pornește automat scanarea la deschidere și verifică din nou la cinci minute când este vizibilă.

Universul inițial conține 72 listări din 11 piețe: Germania, Franța, Olanda, Italia,
Spania, Regatul Unit, Elveția, Danemarca, Suedia, Finlanda și Belgia. Este o selecție
de companii; nu pretinde acoperirea tuturor acțiunilor sau disponibilitatea în broker.
Se adaugă listările europene recunoscute din Watchlist. Filtre: bursă, doar Watchlist,
simbol, companie și sector. Fiecare top are maximum zece rezultate și trei din același sector.

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

Rezultatele folosesc o cheie locală separată (`tt_europe_scan_v1`), fără suprascrierea
scanărilor comune, jurnalului sau setărilor de sincronizare. Pe pagina Europa se poate
adăuga sau elimina o acțiune din Watchlist și deschide graficul sursei.

Validare: teste pentru monede/GBX, indice și dată, separarea categoriilor, lipsa datelor,
Governor, diversificarea topurilor, navigare și active locale; verificare vizuală pe telefon și PC.
