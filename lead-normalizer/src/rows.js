/**
 * Turning one parsed record into one clean lead.
 *
 * Kept as a pure function, separate from the actor's I/O, for two reasons: it
 * is the part most worth testing, and it is the part the browser demo runs — so
 * what the demo shows is the shipped behaviour rather than a re-implementation
 * of it that can quietly drift.
 */

import { MINEABLE_FIELDS } from './headers.js';
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
import { instagramHandlesFromHtml } from './social.js';

/**
 * Everything a source column can contribute, keyed by canonical field.
 *
 * Several source columns may map to the same field (`Email` and `Email 2`), so
 * values accumulate rather than overwrite.
 *
 * @param {object} record
 * @param {Record<string, string>} mapping
 * @returns {Record<string, unknown[]>}
 */
function gather(record, mapping) {
    const byField = {};
    for (const [header, field] of Object.entries(mapping)) {
        const value = record[header];
        if (value == null || value === '') continue;
        (byField[field] ??= []).push(value);
    }
    return byField;
}

/**
 * @param {object} record one parsed source row
 * @param {object} params
 * @param {Record<string, string>} params.mapping source header → canonical field
 * @param {string[]} [params.unmapped] headers nobody claimed
 * @param {boolean} [params.mineFreeText]
 * @param {string} [params.phoneRegion]
 * @param {boolean} [params.keepUnmappedColumns]
 * @returns {object}
 */
export function buildRow(record, {
    mapping,
    unmapped = [],
    mineFreeText = true,
    phoneRegion = 'US',
    keepUnmappedColumns = false,
} = {}) {
    const byField = gather(record, mapping);
    const first = (field) => byField[field]?.[0] ?? null;

    const emails = new Set(normalizeEmails(byField.email?.join(' ')));
    const instagram = new Set();

    const igCandidate = normalizeInstagram(first('instagram'));
    if (igCandidate) instagram.add(igCandidate);

    // Free-text columns routinely carry the only address in the export — a bio
    // reading "bookings: hello@studio.com" or a notes column with a profile
    // link. Unmapped columns are mined too, then dropped.
    if (mineFreeText) {
        const blobs = [
            ...Object.entries(byField)
                .filter(([field]) => MINEABLE_FIELDS.has(field))
                .flatMap(([, values]) => values),
            ...unmapped.map((header) => record[header]).filter(Boolean),
        ].map(String);

        for (const blob of blobs) {
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

    const rawCity = cleanText(first('city'));
    const explicitState = normalizeState(first('state'));

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
        city: rawCity.replace(/,\s*[A-Za-z .]{2,20}$/, '').trim() || null,
        state: explicitState || normalizeState((rawCity.match(/,\s*([A-Za-z .]{2,20})$/) ?? [])[1]),
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

    return row;
}

/**
 * Identity for de-duplication.
 *
 * @param {object} row
 * @param {string} [dedupeBy] `email` | `website` | `instagram` | `name+city`
 * @param {number} [index] tiebreaker so rows with nothing to key on stay apart
 * @returns {string}
 */
export function dedupeKey(row, dedupeBy = 'email', index = 0) {
    if (dedupeBy === 'website' && row.website) {
        try {
            const { host, pathname } = new URL(row.website);
            return `site:${host.replace(/^www\./i, '').toLowerCase()}${pathname.replace(/\/+$/, '').toLowerCase()}`;
        } catch { /* fall through to the e-mail key */ }
    }
    if (dedupeBy === 'instagram' && row.instagram) return `ig:${row.instagram}`;
    if (dedupeBy === 'name+city') return `name:${(row.name ?? '').toLowerCase()}|${(row.city ?? '').toLowerCase()}`;
    if (row.email) return `email:${row.email}`;

    return `row:${row.name ?? ''}|${row.website ?? ''}|${row.phone ?? ''}|${index}`;
}

/**
 * Folds a duplicate into the row already kept.
 *
 * Merging rather than discarding, because the second copy often carries the
 * field the first was missing.
 *
 * @param {object} existing mutated
 * @param {object} incoming
 * @returns {object} existing
 */
export function mergeRow(existing, incoming) {
    for (const [field, value] of Object.entries(incoming)) {
        if (existing[field] == null && value != null) existing[field] = value;
    }
    existing.emails = [...new Set([...(existing.emails ?? []), ...(incoming.emails ?? [])])];
    existing.instagramAll = [...new Set([...(existing.instagramAll ?? []), ...(incoming.instagramAll ?? [])])];
    return existing;
}
