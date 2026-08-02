# Lead scraping actors

Pet Apify actor-a plus browser ekstenzija, sve lokalno, bez naloga i bez
troška. Isti kod se može pushovati na Apify bez izmena, ako i kada zatreba.

## Kako se uklapaju

```
   niša + grad              ti pretražuješ            bilo koji drugi alat
        │                    Google sam                       │
        ▼                        │                            │
 ┌──────────────────┐            ▼                            │
 │ google-leads-    │   ┌──────────────────┐                  │
 │ scraper          │   │ browser-extension│                  │
 └────────┬─────────┘   └────────┬─────────┘                  │
          │                      │                            │
          │                      └──────────┐   ┌─────────────┘
          │                                 ▼   ▼
          │                        ┌──────────────────┐
          │                        │ lead-normalizer  │
          │                        └────────┬─────────┘
          │                                 │
          ├─────────────────────────────────┴──► CSV (gotovi lead-ovi)
          │
          ▼
  INSTAGRAM_HANDLES
          │
          ▼
 ┌────────────────────────┐
 │ instagram-email-scraper│  profil → business e-mail, bio, bio link
 └───────────┬────────────┘
             ▼
        EMAILS_CSV
```

`instagram-keyword-scraper` i IG tab u ekstenziji rade isto što i komercijalni
„mass Instagram email scraper": pretražuju `site:instagram.com "niša" "grad"
"@gmail.com"` i čitaju adresu iz **snippeta** — bio teksta koji pretraživač već
ima indeksiran. Instagram se pritom uopšte ne kontaktira, pa njegov rate limit
ne postoji.

`apify-actor` je generički crawler — bilo koji sajt, tvoji CSS selektori, plus
ekstrakcija e-mailova.

## Actor-i

| Mapa | Šta radi | Blokira li se |
| --- | --- | --- |
| [`lead-normalizer`](lead-normalizer/) | **bilo čiji export → čist CSV** (ime, e-mail, IG…) | ne radi mrežu |
| [`browser-extension`](browser-extension/) | pretražuješ Google → kupi rezultate → e-mail/ime/IG → CSV, **plus IG pretraga po ključnoj reči** | **ne** — radi u tvom browseru |
| [`instagram-keyword-scraper`](instagram-keyword-scraper/) | ključna reč + grad → IG profili sa e-mailom, preko pretraživača | DuckDuckGo ne, Google da |
| [`google-leads-scraper`](google-leads-scraper/) | niša + grad → biznisi + e-mailovi + IG handle-ovi | Google da, OSM ne |
| [`instagram-email-scraper`](instagram-email-scraper/) | IG profili → kontakt e-mailovi | da, ~20 profila / 30 min po IP |
| [`apify-actor`](apify-actor/) | generički crawler sa CSS selektorima | zavisi od mete |

**Ako skrejpuješ drugim alatom**, treba ti samo `lead-normalizer`: nalepiš
njegov export i dobiješ sređen CSV. Ne mora da zna odakle je fajl — prepoznaje
i format i koje su kolone.

Podešeno za **US tržište**: telefoni u `+1` E.164, države u dvoslovne kodove,
Google jezik `en`, niše na engleskom (`med spa`, `roofing`, `law firm`…).

**Ekstenzija je jedini način da se Google skrejpuje bez blokade**, jer se
zahtevi ne razlikuju od tvog običnog pretraživanja — Google i vidi korisnika
koji pretražuje. Cena je što pretrage kucaš sam. Actor je za obim koji se ne
kuca ručno i za OSM, koji nikad ne blokira.

Svaki ima svoj README sa detaljima, ograničenjima i pravnim napomenama.

## Pokretanje

**Najlakše — dupli klik na `Aplikacija.bat`** (Windows). Panel se otvori u
zasebnom prozoru, bez adresne trake i tabova, sa svojom ikonom u taskbaru —
Chrome/Edge u `--app` režimu. Nije Electron: to bi značilo 150 MB runtime-a i
build korak za prozor koji izgleda isto, uz browser koji već imaš.

`Panel.bat` radi isto ali u običnom tabu. Otvori se
[kontrolni panel](control-panel/): forma, dugme, logovi uživo, CSV. Prvi put
instalira zavisnosti, posle je instant.

Sa telefona: `Panel-Telefon.bat` ispiše LAN adresu. Van kuće: `ngrok http 8377`.
Na iPhoneu Safari → Share → „Add to Home Screen" i dobiješ ikonu koja se otvara
kao aplikacija. Detalji u [control-panel/README.md](control-panel/README.md).

Iz terminala:

```bash
npm run install:all   # instalira zavisnosti u sve actor-e
npm test              # deljeni moduli + sve test suite (485 testova)
node control-panel/server.js
```

Pojedinačni actor bez panela:

```bash
cd google-leads-scraper && npm install && npm start
```

Input ide u `<actor>/storage/key_value_stores/default/INPUT.json`, rezultati
izlaze u `<actor>/storage/`. Kroz panel, svaki run dobija svoj
`control-panel/runs/<id>/`. Ništa ne napušta tvoju mašinu.

## Verifikacija adresa

Oba lead actor-a rade MX proveru pre nego što upišu rezultat (`verifyEmailDomains`,
podrazumevano uključeno): jedan keširan DNS upit po domenu utvrdi da li domen
uopšte prima poštu, plus labeliranje — role nalog (`info@`), free-mail
(`gmail.com`), disposable.

Po defaultu se **labelira, ne briše** — vidiš `emailDetails` uz svaki rezultat i
sam odlučuješ. `dropUndeliverable` i `dropRoleAccounts` prebacuju na brisanje.

Role naloge namerno ne bacam podrazumevano: kod malih firmi je `info@` vrlo
često jedina objavljena adresa, pa bi ih brisanje prepolovilo listu.

## Kad te Instagram ili Google blokira, a imaš VPN

Limit je po IP adresi. Nijedan trik u kodu to ne menja — ali promena IP-a menja.
Radni tok koji košta nula:

1. Pusti run. Actor sam stane kad naleti na zid
   (`stopAfterConsecutiveFailures`), umesto da spali ostatak liste.
2. Prebaci VPN na drugi server.
3. Pusti ostatak liste.

Zato Instagram actor piše zapis sa `error: "rate-limited"` umesto da tiho
preskoči — iz dataseta tačno vidiš dokle je stigao. Nisam automatizovao
prebacivanje VPN-a jer svaki klijent ima svoj CLI, a ne mogu da testiram ni
jedan; ako mi kažeš koji VPN koristiš, mogu da dodam hook koji ga zove između
serija.

## Deljeni moduli

`emails.js`, `website.js`, `social.js`, `igSearch.js` i `emailVerify.js` postoje kao identične kopije u više
actor-a. Nije propust: Apify actor-i se deploy-uju kao samostalni Docker build
konteksti, pa ne mogu da importuju iz susedne mape.

Da duplikacija ne bi tiho razišla kopije:

```bash
npm run check:shared   # padne ako se raziđu (deo `npm test`)
npm run sync:shared    # poravna ih iz kanonske kopije
```

Kanonska kopija je prva u listi u `scripts/check-shared-modules.mjs`.

## Ograničenja u jednoj rečenici po actor-u

- **google-leads-scraper** — Google daje ~100-120 rezultata po pretrazi i
  blokira bez rezidencijalnih proxija; OSM ne blokira nikad ali zna manje.
- **instagram-keyword-scraper** — dobijaš samo ono što je pretraživač
  indeksirao: bio tekst, bez broja pratilaca; DuckDuckGo ima manji indeks od
  Google-a, a Google bez proxija dobija CAPTCHA.
- **instagram-email-scraper** — ~20 profila na 30 minuta po IP adresi, klizni
  prozor, bez `sessionCookie` prinos je mali.
- **apify-actor** — koliko izdrži meta koju krouluješ.

Nijedan od njih ne zaobilazi rate limit; svi se ponašaju pristojno prema njemu,
jer se bez plaćenih proxija ne može drugačije.
