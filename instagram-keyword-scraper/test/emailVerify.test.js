import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyEmail, createMxChecker, keepSendable, verifyEmails } from '../src/emailVerify.js';

describe('classifyEmail', () => {
    it('recognises role accounts in both languages', () => {
        assert.equal(classifyEmail('info@firma.rs').roleAccount, true);
        assert.equal(classifyEmail('prodaja@firma.rs').roleAccount, true);
        assert.equal(classifyEmail('booking@hotel.rs').roleAccount, true);
        assert.equal(classifyEmail('marko.petrovic@firma.rs').roleAccount, false);
    });

    it('recognises a role account with a suffix', () => {
        assert.equal(classifyEmail('info.beograd@firma.rs').roleAccount, true);
        assert.equal(classifyEmail('prodaja-ns@firma.rs').roleAccount, true);
    });

    it('flags disposable providers', () => {
        assert.equal(classifyEmail('x@mailinator.com').disposable, true);
        assert.equal(classifyEmail('x@yopmail.com').disposable, true);
        assert.equal(classifyEmail('x@firma.rs').disposable, false);
    });

    it('flags free-mail providers, including local ones', () => {
        assert.equal(classifyEmail('salon.ana@gmail.com').freeMail, true);
        assert.equal(classifyEmail('mika@mts.rs').freeMail, true);
        assert.equal(classifyEmail('office@salonana.rs').freeMail, false);
    });

    it('lower-cases and splits on the last @', () => {
        const result = classifyEmail('Office@Firma.RS');

        assert.equal(result.email, 'office@firma.rs');
        assert.equal(result.domain, 'firma.rs');
    });

    it('does not throw on malformed input', () => {
        for (const value of ['nije-email', '@nolocal.rs', '', null, undefined]) {
            const result = classifyEmail(value);
            assert.equal(result.domain, null);
            assert.equal(result.roleAccount, false);
        }
    });
});

describe('createMxChecker', () => {
    it('reports true when the domain publishes a mail server', async () => {
        const hasMx = createMxChecker({ resolveMx: async () => [{ exchange: 'mail.firma.rs', priority: 10 }] });

        assert.equal(await hasMx('firma.rs'), true);
    });

    it('reports false for an empty record set or a DNS error', async () => {
        assert.equal(await createMxChecker({ resolveMx: async () => [] })('firma.rs'), false);
        assert.equal(
            await createMxChecker({ resolveMx: async () => { throw new Error('ENOTFOUND'); } })('nepostoji.rs'),
            false,
        );
    });

    it('queries each domain only once', async () => {
        let calls = 0;
        const hasMx = createMxChecker({
            resolveMx: async () => { calls += 1; return [{ exchange: 'mx.firma.rs' }]; },
        });

        await hasMx('firma.rs');
        await hasMx('firma.rs');
        await hasMx('firma.rs');

        assert.equal(calls, 1, 'the per-domain cache should collapse repeat lookups');
    });

    it('caches negative answers too', async () => {
        let calls = 0;
        const hasMx = createMxChecker({
            resolveMx: async () => { calls += 1; throw new Error('ENODATA'); },
        });

        await hasMx('nepostoji.rs');
        await hasMx('nepostoji.rs');

        assert.equal(calls, 1);
    });

    it('returns false for an empty domain without querying', async () => {
        let calls = 0;
        const hasMx = createMxChecker({ resolveMx: async () => { calls += 1; return []; } });

        assert.equal(await hasMx(''), false);
        assert.equal(calls, 0);
    });
});

describe('verifyEmails', () => {
    const resolveMx = async (domain) => {
        if (domain === 'mrtav.rs') throw new Error('ENOTFOUND');
        return [{ exchange: `mx.${domain}` }];
    };

    it('classifies and MX-checks in one pass', async () => {
        const results = await verifyEmails(['info@firma.rs', 'marko@mrtav.rs'], { resolveMx });

        assert.deepEqual(results.map((r) => r.email), ['info@firma.rs', 'marko@mrtav.rs']);
        assert.equal(results[0].mx, true);
        assert.equal(results[0].roleAccount, true);
        assert.equal(results[1].mx, false);
    });

    it('de-duplicates case-insensitively', async () => {
        const results = await verifyEmails(['Info@Firma.rs', 'info@firma.rs'], { resolveMx });

        assert.equal(results.length, 1);
    });

    it('skips DNS entirely when asked to', async () => {
        let calls = 0;
        const results = await verifyEmails(['info@firma.rs'], {
            checkMx: false,
            resolveMx: async () => { calls += 1; return []; },
        });

        assert.equal(results[0].mx, null);
        assert.equal(calls, 0);
    });

    it('handles an empty list', async () => {
        assert.deepEqual(await verifyEmails([], { resolveMx }), []);
        assert.deepEqual(await verifyEmails(undefined, { resolveMx }), []);
    });
});

describe('keepSendable', () => {
    const verified = [
        { email: 'info@firma.rs', mx: true, roleAccount: true, disposable: false, freeMail: false },
        { email: 'marko@firma.rs', mx: true, roleAccount: false, disposable: false, freeMail: false },
        { email: 'x@mrtav.rs', mx: false, roleAccount: false, disposable: false, freeMail: false },
        { email: 'x@mailinator.com', mx: true, roleAccount: false, disposable: true, freeMail: false },
    ];

    it('drops undeliverable and disposable addresses, keeping role accounts', () => {
        assert.deepEqual(keepSendable(verified), ['info@firma.rs', 'marko@firma.rs']);
    });

    it('can drop role accounts when you want people only', () => {
        assert.deepEqual(keepSendable(verified, { dropRoleAccounts: true }), ['marko@firma.rs']);
    });

    it('can keep addresses whose MX lookup failed', () => {
        assert.deepEqual(
            keepSendable(verified, { requireMx: false }),
            ['info@firma.rs', 'marko@firma.rs', 'x@mrtav.rs'],
        );
    });

    it('treats an unchecked address (mx null) as sendable', () => {
        assert.deepEqual(
            keepSendable([{ email: 'a@b.rs', mx: null, roleAccount: false, disposable: false }]),
            ['a@b.rs'],
        );
    });
});
