/**
 * E-mail triage before you ever send anything.
 *
 * A scraped address can be syntactically perfect and still worthless: the
 * domain may not accept mail at all, or the address may be a throwaway. Sending
 * to those is what wrecks a sending domain's reputation, and the damage is
 * hard to undo — so the cheap check up front is worth a lot more than it costs.
 *
 * Two signals, both free:
 *   - MX lookup: does the domain publish a mail server? One DNS query, cached
 *     per domain, and it removes most dead addresses.
 *   - Classification: role account, disposable provider, free-mail provider.
 *     Not "bad" — just different. A role address reaches a desk rather than a
 *     person, which changes how you write to it.
 *
 * SHARED MODULE — byte-identical across every actor in this repo. Apify actors
 * deploy as self-contained Docker build contexts, so each carries its own copy
 * instead of reaching outside its directory. Edit one, then run
 * `node scripts/check-shared-modules.mjs --fix` from the repo root to
 * propagate; `npm test` at the root fails if the copies drift apart.
 */

import { Resolver } from 'node:dns/promises';

/** Reaches a function rather than a person. Still worth having — often the only address published. */
const ROLE_LOCAL_PARTS = new Set([
    'info', 'office', 'kontakt', 'contact', 'kontakti',
    'sales', 'prodaja', 'komercijala', 'shop', 'prodavnica',
    'support', 'podrska', 'help', 'pomoc',
    'admin', 'administracija', 'webmaster', 'postmaster', 'hostmaster',
    'hello', 'hi', 'zdravo', 'pozdrav',
    'marketing', 'pr', 'press', 'media', 'mediji',
    'booking', 'rezervacije', 'rezervacija', 'narudzbine', 'porudzbine',
    'billing', 'racunovodstvo', 'finansije', 'faktura',
    'hr', 'posao', 'jobs', 'karijera', 'career',
    'team', 'tim', 'company', 'firma',
]);

/** Throwaway inbox providers. Mail sent here is read by nobody. */
const DISPOSABLE_DOMAINS = new Set([
    'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', '10minutemail.com',
    'tempmail.com', 'temp-mail.org', 'throwawaymail.com', 'yopmail.com',
    'trashmail.com', 'sharklasers.com', 'getnada.com', 'maildrop.cc',
    'dispostable.com', 'mytemp.email', 'fakeinbox.com', 'mailnesia.com',
    'spamgourmet.com', 'moakt.com', 'emailondeck.com', 'tempr.email',
]);

/** Consumer mailboxes — common for sole traders, and a signal about company size. */
const FREE_MAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com',
    'hotmail.com', 'hotmail.rs', 'outlook.com', 'live.com', 'msn.com',
    'icloud.com', 'me.com', 'mac.com', 'aol.com', 'gmx.com', 'gmx.net',
    'proton.me', 'protonmail.com', 'mail.com', 'zoho.com', 'yandex.com',
    'mts.rs', 'open.telekom.rs', 'eunet.rs', 'sbb.rs', 'ptt.rs',
]);

/**
 * Splits an address without validating it — validation lives in `emails.js`,
 * and by the time an address reaches here it has already passed that.
 *
 * @param {string} email
 * @returns {{local: string, domain: string}|null}
 */
function split(email) {
    const at = String(email ?? '').lastIndexOf('@');
    if (at < 1) return null;

    return {
        local: email.slice(0, at).toLowerCase(),
        domain: email.slice(at + 1).toLowerCase(),
    };
}

/**
 * Labels an address without touching the network.
 *
 * @param {string} email
 * @returns {{email: string, domain: string|null, roleAccount: boolean, disposable: boolean, freeMail: boolean}}
 */
export function classifyEmail(email) {
    const parts = split(email);
    if (!parts) {
        return { email, domain: null, roleAccount: false, disposable: false, freeMail: false };
    }

    // "info.beograd@" and "prodaja-ns@" are still role accounts.
    const localStem = parts.local.split(/[.\-_+]/)[0];

    return {
        email: String(email).toLowerCase(),
        domain: parts.domain,
        roleAccount: ROLE_LOCAL_PARTS.has(parts.local) || ROLE_LOCAL_PARTS.has(localStem),
        disposable: DISPOSABLE_DOMAINS.has(parts.domain),
        freeMail: FREE_MAIL_DOMAINS.has(parts.domain),
    };
}

/**
 * Builds an MX checker with a per-domain cache.
 *
 * The resolver is injectable so the logic can be tested without DNS, and so a
 * caller can point at a specific server if the local one is unreliable.
 *
 * @param {object} [options]
 * @param {(domain: string) => Promise<Array<{exchange: string}>>} [options.resolveMx]
 * @param {number} [options.timeoutMs]
 * @returns {(domain: string) => Promise<boolean>}
 */
export function createMxChecker({ resolveMx, timeoutMs = 5000 } = {}) {
    const cache = new Map();

    const lookup = resolveMx ?? ((domain) => {
        const resolver = new Resolver({ timeout: timeoutMs, tries: 2 });
        return resolver.resolveMx(domain);
    });

    return async function hasMx(domain) {
        if (!domain) return false;
        if (cache.has(domain)) return cache.get(domain);

        let result;
        try {
            const records = await lookup(domain);
            result = Array.isArray(records) && records.length > 0;
        } catch {
            // NXDOMAIN, no MX record, or a DNS timeout. Treated the same: we
            // could not establish that mail is deliverable.
            result = false;
        }

        cache.set(domain, result);
        return result;
    };
}

/**
 * Classifies and MX-checks a list of addresses.
 *
 * @param {string[]} emails
 * @param {object} [options]
 * @param {boolean} [options.checkMx] set false to classify only, no DNS
 * @param {(domain: string) => Promise<boolean>} [options.hasMx] reuse one cache across calls
 * @param {(domain: string) => Promise<Array<{exchange: string}>>} [options.resolveMx]
 * @returns {Promise<Array<{email: string, domain: string|null, mx: boolean|null, roleAccount: boolean, disposable: boolean, freeMail: boolean}>>}
 */
export async function verifyEmails(emails, options = {}) {
    const { checkMx = true, hasMx, resolveMx } = options;
    const check = checkMx ? (hasMx ?? createMxChecker({ resolveMx })) : null;

    const unique = [...new Set((emails ?? []).map((email) => String(email).toLowerCase()))];

    return Promise.all(unique.map(async (email) => {
        const classified = classifyEmail(email);
        return {
            ...classified,
            mx: check && classified.domain ? await check(classified.domain) : null,
        };
    }));
}

/**
 * Keeps the addresses worth sending to.
 *
 * Role accounts are kept on purpose — for small businesses `info@` is very
 * often the only published address, so dropping them would gut the list.
 *
 * @param {Array<{email: string, mx: boolean|null, disposable: boolean}>} verified
 * @param {object} [options]
 * @param {boolean} [options.requireMx]
 * @param {boolean} [options.dropRoleAccounts]
 * @returns {string[]}
 */
export function keepSendable(verified, { requireMx = true, dropRoleAccounts = false } = {}) {
    return verified
        .filter((entry) => !entry.disposable)
        .filter((entry) => !(requireMx && entry.mx === false))
        .filter((entry) => !(dropRoleAccounts && entry.roleAccount))
        .map((entry) => entry.email);
}
