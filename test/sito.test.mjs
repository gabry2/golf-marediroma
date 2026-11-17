// Test del sito vero (index.html) contro Firebase Emulator, con le regole nuove attive:
// verifica che il sito e le regole siano compatibili prima di pubblicarle in produzione.
// Il sito si collega all'emulatore solo da 127.0.0.1 con ?emu=1 (progetto finto "demo-golf").
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';
import { doc, setDoc, getDoc, getDocs, collection } from 'firebase/firestore';
import { assertSucceeds } from '@firebase/rules-unit-testing';
import { ambiente, giorno, tee, slotK, anonimo, ADMIN_EMAIL } from './comune.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const TIPI = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };
const AUTH = 'http://127.0.0.1:9099';
const PW = 'Prova-sicura-2026!';
let env, server, browser, base;
const T = Date.now();
const D_GARA = giorno(5);

async function leggiTutto(col) {
  let out = {};
  await env.withSecurityRulesDisabled(async (ctx) => {
    const sn = await getDocs(collection(ctx.firestore(), col));
    sn.forEach((d) => { out[d.id] = d.data(); });
  });
  return out;
}
async function nuovoUtente(email, verificato) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=finta`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW, returnSecureToken: true }) });
  const j = await r.json(); assert.ok(j.localId, 'utente non creato: ' + JSON.stringify(j));
  if (verificato) {
    const u = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/demo-golf/accounts:update`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer owner' }, body: JSON.stringify({ localId: j.localId, emailVerified: true }) });
    assert.equal(u.status, 200, 'verifica email non riuscita');
  }
  return j.localId;
}
async function pagina(hash) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, timezoneId: 'Europe/Rome', locale: 'it-IT' });
  const pg = await ctx.newPage();
  const errori = [];
  pg.on('pageerror', (e) => errori.push(String(e)));
  pg.on('dialog', (d) => d.accept());
  await pg.route(/api\.met\.no|formsubmit\.co/, (r) => r.fulfill({ status: 200, body: '{}', contentType: 'application/json' }));
  await pg.goto(`${base}/index.html?emu=1${hash}`);
  return { pg, ctx, errori };
}
const attendi = async (cond, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 250)); } return false; };

before(async () => {
  env = await ambiente();
  await env.clearFirestore();
  await fetch(`${AUTH}/emulator/v1/projects/demo-golf/accounts`, { method: 'DELETE' });
  server = createServer(async (req, res) => {
    try {
      const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[\/\\])+/, '');
      const f = join(ROOT, p === '/' ? 'index.html' : p);
      if (!f.startsWith(ROOT) || f.includes('node_modules')) throw 0;
      res.writeHead(200, { 'content-type': TIPI[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
  await mkdir(new URL('./risultati/', import.meta.url), { recursive: true });
});
after(async () => { await browser?.close(); server?.close(); await env?.cleanup(); });

test('sito: un visitatore anonimo prenota un tee time e lo annulla', async () => {
  const { pg, ctx, errori } = await pagina('#tee-time');
  assert.ok(await attendi(() => pg.locator('#slots .slot').count().then((n) => n > 0)), 'gli orari non compaiono');
  await pg.locator('#days button').nth(1).click();
  await pg.locator('#slots .slot:not([disabled]):not(.mine)').first().click();
  await pg.selectOption('#pl', '2');
  await pg.fill('#fn1', 'Mario'); await pg.fill('#ln1', 'Rossi'); await pg.fill('#fn2', 'Anna'); await pg.fill('#ln2', 'Bianchi');
  await pg.fill('#em', 'mario@esempio.it'); await pg.fill('#tel', '333 1234567');
  await pg.click('#go');
  let tt = {};
  assert.ok(await attendi(async () => { tt = await leggiTutto('teetimes'); return Object.keys(tt).length === 1; }), 'prenotazione non salvata: ' + await pg.locator('#msg').innerText());
  const [id, v] = Object.entries(tt)[0];
  const [uid, voce] = Object.entries(v.p)[0];
  assert.equal(v.n, 2); assert.equal(voce.n, 2); assert.ok(!('parts' in v), 'resta il vecchio formato');
  const ct = await leggiTutto('contacts');
  assert.equal(ct[uid].list[0].slot, id);
  await pg.screenshot({ path: new URL('./risultati/tee-prenotato.png', import.meta.url).pathname });
  await pg.locator('#slots .slot.mine').first().click();
  assert.ok(await attendi(async () => Object.keys(await leggiTutto('teetimes')).length === 0), 'annullamento non riuscito');
  assert.deepEqual(errori, []);
  await ctx.close();
});

test('sito: iscrizione a una gara con orario e cart, collegati in modo sicuro', async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'gare', 'GE2E'), { name: 'Gara di prova', date: D_GARA, from: '09:30', to: '12:00', shotgun: false, coppie: false, chiusa: false, formula: 'singolo', buche: 9 });
    await setDoc(doc(db, 'gday', D_GARA), { from: '09:30', to: '12:00', at: T });
  });
  const { pg, ctx, errori } = await pagina('#gare');
  const btn = pg.locator("button:has-text('Iscriviti'):visible").first();
  assert.ok(await attendi(() => btn.count().then((n) => n > 0)), 'la gara non compare');
  await btn.click();
  await pg.evaluate(() => { const s = document.getElementById('iNum'); s.value = '2'; s.dispatchEvent(new Event('change')); });
  await pg.evaluate(() => { const s = document.getElementById('iTime'); const o = [...s.options].find((x) => x.value && !/^k:/.test(x.value)); s.value = o.value; s.dispatchEvent(new Event('change')); });
  await pg.fill('#iFn1', 'Luca'); await pg.fill('#iLn1', 'Verdi'); await pg.fill('#iFn2', 'Paolo'); await pg.fill('#iLn2', 'Neri');
  await pg.fill('#iEm', 'luca@esempio.it'); await pg.fill('#iTel', '3331112222');
  await pg.check('#iCart');
  await pg.click('#iGo');
  let fl = {};
  assert.ok(await attendi(async () => { fl = await leggiTutto('gflights'); return Object.keys(fl).length === 1 && Object.keys(await leggiTutto('cart')).length === 1; }),
    'iscrizione non completa: ' + await pg.locator('#iMsg').innerText());
  const [fid, f] = Object.entries(fl)[0];
  const [uid, voce] = Object.entries(f.p)[0];
  assert.equal(f.n, 2); assert.equal(voce.c, 1, 'il cart non è collegato alla voce del flight');
  const ca = (await leggiTutto('cart'))['GE2E_1'];
  assert.equal(ca.by, uid); assert.equal(`GE2E_${ca.k}`, fid);
  const is = await leggiTutto('iscrizioni');
  assert.equal(is[uid].list[0].cartSlot, 1);
  // il giocatore può liberare cart e posto (come fa il sito quando annulla)
  const db = anonimo(env, uid);
  const { deleteDoc } = await import('firebase/firestore');
  await assertSucceeds(deleteDoc(doc(db, 'cart', 'GE2E_1')));
  await assertSucceeds(deleteDoc(doc(db, 'gflights', fid)));
  assert.deepEqual(errori, []);
  await ctx.close();
});

