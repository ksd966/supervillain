import assert from 'node:assert/strict';
import http from 'node:http';
import { describe, it } from 'node:test';

import { isLinkHub, scrapeWebsiteForEmails } from '../src/website.js';

/**
 * Real HTTP against a throwaway server — `scrapeWebsiteForEmails` is mostly
 * about request sequencing (when to give up, when to try a contact page, when
 * to expand a link hub), and stubbing the transport would test none of that.
 *
 * Each case gets its own server so that root paths like `/contact` cannot leak
 * between scenarios: guessing is root-relative, so a shared fixture would let
 * the "nothing to find" case stumble onto another case's contact page.
 *
 * @param {Record<string, string>} pages
 * @param {(base: string, requestLog: string[]) => Promise<void>} run
 */
async function withServer(pages, run) {
    const requestLog = [];
    const server = http.createServer((req, res) => {
        const path = req.url.split('?')[0];
        requestLog.push(path);

        if (pages[path] !== undefined) {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(pages[path]);
        } else {
            res.writeHead(404, { 'content-type': 'text/plain' });
            res.end('not found');
        }
    });

    await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
    try {
        await run(`http://127.0.0.1:${server.address().port}`, requestLog);
    } finally {
        await new Promise((resolve) => { server.close(resolve); });
    }
}

describe('isLinkHub', () => {
    it('recognises the common link-in-bio services', () => {
        for (const host of ['linktr.ee', 'www.linktr.ee', 'beacons.ai', 'bio.link', 'taplink.cc']) {
            assert.equal(isLinkHub(host), true, `${host} should be treated as a hub`);
        }
    });

    it('does not match ordinary sites or lookalike suffixes', () => {
        for (const host of ['firma.rs', 'linktr.ee.evil.rs', 'notlinktr.ee.com', 'mybio.link.rs']) {
            assert.equal(isLinkHub(host), false, `${host} should not be treated as a hub`);
        }
    });
});

describe('scrapeWebsiteForEmails', () => {
    it('finds an address on the landing page and stops there', async () => {
        await withServer(
            { '/': '<html><body><h1>Firma</h1><p>office@direct.rs</p></body></html>' },
            async (base) => {
                const { emails, pagesChecked } = await scrapeWebsiteForEmails(base);

                assert.deepEqual(emails, ['office@direct.rs']);
                assert.equal(pagesChecked.length, 1, 'should not spend requests once an address is found');
            },
        );
    });

    it('follows a linked contact page when the landing page is empty', async () => {
        await withServer(
            {
                '/': '<html><body><a href="/shop/kontakt">Kontakt</a></body></html>',
                '/shop/kontakt': '<html><body><a href="mailto:prodaja@linked.rs">Piši</a></body></html>',
            },
            async (base, requestLog) => {
                const { emails, pagesChecked } = await scrapeWebsiteForEmails(base);

                assert.deepEqual(emails, ['prodaja@linked.rs']);
                assert.equal(pagesChecked.length, 2);
                assert.ok(
                    requestLog.includes('/shop/kontakt'),
                    'a contact page below the root should be recognised, not just /kontakt',
                );
            },
        );
    });

    it('guesses the usual contact paths when nothing is linked', async () => {
        await withServer(
            {
                '/': '<html><body><h1>Ništa ovde</h1></body></html>',
                '/contact': '<html><body><p>hello@guessed.rs</p></body></html>',
            },
            async (base) => {
                const { emails } = await scrapeWebsiteForEmails(base);

                assert.deepEqual(emails, ['hello@guessed.rs']);
            },
        );
    });

    it('returns empty rather than throwing when there is nothing to find', async () => {
        await withServer(
            { '/': '<html><body><h1>Prazno</h1></body></html>' },
            async (base) => {
                const { emails } = await scrapeWebsiteForEmails(base);

                assert.deepEqual(emails, []);
            },
        );
    });

    it('respects maxPages', async () => {
        await withServer(
            {
                '/': '<html><body><h1>Ništa</h1></body></html>',
                '/contact': '<html><body><p>hello@guessed.rs</p></body></html>',
            },
            async (base) => {
                const { pagesChecked } = await scrapeWebsiteForEmails(base, { maxPages: 1 });

                assert.equal(pagesChecked.length, 1);
            },
        );
    });

    it('does nothing when maxPages is zero', async () => {
        await withServer(
            { '/': '<html><body><p>office@direct.rs</p></body></html>' },
            async (base, requestLog) => {
                const { emails, pagesChecked } = await scrapeWebsiteForEmails(base, { maxPages: 0 });

                assert.deepEqual(emails, []);
                assert.deepEqual(pagesChecked, []);
                assert.deepEqual(requestLog, []);
            },
        );
    });

    it('applies the e-mail domain blocklist', async () => {
        await withServer(
            { '/': '<html><body><p>office@direct.rs</p></body></html>' },
            async (base) => {
                const { emails } = await scrapeWebsiteForEmails(base, { blockedDomains: ['direct.rs'] });

                assert.deepEqual(emails, []);
            },
        );
    });

    it('ignores non-HTML responses', async () => {
        const server = http.createServer((_req, res) => {
            res.writeHead(200, { 'content-type': 'application/pdf' });
            res.end('%PDF-1.4 office@pdf.rs');
        });
        await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });

        try {
            const { emails } = await scrapeWebsiteForEmails(`http://127.0.0.1:${server.address().port}/`);
            assert.deepEqual(emails, []);
        } finally {
            await new Promise((resolve) => { server.close(resolve); });
        }
    });

    it('handles an unreachable host without throwing', async () => {
        const { emails, pagesChecked } = await scrapeWebsiteForEmails('http://127.0.0.1:1/', { timeoutSecs: 2 });

        assert.deepEqual(emails, []);
        assert.deepEqual(pagesChecked, []);
    });

    it('rejects non-HTTP schemes and junk URLs', async () => {
        for (const url of ['ftp://firma.rs', 'javascript:alert(1)', 'nije-url', '']) {
            const { emails, pagesChecked } = await scrapeWebsiteForEmails(url, { timeoutSecs: 2 });

            assert.deepEqual(emails, [], `should ignore ${url}`);
            assert.deepEqual(pagesChecked, [], `should not request ${url}`);
        }
    });
});
