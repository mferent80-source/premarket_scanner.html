// 20.10.2026 (I-734): fișa de risc a zilei din monitorul de pe server — după închiderea SUA, o dată pe zi NY, din cifrele monitorului; lipsurile spuse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fisaZilei, dupaInchidere } from '../lib/cloud-monitor.mjs';

const scope = 'live:abc', summary = { currency: 'EUR', totalValue: 10000 };
const positions = [{ ticker: 'MU_US_EQ', quantity: 10, currentPrice: 100, instrumentCurrency: 'USD', currency: 'EUR', value: 900 }, { ticker: 'AAPL_US_EQ', quantity: 5, currentPrice: 200, instrumentCurrency: 'USD', currency: 'EUR', value: 900 }, { ticker: 'NVDA_US_EQ', quantity: 20, currentPrice: 50, instrumentCurrency: 'USD', currency: 'EUR', value: 900 }];
const notes = { [scope + '|MU_US_EQ']: { stop: 90, stopCurrency: 'USD', earnings: '2026-10-23' }, [scope + '|AAPL_US_EQ']: { stop: 180, stopCurrency: 'USD' } };
const NOW = Date.parse('2026-10-20T20:10:00Z'); // 16:10 New York, marți

test('după închidere: 16:05 NY în zilele lucrătoare, nu înainte și nu în weekend', () => {
  assert.equal(dupaInchidere(NOW), true); assert.equal(dupaInchidere(Date.parse('2026-10-20T19:00:00Z')), false, '15:00 NY');
  assert.equal(dupaInchidere(Date.parse('2026-10-24T21:00:00Z')), false, 'sâmbătă'); assert.equal(dupaInchidere(Date.parse('2026-10-21T03:00:00Z')), true, '23:00 NY, încă marți');
});
test('fișa: căldura din stopurile documentate, cea mai mare poziție, fără stop, raportări în 7 zile; vârful din istoricul sincronizat', () => {
  const f = fisaZilei({ scope, summary, positions, notes, istoric: [{ at: '2026-10-10T20:00:00Z', total: 11000, currency: 'EUR' }, { at: '2026-10-19T20:00:00Z', total: 10200, currency: 'EUR' }], now: NOW });
  assert.equal(f.zi, '2026-10-20'); assert.equal(f.pozitii, 3); assert.deepEqual(f.faraStop, ['NVDA_US_EQ']);
  assert.equal(f.caldura, null, 'o poziție fără stop ⇒ căldura NECUNOSCUTĂ, nu suma celorlalte'); assert.match(f.text, /căldura până la stopuri NECUNOSCUTĂ \(1 fără stop\)/);
  assert.equal(f.concentrare.t, 'MU_US_EQ'); assert.ok(Math.abs(f.dd - (1 - 10000 / 11000) * 100) < 1e-9); assert.deepEqual(f.raportari, ['MU (23.10)']);
  assert.match(f.text, /^Fișa zilei 20\.10 · cont 10.000,0 EUR · 3 poziții/); assert.match(f.text, /fără stop documentat: NVDA/); assert.match(f.text, /scăderea de la vârful observațiilor 9,1 % \(fără ajustare la depuneri \/ retrageri\)/); assert.match(f.text, /raportări în 7 zile: MU \(23\.10\)\./);
});
test('fișa cu toate stopurile puse: căldura = Σ (preț − stop) × cantitate × curs, în moneda contului; fără istoric ⇒ spus', () => {
  const n2 = { ...notes, [scope + '|NVDA_US_EQ']: { stop: 45, stopCurrency: 'USD' } }, f = fisaZilei({ scope, summary, positions, notes: n2, istoric: null, now: NOW });
  // cursul implicit 900 / (qty × preț) = 0,9 pentru toate ⇒ (10×10 + 20×5 + 5×20) × 0,9 = 270
  assert.ok(Math.abs(f.caldura - 270) < 1e-9); assert.ok(Math.abs(f.caldPct - 2.7) < 1e-9); assert.match(f.text, /căldura până la stopuri 270,0 EUR = 2,7 % din cont/); assert.match(f.text, /istoricul contului nesincronizat/);
  assert.equal(fisaZilei({ scope, summary: null, positions: [], notes: {}, now: NOW }).text.includes('cont —'), true);
});
