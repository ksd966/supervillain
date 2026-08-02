import { Actor } from 'apify';
import { log } from 'crawlee';

import { extractEmailsFromText } from './emails.js';
import { explainFailure, fetchProfile, mapProfile } from './instagram.js';
import { resolveTargets } from './targets.js';
import { scrapeWebsiteForEmails } from './website.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};

const {
    usernames = [],
    directUrls = [],
    sessionCookie = '',
    enrichFromWebsite = true,
    maxWebsitePagesPerProfile = 3,
    requestDelaySecs = 20,
    rateLimitBackoffMins = 30,
    maxRateLimitRetries = 2,
    stopAfterConsecutiveFailures = 5,
    onlyWithEmail = false,
    emailDomainBlocklist = [],
    proxyConfiguration: proxyInput,
    requestTimeoutSecs = 30,
} = input;

const targets = resolveTargets({ usernames, directUrls });

if (!targets.length) {
    throw new Error('No profiles to scrape — fill in "usernames" or "directUrls".');
}

const wantsProxy = Boolean(proxyInput?.useApifyProxy || proxyInput?.proxyUrls?.length);
const proxyConfiguration = wantsProxy ? await Actor.createProxyConfiguration(proxyInput) : undefined;

if (!wantsProxy) {
    log.warning(
        'Running without a proxy — every request leaves from this one IP. Instagram rate-limits '
        + `web_profile_info per IP (roughly 20 profiles per 30 minutes), so expect a pause after ~${20} profiles.`,
    );
}
if (!sessionCookie) {
    log.warning('No sessionCookie supplied. Logged-out access is heavily restricted; many profiles will come back empty.');
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** email -> usernames it belongs to */
const emailIndex = new Map();
let profilesScraped = 0;
let profilesWithEmail = 0;
let consecutiveFailures = 0;

for (const [index, username] of targets.entries()) {
    if (consecutiveFailures >= stopAfterConsecutiveFailures) {
        log.error(
            `Stopping: ${consecutiveFailures} profiles failed in a row. This almost always means the IP is blocked `
            + 'or the session expired — continuing would only burn through the rest of the list.',
        );
        break;
    }

    const proxyUrl = await proxyConfiguration?.newUrl(`session${index}`);
    let result;

    // Rate limiting is a sliding window, so the only useful response is to wait
    // it out — retrying immediately just extends the block.
    for (let attempt = 0; attempt <= maxRateLimitRetries; attempt++) {
        result = await fetchProfile(username, { sessionCookie, proxyUrl, timeoutSecs: requestTimeoutSecs });
        if (result.ok || result.reason !== 'rate-limited') break;

        if (attempt < maxRateLimitRetries) {
            log.warning(`Rate-limited on @${username}. Waiting ${rateLimitBackoffMins} min before retrying `
                + `(attempt ${attempt + 1}/${maxRateLimitRetries}).`);
            await sleep(rateLimitBackoffMins * 60_000);
        }
    }

    if (!result.ok) {
        consecutiveFailures += 1;
        log.warning(`@${username} — ${explainFailure(result.reason)}`, { statusCode: result.statusCode });
        await Actor.pushData({
            username,
            url: `https://www.instagram.com/${username}/`,
            scrapedAt: new Date().toISOString(),
            error: result.reason,
            emails: [],
        });
        continue;
    }

    consecutiveFailures = 0;
    const profile = mapProfile(result.user);

    const emailSources = {};
    const emails = new Set();

    if (profile.businessEmail) {
        emailSources.businessEmail = [profile.businessEmail.toLowerCase()];
        emails.add(profile.businessEmail.toLowerCase());
    }

    const bioEmails = extractEmailsFromText(profile.biography, { blockedDomains: emailDomainBlocklist });
    if (bioEmails.length) {
        emailSources.biography = bioEmails;
        bioEmails.forEach((email) => emails.add(email));
    }

    // The bio link is the productive path for accounts that never filled in the
    // business e-mail, and it costs nothing against Instagram's rate limit.
    if (enrichFromWebsite && maxWebsitePagesPerProfile > 0) {
        const links = [profile.externalUrl, ...profile.bioLinks.map((link) => link.url)].filter(Boolean);
        const seen = new Set();

        for (const link of links) {
            if (seen.has(link)) continue;
            seen.add(link);

            const { emails: siteEmails, pagesChecked } = await scrapeWebsiteForEmails(link, {
                maxPages: maxWebsitePagesPerProfile,
                proxyUrl,
                timeoutSecs: requestTimeoutSecs,
                blockedDomains: emailDomainBlocklist,
            });

            if (siteEmails.length) {
                emailSources.website = [...(emailSources.website ?? []), ...siteEmails];
                siteEmails.forEach((email) => emails.add(email));
            }
            log.debug(`@${username}: checked ${pagesChecked.length} page(s) on ${link}`);

            if (emails.size) break;
        }
    }

    const record = {
        ...profile,
        emails: [...emails].sort(),
        emailSources,
        scrapedAt: new Date().toISOString(),
    };

    profilesScraped += 1;
    if (record.emails.length) {
        profilesWithEmail += 1;
        for (const email of record.emails) {
            if (!emailIndex.has(email)) emailIndex.set(email, new Set());
            emailIndex.get(email).add(username);
        }
    }

    if (!onlyWithEmail || record.emails.length) await Actor.pushData(record);

    log.info(
        `[${index + 1}/${targets.length}] @${username} — ${record.emails.length} e-mail(s)`,
        { followers: profile.followersCount, emails: record.emails },
    );

    // Pace the next profile. Skipped after the final one so the run does not
    // idle for nothing at the end.
    if (index < targets.length - 1 && requestDelaySecs > 0) {
        await sleep(requestDelaySecs * 1000);
    }
}

const rows = [...emailIndex.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([email, owners]) => ({ email, usernames: [...owners] }));

await Actor.setValue('EMAILS', {
    totalEmails: rows.length,
    profilesScraped,
    profilesWithEmail,
    profilesRequested: targets.length,
    scrapedAt: new Date().toISOString(),
    emails: rows,
});

// Neither field can contain a comma — the e-mail validator rejects them in the
// local part, and Instagram handles are alphanumeric — so quoting the handle
// list is all the escaping this needs.
const csv = `${['email,usernames', ...rows.map(({ email, usernames: owners }) => `${email},"${owners.join(' ')}"`)].join('\n')}\n`;
await Actor.setValue('EMAILS_CSV', csv, { contentType: 'text/csv; charset=utf-8' });

log.info(
    `Done: ${rows.length} unique e-mail(s) from ${profilesWithEmail}/${profilesScraped} scraped profile(s). `
    + 'Full list in the key-value store under "EMAILS" (JSON) and "EMAILS_CSV" (CSV).',
);

await Actor.exit();
