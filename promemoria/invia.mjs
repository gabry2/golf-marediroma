// Promemoria via email per tee time e gare del Golf Marediroma.
// Gira su GitHub Actions ogni 15 minuti (vedi .github/workflows/promemoria.yml).
// Legge le prenotazioni da Firestore con un account di servizio e segna in "promemoria/" quelli già inviati,
// così ogni giocatore ne riceve uno solo. La raccolta "promemoria" non è leggibile dal sito.
//
// Variabili (segreti di GitHub):
//   FIREBASE_SERVICE_ACCOUNT  JSON della chiave dell'account di servizio (obbligatoria, tranne con l'emulatore)
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM   invio tramite un proprio server di posta (consigliato)
//   MAIL_REPLYTO  a chi arrivano le risposte dei giocatori (di base la segreteria)
//   senza SMTP: invio tramite FormSubmit, come le conferme del sito (copia anche alla segreteria)
//   MAIL_DRYRUN=1   non invia nulla: stampa le email (usato nei test)
//   ORA_PROVA       data e ora finta in formato ISO (solo per i test)
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import { roma, giornoRoma, giornoDopo, quandoTee, quandoGara, daInviare } from './orari.mjs';

const E = process.env;
const SITO = 'https://gabry2.github.io/golf-marediroma/';
const SEGRETERIA = '+39 06 913 3250';
const ora = E.ORA_PROVA ? new Date(E.ORA_PROVA) : new Date();

