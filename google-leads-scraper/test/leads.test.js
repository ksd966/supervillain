import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { collectLeads, leadKey, mergeLead } from '../src/leads.js';

describe('leadKey', () => {
    it('keys on the website when there is one', () => {
        assert.equal(leadKey({ website: 'https://salonana.rs/' }), 'site:salonana.rs');
    });

    it('treats www, trailing slashes and case as the same site', () => {
        const keys = [
            'https://www.salonana.rs',
            'https://salonana.rs/',
            'http://SalonAna.rs//',
        ].map((website) => leadKey({ website }));

        assert.equal(new Set(keys).size, 1, `expected one key, got ${JSON.stringify(keys)}`);
    });

    it('keeps different businesses on a shared host apart', () => {
        const a = leadKey({ website: 'https://wixsite.com/salon-a' });
        const b = leadKey({ website: 'https://wixsite.com/salon-b' });

        assert.notEqual(a, b, 'two tenants of one host must not collapse into one lead');
    });

    it('keeps different ports apart', () => {
        assert.notEqual(
            leadKey({ website: 'http://127.0.0.1:8090/' }),
            leadKey({ website: 'http://127.0.0.1:8091/' }),
        );
    });

    it('falls back to name and address without a website', () => {
        assert.equal(
            leadKey({ name: ' Salon Luna ', address: 'Zmaj Jovina 12' }),
            'name:salon luna|zmaj jovina 12',
        );
    });

    it('falls back to the name key when the website is unparseable', () => {
        assert.equal(leadKey({ website: 'nije url', name: 'Pekara' }), 'name:pekara|');
    });

    it('separates same-named businesses at different addresses', () => {
        assert.notEqual(
            leadKey({ name: 'Salon Ana', address: 'Zmaj Jovina 12' }),
            leadKey({ name: 'Salon Ana', address: 'Bulevar 5' }),
        );
    });
});

describe('mergeLead', () => {
    it('fills gaps without overwriting what is already there', () => {
        const existing = { name: 'Salon Ana', phone: '021 111', address: null, rating: null, source: 'google-maps' };
        mergeLead(existing, { name: 'Salon Ana', phone: '021 999', address: 'Zmaj Jovina 12', rating: 4.8, source: 'openstreetmap' });

        assert.equal(existing.phone, '021 111', 'existing values win');
        assert.equal(existing.address, 'Zmaj Jovina 12');
        assert.equal(existing.rating, 4.8);
    });

    it('unions e-mails and handles', () => {
        const existing = { emails: ['a@x.rs'], instagramHandles: ['salon_ana'] };
        mergeLead(existing, { emails: ['b@x.rs', 'a@x.rs'], instagramHandles: ['salon_ana', 'ana_nails'] });

        assert.deepEqual(existing.emails, ['a@x.rs', 'b@x.rs']);
        assert.deepEqual(existing.instagramHandles, ['ana_nails', 'salon_ana']);
    });

    it('records that both sources found it, without duplicating labels', () => {
        const existing = { source: 'google-maps' };
        mergeLead(existing, { source: 'openstreetmap' });
        assert.equal(existing.source, 'google-maps+openstreetmap');

        mergeLead(existing, { source: 'openstreetmap' });
        assert.equal(existing.source, 'google-maps+openstreetmap', 'merging again should not repeat a source');
    });

    it('treats zero and false as present, not as gaps', () => {
        const existing = { rating: 0, reviewsCount: 0 };
        mergeLead(existing, { rating: 4.9, reviewsCount: 300 });

        assert.equal(existing.rating, 0);
        assert.equal(existing.reviewsCount, 0);
    });
});

describe('collectLeads', () => {
    it('merges duplicates across sources into one record', () => {
        const map = collectLeads([
            { name: 'Salon Ana', website: 'https://salonana.rs', phone: null, source: 'google-maps', emails: [] },
            { name: 'Salon Ana', website: 'https://www.salonana.rs/', phone: '021 111', source: 'openstreetmap', emails: ['a@salonana.rs'] },
        ]);

        assert.equal(map.size, 1);
        const [lead] = [...map.values()];
        assert.equal(lead.phone, '021 111');
        assert.deepEqual(lead.emails, ['a@salonana.rs']);
        assert.equal(lead.source, 'google-maps+openstreetmap');
    });

    it('keeps genuinely distinct businesses separate', () => {
        const map = collectLeads([
            { name: 'Salon Ana', website: 'https://salonana.rs' },
            { name: 'Frizer Mika', website: 'https://frizermika.rs' },
            { name: 'Salon Luna' },
        ]);

        assert.equal(map.size, 3);
    });

    it('accumulates into an existing map and skips empty entries', () => {
        const map = collectLeads([{ name: 'A', website: 'https://a.rs' }]);
        collectLeads([null, undefined, { name: 'B', website: 'https://b.rs' }], map);

        assert.equal(map.size, 2);
    });
});
