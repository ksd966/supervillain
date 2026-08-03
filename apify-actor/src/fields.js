/**
 * Turns the user's `extractFields` input into output columns.
 */

/** Attributes whose values are URLs and should be returned absolute. */
const URL_ATTRIBUTES = new Set(['href', 'src', 'srcset', 'action', 'poster', 'data-src', 'data-href']);

/**
 * Accepts either the shorthand (`"h1"` or `{ heading: "h1" }`) or the full
 * object form, and returns a normalised list.
 *
 * @param {unknown} input
 * @returns {Array<{name: string, selector: string, type: string, attr: string|null, multiple: boolean}>}
 */
export function normalizeFieldDefinitions(input) {
    if (!input) return [];

    // Object form: { title: "h1", price: ".price" }
    const entries = Array.isArray(input)
        ? input
        : Object.entries(input).map(([name, selector]) => ({ name, selector }));

    const fields = [];
    for (const [index, entry] of entries.entries()) {
        const raw = typeof entry === 'string' ? { selector: entry } : entry;
        if (!raw || typeof raw !== 'object' || !raw.selector) continue;

        const type = (raw.type ?? 'text').toLowerCase();
        const attr = raw.attr ?? raw.attribute ?? null;

        fields.push({
            name: raw.name ?? raw.key ?? `field_${index + 1}`,
            selector: String(raw.selector),
            type: ['text', 'html', 'attr', 'exists', 'count'].includes(type) ? type : 'text',
            attr: attr ? String(attr) : null,
            multiple: Boolean(raw.multiple ?? raw.array),
        });
    }
    return fields;
}

/**
 * @param {import('cheerio').CheerioAPI} $
 * @param {import('cheerio').Element} el
 * @param {{type: string, attr: string|null}} field
 * @param {string} baseUrl
 * @returns {string|null}
 */
function readValue($, el, field, baseUrl) {
    const $el = $(el);

    if (field.type === 'html') return $el.html();

    if (field.type === 'attr') {
        const value = $el.attr(field.attr);
        if (value == null) return null;
        if (URL_ATTRIBUTES.has(field.attr.toLowerCase())) {
            try {
                return new URL(value, baseUrl).href;
            } catch {
                return value;
            }
        }
        return value;
    }

    return $el.text().replace(/\s+/g, ' ').trim() || null;
}

/**
 * @param {object} params
 * @param {import('cheerio').CheerioAPI} params.$
 * @param {Array<ReturnType<typeof normalizeFieldDefinitions>[number]>} params.fields
 * @param {string} params.baseUrl used to resolve relative URLs
 * @returns {Record<string, unknown>}
 */
export function extractFields({ $, fields, baseUrl }) {
    const result = {};

    for (const field of fields) {
        let $matches;
        try {
            $matches = $(field.selector);
        } catch {
            // An invalid selector shouldn't sink the whole page.
            result[field.name] = null;
            continue;
        }

        if (field.type === 'exists') {
            result[field.name] = $matches.length > 0;
            continue;
        }
        if (field.type === 'count') {
            result[field.name] = $matches.length;
            continue;
        }
        if (field.type === 'attr' && !field.attr) {
            result[field.name] = null;
            continue;
        }

        if (field.multiple) {
            result[field.name] = $matches
                .toArray()
                .map((el) => readValue($, el, field, baseUrl))
                .filter((value) => value != null && value !== '');
        } else {
            result[field.name] = $matches.length ? readValue($, $matches.get(0), field, baseUrl) : null;
        }
    }

    return result;
}
