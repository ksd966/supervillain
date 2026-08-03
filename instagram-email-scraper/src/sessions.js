/**
 * A pool of Instagram sessions, and the rule for picking the next one.
 *
 * Instagram's limiter is keyed on IP *and* session, so a second logged-in
 * cookie is a second budget of roughly twenty profiles per half hour. With one
 * cookie the only response to a block is to sit still for half an hour; with
 * three, a block means "use the next one" and the run keeps moving.
 *
 * The pool holds no timers and reads no clock of its own — every method takes
 * `now`. That keeps the waiting policy in the caller, where it can be logged,
 * and makes the part worth testing a pure function of its inputs.
 */

/** How long a session sits out after a 401/429. Meta's window is ~29 minutes. */
const DEFAULT_BACKOFF_MS = 30 * 60_000;

/**
 * @typedef {object} Session
 * @property {number} index zero-based position in the pool
 * @property {string} label human-readable, safe to log — never the cookie
 * @property {string} cookie the `sessionid` value, or '' for logged-out
 * @property {number} blockedUntil epoch ms; 0 when usable
 * @property {number} uses successful fetches so far
 * @property {number} blocks how many times this session has been blocked
 */

/**
 * Strips whatever people actually paste. A cookie copied from DevTools comes as
 * the bare value, but copied from a header it arrives as `sessionid=abc;` and
 * both have to work — a leading `sessionid=` sent as the value produces
 * `sessionid=sessionid=abc`, which fails as an ordinary logged-out request and
 * looks like a rate limit rather than a typo.
 *
 * @param {string} value
 * @returns {string}
 */
export function normaliseCookie(value) {
    return String(value ?? '')
        .trim()
        .replace(/^cookie:\s*/i, '')
        .replace(/^sessionid\s*=\s*/i, '')
        .replace(/;.*$/, '')
        .trim();
}

/**
 * @param {Array<string>} cookies
 * @returns {string[]} unique, non-empty, in the order given
 */
export function normaliseCookies(cookies) {
    return [...new Set((cookies ?? []).map(normaliseCookie).filter(Boolean))];
}

/**
 * @param {Array<string>} cookies zero or more `sessionid` values
 * @param {object} [options]
 * @param {number} [options.backoffMs]
 * @returns {object} the pool
 */
export function createSessionPool(cookies, { backoffMs = DEFAULT_BACKOFF_MS } = {}) {
    const clean = normaliseCookies(cookies);

    // No cookies still means one session: the logged-out one. Special-casing
    // "no sessions" everywhere else buys nothing.
    const sessions = (clean.length ? clean : ['']).map((cookie, index) => ({
        index,
        label: clean.length ? `sesija ${index + 1}/${clean.length}` : 'izlogovano',
        cookie,
        blockedUntil: 0,
        uses: 0,
        blocks: 0,
    }));

    return {
        size: sessions.length,
        loggedIn: clean.length > 0,

        /** @param {number} now @returns {Session[]} */
        available(now) {
            return sessions.filter((session) => session.blockedUntil <= now);
        },

        /**
         * The usable session with the fewest successful fetches. Spreading the
         * load matters: hammering one account until it blocks is what gets an
         * account flagged, and the others sit idle meanwhile.
         *
         * @param {number} now
         * @returns {Session|null}
         */
        acquire(now) {
            const free = this.available(now);
            if (!free.length) return null;

            return free.reduce((best, session) => (session.uses < best.uses ? session : best));
        },

        /** @param {Session} session */
        succeed(session) {
            session.uses += 1;
        },

        /** @param {Session} session @param {number} now */
        block(session, now) {
            session.blockedUntil = now + backoffMs;
            session.blocks += 1;
        },

        /**
         * @param {number} now
         * @returns {number} epoch ms when something frees up, Infinity if never
         */
        nextAvailableAt(now) {
            if (this.available(now).length) return now;
            return Math.min(...sessions.map((session) => session.blockedUntil));
        },

        /** @returns {string} one line for the run log; carries no cookie values */
        summary() {
            return sessions
                .map((session) => `${session.label}: ${session.uses} profila${session.blocks ? `, ${session.blocks}× blokirana` : ''}`)
                .join(' | ');
        },
    };
}
