# Rust Raid Alert (n8n + Telegram)

Dobijaj **Telegram poruku na telefon čim ti neko krene da rejduje bazu** u igri Rust.

Rust nema zvanični "raid webhook", ali ima ugrađen sistem **Smart Alarm + Rust+**.
Ovaj projekat hvata te Rust+ notifikacije i prosleđuje ih kroz n8n na tvoj Telegram bot.

## Kako radi

```
┌────────────────────┐   Rust+ push (FCM)   ┌──────────────┐   HTTP POST   ┌────────────┐   sendMessage   ┌──────────┐
│ Smart Alarm u bazi │ ───────────────────► │ listener.js  │ ────────────► │ n8n webhook│ ──────────────► │ Telegram │ ──► 📱
│ (okine ga napadač) │                      │ (ovaj repo)  │               │  workflow  │                 │   bot    │
└────────────────────┘                      └──────────────┘               └────────────┘                 └──────────┘
```

**Smart Alarm** je predmet u igri koji se okine kad se promeni stanje strujnog kola na koji je vezan.
Kad ga povežeš sa okidačima na bazi (turret koji puca, HBHF senzor, tripwire/laser, vrata itd.),
alarm "opali", Rust+ pošalje push notifikaciju, a mi je uhvatimo i prosledimo.

---

## Šta ti treba

- **Node.js 18+** (`node --version`) na mašini koja radi non-stop (kućni server, VPS, Raspberry Pi...).
- **Google Chrome** instaliran (potreban samo jednom, za `fcm-register`).
- **n8n** instanca (self-hosted ili n8n Cloud) sa javno dostupnim webhook URL-om.
- **Telegram nalog** + par minuta za pravljenje bota.
- Rust naloga i pristupa bazi u igri (za postavljanje Smart Alarma).

---

## Korak 1 — Napravi Telegram bota

