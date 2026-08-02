#!/usr/bin/env node
/**
 * Installs dependencies for any actor that is missing them.
 *
 * The launchers used to list the actors by hand, which broke the moment one was
 * added: the new folder was never installed, and the guard only checked a
 * single folder, so once the first actor had `node_modules` the whole block was
 * skipped forever. The failure surfaced as a raw ERR_MODULE_NOT_FOUND from
 * inside the panel.
 *
 * So: discover the actors instead of listing them. Anything with a
 * package.json and no node_modules gets installed; everything else is skipped,
 * which makes the normal start instant.
 *
 *   node scripts/ensure-deps.mjs          install what is missing
 *   node scripts/ensure-deps.mjs --check  report only, exit 1 if anything is missing
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

/**
 * Every directory that is its own npm package — the actors, and anything added
 * later. `control-panel` and `browser-extension` have no dependencies at all,
 * so they simply never show up here.
 *
 * @returns {string[]} folder names
 */
function findPackages() {
    return readdirSync(repoRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
        .map((entry) => entry.name)
        .filter((name) => existsSync(join(repoRoot, name, 'package.json')))
        .sort();
}

const packages = findPackages();
const missing = packages.filter((name) => !existsSync(join(repoRoot, name, 'node_modules')));

if (!missing.length) {
    console.log(`✓ Zavisnosti su na mestu (${packages.length} paketa).`);
    process.exit(0);
}

if (checkOnly) {
    console.error(`✗ Nedostaju zavisnosti: ${missing.join(', ')}`);
    console.error('  Pokreni: node scripts/ensure-deps.mjs');
    process.exit(1);
}

console.log(`Instaliram zavisnosti za: ${missing.join(', ')}`);
console.log('Prvi put traje par minuta. Sledeći put se preskače.\n');

let failed = 0;
for (const name of missing) {
    console.log(`── ${name}`);

    // npm on Windows is a .cmd, which needs a shell to be found on PATH.
    const result = spawnSync('npm', ['install', '--no-audit', '--no-fund'], {
        cwd: join(repoRoot, name),
        stdio: 'inherit',
        shell: process.platform === 'win32',
    });

    if (result.status !== 0) {
        console.error(`✗ ${name} nije uspeo.`);
        failed += 1;
    }
}

if (failed) {
    console.error(`\n${failed} paket(a) nije instalirano. Proveri internet vezu pa pokreni ponovo.`);
    process.exit(1);
}

console.log('\n✓ Gotovo.');
