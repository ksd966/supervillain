/**
 * E-mail harvesting.
 *
 * Everything here is pure and DOM-library agnostic (it takes a Cheerio instance
 * plus the raw HTML), so it can be unit tested without spinning up a crawler.
 */

/**
 * Deliberately permissive — validation happens in `isPlausibleEmail`, not here.
 *
 * The local-part class is narrower than RFC 5322 allows on purpose: characters
 * like `/` and `:` are legal in theory but in practice only ever show up when
 * the regex is chewing through a URL, so excluding them costs nothing real and
 * removes a whole class of false positives.
 */
const EMAIL_RE = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+/g;

/**
 * `logo@2x.png`, `sprite@3x.webp` and friends match the e-mail shape perfectly.
 * Anything whose last label is a file extension is an asset, not an address.
 */
const ASSET_EXTENSIONS = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp', 'tiff',
    'css', 'js', 'mjs', 'cjs', 'json', 'xml', 'map', 'txt', 'md',
    'woff', 'woff2', 'ttf', 'eot', 'otf',
    'mp3', 'mp4', 'webm', 'ogg', 'wav', 'mov', 'avi',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'gz', 'rar',
    'php', 'html', 'htm', 'aspx', 'jsp',
]);

/** Tracking, error-reporting and CDN hosts that leak fake addresses into markup. */
const BLOCKED_DOMAIN_PATTERNS = [
    /(^|\.)sentry\.io$/i,
    /(^|\.)ingest\.sentry\.io$/i,
    /(^|\.)sentry-cdn\.com$/i,
    /(^|\.)wixpress\.com$/i,
    /(^|\.)wix\.com$/i,
    /(^|\.)squarespace\.com$/i,
    /(^|\.)godaddy\.com$/i,
    /(^|\.)sentry\.wixpress\.com$/i,
    /(^|\.)cloudflare\.com$/i,
    /(^|\.)w3\.org$/i,
    /(^|\.)schema\.org$/i,
];

/** Addresses that ship with themes, tutorials and lorem-ipsum blocks. */
const PLACEHOLDER_LOCAL_PARTS = new Set([
    'email', 'youremail', 'your-email', 'your_email', 'yourname',
    'someone', 'somebody', 'username', 'user', 'name', 'firstname',
    'lastname', 'test', 'example', 'sample', 'demo', 'placeholder',
    'noreply', 'no-reply', 'donotreply', 'do-not-reply',
]);

const PLACEHOLDER_DOMAINS = new Set([
    'example.com', 'example.org', 'example.net', 'example.edu',
    'domain.com', 'yourdomain.com', 'your-domain.com', 'mydomain.com',
    'email.com', 'address.com', 'website.com', 'yoursite.com',
    'test.com', 'sample.com', 'company.com', 'yourcompany.com',
    'sentry.io', 'localhost', 'gmail.co', 'mail.com',
]);

/** 32-hex-char local parts are Sentry public keys, not people. */
const HEX_KEY_RE = /^[0-9a-f]{32,}$/i;

const HTML_ENTITIES = {
    '&#64;': '@', '&#064;': '@', '&#x40;': '@', '&commat;': '@', '&at;': '@',
    '&#46;': '.', '&#046;': '.', '&#x2e;': '.', '&period;': '.', '&dot;': '.',
    '&#45;': '-', '&#95;': '_', '&amp;': '&',
};

/**
 * Cloudflare's e-mail protection stores the address XOR-encoded in hex, with the
 * first byte acting as the key. Decoding it turns "[email&nbsp;protected]" back
 * into a real address.
 *
 * @param {string} hex
 * @returns {string|null}
 */
export function decodeCloudflareEmail(hex) {
    if (typeof hex !== 'string' || hex.length < 4 || hex.length % 2 !== 0) return null;
    if (!/^[0-9a-fA-F]+$/.test(hex)) return null;

    const key = parseInt(hex.slice(0, 2), 16);
    let decoded = '';
    for (let i = 2; i < hex.length; i += 2) {
        decoded += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    }
    return decoded;
}

/**
 * Reverses the common "human readable, bot hostile" spellings of an address.
 *
 * @param {string} input
 * @returns {string}
 */
export function deobfuscate(input) {
    let out = input;

    for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
        out = out.split(entity).join(char);
    }

    // "name [at] example [dot] com", "name (at) example (dot) com", "name {AT} …"
    out = out.replace(/\s*[[({<]\s*(?:at|@|apnasty)\s*[\])}>]\s*/gi, '@');
    out = out.replace(/\s*[[({<]\s*(?:dot|punkt|tacka|točka)\s*[\])}>]\s*/gi, '.');

    // Bare "name at example dot com" — only rewritten when the whole phrase
    // matches, so ordinary prose containing "at" is left alone.
    out = out.replace(
        /\b([A-Za-z0-9._%+-]+)\s+(?:at|AT)\s+([A-Za-z0-9-]+(?:\s+(?:dot|DOT|punkt)\s+[A-Za-z0-9-]+)*)\s+(?:dot|DOT|punkt)\s+([A-Za-z]{2,24})\b/g,
        (_match, local, domain, tld) => `${local}@${domain.replace(/\s+(?:dot|DOT|punkt)\s+/g, '.')}.${tld}`,
    );

    return out;
}

