# Test di sicurezza del database

Questi test controllano le regole di `firestore.rules` e il sito (`index.html`) usando **Firebase Emulator**,
un database finto che gira sul computer (progetto `demo-golf`). Il database vero del circolo non viene mai toccato.

## Su GitHub
Partono da soli a ogni modifica (scheda **Actions** → «Test sicurezza database»).

## Sul proprio computer
Servono Node.js 20+ e Java 21.

```
cd test
npm install
npx playwright install chromium
npm test            # regole + sito
npm run test:regole # solo regole
```

Cosa viene provato:
- `regole.test.mjs`: utenti anonimi, amministratori verificati e non, estranei; prenotazioni valide e tentativi vietati
  (date passate, orari fuori griglia, giorni chiusi, gare chiuse, prenotazioni altrui, cart, dati personali).
- `sito.test.mjs`: il sito vero, nel browser, prenota e annulla un tee time, si iscrive a una gara con cart,
  e l'amministratore converte i vecchi documenti al formato sicuro senza perdere prenotazioni.
