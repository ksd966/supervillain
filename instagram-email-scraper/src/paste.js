/**
 * Turning one pasted blob into a list of handles.
 *
 * The commercial actors take profile URLs one per input field, which means the
 * real work happens before the run: open the export, filter it, copy the URL
 * column, paste. This module exists so that step disappears — paste the export
 * whole, or a list of URLs, or a list of handles, and it sorts itself out.
 *
 * The part that actually matters is post and reel URLs. A search-results export
 * is not a list of profiles: `instagram.com/reel/Dbd5W7ECR1q/` names no one, so
 * anything keying on the URL alone silently drops those rows — in the exports
 * this was written against, about a third of them. The handle is still there,
 * one column over, in the result title.
 */

import { parseProfileTitle } from './igSearch.js';
import { parseDelimited } from './parse.js';
import { usernameFromUrl } from './targets.js';

/** Column names a header row uses for the handle — never handles themselves. */
const HEADER_WORDS = new Set([
    'username', 'usernames', 'handle', 'handles', 'user', 'users', 'account',
    'profile', 'profiles', 'instagram', 'ig', 'url', 'urls', 'link', 'links',
    'name', 'title', 'column_1',
]);

/** Finds URL-shaped tokens, with or without a scheme. */
const URL_TOKEN = /https?:\/\/\S+|(?:[a-z0-9-]+\.)*instagram\.com\/\S*/gi;

/**
 * `Ana Kay (@anakayfit) • Instagram` → `anakayfit`
 * `Instagram · anakayfit`           → `anakayfit`
 *
 * Delegates to the shared title parser so this actor and the keyword scraper
 * cannot disagree about what a title names.
 *
 * @param {string} title
 * @returns {string|null}
 */
export function handleFromTitle(title) {
    return parseProfileTitle(title).handleFromTitle;
}

/**
 * @param {string} value a URL with or without a scheme
 * @returns {string|null}
 */
function handleFromUrlToken(value) {
    return usernameFromUrl(/^https?:\/\//i.test(value) ? value : `https://${value}`);
}

/**
 * @param {string} value
 * @returns {string|null}
 */
function bareHandle(value) {
    const match = String(value).trim().match(/^@?([A-Za-z0-9._]{1,30})$/);
    if (!match) return null;

    const handle = match[1];
    return HEADER_WORDS.has(handle.toLowerCase()) ? null : handle;
}

/**
 * @param {string} text anything: a CSV export, a list of URLs, a list of handles
 * @returns {string[]} unique handles, input order preserved
 */
export function handlesFromText(text) {
    const source = String(text ?? '').trim();
    if (!source) return [];

    // One decision up front rather than per row: an export that mentions
    // Instagram anywhere is read as URLs-and-titles, so a stray header cell
    // cannot be mistaken for someone's handle. Only a list with no URLs at all
    // is read as bare handles.
    const structured = /instagram\.com/i.test(source);
    const handles = [];

    for (const row of parseDelimited(source)) {
        const cells = row.map((cell) => String(cell ?? '').trim()).filter(Boolean);
        if (!cells.length) continue;

        if (!structured) {
            for (const cell of cells) {
                const handle = bareHandle(cell);
                if (handle) handles.push(handle);
            }
            continue;
        }

        const fromUrls = cells
            .flatMap((cell) => cell.match(URL_TOKEN) ?? [])
            .map(handleFromUrlToken)
            .filter(Boolean);

        if (fromUrls.length) { handles.push(...fromUrls); continue; }

        // Reached only when the row's URLs were posts or reels.
        const fromTitle = cells.map(handleFromTitle).find(Boolean);
        if (fromTitle) handles.push(fromTitle);
    }

    return [...new Set(handles)];
}
