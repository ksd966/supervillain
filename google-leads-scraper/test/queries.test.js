import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildOverpassQuery, buildQueries, osmTagsForNiche } from '../src/queries.js';

describe('buildQueries', () => {
    it('joins niche and city', () => {
        assert.deepEqual(buildQueries({ niche: 'frizerski salon', city: 'Novi Sad' }), ['frizerski salon Novi Sad']);
    });

    it('fans out over several cities', () => {
        assert.deepEqual(buildQueries({ niche: 'teretana', city: ['Beograd', 'Niš'] }), [
            'teretana Beograd',
            'teretana Niš',
        ]);
    });

    it('lets explicit queries win over niche and city', () => {
        assert.deepEqual(
            buildQueries({ niche: 'ignored', city: 'ignored', queries: ['tattoo studio Zemun'] }),
            ['tattoo studio Zemun'],
        );
    });

    it('falls back to the bare niche when no city is given', () => {
        assert.deepEqual(buildQueries({ niche: 'zubar' }), ['zubar']);
    });

    it('de-duplicates and trims', () => {
        assert.deepEqual(buildQueries({ niche: ' kafić ', city: ['Beograd', ' Beograd '] }), ['kafić Beograd']);
    });

    it('returns nothing when there is nothing to search for', () => {
        assert.deepEqual(buildQueries(), []);
        assert.deepEqual(buildQueries({ niche: '   ' }), []);
    });
});

describe('osmTagsForNiche', () => {
    it('maps Serbian and English niche names', () => {
        assert.deepEqual(osmTagsForNiche('frizerski salon'), ['shop=hairdresser']);
        assert.deepEqual(osmTagsForNiche('Teretana'), ['leisure=fitness_centre']);
        assert.deepEqual(osmTagsForNiche('dentist'), ['amenity=dentist']);
    });

    it('handles diacritics and plurals', () => {
        assert.deepEqual(osmTagsForNiche('kafić'), ['amenity=cafe']);
        assert.deepEqual(osmTagsForNiche('restorani'), ['amenity=restaurant']);
    });

    it('passes a raw OSM tag straight through', () => {
        assert.deepEqual(osmTagsForNiche('shop=greengrocer'), ['shop=greengrocer']);
    });

    it('returns nothing for an unmapped niche', () => {
        assert.deepEqual(osmTagsForNiche('proizvodnja svemirskih brodova'), []);
        assert.deepEqual(osmTagsForNiche(''), []);
    });

    it('can map one niche to several tags', () => {
        assert.deepEqual(osmTagsForNiche('barber'), ['shop=hairdresser', 'shop=beauty']);
    });
});

describe('buildOverpassQuery', () => {
    it('builds a query scoped to the city boundary', () => {
        const query = buildOverpassQuery({ city: 'Novi Sad', tags: ['shop=hairdresser'] });

        assert.match(query, /\[out:json\]\[timeout:90\];/);
        assert.match(query, /area\["name"="Novi Sad"\]\["boundary"="administrative"\]->\.searchArea;/);
        assert.match(query, /nwr\["shop"="hairdresser"\]\(area\.searchArea\);/);
        assert.match(query, /out center tags;/);
    });

    it('includes one filter line per tag', () => {
        const query = buildOverpassQuery({ city: 'Beograd', tags: ['shop=hairdresser', 'shop=beauty'] });

        assert.match(query, /nwr\["shop"="hairdresser"\]/);
        assert.match(query, /nwr\["shop"="beauty"\]/);
    });

    it('escapes quotes in the city name', () => {
        const query = buildOverpassQuery({ city: 'Ba"d', tags: ['shop=bakery'] });

        assert.match(query, /area\["name"="Ba\\"d"\]/);
    });

    it('refuses to build a query with nothing to filter on', () => {
        assert.throws(() => buildOverpassQuery({ city: '', tags: ['shop=bakery'] }), /city/);
        assert.throws(() => buildOverpassQuery({ city: 'Niš', tags: [] }), /tag filter/);
    });
});
