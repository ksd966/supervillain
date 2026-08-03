import { Actor } from 'apify';
import { gotScraping, log } from 'crawlee';

import { createMxChecker, keepSendable, verifyEmails } from './emailVerify.js';
import { mapHeaders } from './headers.js';
import { parseAny } from './parse.js';
import { buildRow, dedupeKey, mergeRow } from './rows.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};

const {
    rawText = '',
    sourceUrl = '',
    format = 'auto',
    columns = ['name', 'firstName', 'lastName', 'email', 'instagram', 'phone', 'website', 'city', 'state', 'category'],
    mineFreeText = true,
    explodeMultiEmail = false,
    requireEmail = false,
    dedupeBy = 'email',
    phoneRegion = 'US',
    verifyEmailDomains = true,
    dropUndeliverable = false,
    dropRoleAccounts = false,
    keepUnmappedColumns = false,
} = input;

// --- load --------------------------------------------------------------------

let text = rawText;

if (!text && sourceUrl) {
    log.info(`Fetching ${sourceUrl}`);
    const response = await gotScraping({ url: sourceUrl, responseType: 'text', throwHttpErrors: false });
    if (response.statusCode !== 200) throw new Error(`Could not fetch sourceUrl — HTTP ${response.statusCode}.`);
    text = response.body;
}

if (!text.trim()) {
    throw new Error('Nothing to work on. Paste the export into "rawText", or point "sourceUrl" at it.');
}

const parsed = parseAny(text, { format });
if (!parsed.records.length) {
    throw new Error(`Parsed the input as ${parsed.format} but found no rows. Check the format setting.`);
}

const { mapping, unmapped } = mapHeaders(parsed.headers, parsed.records);

log.info(`Parsed ${parsed.records.length} row(s) as ${parsed.format}.`);
log.info('Column mapping:', mapping);
if (unmapped.length) {
    log.info(`Unrecognised columns${keepUnmappedColumns ? ' (kept as-is)' : ' (mined for contacts, then dropped)'}: ${unmapped.join(', ')}`);
}

// --- normalise ---------------------------------------------------------------

const rows = parsed.records.map((record) => buildRow(record, {
    mapping,
    unmapped,
    mineFreeText,
    phoneRegion,
    keepUnmappedColumns,
}));

// --- explode, filter, dedupe -------------------------------------------------

let output = rows;

if (explodeMultiEmail) {
    output = output.flatMap((row) => (row.emails.length > 1
        ? row.emails.map((email) => ({ ...row, email, emails: [email] }))
        : [row]));
    log.info(`Exploded multi-address rows: ${rows.length} → ${output.length}.`);
}

if (requireEmail) {
    const before = output.length;
    output = output.filter((row) => row.email);
    log.info(`Dropped ${before - output.length} row(s) without an e-mail.`);
}

const deduped = new Map();
for (const [index, row] of output.entries()) {
    const key = dedupeKey(row, dedupeBy, index);
    const existing = deduped.get(key);

    if (existing) mergeRow(existing, row);
    else deduped.set(key, row);
}

output = [...deduped.values()];
log.info(`De-duplicated by ${dedupeBy}: ${rows.length} → ${output.length}.`);

// --- verify ------------------------------------------------------------------

if (verifyEmailDomains) {
    const hasMx = createMxChecker();
    let dropped = 0;

    for (const row of output) {
        if (!row.emails.length) continue;

        row.emailDetails = await verifyEmails(row.emails, { hasMx });

        if (dropUndeliverable || dropRoleAccounts) {
            const kept = keepSendable(row.emailDetails, { requireMx: dropUndeliverable, dropRoleAccounts });
            dropped += row.emails.length - kept.length;
            row.emails = kept;
            row.email = kept[0] ?? null;
        } else {
            const detail = row.emailDetails.find((entry) => entry.email === row.email);
            row.emailDeliverable = detail?.mx ?? null;
            row.emailIsRole = detail?.roleAccount ?? null;
        }
    }

    if (dropped) log.info(`Verification dropped ${dropped} address(es).`);
    if (requireEmail) output = output.filter((row) => row.email);
}

// --- output ------------------------------------------------------------------

const scrapedAt = new Date().toISOString();
for (const row of output) {
    row.normalizedAt = scrapedAt;
    await Actor.pushData(row);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function csvCell(value) {
    const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csv = `${[
    columns.join(','),
    ...output.map((row) => columns.map((column) => csvCell(row[column])).join(',')),
].join('\n')}\n`;

// A BOM so Excel opens UTF-8 correctly on a double-click.
await Actor.setValue('CLEAN_CSV', `﻿${csv}`, { contentType: 'text/csv; charset=utf-8' });

await Actor.setValue('SUMMARY', {
    rowsIn: parsed.records.length,
    rowsOut: output.length,
    withEmail: output.filter((row) => row.email).length,
    withInstagram: output.filter((row) => row.instagram).length,
    withPhone: output.filter((row) => row.phone).length,
    people: output.filter((row) => row.isPerson).length,
    detectedFormat: parsed.format,
    columnMapping: mapping,
    unmappedColumns: unmapped,
    normalizedAt: scrapedAt,
});

await Actor.setValue('INSTAGRAM_HANDLES', [...new Set(output.flatMap((row) => row.instagramAll))].sort());

log.info(
    `Done: ${parsed.records.length} row(s) in → ${output.length} clean lead(s). `
    + `${output.filter((row) => row.email).length} with e-mail, `
    + `${output.filter((row) => row.instagram).length} with Instagram. `
    + 'CSV in the key-value store under "CLEAN_CSV".',
);

await Actor.exit();
