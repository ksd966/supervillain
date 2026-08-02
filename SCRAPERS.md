# Lead scraping actors

Tri Apify actor-a koji rade lokalno, bez naloga i bez troška. Isti kod se može
pushovati na Apify bez izmena, ako i kada zatreba.

## Kako se uklapaju

```
        niša + grad
             │
             ▼
  ┌──────────────────────┐
  │ google-leads-scraper │  Google Maps + OpenStreetMap
  └──────────┬───────────┘  → biznisi, telefoni, sajtovi
             │
             ├──────────────► EMAILS_CSV        (gotovi lead-ovi)
             │
             ▼
     INSTAGRAM_HANDLES
             │
             ▼
  ┌────────────────────────┐
  │ instagram-email-scraper│  profil → business e-mail, bio, bio link
  └────────────┬───────────┘
               │
               ▼
          EMAILS_CSV
```

`apify-actor` je generički crawler — bilo koji sajt, tvoji CSS selektori, plus
ekstrakcija e-mailova. Koristi ga kad ti treba nešto što ova druga dva ne
pokrivaju.

## Actor-i

| Mapa | Šta radi | Blokira li se |
| --- | --- | --- |
| [`google-leads-scraper`](google-leads-scraper/) | niša + grad → biznisi + e-mailovi + IG handle-ovi | Google da, OSM ne |
| [`instagram-email-scraper`](instagram-email-scraper/) | IG profili → kontakt e-mailovi | da, ~20 profila / 30 min po IP |
| [`apify-actor`](apify-actor/) | generički crawler sa CSS selektorima | zavisi od mete |

Svaki ima svoj README sa detaljima, ograničenjima i pravnim napomenama.

## Pokretanje

```bash
npm run install:all   # instalira zavisnosti u sva tri
npm test              # provera deljenih modula + sve tri test suite (176 testova)
```

Pojedinačno:

```bash
cd google-leads-scraper && npm install && npm start
```

Input ide u `<actor>/storage/key_value_stores/default/INPUT.json`, rezultati
izlaze u `<actor>/storage/`. Ništa ne napušta tvoju mašinu.

## Deljeni moduli

`emails.js` i `website.js` postoje kao identične kopije u više actor-a. Nije
propust: Apify actor-i se deploy-uju kao samostalni Docker build konteksti, pa
ne mogu da importuju iz susedne mape.

Da duplikacija ne bi tiho razišla kopije:

```bash
npm run check:shared   # padne ako se raziđu (deo `npm test`)
npm run sync:shared    # poravna ih iz kanonske kopije
```

Kanonska kopija je prva u listi u `scripts/check-shared-modules.mjs`.

## Ograničenja u jednoj rečenici po actor-u

- **google-leads-scraper** — Google daje ~100-120 rezultata po pretrazi i
  blokira bez rezidencijalnih proxija; OSM ne blokira nikad ali zna manje.
- **instagram-email-scraper** — ~20 profila na 30 minuta po IP adresi, klizni
  prozor, bez `sessionCookie` prinos je mali.
- **apify-actor** — koliko izdrži meta koju krouluješ.

Nijedan od njih ne zaobilazi rate limit; svi se ponašaju pristojno prema njemu,
jer se bez plaćenih proxija ne može drugačije.