if (!E.FIRESTORE_EMULATOR_HOST && !E.FIREBASE_SERVICE_ACCOUNT) {
  console.log('Promemoria non ancora configurati: manca il segreto FIREBASE_SERVICE_ACCOUNT. Nessun invio.');
  process.exit(0);
}
const app = E.FIRESTORE_EMULATOR_HOST
  ? initializeApp({ projectId: E.GCLOUD_PROJECT || 'demo-golf' })
  : initializeApp({ credential: cert(JSON.parse(E.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore(app);

// ---------- invio ----------
let trasporto = null;
async function invia(to, oggetto, righe) {
  const testo = righe.map(([k, v]) => (k ? `${k}: ${v}` : v)).join('\n');
  if (E.MAIL_DRYRUN) { console.log(JSON.stringify({ to, oggetto, righe })); return; }
  if (E.SMTP_HOST) {
    if (!trasporto) {
      const nm = await import('nodemailer');
      trasporto = nm.default.createTransport({ host: E.SMTP_HOST, port: +(E.SMTP_PORT || 465), secure: +(E.SMTP_PORT || 465) === 465, auth: { user: E.SMTP_USER, pass: E.SMTP_PASS } });
    }
    const html = '<div style="font-family:Georgia,serif;font-size:16px;color:#1b2a21;max-width:560px">'
      + `<h2 style="color:#14502A;font-weight:600">${esc(oggetto)}</h2>`
      + righe.map(([k, v]) => (k ? `<p style="margin:.4em 0"><strong>${esc(k)}:</strong> ${esc(v)}</p>` : `<p>${esc(v)}</p>`)).join('')
      + `<p style="margin-top:1.5em;color:#5b6b61;font-size:14px">Golf Marediroma · Via Enna, 30 – 00040 Ardea (RM) · ${SEGRETERIA}</p></div>`;
    await trasporto.sendMail({ from: E.MAIL_FROM || E.SMTP_USER, replyTo: E.MAIL_REPLYTO || 'segreteriasportiva@golfmarediroma.com', to, subject: oggetto, text: testo, html });
    return;
  }
  // FormSubmit, come le conferme del sito: arriva al giocatore in copia e alla segreteria
  const st = await db.doc('settings/contatti').get();
  const club = (st.exists && st.data().to) || 'signor.gabriele22@gmail.com';
  const body = { _subject: oggetto, _template: 'table', _captcha: 'false', _cc: to, _replyto: club, email: to };
  for (const [k, v] of righe) body[k || 'Messaggio'] = v;
  const r = await fetch(`https://formsubmit.co/ajax/${club}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: SITO.replace(/\/golf-marediroma\/$/, ''), Referer: SITO }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('FormSubmit ' + r.status);
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nomi = (pl) => (pl || []).map((p) => `${p.first || ''} ${p.last || ''}`.trim() + (p.fg ? ' (fuori gara)' : '')).filter((x) => x && x !== ' (fuori gara)').join(', ') || '—';
const dLong = (ymd) => new Date(roma(ymd, '12:00')).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' });

// Prova: con PROVA_A=indirizzo invia solo un'email di prova e si ferma
if (E.PROVA_A) {
  await invia(E.PROVA_A, 'Prova promemoria – Golf Marediroma', [
    ['', 'Questa è un\'email di prova dei promemoria del Golf Marediroma.'],
    ['Esempio', 'Promemoria: tee time domani alle 08:06'],
    ['', 'Se la leggi, l\'invio funziona. Buon golf!'],
  ]);
  console.log('Email di prova inviata a ' + E.PROVA_A);
  process.exit(0);
}
async function giaInviato(chiave) { return (await db.doc(`promemoria/${chiave}`).get()).exists; }
async function segna(chiave, dati) { await db.doc(`promemoria/${chiave}`).set({ ...dati, inviato: ora.getTime() }); }
function voci(d) {
  if (d && d.p && typeof d.p === 'object' && !Array.isArray(d.p)) return Object.entries(d.p).map(([by, v]) => ({ by, ...v }));
  if (d && Array.isArray(d.parts)) return d.parts;
  return [];
}

let inviati = 0, errori = 0;

// ---------- tee time: oggi e domani ----------
const oggi = giornoRoma(ora), domani = giornoDopo(oggi), dopo = giornoDopo(domani);
const tt = await db.collection('teetimes').where(FieldPath.documentId(), '>=', `${oggi}_0000`).where(FieldPath.documentId(), '<', `${dopo}_0000`).get();
for (const doc of tt.docs) {
  const id = doc.id, ymd = id.slice(0, 10), hm = `${id.slice(11, 13)}:${id.slice(13, 15)}`;
  const inizio = roma(ymd, hm), momento = quandoTee(ymd, hm);
  if (!daInviare(ora, momento, inizio, null)) continue;
  for (const v of voci(doc.data())) {
    if (!v.by || v.by === 'legacy') continue;
    const chiave = `t_${id}_${v.by}`;
    if (await giaInviato(chiave)) continue;
    const ct = await db.doc(`contacts/${v.by}`).get();
    const e = ((ct.exists && ct.data().list) || []).filter((x) => x && x.slot === id && x.email).pop();
    if (!e || !daInviare(ora, momento, inizio, +e.at || +v.at || 0)) continue;
    try {
      await invia(e.email, `Promemoria: tee time ${ymd === oggi ? 'oggi' : 'domani'} alle ${hm} – Golf Marediroma`, [
        ['', 'Le ricordiamo la Sua prenotazione al Golf Marediroma.'],
        ['Giorno', dLong(ymd)], ['Ora di partenza', hm], ['Giocatori', nomi(e.players)],
        ['Se non può più venire', `Annulli dalla pagina Prenota tee time del sito (${SITO}#tee-time) fino alle 19:00 del giorno prima, oppure chiami la segreteria al ${SEGRETERIA}.`],
        ['', 'Buona partita!'],
      ]);
      await segna(chiave, { tipo: 'tee', slot: id, uid: v.by });
      inviati++;
    } catch (err) { errori++; console.error('Invio non riuscito', chiave, err.message); }
  }
}

// ---------- gare: quelle di domani, il giorno prima alle 15:00 ----------
const gare = await db.collection('gare').where('date', '==', domani).get();
for (const g of gare.docs) {
  const G = g.data(), momento = quandoGara(G.date), inizio = roma(G.date, /^\d\d:\d\d$/.test(G.from || '') ? G.from : '08:00');
  if (!daInviare(ora, momento, inizio, null)) continue;
  const fl = await db.collection('gflights').where('gara', '==', g.id).get();
  const uids = new Set();
  fl.docs.forEach((f) => voci(f.data()).forEach((v) => v.by && v.by !== 'legacy' && uids.add(v.by)));
  for (const uid of uids) {
    const chiave = `g_${g.id}_${uid}`;
    if (await giaInviato(chiave)) continue;
    const is = await db.doc(`iscrizioni/${uid}`).get();
    const mie = ((is.exists && is.data().list) || []).filter((x) => x && x.gara === g.id && x.email && (+x.at || 0) < momento.getTime());
    if (!mie.length) continue;
    const e = mie[mie.length - 1], gioc = nomi(mie.flatMap((x) => x.players || []));
    const orario = G.shotgun ? `Shotgun alle ${G.from}` : (mie.map((x) => x.pref).filter(Boolean).join(', ') ? `Partenza alle ${mie.map((x) => x.pref).filter(Boolean).join(', ')}` : `Partenze dalle ${G.from}`);
    try {
      await invia(e.email, `Promemoria: domani la gara «${G.name}» – Golf Marediroma`, [
        ['', 'Le ricordiamo che domani gioca la gara al Golf Marediroma.'],
        ['Gara', G.name], ['Giorno', dLong(G.date)], ['Orario', orario], ['Giocatori', gioc],
        ...(mie.some((x) => x.cartSlot) ? [['Cart', `prenotato (cart n. ${mie.find((x) => x.cartSlot).cartSlot})`]] : []),
        ['Per informazioni', `Chiami la segreteria al ${SEGRETERIA}.`],
        ['', 'Le auguriamo una buona gara!'],
      ]);
      await segna(chiave, { tipo: 'gara', gara: g.id, uid });
      inviati++;
    } catch (err) { errori++; console.error('Invio non riuscito', chiave, err.message); }
  }
}

console.log(`Promemoria inviati: ${inviati}${errori ? `, non riusciti: ${errori}` : ''} (${ora.toISOString()})`);
process.exit(errori ? 1 : 0);
