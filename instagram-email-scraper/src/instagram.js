/**
 * Instagram profile fetching and response mapping.
 *
 * Data comes from the same internal endpoint the website itself calls when you
 * open a profile — `web_profile_info`. It is not a public API: it is
 * undocumented, unversioned, and Meta changes it without notice. Everything
 * here is written defensively for that reason.
 */

import { gotScraping } from 'crawlee';

/** The web client's app id. Sent by instagram.com on every XHR. */
export const IG_APP_ID = '936619743392459';

/**
 * Overridable so the orchestration can be exercised against a stub instead of
 * the live site, and so anyone routing through their own gateway can point it
 * there. Unset in normal use.
 */
const PROFILE_ENDPOINT = process.env.IG_PROFILE_ENDPOINT
    || 'https://www.instagram.com/api/v1/users/web_profile_info/';

/**
 * Meta's own rate limiter is a sliding window keyed on IP, cookie and session,
 * so "wait a bit between requests" does not buy a higher ceiling — only a new
 * IP does. These are the observed shapes of being throttled.
 */
export const RATE_LIMITED_STATUS_CODES = new Set([401, 429]);

/**
 * @param {string} username
 * @param {object} [options]
 * @param {string} [options.sessionCookie] value of the `sessionid` cookie
 * @param {string} [options.proxyUrl]
 * @param {number} [options.timeoutSecs]
 * @returns {Promise<{ok: boolean, user?: object, statusCode: number, reason?: string}>}
 */
export async function fetchProfile(username, options = {}) {
    const { sessionCookie, proxyUrl, timeoutSecs = 30 } = options;

    const headers = {
        'x-ig-app-id': IG_APP_ID,
        'x-asbd-id': '129',
        'x-ig-www-claim': '0',
        'x-requested-with': 'XMLHttpRequest',
        accept: '*/*',
        'accept-language': 'en-US,en;q=0.9',
        referer: `https://www.instagram.com/${encodeURIComponent(username)}/`,
    };
    if (sessionCookie) headers.cookie = `sessionid=${sessionCookie}`;

    const response = await gotScraping({
        url: `${PROFILE_ENDPOINT}?username=${encodeURIComponent(username)}`,
        headers,
        proxyUrl,
        responseType: 'text',
        throwHttpErrors: false,
        timeout: { request: timeoutSecs * 1000 },
        retry: { limit: 0 },
    });

    const { statusCode } = response;

    if (RATE_LIMITED_STATUS_CODES.has(statusCode)) {
        return { ok: false, statusCode, reason: 'rate-limited' };
    }
    if (statusCode === 404) {
        return { ok: false, statusCode, reason: 'not-found' };
    }
    if (statusCode !== 200) {
        return { ok: false, statusCode, reason: `http-${statusCode}` };
    }

    let payload;
    try {
        payload = JSON.parse(response.body);
    } catch {
        // A login wall or a checkpoint returns HTML with a 200.
        return { ok: false, statusCode, reason: 'not-json' };
    }

    const user = payload?.data?.user;
    if (!user) return { ok: false, statusCode, reason: 'no-user-in-response' };

    return { ok: true, statusCode, user };
}

/**
 * Flattens the endpoint's response into a record whose field names match what
 * the Apify Instagram scrapers emit, so downstream tooling built against those
 * keeps working.
 *
 * @param {object} user raw `data.user` object
 * @returns {object}
 */
export function mapProfile(user) {
    const bioLinks = Array.isArray(user.bio_links)
        ? user.bio_links.map((link) => ({ title: link.title ?? null, url: link.url ?? null })).filter((l) => l.url)
        : [];

    return {
        id: user.id ?? null,
        username: user.username ?? null,
        url: user.username ? `https://www.instagram.com/${user.username}/` : null,
        fullName: user.full_name || null,
        biography: user.biography || null,
        externalUrl: user.external_url || null,
        bioLinks,
        followersCount: user.edge_followed_by?.count ?? null,
        followsCount: user.edge_follow?.count ?? null,
        postsCount: user.edge_owner_to_timeline_media?.count ?? null,
        verified: Boolean(user.is_verified),
        private: Boolean(user.is_private),
        isBusinessAccount: Boolean(user.is_business_account),
        isProfessionalAccount: Boolean(user.is_professional_account),
        businessCategoryName: user.business_category_name || user.category_name || null,
        businessEmail: user.business_email || null,
        businessPhoneNumber: user.business_phone_number
            || [user.public_phone_country_code, user.public_phone_number].filter(Boolean).join(' ')
            || null,
        profilePicUrl: user.profile_pic_url_hd || user.profile_pic_url || null,
    };
}

/**
 * Turns a reason code from `fetchProfile` into something worth reading in the
 * log, since the difference between "banned" and "typo in the username"
 * decides what the operator should do next.
 *
 * @param {string} reason
 * @returns {string}
 */
export function explainFailure(reason) {
    switch (reason) {
        case 'rate-limited':
            return 'Instagram rate-limited this IP. The window is roughly 30 minutes and it is per-IP — '
                + 'waiting helps, sending more requests does not. Use proxies to scale past it.';
        case 'not-found':
            return 'No such profile (deleted, renamed, or a typo).';
        case 'not-json':
            return 'Instagram answered with a login wall or a checkpoint instead of JSON. '
                + 'A valid sessionCookie usually clears this.';
        case 'no-user-in-response':
            return 'The endpoint responded but carried no user object — the response shape may have changed.';
        default:
            return `Unexpected response (${reason}).`;
    }
}
