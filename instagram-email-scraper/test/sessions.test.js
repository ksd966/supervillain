import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSessionPool, normaliseCookie, normaliseCookies } from '../src/sessions.js';

const MINUTE = 60_000;

describe('normaliseCookie', () => {
    it('keeps a bare value as it is', () => {
        assert.equal(normaliseCookie('  12345%3Aabcdef  '), '12345%3Aabcdef');
    });

    it('strips a sessionid= prefix', () => {
        assert.equal(normaliseCookie('sessionid=12345%3Aabcdef'), '12345%3Aabcdef');
        assert.equal(normaliseCookie('SessionId = 12345'), '12345');
    });

    it('strips a whole copied cookie header', () => {
        assert.equal(normaliseCookie('Cookie: sessionid=12345%3Aabc; ds_user_id=99'), '12345%3Aabc');
    });

    it('is empty for nothing', () => {
        assert.equal(normaliseCookie(''), '');
        assert.equal(normaliseCookie(undefined), '');
    });
});

describe('normaliseCookies', () => {
    it('drops blanks and repeats, keeping order', () => {
        assert.deepEqual(normaliseCookies(['a', '', 'sessionid=b', 'a', '  ']), ['a', 'b']);
    });
});

describe('createSessionPool', () => {
    it('is one logged-out session when given nothing', () => {
        const pool = createSessionPool([]);

        assert.equal(pool.size, 1);
        assert.equal(pool.loggedIn, false);
        assert.equal(pool.acquire(0).cookie, '');
    });

    it('spreads work over the sessions instead of draining the first', () => {
        const pool = createSessionPool(['a', 'b', 'c']);

        const picked = [];
        for (let i = 0; i < 6; i++) {
            const session = pool.acquire(0);
            picked.push(session.cookie);
            pool.succeed(session);
        }

        assert.deepEqual(picked, ['a', 'b', 'c', 'a', 'b', 'c']);
    });

    it('hands out another session the moment one is blocked', () => {
        const pool = createSessionPool(['a', 'b'], { backoffMs: 30 * MINUTE });

        const first = pool.acquire(0);
        pool.block(first, 0);

        const second = pool.acquire(0);
        assert.notEqual(second.cookie, first.cookie);
        assert.equal(pool.available(0).length, 1);
    });

    it('reports nothing available once every session is blocked', () => {
        const pool = createSessionPool(['a', 'b'], { backoffMs: 30 * MINUTE });

        pool.block(pool.acquire(0), 0);
        pool.block(pool.acquire(0), 5 * MINUTE);

        assert.equal(pool.acquire(6 * MINUTE), null);
        // The first one blocked is the first one back.
        assert.equal(pool.nextAvailableAt(6 * MINUTE), 30 * MINUTE);
    });

    it('lets a session back in when its backoff has passed', () => {
        const pool = createSessionPool(['a'], { backoffMs: 30 * MINUTE });

        pool.block(pool.acquire(0), 0);

        assert.equal(pool.acquire(29 * MINUTE), null);
        assert.equal(pool.acquire(30 * MINUTE).cookie, 'a');
    });

    it('says now is fine when something is already free', () => {
        const pool = createSessionPool(['a', 'b'], { backoffMs: 30 * MINUTE });
        pool.block(pool.acquire(0), 0);

        assert.equal(pool.nextAvailableAt(0), 0);
    });

    it('never puts a cookie in the summary', () => {
        const pool = createSessionPool(['supersecretcookie', 'b']);
        const session = pool.acquire(0);
        pool.succeed(session);
        pool.block(session, 0);

        const summary = pool.summary();
        assert.ok(!summary.includes('supersecretcookie'), summary);
        assert.match(summary, /sesija 1\/2: 1 profila, 1× blokirana/);
    });

    it('treats repeated cookies as one session', () => {
        assert.equal(createSessionPool(['a', 'a', 'a']).size, 1);
    });
});
