import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { instagramHandleFromUrl, instagramHandlesFromHtml } from '../src/social.js';

describe('instagramHandleFromUrl', () => {
    it('pulls the handle out of the usual link shapes', () => {
        assert.equal(instagramHandleFromUrl('https://www.instagram.com/salon_ana/'), 'salon_ana');
        assert.equal(instagramHandleFromUrl('https://instagram.com/Salon.Ana'), 'salon.ana');
        assert.equal(instagramHandleFromUrl('http://instagram.com/salon_ana?igshid=abc'), 'salon_ana');
        assert.equal(instagramHandleFromUrl('//www.instagram.com/salon_ana/'), 'salon_ana');
    });

    it('ignores posts, reels and other features', () => {
        for (const url of [
            'https://www.instagram.com/p/Cabc123/',
            'https://www.instagram.com/reel/Cabc123/',
            'https://www.instagram.com/explore/tags/beograd/',
            'https://www.instagram.com/stories/salon_ana/',
            'https://www.instagram.com/accounts/login/',
            'https://www.instagram.com/',
        ]) {
            assert.equal(instagramHandleFromUrl(url), null, `${url} should not yield a handle`);
        }
    });

    it('rejects lookalike hosts', () => {
        assert.equal(instagramHandleFromUrl('https://instagram.com.evil.rs/salon/'), null);
        assert.equal(instagramHandleFromUrl('https://notinstagram.com/salon/'), null);
        assert.equal(instagramHandleFromUrl('https://facebook.com/salon/'), null);
    });

    it('accepts subdomains Instagram actually uses', () => {
        assert.equal(instagramHandleFromUrl('https://l.instagram.com/salon_ana/'), 'salon_ana');
    });

    it('rejects handles that break the character or length rules', () => {
        assert.equal(instagramHandleFromUrl('https://instagram.com/ime%20sa%20razmakom/'), null);
        assert.equal(instagramHandleFromUrl(`https://instagram.com/${'a'.repeat(31)}/`), null);
        assert.equal(instagramHandleFromUrl('https://instagram.com/.../'), null);
        assert.equal(instagramHandleFromUrl('https://instagram.com/.skriveno/'), null);
    });

    it('does not throw on junk', () => {
        for (const value of ['nije url', '', null, undefined, 'javascript:alert(1)']) {
            assert.equal(instagramHandleFromUrl(value), null);
        }
    });
});

describe('instagramHandlesFromHtml', () => {
    it('finds handles in hrefs, JSON-LD and inline scripts alike', () => {
        const html = `
            <a href="https://www.instagram.com/salon_ana/">IG</a>
            <script type="application/ld+json">{"sameAs":["https://instagram.com/ana_nails"]}</script>
            <div data-social="https://www.instagram.com/treci.profil?hl=sr"></div>`;

        assert.deepEqual(instagramHandlesFromHtml(html), ['ana_nails', 'salon_ana', 'treci.profil']);
    });

    it('de-duplicates across different link shapes', () => {
        const html = `
            <a href="https://instagram.com/salon_ana">a</a>
            <a href="https://www.instagram.com/Salon_Ana/">b</a>`;

        assert.deepEqual(instagramHandlesFromHtml(html), ['salon_ana']);
    });

    it('skips post and explore links mixed in with profile links', () => {
        const html = `
            <a href="https://www.instagram.com/salon_ana/">profil</a>
            <a href="https://www.instagram.com/p/Cxyz/">objava</a>
            <a href="https://www.instagram.com/explore/tags/frizer/">tag</a>`;

        assert.deepEqual(instagramHandlesFromHtml(html), ['salon_ana']);
    });

    it('returns nothing for markup with no Instagram links', () => {
        assert.deepEqual(instagramHandlesFromHtml('<a href="https://firma.rs">sajt</a>'), []);
        assert.deepEqual(instagramHandlesFromHtml(''), []);
        assert.deepEqual(instagramHandlesFromHtml(null), []);
    });
});
