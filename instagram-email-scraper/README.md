# Instagram E-mail Scraper

Skuplja javne kontakt e-mail adrese sa Instagram profila. Radi lokalno, bez
Apify naloga i bez ijednog dinara troška — isti kod se, ako zatreba, može
pushovati na Apify bez izmena.

---

## Pročitaj ovo pre nego što kreneš

Tri stvari koje odlučuju da li će ti ovo uopšte biti od koristi:

**1. „Mass" i „besplatno" se ne poklapaju.** Instagram limitira endpoint po IP
adresi — otprilike **20 profila na 30 minuta**, i to kroz klizni prozor, pa
razmicanje zahteva ne podiže plafon. Sa jedne kućne IP adrese to je realno
**~40 profila na sat**, odnosno oko 300–400 dnevno ako pustiš da radi ceo dan.
Za hiljade profila treba ti rotacija rezidencijalnih proxija, a to se plaća.
Actor je napisan da se sa tim limitom nosi pristojno (backoff, circuit breaker),
ne da ga zaobiđe — jer se ne može zaobići bez proxija.

**2. Bez `sessionCookie` prinos je mali.** Anonimni pristup ovom endpointu je od
2024. jako sužen. Cookie iz ulogovanog browsera drastično popravlja rezultat —
ali **nalog čiji cookie koristiš je nalog koji će biti flagovan**. Koristi
throwaway nalog, nikad glavni.

**3. Pravni okvir.** Skrejpovanje javnih, izlogovanih podataka nije CFAA
prekršaj (*Meta v. Bright Data*, N.D. Cal. 2024), ali **jeste** kršenje
Instagram ToS-a. Prikupljanje e-mail adresa je obrada ličnih podataka pod
GDPR-om, a slanje nezatražene pošte na njih traži pravni osnov. Alat ti daje
podatke; za to šta radiš sa njima odgovaraš ti.

---

## Odakle dolaze adrese

Redom po prinosu:

| Izvor | Šta je | Košta li rate limit |
| --- | --- | --- |
| `business_email` | Javno kontakt polje na business/creator nalozima | da |
| Bio tekst | Adresa napisana u opisu, uz de-obfuskaciju | ne, ide uz profil |
| **Bio link** | Sajt/Linktree iz profila → skrejpuje se za adresom | **ne** |

Treći red je ono što ovaj actor čini upotrebljivim. Većina naloga nikad ne
popuni business e-mail, ali velika većina linkuje sajt — a taj zahtev **ne
troši Instagram limit**, jer ne ide ka Instagramu. Ako je landing strana prazna,
proveravaju se uobičajene kontakt strane (`/contact`, `/kontakt`, `/impressum`,
i iste te ugnježdene, tipa `/shop/kontakt`). Linktree i slični hubovi se
razmotavaju u svoje izlazne linkove.

Filtriranje lažnih pogodaka (asset fajlovi tipa `logo@2x.png`, Sentry DSN
ključevi, placeholderi tipa `you@example.com`) nasleđeno je iz `emails.js` —
isti modul kao u `../apify-actor`.

---

## Pokretanje

```bash
npm install
npm test          # 95 testova, ne dira mrežu osim lokalnog fixture servera

mkdir -p storage/key_value_stores/default
```

`storage/key_value_stores/default/INPUT.json`:

```json
{
  "list": "https://www.instagram.com/salon_nina/\nhttps://www.instagram.com/reel/Dbd5W7ECR1q/,Instagram · pekara_mika\n@kafic_luna",
  "sessionCookie": "",
  "requestDelaySecs": 20,
  "enrichFromWebsite": true,
  "onlyWithEmail": true
}
```

### `list` guta šta god mu daš

Jedno polje, i u panelu je jedino koje se vidi bez otvaranja „Ostala
podešavanja". U njega ide **ceo CSV iz tvoje ekstenzije**, lista URL-ova, lista
handle-ova, ili sve pomešano. Prepoznaje separator sam (`,` `;` tab `|`),
podnosi navodnike, BOM i CRLF.

Ono zbog čega postoji: **izvoz sa pretrage nije lista profila.** Pun je i
post/reel linkova — `instagram.com/reel/Dbd5W7ECR1q/` ne imenuje nikoga, pa
svaki alat koji gleda samo URL te redove tiho baci. Handle je tu, u koloni
pored, u naslovu rezultata (`Instagram · karolinakowalkiewicz`).

Na pravom izvozu od 39 redova to je razlika između **25 i 37** profila. Radi i
kad je fajl otvoren sa pogrešnim code page-om, pa naslov izgleda kao
`Instagram聽路聽karolinakowalkiewicz` — handle je ASCII i preživi.

```bash
npm start
```

