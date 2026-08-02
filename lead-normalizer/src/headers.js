/**
 * Working out which column is which.
 *
 * Every tool names its columns differently — `Email`, `E-Mail Address`,
 * `contact_email`, `Owner Email`, `emails`. Matching on a fixed list of names
 * fails on the first export from a tool nobody anticipated, so this does two
 * passes: names first, then the values themselves. A column whose cells are
 * mostly `something@something.tld` is an e-mail column no matter what its
 * header says — and plenty of exports have no header row worth the name.
 */

/**
 * Canonical fields, each with the header names that map to it. Order matters:
 * the first alias that matches wins, so put the specific ones first.
 */
const FIELD_ALIASES = {
    email: [
        'email', 'emails', 'emailaddress', 'emailaddresses', 'email1', 'primaryemail',
        'contactemail', 'businessemail', 'workemail', 'publicemail', 'owneremail',
        'mail', 'mailaddress', 'epost', 'correo',
    ],
    firstName: ['firstname', 'fname', 'givenname', 'first'],
    lastName: ['lastname', 'lname', 'surname', 'familyname', 'last'],
    // The business itself.
    name: [
        'businessname', 'companyname', 'company', 'business', 'organization',
        'organisation', 'accountname', 'placename', 'listingname',
        'fullname', 'name', 'title',
    ],
    // The human at the business. US lead exports usually carry both, and
    // conflating them produces a mail merge that greets a company by a
    // person's first name — or the reverse.
    contactName: [
        'contactname', 'contactperson', 'ownername', 'owner', 'contact',
        'personname', 'person', 'decisionmaker', 'principal', 'agentname',
    ],
    instagram: [
        'instagram', 'instagramhandle', 'instagramusername', 'instagramurl',
        'instagramprofile', 'ig', 'ighandle', 'igusername', 'username', 'handle',
        'profileurl', 'socialinstagram',
    ],
    phone: [
        'phone', 'phonenumber', 'phone1', 'primaryphone', 'telephone', 'tel',
        'mobile', 'mobilephone', 'cell', 'cellphone', 'contactphone', 'businessphone',
        'whatsapp',
    ],
    website: [
        'website', 'websiteurl', 'weburl', 'web', 'url', 'site', 'homepage',
        'domain', 'companywebsite', 'link',
    ],
    jobTitle: ['jobtitle', 'position', 'role', 'occupation', 'headline', 'designation'],
    city: ['city', 'town', 'locality', 'addresscity'],
    state: ['state', 'province', 'region', 'addressstate', 'stateprovince'],
    country: ['country', 'countryname', 'addresscountry'],
    postalCode: ['zip', 'zipcode', 'postalcode', 'postcode'],
    address: ['address', 'address1', 'streetaddress', 'street', 'fulladdress', 'location'],
    category: ['category', 'industry', 'niche', 'businesstype', 'type', 'vertical', 'sector'],
    followers: ['followers', 'followerscount', 'followercount', 'subscribers'],
    bio: ['bio', 'biography', 'description', 'about', 'summary', 'snippet', 'notes', 'note'],
};

/** Fields whose free text is worth mining for addresses and handles. */
export const MINEABLE_FIELDS = new Set(['bio', 'address', 'name', 'contactName', 'jobTitle', 'category']);

/**
 * @param {string} header
 * @returns {string}
 */
function normalizeHeader(header) {
    return String(header ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * @param {string} header
 * @returns {string|null}
 */
export function fieldFromHeader(header) {
    const normalized = normalizeHeader(header);
    if (!normalized) return null;

    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
        if (aliases.includes(normalized)) return field;
    }

    // Loose pass: "Owner E-mail Address 2" contains a known alias without
    // equalling one.
    //
    // Scoring rather than first-match, because several fields can match the
    // same header and declaration order is the wrong tiebreak: "Primary
    // Business Website" contains both `business` (a `name` alias) and
    // `website`. In an English column name the last word is the type, so a
    // match at the end outranks one in the middle, and a longer alias outranks
    // a shorter one.
    let best = null;

    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
        for (const alias of aliases) {
            if (alias.length < 4 || !normalized.includes(alias)) continue;

            const score = alias.length * (normalized.endsWith(alias) ? 2 : 1);
            if (!best || score > best.score) best = { field, score };
        }
    }

    return best?.field ?? null;
}

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const IG_LIKE = /(^@[A-Za-z0-9._]{1,30}$)|instagram\.com\//i;
const URL_LIKE = /^(https?:\/\/|www\.)/i;
const PHONE_LIKE = /^[+(]?[\d][\d\s().-]{6,20}$/;

/**
 * Guesses a column's field from its values.
 *
 * Only claims a column when a clear majority of its non-empty cells agree,
 * which keeps a stray e-mail inside a notes column from renaming that column.
 *
 * @param {string[]} values
 * @returns {string|null}
 */
export function fieldFromValues(values) {
    const sample = values.map((value) => String(value ?? '').trim()).filter(Boolean).slice(0, 60);
    if (sample.length < 2) return null;

    const share = (predicate) => sample.filter(predicate).length / sample.length;

    if (share((value) => EMAIL_LIKE.test(value)) >= 0.6) return 'email';
    if (share((value) => IG_LIKE.test(value)) >= 0.6) return 'instagram';
    if (share((value) => PHONE_LIKE.test(value) && (value.match(/\d/g) ?? []).length >= 7) >= 0.6) return 'phone';
    if (share((value) => URL_LIKE.test(value)) >= 0.6) return 'website';

    return null;
}

/**
 * Maps every source column onto a canonical field.
 *
 * @param {string[]} headers
 * @param {object[]} records
 * @returns {{mapping: Record<string, string>, unmapped: string[]}}
 */
export function mapHeaders(headers, records = []) {
    const mapping = {};
    const unmapped = [];
    const claimed = new Set();

    for (const header of headers) {
        const byName = fieldFromHeader(header);
        // First column to claim a field keeps it; a later "Email 2" becomes an
        // extra source for mining rather than overwriting the primary.
        if (byName && !claimed.has(byName)) {
            mapping[header] = byName;
            claimed.add(byName);
            continue;
        }

        const byValue = fieldFromValues(records.map((record) => record[header]));
        if (byValue && !claimed.has(byValue)) {
            mapping[header] = byValue;
            claimed.add(byValue);
            continue;
        }

        unmapped.push(header);
    }

    return { mapping, unmapped };
}
