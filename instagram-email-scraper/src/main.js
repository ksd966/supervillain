import { Actor } from 'apify';
import { log } from 'crawlee';

import { extractEmailsFromText } from './emails.js';
import { createMxChecker, keepSendable, verifyEmails } from './emailVerify.js';
import { explainFailure, fetchProfile, mapProfile } from './instagram.js';
import { handlesFromText } from './paste.js';
import { createSessionPool } from './sessions.js';
import { resolveTargets } from './targets.js';
import { scrapeWebsiteForEmails } from './website.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};

const {
    list = '',
    usernames = [],
    directUrls = [],
    sessionCookies = [],
    sessionCookie = '',
    enrichFromWebsite = true,
    maxWebsitePagesPerProfile = 3,
    requestDelaySecs = 20,
    rateLimitBackoffMins = 30,
    maxRateLimitRetries = 2,
    stopAfterConsecutiveFailures = 5,
    onlyWithEmail = false,
    emailDomainBlocklist = [],
    verifyEmailDomains = true,
    dropUndeliverable = false,
    dropRoleAccounts = false,
    proxyConfiguration: proxyInput,
    requestTimeoutSecs = 30,
} = input;

const pasted = handlesFromText(list);
const targets = resolveTargets({ usernames: [...pasted, ...usernames], directUrls });

if (!targets.length) {
    throw new Error('No profiles to scrape — paste a list into "list", or fill in "usernames" / "directUrls".');
}

if (pasted.length) {
    log.info(`Pasted list: ${pasted.length} handle(s); ${targets.length} to scrape after de-duplication.`);
}

const wantsProxy = Boolean(proxyInput?.useApifyProxy || proxyInput?.proxyUrls?.length);
const proxyConfiguration = wantsProxy ? await Actor.createProxyConfiguration(proxyInput) : undefined;

if (!wantsProxy) {
    log.warning(
        'Running without a proxy — every request leaves from this one IP. Instagram rate-limits '
        + `web_profile_info per IP (roughly 20 profiles per 30 minutes), so expect a pause after ~${20} profiles.`,
    );
}

// The limiter is keyed on session as well as IP, so each extra cookie is
// another budget of roughly twenty profiles per half hour.
const sessions = createSessionPool([...sessionCookies, sessionCookie], {
    backoffMs: rateLimitBackoffMins * 60_000,
});

if (!sessions.loggedIn) {
    log.warning('No session cookie supplied. Logged-out access is heavily restricted; most profiles will come back empty.');
} else {
    log.info(`${sessions.size} session cookie(s) in rotation — roughly ${sessions.size * 20} profiles per 30 minutes.`);
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// One checker for the whole run, so a domain shared by several profiles costs a
// single DNS query.
const hasMx = verifyEmailDomains ? createMxChecker() : null;

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
    let result = { ok: false, reason: 'rate-limited' };
    let waits = 0;

    // A block is a property of one session, not of the run. So: switch sessions
    // first and only wait once every one of them is cooling down — waiting with
    // a free cookie in hand is pure lost time. The window is a sliding one, so
    // when there is nothing left to switch to, waiting is the only thing that
    // helps; retrying sooner just extends the block.
    while (waits <= maxRateLimitRetries) {
        const session = sessions.acquire(Date.now());

        if (!session) {
            if (waits === maxRateLimitRetries) break;

            const waitMs = Math.max(sessions.nextAvailableAt(Date.now()) - Date.now(), 1000);
            log.warning(`All ${sessions.size} session(s) are cooling down. Waiting ${Math.ceil(waitMs / 60_000)} min `
                + `before @${username} (attempt ${waits + 1}/${maxRateLimitRetries}).`);
            await sleep(waitMs);
            waits += 1;
            continue;
        }

        result = await fetchProfile(username, {
            sessionCookie: session.cookie,
            proxyUrl,
            timeoutSecs: requestTimeoutSecs,
        });

        if (result.ok) { sessions.succeed(session); break; }
        if (result.reason !== 'rate-limited') break;

        sessions.block(session, Date.now());
        const left = sessions.available(Date.now()).length;
        log.warning(`Rate-limited on @${username} (${session.label}). `
            + (left ? `Switching — ${left} of ${sessions.size} still usable.` : 'No session left to switch to.'));
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

    if (hasMx && record.emails.length) {
        record.emailDetails = await verifyEmails(record.emails, { hasMx });

        if (dropUndeliverable || dropRoleAccounts) {
            record.emails = keepSendable(record.emailDetails, {
                requireMx: dropUndeliverable,
                dropRoleAccounts,
            });
        }
    }

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

// Which cookie carried the run and which ones got blocked is the first thing
// worth knowing when the yield looks wrong. Carries no cookie values.
if (sessions.loggedIn) log.info(`Sessions — ${sessions.summary()}`);

await Actor.exit();
