#!/usr/bin/env node
/**
 * Builds the browser demo of instagram-keyword-scraper.
 *
 * Unlike the normalizer demo, this one cannot do the whole job in a page: a
 * browser cannot fetch google.com from another origin. So the page does the two
 * halves it genuinely can, and hands the middle back to the user:
 *
 *   1. build the queries — and link straight to the live search, so the real
 *      results are one click away
 *   2. parse a results page the user pastes back, using the shipped
 *      `igLeadFromResult` and the shipped e-mail filters
 *
 * That is not a simulation of the actor: it is the actor's own extraction,
 * running on real search results. The only thing standing in for the actor's
 * HTTP layer is the user's own browser — which is exactly what the extension
 * does too, and for the same reason.
 *
 *   node scripts/build-ig-demo.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(repoRoot, 'instagram-keyword-scraper', 'src');
const outFile = join(repoRoot, 'demo', 'instagram-keyword.html');

/** `serp.js` is absent: it needs cheerio, and a page has DOMParser instead. */
const MODULES = ['emails.js', 'social.js', 'igSearch.js'];

/**
 * @param {string} source
 * @returns {string}
 */
function inline(source) {
    return source
        .replace(/^import[\s\S]*?from\s+'[^']+';\s*$/gm, '')
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
    .map((file) => `// ─── ${file} ${'─'.repeat(Math.max(0, 58 - file.length))}\n${inline(readFileSync(join(srcDir, file), 'utf8'))}`)
    .join('\n\n');

/** A realistic results page so the parser can be tried without leaving the tab. */
const SAMPLE = `<div id="search">
  <div data-hveid="1"><a href="https://www.instagram.com/austinmedspa/"><h3>Austin Med Spa (@austinmedspa) &bull; Instagram photos and videos</h3></a>
    <div>4,182 Followers &middot; Med spa in Austin TX &middot; Botox, fillers &amp; facials &middot; Bookings: info.austin@gmail.com</div></div>
  <div data-hveid="2"><a href="https://www.instagram.com/glow.aesthetics.atx/"><h3>Glow Aesthetics ATX (@glow.aesthetics.atx) on Instagram</h3></a>
    <div>Austin&rsquo;s med spa &middot; Lip filler specialists &middot; glowaesthetics@gmail.com &middot; DM to book</div></div>
  <div data-hveid="3"><a href="/url?q=https://www.instagram.com/radiantskin.atx/&amp;sa=U"><h3>Radiant Skin Studio (@radiantskin.atx)</h3></a>
    <div>Skincare studio &middot; Austin TX &middot; hello.radiant@gmail.com &middot; logo@2x.png</div></div>
  <div data-hveid="4"><a href="https://www.instagram.com/p/C8xYzAbCdEf/"><h3>Austin Med Spa on Instagram: &quot;New year specials&quot;</h3></a>
    <div>This is a post, not a profile &mdash; it must not become a lead.</div></div>
  <div data-hveid="5"><a href="https://www.instagram.com/thequietstudio/"><h3>The Quiet Studio (@thequietstudio)</h3></a>
    <div>Med spa &middot; Austin &middot; no contact details published</div></div>
</div>`;

const html = `<title>Instagram po ključnoj reči — probaj</title>
<style>
:root {
  color-scheme: light dark;
  --ground:#eef1f6; --plate:#fff; --plate-2:#f7f9fc;
  --ink:#141c28; --muted:#5b6b80; --line:#d2dae5;
  --ok:#0f6e5a; --ok-bg:#daeee7; --warn:#9e4f27; --warn-bg:#f6e6db;
  --signal:#2a55c4; --signal-bg:#e2e9fa;
}
@media (prefers-color-scheme: dark) {
  :root { --ground:#0e131a; --plate:#161d27; --plate-2:#1b232f; --ink:#e4eaf2; --muted:#8a99ad;
          --line:#242e3c; --ok:#48be9e; --ok-bg:#12312a; --warn:#d4885b; --warn-bg:#33231a;
          --signal:#7098ff; --signal-bg:#1a2440; }
}
:root[data-theme="dark"] { --ground:#0e131a; --plate:#161d27; --plate-2:#1b232f; --ink:#e4eaf2;
  --muted:#8a99ad; --line:#242e3c; --ok:#48be9e; --ok-bg:#12312a; --warn:#d4885b; --warn-bg:#33231a;
  --signal:#7098ff; --signal-bg:#1a2440; }
:root[data-theme="light"] { --ground:#eef1f6; --plate:#fff; --plate-2:#f7f9fc; --ink:#141c28;
  --muted:#5b6b80; --line:#d2dae5; --ok:#0f6e5a; --ok-bg:#daeee7; --warn:#9e4f27; --warn-bg:#f6e6db;
  --signal:#2a55c4; --signal-bg:#e2e9fa; }

* { box-sizing: border-box; }
body { margin:0; background:var(--ground); color:var(--ink);
  font:15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.mono, h1, h2, .eyebrow, .q, th, td, textarea, pre, .stat b, code, input, .step b {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }

.wrap { max-width:1000px; margin:0 auto; padding:0 20px 80px; }
header.top { border-bottom:1px solid var(--line); background:var(--plate); }
header.top .wrap { padding-block:38px 32px; }
.eyebrow { font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:var(--muted); margin:0 0 14px; }
h1 { font-size:clamp(25px,4.2vw,36px); line-height:1.15; margin:0 0 14px; font-weight:600;
     letter-spacing:-.02em; text-wrap:balance; }
header.top p { margin:0; max-width:64ch; color:var(--muted); font-size:16px; }

section { margin-top:38px; }
h2 { font-size:13px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted);
     margin:0 0 14px; font-weight:600; }
.panel { background:var(--plate); border:1px solid var(--line); border-radius:8px; }
.panel-pad { padding:18px; }

.fields { display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); }
label { display:block; }
label span.lbl { display:block; font-size:11px; letter-spacing:.08em; text-transform:uppercase;
                 color:var(--muted); margin-bottom:6px; font-weight:600; }
input, textarea {
  width:100%; padding:11px 12px; border:1px solid var(--line); border-radius:6px;
  background:var(--plate-2); color:var(--ink); font-size:14px; }
textarea { min-height:150px; resize:vertical; font-size:12px; line-height:1.6; white-space:pre; overflow-x:auto; }
input:focus-visible, textarea:focus-visible, button:focus-visible, a:focus-visible {
  outline:2px solid var(--signal); outline-offset:2px; }

button { font:inherit; font-size:14px; cursor:pointer; padding:10px 15px; border-radius:6px;
         border:1px solid var(--line); background:var(--plate-2); color:var(--ink); }
button.run { background:var(--signal); border-color:var(--signal); color:#fff; font-weight:600; }
button:hover:not(.run) { border-color:var(--signal); }
.controls { display:flex; gap:9px; flex-wrap:wrap; margin-top:14px; }

ol.queries { list-style:none; margin:0; padding:0; display:grid; gap:1px; background:var(--line); }
ol.queries li { background:var(--plate); padding:11px 16px; display:flex; gap:12px;
                align-items:center; justify-content:space-between; flex-wrap:wrap; }
.q { font-size:12.5px; word-break:break-all; }
a.open { flex:0 0 auto; font-size:12px; text-decoration:none; padding:5px 11px; border-radius:5px;
         background:var(--signal-bg); color:var(--signal); font-weight:600; white-space:nowrap; }

.steps { display:grid; gap:1px; background:var(--line); border:1px solid var(--line);
         border-radius:8px; overflow:hidden; margin-bottom:14px; }
.step { background:var(--plate); padding:12px 16px; display:flex; gap:12px; align-items:baseline; font-size:14px; }
.step b { flex:0 0 auto; color:var(--signal); font-size:12px; min-width:18px; }
.step code { font-size:12.5px; background:var(--plate-2); padding:1px 6px; border-radius:4px; }

.stats { display:flex; gap:24px; flex-wrap:wrap; padding:15px 18px; border-bottom:1px solid var(--line); }
.stat b { display:block; font-size:21px; font-weight:600; font-variant-numeric:tabular-nums; }
.stat span { font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); }

.tablewrap { overflow-x:auto; }
table { border-collapse:collapse; width:100%; font-size:12.5px; }
th, td { text-align:left; padding:9px 12px; border-bottom:1px solid var(--line); white-space:nowrap; }
th { font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); font-weight:600; }
tbody tr:last-child td { border-bottom:0; }
td.mail { color:var(--ok); }
td.dim { color:var(--muted); }
pre.csv { margin:0; padding:16px; overflow-x:auto; font-size:12px; line-height:1.7;
          background:var(--plate-2); border-radius:0 0 8px 8px; }
.note { color:var(--muted); font-size:13px; }
.warnbox { background:var(--warn-bg); color:var(--warn); border-radius:6px; padding:11px 14px;
           font-size:13px; margin-top:14px; }
footer { margin-top:52px; padding-top:22px; border-top:1px solid var(--line); color:var(--muted); font-size:13px; }
footer a { color:var(--signal); }
@media (prefers-reduced-motion: reduce) { * { transition:none !important; animation:none !important; } }
</style>

<header class="top">
  <div class="wrap">
    <p class="eyebrow">instagram-keyword-scraper · probaj uživo</p>
    <h1>Instagram profili sa e-mailom, bez diranja Instagrama.</h1>
    <p>
      Javni Instagram bio je indeksiran u Google-u — adresa i sve. Pa se ne ide na Instagram,
      nego se pretražuje <code>site:instagram.com</code>. Adresa je već u snippetu rezultata.
      Ovde možeš da probaš na pravim rezultatima: napravi upite, otvori ih, vrati stranu ovamo.
    </p>
  </div>
</header>

<div class="wrap">

<section>
  <h2>1 — Šta tražiš</h2>
  <div class="panel panel-pad">
    <div class="fields">
      <label><span class="lbl">Niša</span><input id="kw" value="med spa" placeholder="med spa, realtor"></label>
      <label><span class="lbl">Grad</span><input id="loc" value="Austin TX" placeholder="Austin TX"></label>
      <label><span class="lbl">Domeni</span><input id="dom" value="@gmail.com" placeholder="prazno = svih 6"></label>
    </div>
    <div class="controls"><button class="run" id="build">Napravi upite</button></div>
  </div>
</section>

<section>
  <h2>2 — Upiti <span style="text-transform:none;letter-spacing:0;font-weight:400">(klikni „otvori" da vidiš prave rezultate)</span></h2>
  <div class="panel"><ol class="queries" id="queries"></ol></div>
</section>

<section>
  <h2>3 — Vrati rezultate ovamo</h2>
  <div class="steps">
    <div class="step"><b>1</b><span>Klikni „otvori" gore — otvara se prava Google pretraga.</span></div>
    <div class="step"><b>2</b><span>Na toj strani: <code>Ctrl+U</code> (izvorni kod) → <code>Ctrl+A</code> → <code>Ctrl+C</code>.</span></div>
    <div class="step"><b>3</b><span>Nalepi ovde i klikni „Izvuci profile".</span></div>
  </div>
  <div class="panel panel-pad">
    <textarea id="html" spellcheck="false" aria-label="Izvorni kod strane sa rezultatima"></textarea>
    <div class="controls">
      <button class="run" id="parse">Izvuci profile</button>
      <button id="sample">Ubaci primer rezultata</button>
    </div>
    <p class="note" style="margin:12px 0 0">
      Ovo je jedini korak koji stranica ne može sama: browser ne sme da dohvati google.com
      sa drugog domena. Ekstenzija to radi umesto tebe — tamo je isti ovaj korak jedan klik.
    </p>
  </div>
</section>

<section>
  <h2>4 — Profili</h2>
  <div class="panel">
    <div class="stats" id="stats"></div>
    <div class="tablewrap"><table id="out"></table></div>
  </div>
</section>

<section>
  <h2>5 — CSV</h2>
  <div class="panel">
    <div class="panel-pad" style="border-bottom:1px solid var(--line);display:flex;gap:9px;flex-wrap:wrap">
      <button id="copy">Kopiraj</button><button id="dl">Preuzmi .csv</button>
    </div>
    <pre class="csv" id="csv"></pre>
  </div>
</section>

<section>
  <h2>Šta se ovde dogodilo</h2>
  <div class="steps">
    <div class="step"><b>·</b><span>Domeni se traže <strong>jedan po jedan</strong>. Uzak upit pretraživač mnogo bolje rangira, i svaki dobija svoju stranu rezultata — šest domena znači šest puta više rezultata, ne jednu prepunu stranu.</span></div>
    <div class="step"><b>·</b><span>Naslov <code>Ime (@handle)</code> se cepa na ime i handle; handle iz naslova ima prednost nad onim iz URL-a.</span></div>
    <div class="step"><b>·</b><span>Link na objavu (<code>/p/…</code>) nije profil i ne postaje lead.</span></div>
    <div class="step"><b>·</b><span>Adrese se filtriraju na domene koje si tražio, pa <code>hello@salon.com</code> ne prolazi kad tražiš samo gmail.</span></div>
    <div class="step"><b>·</b><span><code>logo@2x.png</code> i slično nikad ne prođu — isti filteri kao u actor-ima.</span></div>
    <div class="step"><b>·</b><span>Profil bez adrese u snippetu ostaje u tabeli, ali actor ga podrazumevano baca (<code>requireEmail</code>).</span></div>
  </div>
  <div class="warnbox">
    MX verifikacija ovde ne radi — browser nema DNS. Lokalno se pokreće i dodaje
    <code>emailDeliverable</code> uz svaki red.
  </div>
</section>

<footer>
  Sve se računa u ovoj stranici, ništa se nigde ne šalje. Ekstenzija i actor rade isti posao
  automatski — <code>Aplikacija.bat</code> za panel, <code>browser-extension</code> za ekstenziju.
</footer>

</div>

<script type="module">
${bundled}

// ─── demo UI ──────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const SAMPLE = ${JSON.stringify(SAMPLE)};
const helpers = { instagramHandleFromUrl, extractEmailsFromText };
const COLUMNS = ['keyword', 'username', 'name', 'email', 'url'];

const splitList = (value) => value.split(',').map((part) => part.trim()).filter(Boolean);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let queries = [];
let lastCsv = '';

function buildQueries() {
  queries = buildSearchQueries({
    keywords: splitList($('kw').value),
    location: $('loc').value.trim(),
    emailDomains: splitList($('dom').value),
  });

  $('queries').innerHTML = queries.length
    ? queries.map((entry) => {
        const href = 'https://www.google.com/search?num=20&q=' + encodeURIComponent(entry.query);
        return '<li><span class="q">' + escapeHtml(entry.query) + '</span>'
          + '<a class="open" href="' + href + '" target="_blank" rel="noopener">otvori ↗</a></li>';
      }).join('')
    : '<li><span class="note">Upiši bar jednu nišu.</span></li>';
}

/**
 * Pulls {title, url, snippet} out of a pasted results page.
 *
 * Done with DOMParser rather than the actor's cheerio version — same selectors,
 * but a page already has a parser and cheerio will not run here. Everything
 * after this point is the shipped code.
 */
function readResults(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = [];
  const seen = new Set();

  for (const anchor of doc.querySelectorAll('a[href]')) {
    const heading = anchor.querySelector('h3, h2');
    if (!heading) continue;

    let url = anchor.getAttribute('href') ?? '';
    if (url.startsWith('/url?')) url = new URLSearchParams(url.slice(5)).get('q') ?? '';
    if (!/^https?:\\/\\//.test(url) || seen.has(url)) continue;
    seen.add(url);

    const block = anchor.closest('div[data-hveid], div.g, li') ?? anchor.parentElement;
    out.push({
      title: heading.textContent.replace(/\\s+/g, ' ').trim(),
      url,
      snippet: (block?.textContent ?? '').replace(/\\s+/g, ' ').trim().slice(0, 500),
    });
  }
  return out;
}

function parsePasted() {
  const results = readResults($('html').value);
  const domains = splitList($('dom').value);
  const keyword = splitList($('kw').value)[0] ?? null;

  const leads = [];
  const seen = new Set();
  for (const result of results) {
    const lead = igLeadFromResult({ ...result, keyword }, helpers, { emailDomains: domains });
    if (!lead || seen.has(lead.username)) continue;
    seen.add(lead.username);
    leads.push(lead);
  }

  const withEmail = leads.filter((lead) => lead.email).length;
  $('stats').innerHTML = [
    [results.length, 'rezultata na strani'],
    [leads.length, 'profila'],
    [withEmail, 'sa adresom'],
    [results.length - leads.length, 'odbačeno (objave, ostalo)'],
  ].map(([value, label]) => '<div class="stat"><b>' + value + '</b><span>' + label + '</span></div>').join('');

  $('out').innerHTML = leads.length
    ? '<thead><tr>' + COLUMNS.map((c) => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>'
      + leads.map((lead) => '<tr>' + COLUMNS.map((column) => {
          const value = lead[column];
          const cls = column === 'email' && value ? ' class="mail"' : (value ? '' : ' class="dim"');
          return '<td' + cls + '>' + escapeHtml(value || '—') + '</td>';
        }).join('') + '</tr>').join('')
      + '</tbody>'
    : '<tbody><tr><td class="dim" style="padding:26px 16px">Ništa nije prepoznato. Da li si nalepio izvorni kod strane (Ctrl+U), a ne sam tekst?</td></tr></tbody>';

  const cell = (value) => {
    const text = String(value ?? '');
    return /[",\\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  lastCsv = [COLUMNS.join(','), ...leads.map((lead) => COLUMNS.map((c) => cell(lead[c])).join(','))].join('\\n') + '\\n';
  $('csv').textContent = lastCsv;
}

$('build').onclick = buildQueries;
$('parse').onclick = parsePasted;
$('sample').onclick = () => { $('html').value = SAMPLE; parsePasted(); };
$('copy').onclick = async () => {
  await navigator.clipboard.writeText(lastCsv);
  $('copy').textContent = 'Kopirano';
  setTimeout(() => { $('copy').textContent = 'Kopiraj'; }, 1500);
};
$('dl').onclick = () => {
  const blob = new Blob(['\\ufeff' + lastCsv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'instagram-leads.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

for (const id of ['kw', 'loc', 'dom']) {
  $(id).addEventListener('keydown', (event) => { if (event.key === 'Enter') buildQueries(); });
}

buildQueries();
$('html').value = SAMPLE;
parsePasted();
</script>
`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, html);
console.log(`✓ ${outFile} (${(html.length / 1024).toFixed(1)} KB, inlining ${MODULES.join(', ')})`);
