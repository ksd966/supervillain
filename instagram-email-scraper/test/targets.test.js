import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveTargets, usernameFromUrl } from '../src/targets.js';

describe('usernameFromUrl', () => {
    it('pulls the handle out of a profile URL', () => {
        assert.equal(usernameFromUrl('https://www.instagram.com/nike/'), 'nike');
        assert.equal(usernameFromUrl('https://instagram.com/nike'), 'nike');
        assert.equal(usernameFromUrl('https://www.instagram.com/nike/?hl=en'), 'nike');
    });

    it('rejects post, reel and feature URLs', () => {
        assert.equal(usernameFromUrl('https://www.instagram.com/p/Cabc123/'), null);
        assert.equal(usernameFromUrl('https://www.instagram.com/reel/Cabc123/'), null);
        assert.equal(usernameFromUrl('https://www.instagram.com/explore/tags/beograd/'), null);
        assert.equal(usernameFromUrl('https://www.instagram.com/'), null);
    });

    it('rejects other hosts and malformed input', () => {
        assert.equal(usernameFromUrl('https://instagram.com.evil.rs/nike/'), null);
        assert.equal(usernameFromUrl('https://facebook.com/nike/'), null);
        assert.equal(usernameFromUrl('not a url'), null);
    });
});

describe('resolveTargets', () => {
    it('strips @ and whitespace', () => {
        assert.deepEqual(resolveTargets({ usernames: ['  @nike ', 'adidas'] }), ['nike', 'adidas']);
    });

    it('accepts URLs in the usernames list too', () => {
        assert.deepEqual(resolveTargets({ usernames: ['https://www.instagram.com/puma/'] }), ['puma']);
    });

    it('merges both inputs and de-duplicates while keeping order', () => {
        assert.deepEqual(
            resolveTargets({
                usernames: ['nike', '@adidas'],
                directUrls: ['https://www.instagram.com/nike/', 'https://www.instagram.com/puma/'],
            }),
            ['nike', 'adidas', 'puma'],
        );
    });

    it('handles the object forms the Apify editors emit', () => {
        assert.deepEqual(
            resolveTargets({
                usernames: [{ username: 'nike' }],
                directUrls: [{ url: 'https://www.instagram.com/puma/' }],
            }),
            ['nike', 'puma'],
        );
    });

    it('drops entries that resolve to nothing', () => {
        assert.deepEqual(resolveTargets({ usernames: ['', '   '], directUrls: ['https://example.com/nike'] }), []);
    });

    it('returns an empty list for empty input', () => {
        assert.deepEqual(resolveTargets(), []);
        assert.deepEqual(resolveTargets({}), []);
    });
});
