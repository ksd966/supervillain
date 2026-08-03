# Google Maps Leads + E-mail Extractor

Nađe sve biznise iz jedne niše u jednom gradu, pa im skrejpuje sajtove za
kontakt e-mailom i Instagram handle-om. Radi lokalno, bez Apify naloga.

Ovo je **discovery sloj** — ono što `../instagram-email-scraper` nije imao.
Umesto da mu ručno daješ listu, kažeš mu „frizerski salon, Novi Sad".

---

## Dva izvora, i zašto oba postoje

| | Google Maps | OpenStreetMap |
| --- | --- | --- |
| Pokrivenost | odlična — zna skoro svaki biznis | slabija, zavisi od grada |
| Kontakt podaci | sajt skoro uvek, e-mail nikad | e-mail direktno kod ~15-25% |
| Blokiranje | CAPTCHA bez rezidencijalnih proxija | **nikad** — javni API |
| Brzina | sporo, treba browser | brzo, jedan HTTP zahtev |
| Stabilnost parsiranja | DOM se menja svakih par meseci | tagovi stabilni godinama |

**Za tvoj slučaj — lokalno i besplatno — `both` je najbolji izbor.** OSM ti
uvek da bazu koja radi, Google dopuni ostalo dok ne naletiš na CAPTCHA.
Rezultati se spajaju i dedupluju, pa nema duplikata.

Ako te Google blokira, OSM i dalje radi. To je cela poenta te kombinacije.

---

## Gde e-mailovi zapravo dolaze

Google Maps **ne prikazuje e-mail** — nikad, ni za jedan biznis. Prikazuje
sajt. Zato je pravi posao u drugom koraku: za svaki nađeni biznis se otvori
njegov sajt i traži adresa (landing strana, pa kontakt strane, uključujući
ugnježdene tipa `/sr/kontakt`). Ti zahtevi idu ka serveru tog biznisa, ne ka
Googleu — **ne troše nikakav Google limit**.

Usput se kupe i Instagram linkovi sa tih sajtova. Oni završe u
`INSTAGRAM_HANDLES`, što je direktno `usernames` input za
`../instagram-email-scraper`:

```
niša + grad  →  google-leads-scraper  →  INSTAGRAM_HANDLES
                                                  ↓
                                      instagram-email-scraper
```

---

## Pokretanje

```bash
npm install
npm test
mkdir -p storage/key_value_stores/default
```

`storage/key_value_stores/default/INPUT.json`:

```json
{
  "niche": "frizerski salon",
  "city": "Novi Sad",
  "source": "both",
  "maxResultsPerQuery": 40,
  "enrichFromWebsite": true,
  "onlyWithEmail": true
}
```

```bash
npm start
```

Za `google-maps` i `both` treba Chromium (Playwright ga povlači pri
`npm install`). Ako se verzija paketa i browsera razilaze lokalno, postavi
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

### Niše

Za Google Maps piši prirodno — `frizerski salon`, `teretana`, `zubar`.

OpenStreetMap nema pretragu po tekstu, pa se niša mapira na OSM tagove.
Pokriveno je tridesetak uobičajenih (frizer, kozmetički salon, tattoo,
restoran, kafić, pekara, teretana, zubar, apoteka, veterinar, advokat,
knjigovođa, nekretnine, auto servis, hotel, cvećara, fotograf, vodoinstalater,
električar…), sa srpskim i engleskim nazivima i sa dijakriticima. Ako tvoja
niša nije u tabeli, prosledi sirov OSM tag:

```json
{ "niche": "shop=greengrocer", "city": "Beograd", "source": "openstreetmap" }
```

