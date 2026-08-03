# Lead Normalizer

Ti skrejpuješ čime god hoćeš. Ovaj actor sređuje.

Nalepiš export iz bilo kog alata — CSV, TSV, JSON, JSONL — i dobiješ jedan
čist, dedupliran, verifikovan CSV sa kolonama koje ti odabereš.

Podešen je za **US tržište**: telefoni se normalizuju u `+1` E.164, države u
dvoslovne kodove.

## Zašto ovo postoji

Svaki scraper izbacuje svoj format. Jedan kaže `Email`, drugi `E-Mail Address`,
treći `contact_email`, četvrti gurne adresu u `Notes` kolonu. Neko izvozi
tačka-zarezom, neko sa BOM-om koji Excel ostavi. Dedupliranja nema nigde.

Umesto da za svaki alat pišeš novi parser, ovaj actor **prepoznaje sam** — i
format, i delimiter, i koja kolona je šta.

## Šta radi

**Prepoznaje format.** CSV / TSV / JSON / JSONL. Delimiter se broji van
navodnika, pa `"Smith, John"` u zarez-delimitiranom fajlu ne pokvari detekciju.
BOM se skida. JSON umotan u `{"data":[...]}` ili `{"result":{"items":[...]}}`
se raspakuje sam.

**Prepoznaje kolone — dvostruko.** Prvo po imenu (`Email`, `E-Mail Address`,
`Owner E-mail Address 2` → sve `email`). Ako ime ne govori ništa, gleda
**sadržaj**: kolona puna `nesto@nesto.tld` je e-mail kolona kako god da se zove.
Traži se većinsko slaganje, pa jedan zalutali e-mail u `Notes` koloni ne
preimenuje tu kolonu.

**Kopa po slobodnom tekstu.** Bio, notes, i sve nepoznate kolone se pretražuju
za adresama i Instagram profilima. Vrlo često je tu jedini kontakt u fajlu —
`Reach them at hello@vistamedspa.com or IG instagram.com/vista.medspa`.

**Razlikuje firmu od čoveka.** `Business Name` i `Owner` su različita polja.
Ime firme se ne cepa na ime i prezime — mail merge koji pozdravlja
„Hi Dental," odaje bota. Prepoznaje se po markerima (`LLC`, `Inc`, `Clinic`,
`&`, cifre…). `"Carter, James"` se ispravno okreće u James Carter.

**Normalizuje.** E-mail u mala slova; telefon u `+13105551234` (ekstenzija se
skida, inače ruši dialer); `California` → `CA`; `salonana.com` →
`https://salonana.com`; `12.5k` → `12500`; `Austin, TX` u koloni grada se
razdvaja na grad i državu.

**Dedupliraje spajanjem, ne bacanjem.** Drugi red često nosi baš ono polje
koje prvom fali.

**Verifikuje.** MX provera po domenu (keširano) plus labeliranje: role nalog,
free-mail, disposable.

## Pokretanje

Kroz panel: tab **„Sredi export"**, nalepiš, klik. Ili:

```bash
cd lead-normalizer && npm install
mkdir -p storage/key_value_stores/default
```

`storage/key_value_stores/default/INPUT.json`:

```json
{
  "rawText": "Business Name;Owner;E-Mail Address\nBright Smile Dental;\"Carter, James\";INFO@BrightSmile.com",
  "columns": ["name", "firstName", "lastName", "email", "instagram", "phone", "website", "city", "state"],
  "dedupeBy": "email",
  "requireEmail": true
}
```

```bash
npm start
```

Rezultat: `storage/key_value_stores/default/CLEAN_CSV.csv`.

## Input

| Polje | Default | Opis |
| --- | --- | --- |
| `rawText` | — | nalepljen export |
| `sourceUrl` | — | alternativa: URL sa kog se povlači |
| `format` | `auto` | `csv`, `tsv`, `json`, `jsonl` ako detekcija promaši |
| `columns` | vidi ispod | koje kolone idu u CSV i kojim redom |
| `mineFreeText` | `true` | kopaj kontakte po bio/notes/nepoznatim kolonama |
| `explodeMultiEmail` | `false` | po jedan red za svaku adresu |
| `requireEmail` | `false` | zadrži samo redove sa adresom |
| `dedupeBy` | `email` | `email`, `website`, `instagram`, `name+city` |
| `phoneRegion` | `US` | ili pozivni broj, npr. `+44` |
| `keepUnmappedColumns` | `false` | provuci nepoznate kolone u izlaz |
| `verifyEmailDomains` | `true` | MX + klasifikacija |
| `dropUndeliverable` | `false` | briši umesto da labelira |
| `dropRoleAccounts` | `false` | briši `info@`, `office@`… |

Dostupne kolone za `columns`: `name`, `contactName`, `firstName`, `lastName`,
`isPerson`, `email`, `emails`, `instagram`, `instagramAll`, `phone`, `website`,
`jobTitle`, `address`, `city`, `state`, `postalCode`, `country`, `category`,
`followers`, `bio`, `emailDeliverable`, `emailIsRole`.

## Primer

Ulaz — tačka-zarez, BOM, navodnici sa zarezima, duplikat, kontakt sakriven u
notes koloni:

```csv
Business Name;Owner;E-Mail Address;IG Handle;Mobile Phone;Primary Business Website;City;State;Notes;Lead Score
Bright Smile Dental;"Carter, James";INFO@BrightSmile.com;@brightsmiledental;(310) 555-1234;brightsmile.com;Los Angeles;California;Best time: mornings;87
Elite Fitness LLC;Sarah Chen;sarah@elitefit.io; https://www.instagram.com/elitefit.la/ ;310-555-9876 ext. 22;https://elitefit.io/;Los Angeles;CA;Owner also at coach@elitefit.io;92
Bright Smile Dental;James Carter;info@brightsmile.com;;;brightsmile.com;Los Angeles;CA;duplicate row;87
Vista Med Spa;;;;;vistamedspa.com;"Austin, TX";Texas;"Reach them at hello@vistamedspa.com or IG instagram.com/vista.medspa";71
```

Izlaz:

```csv
name,firstName,lastName,email,instagram,phone,website,city,state,emailIsRole
Bright Smile Dental,James,Carter,info@brightsmile.com,brightsmiledental,+13105551234,https://brightsmile.com,Los Angeles,CA,true
Elite Fitness LLC,Sarah,Chen,sarah@elitefit.io,elitefit.la,+13105559876,https://elitefit.io,Los Angeles,CA,false
Vista Med Spa,,,hello@vistamedspa.com,vista.medspa,,https://vistamedspa.com,Austin,TX,true
```

Duplikat spojen, `Lead Score` odbačen, adresa i Instagram iskopani iz notes
kolone, telefon bez ekstenzije, država skinuta iz grada.

## Ostali izlazi

- `SUMMARY` — koliko redova ušlo/izašlo, koliko sa e-mailom, i **kako je svaka
  kolona mapirana**. Prvo mesto koje treba pogledati ako nešto fali.
- `INSTAGRAM_HANDLES` — spreman input za `../instagram-email-scraper`.

## Struktura

```
src/
  main.js         orkestracija
  parse.js        detekcija formata, RFC 4180 CSV čitač, raspakivanje JSON-a
  headers.js      mapiranje kolona po imenu i po sadržaju
  normalize.js    e-mail, telefon, IG, država, ime/prezime, followers
  emails.js       detekcija/filtriranje adresa      [deljeno]
  social.js       Instagram handle-ovi              [deljeno]
  emailVerify.js  MX + klasifikacija                [deljeno]
test/             111 testova
```
