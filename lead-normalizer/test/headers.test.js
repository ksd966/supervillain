import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fieldFromHeader, fieldFromValues, mapHeaders } from '../src/headers.js';

describe('fieldFromHeader', () => {
    it('matches the obvious names regardless of punctuation and case', () => {
        for (const header of ['Email', 'E-Mail', 'email_address', 'EMAIL ADDRESS', 'Contact Email']) {
            assert.equal(fieldFromHeader(header), 'email', `${header} should map to email`);
        }
    });

    it('maps the common variants of each field', () => {
        assert.equal(fieldFromHeader('Full Name'), 'name');
        assert.equal(fieldFromHeader('Company Name'), 'name');
        assert.equal(fieldFromHeader('First Name'), 'firstName');
        assert.equal(fieldFromHeader('Surname'), 'lastName');
        assert.equal(fieldFromHeader('IG Handle'), 'instagram');
        assert.equal(fieldFromHeader('Instagram URL'), 'instagram');
        assert.equal(fieldFromHeader('Mobile Phone'), 'phone');
        assert.equal(fieldFromHeader('Website URL'), 'website');
        assert.equal(fieldFromHeader('Job Title'), 'jobTitle');
        assert.equal(fieldFromHeader('State/Province'), 'state');
        assert.equal(fieldFromHeader('Zip Code'), 'postalCode');
        assert.equal(fieldFromHeader('Followers Count'), 'followers');
    });

    it('matches a known alias buried in a longer header', () => {
        assert.equal(fieldFromHeader('Owner E-mail Address 2'), 'email');
        assert.equal(fieldFromHeader('Primary Business Website'), 'website');
    });

    it('returns null for headers it does not know', () => {
        assert.equal(fieldFromHeader('Lead Score'), null);
        assert.equal(fieldFromHeader(''), null);
        assert.equal(fieldFromHeader(null), null);
    });
});

describe('fieldFromValues', () => {
    it('recognises a column by what is in it', () => {
        assert.equal(fieldFromValues(['a@b.com', 'c@d.org', 'e@f.net']), 'email');
        assert.equal(fieldFromValues(['@salon_ana', '@nails_bar', '@studio.la']), 'instagram');
        assert.equal(fieldFromValues(['https://instagram.com/a', 'https://instagram.com/b']), 'instagram');
        assert.equal(fieldFromValues(['+1 310 555 1234', '(212) 555-9876', '415-555-0000']), 'phone');
        assert.equal(fieldFromValues(['https://a.com', 'www.b.com', 'https://c.io']), 'website');
    });

    it('is not fooled by a single stray value', () => {
        const notes = ['called them', 'no answer', 'reach at a@b.com', 'left voicemail', 'busy'];

        assert.equal(fieldFromValues(notes), null);
    });

    it('needs more than one value to commit', () => {
        assert.equal(fieldFromValues(['a@b.com']), null);
        assert.equal(fieldFromValues([]), null);
    });
});

describe('mapHeaders', () => {
    it('maps by name first, then by value', () => {
        const records = [
            { 'Lead Name': 'Ana', 'col_2': 'ana@salon.com' },
            { 'Lead Name': 'Bob', 'col_2': 'bob@shop.com' },
        ];
        const { mapping } = mapHeaders(['Lead Name', 'col_2'], records);

        assert.equal(mapping['Lead Name'], 'name');
        assert.equal(mapping.col_2, 'email', 'a nameless column should be identified by its contents');
    });

    it('gives a field to the first column that claims it', () => {
        const { mapping, unmapped } = mapHeaders(['Email', 'Email 2'], [
            { Email: 'a@b.com', 'Email 2': 'x@y.com' },
            { Email: 'c@d.com', 'Email 2': 'z@w.com' },
        ]);

        assert.equal(mapping.Email, 'email');
        assert.ok(!('Email 2' in mapping), 'the second e-mail column must not overwrite the first');
        assert.deepEqual(unmapped, ['Email 2']);
    });

    it('reports columns it could not place', () => {
        const { mapping, unmapped } = mapHeaders(['Name', 'Lead Score'], [
            { Name: 'Ana', 'Lead Score': '87' },
            { Name: 'Bob', 'Lead Score': '43' },
        ]);

        assert.equal(mapping.Name, 'name');
        assert.deepEqual(unmapped, ['Lead Score']);
    });

    it('copes with no records to sample', () => {
        const { mapping } = mapHeaders(['Email'], []);

        assert.equal(mapping.Email, 'email');
    });
});
