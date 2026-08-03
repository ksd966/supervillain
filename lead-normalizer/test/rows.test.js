import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildRow, dedupeKey, mergeRow } from '../src/rows.js';

const MAPPING = {
    'Business Name': 'name',
    Owner: 'contactName',
    'E-Mail Address': 'email',
    'IG Handle': 'instagram',
    'Mobile Phone': 'phone',
    City: 'city',
    State: 'state',
    Notes: 'bio',
};

describe('buildRow', () => {
    it('normalises a full record', () => {
        const row = buildRow({
            'Business Name': 'Bright Smile Dental',
            Owner: 'Carter, James',
            'E-Mail Address': 'INFO@BrightSmile.com',
            'IG Handle': '@brightsmiledental',
            'Mobile Phone': '(310) 555-1234 ext. 22',
            City: 'Los Angeles',
            State: 'California',
        }, { mapping: MAPPING });

        assert.equal(row.name, 'Bright Smile Dental');
        assert.equal(row.contactName, 'Carter, James');
        assert.equal(row.firstName, 'James');
        assert.equal(row.lastName, 'Carter');
        assert.equal(row.email, 'info@brightsmile.com');
        assert.equal(row.instagram, 'brightsmiledental');
        assert.equal(row.phone, '+13105551234');
        assert.equal(row.state, 'CA');
    });

    it('mines contacts out of a free-text column', () => {
        const row = buildRow({
            'Business Name': 'Vista Med Spa',
            Notes: 'Reach them at hello@vistamedspa.com or IG instagram.com/vista.medspa',
        }, { mapping: MAPPING });

        assert.equal(row.email, 'hello@vistamedspa.com');
        assert.equal(row.instagram, 'vista.medspa');
    });

    it('mines unmapped columns, and can be told not to mine at all', () => {
        const record = { 'Business Name': 'Acme', 'Lead Score': 'ping bob@acme.com back' };

        assert.equal(buildRow(record, { mapping: MAPPING, unmapped: ['Lead Score'] }).email, 'bob@acme.com');
        assert.equal(
            buildRow(record, { mapping: MAPPING, unmapped: ['Lead Score'], mineFreeText: false }).email,
            null,
        );
    });

    it('does not split a company name into a person', () => {
        const row = buildRow({ 'Business Name': 'Elite Fitness LLC' }, { mapping: MAPPING });

        assert.equal(row.isPerson, false);
        assert.equal(row.firstName, null);
    });

    it('splits the state out of a "City, ST" cell', () => {
        const row = buildRow({ 'Business Name': 'X', City: 'Austin, TX' }, { mapping: MAPPING });

        assert.equal(row.city, 'Austin');
        assert.equal(row.state, 'TX');
    });

    it('keeps unmapped columns only when asked', () => {
        const record = { 'Business Name': 'X', 'Lead Score': '87' };

        assert.equal(buildRow(record, { mapping: MAPPING, unmapped: ['Lead Score'] })['Lead Score'], undefined);
        assert.equal(
            buildRow(record, { mapping: MAPPING, unmapped: ['Lead Score'], keepUnmappedColumns: true })['Lead Score'],
            '87',
        );
    });
});

describe('dedupeKey', () => {
    it('keys on e-mail by default', () => {
        assert.equal(dedupeKey({ email: 'a@b.com' }), 'email:a@b.com');
    });

    it('keys on website host plus path when asked', () => {
        assert.equal(
            dedupeKey({ website: 'https://www.acme.com/shop/' }, 'website'),
            'site:acme.com/shop',
        );
    });

    it('keeps rows with nothing to key on apart', () => {
        assert.notEqual(dedupeKey({}, 'email', 0), dedupeKey({}, 'email', 1));
    });
});

describe('mergeRow', () => {
    it('fills gaps and unions the contact lists', () => {
        const existing = { name: 'X', phone: null, emails: ['a@b.com'], instagramAll: [] };
        mergeRow(existing, { name: 'Y', phone: '+1310', emails: ['c@d.com'], instagramAll: ['x'] });

        assert.equal(existing.name, 'X', 'existing values win');
        assert.equal(existing.phone, '+1310');
        assert.deepEqual(existing.emails, ['a@b.com', 'c@d.com']);
        assert.deepEqual(existing.instagramAll, ['x']);
    });
});
