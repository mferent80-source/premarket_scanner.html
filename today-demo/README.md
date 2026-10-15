# Astăzi — propunere de dashboard

Acest prototip se deschide separat la `today-demo/`. Pagina Astăzi și navigarea aplicației publicate rămân la versiunea aprobată anterior. Integrarea noului dashboard se face după revizuirea demo-ului.

„Previzualizare” folosește exclusiv valori ilustrative în memorie, marcate în pagină. „Datele mele + piață” citește contul Invest de pe dispozitiv și solicită datele publice de piață. Schimbarea modului nu salvează exemplele în registrele financiare.

- Contul păstrează ultima valoare verificabilă, împreună cu ora și starea ei. O observație mai veche nu devine o citire actuală.
- Graficul contului arată valori observate la sincronizări, în aceeași monedă și pentru același cont. Depunerile și retragerile schimbă aceste valori; graficul nu este randament investițional. Istoricul nu este reconstruit înaintea primei sincronizări.
- SPY și QQQ sunt repere ETF pentru indicii americani. Seriile și indicatorii folosesc sesiuni încheiate Yahoo Finance; o citire nouă nu transformă prețul EOD în cotație live executabilă. VIX este în puncte, iar randamentul SUA la 10 ani în procente.
- Graficul de amploare și procentele peste SMA50/SMA200 folosesc aceeași serie originală S&P 500 din raportul Market Breadth publicat, cu data sursei. Eșantionul separat calculat din prețuri Yahoo nu este amestecat cu această serie.
- Știrile reale păstrează publicația, data și un link HTTPS verificabil. Un flux indisponibil se deosebește de un flux accesibil fără articole relevante.
- Execuțiile sunt citite din registrul confirmat al contului selectat. Demo-ul nu încarcă modulul care migrează sau modifică registrul și nu citește credențialele Trading 212.
- Actualizarea contului se face prin pagina Trading 212 existentă. Butonul din demo recitește datele locale și sursele publice; cache-ul public de piață poate fi actualizat de stratul de date existent.
- Premarket Scanner și verdictul independent V1 rămân două surse distincte, cu regulile lor existente.

Verificări: `node --test tools/today-dashboard-model.test.mjs tools/today-dashboard-ui.test.mjs`.
