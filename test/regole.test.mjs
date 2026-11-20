// Test delle regole di sicurezza Firestore (firestore.rules) su Firebase Emulator.
// Avvio: cd test && npm install && npm test
import { test, before, after, beforeEach } from 'node:test';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, collection, getDocs } from 'firebase/firestore';
import { ambiente, giorno, tee, slotK, anonimo, admin, adminNonVerificato, estraneoConEmail, ospite, ADMIN_EMAIL, conEmail } from './comune.mjs';

let env;
const T = Date.now();
// Date dei casi di prova (fuso di Roma)
const D_OK = giorno(3);          // giorno normale
const D_CHIUSO = giorno(4);      // circolo chiuso
const D_GARA = giorno(5);        // gara non shotgun 09:30–12:00
const D_SHOT = giorno(6);        // gara shotgun a coppie
const D_LAST = new Date().getUTCHours() >= 11 ? giorno(1) : giorno(0); // gara oltre le 12 del giorno prima
const D_PASS = giorno(-2);

async function semina() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins', ADMIN_EMAIL), { nome: 'Segreteria' });
    await setDoc(doc(db, 'admins', 'nuovo.admin@esempio.it'), { nome: 'Da verificare' });
    await setDoc(doc(db, 'blocked', D_CHIUSO), { name: 'Manutenzione' });
    await setDoc(doc(db, 'blockedslots', tee(D_OK, '11:06')), { type: 'altro', name: 'Lezione' });
    await setDoc(doc(db, 'gare', 'G1'), { name: 'Gara a orari', date: D_GARA, from: '09:30', to: '12:00', shotgun: false, coppie: false, chiusa: false });
    await setDoc(doc(db, 'gday', D_GARA), { from: '09:30', to: '12:00', at: T });
    await setDoc(doc(db, 'gare', 'G2'), { name: 'Shotgun a coppie', date: D_SHOT, from: '09:30', to: '16:00', shotgun: true, coppie: true, chiusa: false });
    await setDoc(doc(db, 'gare', 'G3'), { name: 'Iscrizioni chiuse', date: D_GARA, from: '13:30', to: '15:00', shotgun: false, coppie: false, chiusa: true });
    await setDoc(doc(db, 'gare', 'G4'), { name: 'Già giocata', date: D_PASS, from: '09:30', to: '12:00', shotgun: false, coppie: false, chiusa: false });
    await setDoc(doc(db, 'gare', 'G5'), { name: 'Ultimo momento', date: D_LAST, from: '09:30', to: '12:00', shotgun: false, coppie: false, chiusa: false });
    // un tee time condiviso: alice 2 giocatori, bob 1
    await setDoc(doc(db, 'teetimes', tee(D_OK, '09:30')), { at: T, n: 3, p: { alice: { n: 2, at: T }, bob: { n: 1, at: T } } });
    // un tee time già passato di alice, prenotato giorni fa
    await setDoc(doc(db, 'teetimes', tee(D_PASS, '09:30')), { at: T, n: 2, p: { alice: { n: 2, at: T - 3 * 86400000 } } });
    // un tee time passato di bob prenotato pochi istanti fa (dentro i 10 minuti di ripensamento)
    await setDoc(doc(db, 'teetimes', tee(D_PASS, '10:30')), { at: T, n: 1, p: { bob: { n: 1, at: T } } });
    // una partenza di gara: alice 2
    await setDoc(doc(db, 'gflights', `G1_${slotK('10:30')}`), { gara: 'G1', cap: 4, n: 2, p: { alice: { n: 2, at: T } }, pref: '10:30', at: T });
    await setDoc(doc(db, 'gflights', `G5_${slotK('09:30')}`), { gara: 'G5', cap: 4, n: 2, p: { bob: { n: 2, at: T } }, pref: '09:30', at: T });
    await setDoc(doc(db, 'gflights', `G3_${slotK('13:30')}`), { gara: 'G3', cap: 4, n: 1, p: { alice: { n: 1, at: T, c: 1 } }, pref: '13:30', at: T });
    await setDoc(doc(db, 'contacts', 'bob'), { list: [{ slot: tee(D_OK, '09:30'), email: 'bob@esempio.it', tel: '333 1234567', players: [{ first: 'Bob', last: 'Bianchi' }], at: T }] });
    await setDoc(doc(db, 'giocatori', 'p1'), { n: 'Mario Rossi', hcp: 12 });
    await setDoc(doc(db, 'storico', 's1'), { date: D_PASS });
  });
}

