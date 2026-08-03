import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { explainSearchFailure, parseDuckDuckGo, parseGoogle } from '../src/serp.js';

const DDG_HTML = `
<div class="result results_links web-result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.instagram.com%2Fprimepixelit%2F&amp;rut=abc">
    Prime Pixel (@primepixelit) • Instagram
  </a>
  <a class="result__snippet">Digital marketing · primepixelit@gmail.com · DM for rates</a>
</div>
<div class="result results_links web-result">
  <a class="result__a" href="https://www.instagram.com/austinmedspa/">Austin Med Spa (@austinmedspa)</a>
  <a class="result__snippet">Med spa in Austin · info.austin@gmail.com</a>
</div>
<div class="result results_links">
  <span>an ad block with no link</span>
</div>`;

const GOOGLE_HTML = `
<div id="search">
  <div data-hveid="1">
    <a href="https://www.instagram.com/primepixelit/"><h3>Prime Pixel (@primepixelit)</h3></a>
    <div>Digital marketing · primepixelit@gmail.com</div>
  </div>
  <div data-hveid="2">
    <a href="/url?q=https://www.instagram.com/austinmedspa/&amp;sa=U"><h3>Austin Med Spa (@austinmedspa)</h3></a>
    <div>Med spa · info.austin@gmail.com</div>
  </div>
  <div data-hveid="3">
    <a href="https://www.instagram.com/primepixelit/"><h3>Duplicate of the first</h3></a>
    <div>same url twice</div>
  </div>
  <a href="/preferences"><h3>Settings link with no scheme</h3></a>
</div>`;

describe('parseDuckDuckGo', () => {
    it('unwraps the redirector and reads title and snippet', () => {
        const results = parseDuckDuckGo(DDG_HTML);

        assert.equal(results.length, 2);
        assert.equal(results[0].url, 'https://www.instagram.com/primepixelit/');
        assert.equal(results[0].title, 'Prime Pixel (@primepixelit) • Instagram');
        assert.match(results[0].snippet, /primepixelit@gmail\.com/);
    });

    it('accepts a direct link that is not wrapped', () => {
        assert.equal(parseDuckDuckGo(DDG_HTML)[1].url, 'https://www.instagram.com/austinmedspa/');
    });

    it('skips blocks with no result link', () => {
        assert.equal(parseDuckDuckGo(DDG_HTML).length, 2);
    });

    it('returns nothing for empty or junk input', () => {
        assert.deepEqual(parseDuckDuckGo(''), []);
        assert.deepEqual(parseDuckDuckGo(undefined), []);
        assert.deepEqual(parseDuckDuckGo('<html><body>nothing</body></html>'), []);
    });
});

describe('parseGoogle', () => {
    it('reads results shaped as a link wrapping an h3', () => {
        const results = parseGoogle(GOOGLE_HTML);

        assert.equal(results[0].url, 'https://www.instagram.com/primepixelit/');
        assert.equal(results[0].title, 'Prime Pixel (@primepixelit)');
        assert.match(results[0].snippet, /primepixelit@gmail\.com/);
    });

    it('unwraps the /url?q= form', () => {
        assert.equal(parseGoogle(GOOGLE_HTML)[1].url, 'https://www.instagram.com/austinmedspa/');
    });

    it('de-duplicates the same URL and skips relative links', () => {
        const results = parseGoogle(GOOGLE_HTML);

        assert.equal(results.length, 2, 'duplicate and settings link should both be dropped');
    });

    it('returns nothing for empty input', () => {
        assert.deepEqual(parseGoogle(''), []);
        assert.deepEqual(parseGoogle('<html><body>nothing</body></html>'), []);
    });
});

describe('explainSearchFailure', () => {
    it('points at the way out of a CAPTCHA', () => {
        const message = explainSearchFailure('captcha');

        assert.match(message, /CAPTCHA/);
        assert.match(message, /extension/, 'should name the option that actually works for free');
    });

    it('has a fallback for anything else', () => {
        assert.match(explainSearchFailure('http-503'), /Search failed \(http-503\)/);
    });
});
