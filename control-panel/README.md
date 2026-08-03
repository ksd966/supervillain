# Scraper control panel

Lokalni web panel: pokreće actor-e, prati logove uživo, vraća CSV. Radi na
tvom PC-ju, bez ijedne npm zavisnosti izvan Node-a.

Sa telefona ga otvoriš u browseru i dodaš na home screen — dobiješ ikonu i
fullscreen, kao aplikacija. To je odgovor na „fajl za iOS": native `.ipa` traži
Xcode, macOS i Apple Developer nalog, a ovo radi odmah i na iOS 18.5.

## Pokretanje

Windows — dupli klik na `Panel.bat` u rootu repoa. Prvi put instalira
zavisnosti actor-a (par minuta), posle je instant.

Ručno:

```bash
node control-panel/server.js
```

Konzola ispiše token i adresu:

```
Na ovom računaru:  http://localhost:8377/?token=xxxxx
Sa telefona (LAN): http://<IP-ovog-PCja>:8377/?token=xxxxx
```

Token se generiše pri prvom pokretanju i čuva u `control-panel/.token`
(gitignorovan). Obrišeš fajl → dobiješ novi. Možeš ga i nametnuti:
`PANEL_TOKEN=nesto node control-panel/server.js`.

Port menjaš sa `PORT=9000`.

## Sa telefona

**Isti Wi-Fi** — pokreni `Panel-Telefon.bat`, on ispiše LAN adresu. Otvoriš je
na telefonu, nalepiš token. Windows Firewall će prvi put pitati za dozvolu;
bez nje telefon ne može da se poveže.

**Van kuće** — ngrok:

```bash
ngrok http 8377
```

Otvoriš adresu koju ngrok ispiše. Token i dalje važi — i zato postoji: ngrok
URL je javan, pa bi bez tokena bilo ko mogao da ti pokreće scrapere.

**Dodavanje na home screen (iOS 18.5)** — Safari → dugme Share → „Add to Home
Screen". Ikona se pojavi na ekranu, otvara se bez browser trake. Token ostaje
zapamćen, pa se otvara pravo u panel.

> Mora Safari. Chrome na iOS-u nema „Add to Home Screen" — to je iOS
> ograničenje, ne panela.

## Šta panel ume

- Forma se generiše **iz `input_schema.json` samog actor-a**, pa ne može da se
  raziđe sa onim što actor stvarno prima. Dodaš polje u schemu → pojavi se u
  panelu.
- Svaki run dobija svoj `runs/<id>/` storage, pa dva runa ne gaze jedan drugom
  rezultate i stari run ostaje preuzimljiv.
- Log uživo, `Zaustavi` za run u toku.
- `CSV (e-mailovi)` — spisak adresa. `CSV (sve)` — ceo dataset, sve kolone.
- `→ Instagram` — uzme `INSTAGRAM_HANDLES` iz Google runa i ubaci ih u
  Instagram formu. Tako se dva actor-a ulančavaju bez kopiranja.

## Bezbednost

Panel sluša na svim interfejsima jer mora — telefon i ngrok inače ne mogu do
njega. Zato je token obavezan na svakom zahtevu, poredi se preko SHA-256
digesta u konstantnom vremenu, a statički fajlovi se serviraju samo iz
`public/` (nema izlaska iz foldera preko `..`).

**Ne stavljaj ovo na javni server bez dodatnog sloja.** Namenjeno je tvojoj
mreži i privremenom ngrok tunelu.

## Struktura

```
server.js       HTTP server, spawn actor-a, run registry, CSV izvoz
icon.js         generiše PNG ikonu u runtime-u (iOS ne prima SVG za home screen)
public/
  index.html    ceo UI — forma, runs, logovi, tabela
  login.html    unos tokena
  manifest.webmanifest
runs/           po jedan folder po runu  (gitignorovano)
.token          generisani token         (gitignorovano)
```

Nema `package.json` jer nema zavisnosti — sve je iz Node standardne biblioteke.
