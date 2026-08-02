import { Actor } from 'apify';
import { log } from 'crawlee';

import { extractEmailsFromText } from './emails.js';
import { createMxChecker, keepSendable, verifyEmails } from './emailVerify.js';
import { buildSearchQueries, explodeByEmail, igLeadFromResult } from './igSearch.js';
import { explainSearchFailure, search } from './serp.js';
import { instagramHandleFromUrl } from './social.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};

const {
    keywords = [],
    location = '',
    emailDomains = [],
    site = 'instagram.com',
    engine = 'duckduckgo',
    pagesPerQuery = 2,
    maxEmails = 0,
    requireEmail = true,
    oneRowPerEmail = true,
    delayMs = 1500,
    proxyConfiguration: proxyInput,
    requestTimeoutSecs = 30,
    verifyEmailDomains = true,
    dropUndeliverable = false,
} = input;

const queries = buildSearchQueries({ keywords, location, emailDomains, site });
if (!queries.length) {
    throw new Error('Nothing to search for — fill in "keywords".');
}

const wantsProxy = Boolean(proxyInput?.useApifyProxy || proxyInput?.proxyUrls?.length);
const proxyConfiguration = wantsProxy ? await Actor.createProxyConfiguration(proxyInput) : undefined;

if (engine === 'google' && !wantsProxy) {
    log.warning(
        'Google without a proxy gets CAPTCHA\'d within a few queries. Either configure residential proxies, '
        + 'switch to the duckduckgo engine, or run the same searches from the browser extension, which '
        + 'searches from your own logged-in session and is never challenged.',
    );
}

log.info(`${queries.length} quer${queries.length === 1 ? 'y' : 'ies'} × ${pagesPerQuery} page(s) via ${engine}.`);

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const helpers = { instagramHandleFromUrl, extractEmailsFromText };

/** username → lead */
const leads = new Map();
let searchesRun = 0;
let searchesFailed = 0;

outer:
for (const entry of queries) {
    for (let page = 0; page < pagesPerQuery; page++) {
        const { ok, results, reason } = await search(entry.query, {
            engine,
            proxyUrl: await proxyConfiguration?.newUrl(`q${searchesRun}`),
            timeoutSecs: requestTimeoutSecs,
            page,
        });
        searchesRun += 1;

        if (!ok) {
            searchesFailed += 1;
            log.warning(`"${entry.query}" — ${explainSearchFailure(reason)}`);

            // A CAPTCHA means every further query gets one too; stopping keeps
            // the results already gathered instead of burning the whole list.
            if (reason === 'captcha') break outer;
            continue;
        }

        let added = 0;
        for (const result of results) {
            const lead = igLeadFromResult(
                { ...result, keyword: entry.keyword },
                helpers,
                { emailDomains },
            );
            if (!lead) continue;

            const existing = leads.get(lead.username);
            if (existing) {
                existing.emails = [...new Set([...existing.emails, ...lead.emails])];
                existing.email = existing.email ?? existing.emails[0] ?? null;
                existing.keywords = [...new Set([...existing.keywords, lead.keyword].filter(Boolean))];
                existing.description = existing.description || lead.description;
                continue;
            }

            leads.set(lead.username, { ...lead, keywords: [lead.keyword].filter(Boolean) });
            added += 1;
        }

        log.info(`[${searchesRun}/${queries.length * pagesPerQuery}] "${entry.query}" p${page + 1} — `
            + `${results.length} result(s), ${added} new profile(s)`);

        if (maxEmails > 0 && [...leads.values()].filter((lead) => lead.email).length >= maxEmails) {
            log.info(`Reached maxEmails (${maxEmails}); stopping early.`);
            break outer;
        }

        if (delayMs > 0) await sleep(delayMs);
    }
}

// --- verify, filter, output --------------------------------------------------

let output = [...leads.values()];

if (verifyEmailDomains) {
    const hasMx = createMxChecker();

    for (const lead of output) {
        if (!lead.emails.length) continue;

        lead.emailDetails = await verifyEmails(lead.emails, { hasMx });

        if (dropUndeliverable) {
            lead.emails = keepSendable(lead.emailDetails, { requireMx: true });
            lead.email = lead.emails[0] ?? null;
        }
    }
}

if (requireEmail) {
    const before = output.length;
    output = output.filter((lead) => lead.email);
    log.info(`Dropped ${before - output.length} profile(s) with no address in the snippet.`);
}

if (maxEmails > 0) output = output.slice(0, maxEmails);

const rows = oneRowPerEmail ? explodeByEmail(output) : output;
const scrapedAt = new Date().toISOString();

for (const row of rows) {
    await Actor.pushData({ ...row, scrapedAt });
}

const columns = ['keyword', 'username', 'name', 'email', 'url', 'description'];
const csvCell = (value) => {
    const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csv = `${[
    columns.join(','),
    ...rows.map((row) => columns
        .map((column) => csvCell(column === 'keyword' ? (row.keywords ?? []).join(' ') : row[column]))
        .join(',')),
].join('\n')}\n`;

await Actor.setValue('EMAILS_CSV', `﻿${csv}`, { contentType: 'text/csv; charset=utf-8' });
await Actor.setValue('INSTAGRAM_HANDLES', output.map((lead) => lead.username).sort());
await Actor.setValue('SUMMARY', {
    queries: queries.length,
    searchesRun,
    searchesFailed,
    profilesFound: leads.size,
    profilesWithEmail: output.length,
    rowsWritten: rows.length,
    engine,
    scrapedAt,
});

log.info(
    `Done: ${searchesRun} search(es) → ${leads.size} profile(s), ${output.length} with an address, `
    + `${rows.length} row(s) written. CSV in the key-value store under "EMAILS_CSV".`,
);

await Actor.exit();