Tagove nađeš na [taginfo.openstreetmap.org](https://taginfo.openstreetmap.org).

**Grad za OSM piši lokalno** — `Beograd`, ne `Belgrade`. Traži se po
administrativnoj granici, po imenu.

---

## Input

| Polje | Default | Opis |
| --- | --- | --- |
| `niche` | — | `frizerski salon`, ili sirov OSM tag |
| `city` | — | grad; za OSM lokalno ime |
| `queries` | `[]` | eksplicitne fraze, gaze `niche`+`city` (samo Google) |
| `source` | `google-maps` | `google-maps`, `openstreetmap`, `both` |
| `maxResultsPerQuery` | `40` | Google sam staje oko 100-120 po pretrazi |
| `enrichFromWebsite` | `true` | otvori sajt i traži kontakt |
| `maxWebsitePagesPerLead` | `3` | uključujući landing stranu |
| `onlyWithEmail` | `false` | upiši samo lead-ove sa adresom |
| `placeSelectors` | `{}` | override selektora kad Google promeni layout |
| `emailDomainBlocklist` | `[]` | dodatni domeni za odbacivanje |
| `proxyConfiguration` | `{}` | skoro obavezno za Google na iole ozbiljnom obimu |

## Output

```json
{
  "source": "google-maps+openstreetmap",
  "name": "Frizerski salon Ana",
  "category": "Frizerski salon",
  "address": "Zmaj Jovina 12, Novi Sad",
  "phone": "+381211234567",
  "website": "https://salonana.rs/",
  "emails": ["office@salonana.rs"],
  "instagramHandles": ["salon_ana"],
  "rating": 4.8,
  "reviewsCount": 126,
  "googleMapsUrl": "https://www.google.com/maps/place/...",
  "scrapedAt": "2026-08-02T03:12:44.001Z"
}
```

Plus u key-value storeu: `EMAILS` (JSON), `EMAILS_CSV` (CSV),
`INSTAGRAM_HANDLES` (spreman input za Instagram actor).

---

## Kad Google promeni layout

Hoće, pre ili kasnije. Maps DOM je generisan i klase su obfuskovane. Zato
selektori ciljaju `data-item-id` i ARIA atribute, koji prežive redizajn mnogo
bolje od klasa — a i njih možeš pregaziti iz inputa bez diranja koda:

```json
{ "placeSelectors": { "website": "a[data-item-id='authority']", "name": "h1.DUwDvf" } }
```

Simptom je karakterističan: run vrati imena, a sva ostala polja `null`.

Parsiranje panela je čista funkcija nad HTML-om (`parsePlacePanel`), pa je taj
krhki deo ujedno i deo koji je pokriven testovima.

---

## Ograničenja koja treba da znaš

- **Google Maps daje ~100-120 rezultata po pretrazi**, bez obzira na
  `maxResultsPerQuery`. Za veći grad podeli po opštinama ili kvartovima:
  `queries: ["frizerski salon Novi Beograd", "frizerski salon Zemun", ...]`.
- **Bez proxija Google te blokira** — brzo, ako pustiš više pretraga zaredom.
  OSM izvor je tu upravo za taj slučaj.
- **Prinos e-mailova zavisi od niše.** Biznisi koji žive od online prisustva
  (agencije, saloni, restorani) imaju sajt sa adresom. Zanatlije često nemaju
  sajt uopšte — tamo je telefon jedini kontakt, a njega dobiješ iz oba izvora.
- **Overpass je donirana infrastruktura.** Ne teraj ga u petlji; ako vrati 429,
  actor sam prelazi na drugu instancu, ali pristojnost je na tebi.

## Pravna napomena

Skrejpovanje javnih podataka nije CFAA prekršaj (*Meta v. Bright Data*,
N.D. Cal. 2024), ali Google ToS zabranjuje automatizovan pristup. OSM podaci su
pod [ODbL](https://www.openstreetmap.org/copyright) — slobodni su, uz obavezu
navođenja izvora. Skupljene e-mail adrese su lični podaci pod GDPR-om.

## Struktura

```
.actor/           actor.json, input_schema.json, dataset_schema.json
src/
  main.js         orkestracija: discovery → dedup → enrichment → output
  googleMaps.js   Playwright vožnja + parsePlacePanel (čista funkcija)
  overpass.js     OSM izvor, sa failoverom između instanci
  queries.js      niša+grad → upiti; niša → OSM tagovi
  leads.js        dedup i spajanje iz oba izvora
  website.js      obilazak sajta: e-mail + Instagram        [deljeno]
  emails.js       detekcija/de-obfuskacija/filtriranje       [deljeno]
test/             95 testova
```

Fajlovi označeni `[deljeno]` su identične kopije u svim actor-ima — svaki je
zaseban Docker build kontekst pa ne može da importuje iz susedne mape.
`npm test` u rootu repoa pada ako se kopije raziđu; `npm run sync:shared`
ih poravna.