test('sito: l\'amministratore scarica la copia e converte i vecchi documenti senza perdere prenotazioni', async () => {
  await nuovoUtente(ADMIN_EMAIL, true);
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'admins', ADMIN_EMAIL), { nome: 'Segreteria' });
    await setDoc(doc(db, 'teetimes', tee(giorno(2), '09:30')), { at: T, n: 3, parts: [{ by: 'vecchio1', n: 2, at: T }, { by: 'vecchio2', n: 1, at: T }] });
    await setDoc(doc(db, 'gflights', `GE2E_${slotK('10:30')}`), { gara: 'GE2E', cap: 4, n: 2, parts: [{ by: 'vecchio1', n: 1, at: T }, { by: 'vecchio1', n: 1, at: T }], pref: '10:30', at: T });
  });
  const { pg, ctx, errori } = await pagina('#amministrazione');
  await pg.fill('#lgE', ADMIN_EMAIL); await pg.fill('#lgP', PW);
  await pg.click('#loginF button[type=submit]');
  assert.ok(await attendi(() => pg.locator('#secInfo').innerText().then((t) => /Da aggiornare/.test(t)).catch(() => false), 20000), 'pannello sicurezza non visibile');
  assert.match(await pg.locator('#secInfo').innerText(), /1 tee time e 1 partenza/);
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#secBak')]);
  assert.match(dl.suggestedFilename(), /copia-prenotazioni/);
  await pg.click('#secMig');
  assert.ok(await attendi(() => pg.locator('#secMsg').innerText().then((t) => /Fatto/.test(t))), 'conversione non riuscita: ' + await pg.locator('#secMsg').innerText());
  const tt = (await leggiTutto('teetimes'))[tee(giorno(2), '09:30')];
  assert.deepEqual(tt.p, { vecchio1: { n: 2, at: T }, vecchio2: { n: 1, at: T } }); assert.equal(tt.n, 3);
  const f = (await leggiTutto('gflights'))[`GE2E_${slotK('10:30')}`];
  assert.equal(f.p.vecchio1.n, 2); assert.equal(f.n, 2);
  // dopo la conversione ognuno può annullare la propria parte con le regole nuove
  const { updateDoc, deleteField } = await import('firebase/firestore');
  await assertSucceeds(updateDoc(doc(anonimo(env, 'vecchio2'), 'teetimes', tee(giorno(2), '09:30')), { n: 2, 'p.vecchio2': deleteField() }));
  await pg.screenshot({ path: new URL('./risultati/admin-sicurezza.png', import.meta.url).pathname });
  assert.deepEqual(errori, []);
  await ctx.close();
});

test('sito: un amministratore con email non verificata viene avvisato', async () => {
  const email = 'nuovo.admin@esempio.it';
  await nuovoUtente(email, false);
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'admins', email), { nome: 'Nuovo' }); });
  const { pg, ctx } = await pagina('#amministrazione');
  await pg.fill('#lgE', email); await pg.fill('#lgP', PW);
  await pg.click('#loginF button[type=submit]');
  assert.ok(await attendi(() => pg.locator('text=non è ancora verificata').count().then((n) => n > 0), 20000), 'manca l\'avviso di verifica');
  await ctx.close();
});
