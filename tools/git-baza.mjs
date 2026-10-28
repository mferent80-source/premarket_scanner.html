// 28.10.2026 (revizia F2, 🔵12): baza gărzilor „doar crește” — commitul de dinaintea push-ului în poarta de teste (DOAR_CRESTE_BAZA =
// github.event.before), altfel HEAD. Doar un SHA de 40 de cifre hex ajunge în comanda git; 000…0 (ramură nouă) ⇒ HEAD.
const v = String(process.env.DOAR_CRESTE_BAZA || '').trim();
export const BAZA = /^[0-9a-f]{40}$/.test(v) && !/^0+$/.test(v) ? v : 'HEAD';
