import { Actor } from 'apify';
import { gotScraping, log } from 'crawlee';

import { createMxChecker, keepSendable, verifyEmails } from './emailVerify.js';
import { MINEABLE_FIELDS, mapHeaders } from './headers.js';
import {
    cleanText,
    normalizeEmails,
    normalizeFollowers,
    normalizeInstagram,
    normalizePhone,
    normalizeState,
    normalizeWebsite,
    splitName,
} from './normalize.js';
import { parseAny } from './parse.js';
import { instagramHandlesFromHtml } from './social.js';

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

/**
 * Everything a source column can contribute, keyed by canonical field. Several
 * source columns may map to the same field (`Email` and `Email 2`), so values
 * accumulate rather than overwrite.
 *
 * @param {object} record
 * @returns {Record<string, unknown[]>}
 */
function gather(record) {
    const byField = {};
    for (const [header, field] of Object.entries(mapping)) {
        const value = record[header];
        if (value == null || value === '') continue;
        (byField[field] ??= []).push(value);
    }
    return byField;
}

const rows = [];

for (const record of parsed.records) {
    const byField = gather(record);
    const first = (field) => byField[field]?.[0] ?? null;

    const emails = new Set(normalizeEmails(byField.email?.join(' ')));
    const instagram = new Set();

    const igCandidate = normalizeInstagram(first('instagram'));
    if (igCandidate) instagram.add(igCandidate);

    // Free-text columns routinely carry the only address in the export — a bio
    // reading "bookings: hello@studio.com" or a notes column with a profile
    // link. Unmapped columns are mined too, then dropped.
    if (mineFreeText) {
        const minedFrom = [
            ...Object.entries(byField)
                .filter(([field]) => MINEABLE_FIELDS.has(field))
                .flatMap(([, values]) => values),
            ...unmapped.map((header) => record[header]).filter(Boolean),
        ].map(String);

        for (const blob of minedFrom) {
            normalizeEmails(blob).forEach((email) => emails.add(email));
            instagramHandlesFromHtml(blob).forEach((handle) => instagram.add(handle));
        }
    }

    const rawName = cleanText(first('name'));
    const contactName = cleanText(first('contactName'));
    const explicitFirst = cleanText(first('firstName'));
    const explicitLast = cleanText(first('lastName'));

    // Explicit first/last columns win; then a dedicated contact-person column;
    // only then fall back to splitting whatever is in the name column, which
    // for a business listing is usually the company and should not be split.
    const split = explicitFirst || explicitLast
        ? { firstName: explicitFirst || null, lastName: explicitLast || null, isPerson: true }
        : splitName(contactName || rawName);

    const state = normalizeState(first('state'));

    const row = {
        name: rawName || contactName || [explicitFirst, explicitLast].filter(Boolean).join(' ') || null,
        contactName: contactName || null,
        firstName: split.firstName,
        lastName: split.lastName,
        isPerson: split.isPerson,
        email: [...emails][0] ?? null,
        emails: [...emails],
        instagram: [...instagram][0] ?? null,
        instagramAll: [...instagram],
        phone: normalizePhone(first('phone'), phoneRegion),
        website: normalizeWebsite(first('website')),
        jobTitle: cleanText(first('jobTitle')) || null,
        address: cleanText(first('address')) || null,
        // Exports routinely put "Austin, TX" in the city column while also
        // carrying a state column. Keeping both leaves the state duplicated
        // inside the city, which shows up in every mail merge that uses it.
        city: cleanText(first('city')).replace(/,\s*[A-Za-z .]{2,20}$/, '').trim() || null,
        state: state || normalizeState((cleanText(first('city')).match(/,\s*([A-Za-z .]{2,20})$/) ?? [])[1]),
        postalCode: cleanText(first('postalCode')) || null,
        country: cleanText(first('country')) || null,
        category: cleanText(first('category')) || null,
        followers: normalizeFollowers(first('followers')),
        bio: cleanText(first('bio')) || null,
    };

    if (keepUnmappedColumns) {
        for (const header of unmapped) {
            if (record[header]) row[header] = record[header];
        }
    }

    rows.push(row);
}

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

/**
 * @param {object} row
 * @returns {string}
 */
function dedupeKey(row) {
    if (dedupeBy === 'website' && row.website) {
        try {
            const { host, pathname } = new URL(row.website);
            return `site:${host.replace(/^www\./i, '').toLowerCase()}${pathname.replace(/\/+$/, '').toLowerCase()}`;
        } catch { /* fall through */ }
    }
    if (dedupeBy === 'instagram' && row.instagram) return `ig:${row.instagram}`;
    if (dedupeBy === 'name+city') return `name:${(row.name ?? '').toLowerCase()}|${(row.city ?? '').toLowerCase()}`;
    if (row.email) return `email:${row.email}`;

    // Rows with nothing to key on must not all collapse into one another.
    return `row:${row.name ?? ''}|${row.website ?? ''}|${row.phone ?? ''}|${rows.indexOf(row)}`;
}

const deduped = new Map();
for (const row of output) {
    const key = dedupeKey(row);
    const existing = deduped.get(key);

    if (!existing) { deduped.set(key, row); continue; }

    // Merge rather than discard: the duplicate often carries the field the
    // first copy was missing.
    for (const [field, value] of Object.entries(row)) {
        if (existing[field] == null && value != null) existing[field] = value;
    }
    existing.emails = [...new Set([...existing.emails, ...row.emails])];
    existing.instagramAll = [...new Set([...existing.instagramAll, ...row.instagramAll])];
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
