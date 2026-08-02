import { Actor } from 'apify';
import { CheerioCrawler, PlaywrightCrawler, log } from 'crawlee';
import * as cheerio from 'cheerio';

import { extractEmailsFromPage } from './emails.js';
import { extractFields, normalizeFieldDefinitions } from './fields.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};

const {
    startUrls = [],
    crawlerType = 'cheerio',
    linkStrategy = 'same-domain',
    includeUrlGlobs = [],
    excludeUrlGlobs = [],
    maxCrawlDepth = 2,
    maxRequestsPerCrawl = 100,
    extractFields: fieldDefinitions = [],
    extractEmails = true,
    scanRawHtml = true,
    deobfuscateEmails = true,
    emailDomainBlocklist = [],
    waitForSelector = '',
    waitForSelectorTimeoutSecs = 10,
    proxyConfiguration: proxyInput,
    maxConcurrency = 10,
    maxRequestRetries = 3,
    requestTimeoutSecs = 45,
    respectRobotsTxtFile = true,
    saveHtml = false,
    saveText = false,
} = input;

if (!startUrls.length) {
    throw new Error('Input is missing "startUrls" — give the actor at least one URL to start from.');
}

const fields = normalizeFieldDefinitions(fieldDefinitions);

// An empty `{}` from the proxy editor still yields a live ProxyConfiguration,
// which then fails every request when no Apify token is around (typically a
// local `apify run`). Only build one when the input actually asks for a proxy.
const wantsProxy = Boolean(proxyInput?.useApifyProxy || proxyInput?.proxyUrls?.length);
const proxyConfiguration = wantsProxy ? await Actor.createProxyConfiguration(proxyInput) : undefined;
if (!wantsProxy) log.info('No proxy requested — crawling from the machine\'s own IP.');

/** email -> the pages it was seen on (capped, purely for the summary). */
const emailIndex = new Map();
const MAX_SOURCES_PER_EMAIL = 20;

let pagesScraped = 0;

/**
 * One extraction path for both crawler types: whatever loaded the page hands us
 * its HTML, and everything downstream works off Cheerio.
 *
 * @param {object} params
 * @param {string} params.html
 * @param {import('crawlee').Request} params.request
 * @param {number|undefined} params.statusCode
 */
async function scrapePage({ html, request, statusCode }) {
    const $ = cheerio.load(html);
    const baseUrl = request.loadedUrl ?? request.url;
    const depth = request.userData?.depth ?? 0;

    const record = {
        url: request.url,
        loadedUrl: request.loadedUrl ?? request.url,
        depth,
        statusCode: statusCode ?? null,
        title: $('title').first().text().trim() || null,
        scrapedAt: new Date().toISOString(),
    };

    if (fields.length) {
        Object.assign(record, extractFields({ $, fields, baseUrl }));
    }

    if (extractEmails) {
        const emails = extractEmailsFromPage({
            $,
            html,
            options: {
                scanRawHtml,
                deobfuscate: deobfuscateEmails,
                blockedDomains: emailDomainBlocklist,
            },
        });

        record.emails = emails;

        for (const email of emails) {
            if (!emailIndex.has(email)) emailIndex.set(email, new Set());
            const sources = emailIndex.get(email);
            if (sources.size < MAX_SOURCES_PER_EMAIL) sources.add(record.loadedUrl);
        }

        if (emails.length) {
            log.info(`Found ${emails.length} e-mail(s) on ${request.url}`, { emails });
        }
    }

    if (saveText) {
        const $body = $('body').clone();
        $body.find('script, style, noscript, template').remove();
        record.text = $body.text().replace(/\s+/g, ' ').trim();
    }
    if (saveHtml) record.html = html;

    await Actor.pushData(record);
    pagesScraped += 1;
}

/**
 * @param {object} params
 * @param {import('crawlee').Request} params.request
 * @param {Function} params.enqueueLinks
 */
async function enqueueFoundLinks({ request, enqueueLinks }) {
    const depth = request.userData?.depth ?? 0;
    if (linkStrategy === 'none' || depth >= maxCrawlDepth) return;

    const options = {
        strategy: linkStrategy,
        userData: { depth: depth + 1 },
        transformRequestFunction: (req) => {
            // Fragments produce duplicate pages under a different key.
            req.url = req.url.split('#')[0];
            return req;
        },
    };
    if (includeUrlGlobs.length) options.globs = includeUrlGlobs;
    if (excludeUrlGlobs.length) options.exclude = excludeUrlGlobs;

    const { processedRequests } = await enqueueLinks(options);
    log.debug(`Enqueued ${processedRequests?.length ?? 0} link(s) from ${request.url} at depth ${depth + 1}`);
}

const sharedOptions = {
    proxyConfiguration,
    maxRequestsPerCrawl,
    maxConcurrency,
    maxRequestRetries,
    respectRobotsTxtFile,
    failedRequestHandler({ request }, error) {
        log.warning(`Giving up on ${request.url} after ${request.retryCount} retries: ${error.message}`);
    },
};

const crawler = crawlerType === 'playwright'
    ? new PlaywrightCrawler({
        ...sharedOptions,
        navigationTimeoutSecs: requestTimeoutSecs,
        requestHandlerTimeoutSecs: requestTimeoutSecs + 30,
        launchContext: {
            launchOptions: {
                args: ['--disable-dev-shm-usage'],
                // Escape hatch for local runs where the installed Playwright
                // version and the downloaded browser build disagree. Unset on
                // the platform, where the base image ships a matching browser.
                executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            },
        },
        async requestHandler({ request, page, response, enqueueLinks }) {
            if (waitForSelector) {
                await page
                    .waitForSelector(waitForSelector, { timeout: waitForSelectorTimeoutSecs * 1000 })
                    .catch(() => log.warning(`Selector "${waitForSelector}" never appeared on ${request.url} — scraping anyway.`));
            }

            await scrapePage({
                html: await page.content(),
                request,
                statusCode: response?.status(),
            });
            await enqueueFoundLinks({ request, enqueueLinks });
        },
    })
    : new CheerioCrawler({
        ...sharedOptions,
        navigationTimeoutSecs: requestTimeoutSecs,
        requestHandlerTimeoutSecs: requestTimeoutSecs,
        async requestHandler({ request, body, response, enqueueLinks }) {
            await scrapePage({
                html: body.toString(),
                request,
                statusCode: response?.statusCode,
            });
            await enqueueFoundLinks({ request, enqueueLinks });
        },
    });

log.info(`Starting ${crawlerType} crawl`, {
    startUrls: startUrls.length,
    maxCrawlDepth,
    maxRequestsPerCrawl,
    linkStrategy,
});

await crawler.run(startUrls.map((entry) => {
    const url = typeof entry === 'string' ? entry : entry.url;
    return { url, userData: { depth: 0 } };
}));

if (extractEmails) {
    const emails = [...emailIndex.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([email, sources]) => ({ email, foundOn: [...sources] }));

    await Actor.setValue('EMAILS', {
        totalEmails: emails.length,
        pagesScraped,
        scrapedAt: new Date().toISOString(),
        emails,
    });

    log.info(`Done: ${emails.length} unique e-mail(s) across ${pagesScraped} page(s). Full list in the key-value store under "EMAILS".`);
} else {
    log.info(`Done: ${pagesScraped} page(s) scraped.`);
}

await Actor.exit();
