import assert from 'node:assert/strict';
import http from 'node:http';
import { describe, it } from 'node:test';

import { mapElement, runOverpassQuery } from '../src/overpass.js';

describe('mapElement', () => {
    it('flattens a fully tagged node', () => {
        const lead = mapElement({
            type: 'node',
            id: 42,
            lat: 45.25,
            lon: 19.83,
            tags: {
                name: 'Frizerski salon Ana',
                shop: 'hairdresser',
                'addr:street': 'Zmaj Jovina',
                'addr:housenumber': '12',
                'addr:city': 'Novi Sad',
                'addr:postcode': '21000',
                website: 'https://salonana.rs',
                phone: '+381211234567',
                email: 'Kontakt@SalonAna.rs',
                'contact:instagram': 'salon_ana',
            },
        });

        assert.equal(lead.source, 'openstreetmap');
        assert.equal(lead.sourceId, 'node/42');
        assert.equal(lead.name, 'Frizerski salon Ana');
        assert.equal(lead.category, 'shop=hairdresser');
        assert.equal(lead.address, 'Zmaj Jovina 12, 21000, Novi Sad');
        assert.equal(lead.website, 'https://salonana.rs');
        assert.equal(lead.phone, '+381211234567');
        assert.deepEqual(lead.emails, ['kontakt@salonana.rs']);
        assert.deepEqual(lead.instagramHandles, ['salon_ana']);
        assert.equal(lead.latitude, 45.25);
        assert.equal(lead.openStreetMapUrl, 'https://www.openstreetmap.org/node/42');
    });

    it('takes coordinates from center on ways and relations', () => {
        const lead = mapElement({ type: 'way', id: 7, center: { lat: 44.8, lon: 20.4 }, tags: { name: 'Teretana' } });

        assert.equal(lead.latitude, 44.8);
        assert.equal(lead.longitude, 20.4);
    });

    it('prefers contact: variants when the plain tags are absent', () => {
        const lead = mapElement({
            type: 'node',
            id: 1,
            tags: {
                name: 'Kafić Luna',
                'contact:website': 'https://kaficluna.rs',
                'contact:phone': '+381600000000',
                'contact:email': 'info@kaficluna.rs',
            },
        });

        assert.equal(lead.website, 'https://kaficluna.rs');
        assert.equal(lead.phone, '+381600000000');
        assert.deepEqual(lead.emails, ['info@kaficluna.rs']);
    });

    it('drops elements with no name', () => {
        assert.equal(mapElement({ type: 'node', id: 1, tags: { shop: 'bakery' } }), null);
        assert.equal(mapElement({}), null);
        assert.equal(mapElement(null), null);
    });

    it('leaves missing contact details null rather than undefined', () => {
        const lead = mapElement({ type: 'node', id: 2, tags: { name: 'Pekara' } });

        assert.equal(lead.website, null);
        assert.equal(lead.phone, null);
        assert.equal(lead.address, null);
        assert.deepEqual(lead.emails, []);
    });
});

/**
 * @param {(req: http.IncomingMessage, res: http.ServerResponse) => void} handler
 * @param {(base: string) => Promise<void>} run
 */
async function withServer(handler, run) {
    const server = http.createServer(handler);
    await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
    try {
        await run(`http://127.0.0.1:${server.address().port}/api/interpreter`);
    } finally {
        await new Promise((resolve) => { server.close(resolve); });
    }
}

describe('runOverpassQuery', () => {
    it('posts the query and maps the elements', async () => {
        let receivedBody = '';

        await withServer(
            (req, res) => {
                const chunks = [];
                req.on('data', (chunk) => chunks.push(chunk));
                req.on('end', () => {
                    receivedBody = Buffer.concat(chunks).toString();
                    res.writeHead(200, { 'content-type': 'application/json' });
                    res.end(JSON.stringify({
                        elements: [
                            { type: 'node', id: 1, tags: { name: 'Salon A', shop: 'hairdresser' } },
                            { type: 'node', id: 2, tags: { shop: 'hairdresser' } },
                        ],
                    }));
                });
            },
            async (endpoint) => {
                const { ok, leads } = await runOverpassQuery('out center tags;', { endpoints: [endpoint] });

                assert.equal(ok, true);
                assert.equal(leads.length, 1, 'the unnamed element should be dropped');
                assert.equal(leads[0].name, 'Salon A');
                assert.match(receivedBody, /^data=/);
                assert.match(decodeURIComponent(receivedBody), /out center tags;/);
            },
        );
    });

    it('falls through to the next endpoint when one is busy', async () => {
        await withServer(
            (_req, res) => { res.writeHead(429); res.end('slow down'); },
            async (busyEndpoint) => {
                await withServer(
                    (_req, res) => {
                        res.writeHead(200, { 'content-type': 'application/json' });
                        res.end(JSON.stringify({ elements: [{ type: 'node', id: 3, tags: { name: 'Rezerva' } }] }));
                    },
                    async (goodEndpoint) => {
                        const notices = [];
                        const { ok, leads } = await runOverpassQuery('q', {
                            endpoints: [busyEndpoint, goodEndpoint],
                            onNotice: (message) => notices.push(message),
                        });

                        assert.equal(ok, true);
                        assert.equal(leads[0].name, 'Rezerva');
                        assert.match(notices.join('\n'), /busy \(429\)/);
                    },
                );
            },
        );
    });

    it('reports failure when every endpoint is exhausted', async () => {
        await withServer(
            (_req, res) => { res.writeHead(504); res.end(''); },
            async (endpoint) => {
                const { ok, leads, reason } = await runOverpassQuery('q', { endpoints: [endpoint, endpoint] });

                assert.equal(ok, false);
                assert.deepEqual(leads, []);
                assert.equal(reason, 'busy-504');
            },
        );
    });

    it('treats a non-JSON body as a failure, not a crash', async () => {
        await withServer(
            (_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>syntax error</html>'); },
            async (endpoint) => {
                const { ok, reason } = await runOverpassQuery('bad query', { endpoints: [endpoint] });

                assert.equal(ok, false);
                assert.equal(reason, 'not-json');
            },
        );
    });

    it('survives an unreachable endpoint', async () => {
        const { ok, reason } = await runOverpassQuery('q', {
            endpoints: ['http://127.0.0.1:1/api/interpreter'],
            timeoutSecs: 2,
        });

        assert.equal(ok, false);
        assert.match(reason, /request-failed|http-/);
    });
});
