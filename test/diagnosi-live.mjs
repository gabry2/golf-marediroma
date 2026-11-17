// Diagnosi in sola lettura del sito pubblicato: apre le pagine come un visitatore qualsiasi
// e riporta errori e stato dei riquadri. Non scrive nulla nel database.
import { chromium } from 'playwright';
const URL0 = process.env.SITO || 'https://gabry2.github.io/golf-marediroma/';
const b = await chromium.launch();
for (const [nome, opt] of [['pc', { viewport: { width: 1300, height: 900 } }], ['telefono', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
  const ctx = await b.newContext({ ...opt, timezoneId: 'Europe/Rome', locale: 'it-IT' });
  const pg = await ctx.newPage(); const log = [];
  pg.on('pageerror', (e) => log.push('ERRORE JS: ' + (e.stack || e).toString().slice(0, 500)));
  pg.on('console', (m) => { if (['error', 'warning'].includes(m.type())) log.push(m.type() + ': ' + m.text().slice(0, 300)); });
  pg.on('requestfailed', (r) => log.push('richiesta fallita: ' + r.url().slice(0, 140) + ' ' + r.failure()?.errorText));
  pg.on('response', (r) => { if (r.status() >= 400) log.push('HTTP ' + r.status() + ' ' + r.url().slice(0, 140)); });
  await pg.goto(URL0 + '?diag=' + Date.now(), { waitUntil: 'load' });
  await pg.waitForTimeout(12000);
  const stato = await pg.evaluate(() => ({
    tiles: (document.querySelector('.h-live') || {}).innerText,
    prossimeGare: (document.getElementById('hgList') || {}).innerText,
    gmAuth: window.gmAuth ? { anon: window.gmAuth.anon, admin: window.gmAuth.isAdmin, why: window.gmAuth.why } : 'assente',
    hashScript: [...document.scripts].length,
  }));
  // controllo in sola lettura: con le regole nuove un visitatore non può leggere i vecchi lucchetti né i dati personali altrui
  stato.regole = await pg.evaluate(async () => {
    const db = await window.claude.use('db'); if (!db) return 'database non disponibile';
    const prova = async (p) => { try { await db.doc(p).get(); return 'letto'; } catch (e) { return 'negato'; } };
    return { lucchetti: await prova('leases/prova'), contattiAltrui: await prova('contacts/utente-inesistente'), teetimes: await prova('teetimes/prova') };
  });
  console.log('REGOLE ' + JSON.stringify(stato.regole));
  console.log(`\n===== ${nome} =====\n` + JSON.stringify(stato, null, 1));
  for (const h of ['#chisiamo', '#circolo', '#contatti', '#tee-time']) {
    await pg.evaluate((x) => { location.hash = x; }, h); await pg.waitForTimeout(2500);
    await pg.evaluate(() => window.scrollTo(0, 700)); await pg.waitForTimeout(1500);
    const s = await pg.evaluate((x) => {
      const r = { pagina: x };
      const tl = document.querySelector('.cs-band .cs-tl'); if (tl && x === '#chisiamo') r.lineaDelTempo = getComputedStyle(tl).getPropertyValue('--tp');
      if (x === '#tee-time') r.orari = (document.getElementById('slots') || {}).innerText?.slice(0, 200) + ' | stato: ' + (document.getElementById('status') || {}).innerText;
      if (x === '#circolo') r.mappa = !!document.querySelector('#p-circolo svg') + ' buche:' + document.querySelectorAll('#p-circolo [data-h], #p-circolo .hb').length;
      return r;
    }, h);
    console.log(JSON.stringify(s));
  }
  console.log('--- registro ---\n' + [...new Set(log)].slice(0, 60).join('\n'));
  await ctx.close();
}
await b.close();
