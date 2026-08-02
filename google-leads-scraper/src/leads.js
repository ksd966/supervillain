/**
 * De-duplication and merging of leads.
 *
 * The same business shows up twice for good reasons: two search phrases overlap,
 * or Google Maps and OpenStreetMap both know it. Merging them is the difference
 * between "40 leads" and "40 rows, 28 businesses".
 */

/**
 * A stable identity for a business.
 *
 * The website is the strongest signal, but the *hostname alone* is not: small
 * businesses routinely share one — `wixsite.com/salon-a` and
 * `wixsite.com/salon-b` are different companies, as are two tenants of the same
 * agency domain. Keying on host plus path keeps those apart while still
 * collapsing the same URL found twice. Port is kept so distinct local services
 * do not collide either.
 *
 * @param {object} lead
 * @returns {string}
 */
export function leadKey(lead) {
    if (lead?.website) {
        try {
            const { host, pathname } = new URL(lead.website);
            const normalizedHost = host.replace(/^www\./i, '').toLowerCase();
            const normalizedPath = pathname.replace(/\/+$/, '').toLowerCase();
            return `site:${normalizedHost}${normalizedPath}`;
        } catch {
            // Not a parseable URL — fall through to the name key.
        }
    }

    return `name:${(lead?.name ?? '').trim().toLowerCase()}|${(lead?.address ?? '').trim().toLowerCase()}`;
}

/** Scalar fields where an existing null should yield to an incoming value. */
const FILLABLE_FIELDS = [
    'address', 'phone', 'website', 'category', 'rating', 'reviewsCount',
    'latitude', 'longitude', 'googleMapsUrl', 'openStreetMapUrl', 'sourceId',
];

/**
 * Folds `incoming` into `existing` in place: gaps get filled, contact lists get
 * unioned, and the source label records that both found it.
 *
 * @param {object} existing mutated
 * @param {object} incoming
 * @returns {object} existing
 */
export function mergeLead(existing, incoming) {
    for (const field of FILLABLE_FIELDS) {
        if (existing[field] == null && incoming[field] != null) existing[field] = incoming[field];
    }

    existing.emails = [...new Set([...(existing.emails ?? []), ...(incoming.emails ?? [])])].sort();
    existing.instagramHandles = [...new Set([
        ...(existing.instagramHandles ?? []),
        ...(incoming.instagramHandles ?? []),
    ])].sort();

    if (incoming.source && existing.source !== incoming.source) {
        const sources = new Set([...String(existing.source ?? '').split('+'), incoming.source].filter(Boolean));
        existing.source = [...sources].sort().join('+');
    }

    return existing;
}

/**
 * @param {Iterable<object>} incoming
 * @param {Map<string, object>} [into]
 * @returns {Map<string, object>}
 */
export function collectLeads(incoming, into = new Map()) {
    for (const lead of incoming) {
        if (!lead) continue;

        const key = leadKey(lead);
        const existing = into.get(key);

        if (existing) mergeLead(existing, lead);
        else into.set(key, lead);
    }
    return into;
}
