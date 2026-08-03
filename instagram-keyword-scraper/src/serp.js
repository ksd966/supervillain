/**
 * Search-engine result pages.
 *
 * Two engines, and the choice matters more than it looks:
 *
 * - **DuckDuckGo** serves a plain HTML endpoint with no JavaScript and no
 *   CAPTCHA for ordinary traffic. It is the default because it is the only one
 *   that works from a script, for free, without a proxy.
 * - **Google** has the far better index for `site:` queries — this is its home
 *   turf — but blocks datacenter IPs quickly. Worth selecting only when a
 *   residential proxy is configured.
 *
 * The parsers are pure functions over HTML so the fragile half can be tested
 * against fixtures rather than against a live engine that changes weekly.
 */

import * as cheerio from 'cheerio';
import { gotScraping } from 'crawlee';

/**
 * Overridable so the pipeline can be exercised against a stub, and so anyone
 * running their own SearXNG or similar can point at it. Unset in normal use.
 */
const DDG_ENDPOINT = process.env.DDG_ENDPOINT || 'https://html.duckduckgo.com/html/';

/**
 * DuckDuckGo wraps every outbound link in a redirector carrying the real URL
 * in `uddg`.
 *
 * @param {string} href
 * @returns {string|null}
 */
function unwrap(href) {
    if (!href) return null;
    try {
        const url = new URL(href, 'https://duckduckgo.com');
        const target = url.searchParams.get('uddg');
        return target ?? (/^https?:$/.test(url.protocol) ? url.href : null);
    } catch {
        return null;
    }
}

/**
 * @param {string} html
 * @returns {Array<{title: string, url: string, snippet: string}>}
 */
export function parseDuckDuckGo(html) {
    const $ = cheerio.load(html ?? '');
    const results = [];

    $('.result, .web-result').each((_i, element) => {
        const $result = $(element);
        const url = unwrap($result.find('a.result__a').first().attr('href'));
        if (!url) return;

        results.push({
            title: $result.find('a.result__a').first().text().replace(/\s+/g, ' ').trim(),
            url,
            snippet: $result.find('.result__snippet').first().text().replace(/\s+/g, ' ').trim(),
        });
    });

    return results;
}

/**
 * Google's markup has no stable class names, but the shape holds: an organic
 * result is a link wrapping an `<h3>`, with the snippet in the same block.
 *
 * @param {string} html
 * @returns {Array<{title: string, url: string, snippet: string}>}
 */
export function parseGoogle(html) {
    const $ = cheerio.load(html ?? '');
    const results = [];
    const seen = new Set();

    $('a:has(h3)').each((_i, element) => {
        const $anchor = $(element);
        const href = $anchor.attr('href') ?? '';

        // Logged-out Google still emits the old `/url?q=` wrapper in places.
        let url = href;
        if (href.startsWith('/url?')) {
            url = new URLSearchParams(href.slice(5)).get('q') ?? '';
        }
        if (!/^https?:\/\//.test(url) || seen.has(url)) return;
        seen.add(url);

        const block = $anchor.closest('div[data-hveid], div.g, li').first();
        results.push({
            title: $anchor.find('h3').first().text().replace(/\s+/g, ' ').trim(),
            url,
            snippet: (block.length ? block : $anchor.parent()).text().replace(/\s+/g, ' ').trim().slice(0, 500),
        });
    });

    return results;
}

/**
 * Runs one query.
 *
 * @param {string} query
 * @param {object} [options]
 * @param {'duckduckgo'|'google'} [options.engine]
 * @param {string} [options.proxyUrl]
 * @param {number} [options.timeoutSecs]
 * @param {number} [options.page] zero-based
 * @returns {Promise<{ok: boolean, results: object[], reason?: string}>}
 */
export async function search(query, options = {}) {
    const {
        engine = 'duckduckgo',
        proxyUrl,
        timeoutSecs = 30,
        page = 0,
    } = options;

    const request = engine === 'google'
        ? {
            url: `https://www.google.com/search?num=20&q=${encodeURIComponent(query)}${page ? `&start=${page * 10}` : ''}`,
            method: 'GET',
        }
        : {
            // The HTML endpoint takes POST and pages with `s`, 30 per page.
            url: DDG_ENDPOINT,
            method: 'POST',
            body: `q=${encodeURIComponent(query)}${page ? `&s=${page * 30}` : ''}`,
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
        };

    let response;
    try {
        response = await gotScraping({
            ...request,
            proxyUrl,
            responseType: 'text',
            throwHttpErrors: false,
            timeout: { request: timeoutSecs * 1000 },
            retry: { limit: 0 },
        });
    } catch (error) {
        return { ok: false, results: [], reason: `request-failed: ${error.message}` };
    }

    if (response.statusCode === 429) return { ok: false, results: [], reason: 'rate-limited' };
    if (response.statusCode !== 200) return { ok: false, results: [], reason: `http-${response.statusCode}` };

    // A CAPTCHA interstitial comes back as a 200 with a body that says so.
    if (/\/sorry\/|unusual traffic|captcha/i.test(response.body.slice(0, 4000))) {
        return { ok: false, results: [], reason: 'captcha' };
    }

    const results = engine === 'google' ? parseGoogle(response.body) : parseDuckDuckGo(response.body);
    return { ok: true, results };
}

/**
 * @param {string} reason
 * @returns {string}
 */
export function explainSearchFailure(reason) {
    if (reason === 'captcha') {
        return 'The engine served a CAPTCHA instead of results. This is what happens to a datacenter IP — '
            + 'use residential proxies, switch to the duckduckgo engine, or run the searches from the browser '
            + 'extension, which searches from your own session and is never challenged.';
    }
    if (reason === 'rate-limited') return 'The engine rate-limited this IP. Slow down or rotate proxies.';
    return `Search failed (${reason}).`;
}
