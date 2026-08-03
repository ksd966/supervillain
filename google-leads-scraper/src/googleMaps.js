/**
 * Google Maps source.
 *
 * Maps is a JavaScript application with no usable HTML fallback, so this needs
 * a real browser. The DOM it renders is generated and unversioned: class names
 * are obfuscated and rotate, and Google reshuffles the panel layout every few
 * months. Two things keep that from being fatal:
 *
 *   1. Selectors prefer `data-item-id` and ARIA roles, which describe what a
 *      node *is* and survive restyling far better than class names.
 *   2. Every selector is overridable from the actor input, so a layout change
 *      is a config fix rather than a code change.
 *
 * Parsing is split from browser driving on purpose: `parsePlacePanel` is a pure
 * function over HTML, so the fragile half is the half that is unit tested.
 */

import * as cheerio from 'cheerio';

/** @type {Record<string, string>} */
export const DEFAULT_SELECTORS = {
    feed: 'div[role="feed"]',
    placeLink: 'a[href*="/maps/place/"]',
    name: 'h1',
    website: 'a[data-item-id="authority"]',
    phone: 'button[data-item-id^="phone:tel:"]',
    address: 'button[data-item-id="address"]',
    category: 'button[jsaction*="category"]',
    rating: 'div.F7nice',
};

/** Buttons that dismiss the EU consent interstitial, in several languages. */
const CONSENT_BUTTON_PATTERN = /^(prihvati|prihvatam|slažem se|slazem se|accept all|accept|alle akzeptieren|tout accepter|i agree)/i;

/**
 * Strips Google's label prefix from an aria-label: "Address: Knez Mihailova 1"
 * and "Adresa: Knez Mihailova 1" both become the value.
 *
 * @param {string|undefined} label
 * @returns {string|null}
 */
function stripAriaLabel(label) {
    if (!label) return null;
    const value = label.replace(/^[^:]{0,24}:\s*/u, '').trim();
    return value || null;
}

/**
 * Extracts one business from the HTML of an open Maps place panel.
 *
 * @param {string} html
 * @param {object} [options]
 * @param {Record<string, string>} [options.selectors]
 * @param {string} [options.url] the place URL, kept on the record
 * @returns {object|null} null when the panel carries no business name
 */
export function parsePlacePanel(html, { selectors = {}, url = null } = {}) {
    const sel = { ...DEFAULT_SELECTORS, ...selectors };
    const $ = cheerio.load(html);

    const name = $(sel.name).first().text().trim();
    if (!name) return null;

    const websiteHref = $(sel.website).first().attr('href') ?? null;

    // The number is carried in the attribute itself — `phone:tel:+381111234567`
    // — which is cleaner than the localised aria-label.
    const phoneItemId = $(sel.phone).first().attr('data-item-id') ?? '';
    const phone = phoneItemId.startsWith('phone:tel:')
        ? phoneItemId.slice('phone:tel:'.length)
        : stripAriaLabel($(sel.phone).first().attr('aria-label'));

    const address = stripAriaLabel($(sel.address).first().attr('aria-label'))
        ?? ($(sel.address).first().text().trim() || null);

    const ratingText = $(sel.rating).first().text().trim();
    const ratingMatch = ratingText.match(/(\d+[.,]\d+)/);
    const reviewsMatch = ratingText.match(/\(([\d.,\s]+)\)/);

    return {
        source: 'google-maps',
        name,
        category: $(sel.category).first().text().trim() || null,
        address,
        website: websiteHref,
        phone: phone || null,
        rating: ratingMatch ? Number(ratingMatch[1].replace(',', '.')) : null,
        reviewsCount: reviewsMatch ? Number(reviewsMatch[1].replace(/[^\d]/g, '')) : null,
        googleMapsUrl: url,
        emails: [],
        instagramHandles: [],
    };
}

/**
 * Clears the EU consent interstitial if it is in the way.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<boolean>} whether something was clicked
 */
export async function dismissConsent(page) {
    if (!/consent\.google\.com|\/sorry\//.test(page.url())) return false;

    const buttons = await page.locator('button, input[type="submit"]').all();
    for (const button of buttons) {
        const label = ((await button.textContent().catch(() => '')) ?? '').trim()
            || ((await button.getAttribute('aria-label').catch(() => '')) ?? '').trim();

        if (CONSENT_BUTTON_PATTERN.test(label)) {
            await button.click({ timeout: 5000 }).catch(() => {});
            await page.waitForLoadState('domcontentloaded').catch(() => {});
            return true;
        }
    }
    return false;
}

/**
 * Scrolls the results feed until it stops growing or the target is reached.
 *
 * @param {import('playwright').Page} page
 * @param {object} params
 * @param {number} params.maxResults
 * @param {Record<string, string>} params.selectors
 * @param {(message: string) => void} [params.onNotice]
 * @returns {Promise<string[]>} place URLs, de-duplicated, in feed order
 */
export async function collectPlaceUrls(page, { maxResults, selectors, onNotice = () => {} }) {
    const sel = { ...DEFAULT_SELECTORS, ...selectors };
    const seen = new Set();
    let idleRounds = 0;

    // Three rounds without growth means the feed has genuinely ended — Maps
    // loads lazily, so a single empty round is normal mid-scroll.
    while (seen.size < maxResults && idleRounds < 3) {
        const urls = await page
            .locator(`${sel.feed} ${sel.placeLink}`)
            .evaluateAll((nodes) => nodes.map((node) => node.href))
            .catch(() => []);

        const before = seen.size;
        urls.forEach((url) => { if (seen.size < maxResults) seen.add(url); });

        if (seen.size === before) idleRounds += 1;
        else idleRounds = 0;

        if (seen.size >= maxResults) break;

        const scrolled = await page
            .locator(sel.feed)
            .evaluate((node) => {
                const before2 = node.scrollTop;
                node.scrollTop = node.scrollHeight;
                return node.scrollTop !== before2;
            })
            .catch(() => false);

        if (!scrolled) idleRounds += 1;
        await page.waitForTimeout(1500);
    }

    if (!seen.size) {
        onNotice('The results feed stayed empty. Either the query has no results, or Google served '
            + 'a consent wall or a CAPTCHA instead of the map.');
    }

    return [...seen];
}

/**
 * @param {string} query
 * @param {string} [languageCode]
 * @returns {string}
 */
export function searchUrl(query, languageCode = 'sr') {
    return `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=${encodeURIComponent(languageCode)}`;
}
