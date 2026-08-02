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

import { parseDelimited } from './parse.js';
import { RESERVED_PATHS, usernameFromUrl } from './targets.js';

/**
 * Words that follow "Instagram" in a title without being anyone's handle.
 * Without this, `Instagram Reels` reads as the user `reels`.
 */
const TITLE_STOPWORDS = new Set([
    ...RESERVED_PATHS,
    'photos', 'videos', 'posts', 'login', 'signup', 'help', 'search',
]);

/** Column names a header row uses for the handle — never handles themselves. */
const HEADER_WORDS = new Set([
    'username', 'usernames', 'handle', 'handles', 'user', 'users', 'account',
    'profile', 'profiles', 'instagram', 'ig', 'url', 'urls', 'link', 'links',
    'name', 'title', 'column_1',
]);

/**
 * Everything a handle cannot contain. Replacing rather than stripping keeps
 * word boundaries, which is what lets a mangled separator still separate:
 * a CSV read with the wrong code page turns `Instagram · ana` into
 * `Instagram聽路聽ana`, and both forms have to reach the same handle.
 */
const NOT_HANDLE = /[^A-Za-z0-9._@()]+/g;

/** Finds URL-shaped tokens, with or without a scheme. */
const URL_TOKEN = /https?:\/\/\S+|(?:[a-z0-9-]+\.)*instagram\.com\/\S*/gi;

/**
 * `Ana Kay (@anakayfit) • Instagram` → `anakayfit`
 * `Instagram · anakayfit`           → `anakayfit`
 *
 * @param {string} title
 * @returns {string|null}
 */
export function handleFromTitle(title) {
    const text = String(title ?? '').replace(NOT_HANDLE, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return null;

    const parenthesised = text.match(/\(@([A-Za-z0-9._]{1,30})\)/);
    if (parenthesised) return parenthesised[1].toLowerCase();

    // Anchored at both ends on purpose: `Ana on Instagram: "new drop"` collapses
    // to several words and must not match, or every caption becomes a handle.
    const bare = text.match(/^Instagram @?([A-Za-z0-9._]{1,30})$/i);
    if (bare && !TITLE_STOPWORDS.has(bare[1].toLowerCase())) return bare[1].toLowerCase();

    return null;
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
