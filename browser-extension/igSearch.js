/**
 * Finding Instagram profiles through a search engine instead of through
 * Instagram.
 *
 * The trick the commercial "mass Instagram e-mail scraper" actors use, and it
 * is a good one: a public Instagram bio is indexed by Google, e-mail and all.
 * So `site:instagram.com "marketing" "new york" "@gmail.com"` returns profiles
 * whose bio contains that address, and the address is sitting right there in
 * the result snippet. Instagram is never contacted, so Instagram's rate limit —
 * the wall that makes profile-by-profile scraping slow — simply does not apply.
 *
 * What you get is what the search engine indexed: bio text only, no follower
 * counts, no private fields, and only profiles the engine happens to have
 * crawled. That is a real ceiling, but it is a different ceiling.
 *
 * Pure and dependency-free, so the browser extension can use the same query
 * builder and the same result parser the actor uses.
 *
 * SHARED MODULE — byte-identical across every actor in this repo. Apify actors
 * deploy as self-contained Docker build contexts, so each carries its own copy
 * instead of reaching outside its directory. Edit one, then run
 * `node scripts/check-shared-modules.mjs --fix` from the repo root to
 * propagate; `npm test` at the root fails if the copies drift apart.
 */

/**
 * Free-mail domains, searched one at a time.
 *
 * Naming a domain in the query is what makes the search return profiles that
 * publish an address at all rather than profiles that merely match the
 * keyword — but on its own it only ever finds addresses on these six.
 */
export const COMMON_EMAIL_DOMAINS = [
    '@gmail.com', '@yahoo.com', '@hotmail.com', '@outlook.com', '@icloud.com', '@aol.com',
];

/**
 * The other half of the coverage, and for business outreach the better half.
 *
 * A company with its own domain writes `hello@theirsite.com`, which no
 * free-mail probe will ever match. Searching the *local part* — `"info@"` —
 * finds it without having to know the domain, because the engine indexes the
 * `@` as part of the word. These are the local parts businesses actually use.
 */
export const COMMON_ROLE_PREFIXES = [
    'info@', 'hello@', 'contact@', 'bookings@', 'booking@',
    'sales@', 'office@', 'hi@', 'team@', 'support@',
    'inquiries@', 'admin@', 'press@', 'help@',
];

/**
 * How queries are built. Several can be combined; the results are merged.
 *
 * - `freeMail`   — one query per free-mail domain
 * - `rolePrefix` — one query per business local part, catching custom domains
 * - `plain`      — no address token at all: every profile matching the keyword,
 *                  and whatever address happens to be in its snippet
 */
export const PROBE_KINDS = ['freeMail', 'rolePrefix', 'plain'];

/** Both address probes. Left out of the default is `plain`, which is far noisier. */
export const DEFAULT_PROBES = ['freeMail', 'rolePrefix'];

/**
 * @param {string} value
 * @returns {string} quoted for a search engine, with inner quotes removed
 */
function phrase(value) {
    return `"${String(value).replace(/"/g, '').trim()}"`;
}

/**
 * Builds one query per keyword × probe.
 *
 * Splitting by probe rather than OR-ing them matters: engines rank a narrow
 * query far better, and each query gets its own result page, so twenty probes
 * means twenty pages of results rather than one crowded page.
 *
 * @param {object} params
 * @param {string[]} params.keywords
 * @param {string} [params.location]
 * @param {string[]} [params.probes] any of PROBE_KINDS; defaults to DEFAULT_PROBES
 * @param {string[]} [params.emailDomains] overrides the free-mail probe list
 * @param {string[]} [params.rolePrefixes] overrides the local-part probe list
 * @param {string} [params.site] the profile host to restrict to
 * @returns {Array<{query: string, keyword: string, probe: string, token: string|null}>}
 */
