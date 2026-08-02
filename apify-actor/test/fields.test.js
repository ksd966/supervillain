import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as cheerio from 'cheerio';

import { extractFields, normalizeFieldDefinitions } from '../src/fields.js';

const HTML = `
    <html>
        <head><meta name="description" content="Opis stranice"></head>
        <body>
            <h1>  Naslov   stranice </h1>
            <a class="link" href="/kontakt">Kontakt</a>
            <ul><li class="tag">jedan</li><li class="tag">dva</li></ul>
            <div class="price">1.299 RSD</div>
        </body>
    </html>`;

const run = (definitions) => extractFields({
    $: cheerio.load(HTML),
    fields: normalizeFieldDefinitions(definitions),
    baseUrl: 'https://firma.rs/proizvodi/',
});

describe('normalizeFieldDefinitions', () => {
    it('accepts the object shorthand', () => {
        assert.deepEqual(normalizeFieldDefinitions({ naslov: 'h1' }), [
            { name: 'naslov', selector: 'h1', type: 'text', attr: null, multiple: false },
        ]);
    });

    it('accepts bare selector strings and names them positionally', () => {
        assert.equal(normalizeFieldDefinitions(['h1'])[0].name, 'field_1');
    });

    it('falls back to text for an unknown type and skips entries without a selector', () => {
        const fields = normalizeFieldDefinitions([
            { name: 'a', selector: 'h1', type: 'nonsense' },
            { name: 'b' },
        ]);
        assert.equal(fields.length, 1);
        assert.equal(fields[0].type, 'text');
    });
});

describe('extractFields', () => {
    it('collapses whitespace in text', () => {
        assert.deepEqual(run([{ name: 'naslov', selector: 'h1' }]), { naslov: 'Naslov stranice' });
    });

    it('reads attributes and resolves relative URLs', () => {
        assert.deepEqual(
            run([{ name: 'link', selector: '.link', type: 'attr', attr: 'href' }]),
            { link: 'https://firma.rs/kontakt' },
        );
    });

    it('leaves non-URL attributes untouched', () => {
        assert.deepEqual(
            run([{ name: 'opis', selector: 'meta[name=description]', type: 'attr', attr: 'content' }]),
            { opis: 'Opis stranice' },
        );
    });

    it('returns every match when multiple is set', () => {
        assert.deepEqual(run([{ name: 'tagovi', selector: '.tag', multiple: true }]), { tagovi: ['jedan', 'dva'] });
    });

    it('supports exists and count', () => {
        assert.deepEqual(
            run([
                { name: 'imaCenu', selector: '.price', type: 'exists' },
                { name: 'nemaGaleriju', selector: '.gallery', type: 'exists' },
                { name: 'brojTagova', selector: '.tag', type: 'count' },
            ]),
            { imaCenu: true, nemaGaleriju: false, brojTagova: 2 },
        );
    });

    it('yields null for a missing element instead of throwing', () => {
        assert.deepEqual(run([{ name: 'nema', selector: '.does-not-exist' }]), { nema: null });
    });

    it('survives an invalid selector', () => {
        assert.deepEqual(run([{ name: 'lose', selector: ':::' }]), { lose: null });
    });
});