before(async () => { env = await ambiente(); });
after(async () => { await env.cleanup(); });
beforeEach(semina);

const nuovo = (n, who = 'alice') => ({ at: T, n, p: { [who]: { n, at: T } } });

// =================== TEE TIME ===================
test('tee time: chiunque può vedere quanti posti sono occupati', async () => {
  await assertSucceeds(getDoc(doc(ospite(env), 'teetimes', tee(D_OK, '09:30'))));
});
test('tee time: un utente anonimo prenota un orario valido a proprio nome', async () => {
  await assertSucceeds(setDoc(doc(anonimo(env, 'alice'), 'teetimes', tee(D_OK, '10:30')), nuovo(2)));
});
test('tee time: senza accesso non si prenota', async () => {
  await assertFails(setDoc(doc(ospite(env), 'teetimes', tee(D_OK, '10:30')), nuovo(2)));
});
test('tee time: niente prenotazioni nel passato', async () => {
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'teetimes', tee(D_PASS, '10:30')), nuovo(2)));
});
test('tee time: niente orari fuori dalla griglia', async () => {
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'teetimes', tee(D_OK, '10:31')), nuovo(2)));
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'teetimes', tee(D_OK, '06:00')), nuovo(2)));
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'teetimes', 'domani_alle_dieci'), nuovo(2)));
});
test('tee time: niente prenotazioni oltre i 16 giorni', async () => {
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'teetimes', tee(giorno(30), '10:30')), nuovo(2)));
});
test('tee time: niente prenotazioni nei giorni di chiusura', async () => {
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'teetimes', tee(D_CHIUSO, '10:30')), nuovo(2)));
});
test('tee time: niente prenotazioni negli orari riservati dal circolo', async () => {
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'teetimes', tee(D_OK, '11:06')), nuovo(2)));
});
test('tee time: niente prenotazioni durante una gara', async () => {
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'teetimes', tee(D_GARA, '10:30')), nuovo(2)));
  await assertSucceeds(setDoc(doc(anonimo(env, 'alice'), 'teetimes', tee(D_GARA, '14:18')), nuovo(2)));
});
test('tee time: il totale deve tornare e restare entro 4', async () => {
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'teetimes', tee(D_OK, '10:30')), { at: T, n: 3, p: { alice: { n: 2, at: T } } }));
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'teetimes', tee(D_OK, '10:30')), { at: T, n: 5, p: { alice: { n: 5, at: T } } }));
  const id = tee(D_OK, '09:30'); // già 3 occupati
  await assertFails(updateDoc(doc(anonimo(env, 'alice'), 'teetimes', id), { n: 5, 'p.alice.n': 4 }));
});
test('tee time: non si prenota a nome di altri', async () => {
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'teetimes', tee(D_OK, '10:30')), nuovo(2, 'bob')));
});
test('tee time: si aggiunge un giocatore alla propria voce', async () => {
  await assertSucceeds(updateDoc(doc(anonimo(env, 'alice'), 'teetimes', tee(D_OK, '09:30')), { n: 4, 'p.alice.n': 3 }));
});
test('tee time: non si toccano le prenotazioni altrui', async () => {
  const id = tee(D_OK, '09:30');
  await assertFails(updateDoc(doc(anonimo(env, 'alice'), 'teetimes', id), { n: 4, 'p.bob.n': 2 }));
  await assertFails(updateDoc(doc(anonimo(env, 'alice'), 'teetimes', id), { n: 2, 'p.bob': deleteField() }));
  await assertFails(deleteDoc(doc(anonimo(env, 'alice'), 'teetimes', id)));
  await assertFails(setDoc(doc(anonimo(env, 'mallory'), 'teetimes', id), nuovo(1, 'mallory')));
});
test('tee time: ognuno annulla la propria voce, e l\'ultimo cancella il documento', async () => {
  const id = tee(D_OK, '09:30');
  await assertSucceeds(updateDoc(doc(anonimo(env, 'alice'), 'teetimes', id), { n: 1, 'p.alice': deleteField() }));
  await assertSucceeds(deleteDoc(doc(anonimo(env, 'bob'), 'teetimes', id)));
});
test('tee time: dopo le 19 del giorno prima non si annulla da soli (né si toglie un giocatore)', async () => {
  const id = tee(D_PASS, '09:30');
  await assertFails(deleteDoc(doc(anonimo(env, 'alice'), 'teetimes', id)));
  await assertFails(updateDoc(doc(anonimo(env, 'alice'), 'teetimes', id), { n: 1, 'p.alice.n': 1 }));
  await assertFails(updateDoc(doc(anonimo(env, 'alice'), 'teetimes', id), { n: 3, 'p.alice.n': 3 }));
  await assertSucceeds(deleteDoc(doc(admin(env), 'teetimes', id)));
});
test('tee time: entro 10 minuti dalla prenotazione si può sempre annullare', async () => {
  await assertSucceeds(deleteDoc(doc(anonimo(env, 'bob'), 'teetimes', tee(D_PASS, '10:30'))));
});
test('tee time: l\'ora della prenotazione non può essere spostata nel futuro', async () => {
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'teetimes', tee(D_OK, '10:30')), { at: T, n: 2, p: { alice: { n: 2, at: T + 86400000 } } }));
});
test('tee time: campi estranei rifiutati', async () => {
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'teetimes', tee(D_OK, '10:30')), { ...nuovo(2), nota: 'x' }));
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'teetimes', tee(D_OK, '10:30')), { at: T, n: 2, p: { alice: { n: 2, at: T, admin: true } } }));
});