1. U Telegramu otvori [@BotFather](https://t.me/BotFather).
2. Pošalji `/newbot`, izaberi ime i username → dobićeš **bot token** (npr. `123456:ABC-DEF...`). Sačuvaj ga.
3. Nađi svoj **chat ID**:
   - Napiši bilo šta svom botu (npr. `/start`) — bez ovoga bot ne sme da ti šalje poruke.
   - Otvori [@userinfobot](https://t.me/userinfobot) i pošalji `/start` → daće ti tvoj numerički **chat ID**.
   - (Za grupu: dodaj bota u grupu, pa isti postupak — grupni ID počinje sa `-`.)

---

## Korak 2 — Podesi n8n workflow

1. U n8n → **Workflows → Import from File** i izaberi [`n8n-workflow.json`](./n8n-workflow.json).
2. Klikni na **Telegram** node → **Credentials → Create New** → nalepi svoj **bot token** → sačuvaj.
3. Postavi **chat ID**. Workflow podrazumevano čita `TELEGRAM_CHAT_ID` iz n8n environment varijable.
   - Ili u n8n podesi env var `TELEGRAM_CHAT_ID=tvoj_id`,
   - Ili jednostavno u Telegram node-u u polju **Chat ID** upiši svoj ID direktno (obriši `={{ $env... }}`).
4. Klikni na **Webhook** node → kopiraj **Production URL**
   (izgleda kao `https://tvoj-n8n.example.com/webhook/rust-raid`).
5. Gore desno prebaci workflow na **Active**.

> Napomena: dok je workflow "Active", radi **Production URL** (`/webhook/...`).
> Za testiranje unutar editora koristi se **Test URL** (`/webhook-test/...`) i moraš kliknuti "Listen for test event".

---

## Korak 3 — Postavi listener (ovaj repo)

```bash
cd rust-raid-alert
npm install

# 1) Uparivanje sa Rust+ (otvoriće Chrome da se uloguješ preko Steam-a).
#    Napravi rustplus.config.json u ovom folderu:
npm run register

# 2) Podesi webhook:
cp .env.example .env
#    pa u .env upiši N8N_WEBHOOK_URL = Production URL iz Koraka 2.

# 3) Test celog lanca (n8n -> Telegram), bez čekanja na igru:
npm run test-webhook
#    -> treba da ti stigne "TEST ALARM" poruka na Telegram.

# 4) Pokreni listener:
npm start
```

Ako je sve dobro, videćeš `[OK] Povezan na Rust+ FCM. Cekam alarme...`.

---

## Korak 4 — Postavi i upari Smart Alarm u igri

1. Skloni **Rust+ (Companion)** aplikaciju na telefon i uloguj se (to je isti sistem koji `fcm-register` koristi).
2. U igri: postavi **Smart Alarm** i poveži ga strujno na okidač(e):
   - **Auto Turret** (kad puca) → Smart Alarm,
   - **HBHF senzor** (detekcija igrača) → Smart Alarm,
   - **Laser Detector / tripwire**, senzor na vratima, itd.
3. Drži `HOLD` na Smart Alarmu → **Pair** → alarm se pojavi u Rust+ aplikaciji.
4. (Preporuka) U Rust+ preimenuj alarm u nešto jasno, npr. `RAID - Glavni ulaz`, i upiši mu poruku
   tipa `Baza je pod napadom!`. Taj tekst stiže i na Telegram.

> **Bitno:** listener (`npm start`) mora da radi u trenutku kad se alarm okine.
> Zato ga drži pokrenutog stalno (vidi ispod).

---

## Da radi non-stop (preporučeno)

**pm2:**
```bash
npm install -g pm2
pm2 start listener.js --name rust-raid-alert
pm2 save
pm2 startup      # da se digne posle restarta mašine
```

**systemd** (Linux) — `/etc/systemd/system/rust-raid-alert.service`:
```ini
[Unit]
Description=Rust Raid Alert listener
After=network-online.target

[Service]
WorkingDirectory=/putanja/do/rust-raid-alert
ExecStart=/usr/bin/node listener.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now rust-raid-alert
```

---

## Podešavanja (.env)

| Varijabla         | Opis                                                                 |
|-------------------|----------------------------------------------------------------------|
| `N8N_WEBHOOK_URL` | Production URL iz n8n Webhook node-a. **Obavezno.**                   |
| `ALARM_ONLY`      | `true` (podrazumevano) šalje samo alarme; `false` šalje sve FCM poruke (korisno za debug). |
| `RUSTPLUS_CONFIG` | Putanja do `rustplus.config.json` ako nije u ovom folderu.            |
| `TZ`              | Vremenska zona za prikaz vremena (npr. `Europe/Belgrade`).           |

---

## Rešavanje problema

- **Test poruka ne stiže na Telegram** → problem je u n8n/botu, ne u igri.
  Proveri da si napisao botu bar jednu poruku, da je chat ID tačan, i da je workflow **Active**.
- **`Ne mogu da procitam rustplus.config.json`** → nisi uradio `npm run register`, ili je fajl u drugom folderu.
- **Ništa se ne dešava kad se alarm okine u igri** → proveri da alarm radi u **Rust+ aplikaciji** (ako ni tamo ne stiže,
  problem je uparivanje/igra, ne ovaj kod). Privremeno stavi `ALARM_ONLY=false` da vidiš sve dolazne notifikacije u konzoli.
- **Više alarma** → svaki upareni Smart Alarm šalje zasebnu notifikaciju; poruka na Telegramu sadrži njegov naziv/tekst.

---

## Bezbednost

`rustplus.config.json` i `.env` sadrže tvoje FCM kredencijale, Steam token i webhook URL.
Već su u `.gitignore` — **nikad ih ne commituj i ne deli**.

## Zahvalnice

Koristi [`@liamcottle/rustplus.js`](https://github.com/liamcottle/rustplus.js) za Rust+ FCM.
