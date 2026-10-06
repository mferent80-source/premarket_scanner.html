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

Filtre: bursă, Watchlist ∩ Salt Europa, sector, stare semnal, simbol, companie și ISIN.
Ordinea poate folosi scorul, forța relativă, RVOL sau distanța de confirmare. Watchlist-ul
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
Planul structural folosește maximul celor 10 sesiuni precedente + 0,05 ATR ca
prag, o zonă până la +0,5 ATR, ultimul pivot low confirmat cu două bare în fiecare
parte (sau minimul ultimelor 10 sesiuni) ca suport și un stop cu tampon de 0,25 ATR.
Ținta este următoarea rezistență confirmată deasupra zonei de intrare; fără
rezistență, ținta și R/R rămân necunoscute. Prețul peste zonă este „extins”.
Governor și lipsa indicelui sunt afișate separat. Criteriile semnalului și depășirea
pragului de intrare sunt verificări distincte. Scorul arată fiecare contribuție
și ajustarea fixă −5; nu este o probabilitate. Graficul ultimelor 90 sesiuni arată
prețul, EMA21/50, pragul, stopul și rezistența, cu un cursor pentru explorare.

Contextul este calculat din toate seriile verificate ale filtrului de scanare,
inclusiv acțiuni fără semnal. Numai data modală a sesiunii intră în agregare.
Procentele peste EMA21/50 și în creștere au ponderi egale, fără pretenția de a
reprezenta toată piața europeană. Bursele și sectoarele arată numărul de acțiuni;
sub 5 este un eșantion mic. Favorabil: ≥60% peste EMA50 și ≥50% în creștere;
defensiv: <40% peste EMA50; sub 80% acoperire: context parțial.

Calculatorul separat Europa folosește monedele EUR, USD, GBP, CHF, DKK și RON.
`finance.js` citește referințele zilnice BCE prin endpoint-ul provider ECB al
Frankfurter v2, verifică toate perechile și aceeași dată, apoi calculează cross-rate.
Cursurile vechi de peste 5 zile sau neverificate de peste 6 ore sunt respinse.
Bugetul, riscul și costurile totale estimate sunt introduse manual. Cantitatea
este limitată simultan de buget și de pierderea până la stop, rotunjită în jos
la 1 sau 0,001. Fracțiunile trebuie permise de instrumentul din bancă. FX este
constant în scenariu; execuția, spread-ul, gap-urile și slippage-ul nu sunt garantate.
Valorile bugetului nu sunt transmise la API; setările folosesc doar cheia locală
`tt_europe_risk_settings_v1`. Nu se creează ordine sau execuții în jurnal.

Calendarul `calendar.json` păstrează simbolul și ISIN-ul exact din univers, URL-ul
public Yahoo al instrumentului, data verificării, datele viitoare și flag-ul
`isEarningsDateEstimate`. Generatorul `tools/europe-calendar.py` citește datele
structurate în paginile publice, fără autentificare sau inferențe din sfârșitul
trimestrului. Flag false + dată unică: confirmată de sursă; flag true sau interval:
estimată; fără flag: confirmare neprecizată; lipsa datei/erorile: necunoscută.
Calendarul de peste 5 zile rămâne vizibil ca vechi și necesită reverificare.
Raportările în maximum 7 zile au avertizare de gap. Workflow-ul
`europe-calendar.yml` actualizează snapshot-ul în zilele lucrătoare și la cerere;
pagina citește versiunea publică din `main` (fallback la copia locală), astfel încât
actualizarea datelor nu depinde de un push care să redeclanșeze deploy-ul Pages.
Snapshot-ul este reverificat la o oră. Calendarul poate avea acoperire parțială.

Istoricul `tt_europe_signals_v1` este separat de jurnalul real. Prima scanare
înregistrează prospectiv candidații; scanările repetate în aceeași sesiune nu
dublează observațiile. Early → confirmat păstrează aceeași observație și categoria
inițială. Ieșirea din criterii și pierderea suportului inițial sunt stări distincte;
o eroare de date nu invalidează semnalul. Randamentele 5/10/20 sunt închideri în
moneda listării, fără FX și costuri, numai după suficiente sesiuni ulterioare.
O revizie de peste 1% a prețului primei sesiuni suspendă rezultatele pentru review.
Sunt păstrate maximum 1.500 observații, cele închise cele mai vechi fiind eliminate
primele. Un document invalid nu este suprascris; erorile de salvare sunt afișate.
Istoricul este local pe dispozitiv; sincronizarea rămâne un task separat.

Rezultatele folosesc o cheie locală separată (`tt_europe_scan_v3`), fără suprascrierea
scanărilor comune, jurnalului sau setărilor de sincronizare. Cache-ul include
identitatea documentului, politica structurală, lista filtrată și ISIN-ul fiecărui rezultat; rezultatele
anterioare selecției Salt nu sunt reutilizate. Pe pagina Europa se poate
adăuga sau elimina o acțiune din Watchlist și deschide graficul sursei. Pe telefon
analiza apare imediat după cardul selectat și poate fi închisă; filtrele avansate
sunt pliate. Pe PC rămâne alături de listă.

Validare: teste pentru monede/GBX, indice și dată, separarea categoriilor, lipsa datelor,
Governor, diversificarea topurilor, integritatea ISIN-urilor, clasele de acțiuni,
apartenența Watchlist și izolarea cache-ului, navigare și active locale; verificare vizuală pe telefon și PC.
