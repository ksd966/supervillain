/**
 * Normalises whatever the input throws at us into a clean list of usernames.
 */

/** Path segments that are Instagram features, not handles. */
export const RESERVED_PATHS = new Set([
    'p', 'reel', 'reels', 'explore', 'stories', 'tv', 'accounts',
    'direct', 'about', 'developer', 'legal', 'privacy', 'terms',
]);

/**
 * `https://www.instagram.com/nike/?hl=en` → `nike`
 *
 * @param {string} value
 * @returns {string|null}
 */
export function usernameFromUrl(value) {
    try {
        const { hostname, pathname } = new URL(value);
        if (!/(^|\.)instagram\.com$/i.test(hostname)) return null;

        const [handle] = pathname.split('/').filter(Boolean);
        if (!handle || RESERVED_PATHS.has(handle.toLowerCase())) return null;

        return handle;
    } catch {
        return null;
    }
}

/**
 * Accepts handles (`nike`, `@nike`), profile URLs, and the object forms the
 * Apify input editors produce (`{ url }` from requestListSources).
 *
 * @param {object} params
 * @param {Array<string|{username?: string, url?: string}>} [params.usernames]
 * @param {Array<string|{url?: string}>} [params.directUrls]
 * @returns {string[]} unique usernames, input order preserved
 */
export function resolveTargets({ usernames = [], directUrls = [] } = {}) {
    const fromUsernames = usernames
        .map((entry) => (typeof entry === 'string' ? entry : entry?.username ?? entry?.url ?? ''))
        .map((value) => String(value).trim())
        .filter(Boolean)
        .map((value) => (/^https?:\/\//i.test(value) ? usernameFromUrl(value) : value.replace(/^@/, '')));

    const fromUrls = directUrls
        .map((entry) => (typeof entry === 'string' ? entry : entry?.url ?? ''))
        .map((value) => String(value).trim())
        .filter(Boolean)
        .map((value) => usernameFromUrl(value));

    return [...new Set([...fromUsernames, ...fromUrls].filter(Boolean))];
}
