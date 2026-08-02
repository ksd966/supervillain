import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parsePlacePanel, searchUrl } from '../src/googleMaps.js';

/**
 * Mirrors the parts of a Maps place panel the extractor targets. The real DOM
 * is far larger and its class names are obfuscated, which is exactly why the
 * selectors key off `data-item-id` and ARIA attributes instead.
 */
const PANEL = `
<html><body>
  <div role="main">
    <h1 class="DUwDvf">Frizerski salon Ana</h1>
    <div class="F7nice"><span>4,8</span><span>(126)</span></div>
    <button jsaction="pane.rating.category">Frizerski salon</button>
    <a data-item-id="authority" href="https://salonana.rs/">salonana.rs</a>
    <button data-item-id="address" aria-label="Adresa: Zmaj Jovina 12, Novi Sad">Zmaj Jovina 12</button>
    <button data-item-id="phone:tel:+381211234567" aria-label="Telefon: 021 123 4567">021 123 4567</button>
  </div>
</body></html>`;

describe('parsePlacePanel', () => {
    it('pulls every field out of a full panel', () => {
        const lead = parsePlacePanel(PANEL, { url: 'https://www.google.com/maps/place/x' });

        assert.equal(lead.source, 'google-maps');
        assert.equal(lead.name, 'Frizerski salon Ana');
        assert.equal(lead.category, 'Frizerski salon');
        assert.equal(lead.website, 'https://salonana.rs/');
        assert.equal(lead.address, 'Zmaj Jovina 12, Novi Sad');
        assert.equal(lead.googleMapsUrl, 'https://www.google.com/maps/place/x');
    });

    it('reads the phone number from the attribute, not the localised label', () => {
        assert.equal(parsePlacePanel(PANEL).phone, '+381211234567');
    });

    it('parses a comma decimal rating and the review count', () => {
        const lead = parsePlacePanel(PANEL);

        assert.equal(lead.rating, 4.8);
        assert.equal(lead.reviewsCount, 126);
    });

    it('handles a dot decimal rating and a thousands separator', () => {
        const lead = parsePlacePanel(`
            <html><body><h1>Teretana</h1><div class="F7nice"><span>4.5</span><span>(1.204)</span></div></body></html>`);

        assert.equal(lead.rating, 4.5);
        assert.equal(lead.reviewsCount, 1204);
    });

    it('returns nulls rather than throwing on a bare panel', () => {
        const lead = parsePlacePanel('<html><body><h1>Samo ime</h1></body></html>');

        assert.equal(lead.name, 'Samo ime');
        assert.equal(lead.website, null);
        assert.equal(lead.phone, null);
        assert.equal(lead.address, null);
        assert.equal(lead.rating, null);
        assert.equal(lead.reviewsCount, null);
    });

    it('returns null when there is no business name at all', () => {
        assert.equal(parsePlacePanel('<html><body><div>nothing</div></body></html>'), null);
        assert.equal(parsePlacePanel(''), null);
    });

    it('starts leads with empty contact arrays for the enrichment step to fill', () => {
        const lead = parsePlacePanel(PANEL);

        assert.deepEqual(lead.emails, []);
        assert.deepEqual(lead.instagramHandles, []);
    });

    it('accepts overridden selectors so a layout change is a config fix', () => {
        const html = '<html><body><span class="new-name">Pekara Mika</span>'
            + '<a class="new-site" href="https://pekaramika.rs/">sajt</a></body></html>';

        const lead = parsePlacePanel(html, {
            selectors: { name: '.new-name', website: '.new-site' },
        });

        assert.equal(lead.name, 'Pekara Mika');
        assert.equal(lead.website, 'https://pekaramika.rs/');
    });

    it('falls back to the address button text when the aria-label is missing', () => {
        const html = '<html><body><h1>X</h1><button data-item-id="address">Bulevar 1</button></body></html>';

        assert.equal(parsePlacePanel(html).address, 'Bulevar 1');
    });
});

describe('searchUrl', () => {
    it('encodes the query and the language', () => {
        assert.equal(
            searchUrl('frizerski salon Novi Sad'),
            'https://www.google.com/maps/search/frizerski%20salon%20Novi%20Sad?hl=sr',
        );
    });

    it('honours a different language code', () => {
        assert.match(searchUrl('gym Belgrade', 'en'), /\?hl=en$/);
    });
});