export function buildSearchQueries({
    keywords = [],
    location = '',
    probes = DEFAULT_PROBES,
    emailDomains,
    rolePrefixes,
    site = 'instagram.com',
} = {}) {
    const cleanKeywords = keywords
        .map((keyword) => String(keyword ?? '').trim())
        .filter(Boolean);
    if (!cleanKeywords.length) return [];

    const clean = (list) => list.map((item) => String(item ?? '').trim()).filter(Boolean);
    const wanted = new Set(clean(probes).filter((probe) => PROBE_KINDS.includes(probe)));

    const domains = emailDomains?.length ? clean(emailDomains) : COMMON_EMAIL_DOMAINS;
    const prefixes = rolePrefixes?.length ? clean(rolePrefixes) : COMMON_ROLE_PREFIXES;

    /** @type {Array<{probe: string, token: string|null}>} */
    const tokens = [
        ...(wanted.has('freeMail') ? domains.map((token) => ({ probe: 'freeMail', token })) : []),
        ...(wanted.has('rolePrefix') ? prefixes.map((token) => ({ probe: 'rolePrefix', token })) : []),
        ...(wanted.has('plain') ? [{ probe: 'plain', token: null }] : []),
    ];

    // No usable probe selected still means "search the keyword", rather than
    // silently returning nothing.
    const effective = tokens.length ? tokens : [{ probe: 'plain', token: null }];

    const place = String(location ?? '').trim();
    const queries = [];
    const seen = new Set();

    for (const keyword of cleanKeywords) {
        for (const { probe, token } of effective) {
            const parts = [`site:${site}`, phrase(keyword)];
            if (place) parts.push(phrase(place));
            if (token) parts.push(phrase(token));

            const query = parts.join(' ');
            if (seen.has(query)) continue;
            seen.add(query);

            queries.push({ query, keyword, probe, token: token ?? null });
        }
    }

    return queries;
}

/**
 * Search engines render the profile title as `Full Name (@handle) • Instagram`
 * or `Full Name (@handle) on Instagram`. The display name is the part before
 * the parenthesis.
 *
 * @param {string} title
 * @returns {{name: string|null, handleFromTitle: string|null}}
 */
export function parseProfileTitle(title) {
    const text = String(title ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return { name: null, handleFromTitle: null };

    const match = text.match(/^(.*?)\s*\(@([A-Za-z0-9._]{1,30})\)/);
    if (match) {
        return { name: match[1].trim() || null, handleFromTitle: match[2].toLowerCase() };
    }

    // No handle in the title — strip the trailing site name and keep the rest.
    const name = text.replace(/\s*[•|·\-–]\s*Instagram.*$/i, '').replace(/\s+on Instagram.*$/i, '').trim();
    return { name: name || null, handleFromTitle: null };
}

/**
 * Turns one search result into a lead.
 *
 * @param {object} result
 * @param {string} result.url
 * @param {string} [result.title]
 * @param {string} [result.snippet] the indexed bio text — where the address is
 * @param {string} [result.keyword]
 * @param {object} helpers injected so this module stays dependency-free
 * @param {(url: string) => string|null} helpers.instagramHandleFromUrl
 * @param {(text: string) => string[]} helpers.extractEmailsFromText
 * @param {object} [options]
 * @param {string[]} [options.keepOnlyDomains] narrow the output to these domains
 * @returns {object|null} null when the result is not a profile page
 */
export function igLeadFromResult(result, helpers, options = {}) {
    const { instagramHandleFromUrl, extractEmailsFromText } = helpers;
    const { keepOnlyDomains = [] } = options;

    const handle = instagramHandleFromUrl(result?.url ?? '');
    if (!handle) return null;

    const { name, handleFromTitle } = parseProfileTitle(result.title);
    const snippet = String(result.snippet ?? '').replace(/\s+/g, ' ').trim();

    // Every address in the snippet is kept by default. Which domain was used to
    // *find* the profile says nothing about which addresses are worth having —
    // filtering by it threw away exactly the custom-domain business addresses
    // that are the best leads here.
    let emails = extractEmailsFromText(`${snippet} ${result.title ?? ''}`);

    if (keepOnlyDomains.length) {
        const wanted = keepOnlyDomains.map((domain) => String(domain).replace(/^@/, '').toLowerCase());
        emails = emails.filter((email) => wanted.some((domain) => email.endsWith(`@${domain}`)));
    }

    return {
        keyword: result.keyword ?? null,
        username: handleFromTitle ?? handle,
        title: result.title ?? null,
        name,
        description: snippet || null,
        url: `https://www.instagram.com/${handleFromTitle ?? handle}/`,
        email: emails[0] ?? null,
        emails,
    };
}

/**
 * One row per address, matching the shape the commercial actors emit — a lead
 * with two addresses becomes two rows.
 *
 * @param {object[]} leads
 * @returns {object[]}
 */
export function explodeByEmail(leads) {
    return leads.flatMap((lead) => (lead.emails?.length
        ? lead.emails.map((email) => ({ ...lead, email }))
        : [lead]));
}
