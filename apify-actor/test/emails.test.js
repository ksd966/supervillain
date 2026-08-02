import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as cheerio from 'cheerio';

import { decodeCloudflareEmail, deobfuscate, extractEmailsFromPage, isPlausibleEmail } from '../src/emails.js';

/** @param {string} html */
const scrape = (html, options) => extractEmailsFromPage({ $: cheerio.load(html), html, options });

describe('isPlausibleEmail', () => {
    it('accepts ordinary addresses', () => {
        assert.equal(isPlausibleEmail('marko.petrovic@firma.rs'), true);
        assert.equal(isPlausibleEmail('sales+eu@sub.example-corp.co.uk'), true);
    });

    it('rejects retina asset filenames', () => {
        assert.equal(isPlausibleEmail('logo@2x.png'), false);
        assert.equal(isPlausibleEmail('sprite@3x.webp'), false);
    });

    it('rejects Sentry DSN keys', () => {
        assert.equal(isPlausibleEmail('a1b2c3d4e5f60718293a4b5c6d7e8f90@o123.ingest.sentry.io'), false);
    });

    it('rejects placeholder addresses', () => {
        assert.equal(isPlausibleEmail('you@example.com'), false);
        assert.equal(isPlausibleEmail('name@yourdomain.com'), false);
        assert.equal(isPlausibleEmail('noreply@realcompany.com'), false);
    });

    it('rejects malformed shapes', () => {
        assert.equal(isPlausibleEmail('no-at-sign.com'), false);
        assert.equal(isPlausibleEmail('@nolocal.com'), false);
        assert.equal(isPlausibleEmail('trailing.@dot.com'), false);
        assert.equal(isPlausibleEmail('double..dot@x.com'), false);
        assert.equal(isPlausibleEmail('bad@-hyphen.com'), false);
        assert.equal(isPlausibleEmail('bad@tld.123'), false);
    });

    it('honours the user blocklist, including subdomains', () => {
        const blocked = new Set(['spam.rs']);
        assert.equal(isPlausibleEmail('a@spam.rs', blocked), false);
        assert.equal(isPlausibleEmail('a@mail.spam.rs', blocked), false);
        assert.equal(isPlausibleEmail('a@notspam.rs', blocked), true);
    });
});

describe('decodeCloudflareEmail', () => {
    it('decodes the XOR-hex payload', () => {
        // "info@example.com" encoded with key 0x7a.
        const plain = 'info@example.com';
        const key = 0x7a;
        const hex = plain
            .split('')
            .reduce(
                (acc, char) => acc + (char.charCodeAt(0) ^ key).toString(16).padStart(2, '0'),
                key.toString(16).padStart(2, '0'),
            );

        assert.equal(decodeCloudflareEmail(hex), plain);
    });

    it('returns null for junk', () => {
        assert.equal(decodeCloudflareEmail('zz'), null);
        assert.equal(decodeCloudflareEmail(''), null);
        assert.equal(decodeCloudflareEmail(undefined), null);
    });
});

describe('deobfuscate', () => {
    it('unwraps bracketed at/dot', () => {
        assert.match(deobfuscate('kontakt [at] firma [dot] rs'), /kontakt@firma\.rs/);
        assert.match(deobfuscate('kontakt (AT) firma (DOT) rs'), /kontakt@firma\.rs/);
    });

    it('unwraps the bare spaced form', () => {
        assert.match(deobfuscate('write to john at example dot com today'), /john@example\.com/);
    });

    it('decodes HTML entities', () => {
        assert.match(deobfuscate('info&#64;firma&#46;rs'), /info@firma\.rs/);
    });

    it('leaves ordinary prose alone', () => {
        const prose = 'Meet me at the office. Do not forget.';
        assert.equal(deobfuscate(prose), prose);
    });
});

describe('extractEmailsFromPage', () => {
    it('reads mailto links, stripping query strings and multiple recipients', () => {
        const html = `
            <body>
                <a href="mailto:prodaja@firma.rs?subject=Upit%20o%20ceni">Piši nam</a>
                <a href="MAILTO:one@firma.rs,two@firma.rs">Both</a>
            </body>`;
        assert.deepEqual(scrape(html), ['one@firma.rs', 'prodaja@firma.rs', 'two@firma.rs']);
    });

    it('percent-decodes mailto hrefs', () => {
        const html = '<body><a href="mailto:pero%40firma.rs">mail</a></body>';
        assert.deepEqual(scrape(html), ['pero@firma.rs']);
    });

    it('reads addresses from visible text', () => {
        const html = '<body><p>Kontakt: office@firma.rs (radnim danima)</p></body>';
        assert.deepEqual(scrape(html), ['office@firma.rs']);
    });

    it('ignores script and style noise when raw HTML scanning is off', () => {
        const html = `
            <body>
                <p>real@firma.rs</p>
                <script>Sentry.init({dsn:"https://a1b2c3d4e5f60718293a4b5c6d7e8f90@o1.ingest.sentry.io/2"})</script>
                <style>.x{background:url(logo@2x.png)}</style>
            </body>`;
        assert.deepEqual(scrape(html, { scanRawHtml: false }), ['real@firma.rs']);
    });

    it('filters the same noise even with raw HTML scanning on', () => {
        const html = `
            <body>
                <p>real@firma.rs</p>
                <img src="logo@2x.png">
                <script>{"dsn":"https://a1b2c3d4e5f60718293a4b5c6d7e8f90@o1.ingest.sentry.io/2"}</script>
            </body>`;
        assert.deepEqual(scrape(html, { scanRawHtml: true }), ['real@firma.rs']);
    });

    it('finds addresses hidden in JSON-LD only when raw HTML scanning is on', () => {
        const html = `
            <body>
                <script type="application/ld+json">
                    {"@type":"Organization","email":"press@firma.rs"}
                </script>
            </body>`;
        assert.deepEqual(scrape(html, { scanRawHtml: false }), []);
        assert.deepEqual(scrape(html, { scanRawHtml: true }), ['press@firma.rs']);
    });

    it('decodes Cloudflare-protected addresses', () => {
        // "zastita@firma.rs" with key 0x1c.
        const plain = 'zastita@firma.rs';
        const key = 0x1c;
        const hex = plain
            .split('')
            .reduce(
                (acc, char) => acc + (char.charCodeAt(0) ^ key).toString(16).padStart(2, '0'),
                key.toString(16).padStart(2, '0'),
            );

        const html = `<body><a href="/cdn-cgi/l/email-protection#${hex}"><span class="__cf_email__" data-cfemail="${hex}">[email&#160;protected]</span></a></body>`;
        assert.deepEqual(scrape(html), [plain]);
    });

    it('does not mistake URL credentials or paths for addresses', () => {
        const html = '<body><p>Docs: https://firma.rs/team/marko@odeljenje</p></body>';
        assert.deepEqual(scrape(html), []);
    });

    it('de-duplicates and lower-cases', () => {
        const html = `
            <body>
                <a href="mailto:Office@Firma.rs">a</a>
                <p>OFFICE@FIRMA.RS</p>
            </body>`;
        assert.deepEqual(scrape(html), ['office@firma.rs']);
    });

    it('applies the user domain blocklist', () => {
        const html = '<body><p>a@keep.rs and b@drop.rs</p></body>';
        assert.deepEqual(scrape(html, { blockedDomains: ['drop.rs'] }), ['a@keep.rs']);
    });
});
