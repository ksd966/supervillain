# Session Notes — Tracker Bola i Zdravlja (bol-tracker.html)

**Datum sesije:** 26. maj 2026.

---

## Šta je napravljeno

Kompletna single-file web aplikacija za praćenje bola i zdravlja — `bol-tracker.html` — namenjena osobi koja ima:

- Reumatoidni artritis
- Fibromijalgiju
- Diskus herniju (cervikalna + lumbalna kičma)

Aplikacija je u potpunosti na **srpskom jeziku**, radi **offline u browseru**, i čuva sve podatke lokalno (`localStorage`).

---

## Funkcionalnosti

### Danas (Today tab)
- Interaktivna mapa tela (SVG figura) — 16 kliktabilnih regija (glava, vrat, ramena, laktovi, šake, grudi, leđa-gornji deo, leđa-donji deo, kukovi, kolena, stopala)
- Tri perioda dana: **Jutro / Podne / Veče**
- Za svaki period: intenzitet bola po regionu (1–10), specifični simptomi po dijagnozi, faktori koji utiču na bol, uzeti lekovi
- Simptomi specifični za dijagnozu:
  - RA: jutarnja ukočenost, oticanje zglobova, toplota u zglobovima, umor
  - Fibromijalgija: difuzni bol, preosjetljivost na dodir, brain fog, poremećaj sna, IBS
  - Disk hernija: bol koji se širi u ruku/nogu, trnjenje, slabost mišića
- Faktori: stres, san, fizička aktivnost, vreme/vlaga, lek uzet na vreme

### Lekovi (Meds tab)
- Dodavanje lekova sa dozom, frekvencom (jutro/podne/veče) i napomenom
- Označavanje uzetih lekova za tekući dan
- Persistentna lista lekova između dana

### Istorija (History tab)
- Grafikon prosečnog bola po danima (Chart.js)
- Pregled unosa po datumima

### Izveštaj (Report tab)
- Generisanje tekstualnog izveštaja za lekara
- Kopiranje u clipboard jednim klikom

---

## Dizajn

- **Tamna premium tema** sa CSS promenljivama:
  - `--bg: #0b0f1a` (pozadina)
  - `--cyan: #00d9ff`
  - `--purple: #a78bfa`
  - `--rose: #fb7185`
  - `--amber: #fbbf24`
  - `--green: #34d399`
- **Glassmorphism** kartice (`backdrop-filter: blur`, `rgba` pozadine)
- **Canvas animacija čestica** u pozadini (50 čestica + 5 orbi + linije između čestica)
- **Ripple efekat** na klik (čist HTML/CSS, bez SVG konflikta)
- **Bottom navigation bar** sa 4 taba
- Smooth tranzicije i animacije

---

## Tehničke odluke

### Struktura podataka (localStorage)
```javascript
// Ključ: 'vt2'
{
  "2026-05-26": {
    jutro:  { bol: {}, sim: {}, fak: {}, meds: {} },
    podne:  { bol: {}, sim: {}, fak: {}, meds: {} },
    vece:   { bol: {}, sim: {}, fak: {}, meds: {} }
  }
}

// Ključ: 'vt2_meds'
[
  { id: "uuid", naziv: "Metotreksat", doza: "15mg", freq: ["jutro"], napomena: "uz obrok" }
]
```

### Event handling (kritična lekcija)
- **Sve event wiring** mora biti unutar `DOMContentLoaded`
- **Nikada** inline `onclick=""` atributi — pucaju kada `e.currentTarget` postane `null`
- **Event delegation** za dinamički generisane elemente (med redovi)
- `data-*` atributi za identifikaciju elemenata

```javascript
document.addEventListener('DOMContentLoaded', () => {
  // SVG regije tela
  document.querySelectorAll('.br').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      clickRegion(el.dataset.id);
    });
  });
  // Delegacija za lekove (dinamički elementi)
  $('meds-today').addEventListener('click', e => {
    const row = e.target.closest('[data-mkey]');
    if (!row) return;
    toggleMed(row.dataset.mkey);
  });
});
```

### Ripple na SVG regionima
- SVG elementi (ellipse, rect, path) ne mogu sadržati HTML `<span>` — crash
- Rešenje: ripple se crta samo na HTML elementu koji wrappuje SVG region, ne na samom SVG child elementu

---

## Bagovi koji su rešeni

### 1. Ništa nije radilo interaktivno
**Uzrok (3 kombinovana problema):**
1. `e.currentTarget` je `null` u inline `onclick=""` handlerima → `TypeError` na prvom kliku, ceo JS se ruši
2. `addRipple()` pozivan na SVG elementima → dodavanje HTML `<span>` u SVG je ilegalno
3. Event listeneri postavljeni samo za statičke elemente pri inicijalizaciji, ne za dinamičke med redove

**Rešenje:** Potpuni rewrite JS-a — svi event listeneri unutar `DOMContentLoaded`, `addEventListener` ekskluzivno, uklonjen svaki inline `onclick`, `data-*` atributi za identifikaciju.

### 2. Git push ne ide na pravi GitHub
**Uzrok:** U Claude Code cloud okruženju, `git remote origin` pokazuje na lokalni proxy server (`http://127.0.0.1:PORT/git/...`), ne na `github.com`.

**Rešenje:** Koristiti `mcp__github__push_files` MCP alat koji direktno poziva GitHub API.

### 3. htmlpreview.github.io 404
**Uzroci:**
- Naziv branch-a `claude/chronic-pain-tracker-XK5tQ` sadrži `/` koji reže URL
- Repozitorijum je **privatan** → htmlpreview ne može da pristupi

**Rešenje:** Fajl gurnut na `main` branch. Za javni pristup treba GitHub Pages.

### 4. Git konflikt pri push-u
Nakon `git reset --hard origin/main` fajl je izgubljen. Povraćen komandom:
```bash
git show d9915b4:bol-tracker.html > bol-tracker.html
```

---

## Gde je fajl

- **GitHub:** `https://github.com/ksd966/supervillain/blob/main/bol-tracker.html`
- **Lokalno:** `/home/user/supervillain/bol-tracker.html`

### Da bi GitHub Pages radio (link koji može svako da otvori):
1. Idi na `https://github.com/ksd966/supervillain/settings/pages`
2. Source: **Deploy from a branch**
3. Branch: **main**, folder: **/ (root)**
4. Sačuvaj
5. Za par minuta: `https://ksd966.github.io/supervillain/bol-tracker.html`

---

## Što nije urađeno (za sledeću sesiju)

### PWA (Progressive Web App) za iPhone
Korisnik je pitao kako napraviti potpuno funkcionalnu iPhone aplikaciju. PWA je preporučen kao najlakši put:
- `manifest.json` — ikon, ime, boje
- `service-worker.js` — offline keširanje
- Meta tagovi u `<head>` za iOS
- Kada se doda, korisnik može "Add to Home Screen" i aplikacija radi kao nativna

Ovo **nije implementirano** — samo objašnjeno.

---

## Zavisnosti (CDN, sve online)

```html
<!-- Chart.js za grafikone -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```

Sve ostalo je čist HTML/CSS/JS — bez frameworka, bez build alata.

---

## Branch

Razvoj: `claude/chronic-pain-tracker-XK5tQ`  
Produkcija: `main`
