# Clasificator — registrul versiunilor motorului (I-661)

Orice schimbare a lui `lib/holdings-classifier.js` lasă un rând aici. Garda `tools/clasificator-inghet.test.mjs` compară:

- **amprenta rezultatelor** (motorul pe 3 serii fixe, ambele ținte) — dacă diferă de rândul versiunii curente, testul pică: rezultate noi = **versiune nouă** (`VERSION`), iar proba înainte pornește de la zero pentru ea (sau versiunea în probă rulează mai departe ca motor al doilea din `tools/motoare/`, I-674);
- **amprenta fișierului** — un fișier schimbat cu aceleași rezultate (comentarii, ordine) cere doar un rând nou pe aceeași versiune.

Amprentele se scot cu `node tools/clasificator-amprenta.mjs`. Versiunea în probă e `PROBA` din `tools/clasificator-jurnal.mjs` (vezi [protocolul](clasificator-protocol.md)).

| Versiune | Data | Amprenta fișierului | Amprenta rezultatelor | Motivul |
|---|---|---|---|---|
| holdings-clf-v2 | 2026-10-16 | — | — | Prima versiune publicată (a0ee4bf8): Boosting, Random Forest, SVM, vot; 18 indicatori. |
| holdings-clf-v3 | 2026-10-16 | — | — | Banii pe istoric și corecția pe listă (b154d2c0, I-642 / I-639). |
| holdings-clf-v4 | 2026-10-16 | — | — | Procente calibrate pe validare, ECE (5220dfe6, I-648). Jurnalul are o zi (15.10) cu ea — doar istoric. |
| holdings-clf-v5 | 2026-10-16 | `ada57c135ca80b7d` | `9aca94a357a3c1ef` | Costul după lichiditate (a58340b2, I-659). **Versiunea în probă de la 16.10.** Amprentele scrise pe 17.10 (fișier neschimbat de la a58340b2). |
