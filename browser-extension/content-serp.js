/**
 * Harvests result links from a search page.
 *
 * The whole reason this lives in the browser rather than in an actor: it runs
 * inside a session Google already trusts. No proxy, no CAPTCHA, no fingerprint
 * games — the results are simply the ones on the screen.
 *
 * Nothing is fetched here. This script only reads what the page already
 * rendered; visiting the result pages is a separate, explicit step the user
 * triggers from the popup.
 */

(() => {
    /** Hosts that are never a prospect — aggregators, socials, Google's own. */
    const SKIP_HOSTS = /(^|\.)(google\.[a-z.]+|googleusercontent\.com|youtube\.com|youtu\.be|facebook\.com|instagram\.com|twitter\.com|x\.com|linkedin\.com|tiktok\.com|pinterest\.[a-z.]+|wikipedia\.org|wikidata\.org|amazon\.[a-z.]+|ebay\.[a-z.]+|booking\.com|tripadvisor\.[a-z.]+|yelp\.[a-z.]+|bing\.com|duckduckgo\.com|reddit\.com|quora\.com|medium\.com)$/i;

    /**
     * @param {string} href
     * @returns {URL|null} parsed and unwrapped, whatever the host
     */
    function resolve(href) {
        try {
            // DuckDuckGo and Bing wrap results in a redirector.
            const direct = new URL(href, location.href);
            const wrapped = direct.searchParams.get('uddg') ?? direct.searchParams.get('u');
            const parsed = wrapped ? new URL(wrapped) : direct;

            return /^https?:$/.test(parsed.protocol) ? parsed : null;
        } catch {
            return null;
        }
    }

    /**
     * @param {URL|null} parsed
     * @returns {boolean}
     */
    const isProspectSite = (parsed) => Boolean(parsed) && !SKIP_HOSTS.test(parsed.hostname);

    /**
     * Instagram is on the skip list for ordinary prospecting — there is nothing
     * to fetch from a profile page — but on a `site:instagram.com` search the
     * profiles *are* the results, and the bio the engine indexed is sitting in
     * the snippet. So they are collected separately rather than dropped.
     *
     * @param {URL|null} parsed
     * @returns {boolean}
     */
    const isInstagramProfile = (parsed) => Boolean(parsed) && /(^|\.)instagram\.com$/i.test(parsed.hostname);

    /**
     * Reads the result list without depending on Google's obfuscated class
     * names: every organic result is an <a> carrying an <h3>. That shape has
     * outlived many redesigns.
     *
     * @returns {{sites: object[], profiles: object[]}}
     */
    function collectResults() {
        const sites = new Map();
        const profiles = new Map();

        for (const anchor of document.querySelectorAll('a[href]')) {
            const heading = anchor.querySelector('h3, h2');
            if (!heading) continue;

            const parsed = resolve(anchor.getAttribute('href'));
            if (!parsed) continue;

            // Must match the key the service worker uses, port included:
            // keying on hostname alone would collapse two different businesses
            // that happen to share a host.
            const key = `${parsed.host.replace(/^www\./i, '').toLowerCase()}${parsed.pathname.replace(/\/+$/, '').toLowerCase()}`;
            const bucket = isInstagramProfile(parsed) ? profiles : (isProspectSite(parsed) ? sites : null);
            if (!bucket || bucket.has(key)) continue;

            // The snippet sits in a sibling of the link's container. On an
            // ordinary search it may hold a phone number; on a
            // `site:instagram.com` search it is the indexed bio, which is where
            // the e-mail address lives.
            const container = anchor.closest('div[data-hveid], li, article') ?? anchor.parentElement;
            const snippet = (container?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);

            bucket.set(key, {
                url: parsed.href,
                name: heading.innerText.trim(),
                title: heading.innerText.trim(),
                snippet,
            });
        }

        return { sites: [...sites.values()], profiles: [...profiles.values()] };
    }

    function report() {
        const { sites, profiles } = collectResults();
        if (!sites.length && !profiles.length) return;

        chrome.runtime.sendMessage({
            type: 'serp-results',
            query: new URLSearchParams(location.search).get('q') ?? '',
            source: location.hostname,
            results: sites,
            profiles,
        }).catch(() => {
            // The service worker may be asleep mid-navigation; the next page
            // load reports again, so a dropped message costs nothing.
        });
    }

    report();

    // Google swaps results in without a page load when you page through them.
    let timer = null;
    new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(report, 800);
    }).observe(document.body, { childList: true, subtree: true });
})();