/**
 * @param {string} email lower-cased candidate
 * @param {Set<string>} extraBlockedDomains
 * @returns {boolean}
 */
export function isPlausibleEmail(email, extraBlockedDomains = new Set()) {
    if (!email || email.length > 254) return false;

    const atIndex = email.lastIndexOf('@');
    if (atIndex < 1) return false;

    const local = email.slice(0, atIndex);
    const domain = email.slice(atIndex + 1);

    if (!local || local.length > 64) return false;
    if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
    if (HEX_KEY_RE.test(local)) return false;
    if (PLACEHOLDER_LOCAL_PARTS.has(local)) return false;

    const labels = domain.split('.');
    if (labels.length < 2) return false;
    if (labels.some((label) => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) return false;

    const tld = labels[labels.length - 1];
    if (!/^[a-z]{2,24}$/.test(tld)) return false;
    if (ASSET_EXTENSIONS.has(tld)) return false;

    if (PLACEHOLDER_DOMAINS.has(domain)) return false;
    if (extraBlockedDomains.has(domain)) return false;
    if (BLOCKED_DOMAIN_PATTERNS.some((pattern) => pattern.test(domain))) return false;

    // A user-supplied entry blocks its subdomains too: "example.com" kills "mail.example.com".
    for (const blocked of extraBlockedDomains) {
        if (domain.endsWith(`.${blocked}`)) return false;
    }

    return true;
}

/**
 * Pulls every candidate out of a blob of text and normalises it.
 *
 * @param {string} text
 * @param {Set<string>} blockedDomains
 * @returns {string[]}
 */
function matchEmails(text, blockedDomains) {
    if (!text) return [];

    const found = [];
    for (const raw of text.match(EMAIL_RE) ?? []) {
        // Trim leading separators the greedy local-part class may have swallowed.
        const email = raw.replace(/^[.\-_+'%]+/, '').toLowerCase();
        if (isPlausibleEmail(email, blockedDomains)) found.push(email);
    }
    return found;
}

/**
 * Collects addresses from a loaded page.
 *
 * Sources, in descending order of confidence:
 *   1. `mailto:` hrefs                     — an author's explicit declaration
 *   2. Cloudflare-protected nodes          — deliberately hidden, always real
 *   3. Visible text                        — very low noise
 *   4. Raw HTML (opt-in)                   — JSON-LD, data attributes, inline JS
 *
 * @param {object} params
 * @param {import('cheerio').CheerioAPI} params.$
 * @param {string} params.html
 * @param {object} [params.options]
 * @param {boolean} [params.options.scanRawHtml]
 * @param {boolean} [params.options.deobfuscate]
 * @param {string[]} [params.options.blockedDomains]
 * @returns {string[]} unique, sorted, lower-cased addresses
 */
export function extractEmailsFromPage({ $, html, options = {} }) {
    const {
        scanRawHtml = true,
        deobfuscate: shouldDeobfuscate = true,
        blockedDomains = [],
    } = options;

    const blocked = new Set(blockedDomains.map((d) => d.trim().toLowerCase()).filter(Boolean));
    const emails = new Set();
    const add = (candidates) => candidates.forEach((email) => emails.add(email));

    // 1. mailto: links — strip the ?subject=… tail and percent-decode.
    $('a[href^="mailto:" i]').each((_i, el) => {
        const href = $(el).attr('href') ?? '';
        let address = href.replace(/^mailto:/i, '').split('?')[0].trim();
        try {
            address = decodeURIComponent(address);
        } catch {
            // Malformed percent-escapes: keep the raw value.
        }
        // A single mailto: may carry several comma-separated recipients.
        for (const part of address.split(/[,;]/)) {
            add(matchEmails(part, blocked));
        }
    });

    // 2. Cloudflare e-mail protection.
    if (shouldDeobfuscate) {
        $('[data-cfemail]').each((_i, el) => {
            const decoded = decodeCloudflareEmail($(el).attr('data-cfemail'));
            if (decoded) add(matchEmails(decoded, blocked));
        });
        $('a[href*="/cdn-cgi/l/email-protection#"]').each((_i, el) => {
            const hex = ($(el).attr('href') ?? '').split('#')[1];
            const decoded = decodeCloudflareEmail(hex);
            if (decoded) add(matchEmails(decoded, blocked));
        });
    }

    // 3. Visible text.
    const $body = $('body').clone();
    $body.find('script, style, noscript, template').remove();
    const text = $body.text();
    add(matchEmails(shouldDeobfuscate ? deobfuscate(text) : text, blocked));

    // 4. Raw HTML.
    if (scanRawHtml && html) {
        add(matchEmails(shouldDeobfuscate ? deobfuscate(html) : html, blocked));
    }

    return [...emails].sort();
}
