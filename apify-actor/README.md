# Generic Web Scraper + E-mail Extractor

Apify actor koji krouluje bilo koji sajt po CSS selektorima koje mu zadaš i
usput skuplja sve e-mail adrese na koje naiđe. Bez hardkodovane logike za
konkretan sajt — sve se podešava kroz input.

## Šta radi

- **Dva režima**: HTTP (Cheerio) za statične sajtove i Browser (Playwright) za
  one koji sadržaj crtaju JavaScriptom. Cheerio je 10–50× jeftiniji, pa je
  podrazumevani.
- **Kontrola crawla**: dubina, maksimalan broj strana, strategija praćenja
  linkova (isti domen / isti host / bilo koji), plus include/exclude glob
  patterni za URL-ove.
- **Proizvoljna polja**: svaka stavka u `extractFields` postaje kolona u
  izlazu — tekst, HTML, atribut, `exists` ili `count`.
- **E-mail ekstrakcija** iz četiri izvora, sa filtriranjem šuma.

## E-mail ekstrakcija

Adrese se skupljaju iz, redom po pouzdanosti:

1. `mailto:` linkova — uključujući `?subject=` repove, percent-encoding i više
   primalaca u jednom linku
2. Cloudflare zaštićenih čvorova — `data-cfemail` XOR-hex se dekoduje nazad u
   pravu adresu
3. Vidljivog teksta strane — bez `<script>` i `<style>` sadržaja
4. Sirovog HTML-a (opciono, uključeno po defaultu) — hvata adrese iz JSON-LD
   blokova, `data-` atributa i inline skripti

Uz to se de-obfuskuju uobičajene fore: `ime [at] firma [dot] rs`,
`ime (AT) firma (DOT) rs`, goli `ime at firma dot rs` i HTML entiteti tipa
`&#64;`.

**Filtriranje lažnih pogodaka.** Sledeće se odbacuje automatski:

| Šum | Primer |
| --- | --- |
| Retina/asset fajlovi | `logo@2x.png`, `sprite@3x.webp` |
| Sentry DSN ključevi | `a1b2…f90@o1.ingest.sentry.io` |
| Tracking i CDN domeni | `*.wixpress.com`, `*.sentry.io`, `schema.org` |
| Placeholder adrese | `you@example.com`, `name@yourdomain.com`, `noreply@…` |
| Nevalidni oblici | `..dot@x.com`, `bad@-hyphen.com`, `bad@tld.123` |

Svoje domene za blokiranje dodaješ kroz `emailDomainBlocklist` — unos
`firma.rs` obara i sve poddomene (`mail.firma.rs`).

## Input

Najvažnija polja (kompletna lista sa opisima je u `.actor/input_schema.json`):

| Polje | Default | Opis |
| --- | --- | --- |
| `startUrls` | — | **obavezno**, odakle crawl kreće |
| `crawlerType` | `cheerio` | `cheerio` ili `playwright` |
| `linkStrategy` | `same-domain` | `same-domain`, `same-hostname`, `same-origin`, `all`, `none` |
| `maxCrawlDepth` | `2` | start URL je dubina 0 |
| `maxRequestsPerCrawl` | `100` | glavna zaštita od troška |
| `extractFields` | `[]` | definicije kolona |
| `extractEmails` | `true` | uključi/isključi harvestovanje |
| `scanRawHtml` | `true` | skeniraj i sirovi HTML, ne samo vidljiv tekst |
| `emailDomainBlocklist` | `[]` | dodatni domeni za odbacivanje |
| `proxyConfiguration` | Apify Proxy | preporučeno na živim sajtovima |

### `extractFields`

```json
[
  { "name": "naslov",   "selector": "h1",                        "type": "text" },
  { "name": "opis",     "selector": "meta[name=description]",    "type": "attr", "attr": "content" },
  { "name": "slika",    "selector": "img.hero",                  "type": "attr", "attr": "src" },
  { "name": "tagovi",   "selector": ".tag",                      "type": "text", "multiple": true },
  { "name": "imaCenu",  "selector": ".price",                    "type": "exists" },
  { "name": "brSlika",  "selector": ".gallery img",              "type": "count" }
]
```

- `type`: `text` (default), `html`, `attr`, `exists`, `count`
- `attr`: obavezan uz `type: "attr"`
- `multiple: true` vraća niz svih pogodaka umesto prvog
- Vrednosti iz `href`/`src` se automatski pretvaraju u apsolutne URL-ove

Prihvata se i skraćeni zapis: `{ "naslov": "h1", "cena": ".price" }`.

## Output

Jedan zapis po strani u **datasetu**:

```json
{
  "url": "https://firma.rs/kontakt",
  "loadedUrl": "https://firma.rs/kontakt",
  "depth": 1,
  "statusCode": 200,
  "title": "Kontakt",
  "scrapedAt": "2026-08-02T02:22:51.394Z",
  "naslov": "Kontakt",
  "emails": ["direktor@firma.rs", "prodaja@firma.rs"]
}
```

Na kraju runa, objedinjena lista ide u **key-value store** pod ključem
`EMAILS` — svaka adresa sa spiskom strana na kojima je nađena (do 20 po
adresi):

```json
{
  "totalEmails": 4,
  "pagesScraped": 3,
  "emails": [
    { "email": "direktor@firma.rs", "foundOn": ["https://firma.rs/kontakt"] }
  ]
}
```

## Lokalno pokretanje

```bash
npm install
npm test                     # unit testovi za ekstrakciju

# input ide u storage/key_value_stores/default/INPUT.json
mkdir -p storage/key_value_stores/default
echo '{"startUrls":[{"url":"https://example.com"}],"maxRequestsPerCrawl":10}' \
  > storage/key_value_stores/default/INPUT.json
npm start
```

Bez `useApifyProxy` ili `proxyUrls` u inputu, actor krouluje sa sopstvene IP
adrese — tako lokalni run radi i bez Apify tokena.

Za Playwright lokalno: ako se verzija `playwright` paketa i preuzetog browsera
razilaze, postavi `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` na putanju do Chromium
binarnog fajla.

## Deploy na Apify

```bash
npm install -g apify-cli
apify login
apify push
```

## Struktura

```
.actor/
  actor.json            # metapodaci actor-a
  input_schema.json     # UI forma za input
  dataset_schema.json   # prikaz dataseta u konzoli
src/
  main.js               # setup crawlera i orkestracija
  emails.js             # detekcija, de-obfuskacija, filtriranje adresa
  fields.js             # ekstrakcija korisničkih polja
test/                   # node:test unit testovi
Dockerfile
```

`emails.js` i `fields.js` su čiste funkcije bez zavisnosti od Crawlee-ja, pa se
testiraju bez pokretanja crawlera.

## Napomena o odgovornosti

`respectRobotsTxtFile` je podrazumevano uključen. Prikupljanje e-mail adresa
podleže GDPR-u i sličnim propisima — vodi računa o pravnom osnovu pre nego što
ovo pustiš na tuđe sajtove i pre slanja bilo kakve pošte na skupljene adrese.