// =================== GARE: PARTENZE E FLIGHT ===================
const part = (gara, pref, n, who = 'alice', cap = 4) => ({ gara, cap, n, p: { [who]: { n, at: T } }, pref, at: T });
test('gara: un utente apre una partenza valida', async () => {
  await assertSucceeds(setDoc(doc(anonimo(env, 'carol'), 'gflights', `G1_${slotK('09:30')}`), part('G1', '09:30', 2, 'carol')));
});
test('gara: niente partenze fuori dalla finestra della gara o con orario incoerente', async () => {
  await assertFails(setDoc(doc(anonimo(env, 'carol'), 'gflights', `G1_${slotK('13:30')}`), part('G1', '13:30', 2, 'carol')));
  await assertFails(setDoc(doc(anonimo(env, 'carol'), 'gflights', `G1_${slotK('09:54')}`), part('G1', '09:30', 2, 'carol')));
  await assertFails(setDoc(doc(anonimo(env, 'carol'), 'gflights', `G1_${slotK('09:31')}`), part('G1', '09:31', 2, 'carol')));
});
test('gara: niente iscrizioni a gare chiuse, passate o inesistenti', async () => {
  await assertFails(setDoc(doc(anonimo(env, 'carol'), 'gflights', `G3_${slotK('14:18')}`), part('G3', '14:18', 2, 'carol')));
  await assertFails(setDoc(doc(anonimo(env, 'carol'), 'gflights', `G4_${slotK('09:30')}`), part('G4', '09:30', 2, 'carol')));
  await assertFails(setDoc(doc(anonimo(env, 'carol'), 'gflights', `GX_${slotK('09:30')}`), part('GX', '09:30', 2, 'carol')));
  await assertFails(updateDoc(doc(anonimo(env, 'carol'), 'gflights', `G3_${slotK('13:30')}`), { n: 2, 'p.carol': { n: 1, at: T } }));
});
test('gara: ci si unisce a una partenza con posti liberi', async () => {
  await assertSucceeds(updateDoc(doc(anonimo(env, 'bob'), 'gflights', `G1_${slotK('10:30')}`), { n: 3, 'p.bob': { n: 1, at: T } }));
});
test('gara: non si supera la capienza né si toccano gli altri', async () => {
  const id = `G1_${slotK('10:30')}`;
  await assertFails(updateDoc(doc(anonimo(env, 'bob'), 'gflights', id), { n: 5, 'p.bob': { n: 3, at: T } }));
  await assertFails(updateDoc(doc(anonimo(env, 'bob'), 'gflights', id), { n: 3, 'p.alice.n': 3 }));
  await assertFails(updateDoc(doc(anonimo(env, 'bob'), 'gflights', id), { n: 0, 'p.alice': deleteField() }));
  await assertFails(deleteDoc(doc(anonimo(env, 'bob'), 'gflights', id)));
  await assertFails(updateDoc(doc(anonimo(env, 'bob'), 'gflights', id), { pref: '09:30' }));
});
test('gara shotgun: flight numerati con la capienza giusta (2 a coppie)', async () => {
  await assertSucceeds(setDoc(doc(anonimo(env, 'carol'), 'gflights', 'G2_1'), part('G2', '', 2, 'carol', 2)));
  await assertFails(setDoc(doc(anonimo(env, 'dave'), 'gflights', 'G2_2'), part('G2', '', 3, 'dave', 4)));
  await assertFails(setDoc(doc(anonimo(env, 'dave'), 'gflights', `G2_${slotK('09:30')}`), part('G2', '09:30', 2, 'dave', 2)));
});
test('gara dalle 12 del giorno prima: nuove partenze solo con almeno 3 giocatori', async () => {
  await assertFails(setDoc(doc(anonimo(env, 'carol'), 'gflights', `G5_${slotK('10:30')}`), part('G5', '10:30', 1, 'carol')));
  await assertSucceeds(setDoc(doc(anonimo(env, 'carol'), 'gflights', `G5_${slotK('10:30')}`), part('G5', '10:30', 3, 'carol')));
  await assertSucceeds(updateDoc(doc(anonimo(env, 'dave'), 'gflights', `G5_${slotK('09:30')}`), { n: 3, 'p.dave': { n: 1, at: T } }));
});

