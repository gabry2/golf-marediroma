// Quando inviare i promemoria (ora di Roma).
// Tee time: prima delle 9:00 → la sera prima alle 18:30 (così si può ancora annullare entro le 19:00);
//           dalle 9:00 alle 12:00 → 1 ora prima; dalle 12:00 in poi → 2 ore prima.
// Gare: il giorno prima alle 15:00.
export const TZ = 'Europe/Rome';
export const SERA_PRIMA = '18:30';
export const GARA_ORA = '15:00';

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function parti(d) { const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value])); return p; }

/** istante (Date) corrispondente a "AAAA-MM-GG" e "HH:MM" nell'ora di Roma */
export function roma(ymd, hm) {
  const [y, m, d] = ymd.split('-').map(Number), [H, M] = hm.split(':').map(Number);
  const voluto = Date.UTC(y, m - 1, d, H, M);
  let t = voluto;
  for (let i = 0; i < 3; i++) {
    const p = parti(new Date(t));
    const visto = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    t += voluto - visto;
  }
  return new Date(t);
}
/** data di Roma ("AAAA-MM-GG") di un istante */
export function giornoRoma(d) { const p = parti(d); return `${p.year}-${p.month}-${p.day}`; }
export function giornoPrima(ymd) { const [y, m, d] = ymd.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d - 1)); return x.toISOString().slice(0, 10); }
export function giornoDopo(ymd) { const [y, m, d] = ymd.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d + 1)); return x.toISOString().slice(0, 10); }

/** momento del promemoria di un tee time */
export function quandoTee(ymd, hm) {
  const [H, M] = hm.split(':').map(Number), min = H * 60 + M, inizio = roma(ymd, hm);
  if (min < 9 * 60) return roma(giornoPrima(ymd), SERA_PRIMA);
  if (min < 12 * 60) return new Date(inizio.getTime() - 60 * 60000);
  return new Date(inizio.getTime() - 120 * 60000);
}
/** momento del promemoria di una gara */
export function quandoGara(ymd) { return roma(giornoPrima(ymd), GARA_ORA); }

/** va inviato adesso? sì se il momento è arrivato da meno di 3 ore, la partenza non è ancora passata
 *  e la prenotazione era stata fatta prima del momento del promemoria */
export function daInviare(ora, momento, inizio, prenotatoIl) {
  const t = ora.getTime();
  return t >= momento.getTime() && t < momento.getTime() + 3 * 3600000 && t < inizio.getTime()
    && (!prenotatoIl || prenotatoIl < momento.getTime());
}
