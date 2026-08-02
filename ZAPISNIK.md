# Zapisnik — šta je napravljeno i zašto

Ovaj fajl postoji da bi znanje iz razgovora u kom je sve ovo nastalo ostalo uz
kod. Uglavnom su to stvari koje se iz koda ne vide: zašto je nešto rešeno tako,
šta je probano pa odbačeno, i koji su zidovi stvarni a ne izmišljeni.

---

## 1. Ključno otkriće: „mass Instagram email scraper" ne dira Instagram

Komercijalni Apify actor-i za ovo (`scraper-mind/instagram-email-scraper`,
$5/mesec + usage) izgledaju kao Instagram scraper-i. Nisu.

Odaje ih **njihov sopstveni izlaz**: polja su `keyword`, `title`,
`description`, `url`. To su polja rezultata pretrage, ne polja Instagram
profila. Plus im opcija `engine` doslovno kaže „uses GOOGLE_SERP proxy".

Ono što stvarno rade: pretražuju `site:instagram.com "niša" "grad" "@gmail.com"`
i čitaju e-mail iz **snippeta** — bio teksta koji Google već ima indeksiran.

**Posledica:** Instagram rate limit za njih ne postoji. Ono što oni plaćaju je
GOOGLE_SERP proxy, jer Google blokira skriptu. Ekstenzija to zaobilazi
besplatno — pretražuje iz tvoje sesije, gde si ti korisnik koji pretražuje.

Ovo je ispravka onoga što sam ranije u razgovoru tvrdio. Prvo sam rekao da je
glavna razlika obim zbog Instagram limita; za taj konkretan actor to ne važi.

## 2. Zidovi koji su stvarni

| Zid | Vrednost | Može li se zaobići |
| --- | --- | --- |
| Instagram `web_profile_info` po IP | ~20 profila / 30 min, klizni prozor | samo drugom IP adresom |
| Google iz skripte | CAPTCHA posle par upita | rezidencijalni proxi, ili ekstenzija |
| Google Maps po pretrazi | ~100-120 rezultata | podeli grad na opštine |
| Overpass (OpenStreetMap) | nema ga | — |
| DuckDuckGo HTML endpoint | nema ga | — |

Klizni prozor kod Instagrama znači da **razmicanje zahteva ne pomaže** — samo
odlaže. Zato actor ne pokušava da bude lukav: pauzira, pa staje kad naleti
(`stopAfterConsecutiveFailures`), i ostatak liste ostaje za kasnije.

## 3. Odluke koje nisu očigledne

**Zašto se e-mail adrese labeliraju a ne brišu.** MX provera i klasifikacija
(role / free-mail / disposable) idu kao dodatna polja, a brisanje je opciono.
Role naloge (`info@`, `office@`) namerno ne bacam podrazumevano — kod malih
firmi je to vrlo često jedina objavljena adresa, pa bi ih brisanje prepolovilo
listu.

**Zašto se tokeni pretrage traže jedan po jedan.** `"@gmail.com"` pa
`"@yahoo.com"` pa `"info@"` — zaseban upit svaki. Pretraživač uzak upit mnogo
bolje rangira, i svaki upit dobija **svoju stranu rezultata**. Dvadeset tokena
znači dvadeset strana, ne jednu prepunu.

**Zašto poslovne adrese (`"info@"`) uopšte postoje kao familija upita.** Firma
na sopstvenom domenu — `hello@njihovsajt.com` — nijednim free-mail upitom se ne
može naći. Pretraživač indeksira `@` kao deo reči, pa `"info@"` nalazi
`info@bilo-koji-domen.com` bez da unapred znaš domen. Za US biznise je to bolja
polovina liste.

**Zašto se bio link prati do sajta.** Google Maps **nikad** ne prikazuje
e-mail, samo sajt. Instagram ga prikazuje retko. Pravi prinos je u drugom
koraku: otvori se sajt tog biznisa i tamo traži adresa. Ti zahtevi idu ka
serveru tog biznisa, pa **ne troše nikakav Google/Instagram limit**.

**Zašto OpenStreetMap postoji pored Google Maps.** Manja pokrivenost, ali javni
API koji nikad ne blokira. Kad te Google odbije, OSM i dalje vraća podatke. Za
lokalno i besplatno, `source: "both"` je najbolji izbor.

**Zašto nije Electron.** „Aplikacija" je Chrome/Edge u `--app` režimu: svoj
prozor, svoja ikona u taskbaru, bez adresne trake. Electron bi bio 150 MB
runtime-a i build korak za prozor koji izgleda isto, uz browser koji već imaš.

