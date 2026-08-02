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
 * Free-mail domains worth searching for one at a time. A bio that publishes a
 * contact address overwhelmingly uses one of these, and naming the domain in
 * the query is what makes the search return profiles that have an address at
 * all rather than profiles that merely match the keyword.
 */
export const COMMON_EMAIL_DOMAINS = [
    '@gmail.com', '@yahoo.com', '@hotmail.com', '@outlook.com', '@icloud.com', '@aol.com',
];

/**
 * @param {string} value
 * @returns {string} quoted for a search engine, with inner quotes removed
 */
function phrase(value) {
    return `"${String(value).replace(/"/g, '').trim()}"`;
}

/**
 * Builds one query per keyword × domain pair.
 *
 * Splitting by domain rather than OR-ing them matters: engines rank a narrow
 * query far better, and each query gets its own result page, so six domains
 * means six times the results rather than one crowded page.
 *
 * @param {object} params
 * @param {string[]} params.keywords
 * @param {string} [params.location]
 * @param {string[]} [params.emailDomains] defaults to the common free-mail set
 * @param {string} [params.site] the profile host to restrict to
 * @returns {Array<{query: string, keyword: string, emailDomain: string|null}>}
 */
export function buildSearchQueries({
    keywords = [],
    location = '',
    emailDomains,
    site = 'instagram.com',
} = {}) {
    const cleanKeywords = keywords
        .map((keyword) => String(keyword ?? '').trim())
        .filter(Boolean);
    if (!cleanKeywords.length) return [];

    const domains = (emailDomains?.length ? emailDomains : COMMON_EMAIL_DOMAINS)
        .map((domain) => String(domain ?? '').trim())
        .filter(Boolean);

    const place = String(location ?? '').trim();
    const queries = [];

    for (const keyword of cleanKeywords) {
        // An empty domain list means "any profile matching the keyword", which
        // is a legitimate ask even though the yield of addresses is lower.
        for (const emailDomain of (domains.length ? domains : [null])) {
            const parts = [`site:${site}`, phrase(keyword)];
            if (place) parts.push(phrase(place));
            if (emailDomain) parts.push(phrase(emailDomain));

            queries.push({ query: parts.join(' '), keyword, emailDomain });
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
 * @param {string[]} [options.emailDomains] keep only addresses on these domains
 * @returns {object|null} null when the result is not a profile page
 */
export function igLeadFromResult(result, helpers, options = {}) {
    const { instagramHandleFromUrl, extractEmailsFromText } = helpers;
    const { emailDomains = [] } = options;

    const handle = instagramHandleFromUrl(result?.url ?? '');
    if (!handle) return null;

    const { name, handleFromTitle } = parseProfileTitle(result.title);
    const snippet = String(result.snippet ?? '').replace(/\s+/g, ' ').trim();

    let emails = extractEmailsFromText(`${snippet} ${result.title ?? ''}`);

    if (emailDomains.length) {
        const wanted = emailDomains.map((domain) => String(domain).replace(/^@/, '').toLowerCase());
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
