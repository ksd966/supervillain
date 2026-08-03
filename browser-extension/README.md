# Lead Harvester — Chrome/Edge ekstenzija

Pretražuješ Google normalno. Ekstenzija u pozadini kupi rezultate, pa jednim
klikom obiđe te sajtove i izvuče **e-mail adrese, imena i Instagram profile**.
Drugi klik — CSV.

## Zašto ovo radi bolje od actor-a za Google

Actor koji ide na Google iz skripte dobija CAPTCHA već posle nekoliko pretraga.
Ekstenzija radi **u tvom pravom browseru, u tvojoj sesiji** — Google vidi
korisnika koji pretražuje, jer to i jeste. Nema proxija, nema fingerprint
igara, nema blokade.

Cena je što ti sam kucaš pretrage. Za nišu u gradu to je nekoliko pretraga, pa
je razmena povoljna.

## Instalacija

1. Chrome/Edge → `chrome://extensions`
2. Uključi **Developer mode** (gore desno)
3. **Load unpacked** → izaberi folder `browser-extension`

Nema build koraka, nema `npm install`. Ekstenzija je čist JavaScript.

## Kako se koristi

1. Otvori Google i pretraži nišu i grad: `frizerski salon Novi Sad`
2. Rezultati se kupe sami — brojka na ikoni raste. Prelistaj još par strana
   rezultata, kupe se i one.
3. Klikni ikonu → **Izvuci kontakte**. Ekstenzija obiđe skupljene sajtove i
   izvuče kontakte. Ako na početnoj strani nema adrese, proba `/kontakt`,
   `/contact`, `/o-nama`.
4. **CSV** — preuzimaš spisak.

Dugme **Skeniraj ovu stranu** radi na bilo kojoj stranici, ne samo na Google
rezultatima — korisno na direktorijumima, katalozima, listama članova.

Dugme **→ Panel** šalje sve nađene Instagram handle-ove u
`instagram-email-scraper` preko lokalnog panela. Zahteva token panela u
podešavanjima.

Radi i na Bing i DuckDuckGo rezultatima.

## Šta se ne skuplja

Preskaču se agregatori i mreže na kojima nema šta da se nađe: Google, YouTube,
Facebook, Instagram, LinkedIn, TikTok, Wikipedia, Amazon, Booking, TripAdvisor,
Yelp, Reddit, Quora, Medium.

Filtriranje adresa je isto kao u actor-ima — `logo@2x.png`, Sentry ključevi,
`you@example.com` i slično ne prolaze.

## CSV

```csv
name,emails,instagram,phone,url,query,foundAt,scannedAt
Salon Ana,office@salonana.rs,salon_ana,+381211234567,https://salonana.rs/,frizerski salon novi sad,...
```

Fajl ima BOM, pa Excel odmah ispravno prikaže š/č/ž.

## Podešavanja

| | |
| --- | --- |
| Automatski kupi rezultate | isključi ako hoćeš samo ručno skeniranje |
| Adresa panela | podrazumevano `http://localhost:8377` |
| Token panela | ispisuje se u konzoli kad se panel pokrene |
| Paralelnih zahteva | podrazumevano 3 |
| Pauza između zahteva | podrazumevano 400 ms |

**Ne diži paralelnost visoko.** Zahtevi idu sa tvoje IP adrese; brzina je
jedina razlika između „posilac" i „bot" za većinu sajtova.

## Ograničenja

- **Google daje ~10 rezultata po strani.** Prelistaj nekoliko strana, ili
  koristi `&num=50` u URL-u pretrage ako Google to još poštuje za tvoj nalog.
- **Sajt bez kontakt podataka ne daje ništa.** Zanatlije često nemaju sajt —
  za njih je `google-leads-scraper` sa Google Maps izvorom bolji, jer bar
  telefon uvek postoji.
- **Deep scan je pravi saobraćaj sa tvoje IP adrese.** Nekoliko stotina sajtova
  dnevno je normalno; nekoliko hiljada u sat vremena nije.
- Podaci stoje u `chrome.storage.local` — samo na tvom računaru, dok ne
  klikneš „Obriši".

## Struktura

```
manifest.json      MV3
content-serp.js    čita rezultate sa strane pretrage (ništa ne preuzima)
background.js      storage, deep scan, most ka panelu
popup.html/js      lista, CSV, podešavanja
emails.js          detekcija/de-obfuskacija/filtriranje   [deljeno sa actor-ima]
social.js          Instagram handle-ovi                   [deljeno sa actor-ima]
```

`emails.js` i `social.js` su identične kopije iz actor-a — zato su i pisane bez
ijedne zavisnosti, da mogu da rade i u service workeru gde nema ni npm-a ni
DOM-a. `npm test` u rootu repoa pada ako se kopije raziđu.
