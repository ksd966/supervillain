/**
 * Service worker: storage, deep scanning, and the bridge to the local panel.
 *
 * Extraction reuses the actors' modules verbatim (`emails.js`, `social.js`),
 * which is why those two are written without dependencies. The same filters
 * that keep `logo@2x.png` and Sentry keys out of the actors' output keep them
 * out of the extension's.
 *
 * There is no DOMParser in a service worker, so scanning works on raw markup
 * with regexes — the same path `emails.js` already takes for JSON-LD blocks and
 * data attributes.
 */

import { extractEmailsFromText } from './emails.js';
import { DEFAULT_PROBES, buildSearchQueries, igLeadFromResult } from './igSearch.js';
import { instagramHandleFromUrl, instagramHandlesFromHtml } from './social.js';

const STORE_KEY = 'leads';
const IG_STORE_KEY = 'igLeads';
const SETTINGS_KEY = 'settings';
const DEFAULT_SETTINGS = {
    panelUrl: 'http://localhost:8377',
    panelToken: '',
    autoCollectSerp: true,
    scanConcurrency: 3,
    scanDelayMs: 400,
};

// --- storage -----------------------------------------------------------------

/** @returns {Promise<Record<string, object>>} */
async function readLeads() {
    return (await chrome.storage.local.get(STORE_KEY))[STORE_KEY] ?? {};
}

/** @param {Record<string, object>} leads */
async function writeLeads(leads) {
    await chrome.storage.local.set({ [STORE_KEY]: leads });
    const pending = Object.values(leads).filter((lead) => !lead.scannedAt).length;
    await chrome.action.setBadgeText({ text: Object.keys(leads).length ? String(Object.keys(leads).length) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: pending ? '#ffc107' : '#5ed6a4' });
}

/** @returns {Promise<Record<string, object>>} */
async function readIgLeads() {
    return (await chrome.storage.local.get(IG_STORE_KEY))[IG_STORE_KEY] ?? {};
}

/** @param {Record<string, object>} leads */
async function writeIgLeads(leads) {
    await chrome.storage.local.set({ [IG_STORE_KEY]: leads });
}

/** @returns {Promise<typeof DEFAULT_SETTINGS>} */
async function readSettings() {
    return { ...DEFAULT_SETTINGS, ...((await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] ?? {}) };
}

/**
 * Identity for a prospect: host plus path, so two tenants of a shared host
 * (`wixsite.com/salon-a` and `.../salon-b`) stay separate businesses.
 *
 * @param {string} url
 * @returns {string|null}
 */
function leadKey(url) {
    try {
        const { host, pathname } = new URL(url);
        return `${host.replace(/^www\./i, '').toLowerCase()}${pathname.replace(/\/+$/, '').toLowerCase()}`;
    } catch {
        return null;
    }
}

// --- extraction --------------------------------------------------------------

/**
 * @param {string} html
 * @returns {string|null}
 */
function nameFromHtml(html) {
    const ogSite = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
    if (ogSite) return decodeEntities(ogSite[1]).trim() || null;

    const jsonLdName = html.match(/"@type"\s*:\s*"(?:Organization|LocalBusiness|Person|Store|Restaurant)"[\s\S]{0,400}?"name"\s*:\s*"([^"]{2,120})"/i);
    if (jsonLdName) return decodeEntities(jsonLdName[1]).trim() || null;

    const title = html.match(/<title[^>]*>([\s\S]{1,200}?)<\/title>/i);
    if (title) {
        // "Salon Ana | Frizerski salon Novi Sad" -> "Salon Ana"
        const cleaned = decodeEntities(title[1]).replace(/\s+/g, ' ').trim();
        return cleaned.split(/\s+[|–—·»-]\s+/)[0].trim() || null;
    }
    return null;
}

/**
 * @param {string} value
 * @returns {string}
 */
function decodeEntities(value) {
    return value
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)));
}

/**
 * @param {string} html
 * @returns {string|null}
 */
