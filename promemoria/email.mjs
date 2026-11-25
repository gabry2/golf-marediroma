// Aspetto delle email del Golf Marediroma (promemoria, e in futuro conferme e annullamenti).
// HTML "da email": tabelle e stili in linea, niente font esterni né SVG, così si legge bene in Gmail, Outlook e sul telefono.
export const SITO = 'https://gabry2.github.io/golf-marediroma/';
export const TEL = '+39 06 913 3250';
const TEL_LINK = 'tel:+39069133250';
const VERDE = '#1F6B3A', VERDE_SCURO = '#14502A', ORO = '#C9A24A', ORO_SCURO = '#9A7A2C', INCHIOSTRO = '#14261C', GRIGIO = '#55675D';
const SERIF = "Georgia,'Times New Roman',serif", SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param {object} m
 * @param {string} m.titolo      titolo grande (es. "Ci vediamo domani alle 08:06")
 * @param {string} [m.anteprima] testo che i programmi di posta mostrano accanto all'oggetto
 * @param {string} m.intro       prima frase
 * @param {[string,string][]} m.righe  dettagli (etichetta, valore)
 * @param {string} [m.nota]      riquadro informativo (es. come annullare)
 * @param {{testo:string,link:string,pieno?:boolean}[]} [m.bottoni]
 * @param {string} [m.saluto]    frase finale
 */
export function componi(m) {
  const righe = (m.righe || []).filter(([, v]) => v);
  const text = [m.titolo, '', m.intro, '', ...righe.map(([k, v]) => `${k}: ${v}`), '',
    ...(m.nota ? [m.nota, ''] : []), ...(m.bottoni || []).map((b) => `${b.testo}: ${b.link}`), '',
    m.saluto || 'A presto al Golf Marediroma!', '', '—', 'Golf Marediroma · Via Enna, 30 – 00040 Ardea (RM)', `Segreteria ${TEL} · ${SITO}`].join('\n');

  const dett = righe.map(([k, v], i) => `
      <tr><td style="padding:12px 0;${i ? 'border-top:1px solid #E6E1D2;' : ''}">
        <div style="font:600 11px/1.4 ${SANS};letter-spacing:.12em;text-transform:uppercase;color:${ORO_SCURO}">${esc(k)}</div>
        <div style="font:600 18px/1.4 ${SERIF};color:${INCHIOSTRO};margin-top:2px">${esc(v)}</div>
      </td></tr>`).join('');

  const bott = (m.bottoni || []).map((b) => b.pieno
    ? `<a href="${esc(b.link)}" style="display:inline-block;margin:6px 6px 0 0;padding:13px 22px;border-radius:999px;background:${VERDE};color:#fff;font:700 15px/1 ${SANS};text-decoration:none">${esc(b.testo)}</a>`
    : `<a href="${esc(b.link)}" style="display:inline-block;margin:6px 6px 0 0;padding:11px 20px;border-radius:999px;border:2px solid ${VERDE};color:${VERDE};font:700 15px/1 ${SANS};text-decoration:none">${esc(b.testo)}</a>`).join('');

  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(m.titolo)}</title></head>
<body style="margin:0;padding:0;background:#F3F1EA">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(m.anteprima || m.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F1EA"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E6E1D2">
    <tr><td align="center" style="background:${VERDE};padding:26px 20px 22px">
      <a href="${SITO}" style="text-decoration:none"><img src="${SITO}img/logo-email.png" width="120" height="93" alt="Golf Marediroma" style="display:block;border:0;width:120px;height:auto;color:#fff;font:700 22px ${SERIF}"></a>
    </td></tr>
    <tr><td style="height:4px;line-height:4px;font-size:0;background:${ORO}">&nbsp;</td></tr>
    <tr><td style="padding:30px 30px 8px">
      <h1 style="margin:0 0 12px;font:600 26px/1.25 ${SERIF};color:${VERDE_SCURO}">${esc(m.titolo)}</h1>
      <p style="margin:0;font:400 17px/1.55 ${SERIF};color:${INCHIOSTRO}">${esc(m.intro)}</p>
    </td></tr>
    ${dett ? `<tr><td style="padding:18px 30px 6px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7EC;border-radius:12px;border-left:4px solid ${ORO}"><tr><td style="padding:6px 20px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${dett}</table></td></tr></table>
    </td></tr>` : ''}
    ${m.nota ? `<tr><td style="padding:16px 30px 0"><p style="margin:0;padding:14px 16px;background:#F4F7F5;border-radius:10px;font:400 15px/1.5 ${SANS};color:${GRIGIO}">${esc(m.nota)}</p></td></tr>` : ''}
    ${bott ? `<tr><td style="padding:18px 30px 0">${bott}</td></tr>` : ''}
    <tr><td style="padding:24px 30px 30px"><p style="margin:0;font:italic 400 17px/1.5 ${SERIF};color:${VERDE_SCURO}">${esc(m.saluto || 'A presto al Golf Marediroma!')}</p></td></tr>
    <tr><td style="background:${VERDE_SCURO};padding:20px 30px;font:400 13px/1.6 ${SANS};color:#D7E4DB">
      <strong style="color:#fff">Golf Marediroma</strong> · Via Enna, 30 – 00040 Ardea (RM)<br>
      Segreteria <a href="${TEL_LINK}" style="color:#E9C873;text-decoration:none">${TEL}</a> ·
      <a href="${SITO}" style="color:#E9C873;text-decoration:none">Sito</a> ·
      <a href="https://www.instagram.com/golfmarediroma/" style="color:#E9C873;text-decoration:none">Instagram</a> ·
      <a href="https://www.facebook.com/profile.php?id=61555593376704" style="color:#E9C873;text-decoration:none">Facebook</a><br>
      <span style="color:#A9BFB1;font-size:12px">Riceve questa email perché ha prenotato sul sito del Golf Marediroma.</span>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
  return { text, html };
}
