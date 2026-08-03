#!/usr/bin/env node
/**
 * Builds the browser demo of lead-normalizer.
 *
 * The point of the demo is to show what the actor actually does, so it must run
 * the actor's actual code. Rather than re-implement the pipeline in the page,
 * this reads the real source modules and inlines them: the demo is the shipped
 * logic, and it cannot drift, because a change to `normalize.js` is a change to
 * the demo the next time this runs.
 *
 * The one thing the browser cannot do is the MX check — there is no DNS in a
 * page — so verification is left out and the page says so.
 *
 *   node scripts/build-demo.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(repoRoot, 'lead-normalizer', 'src');
const outFile = join(repoRoot, 'demo', 'lead-normalizer.html');

/** Inlined in dependency order; `emailVerify` is deliberately absent. */
const MODULES = ['emails.js', 'social.js', 'normalize.js', 'parse.js', 'headers.js', 'rows.js'];

/**
 * Strips the module plumbing so several files can share one script scope.
 *
 * @param {string} source
 * @returns {string}
 */
function inline(source) {
    return source
        .replace(/^import[\s\S]*?from\s+'[^']+';\s*$/gm, '')
        // `export { clean as cleanText };` renames on the way out, so dropping
        // the line would lose the name every caller uses. Turn it into a real
        // binding instead; a plain re-export of an existing name is a no-op.
        .replace(/^export\s+\{([^}]*)\};\s*$/gm, (_match, names) => names
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map((entry) => {
                const [local, exported] = entry.split(/\s+as\s+/).map((part) => part.trim());
                return exported && exported !== local ? `const ${exported} = ${local};` : '';
            })
            .filter(Boolean)
            .join('\n'))
        .replace(/^export\s+(function|const|class)/gm, '$1')
        .trim();
}

const bundled = MODULES
    .map((file) => `// ─── ${file} ${'─'.repeat(Math.max(0, 60 - file.length))}\n${inline(readFileSync(join(srcDir, file), 'utf8'))}`)
    .join('\n\n');

const SAMPLE = `Business Name;Owner;E-Mail Address;IG Handle;Mobile Phone;Primary Business Website;City;State;Notes;Lead Score
Bright Smile Dental;"Carter, James";INFO@BrightSmile.com;@brightsmiledental;(310) 555-1234;brightsmile.com;Los Angeles;California;Best time to call: mornings;87
Elite Fitness LLC;Sarah Chen;sarah@elitefit.io; https://www.instagram.com/elitefit.la/ ;310-555-9876 ext. 22;https://elitefit.io/;Los Angeles;CA;Owner also at coach@elitefit.io;92
Bright Smile Dental;James Carter;info@brightsmile.com;;;brightsmile.com;Los Angeles;CA;duplicate row;87
Vista Med Spa;;;;;vistamedspa.com;"Austin, TX";Texas;"Reach them at hello@vistamedspa.com or IG instagram.com/vista.medspa";71
Summit Roofing Co;Mike Alvarez;mike@summitroof.com;;(512) 555-0142;summitroof.com;Austin;TX;left voicemail 3/12;55
No Contact Landscaping;;;;;;Dallas;TX;nothing useful here;40`;

