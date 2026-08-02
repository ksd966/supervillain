import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extractEmailsFromText } from '../src/emails.js';
import {
    COMMON_EMAIL_DOMAINS,
    buildSearchQueries,
    explodeByEmail,
    igLeadFromResult,
    parseProfileTitle,
} from '../src/igSearch.js';
import { instagramHandleFromUrl } from '../src/social.js';

const helpers = { instagramHandleFromUrl, extractEmailsFromText };

describe('buildSearchQueries', () => {
    it('builds one query per keyword and domain', () => {
        const queries = buildSearchQueries({
            keywords: ['marketing', 'beauty'],
            emailDomains: ['@gmail.com', '@yahoo.com'],
        });

        assert.equal(queries.length, 4);
        assert.equal(queries[0].query, 'site:instagram.com "marketing" "@gmail.com"');
        assert.equal(queries[0].keyword, 'marketing');
        assert.equal(queries[0].emailDomain, '@gmail.com');
    });

    it('adds the location between keyword and domain', () => {
        const [first] = buildSearchQueries({
            keywords: ['med spa'],
            location: 'Austin TX',
            emailDomains: ['@gmail.com'],
        });

        assert.equal(first.query, 'site:instagram.com "med spa" "Austin TX" "@gmail.com"');
    });

    it('falls back to the common free-mail domains', () => {
        const queries = buildSearchQueries({ keywords: ['realtor'] });

        assert.equal(queries.length, COMMON_EMAIL_DOMAINS.length);
        assert.ok(queries.every((entry) => entry.query.includes('site:instagram.com "realtor"')));
    });

    it('drops the domain clause entirely when given an empty list explicitly', () => {
        const queries = buildSearchQueries({ keywords: ['realtor'], emailDomains: ['   '] });

        assert.equal(queries.length, 1);
        assert.equal(queries[0].query, 'site:instagram.com "realtor"');
        assert.equal(queries[0].emailDomain, null);
    });

    it('strips quotes that would break the query', () => {
        const [first] = buildSearchQueries({ keywords: ['a "quoted" term'], emailDomains: ['@gmail.com'] });

        assert.equal(first.query, 'site:instagram.com "a quoted term" "@gmail.com"');
    });

    it('can target another site', () => {
        const [first] = buildSearchQueries({ keywords: ['founder'], emailDomains: ['@gmail.com'], site: 'tiktok.com' });

        assert.ok(first.query.startsWith('site:tiktok.com'));
    });

    it('returns nothing without keywords', () => {
        assert.deepEqual(buildSearchQueries(), []);
        assert.deepEqual(buildSearchQueries({ keywords: ['', '  '] }), []);
    });
});

describe('parseProfileTitle', () => {
    it('splits the display name from the handle', () => {
        assert.deepEqual(
            parseProfileTitle('Marketing Agency (@primepixelit) • Instagram photos and videos'),
            { name: 'Marketing Agency', handleFromTitle: 'primepixelit' },
        );
    });

    it('handles the "on Instagram" phrasing', () => {
        assert.deepEqual(
            parseProfileTitle('Sarah Chen (@elitefit.la) on Instagram'),
            { name: 'Sarah Chen', handleFromTitle: 'elitefit.la' },
        );
    });

    it('keeps the name when the title carries no handle', () => {
        assert.deepEqual(
            parseProfileTitle('Bright Smile Dental • Instagram'),
            { name: 'Bright Smile Dental', handleFromTitle: null },
        );
    });

    it('does not throw on an empty title', () => {
        assert.deepEqual(parseProfileTitle(''), { name: null, handleFromTitle: null });
        assert.deepEqual(parseProfileTitle(undefined), { name: null, handleFromTitle: null });
    });
});

describe('igLeadFromResult', () => {
    const result = {
        keyword: 'marketing',
        title: 'Marketing Agency (@primepixelit) • Instagram photos and videos',
        url: 'https://www.instagram.com/primepixelit/',
        snippet: '2,431 Followers · Digital marketing · primepixelit@gmail.com · DM for rates',
    };

    it('pulls the address out of the indexed bio snippet', () => {
        const lead = igLeadFromResult(result, helpers);

        assert.equal(lead.username, 'primepixelit');
        assert.equal(lead.name, 'Marketing Agency');
        assert.equal(lead.email, 'primepixelit@gmail.com');
        assert.equal(lead.url, 'https://www.instagram.com/primepixelit/');
        assert.equal(lead.keyword, 'marketing');
    });

    it('keeps every address it finds, not only the first', () => {
        const lead = igLeadFromResult({
            ...result,
            snippet: 'contact primepixelit@gmail.com or infotanvir.it@gmail.com',
        }, helpers);

        assert.deepEqual(lead.emails, ['infotanvir.it@gmail.com', 'primepixelit@gmail.com']);
    });

    it('filters to the requested domains', () => {
        const lead = igLeadFromResult({
            ...result,
            snippet: 'work@agency.io and personal@gmail.com',
        }, helpers, { emailDomains: ['@gmail.com'] });

        assert.deepEqual(lead.emails, ['personal@gmail.com']);
    });

    it('accepts a bare domain in the filter too', () => {
        const lead = igLeadFromResult(result, helpers, { emailDomains: ['gmail.com'] });

        assert.equal(lead.email, 'primepixelit@gmail.com');
    });

    it('rejects results that are not profile pages', () => {
        assert.equal(igLeadFromResult({ ...result, url: 'https://www.instagram.com/p/Cabc123/' }, helpers), null);
        assert.equal(igLeadFromResult({ ...result, url: 'https://example.com/x' }, helpers), null);
        assert.equal(igLeadFromResult({ url: '' }, helpers), null);
    });

    it('returns a lead with no address rather than nothing', () => {
        const lead = igLeadFromResult({ ...result, snippet: 'no contact here' }, helpers);

        assert.equal(lead.username, 'primepixelit');
        assert.equal(lead.email, null);
        assert.deepEqual(lead.emails, []);
    });

    it('prefers the handle spelled out in the title', () => {
        const lead = igLeadFromResult({
            ...result,
            title: 'Agency (@Real.Handle) • Instagram',
            url: 'https://www.instagram.com/real.handle/?hl=en',
        }, helpers);

        assert.equal(lead.username, 'real.handle');
    });
});

describe('explodeByEmail', () => {
    it('emits one row per address', () => {
        const rows = explodeByEmail([
            { username: 'a', emails: ['x@gmail.com', 'y@gmail.com'] },
            { username: 'b', emails: ['z@gmail.com'] },
        ]);

        assert.equal(rows.length, 3);
        assert.deepEqual(rows.map((row) => row.email), ['x@gmail.com', 'y@gmail.com', 'z@gmail.com']);
    });

    it('keeps a lead that has no address', () => {
        const rows = explodeByEmail([{ username: 'a', emails: [] }]);

        assert.equal(rows.length, 1);
        assert.equal(rows[0].username, 'a');
    });
});