// =================== CART ===================
const cart = (by, k) => ({ by, at: T, k });
test('cart: chi non è iscritto non può prenderlo', async () => {
  await assertFails(setDoc(doc(anonimo(env, 'carol'), 'cart', 'G1_1'), cart('carol', slotK('10:30'))));
});
test('cart: l\'iscritto prende un cart collegato alla sua iscrizione', async () => {
  const fl = doc(anonimo(env, 'alice'), 'gflights', `G1_${slotK('10:30')}`);
  await assertSucceeds(updateDoc(fl, { 'p.alice.c': 1 }));
  await assertSucceeds(setDoc(doc(anonimo(env, 'alice'), 'cart', 'G1_1'), cart('alice', slotK('10:30'))));
});
test('cart: non se ne accaparrano altri', async () => {
  const db = anonimo(env, 'alice'), fl = doc(db, 'gflights', `G1_${slotK('10:30')}`);
  await assertSucceeds(updateDoc(fl, { 'p.alice.c': 1 }));
  await assertSucceeds(setDoc(doc(db, 'cart', 'G1_1'), cart('alice', slotK('10:30'))));
  await assertFails(setDoc(doc(db, 'cart', 'G1_2'), cart('alice', slotK('10:30'))));      // la voce punta al cart 1
  await assertFails(updateDoc(fl, { 'p.alice.c': 2 }));                                  // non si cambia finché il cart 1 è suo
  await assertFails(updateDoc(fl, { n: 0, 'p.alice': deleteField() }));                  // né si lascia il flight tenendosi il cart
  await assertFails(deleteDoc(fl));
  await assertFails(setDoc(doc(db, 'cart', 'G1_4'), cart('alice', slotK('10:30'))));     // solo cart 1..3
  await assertFails(setDoc(doc(db, 'cart', 'G1_2'), cart('bob', slotK('10:30'))));       // non a nome di altri
});
test('cart: solo il proprietario o il circolo lo liberano; dopo si lascia il flight', async () => {
  const db = anonimo(env, 'alice'), fl = doc(db, 'gflights', `G1_${slotK('10:30')}`);
  await assertSucceeds(updateDoc(fl, { 'p.alice.c': 1 }));
  await assertSucceeds(setDoc(doc(db, 'cart', 'G1_1'), cart('alice', slotK('10:30'))));
  await assertFails(deleteDoc(doc(anonimo(env, 'bob'), 'cart', 'G1_1')));
  await assertFails(updateDoc(doc(anonimo(env, 'alice'), 'cart', 'G1_1'), { by: 'bob' }));
  await assertSucceeds(deleteDoc(doc(db, 'cart', 'G1_1')));
  await assertSucceeds(deleteDoc(fl));
});
test('cart: niente cart per gare con iscrizioni chiuse', async () => {
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'cart', 'G3_1'), cart('alice', slotK('13:30'))));
});