const html = `<title>Lead Normalizer — kako radi</title>
<style>
:root {
  color-scheme: light dark;
  --ground: #eef1f6;
  --plate: #ffffff;
  --plate-2: #f7f9fc;
  --ink: #141c28;
  --muted: #5b6b80;
  --line: #d2dae5;
  --ok: #0f6e5a;
  --ok-bg: #daeee7;
  --warn: #9e4f27;
  --warn-bg: #f6e6db;
  --signal: #2a55c4;
  --signal-bg: #e2e9fa;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ground: #0e131a; --plate: #161d27; --plate-2: #1b232f;
    --ink: #e4eaf2; --muted: #8a99ad; --line: #242e3c;
    --ok: #48be9e; --ok-bg: #12312a;
    --warn: #d4885b; --warn-bg: #33231a;
    --signal: #7098ff; --signal-bg: #1a2440;
  }
}
:root[data-theme="dark"] {
  --ground: #0e131a; --plate: #161d27; --plate-2: #1b232f;
  --ink: #e4eaf2; --muted: #8a99ad; --line: #242e3c;
  --ok: #48be9e; --ok-bg: #12312a;
  --warn: #d4885b; --warn-bg: #33231a;
  --signal: #7098ff; --signal-bg: #1a2440;
}
:root[data-theme="light"] {
  --ground: #eef1f6; --plate: #ffffff; --plate-2: #f7f9fc;
  --ink: #141c28; --muted: #5b6b80; --line: #d2dae5;
  --ok: #0f6e5a; --ok-bg: #daeee7;
  --warn: #9e4f27; --warn-bg: #f6e6db;
  --signal: #2a55c4; --signal-bg: #e2e9fa;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

/* The subject's material is columns and code, so the monospace face carries
   the headings and labels, and the sans is reserved for running prose. */
.mono, h1, h2, .eyebrow, .field, .col, th, td, textarea, pre, .stat b {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}

.wrap { max-width: 1080px; margin: 0 auto; padding: 0 20px 80px; }

header.top { border-bottom: 1px solid var(--line); background: var(--plate); }
header.top .wrap { padding-block: 40px 34px; }
.eyebrow {
  font-size: 11px; letter-spacing: .16em; text-transform: uppercase;
  color: var(--muted); margin: 0 0 14px;
}
h1 { font-size: clamp(26px, 4.4vw, 38px); line-height: 1.15; margin: 0 0 14px; font-weight: 600; letter-spacing: -.02em; text-wrap: balance; }
header.top p { margin: 0; max-width: 62ch; color: var(--muted); font-size: 16px; }

section { margin-top: 40px; }
h2 { font-size: 13px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); margin: 0 0 14px; font-weight: 600; }

.panel { background: var(--plate); border: 1px solid var(--line); border-radius: 8px; }
.panel-pad { padding: 18px; }

textarea {
  width: 100%; min-height: 190px; resize: vertical; padding: 14px;
  border: 1px solid var(--line); border-radius: 6px;
  background: var(--plate-2); color: var(--ink); font-size: 12.5px; line-height: 1.65;
  white-space: pre; overflow-x: auto;
}
textarea:focus-visible, button:focus-visible { outline: 2px solid var(--signal); outline-offset: 2px; }

.controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 14px; }
button {
  font: inherit; font-size: 14px; cursor: pointer; padding: 10px 16px;
  border-radius: 6px; border: 1px solid var(--line); background: var(--plate-2); color: var(--ink);
}
button.run { background: var(--signal); border-color: var(--signal); color: #fff; font-weight: 600; }
button:hover:not(.run) { border-color: var(--signal); }

.stats { display: flex; gap: 26px; flex-wrap: wrap; padding: 16px 18px; border-bottom: 1px solid var(--line); }
.stat b { display: block; font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
.stat span { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }

/* Column mapping reads as wiring: source header on the left, the field it
   feeds on the right, a dashed run between them. */
.wires { display: grid; gap: 2px; }
.wire { display: flex; align-items: baseline; gap: 10px; padding: 7px 0; font-size: 13px; }
.wire .col { color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 45%; }
.wire .run-line { flex: 1; border-bottom: 1px dashed var(--line); transform: translateY(-4px); min-width: 20px; }
.wire .field { white-space: nowrap; font-size: 12px; padding: 2px 8px; border-radius: 4px; background: var(--ok-bg); color: var(--ok); }
.wire.dropped .field { background: var(--warn-bg); color: var(--warn); }
.wire.dropped .col { color: var(--muted); }

.tablewrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
tbody tr:last-child td { border-bottom: 0; }
td.mail { color: var(--ok); }
td.dim { color: var(--muted); }
td.num { font-variant-numeric: tabular-nums; }

pre.csv {
  margin: 0; padding: 16px; overflow-x: auto; font-size: 12px; line-height: 1.7;
  background: var(--plate-2); border-radius: 0 0 8px 8px; color: var(--ink);
}

ul.notes { margin: 0; padding: 0; list-style: none; display: grid; gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
ul.notes li { background: var(--plate); padding: 13px 16px; font-size: 14px; display: flex; gap: 12px; align-items: baseline; }
ul.notes li code { font-size: 12.5px; background: var(--plate-2); padding: 1px 6px; border-radius: 4px; }
ul.notes .tag { flex: 0 0 auto; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--signal); min-width: 92px; }

table.compare td, table.compare th { white-space: normal; vertical-align: top; }
table.compare td:first-child { font-weight: 600; }
.yes { color: var(--ok); }
.no { color: var(--warn); }

footer { margin-top: 56px; padding-top: 22px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
footer a { color: var(--signal); }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
</style>

<header class="top">
  <div class="wrap">
    <p class="eyebrow">lead-normalizer · živi demo</p>
    <h1>Nalepiš tuđi export. Dobiješ svoj CSV.</h1>
    <p>
      Ovo je stvarni kod actor-a, sklopljen iz istih fajlova koji se pokreću lokalno —
      ne prikaz nego sam alat. Menjaj tekst ispod kako hoćeš; sve se računa u tvom browseru,
      ništa se nigde ne šalje.
    </p>
  </div>
</header>

<div class="wrap">

<section>
  <h2>1 — Ulaz</h2>
  <div class="panel panel-pad">
    <textarea id="in" spellcheck="false" aria-label="Export za sređivanje">${SAMPLE.replace(/</g, '&lt;')}</textarea>
    <div class="controls">
      <button class="run" id="run">Sredi</button>
      <button id="reset">Vrati primer</button>
      <button id="messy">Zameni format u JSON</button>
    </div>
  </div>
</section>

<section>
  <h2>2 — Šta je prepoznao</h2>
  <div class="panel">
    <div class="stats" id="stats"></div>
    <div class="panel-pad"><div class="wires" id="wires"></div></div>
  </div>
</section>

<section>
  <h2>3 — Sređeni lead-ovi</h2>
  <div class="panel"><div class="tablewrap"><table id="out"></table></div></div>
</section>

<section>
  <h2>4 — CSV</h2>
  <div class="panel">
    <div class="panel-pad" style="border-bottom:1px solid var(--line);display:flex;gap:10px;flex-wrap:wrap">
      <button id="copy">Kopiraj</button>
      <button id="dl">Preuzmi .csv</button>
    </div>
    <pre class="csv" id="csv"></pre>
  </div>
</section>

<section>
  <h2>Šta se ovde dogodilo</h2>
  <ul class="notes">
    <li><span class="tag">format</span><span>Tačka-zarez, ne zarez. Delimiter se broji <strong>van navodnika</strong>, pa <code>"Austin, TX"</code> ne pomeri detekciju.</span></li>
    <li><span class="tag">kolone</span><span><code>E-Mail Address</code> → <code>email</code> po imenu. Kolona bez upotrebljivog imena prepoznaje se po <strong>sadržaju</strong> — većinsko slaganje, pa jedan zalutali e-mail u <code>Notes</code> ne preimenuje kolonu.</span></li>
    <li><span class="tag">firma ≠ čovek</span><span><code>Elite Fitness LLC</code> se ne cepa na ime i prezime; <code>Owner</code> ide u zasebno polje. <code>"Carter, James"</code> se okreće u James Carter.</span></li>
    <li><span class="tag">slobodan tekst</span><span>Vista Med Spa nema nijednu kontakt kolonu popunjenu — adresa i Instagram su iskopani iz <code>Notes</code>.</span></li>
    <li><span class="tag">duplikat</span><span>Bright Smile Dental se pojavljuje dvaput. Redovi se <strong>spajaju</strong>, ne bacaju — drugi često nosi polje koje prvom fali.</span></li>
    <li><span class="tag">telefon</span><span><code>310-555-9876 ext. 22</code> → <code>+13105559876</code>. Ekstenzija se skida jer ruši dialer.</span></li>
    <li><span class="tag">država</span><span><code>California</code> → <code>CA</code>, a <code>"Austin, TX"</code> u koloni grada se razdvaja na grad i državu.</span></li>
    <li><span class="tag">šum</span><span><code>Lead Score</code> nema gde da ide: prvo se pretraži za kontaktima, pa se odbaci.</span></li>
  </ul>
  <p style="color:var(--muted);font-size:13.5px;margin-top:14px">
    Jedno ovde ne radi: <strong>MX provera</strong>. Ona traži DNS upit, a browser ga nema.
    Lokalno se pokreće i dodaje <code>emailDeliverable</code> i <code>emailIsRole</code> uz svaki red.
  </p>
</section>

<section>
  <h2>Gde se ovo uklapa</h2>
  <div class="panel"><div class="tablewrap"><table class="compare">
    <thead><tr><th>Alat</th><th>Šta radi</th><th>Blokira li se</th></tr></thead>
    <tbody>
      <tr><td>lead-normalizer</td><td>bilo čiji export → čist, dedupliran, verifikovan CSV</td><td class="yes">ne dira mrežu</td></tr>
      <tr><td>browser-extension</td><td>pretražuješ Google → kupi rezultate → e-mail/ime/IG</td><td class="yes">ne — radi u tvom browseru</td></tr>
      <tr><td>google-leads-scraper</td><td>niša + grad → biznisi, telefoni, sajtovi</td><td class="no">Google da, OpenStreetMap ne</td></tr>
      <tr><td>instagram-email-scraper</td><td>IG profili → kontakt e-mailovi</td><td class="no">~20 profila / 30 min po IP</td></tr>
    </tbody>
  </table></div></div>
</section>

<footer>
  Sve radi lokalno sa tvog računara — bez naloga i bez troška.
  Panel se pokreće duplim klikom na <code>Panel.bat</code>, ili sa <code>node control-panel/server.js</code>.
</footer>

</div>

<script type="module">
${bundled}

// ─── demo UI ──────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const COLUMNS = ['name', 'firstName', 'lastName', 'email', 'instagram', 'phone', 'website', 'city', 'state'];
const SAMPLE_CSV = $('in').value;

const SAMPLE_JSON = JSON.stringify({
  status: 'ok',
  data: [
    { company: 'Bright Smile Dental', contact_person: 'Carter, James', 'Email Address': 'INFO@BrightSmile.com', ig: '@brightsmiledental', tel: '(310) 555-1234', site: 'brightsmile.com', city: 'Los Angeles', region: 'California' },
    { company: 'Vista Med Spa', contact_person: '', 'Email Address': '', ig: '', tel: '', site: 'vistamedspa.com', city: 'Austin, TX', region: 'Texas', notes: 'Reach them at hello@vistamedspa.com or IG instagram.com/vista.medspa' },
  ],
}, null, 2);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return /[",\\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

let lastCsv = '';

function run() {
  const parsed = parseAny($('in').value);

  if (!parsed.records.length) {
    $('stats').innerHTML = '<div class="stat"><b>0</b><span>redova</span></div>';
    $('wires').innerHTML = '<p style="color:var(--muted);font-size:14px;margin:0">Ništa se nije parsiralo. Proveri da prvi red sadrži imena kolona.</p>';
    $('out').innerHTML = '';
    $('csv').textContent = '';
    return;
  }

  const { mapping, unmapped } = mapHeaders(parsed.headers, parsed.records);
  const rows = parsed.records.map((record) => buildRow(record, { mapping, unmapped }));

  const deduped = new Map();
  rows.forEach((row, index) => {
    const key = dedupeKey(row, 'email', index);
    const existing = deduped.get(key);
    if (existing) mergeRow(existing, row);
    else deduped.set(key, row);
  });
  const output = [...deduped.values()];

  $('stats').innerHTML = [
    ['b', parsed.records.length, 'redova ulaz'],
    ['b', output.length, 'čistih lead-ova'],
    ['b', output.filter((r) => r.email).length, 'sa e-mailom'],
    ['b', output.filter((r) => r.instagram).length, 'sa Instagramom'],
    ['b', output.filter((r) => r.phone).length, 'sa telefonom'],
    ['b', parsed.format, 'format'],
  ].map(([, value, label]) => '<div class="stat"><b>' + escapeHtml(value) + '</b><span>' + label + '</span></div>').join('');

  $('wires').innerHTML = [
    ...parsed.headers.filter((h) => mapping[h]).map((header) =>
      '<div class="wire"><span class="col">' + escapeHtml(header) + '</span>'
      + '<span class="run-line"></span><span class="field">' + escapeHtml(mapping[header]) + '</span></div>'),
    ...unmapped.map((header) =>
      '<div class="wire dropped"><span class="col">' + escapeHtml(header) + '</span>'
      + '<span class="run-line"></span><span class="field">pretraženo, pa odbačeno</span></div>'),
  ].join('');

  $('out').innerHTML =
    '<thead><tr>' + COLUMNS.map((c) => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>'
    + output.map((row) => '<tr>' + COLUMNS.map((column) => {
        const value = row[column];
        const cls = column === 'email' && value ? ' class="mail"' : (value == null || value === '' ? ' class="dim"' : '');
        return '<td' + cls + '>' + escapeHtml(value == null || value === '' ? '—' : value) + '</td>';
      }).join('') + '</tr>').join('')
    + '</tbody>';

  lastCsv = [COLUMNS.join(','), ...output.map((row) => COLUMNS.map((c) => csvCell(row[c])).join(','))].join('\\n') + '\\n';
  $('csv').textContent = lastCsv;
}

$('run').onclick = run;
$('reset').onclick = () => { $('in').value = SAMPLE_CSV; run(); };
$('messy').onclick = () => { $('in').value = SAMPLE_JSON; run(); };
$('copy').onclick = async () => {
  await navigator.clipboard.writeText(lastCsv);
  $('copy').textContent = 'Kopirano';
  setTimeout(() => { $('copy').textContent = 'Kopiraj'; }, 1500);
};
$('dl').onclick = () => {
  const blob = new Blob(['\\ufeff' + lastCsv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'leads.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

run();
</script>
`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, html);
console.log(`✓ ${outFile} (${(html.length / 1024).toFixed(1)} KB, inlining ${MODULES.join(', ')})`);