function phoneFromHtml(html) {
    const tel = html.match(/href=["']tel:([+\d\s()./-]{6,25})["']/i);
    return tel ? tel[1].replace(/\s+/g, ' ').trim() : null;
}

/**
 * Fetches one page and pulls out everything worth keeping.
 *
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<{ok: boolean, emails?: string[], instagram?: string[], name?: string|null, phone?: string|null, reason?: string}>}
 */
async function scanUrl(url, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            credentials: 'omit',
            redirect: 'follow',
        });

        if (!response.ok) return { ok: false, reason: `http-${response.status}` };
        if (!/text\/html/i.test(response.headers.get('content-type') ?? '')) {
            return { ok: false, reason: 'not-html' };
        }

        const html = await response.text();
        return {
            ok: true,
            emails: extractEmailsFromText(html),
            instagram: instagramHandlesFromHtml(html),
            name: nameFromHtml(html),
            phone: phoneFromHtml(html),
        };
    } catch (error) {
        return { ok: false, reason: error.name === 'AbortError' ? 'timeout' : 'unreachable' };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Common contact paths, tried when the landing page yields no address. Mirrors
 * what the actors do, kept short because every extra request is a page load in
 * the user's own browser.
 */
const CONTACT_PATHS = ['/kontakt', '/contact', '/contact-us', '/o-nama', '/about'];

/**
 * @param {object} lead mutated in place
 * @param {object} settings
 */
async function deepScanLead(lead, settings) {
    const first = await scanUrl(lead.url);

    if (!first.ok) {
        lead.scannedAt = new Date().toISOString();
        lead.scanError = first.reason;
        return;
    }

    lead.emails = [...new Set([...(lead.emails ?? []), ...first.emails])].sort();
    lead.instagram = [...new Set([...(lead.instagram ?? []), ...first.instagram])].sort();
    lead.name = lead.name || first.name;
    lead.phone = lead.phone || first.phone;

    if (!lead.emails.length) {
        for (const path of CONTACT_PATHS) {
            let contactUrl;
            try {
                contactUrl = new URL(path, new URL(lead.url).origin).href;
            } catch {
                break;
            }

            const page = await scanUrl(contactUrl, 10000);
            if (page.ok && page.emails.length) {
                lead.emails = page.emails;
                lead.instagram = [...new Set([...lead.instagram, ...page.instagram])].sort();
                lead.phone = lead.phone || page.phone;
                lead.contactPage = contactUrl;
                break;
            }
            await new Promise((resolve) => { setTimeout(resolve, settings.scanDelayMs); });
        }
    }

    lead.scannedAt = new Date().toISOString();
    delete lead.scanError;
}

/**
 * Scans every unscanned lead, a few at a time, reporting progress as it goes.
 *
 * @param {(done: number, total: number) => void} onProgress
 */
async function scanAll(onProgress) {
    const settings = await readSettings();
    const leads = await readLeads();
    const queue = Object.values(leads).filter((lead) => !lead.scannedAt);

    let done = 0;
    const workers = Array.from({ length: Math.max(1, settings.scanConcurrency) }, async () => {
        for (;;) {
            const lead = queue.shift();
            if (!lead) return;

            await deepScanLead(lead, settings);
            done += 1;
            onProgress(done, done + queue.length);

            // Persist as we go: closing the popup mid-scan must not lose work.
            await writeLeads(leads);
            await new Promise((resolve) => { setTimeout(resolve, settings.scanDelayMs); });
        }
    });

    await Promise.all(workers);
    return leads;
}

// --- Instagram keyword search ------------------------------------------------

/**
 * The keyword the sweep is currently on, so profiles reported by the content
 * script can be tagged with it. One query runs at a time, so a single slot is
 * enough and avoids threading state through the message.
 */
let activeSearch = null;

/**
 * Runs one search URL in a background tab and waits for the page to settle.
 *
 * A tab rather than `fetch` because that is the whole point: the request comes
 * from the user's own logged-in browser, so the engine serves ordinary results
 * instead of a CAPTCHA. `active: false` keeps it out of the way.
 *
 * @param {string} url
 * @param {number} settleMs
 */
async function sweepUrl(url, settleMs) {
    const tab = await chrome.tabs.create({ url, active: false });

    await new Promise((resolve) => {
        const done = () => {
            chrome.tabs.onUpdated.removeListener(listener);
            clearTimeout(timer);
            resolve();
        };
        const listener = (tabId, info) => {
            if (tabId === tab.id && info.status === 'complete') setTimeout(done, settleMs);
        };
        // A tab that never reports complete must not hang the sweep.
        const timer = setTimeout(done, 25_000);
        chrome.tabs.onUpdated.addListener(listener);
    });

    await chrome.tabs.remove(tab.id).catch(() => {});
}

/**
 * @param {object} params
 * @param {string[]} params.keywords
 * @param {string} [params.location]
 * @param {string[]} [params.probes] which query families to run
 * @param {number} [params.pages] result pages per query
 * @param {(done: number, total: number, label: string) => void} [params.onProgress]
 * @returns {Promise<{queries: number, found: number}>}
 */
async function runIgSearch({ keywords, location, probes = DEFAULT_PROBES, pages = 2, onProgress = () => {} }) {
    const settings = await readSettings();
    const queries = buildSearchQueries({ keywords, location, probes });

    const before = Object.keys(await readIgLeads()).length;
    let done = 0;
    const total = queries.length * pages;

    for (const entry of queries) {
        activeSearch = { keyword: entry.keyword, probe: entry.probe, token: entry.token };

        for (let page = 0; page < pages; page++) {
            // num=20 asks for a fuller page; engines honour it inconsistently,
            // which is why start= paging is used as well.
            const url = 'https://www.google.com/search?num=20'
                + `&q=${encodeURIComponent(entry.query)}`
                + (page ? `&start=${page * 10}` : '');

            await sweepUrl(url, Math.max(settings.scanDelayMs, 900));
            done += 1;
            onProgress(done, total, entry.query);
        }
    }

    activeSearch = null;
    return { queries: queries.length, found: Object.keys(await readIgLeads()).length - before };
}

// --- messages ----------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
        switch (message.type) {
            case 'serp-results': {
                const settings = await readSettings();
                if (!settings.autoCollectSerp) { sendResponse({ added: 0 }); return; }

                const leads = await readLeads();
                let added = 0;

                for (const result of message.results) {
                    const key = leadKey(result.url);
                    if (!key || leads[key]) continue;

                    leads[key] = {
                        key,
                        url: result.url,
                        name: result.name || null,
                        phone: null,
                        emails: extractEmailsFromText(result.snippet ?? ''),
                        instagram: [],
                        query: message.query,
                        foundVia: message.source,
                        foundAt: new Date().toISOString(),
                        scannedAt: null,
                    };
                    added += 1;
                }

                if (added) await writeLeads(leads);

                // Instagram profiles from a `site:instagram.com` search: the
                // bio the engine indexed is in the snippet, so the address is
                // already here — nothing further needs fetching.
                if (message.profiles?.length) {
                    const igLeads = await readIgLeads();
                    // Tracks any change, not just new profiles: a second
                    // keyword finding the same profile, or a fuller snippet
                    // carrying an address the first one truncated away, are
                    // both worth persisting.
                    let changed = false;

                    for (const result of message.profiles) {
                        const lead = igLeadFromResult(
                            { ...result, keyword: activeSearch?.keyword ?? null },
                            { instagramHandleFromUrl, extractEmailsFromText },
                            // No output filter: which token found the profile
                            // says nothing about which of its addresses are
                            // worth having.
                        );
                        if (!lead) continue;

                        const existing = igLeads[lead.username];
                        if (existing) {
                            const emails = [...new Set([...(existing.emails ?? []), ...lead.emails])];
                            const keywords = [...new Set([...(existing.keywords ?? []), lead.keyword].filter(Boolean))];

                            if (emails.length !== (existing.emails ?? []).length
                                || keywords.length !== (existing.keywords ?? []).length
                                || (!existing.description && lead.description)) {
                                changed = true;
                            }

                            existing.emails = emails;
                            existing.email = existing.email ?? emails[0] ?? null;
                            existing.keywords = keywords;
                            existing.description = existing.description || lead.description;
                            continue;
                        }

                        igLeads[lead.username] = {
                            ...lead,
                            keywords: [lead.keyword].filter(Boolean),
                            foundAt: new Date().toISOString(),
                        };
                        changed = true;
                    }

                    if (changed) await writeIgLeads(igLeads);
                }

                sendResponse({ added });
                return;
            }

            case 'ig-search': {
                const result = await runIgSearch({
                    keywords: message.keywords ?? [],
                    location: message.location ?? '',
                    probes: message.probes ?? DEFAULT_PROBES,
                    pages: message.pages ?? 2,
                    onProgress: (done, total, label) => {
                        chrome.runtime.sendMessage({ type: 'ig-progress', done, total, label }).catch(() => {});
                    },
                });
                sendResponse({ ok: true, ...result });
                return;
            }

            case 'get-ig-leads':
                sendResponse({ leads: Object.values(await readIgLeads()) });
                return;

            case 'clear-ig-leads':
                await writeIgLeads({});
                sendResponse({ ok: true });
                return;

            case 'scan-page': {
                // Scan whatever tab the user is looking at, search page or not.
                const leads = await readLeads();
                const key = leadKey(message.url);
                if (!key) { sendResponse({ ok: false, reason: 'bad-url' }); return; }

                leads[key] = leads[key] ?? {
                    key, url: message.url, name: null, phone: null,
                    emails: [], instagram: [], query: '', foundVia: 'manual',
                    foundAt: new Date().toISOString(), scannedAt: null,
                };

                await deepScanLead(leads[key], await readSettings());
                await writeLeads(leads);
                sendResponse({ ok: true, lead: leads[key] });
                return;
            }

            case 'scan-all': {
                const leads = await scanAll((done, total) => {
                    chrome.runtime.sendMessage({ type: 'scan-progress', done, total }).catch(() => {});
                });
                sendResponse({ ok: true, count: Object.keys(leads).length });
                return;
            }

            case 'get-leads':
                sendResponse({ leads: Object.values(await readLeads()), settings: await readSettings() });
                return;

            case 'clear-leads':
                await writeLeads({});
                sendResponse({ ok: true });
                return;

            case 'delete-lead': {
                const leads = await readLeads();
                delete leads[message.key];
                await writeLeads(leads);
                sendResponse({ ok: true });
                return;
            }

            case 'save-settings':
                await chrome.storage.local.set({ [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, ...message.settings } });
                sendResponse({ ok: true });
                return;

            case 'send-to-panel': {
                const settings = await readSettings();
                if (!settings.panelToken) { sendResponse({ ok: false, reason: 'Nema tokena u podešavanjima.' }); return; }

                const leads = Object.values(await readLeads());
                const igLeads = Object.values(await readIgLeads());
                const handles = [...new Set([
                    ...leads.flatMap((lead) => lead.instagram ?? []),
                    ...igLeads.map((lead) => lead.username),
                ].filter(Boolean))];
                if (!handles.length) { sendResponse({ ok: false, reason: 'Nema nijednog Instagram handle-a.' }); return; }

                try {
                    const response = await fetch(`${settings.panelUrl.replace(/\/+$/, '')}/api/runs`, {
                        method: 'POST',
                        headers: { 'content-type': 'application/json', authorization: `Bearer ${settings.panelToken}` },
                        body: JSON.stringify({
                            actorId: 'instagram-email-scraper',
                            input: { usernames: handles, enrichFromWebsite: true },
                        }),
                    });

                    if (!response.ok) { sendResponse({ ok: false, reason: `Panel je vratio ${response.status}.` }); return; }
                    sendResponse({ ok: true, count: handles.length });
                } catch {
                    sendResponse({ ok: false, reason: 'Panel nije dostupan — je l pokrenut?' });
                }
                return;
            }

            default:
                sendResponse({ ok: false, reason: 'unknown-message' });
        }
    })();

    // Keeps the message channel open for the async work above.
    return true;
});

chrome.runtime.onInstalled.addListener(async () => {
    await writeLeads(await readLeads());
});
