# Clasificator — registrul versiunilor motorului (I-661)

Orice schimbare a fișierelor care pot schimba voturile (`lib/daily-series.js`, `lib/holdings-bars.js`, `lib/holdings-neural.js`, `lib/holdings-neural-evaluation.js`, `lib/holdings-classifier.js`) lasă un rând aici. Garda `tools/clasificator-inghet.test.mjs` compară (și **robotul de noapte refuză să noteze ziua** cu un motor a cărui amprentă de fișiere nu e aici):

- **amprenta rezultatelor** (motorul pe 3 serii fixe, ambele ținte) — dacă diferă de rândul versiunii curente, testul pică: rezultate noi = **versiune nouă** (`VERSION`), iar proba înainte pornește de la zero pentru ea (sau versiunea în probă rulează mai departe ca motor al doilea din `tools/motoare/`, I-674);
- **amprenta fișierelor** — fișiere schimbate cu aceleași rezultate (comentarii, ordine, cod care nu atinge clasificatorul) cer doar un rând nou pe aceeași versiune.

Registrul doar crește: niciun rând nu se șterge sau se schimbă (gardă).

Amprentele se scot cu `node tools/clasificator-amprenta.mjs`. Versiunea în probă e `PROBA` din `tools/clasificator-jurnal.mjs` (vezi [protocolul](clasificator-protocol.md)).

| Versiune | Data | Amprenta fișierului | Amprenta rezultatelor | Motivul |
|---|---|---|---|---|
| holdings-clf-v2 | 2026-10-16 | — | — | Prima versiune publicată (a0ee4bf8): Boosting, Random Forest, SVM, vot; 18 indicatori. |
| holdings-clf-v3 | 2026-10-16 | — | — | Banii pe istoric și corecția pe listă (b154d2c0, I-642 / I-639). |
| holdings-clf-v4 | 2026-10-16 | — | — | Procente calibrate pe validare, ECE (5220dfe6, I-648). Jurnalul are o zi (15.10) cu ea — doar istoric. |
| holdings-clf-v5 | 2026-10-16 | `ada57c135ca80b7d` | `9aca94a357a3c1ef` | Costul după lichiditate (a58340b2, I-659). **Versiunea în probă de la 16.10.** Amprentele scrise pe 17.10 (fișier neschimbat de la a58340b2). |
| holdings-clf-v5 | 2026-10-17 | `1d6e809ef648ffc3` | `9aca94a357a3c1ef` | Amprenta extinsă la toate cele 5 fișiere care pot schimba voturile (revizia de cod); `holdings-bars.js` a primit doar citirea „Istoric scurt” (I-665). Rezultate identice ⇒ aceeași versiune, aceeași probă. |
| holdings-clf-v5 | 2026-10-19 | `5042c17d8d07bdfb` | `9aca94a357a3c1ef` | `lib/daily-series.js`: formatorul de dată ținut minte pe fus orar (I-696, viteză: 7 s la deschiderea Portofoliului pe telefon); zilele calculate sunt aceleași (test pe 3.000 de momente × 8 fusuri). Rezultate identice ⇒ aceeași versiune, aceeași probă. |
