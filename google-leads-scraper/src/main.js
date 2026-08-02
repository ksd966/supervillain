import { Actor } from 'apify';
import { PlaywrightCrawler, log } from 'crawlee';

import {
    DEFAULT_SELECTORS,
    collectPlaceUrls,
    dismissConsent,
    parsePlacePanel,
    searchUrl,
} from './googleMaps.js';
import { collectLeads } from './leads.js';
import { runOverpassQuery } from './overpass.js';
import { buildOverpassQuery, buildQueries, osmTagsForNiche } from './queries.js';
import { scrapeWebsiteForContacts } from './website.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};

const {
    niche = '',
    city = '',
    queries = [],
    source = 'google-maps',
    maxResultsPerQuery = 40,
    languageCode = 'sr',
    placeSelectors = {},
    enrichFromWebsite = true,
    maxWebsitePagesPerLead = 3,
    onlyWithEmail = false,
    emailDomainBlocklist = [],
    proxyConfiguration: proxyInput,
    requestTimeoutSecs = 30,
    placeDelayMs = 1200,
} = input;

const searchQueries = buildQueries({ niche, city, queries });
if (!searchQueries.length) {
    throw new Error('Nothing to search for — set "niche" (and usually "city"), or pass explicit "queries".');
}

const wantsProxy = Boolean(proxyInput?.useApifyProxy || proxyInput?.proxyUrls?.length);
const proxyConfiguration = wantsProxy ? await Actor.createProxyConfiguration(proxyInput) : undefined;

const useGoogle = source === 'google-maps' || source === 'both';
const useOsm = source === 'openstreetmap' || source === 'both';

/** Keyed so the same business found twice — or by both sources — lands once. */
const leads = new Map();

/** @param {object} lead */
function addLead(lead) {
    collectLeads([lead], leads);
}

// --- Discovery: OpenStreetMap ------------------------------------------------

if (useOsm) {
    const cities = (Array.isArray(city) ? city : [city]).map((c) => String(c).trim()).filter(Boolean);
    const tags = osmTagsForNiche(niche);

    if (!cities.length) {
        log.warning('OpenStreetMap needs an explicit "city" — it has no free-text search. Skipping this source.');
    } else if (!tags.length) {
        log.warning(
            `OpenStreetMap has no tag mapped to the niche "${niche}". Pass a raw OSM tag instead `
            + '(for example "shop=hairdresser"), or use the google-maps source. Skipping this source.',
        );
    } else {
        for (const oneCity of cities) {
            const query = buildOverpassQuery({ city: oneCity, tags });
            log.info(`OpenStreetMap: querying ${tags.join(', ')} in ${oneCity}`);

            const { ok, leads: osmLeads, reason } = await runOverpassQuery(query, {
                timeoutSecs: Math.max(requestTimeoutSecs, 120),
                proxyUrl: await proxyConfiguration?.newUrl('osm'),
                onNotice: (message) => log.warning(message),
            });

            if (!ok) {
                log.warning(`OpenStreetMap query for ${oneCity} failed (${reason}).`);
                continue;
            }

            osmLeads.slice(0, maxResultsPerQuery).forEach(addLead);
            log.info(`OpenStreetMap: ${Math.min(osmLeads.length, maxResultsPerQuery)} place(s) in ${oneCity}`);
        }
    }
}

// --- Discovery: Google Maps --------------------------------------------------

