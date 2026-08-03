/**
 * OpenStreetMap source, via the Overpass API.
 *
 * Worth having alongside Google Maps because it is the only free source here
 * that stays free at volume: a public, documented API with no bot detection, no
 * CAPTCHA and no per-IP lottery. It trades coverage for reliability — OSM knows
 * fewer businesses than Google, and the ones it knows have patchier contact
 * details — but what it returns, it returns every time.
 */

import { gotScraping } from 'crawlee';

/**
 * Public instances, tried in order. They are donated capacity — be polite.
 *
 * Overridable via a comma-separated `OVERPASS_ENDPOINTS` so the pipeline can be
 * exercised against a stub, and so anyone running their own instance can point
 * at it instead of leaning on the public ones.
 */
export const OVERPASS_ENDPOINTS = process.env.OVERPASS_ENDPOINTS
    ? process.env.OVERPASS_ENDPOINTS.split(',').map((url) => url.trim()).filter(Boolean)
    : [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
    ];

/**
 * Flattens one Overpass element into a lead.
 *
 * @param {object} element
 * @returns {object|null} null when the element has no name worth keeping
 */
export function mapElement(element) {
    const tags = element?.tags ?? {};
    const name = tags.name || tags['name:sr'] || tags['name:en'];
    if (!name) return null;

    const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
    const address = [street, tags['addr:postcode'], tags['addr:city']].filter(Boolean).join(', ');

    const category = ['shop', 'amenity', 'leisure', 'office', 'craft', 'tourism']
        .map((key) => (tags[key] ? `${key}=${tags[key]}` : null))
        .find(Boolean) ?? null;

    return {
        source: 'openstreetmap',
        sourceId: element.type && element.id ? `${element.type}/${element.id}` : null,
        name,
        category,
        address: address || null,
        website: tags.website || tags['contact:website'] || tags.url || null,
        phone: tags.phone || tags['contact:phone'] || tags['contact:mobile'] || null,
        emails: [tags.email || tags['contact:email']].filter(Boolean).map((e) => e.toLowerCase()),
        instagramHandles: [tags['contact:instagram']].filter(Boolean),
        latitude: element.lat ?? element.center?.lat ?? null,
        longitude: element.lon ?? element.center?.lon ?? null,
        openStreetMapUrl: element.type && element.id
            ? `https://www.openstreetmap.org/${element.type}/${element.id}`
            : null,
    };
}

/**
 * Runs an Overpass QL query and maps the result.
 *
 * @param {string} query Overpass QL
 * @param {object} [options]
 * @param {string[]} [options.endpoints]
 * @param {number} [options.timeoutSecs]
 * @param {string} [options.proxyUrl]
 * @param {(message: string) => void} [options.onNotice]
 * @returns {Promise<{ok: boolean, leads: object[], reason?: string}>}
 */
export async function runOverpassQuery(query, options = {}) {
    const {
        endpoints = OVERPASS_ENDPOINTS,
        timeoutSecs = 120,
        proxyUrl,
        onNotice = () => {},
    } = options;

    let lastReason = 'no-endpoints';

    for (const endpoint of endpoints) {
        let response;
        try {
            response = await gotScraping({
                url: endpoint,
                method: 'POST',
                body: `data=${encodeURIComponent(query)}`,
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                proxyUrl,
                responseType: 'text',
                throwHttpErrors: false,
                timeout: { request: timeoutSecs * 1000 },
                retry: { limit: 0 },
            });
        } catch (error) {
            lastReason = `request-failed: ${error.message}`;
            onNotice(`Overpass endpoint ${endpoint} unreachable — ${error.message}`);
            continue;
        }

        // 429 and 504 are how Overpass says "too many of you at once".
        if (response.statusCode === 429 || response.statusCode === 504) {
            lastReason = `busy-${response.statusCode}`;
            onNotice(`Overpass endpoint ${endpoint} is busy (${response.statusCode}) — trying the next one.`);
            continue;
        }
        if (response.statusCode !== 200) {
            lastReason = `http-${response.statusCode}`;
            onNotice(`Overpass endpoint ${endpoint} answered ${response.statusCode} — trying the next one.`);
            continue;
        }

        let payload;
        try {
            payload = JSON.parse(response.body);
        } catch {
            lastReason = 'not-json';
            onNotice(`Overpass endpoint ${endpoint} returned a non-JSON body (usually a query syntax error).`);
            continue;
        }

        const leads = (payload.elements ?? []).map(mapElement).filter(Boolean);
        return { ok: true, leads };
    }

    return { ok: false, leads: [], reason: lastReason };
}
