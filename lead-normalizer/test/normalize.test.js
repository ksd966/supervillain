import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    normalizeEmails,
    normalizeFollowers,
    normalizeInstagram,
    normalizePhone,
    normalizeState,
    normalizeWebsite,
    splitName,
} from '../src/normalize.js';

describe('normalizeEmails', () => {
    it('splits a multi-value cell on any separator', () => {
        assert.deepEqual(
            normalizeEmails('ana@salon.com; bob@salon.com, carol@salon.com'),
            ['ana@salon.com', 'bob@salon.com', 'carol@salon.com'],
        );
    });

    it('lower-cases and drops the junk the filters already know', () => {
        assert.deepEqual(normalizeEmails('Ana@Salon.COM'), ['ana@salon.com']);
        assert.deepEqual(normalizeEmails('logo@2x.png'), []);
        assert.deepEqual(normalizeEmails('you@example.com'), []);
    });

    it('handles arrays and empties', () => {
        assert.deepEqual(normalizeEmails(['a@b.com', 'c@d.com']), ['a@b.com', 'c@d.com']);
        assert.deepEqual(normalizeEmails(''), []);
        assert.deepEqual(normalizeEmails(null), []);
    });
});

describe('normalizeInstagram', () => {
    it('accepts every shape a column might hold', () => {
        assert.equal(normalizeInstagram('@salon_ana'), 'salon_ana');
        assert.equal(normalizeInstagram('salon_ana'), 'salon_ana');
        assert.equal(normalizeInstagram('https://www.instagram.com/salon_ana/'), 'salon_ana');
        assert.equal(normalizeInstagram('instagram.com/Salon.Ana'), 'salon.ana');
    });

    it('rejects post links and impossible handles', () => {
        assert.equal(normalizeInstagram('https://instagram.com/p/Cabc123/'), null);
        assert.equal(normalizeInstagram('Ana Smith'), null);
        assert.equal(normalizeInstagram('a'.repeat(31)), null);
        assert.equal(normalizeInstagram(''), null);
    });
});

describe('normalizePhone', () => {
    it('turns the usual US shapes into E.164', () => {
        for (const value of ['(310) 555-1234', '310-555-1234', '310.555.1234', '3105551234', '1 310 555 1234']) {
            assert.equal(normalizePhone(value), '+13105551234', `${value} should normalise`);
        }
    });

    it('keeps an already-international number', () => {
        assert.equal(normalizePhone('+44 20 7946 0958'), '+442079460958');
    });

    it('drops an extension, which would otherwise break a dialer', () => {
        assert.equal(normalizePhone('(310) 555-1234 ext. 22'), '+13105551234');
        assert.equal(normalizePhone('310-555-1234 x99'), '+13105551234');
    });

    it('rejects numbers that cannot be US numbers', () => {
        assert.equal(normalizePhone('555-1234'), null);
        assert.equal(normalizePhone('12345'), null);
        assert.equal(normalizePhone('not a phone'), null);
        assert.equal(normalizePhone(''), null);
    });

    it('supports other regions when told', () => {
        assert.equal(normalizePhone('021 123 4567', '+381'), '+38121123 4567'.replace(' ', ''));
        assert.equal(normalizePhone('0211234567', '381'), '+381211234567');
    });
});

describe('normalizeWebsite', () => {
    it('adds a scheme and strips a trailing slash', () => {
        assert.equal(normalizeWebsite('salonana.com'), 'https://salonana.com');
        assert.equal(normalizeWebsite('https://salonana.com/'), 'https://salonana.com');
        assert.equal(normalizeWebsite('www.salonana.com/about'), 'https://www.salonana.com/about');
    });

    it('rejects placeholders and things that are not hosts', () => {
        for (const value of ['n/a', 'N/A', 'none', '-', '', 'not a url']) {
            assert.equal(normalizeWebsite(value), null, `${value} should not become a URL`);
        }
    });
});

describe('normalizeState', () => {
    it('resolves full names to two-letter codes', () => {
        assert.equal(normalizeState('California'), 'CA');
        assert.equal(normalizeState('new york'), 'NY');
        assert.equal(normalizeState('Washington DC'), 'DC');
    });

    it('passes through a code already in the right shape', () => {
        assert.equal(normalizeState('TX'), 'TX');
        assert.equal(normalizeState('tx'), 'TX');
    });

    it('leaves anything unrecognised alone rather than discarding it', () => {
        assert.equal(normalizeState('Ontario'), 'Ontario');
        assert.equal(normalizeState(''), null);
    });
});

describe('splitName', () => {
    it('splits a person', () => {
        assert.deepEqual(splitName('John Smith'), { firstName: 'John', lastName: 'Smith', isPerson: true });
        assert.deepEqual(splitName('Mary Jane Watson'), { firstName: 'Mary', lastName: 'Watson', isPerson: true });
    });

    it('handles the "Last, First" form', () => {
        assert.deepEqual(splitName('Smith, John'), { firstName: 'John', lastName: 'Smith', isPerson: true });
    });

    it('refuses to split a company name', () => {
        for (const value of ['Acme Inc', 'Smith & Sons', 'Bright Dental Clinic', 'Elite Fitness LLC', '24 Hour Plumbing']) {
            assert.equal(splitName(value).isPerson, false, `${value} should not be treated as a person`);
            assert.equal(splitName(value).firstName, null);
        }
    });

    it('handles a single name and an empty one', () => {
        assert.deepEqual(splitName('Cher'), { firstName: 'Cher', lastName: null, isPerson: true });
        assert.deepEqual(splitName(''), { firstName: null, lastName: null, isPerson: false });
    });
});

describe('normalizeFollowers', () => {
    it('expands the k and M shorthands', () => {
        assert.equal(normalizeFollowers('12.5k'), 12500);
        assert.equal(normalizeFollowers('1.2M'), 1200000);
        assert.equal(normalizeFollowers('980'), 980);
    });

    it('strips thousands separators', () => {
        assert.equal(normalizeFollowers('15,400'), 15400);
        assert.equal(normalizeFollowers('15,400 followers'), 15400);
    });

    it('returns null for anything unparseable', () => {
        assert.equal(normalizeFollowers('lots'), null);
        assert.equal(normalizeFollowers(''), null);
    });
});