if (useGoogle) {
    const selectors = { ...DEFAULT_SELECTORS, ...placeSelectors };

    const crawler = new PlaywrightCrawler({
        proxyConfiguration,
        maxRequestsPerCrawl: searchQueries.length,
        maxConcurrency: 1,
        maxRequestRetries: 2,
        navigationTimeoutSecs: requestTimeoutSecs,
        requestHandlerTimeoutSecs: 60 * 30,
        launchContext: {
            launchOptions: {
                args: ['--disable-dev-shm-usage'],
                executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            },
        },
        async requestHandler({ page, request }) {
            const query = request.userData.query;

            await dismissConsent(page);
            const feedAppeared = await page
                .waitForSelector(selectors.feed, { timeout: 20_000 })
                .then(() => true)
                .catch(() => false);

            if (!feedAppeared) {
                // A single hit sometimes opens the place panel directly instead
                // of a results feed.
                const single = parsePlacePanel(await page.content(), { selectors, url: page.url() });
                if (single) {
                    addLead(single);
                    log.info(`Google Maps: "${query}" resolved straight to one place.`);
                } else {
                    log.warning(
                        `Google Maps: no results feed for "${query}". Google most likely served a consent wall `
                        + 'or a CAPTCHA — that is what happens without residential proxies.',
                    );
                }
                return;
            }

            const placeUrls = await collectPlaceUrls(page, {
                maxResults: maxResultsPerQuery,
                selectors,
                onNotice: (message) => log.warning(message),
            });
            log.info(`Google Maps: "${query}" → ${placeUrls.length} place(s) in the feed`);

            for (const [index, placeUrl] of placeUrls.entries()) {
                await page.goto(placeUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
                await page.waitForSelector(selectors.name, { timeout: 15_000 }).catch(() => {});

                const lead = parsePlacePanel(await page.content(), { selectors, url: placeUrl });
                if (lead) {
                    addLead(lead);
                } else {
                    log.debug(`Could not parse the panel at ${placeUrl}`);
                }

                if (index < placeUrls.length - 1 && placeDelayMs > 0) {
                    await page.waitForTimeout(placeDelayMs);
                }
            }
        },
        failedRequestHandler({ request }, error) {
            log.warning(`Google Maps search failed for "${request.userData.query}": ${error.message}`);
        },
    });

    await crawler.run(searchQueries.map((query) => ({
        url: searchUrl(query, languageCode),
        userData: { query },
    })));
}

// --- Enrichment --------------------------------------------------------------

const allLeads = [...leads.values()];
log.info(`Discovered ${allLeads.length} unique place(s). Starting website enrichment.`);

if (enrichFromWebsite && maxWebsitePagesPerLead > 0) {
    for (const [index, lead] of allLeads.entries()) {
        if (!lead.website) continue;

        const { emails, instagramHandles, pagesChecked } = await scrapeWebsiteForContacts(lead.website, {
            maxPages: maxWebsitePagesPerLead,
            proxyUrl: await proxyConfiguration?.newUrl(`site${index}`),
            timeoutSecs: requestTimeoutSecs,
            blockedDomains: emailDomainBlocklist,
        });

        lead.emails = [...new Set([...(lead.emails ?? []), ...emails])].sort();
        lead.instagramHandles = [...new Set([...(lead.instagramHandles ?? []), ...instagramHandles])].sort();
        lead.websitePagesChecked = pagesChecked.length;
    }
}

// --- Output ------------------------------------------------------------------

const scrapedAt = new Date().toISOString();
const emailIndex = new Map();
const handleSet = new Set();
let leadsWithEmail = 0;

for (const lead of allLeads) {
    lead.scrapedAt = scrapedAt;
    if (lead.emails?.length) leadsWithEmail += 1;

    for (const email of lead.emails ?? []) {
        if (!emailIndex.has(email)) emailIndex.set(email, new Set());
        emailIndex.get(email).add(lead.name);
    }
    (lead.instagramHandles ?? []).forEach((handle) => handleSet.add(handle));

    if (!onlyWithEmail || lead.emails?.length) await Actor.pushData(lead);
}

const rows = [...emailIndex.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([email, names]) => ({ email, businesses: [...names] }));

await Actor.setValue('EMAILS', {
    totalEmails: rows.length,
    leadsFound: allLeads.length,
    leadsWithEmail,
    queries: searchQueries,
    scrapedAt,
    emails: rows,
});

const csv = `${[
    'email,businesses',
    ...rows.map(({ email, businesses }) => `${email},"${businesses.join(' | ').replace(/"/g, '""')}"`),
].join('\n')}\n`;
await Actor.setValue('EMAILS_CSV', csv, { contentType: 'text/csv; charset=utf-8' });

// Feeds straight into the instagram-email-scraper actor's `usernames` input.
await Actor.setValue('INSTAGRAM_HANDLES', [...handleSet].sort());

log.info(
    `Done: ${allLeads.length} lead(s), ${leadsWithEmail} with an e-mail, ${rows.length} unique address(es), `
    + `${handleSet.size} Instagram handle(s). See "EMAILS", "EMAILS_CSV" and "INSTAGRAM_HANDLES".`,
);

await Actor.exit();
