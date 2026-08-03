/**
 * Social profile links.
 *
 * Pure and dependency-free on purpose: this module is imported by the actors
 * *and* by the browser extension's service worker, where nothing from npm is
 * available and there is no DOM to parse with.
 *
 * SHARED MODULE — byte-identical across every actor in this repo. Apify actors
 * deploy as self-contained Docker build contexts, so each carries its own copy
 * instead of reaching outside its directory. Edit one, then run
 * `node scripts/check-shared-modules.mjs --fix` from the repo root to
 * propagate; `npm test` at the root fails if the copies drift apart.
 */

/** Instagram paths that are features rather than handles. */
const IG_RESERVED = new Set([
    'p', 'reel', 'reels', 'explore', 'stories', 'tv', 'accounts', 'direct',
    'about', 'legal', 'privacy', 'terms', 'developer', 'api', 'challenge',
    'emails', 'session', 'oauth', 'web',
]);

/**
 * Matches an Instagram profile URL anywhere in a blob of text or markup.
 *
 * The scheme is optional because free-text fields — a bio, a notes column —
 * carry bare `instagram.com/handle` far more often than a full URL. The
 * lookbehind is what keeps that from matching `notinstagram.com/handle`.
 */
const IG_URL_RE = /(?<![\w.-])(?:https?:\/\/)?(?:[a-z0-9-]+\.)*instagram\.com\/([A-Za-z0-9._]{1,30})(?:[/?#]|\b)/gi;

/**
 * @param {string} value a URL, absolute or protocol-relative
 * @returns {string|null} lower-cased handle, or null when it is not a profile
 */
export function instagramHandleFromUrl(value) {
    if (!value) return null;

    try {
        const raw = String(value).trim();
        const { hostname, pathname } = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
        if (!/(^|\.)instagram\.com$/i.test(hostname)) return null;

        const [handle] = pathname.split('/').filter(Boolean);
        if (!handle) return null;

        const normalized = handle.toLowerCase();
        if (IG_RESERVED.has(normalized)) return null;
        // A handle is 1-30 of letters, digits, dot and underscore. Anything else
        // is a path segment that happens to sit at the root.
        if (!/^[a-z0-9._]{1,30}$/.test(normalized)) return null;
        // All-dots or a leading dot is never a real handle.
        if (/^\.+$/.test(normalized) || normalized.startsWith('.')) return null;

        return normalized;
    } catch {
        return null;
    }
}

/**
 * Pulls every Instagram handle out of raw markup.
 *
 * Regex rather than DOM traversal because the extension's service worker has no
 * DOMParser, and because handles also appear outside `href` attributes — in
 * JSON-LD blocks, `data-` attributes and inline scripts.
 *
 * @param {string} html
 * @returns {string[]} unique, sorted handles
 */
export function instagramHandlesFromHtml(html) {
    if (!html) return [];

    const handles = new Set();
    for (const match of String(html).matchAll(IG_URL_RE)) {
        const handle = instagramHandleFromUrl(`https://instagram.com/${match[1]}`);
        if (handle) handles.add(handle);
    }
    return [...handles].sort();
}
