#!/usr/bin/env node
/**
 * Guards the modules that are deliberately duplicated across actors.
 *
 * Each actor is its own Docker build context, so it cannot import from a
 * sibling directory — the copies are the price of that. This script makes the
 * duplication safe by turning "remember to update the other one" into a check
 * that fails loudly.
 *
 *   node scripts/check-shared-modules.mjs        report drift, exit 1 if any
 *   node scripts/check-shared-modules.mjs --fix  copy the canonical file out
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The first path in each list is canonical: `--fix` copies it over the rest.
 * A file that does not exist in a given actor is simply skipped, so adding a
 * module to one actor first does not break the check.
 */
const SHARED_FILES = [
    [
        'apify-actor/src/emails.js',
        'instagram-email-scraper/src/emails.js',
        'google-leads-scraper/src/emails.js',
        'browser-extension/emails.js',
        'lead-normalizer/src/emails.js',
        'instagram-keyword-scraper/src/emails.js',
    ],
    [
        'google-leads-scraper/src/social.js',
        'instagram-email-scraper/src/social.js',
        'browser-extension/social.js',
        'lead-normalizer/src/social.js',
        'instagram-keyword-scraper/src/social.js',
    ],
    [
        'google-leads-scraper/test/igSearch.test.js',
        'instagram-keyword-scraper/test/igSearch.test.js',
    ],
    [
        'google-leads-scraper/src/igSearch.js',
        'browser-extension/igSearch.js',
        'instagram-keyword-scraper/src/igSearch.js',
    ],
    [
        'google-leads-scraper/src/website.js',
        'instagram-email-scraper/src/website.js',
    ],
    [
        'lead-normalizer/src/parse.js',
        'instagram-email-scraper/src/parse.js',
    ],
    [
        'lead-normalizer/test/parse.test.js',
        'instagram-email-scraper/test/parse.test.js',
    ],
    [
        'google-leads-scraper/src/emailVerify.js',
        'instagram-email-scraper/src/emailVerify.js',
        'lead-normalizer/src/emailVerify.js',
        'instagram-keyword-scraper/src/emailVerify.js',
    ],
    [
        'google-leads-scraper/test/social.test.js',
        'instagram-email-scraper/test/social.test.js',
        'lead-normalizer/test/social.test.js',
        'instagram-keyword-scraper/test/social.test.js',
    ],
    [
        'google-leads-scraper/test/emailVerify.test.js',
        'instagram-email-scraper/test/emailVerify.test.js',
        'lead-normalizer/test/emailVerify.test.js',
        'instagram-keyword-scraper/test/emailVerify.test.js',
    ],
    [
        'apify-actor/test/emails.test.js',
        'instagram-email-scraper/test/emails.test.js',
        'google-leads-scraper/test/emails.test.js',
        'lead-normalizer/test/emails.test.js',
        'instagram-keyword-scraper/test/emails.test.js',
    ],
];

const fix = process.argv.includes('--fix');
let drifted = 0;

for (const [canonical, ...copies] of SHARED_FILES) {
    const canonicalPath = join(repoRoot, canonical);
    if (!existsSync(canonicalPath)) {
        console.error(`✗ canonical file missing: ${canonical}`);
        drifted += 1;
        continue;
    }

    const expected = readFileSync(canonicalPath, 'utf8');

    for (const copy of copies) {
        const copyPath = join(repoRoot, copy);
        if (!existsSync(copyPath)) continue;

        if (readFileSync(copyPath, 'utf8') === expected) continue;

        if (fix) {
            writeFileSync(copyPath, expected);
            console.log(`↻ synced ${relative(repoRoot, copyPath)} from ${canonical}`);
        } else {
            console.error(`✗ ${copy} has drifted from ${canonical}`);
            drifted += 1;
        }
    }
}

if (drifted) {
    console.error(`\n${drifted} shared file(s) out of sync. Run: node scripts/check-shared-modules.mjs --fix`);
    process.exit(1);
}

console.log('✓ shared modules are in sync');
