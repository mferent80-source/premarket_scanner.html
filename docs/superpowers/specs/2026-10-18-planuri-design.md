# Planuri (desk/) — reașezare, pornire singură, cod (18.10.2026)

Cererea lui Marius: „hai să optimizăm pagina Planuri, ia toate skill-urile”. La întrebare a ales „toate trei”: pornește singură +
scurtă pe telefon + viteză / cod. A aprobat varianta A („reașezare”), nu file (B) și nici două pagini (C).

## Ce e azi (măsurat pe adresa publicată, 18.10)
- 0,8 s la încărcare, 61 de cereri (48 JS, 8 CSS), 332 KB, 0 erori JS; `desk/index.html` 102 KB.
- Pe telefon (392 px): 10.138 px ≈ 11 ecrane. Idei Breadth 2.945 px, Randamentul contului 2.193 px.
- Nu pornește singură: „Aștept scanarea pieței · Deschide scannerul”, „Rulează Candidate Engine” (de 3 ori).
- Ordinea nu urmează decizia: Planuri & simulări e la coadă.
- Ideile Breadth au data lor (15.10) cu o sesiune în urma indicelui (16.10); pagina nu spune asta.
- Inventarul ecranului vechi (unealta `tools/inventar-ecran.mjs`, pliuri deschise, stările gol + `demo=1`, 392 și 1440 px):
  241–413 propoziții, 24–34 titluri, 33–42 butoane, 7–9 câmpuri, 0–2 grafice.

## Ce se face
1. **Ordinea deciziei** (telefon și PC): „Decizia de acum” (brief) → Coach → Semnale prioritare + analiza simbolului →
   Păstrează analiza → **Planuri & simulări** (urcat) → Capital & risc → Ce spune piața acum → Top 10 (Candidate radar, pliat)
   → Idei Breadth → Performance Control → Randamentul contului (pliat, rezumatul la vedere) → Alerte concrete → bara de jos.
2. **Pliuri, nu ștergeri.** „Top 10” și „Randamentul contului” intră în `<details>` cu un rând-rezumat. Ideile Breadth au
   3 rânduri pe grup la vedere, restul în „toate ideile ›”. Toate coloanele rămân.
3. **Pornește singură.** Fără o scanare Premarket actuală (lipsă sau mai veche de 30 de minute), pagina:
   - așteaptă scanarea din fundal a aplicației, dacă rulează;
   - altfel pornește un cadru ascuns `candidate-engine/?fundal=1`.
   Progresul se vede în brief („Scanez piața · x / 85”). La final se reîncarcă din `ce_results_v2`. Nu se pornește în demo,
   pe o pagină ascunsă sau fără rețea. Textele „Rulează Candidate Engine” devin „Scanarea pornește singură…”; dacă scanarea
   cade: motivul + „Încearcă din nou”. Butonul „Deschide scannerul” rămâne.
4. **Data ideilor Breadth:** când `originalIdeas.asOf` e mai vechi decât data Breadth, titlul spune „· cu o sesiune în urmă”.
5. **Cod:** fără funcții noi duplicate; scriptul de pornire separat (`desk/auto-scan.js`), testat; revizia celor 48 de scripturi
   (ce e încărcat și nefolosit).

## Ce NU se schimbă
Calculele (ticket, governor, performanță, evidențe), cheile din stocare, transferul planului, butoanele-faptă (Păstrează,
Fixează, Exportă, Verifică).

## Cum se verifică
- Teste: pornirea singură (cadru, așteptarea scanării din fundal, nimic în demo / ascuns), ordinea secțiunilor, pliurile,
  eticheta datei; testele existente ale paginii rămân verzi.
- `tools/inventar-ecran.mjs … --fata-de` pe ambele lățimi și ambele stări: lista „lipsă” GOALĂ. Singurele excepții sunt
  textele „Rulează Candidate Engine” înlocuite, numite în tabelul pentru el.
- Poze telefon + PC lângă demo; demo-ul i se arată ÎNAINTE de publicare.
