import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { handleFromTitle, handlesFromText } from '../src/paste.js';

describe('handleFromTitle', () => {
    it('reads the handle out of the parenthesised form', () => {
        assert.equal(handleFromTitle('Ana Kay (@anakayfit) • Instagram photos and videos'), 'anakayfit');
    });

    it('reads the handle out of the separator form a search export writes', () => {
        assert.equal(handleFromTitle('Instagram · built_different_coaching'), 'built_different_coaching');
    });

    it('survives a file read with the wrong code page', () => {
        // What Excel shows for `Instagram · ana` when a UTF-8 export is opened
        // as a Chinese code page. The separator is mangled, the handle is not.
        assert.equal(handleFromTitle('Instagram聽路聽alejandrablanc_'), 'alejandrablanc_');
    });

    it('does not mistake a caption for a handle', () => {
        assert.equal(handleFromTitle('Ana on Instagram: "new drop today"'), null);
    });

    it('does not mistake an Instagram feature for a handle', () => {
        assert.equal(handleFromTitle('Instagram Reels'), null);
        assert.equal(handleFromTitle('Instagram photos'), null);
    });

    it('returns null for an empty or absent title', () => {
        assert.equal(handleFromTitle(''), null);
        assert.equal(handleFromTitle(undefined), null);
    });
});

describe('handlesFromText', () => {
    it('reads a plain list of profile URLs', () => {
        const text = [
            'https://www.instagram.com/alejandrablanc_/',
            'https://www.instagram.com/young_arson/',
        ].join('\n');

        assert.deepEqual(handlesFromText(text), ['alejandrablanc_', 'young_arson']);
    });

    it('recovers the handle from the title when the URL is a post or a reel', () => {
        // The row that URL-only input silently drops.
        const text = [
            'url,title,description',
            'https://www.instagram.com/reel/Dbd5W7ECR1q/,Instagram · karolinakowalkiewicz,690 likes',
            'https://www.instagram.com/p/Dbd8yRrte3b/,Instagram · missamericaut,20 likes',
        ].join('\n');

        assert.deepEqual(handlesFromText(text), ['karolinakowalkiewicz', 'missamericaut']);
    });

    it('reads a real search export: profile rows, post rows and quoted commas', () => {
        const text = [
            'https://www.instagram.com/alejandrablanc_/,Instagram · alejandrablanc_,"Plus de 2,5 k abonnés"',
            'https://www.instagram.com/reel/Dbd5W7ECR1q/,Instagram · karolinakowalkiewicz,"Plus de 690 ""J\'aime"", il y a 21 heures"',
            'https://www.instagram.com/built_different_coaching/,Instagram · built_different_coaching,"Plus de 3,7 k abonnés"',
        ].join('\n');

        assert.deepEqual(handlesFromText(text), [
            'alejandrablanc_',
            'karolinakowalkiewicz',
            'built_different_coaching',
        ]);
    });

    it('de-duplicates the repeats an export always has', () => {
        const text = [
            'https://www.instagram.com/reel/DbgDo1uRNUF/,Instagram · brentleon_',
            'https://www.instagram.com/reel/DbgCejzxxaE/,Instagram · brentleon_',
            'https://www.instagram.com/brentleon_/,Instagram · brentleon_',
        ].join('\n');

        assert.deepEqual(handlesFromText(text), ['brentleon_']);
    });

    it('accepts bare handles when the list holds no URLs', () => {
        assert.deepEqual(handlesFromText('natgeo\n@nike\nadidas'), ['natgeo', 'nike', 'adidas']);
    });

    it('ignores a header row in a bare list', () => {
        assert.deepEqual(handlesFromText('username\nnatgeo'), ['natgeo']);
    });

    it('does not read a header row as a handle when the list holds URLs', () => {
        const text = 'username,url\nnatgeo,https://www.instagram.com/natgeo/';
        assert.deepEqual(handlesFromText(text), ['natgeo']);
    });

    it('accepts URLs with no scheme', () => {
        assert.deepEqual(handlesFromText('instagram.com/natgeo\nwww.instagram.com/nike/'), ['natgeo', 'nike']);
    });

    it('accepts several URLs on one line', () => {
        assert.deepEqual(
            handlesFromText('https://www.instagram.com/natgeo/ https://www.instagram.com/nike/'),
            ['natgeo', 'nike'],
        );
    });

    it('is empty for empty input', () => {
        assert.deepEqual(handlesFromText(''), []);
        assert.deepEqual(handlesFromText(undefined), []);
    });

    it('drops a post row that has no title to fall back on', () => {
        assert.deepEqual(handlesFromText('https://www.instagram.com/reel/Dbd5W7ECR1q/'), []);
    });
});
