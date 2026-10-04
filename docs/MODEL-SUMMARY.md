# Sinteza modelelor — v1

Versiunea aplicației: **26.10.04.1708**. Acces: Analiza deținerilor → o deținere → Modele AI → Sinteza modelelor.

Sinteza afișează patru rezultate cu obiective diferite: Neural și Gradient Boosting estimează clasa la cinci sesiuni; HMM descrie regimul; Isolation Forest semnalează sesiuni neobișnuite. Nu este un al cincilea model, un ansamblu predictiv sau un scor de încredere.

## Date și identitate

- Fiecare interfață verifică rezultatul cu validatorul modelului înainte de a furniza o inspecție internă sintezei. Sinteza verifică din nou versiunea, simbolul, moneda, sesiunea EOD, tipul demo/piață și vechimea antrenării, de maximum 30 minute. Rezultatele viitoare sunt excluse.
- Validatorul sintezei nu înlocuiește validatorii algoritmilor și nu autentifică furnizorul OHLCV. Inspecțiile sunt date interne validate, nu un format acceptat pentru importuri externe.
- HMM și Isolation verifică și identitatea ultimei observații cu sesiunea sursei. Neural păstrează proveniența stabilită de fluxul de istoric existent.
- O analiză aflată în curs poate păstra rezultatele anterioare, dar starea comună este „Analiză în curs”. Schimbarea contului, demo-ului, simbolului, monedei, sesiunii sau eliminarea poziției anulează și workerul Neural; mesajele întârziate nu sunt salvate.

## Interpretare

O anomalie verificată în model are prioritate pentru revizuire. O estimare comună Neural / Boosting de Avans într-un HMM descriptiv de Deteriorare, sau Declin într-un regim Ascendent, apare ca tensiune. Regimurile neconcludente și clasele diferite între cele două modele de direcție nu produc această comparație.

Dezacordul Neural / Boosting, lipsa avantajului repetat, ieșirea Neural din domeniul antrenării sau un context incert nu pot deveni „acord experimental” doar pentru că alt model arată favorabil. Un detector în tiparul istoric nu confirmă siguranța deținerii. Voturile și scorurile celor patru modele nu se însumează.

„4/4 rezultate disponibile” descrie disponibilitatea rezultatelor validate; nu înseamnă patru confirmări ale unei tranzacții. Acordul experimental păstrează condițiile comparației de direcție deja existente și cere context HMM descriptiv, fără anomalie în Isolation. Nu validează acuratețea, profitul, costurile sau viitoarele regimuri.

Știrile, rezultatele financiare, breadth și expunerea contului se verifică separat. Sinteza nu dă ordine și nu schimbă planurile, jurnalul sau analizele algoritmilor.

## Demo și export

Demo-ul arată toate stările pe date fictive. Neural și HMM folosesc istoricul fictiv existent; Isolation folosește un istoric distinct cu anomalie intenționată. Starea comună rămâne demonstrativă, iar aceste rezultate nu se confirmă reciproc.

Scurtăturile deschid analiza corespunzătoare și mută focusul. Exportul `holdings-lab-summary-v1` se reconstruiește la apăsarea butonului și conține stări, avertizări, date, versiuni și pragul detectorului. Nu include cantități, sold, identificatorul contului, chei API, ponderi sau vectori OHLCV. Rapoartele individuale complete rămân disponibile în fiecare model.

Testele sintezei acoperă prioritățile, conflictele, interpretările blocate, identitatea și vechimea, datele EOD imposibile/viitoare, separarea demo, starea în curs și proiecția exportată. În plus, testul de lifecycle Neural verifică anularea la schimbări în același cont.

Verificare: 522 de teste în suita completă au trecut; verificările UI/logică relevante au fost repetate după ajustarea păstrării focusului și a secțiunilor deschise. Algoritmii și rapoartele publice existente nu au fost reantrenate sau modificate.

## Istoric local și comparație

„Păstrează sinteza” salvează explicit o proiecție compactă în istoricul local. „Istoric și comparație” compară analiza afișată cu o sinteză aleasă. Vezi [MODEL-HISTORY.md](MODEL-HISTORY.md) pentru separarea conturilor, limite și interpretare.

## Ferestre de analiză

Fiecare card are „Vezi analiza”, cu numele complet și interpretarea modelului, indicatorii, metricele și limitele lui. Cele patru modele se pot comuta în aceeași fereastră. Vezi [MODEL-ANALYSIS.md](MODEL-ANALYSIS.md).

## Extensie: al cincilea model

Regresia cu cuantile adaugă intervalul și mediana închiderii la cinci sesiuni, acoperirea observată și comparația cu un reper simplu. Are fereastră proprie, fără vot comun sau scor agregat. Sinteza curentă folosește `holdings-lab-summary-v2` cu cinci modele; istoricul păstrează și citește formatul v1 cu patru modele, fără ștergere sau rescriere la deschidere. La comparația între versiuni, cuantilele sunt „model nou”, nu o schimbare a pieței. [Metodologie și limite](HOLDINGS-QUANTILE.md).
