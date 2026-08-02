import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { explainFailure, mapProfile } from '../src/instagram.js';

/** A trimmed-down copy of what `web_profile_info` returns under `data.user`. */
const RAW_USER = {
    id: '12345',
    username: 'firma_rs',
    full_name: 'Firma d.o.o.',
    biography: 'Pišite nam: kontakt [at] firma [dot] rs',
    external_url: 'https://firma.rs',
    bio_links: [
        { title: 'Sajt', url: 'https://firma.rs' },
        { title: '', url: 'https://linktr.ee/firma' },
        { title: 'broken', url: null },
    ],
    edge_followed_by: { count: 15400 },
    edge_follow: { count: 312 },
    edge_owner_to_timeline_media: { count: 88 },
    is_verified: true,
    is_private: false,
    is_business_account: true,
    is_professional_account: true,
    business_category_name: 'Retail',
    business_email: 'Prodaja@Firma.rs',
    business_phone_number: '+381 11 1234567',
    profile_pic_url_hd: 'https://scontent.cdninstagram.com/hd.jpg',
    profile_pic_url: 'https://scontent.cdninstagram.com/sd.jpg',
};

describe('mapProfile', () => {
    it('flattens the response into Apify-compatible field names', () => {
        const profile = mapProfile(RAW_USER);

        assert.equal(profile.username, 'firma_rs');
        assert.equal(profile.url, 'https://www.instagram.com/firma_rs/');
        assert.equal(profile.fullName, 'Firma d.o.o.');
        assert.equal(profile.followersCount, 15400);
        assert.equal(profile.followsCount, 312);
        assert.equal(profile.postsCount, 88);
        assert.equal(profile.verified, true);
        assert.equal(profile.private, false);
        assert.equal(profile.isBusinessAccount, true);
        assert.equal(profile.businessCategoryName, 'Retail');
        assert.equal(profile.businessEmail, 'Prodaja@Firma.rs');
        assert.equal(profile.businessPhoneNumber, '+381 11 1234567');
        assert.equal(profile.profilePicUrl, 'https://scontent.cdninstagram.com/hd.jpg');
    });

    it('drops bio links without a URL', () => {
        assert.deepEqual(mapProfile(RAW_USER).bioLinks, [
            { title: 'Sajt', url: 'https://firma.rs' },
            { title: '', url: 'https://linktr.ee/firma' },
        ]);
    });

    it('falls back to category_name when business_category_name is absent', () => {
        const profile = mapProfile({ ...RAW_USER, business_category_name: null, category_name: 'Creator' });
        assert.equal(profile.businessCategoryName, 'Creator');
    });

    it('assembles a phone number from the split public fields', () => {
        const profile = mapProfile({
            ...RAW_USER,
            business_phone_number: null,
            public_phone_country_code: '381',
            public_phone_number: '601234567',
        });
        assert.equal(profile.businessPhoneNumber, '381 601234567');
    });

    it('survives a nearly empty user object', () => {
        const profile = mapProfile({ username: 'prazan' });

        assert.equal(profile.username, 'prazan');
        assert.equal(profile.followersCount, null);
        assert.equal(profile.businessEmail, null);
        assert.equal(profile.verified, false);
        assert.deepEqual(profile.bioLinks, []);
    });

    it('normalises empty strings to null', () => {
        const profile = mapProfile({ username: 'x', full_name: '', biography: '', external_url: '' });

        assert.equal(profile.fullName, null);
        assert.equal(profile.biography, null);
        assert.equal(profile.externalUrl, null);
    });
});

describe('explainFailure', () => {
    it('distinguishes a block from a bad username', () => {
        assert.match(explainFailure('rate-limited'), /rate-limited this IP/);
        assert.match(explainFailure('not-found'), /No such profile/);
        assert.match(explainFailure('not-json'), /sessionCookie/);
    });

    it('has a fallback for unknown reasons', () => {
        assert.match(explainFailure('http-503'), /Unexpected response \(http-503\)/);
    });
});
