# Trading Tools + Market Breadth — versiune locală

Versiunea locală servește aceeași Decision App și execută motorul Python complet.
Nu cere token GitHub, autentificare Cloudflare sau cont de broker.

## Pornire pe Windows

1. Dezarhivează pachetul complet într-un folder obișnuit.
2. Deschide `PORNESTE_APLICATIA.cmd` din rădăcina pachetului.
3. La prima pornire se creează un mediu Python izolat și se instalează
   requests, PyYAML, tzdata și jsonschema. Este necesar Python 3.11 sau mai nou.
4. Se deschide `http://127.0.0.1:8765/app/`. Păstrează fereastra de server deschisă.

Pe macOS/Linux: instalează dependențele într-un mediu virtual, apoi rulează
`python tools/breadth-local-server.py` din folderul aplicației.

## Scanare

- Prima deschidere a aplicației într-o zi (Europe/Bucharest) solicită o scanare.
- Redeschiderea în aceeași zi nu repetă scanarea automată.
- În **Market Breadth → Scanează acum**, poți porni o nouă scanare manuală.
- Dacă motorul rulează deja, apăsările repetate urmăresc aceeași scanare.
- Rezultatul devine disponibil numai după terminarea motorului. Starea PARTIAL
  păstrează sursele valabile și exclude sursele expirate/lipsă.
- Data EOD nu devine data de azi prin simpla scanare. În weekend este normal ca
  ultima observație disponibilă să fie ultima sesiune bursieră încheiată.
- Scanarea include S&P, uptrend/sectoare, Nasdaq, proxy small-cap, idei originale,
  timing, confirmarea riscului, macro, validări și backtesturile când sunt scadente.

Serverul ascultă numai pe acest calculator. Logul local este în
`_local_state/breadth-scan.log`. Nu deschide portul în router pentru acces public.

## Pachetul original

Arhiva originală furnizată este păstrată integral în folderul `original` din
pachetul livrat, cu același SHA-256. Rapoartele istorice rămân arhivă; nu sunt
folosite pentru a completa artificial datele curente. Configurațiile personale
din arhiva originală nu se publică pe GitHub și nu sunt executate automat.

## Versiunea online

GitHub Pages continuă să afișeze rapoartele publicate. Activarea scanării complete
din aplicația online necesită un server de declanșare autentificat/configurat.
Pachetul local nu pretinde că activează serverul Cloudflare.