// =================== VECCHI LUCCHETTI ===================
test('lucchetti: non si possono più creare né leggere', async () => {
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'leases', 'teetimes__x'), { h: 'alice-1', exp: T + 8000 }));
  await assertFails(getDoc(doc(anonimo(env, 'alice'), 'leases', 'teetimes__x')));
});

// =================== DATI PERSONALI ===================
const contatto = (over = {}) => ({ slot: tee(D_OK, '10:30'), email: 'alice@esempio.it', tel: '+39 333 1234567', players: [{ first: 'Alice', last: 'Rossi' }], at: T, ...over });
test('dati personali: ognuno scrive e legge solo i propri', async () => {
  await assertSucceeds(setDoc(doc(anonimo(env, 'alice'), 'contacts', 'alice'), { list: [contatto()] }));
  await assertSucceeds(getDoc(doc(anonimo(env, 'alice'), 'contacts', 'alice')));
  await assertFails(getDoc(doc(anonimo(env, 'alice'), 'contacts', 'bob')));
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'contacts', 'bob'), { list: [contatto()] }));
  await assertFails(getDocs(collection(anonimo(env, 'alice'), 'contacts')));
  await assertFails(getDoc(doc(ospite(env), 'contacts', 'bob')));
});
test('dati personali: email, telefono e nomi validati dal server', async () => {
  const db = anonimo(env, 'alice'), r = doc(db, 'contacts', 'alice');
  await assertFails(setDoc(r, { list: [contatto({ email: 'non-una-email' })] }));
  await assertFails(setDoc(r, { list: [contatto({ tel: '12' })] }));
  await assertFails(setDoc(r, { list: [contatto({ tel: '<script>' })] }));
  await assertFails(setDoc(r, { list: [contatto({ players: [] })] }));
  await assertFails(setDoc(r, { list: [contatto({ players: [1, 2, 3, 4, 5].map((i) => ({ first: 'A' + i, last: 'B' })) })] }));
  await assertFails(setDoc(r, { list: [contatto({ players: [{ first: 'x'.repeat(61), last: 'B' }] })] }));
  await assertFails(setDoc(r, { list: [contatto({ ruolo: 'admin' })] }));
  await assertFails(setDoc(r, { list: [contatto()], extra: 1 }));
  await assertFails(setDoc(r, { list: [contatto(), contatto({ at: T + 1 }), contatto({ at: T + 2 })] }));
});
test('iscrizioni: valide sì, malformate no, altrui no', async () => {
  const x = { gara: 'G1', flight: slotK('10:30'), players: [{ first: 'Alice', last: 'Rossi' }], email: 'alice@esempio.it', tel: '3331234567', pref: '10:30', cart: true, cartSlot: 1, at: T };
  await assertSucceeds(setDoc(doc(anonimo(env, 'alice'), 'iscrizioni', 'alice'), { list: [x] }));
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'iscrizioni', 'alice'), { list: [{ ...x, cartSlot: 9 }] }));
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'iscrizioni', 'alice'), { list: [{ ...x, email: 'x' }] }));
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'iscrizioni', 'bob'), { list: [x] }));
  await assertFails(getDoc(doc(anonimo(env, 'bob'), 'iscrizioni', 'alice')));
});
test('recensioni proposte: si inviano ma le legge solo il circolo', async () => {
  const r = doc(anonimo(env, 'alice'), 'proposte', `alice_${T}`);
  await assertSucceeds(setDoc(r, { n: 'Alice', s: 5, t: 'Bel percorso', by: 'alice', at: T }));
  await assertFails(getDoc(r));
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'proposte', `bob_${T}`), { n: 'Bob', s: 1, t: 'x', by: 'bob', at: T }));
  await assertSucceeds(getDoc(doc(admin(env), 'proposte', `alice_${T}`)));
});