**Zašto nije n8n.** Problem je bio pokretanje i gledanje rezultata, a ne
orkestracija između servisa. n8n bi značio još jedan servis koji vrti. Isplati
se tek kad budeš *radio nešto* sa lead-ovima — kampanje, CRM, Sheets.

**Zašto su `emails.js`, `social.js`, `website.js`, `igSearch.js` i
`emailVerify.js` duplirani.** Apify actor-i se deploy-uju kao samostalni Docker
build konteksti — ne mogu da importuju iz susedne mape. `npm test` u rootu pada
ako se kopije raziđu, `npm run sync:shared` ih poravna.

## 4. Bugovi koje su uhvatili testovi

Ovo su svi pravi bugovi nađeni tokom rada, ne hipotetički:

1. **`emails.js`** — cheerio `.text()` lepi susedne elemente, pa je
   `<h1>Firma</h1><p>office@firma.rs</p>` davalo `firmaoffice@firma.rs`.
   Pogađalo je svaki actor.
2. **`website.js`** — kontakt strane su se tražile samo u rootu, pa
   `/shop/kontakt` nije nalažen.
3. **`leads.js`** — dedup po hostname-u je spajao različite firme koje dele host
   (`wixsite.com/salon-a` i `.../salon-b`).
4. **Ekstenzija** — spajanje sa već poznatim profilom se računalo pa **bacalo**,
   jer se storage upisivao samo kad ima *novog* profila.
5. **Ekstenzija** — content skript je dedupovao po hostname-u bez porta, što se
   nije slagalo sa ključem u background-u.
6. **`social.js`** — hvatao je IG linkove samo sa `https://`, pa goli
   `instagram.com/handle` u slobodnom tekstu nije prolazio.
7. **`headers.js`** — poklapanja imena kolona su išla redom deklaracije, pa je
   `Primary Business Website` završavalo kao `name` zbog reči „business".
8. **`lead-normalizer`** — kolona `Owner` nije bila prepoznata, svi redovi bez
   imena osobe.
9. **Panel** — koja se polja prikazuju napred biralo se iz hardkodovane liste
   imena; svaki actor dodat kasnije imao je praznu formu.
10. **`igSearch.js`** — nađene adrese su se filtrirale na iste domene kojima je
    profil pronađen, pa se poslovna adresa nalazila pa bacala.

## 5. Šta nije testirano protiv pravog sveta

Sandbox u kom je ovo pisano ima proxy sa allowlistom, pa **nijedan run nije išao
protiv pravog Google-a, Instagrama ni Overpass-a.** Sve je testirano protiv
lokalnih stub servera koji vraćaju realan oblik odgovora, plus ekstenzija u
pravom Chromiumu protiv lažnog SERP-a.

Konkretno nije provereno:
- **Google Maps selektori** (`googleMaps.js`) — ciljaju `data-item-id` i ARIA
  atribute i mogu se pregaziti iz inputa (`placeSelectors`), ali da li pogađaju
  današnji Maps videćeš tek na prvom pravom runu. Simptom je karakterističan:
  vrati imena, a sva ostala polja `null`.
- **Instagram `web_profile_info` mapiranje** — pisano prema dokumentovanom
  obliku endpointa, defanzivno.
- **DuckDuckGo i Google SERP selektori** — isto, parseri su čiste funkcije i
  pokriveni testovima nad fiksnim HTML-om.
- **Panel na pravom iPhoneu** — layout je testiran na iPhone viewportu u
  Chromiumu, ne na uređaju.

## 6. Redosled kojim je nastajalo

```
apify-actor              generički crawler + ekstrakcija e-mailova
instagram-email-scraper  profil → e-mail (i zid od 20/30min)
google-leads-scraper     niša+grad → biznisi (Google Maps + OSM)
control-panel + .bat     pokretanje bez terminala, telefon, PWA
browser-extension        Google iz tvog browsera — bez blokade
lead-normalizer          bilo čiji export → čist CSV
instagram-keyword-scraper  ono što komercijalni actor stvarno radi
```

## 7. Otvoreno, po vrednosti

1. **Baza već viđenih lead-ova** — da drugi run iste niše ne vrati iste ljude.
   Trenutno je svaki run čist list papira. Ovo je najveća rupa.
2. **Zakazivanje** — cron u panelu, da radi noću. Uz ručnu VPN rotaciju to je
   ozbiljna dnevna produkcija.
3. **VPN hook** — automatsko prebacivanje servera između serija. Nije urađeno
   jer svaki klijent ima svoj CLI, a nijedan se odavde ne može testirati.
4. **Docker Compose** — panel + actor-i jednim `docker compose up`.
