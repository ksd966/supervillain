#!/usr/bin/env node
/**
 * Cleans out a working folder that has accumulated copies of this project.
 *
 * Unzipping twice leaves `ACTOR/leadscraper/lead-scraper/…`; unzipping a new
 * version next to the old one leaves two trees that look alike and only one of
 * which is current. Deleting the wrong one costs you the folder you were
 * running from, so this reports before it touches anything, and it will not
 * delete a directory it cannot positively identify as a copy of this project.
 *
 *   node scripts/cleanup.mjs             report on the parent folder
 *   node scripts/cleanup.mjs <dir>       report on <dir>
 *   node scripts/cleanup.mjs <dir> --fix delete what the report listed
 */

import { readdirSync, readFileSync, rmdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const projectRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const target = resolve(args.find((arg) => !arg.startsWith('--')) ?? join(projectRoot, '..'));

/** Throwaway state a run leaves behind — safe to delete anywhere. */
const JUNK_DIRS = new Set([
    'node_modules', 'storage', 'apify_storage', 'crawlee_storage', 'runs', '__MACOSX',
]);
const JUNK_FILES = new Set(['.token', '.DS_Store', 'Thumbs.db']);

/** How deep to look for stray copies. Deeper than this is not "next to it". */
const MAX_DEPTH = 4;

// --- guards ------------------------------------------------------------------

if (!existsSync(target) || !statSync(target).isDirectory()) {
    console.error(`✗ Nema foldera: ${target}`);
    process.exit(1);
}

// A drive root or the home directory is never what someone means to clean.
if (target === resolve(homedir()) || target === resolve(target, '..')) {
    console.error(`✗ Odbijam da čistim ${target} — izaberi konkretan radni folder.`);
    process.exit(1);
}

if (!projectRoot.startsWith(target + sep) && projectRoot !== target) {
    console.error(`✗ ${target} ne sadrži ovaj projekat (${projectRoot}).`);
    console.error('  Pokreni skriptu iz projekta koji hoćeš da zadržiš.');
    process.exit(1);
}

// --- scanning ----------------------------------------------------------------

/**
 * @param {string} dir
 * @returns {boolean} whether the directory is a copy of this project
 */
function isProjectCopy(dir) {
    return existsSync(join(dir, 'control-panel', 'server.js'))
        && existsSync(join(dir, 'package.json'));
}

/**
 * The current build takes a pasted list; older ones do not. That single field
 * is the difference between "the copy you want" and "the copy you replaced".
 *
 * @param {string} dir
 * @returns {boolean}
 */
function isCurrent(dir) {
    try {
        const schema = readFileSync(join(dir, 'instagram-email-scraper', '.actor', 'input_schema.json'), 'utf8');
        return JSON.parse(schema).properties?.list !== undefined;
    } catch {
        return false;
    }
}

/**
 * @param {string} dir
 * @returns {number} bytes, following no symlinks
 */
function sizeOf(dir) {
    let total = 0;
    const walk = (current) => {
        let entries;
        try { entries = readdirSync(current, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            const path = join(current, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (entry.isFile()) { try { total += statSync(path).size; } catch { /* vanished */ } }
        }
    };
    walk(dir);
    return total;
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const show = (path) => relative(target, path) || '.';

const copies = [];
const junk = [];
const untouched = [];

/**
 * @param {string} dir
 * @param {number} depth
 */
function scan(dir, depth) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
        const path = join(dir, entry.name);

        // Never look inside the project we are keeping.
        if (path === projectRoot) continue;

        if (entry.isFile()) {
            if (JUNK_FILES.has(entry.name) || entry.name.toLowerCase().endsWith('.zip')) junk.push(path);
            else if (depth === 0) untouched.push(path);
            continue;
        }
        if (!entry.isDirectory()) continue;

        if (JUNK_DIRS.has(entry.name)) { junk.push(path); continue; }

        if (isProjectCopy(path)) { copies.push(path); continue; }

        if (depth < MAX_DEPTH) {
            const before = copies.length + junk.length;
            scan(path, depth + 1);
            // A folder that held nothing of ours is reported, not descended into further.
            if (copies.length + junk.length === before && depth === 0) untouched.push(path);
        }
    }
}

scan(target, 0);

// --- report ------------------------------------------------------------------

console.log(`\nFolder:   ${target}`);
console.log(`Zadržavam: ${show(projectRoot)}  (aktuelna verzija: ${isCurrent(projectRoot) ? 'da' : 'NE'})\n`);

if (copies.length) {
    console.log('Stare kopije projekta:');
    for (const copy of copies) {
        console.log(`  ${show(copy)}  ${mb(sizeOf(copy))}  ${isCurrent(copy) ? '— i ova je aktuelna, proveri je pre brisanja' : '— starija'}`);
    }
    console.log();
}

if (junk.length) {
    const total = junk.reduce((sum, path) => sum + (statSync(path).isDirectory() ? sizeOf(path) : statSync(path).size), 0);
    console.log(`Privremeni fajlovi (${junk.length}, ${mb(total)}):`);
    for (const path of junk.slice(0, 12)) console.log(`  ${show(path)}`);
    if (junk.length > 12) console.log(`  …i još ${junk.length - 12}`);
    console.log();
}

if (untouched.length) {
    console.log('Ovo NE diram (nije deo projekta):');
    for (const path of untouched) console.log(`  ${show(path)}`);
    console.log();
}

if (!copies.length && !junk.length) {
    console.log('✓ Nema šta da se briše.\n');
    process.exit(0);
}

if (!fix) {
    console.log('Ovo je samo izveštaj — ništa nije obrisano.');
    console.log('Da obrišeš gornje: node scripts/cleanup.mjs' + (args.length ? ` "${target}"` : '') + ' --fix\n');
    process.exit(0);
}

// --- delete ------------------------------------------------------------------

let removed = 0;
let failed = 0;

for (const path of [...copies, ...junk]) {
    try {
        rmSync(path, { recursive: true, force: true });
        console.log(`✗ obrisano  ${show(path)}`);
        removed += 1;
    } catch (error) {
        console.error(`! nije obrisano  ${show(path)} — ${error.message}`);
        failed += 1;
    }
}

// Deleting `leadscraper/lead-scraper` leaves `leadscraper` behind as an empty
// shell, which looks like something was missed.
function pruneEmpty(dir) {
    if (dir === target || dir === projectRoot || projectRoot.startsWith(dir + sep)) return;

    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    if (entries.length) return;

    // rmdirSync, not rmSync: it refuses a directory that is not empty, so a
    // race that fills the directory between the check and the call cannot cost
    // anything. rmSync without `recursive` simply throws on any directory.
    try {
        rmdirSync(dir);
        console.log(`✗ obrisano  ${show(dir)}  (prazno)`);
        removed += 1;
    } catch {
        return;
    }
    pruneEmpty(dirname(dir));
}

for (const copy of copies) pruneEmpty(dirname(copy));

console.log(`\n✓ Obrisano ${removed} stavki${failed ? `, ${failed} nije uspelo (verovatno je nešto otvoreno)` : ''}.`);
console.log('Zavisnosti su možda obrisane sa njima — prvi sledeći start ih vraća.\n');
process.exit(failed ? 1 : 0);