// =================== AMMINISTRATORI ===================
const gara = { name: 'Nuova', date: D_SHOT, from: '09:30', to: '12:00', shotgun: false, coppie: false };
test('amministratore verificato: gestisce gare, impostazioni, allegati e dati riservati', async () => {
  const db = admin(env);
  await assertSucceeds(setDoc(doc(db, 'gare', 'G9'), gara));
  await assertSucceeds(setDoc(doc(db, 'gday', D_SHOT), { from: '09:30', to: '12:00', at: T }));
  await assertSucceeds(setDoc(doc(db, 'settings', 'orari'), { wk: '08:06', wkL: '16:42', we: '09:06', weL: '16:42', step: 12 }));
  await assertSucceeds(setDoc(doc(db, 'allegati', 'a1'), { type: 'application/pdf', parts: 1 }));
  await assertSucceeds(setDoc(doc(db, 'blocked', giorno(8)), { name: 'Chiuso' }));
  await assertSucceeds(getDocs(collection(db, 'contacts')));
  await assertSucceeds(getDocs(collection(db, 'giocatori')));
  await assertSucceeds(deleteDoc(doc(db, 'teetimes', tee(D_OK, '09:30'))));
});
test('amministratore con email NON verificata: nessuna modifica', async () => {
  const db = adminNonVerificato(env);
  await assertFails(setDoc(doc(db, 'gare', 'G9'), gara));
  await assertFails(setDoc(doc(db, 'settings', 'orari'), { step: 5 }));
  await assertFails(getDocs(collection(db, 'contacts')));
});
test('email verificata ma non nell\'elenco amministratori: nessuna modifica', async () => {
  const db = estraneoConEmail(env);
  await assertFails(setDoc(doc(db, 'gare', 'G9'), gara));
  await assertFails(setDoc(doc(db, 'allegati', 'a1'), { type: 'x' }));
  await assertFails(getDocs(collection(db, 'giocatori')));
});
test('accesso con altro provider (non email e password) con email del circolo: rifiutato', async () => {
  const db = env.authenticatedContext('x1', { email: ADMIN_EMAIL, email_verified: true, firebase: { sign_in_provider: 'anonymous', identities: {} } }).firestore();
  await assertFails(setDoc(doc(db, 'gare', 'G9'), gara));
});
test('utenti anonimi e ospiti: nessun accesso a contenuti riservati', async () => {
  for (const db of [anonimo(env, 'alice'), ospite(env)]) {
    await assertFails(setDoc(doc(db, 'gare', 'G9'), gara));
    await assertFails(setDoc(doc(db, 'settings', 'contatti'), { to: 'pirata@esempio.it' }));
    await assertFails(setDoc(doc(db, 'allegati', 'a1'), { type: 'x' }));
    await assertFails(setDoc(doc(db, 'blocked', giorno(8)), { name: 'x' }));
    await assertFails(setDoc(doc(db, 'gday', D_OK), { from: '00:00', to: '23:59' }));
    await assertFails(setDoc(doc(db, 'recensioni', 'r1'), { n: 'x', s: 5, t: 'x' }));
    await assertFails(getDocs(collection(db, 'giocatori')));
    await assertFails(getDocs(collection(db, 'storico')));
    await assertFails(getDocs(collection(db, 'iscrizioni')));
  }
});
test('elenco amministratori: nessuno può aggiungersi, ognuno vede solo sé stesso', async () => {
  await assertFails(setDoc(doc(estraneoConEmail(env), 'admins', 'mallory@esempio.it'), { nome: 'io' }));
  await assertFails(setDoc(doc(admin(env), 'admins', 'mallory@esempio.it'), { nome: 'io' }));
  await assertSucceeds(getDoc(doc(admin(env), 'admins', ADMIN_EMAIL)));
  await assertFails(getDoc(doc(estraneoConEmail(env), 'admins', ADMIN_EMAIL)));
  await assertFails(getDocs(collection(admin(env), 'admins')));
});
test('raccolte non previste: tutto vietato', async () => {
  await assertFails(setDoc(doc(anonimo(env, 'alice'), 'qualsiasi', 'x'), { a: 1 }));
  await assertFails(setDoc(doc(admin(env), 'qualsiasi', 'x'), { a: 1 }));
});
