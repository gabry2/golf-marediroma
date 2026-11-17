// Strumenti comuni ai test: date nel fuso del circolo, utenti finti, dati di partenza.
// Tutto gira sull'emulatore Firebase con il progetto finto "demo-golf": il database vero non viene mai toccato.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

export const PROJECT = 'demo-golf';

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
/** data "AAAA-MM-GG" a Roma fra k giorni (k negativo = nel passato) */
export const giorno = (k) => fmt.format(new Date(Date.now() + k * 86400000));
/** id di un tee time */
export const tee = (d, hhmm) => `${d}_${hhmm.replace(':', '')}`;
/** chiave di una partenza (gara non shotgun) */
export const slotK = (hhmm) => 10000 + Number(hhmm.replace(':', ''));

export async function ambiente() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Avvia i test con "npm test": servono gli emulatori Firebase (FIRESTORE_EMULATOR_HOST non impostato).');
  }
  return initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
}

// ---- Utenti finti ----
export const anonimo = (env, uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous', identities: {} } }).firestore();
export const conEmail = (env, uid, email, verificata) =>
  env.authenticatedContext(uid, { email, email_verified: verificata, firebase: { sign_in_provider: 'password', identities: { email: [email] } } }).firestore();
export const ADMIN_EMAIL = 'segreteria@esempio.it';
export const admin = (env) => conEmail(env, 'adm1', ADMIN_EMAIL, true);
export const adminNonVerificato = (env) => conEmail(env, 'adm2', 'nuovo.admin@esempio.it', false);
export const estraneoConEmail = (env) => conEmail(env, 'mallory', 'mallory@esempio.it', true);
export const ospite = (env) => env.unauthenticatedContext().firestore();
