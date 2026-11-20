// Test dei promemoria via email su Firebase Emulator: si simulano diversi momenti della giornata
// e si controlla chi riceve l'email (senza inviare nulla: MAIL_DRYRUN).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { doc, setDoc } from 'firebase/firestore';
import { ambiente } from './comune.mjs';

let env;
const D = '2027-03-10', D1 = '2027-03-11';                  // mercoledì e giovedì (ora solare, UTC+1)
const ms = (s) => new Date(s).getTime();
const pl = (n) => [{ first: n, last: 'Prova' }];
function esegui(ora) {
  const out = execFileSync('node', [new URL('../promemoria/invia.mjs', import.meta.url).pathname], {
    env: { ...process.env, MAIL_DRYRUN: '1', ORA_PROVA: ora, GCLOUD_PROJECT: 'demo-golf' }, encoding: 'utf8' });
  return out.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));
}
before(async () => {
  env = await ambiente();
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore(), T = ms(`${D}T08:00:00+01:00`);
    // pomeriggio: alice prenotata da prima, bob prenotato dopo il momento del promemoria (10:00)
    await setDoc(doc(db, 'teetimes', `${D}_1200`), { at: T, n: 3, p: { alice: { n: 2, at: T }, bob: { n: 1, at: ms(`${D}T10:30:00+01:00`) } } });
    await setDoc(doc(db, 'contacts', 'alice'), { list: [{ slot: `${D}_1200`, email: 'alice@esempio.it', tel: '3331234567', players: pl('Alice'), at: T }] });
    await setDoc(doc(db, 'contacts', 'bob'), { list: [{ slot: `${D}_1200`, email: 'bob@esempio.it', tel: '3331234567', players: pl('Bob'), at: ms(`${D}T10:30:00+01:00`) }] });
    // mattino tra 9 e 12, già passato all'ora della prova
    await setDoc(doc(db, 'teetimes', `${D}_1000`), { at: T, n: 1, p: { carol: { n: 1, at: T } } });
    await setDoc(doc(db, 'contacts', 'carol'), { list: [{ slot: `${D}_1000`, email: 'carol@esempio.it', tel: '3331234567', players: pl('Carol'), at: T }] });
    // mattino presto del giorno dopo: promemoria la sera prima alle 18:30
    await setDoc(doc(db, 'teetimes', `${D1}_0806`), { at: T, n: 1, p: { dave: { n: 1, at: T } } });
    await setDoc(doc(db, 'contacts', 'dave'), { list: [{ slot: `${D1}_0806`, email: 'dave@esempio.it', tel: '3331234567', players: pl('Dave'), at: T }] });
    // gara del giorno dopo: promemoria alle 15:00
    await setDoc(doc(db, 'gare', 'GP1'), { name: 'Coppa di Prova', date: D1, from: '09:30', to: '12:00', shotgun: false, coppie: false });
    await setDoc(doc(db, 'gflights', 'GP1_10930'), { gara: 'GP1', cap: 4, n: 2, p: { erin: { n: 2, at: T } }, pref: '09:30', at: T });
    await setDoc(doc(db, 'iscrizioni', 'erin'), { list: [{ gara: 'GP1', flight: 10930, players: [...pl('Erin'), ...pl('Frank')], email: 'erin@esempio.it', tel: '3331234567', pref: '09:30', cart: true, cartSlot: 2, at: T }] });
  });
});
after(async () => { await env.cleanup(); });

test('alle 11:10 parte solo il promemoria del tee time delle 12:00 di chi aveva già prenotato', () => {
  const m = esegui(`${D}T11:10:00+01:00`);
  assert.deepEqual(m.map((x) => x.to), ['alice@esempio.it']);
  assert.match(m[0].oggetto, /oggi alle 12:00/);
});
test('ogni promemoria parte una sola volta', () => {
  assert.equal(esegui(`${D}T11:25:00+01:00`).length, 0);
});
test('alle 15:05 del giorno prima parte il promemoria della gara', () => {
  const m = esegui(`${D}T15:05:00+01:00`);
  assert.deepEqual(m.map((x) => x.to), ['erin@esempio.it']);
  assert.match(m[0].oggetto, /Coppa di Prova/);
  assert.ok(m[0].righe.some(([k, v]) => k === 'Cart' && /2/.test(v)));
});
test('alle 18:40 parte il promemoria del tee time delle 8:06 del giorno dopo', () => {
  const m = esegui(`${D}T18:40:00+01:00`);
  assert.deepEqual(m.map((x) => x.to), ['dave@esempio.it']);
  assert.match(m[0].oggetto, /domani alle 08:06/);
});
