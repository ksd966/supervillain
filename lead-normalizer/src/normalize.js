/**
 * Cleaning up the values themselves.
 *
 * Defaults are tuned for the US: phone numbers normalise to +1 E.164, states
 * resolve to two-letter codes. Both are overridable, but a CSV meant for a US
 * CRM or dialer wants exactly this shape.
 */

import { extractEmailsFromText } from './emails.js';
import { instagramHandleFromUrl } from './social.js';

const US_STATES = {
    alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
    colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
    hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
    kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
    massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
    missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
    'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
    oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
    virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
    wyoming: 'WY', 'district of columbia': 'DC', 'washington dc': 'DC', 'puerto rico': 'PR',
};

const STATE_CODES = new Set(Object.values(US_STATES));

/** Tokens that mark a name as a company rather than a person. */
const COMPANY_MARKERS = /\b(inc|llc|l\.l\.c|ltd|corp|corporation|co|company|group|holdings|partners|associates|studio|studios|salon|spa|clinic|dental|medical|law|agency|marketing|solutions|services|systems|realty|properties|construction|plumbing|roofing|hvac|fitness|gym|cafe|coffee|bakery|restaurant|barbershop|barber|boutique|shop|store|center|centre|institute|academy|university|foundation|the)\b|[&@]|\d/i;

/**
 * @param {string} value
 * @returns {string}
 */
function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeEmails(value) {
    if (value == null) return [];

    const text = Array.isArray(value) ? value.join(' ') : String(value);
    // A cell may hold several addresses separated by anything at all.
    return extractEmailsFromText(text.replace(/[;,|]+/g, ' '));
}

/**
 * Accepts a handle, an @handle, or a profile URL.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeInstagram(value) {
    const text = clean(Array.isArray(value) ? value[0] : value);
    if (!text) return null;

    if (/instagram\.com/i.test(text)) {
        const match = text.match(/https?:\/\/[^\s"'<>]+/i);
        return instagramHandleFromUrl(match ? match[0] : `https://${text.replace(/^\/+/, '')}`);
    }

    const handle = text.replace(/^@+/, '').toLowerCase();
    if (!/^[a-z0-9._]{1,30}$/.test(handle) || /^\.+$/.test(handle) || handle.startsWith('.')) return null;
    // A bare word with no dots could be anything; require it to look like a
    // handle rather than a first name typed into the wrong column.
    return handle;
}

/**
 * US-first phone normalisation to E.164, which is what CRMs and dialers want.
 *
 * @param {unknown} value
 * @param {string} [region] `US` or a `+NN` country code for everything else
 * @returns {string|null}
 */
export function normalizePhone(value, region = 'US') {
    const text = clean(Array.isArray(value) ? value[0] : value);
    if (!text) return null;

    // An extension is not part of the number and breaks a dialer if left on.
    const withoutExtension = text.split(/\b(?:ext|x|extension)\.?\s*\d+/i)[0];
    const digits = withoutExtension.replace(/[^\d+]/g, '');
    if (!digits) return null;

    if (digits.startsWith('+')) {
        const rest = digits.slice(1).replace(/\D/g, '');
        return rest.length >= 8 && rest.length <= 15 ? `+${rest}` : null;
    }

    const bare = digits.replace(/\D/g, '');

    if (region === 'US') {
        if (bare.length === 10) return `+1${bare}`;
        if (bare.length === 11 && bare.startsWith('1')) return `+${bare}`;
        return null;
    }

    const prefix = String(region).startsWith('+') ? region : `+${region}`;
    const national = bare.replace(/^0+/, '');
    return national.length >= 6 ? `${prefix}${national}` : null;
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeWebsite(value) {
    const text = clean(Array.isArray(value) ? value[0] : value);
    if (!text || /^(n\/?a|none|-)$/i.test(text)) return null;

    try {
        const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
        if (!/\./.test(url.hostname)) return null;
        return url.href.replace(/\/$/, '');
    } catch {
        return null;
    }
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeState(value) {
    const text = clean(value);
    if (!text) return null;

    const upper = text.toUpperCase();
    if (upper.length === 2 && STATE_CODES.has(upper)) return upper;

    return US_STATES[text.toLowerCase()] ?? text;
}

/**
 * Splits a person's name, and recognises when it is not one.
 *
 * A company name split into "first" and "last" is worse than no split at all —
 * a mail merge greeting "Hi Salon," reads as a mistake, "Hi Dental," reads as
 * a bot.
 *
 * @param {string} value
 * @returns {{firstName: string|null, lastName: string|null, isPerson: boolean}}
 */
export function splitName(value) {
    const text = clean(value);
    if (!text) return { firstName: null, lastName: null, isPerson: false };

    if (COMPANY_MARKERS.test(text)) return { firstName: null, lastName: null, isPerson: false };

    // "Smith, John" — the comma form some exports use.
    if (text.includes(',')) {
        const [last, first] = text.split(',').map(clean);
        if (first && last) return { firstName: first.split(' ')[0], lastName: last, isPerson: true };
    }

    const parts = text.split(' ').filter(Boolean);
    if (parts.length === 1) return { firstName: parts[0], lastName: null, isPerson: true };
    if (parts.length > 4) return { firstName: null, lastName: null, isPerson: false };

    return { firstName: parts[0], lastName: parts[parts.length - 1], isPerson: true };
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
export function normalizeFollowers(value) {
    const text = clean(value).toLowerCase();
    if (!text) return null;

    const match = text.match(/^([\d.,]+)\s*([km])?/);
    if (!match) return null;

    const base = Number(match[1].replace(/,/g, ''));
    if (!Number.isFinite(base)) return null;

    if (match[2] === 'k') return Math.round(base * 1000);
    if (match[2] === 'm') return Math.round(base * 1_000_000);
    return Math.round(base);
}

export { clean as cleanText };
