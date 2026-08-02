/**
 * Bio-link enrichment.
 *
 * Only a minority of Instagram accounts fill in the public business e-mail, but
 * a large share link out to a site, a Linktree or a shop — and those almost
 * always carry a contact address. Following that link is also the cheap half of
 * the job: it is an ordinary website request, so Instagram's rate limit does not
 * apply to it.
 */

import { gotScraping } from 'crawlee';
import * as cheerio from 'cheerio';

import { extractEmailsFromPage } from './emails.js';

/** Path segments that mark a page as worth a second look. */
const CONTACT_SEGMENTS = new Set([
    'contact', 'contacts', 'contact-us', 'contactus',
    'kontakt', 'kontakti',
    'about', 'about-us', 'aboutus', 'o-nama',
    'impressum', 'imprint',
    'support', 'help',
]);

/** Tried at the root when the landing page links to no contact page at all. */
const GUESSED_PATHS = ['/contact', '/kontakt', '/contact-us', '/about'];

/**
 * A contact page is not always at the root — `/en/company/contact` and
 * `/shop/kontakt` are just as common — so match on any path segment.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
function looksLikeContactPage(pathname) {
    return pathname
        .toLowerCase()
        .split('/')
        .filter(Boolean)
        .some((segment) => CONTACT_SEGMENTS.has(segment.replace(/\.(html?|php|aspx?|jsp)$/, '')));
}

/** Link-in-bio services: the addresses live behind the outbound links, not on the page. */
const LINK_HUBS = /(^|\.)(linktr\.ee|beacons\.ai|linkin\.bio|lnk\.bio|milkshake\.app|carrd\.co|bio\.link|solo\.to|taplink\.cc)$/i;

/**
 * @param {string} hostname
 * @returns {boolean}
 */
export function isLinkHub(hostname) {
    return LINK_HUBS.test(hostname);
}

/**
 * @param {string} url
 * @returns {URL|null}
 */
function safeUrl(url) {
    try {
        const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * @param {string} url
 * @param {object} options
 * @returns {Promise<{html: string, finalUrl: string}|null>}
 */
async function fetchHtml(url, { proxyUrl, timeoutSecs }) {
    try {
        const response = await gotScraping({
            url,
            proxyUrl,
            responseType: 'text',
            throwHttpErrors: false,
            timeout: { request: timeoutSecs * 1000 },
            retry: { limit: 0 },
            headers: { accept: 'text/html,application/xhtml+xml' },
        });

        if (response.statusCode !== 200) return null;
        if (!/text\/html|application\/xhtml/i.test(response.headers['content-type'] ?? '')) return null;

        return { html: response.body, finalUrl: response.url ?? url };
    } catch {
        return null;
    }
}

/**
 * Scrapes one site (plus a few likely contact pages) for e-mail addresses.
 *
 * @param {string} startUrl
 * @param {object} [options]
 * @param {number} [options.maxPages] landing page included
 * @param {string} [options.proxyUrl]
 * @param {number} [options.timeoutSecs]
 * @param {string[]} [options.blockedDomains]
 * @returns {Promise<{emails: string[], pagesChecked: string[]}>}
 */
export async function scrapeWebsiteForEmails(startUrl, options = {}) {
    const {
        maxPages = 3,
        proxyUrl,
        timeoutSecs = 20,
        blockedDomains = [],
    } = options;

    const origin = safeUrl(startUrl);
    if (!origin) return { emails: [], pagesChecked: [] };

    const emailOptions = { scanRawHtml: true, deobfuscate: true, blockedDomains };
    const emails = new Set();
    const pagesChecked = [];
    const visited = new Set();

    /** @param {string} url */
    const visit = async (url) => {
        if (visited.has(url) || pagesChecked.length >= maxPages) return null;
        visited.add(url);

        const fetched = await fetchHtml(url, { proxyUrl, timeoutSecs });
        if (!fetched) return null;

        pagesChecked.push(url);
        const $ = cheerio.load(fetched.html);
        extractEmailsFromPage({ $, html: fetched.html, options: emailOptions })
            .forEach((email) => emails.add(email));

        return $;
    };

    const $landing = await visit(origin.href);

    // A Linktree-style hub has no content of its own — the real site is one of
    // its outbound links, so follow those instead of guessing contact paths.
    if ($landing && LINK_HUBS.test(origin.hostname)) {
        const outbound = [...new Set(
            $landing('a[href^="http"]')
                .toArray()
                .map((el) => $landing(el).attr('href'))
                .filter((href) => {
                    const parsed = safeUrl(href ?? '');
                    return parsed && parsed.hostname !== origin.hostname && !LINK_HUBS.test(parsed.hostname);
                }),
        )];

        for (const href of outbound) {
            if (pagesChecked.length >= maxPages) break;
            await visit(href);
        }
        return { emails: [...emails].sort(), pagesChecked };
    }

    // Otherwise try the usual contact pages, but only if the landing page came
    // up empty — no reason to spend requests once we have an address.
    if ($landing && emails.size === 0) {
        const linked = new Set(
            $landing('a[href]')
                .toArray()
                .map((el) => {
                    try {
                        return safeUrl(new URL($landing(el).attr('href'), origin.href).href);
                    } catch {
                        return null;
                    }
                })
                .filter((parsed) => parsed && parsed.hostname === origin.hostname)
                .filter((parsed) => looksLikeContactPage(parsed.pathname))
                .map((parsed) => parsed.href),
        );

        // Fall back to guessing the paths when the page links to none of them.
        const candidates = linked.size
            ? [...linked]
            : GUESSED_PATHS.map((path) => new URL(path, origin.origin).href);

        for (const url of candidates) {
            if (pagesChecked.length >= maxPages) break;
            await visit(url);
        }
    }

    return { emails: [...emails].sort(), pagesChecked };
}
