# Instagram Keyword E-mail Scraper

Ključna reč + grad → Instagram profili sa kontakt e-mailom. Isto što radi
Apify-jev „mass Instagram email scraper", besplatno i lokalno.

## Kako to uopšte radi bez Instagrama

Ovo je trik koji komercijalni actor-i koriste, i dobar je: **javni Instagram
bio je indeksiran u Google-u, zajedno sa e-mail adresom.** Pa umesto da se ide
na Instagram, pretražuje se:

```
site:instagram.com "med spa" "Austin TX" "@gmail.com"    ← free-mail
site:instagram.com "med spa" "Austin TX" "info@"         ← poslovne adrese
```

Adresa je već u **snippetu** rezultata. Instagram se nikad ne kontaktira, pa
njegov rate limit — onaj zid od ~20 profila na 30 minuta koji davi
`../instagram-email-scraper` — ovde uopšte ne postoji.

Pogledaš li izlaz Apify-jevog actor-a (`keyword`, `title`, `description`,
`url`, `email`) i njegov `engine: "Uses GOOGLE_SERP proxy"` — to su polja
rezultata pretrage. I oni rade isto. Razlika je što oni plaćaju GOOGLE_SERP
proxy, a ti ne moraš.

### Dve familije upita, i druga je važnija

**Free-mail** (`"@gmail.com"`, `"@yahoo.com"`…) nađe samo adrese na tih šest
domena. Firma sa sopstvenim domenom — `hello@njihovsajt.com` — nijednim od njih
se ne može pogoditi.

**Poslovne adrese** traže *lokalni deo*: `"info@"`, `"hello@"`, `"bookings@"`,
`"sales@"`… Pretraživač indeksira `@` kao deo reči, pa `"info@"` nalazi
`info@bilokoji-domen.com` bez da unapred znaš domen. Za US biznise to je bolja
polovina liste.

Obe su podrazumevano uključene — 20 upita po ključnoj reči. `plain` (bez ijednog
tokena) je treća opcija: svi profili na ključnu reč, pa šta se zatekne u
snippetu.

**Zadržava se svaka nađena adresa**, bez obzira kojim upitom je profil pronađen.
`keepOnlyDomains` postoji ako baš hoćeš da suziš izlaz, ali je prazno po defaultu.

**Cena tog pristupa:** dobijaš ono što je pretraživač indeksirao. Samo bio
tekst — nema broja pratilaca, nema privatnih polja — i samo profile koje je
uopšte krolovao. To jeste plafon, ali je drugi plafon.

## Dva načina da ga pokreneš

| | Kada |
| --- | --- |
| **Ekstenzija** (`../browser-extension`, tab „Instagram po ključnoj reči") | Google iz tvoje sesije. Nikad CAPTCHA, jer si ti korisnik koji pretražuje. **Preporučeno.** |
| **Ovaj actor** | Kad hoćeš da radi bez tebe — zakazano, u panelu, kroz API. |

Actor podrazumevano koristi **DuckDuckGo**: ima čist HTML endpoint bez CAPTCHA
i jedini je koji radi iz skripte besplatno. Google mu je indeks za `site:`
upite osetno bolji, ali blokira datacentar IP adrese posle par upita — biraj ga
samo uz rezidencijalne proxije.

## Pokretanje

Kroz panel: tab **„Instagram po ključnoj reči"**. Ili:

```bash
cd instagram-keyword-scraper && npm install
mkdir -p storage/key_value_stores/default
```

`storage/key_value_stores/default/INPUT.json`:

```json
{
  "keywords": ["med spa", "wedding photographer"],
  "location": "Austin TX",
  "emailDomains": ["@gmail.com"],
  "pagesPerQuery": 2,
  "requireEmail": true
}
```

```bash
npm start
```

## Input

| Polje | Default | Opis |
| --- | --- | --- |
| `keywords` | — | **obavezno**, svaka se pretražuje zasebno |
| `location` | — | dodaje se u svaki upit kao fraza |
| `probes` | `freeMail`, `rolePrefix` | koje familije upita da pusti |
| `emailDomains` | 6 free-mail domena | pregazi listu free-mail tokena |
| `rolePrefixes` | 14 poslovnih | pregazi listu `info@`, `hello@`… |
| `keepOnlyDomains` | `[]` | suzi **izlaz**; prazno = zadrži sve nađeno |
| `site` | `instagram.com` | radi i `tiktok.com`, `twitter.com` |
| `engine` | `duckduckgo` | ili `google` (traži proxi) |
| `pagesPerQuery` | `2` | strana rezultata po upitu |
| `maxEmails` | `0` | stani na toliko adresa; 0 = bez granice |
| `requireEmail` | `true` | baci profile bez adrese u snippetu |
| `oneRowPerEmail` | `true` | profil sa dve adrese → dva reda |
| `verifyEmailDomains` | `true` | MX + klasifikacija |

**Zašto se tokeni traže jedan po jedan:** uzak upit pretraživač mnogo bolje
rangira, i svaki upit dobija svoju stranu rezultata. Dvadeset tokena znači
dvadeset strana, ne jednu prepunu.

## Output

```csv
keyword,username,name,email,url,description
med spa,austinmedspa,Austin Med Spa,info.austin@gmail.com,https://www.instagram.com/austinmedspa/,Med spa in Austin TX · info.austin@gmail.com
```

Ista polja koja emituju komercijalni actor-i, pa alat pisan protiv njih radi i
ovde. Plus `INSTAGRAM_HANDLES` u key-value storeu — spreman input za
`../instagram-email-scraper` ako hoćeš dublje podatke o tim profilima.

## Ograničenja

- **Prinos zavisi od toga koliko je Google indeksirao.** Za nišu u velikom US
  gradu to je obično nekoliko stotina profila; za usku nišu u malom mestu možda
  desetak.
- **Bez broja pratilaca i ostalih polja profila** — snippet nosi samo bio.
  Ako ti trebaju, propusti `INSTAGRAM_HANDLES` kroz `instagram-email-scraper`.
- **Google engine bez proxija dobija CAPTCHA.** Actor to prepozna i staje
  umesto da spali ostatak liste; poruka kaže šta da radiš.
- **DuckDuckGo ima manji indeks od Google-a.** Manje rezultata, ali uvek radi.

## Pravna napomena

Skrejpuju se javno indeksirani podaci sa stranice rezultata pretrage. Adrese su
lični podaci pod GDPR-om i CAN-SPAM-om; pre slanja bilo čega proveri pravni
osnov.

## Struktura

```
src/
  main.js         orkestracija: upiti → pretraga → profili → CSV
  serp.js         DuckDuckGo i Google — dohvat + čisti parseri
  igSearch.js     graditelj upita i mapiranje rezultata   [deljeno]
  emails.js       detekcija/filtriranje adresa            [deljeno]
  social.js       Instagram handle-ovi                    [deljeno]
  emailVerify.js  MX + klasifikacija                      [deljeno]
test/             89 testova
```
