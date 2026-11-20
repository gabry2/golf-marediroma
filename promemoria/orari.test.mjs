import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roma, quandoTee, quandoGara, daInviare } from './orari.mjs';
const iso = (d) => d.toISOString();
test('ora di Roma, inverno ed estate', () => {
  assert.equal(iso(roma('2027-01-15', '10:00')), '2027-01-15T09:00:00.000Z');
  assert.equal(iso(roma('2027-07-15', '10:00')), '2027-07-15T08:00:00.000Z');
});
test('tee time del mattino presto: la sera prima alle 18:30', () => {
  assert.equal(iso(quandoTee('2027-01-15', '08:06')), '2027-01-14T17:30:00.000Z');
  assert.equal(iso(quandoTee('2027-01-15', '08:54')), '2027-01-14T17:30:00.000Z');
});
test('tee time tra le 9 e le 12: un\'ora prima', () => {
  assert.equal(iso(quandoTee('2027-01-15', '09:00')), '2027-01-15T07:00:00.000Z');
  assert.equal(iso(quandoTee('2027-01-15', '11:54')), '2027-01-15T09:54:00.000Z');
});
test('tee time del pomeriggio: due ore prima', () => {
  assert.equal(iso(quandoTee('2027-01-15', '12:00')), '2027-01-15T09:00:00.000Z');
  assert.equal(iso(quandoTee('2027-07-15', '15:30')), '2027-07-15T11:30:00.000Z');
});
test('gara: il giorno prima alle 15', () => {
  assert.equal(iso(quandoGara('2027-01-15')), '2027-01-14T14:00:00.000Z');
});
test('si invia solo nella finestra giusta e se si era prenotato prima', () => {
  const m = roma('2027-01-15', '10:00'), s = roma('2027-01-15', '12:00');
  assert.equal(daInviare(roma('2027-01-15', '09:59'), m, s, 0), false);
  assert.equal(daInviare(roma('2027-01-15', '10:05'), m, s, 0), true);
  assert.equal(daInviare(roma('2027-01-15', '12:01'), m, s, 0), false);
  assert.equal(daInviare(roma('2027-01-15', '10:05'), m, s, roma('2027-01-15', '10:02').getTime()), false);
});
