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
     * @returns {URL|null}
     */
    function usableUrl(href) {
        try {
            // DuckDuckGo and Bing wrap results in a redirector.
            const direct = new URL(href, location.href);
            const wrapped = direct.searchParams.get('uddg') ?? direct.searchParams.get('u');
            const parsed = wrapped ? new URL(wrapped) : direct;

            if (!/^https?:$/.test(parsed.protocol)) return null;
            if (SKIP_HOSTS.test(parsed.hostname)) return null;
            return parsed;
        } catch {
            return null;
        }
    }

    /**
     * Reads the result list without depending on Google's obfuscated class
     * names: every organic result is an <a> carrying an <h3>. That shape has
     * outlived many redesigns.
     *
     * @returns {Array<{url: string, name: string, snippet: string}>}
     */
    function collectResults() {
        const seen = new Map();

        for (const anchor of document.querySelectorAll('a[href]')) {
            const heading = anchor.querySelector('h3, h2');
            if (!heading) continue;

            const parsed = usableUrl(anchor.getAttribute('href'));
            if (!parsed) continue;

            // Must match the key the service worker uses, port included:
            // keying on hostname alone would collapse two different businesses
            // that happen to share a host.
            const key = `${parsed.host.replace(/^www\./i, '').toLowerCase()}${parsed.pathname.replace(/\/+$/, '').toLowerCase()}`;
            if (seen.has(key)) continue;

            // The snippet usually sits in a sibling of the link's container and
            // sometimes already contains a phone number or an address.
            const container = anchor.closest('div[data-hveid], li, article') ?? anchor.parentElement;
            const snippet = (container?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);

            seen.set(key, {
                url: parsed.href,
                name: heading.innerText.trim(),
                snippet,
            });
        }

        return [...seen.values()];
    }

    function report() {
        const results = collectResults();
        if (!results.length) return;

        chrome.runtime.sendMessage({
            type: 'serp-results',
            query: new URLSearchParams(location.search).get('q') ?? '',
            source: location.hostname,
            results,
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