Rezultati završe u `storage/` — dataset po profilu, plus `EMAILS` (JSON) i
`EMAILS_CSV` (CSV) u key-value storeu. Ništa ne odlazi van tvoje mašine.

### Odakle `sessionCookie`

Uloguj se na throwaway nalog u browseru → DevTools → Application → Cookies →
`https://www.instagram.com` → vrednost polja `sessionid`.

---

## Input

| Polje | Default | Opis |
| --- | --- | --- |
| `list` | `""` | **jedino koje ti stvarno treba** — nalepi CSV, URL-ove ili handle-ove |
| `usernames` | `[]` | handle-ovi, sa ili bez `@`, ili pune URL adrese |
| `directUrls` | `[]` | profilni URL-ovi, spajaju se sa gornjim i dedupluju |
| `sessionCookie` | `""` | vrednost `sessionid` cookie-ja |
| `enrichFromWebsite` | `true` | prati bio link i traži adresu na sajtu |
| `maxWebsitePagesPerProfile` | `3` | uključujući landing stranu |
| `onlyWithEmail` | `false` | upiši samo profile koji su dali adresu |
| `requestDelaySecs` | `20` | pauza između profila |
| `rateLimitBackoffMins` | `30` | koliko čekati posle 401/429 |
| `maxRateLimitRetries` | `2` | koliko puta čekati-pa-probati isti profil |
| `stopAfterConsecutiveFailures` | `5` | prekini kad je očigledno da si blokiran |
| `emailDomainBlocklist` | `[]` | dodatni domeni za odbacivanje |
| `proxyConfiguration` | `{}` | jedini način da se prođe preko per-IP limita |

## Output

Jedan zapis po profilu:

```json
{
  "username": "pekara_mika",
  "fullName": "Pekara Mika",
  "url": "https://www.instagram.com/pekara_mika/",
  "biography": "Najbolji burek u gradu 🥐",
  "externalUrl": "https://pekaramika.rs/",
  "bioLinks": [{ "title": "Sajt", "url": "https://pekaramika.rs/" }],
  "followersCount": 8200,
  "followsCount": 190,
  "postsCount": 340,
  "verified": false,
  "private": false,
  "isBusinessAccount": true,
  "businessCategoryName": "Restaurant",
  "businessEmail": "Info@PekaraMika.rs",
  "businessPhoneNumber": null,
  "emails": ["info@pekaramika.rs", "porudzbine@pekaramika.rs"],
  "emailSources": {
    "businessEmail": ["info@pekaramika.rs"],
    "website": ["porudzbine@pekaramika.rs"]
  },
  "scrapedAt": "2026-08-02T02:41:12.004Z"
}
```

Imena polja prate ono što Apify-jevi Instagram actor-i emituju
(`followersCount`, `businessEmail`, `externalUrl`, …), pa alati pisani protiv
njih rade i ovde.

Profil koji nije uspeo dobija zapis sa `error` poljem (`not-found`,
`rate-limited`, `not-json`) umesto da tiho nestane.

`EMAILS_CSV`:

```csv
email,usernames
info@pekaramika.rs,"pekara_mika"
porudzbine@pekaramika.rs,"pekara_mika salon_nina"
```

---

## Ponašanje kad te Instagram blokira

- **401/429** → čeka `rateLimitBackoffMins` (default 30 min), pa proba ponovo,
  najviše `maxRateLimitRetries` puta.
- **N grešaka zaredom** → prekida run. Ostatak liste ostaje netaknut za kasnije,
  umesto da se spali u blokadu.
- Poruke u logu razlikuju „blokiran si" od „taj profil ne postoji" i od
  „session je istekao", jer to su tri različite reakcije.

## Deploy na Apify (opciono)

```bash
npm install -g apify-cli && apify login && apify push
```

Isti kod, isti input. Tek tada počinje da košta.

## Struktura

```
.actor/           actor.json, input_schema.json, dataset_schema.json
src/
  main.js         orkestracija, pacing, agregacija
  instagram.js    endpoint, headeri, mapiranje odgovora
  paste.js        nalepljeni blob → handle-ovi (naslov kad URL je post/reel)
  parse.js        CSV/TSV/JSON čitač (kopija iz ../lead-normalizer)
  targets.js      handle-ovi/URL-ovi → jedinstvena lista
  website.js      obilazak bio linkova i kontakt strana
  emails.js       detekcija/de-obfuskacija/filtriranje (kopija iz ../apify-actor)
test/             95 testova
```

`emails.js` je namerno identična kopija iz `../apify-actor` — Apify actor-i se
deploy-uju kao samostalni Docker build konteksti, pa svaki nosi svoju. Menjaš
jednu, menjaš obe; testovi su duplirani da uhvate razilaženje.
