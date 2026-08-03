import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findRecords, parseAny, parseDelimited, sniffDelimiter, tableToRecords } from '../src/parse.js';

describe('sniffDelimiter', () => {
    it('picks the delimiter that actually separates fields', () => {
        assert.equal(sniffDelimiter('a,b,c\n1,2,3'), ',');
        assert.equal(sniffDelimiter('a;b;c\n1;2;3'), ';');
        assert.equal(sniffDelimiter('a\tb\tc\n1\t2\t3'), '\t');
        assert.equal(sniffDelimiter('a|b|c\n1|2|3'), '|');
    });

    it('ignores delimiters inside quoted cells', () => {
        // Semicolon-delimited, but every cell is full of commas.
        const text = 'name;city\n"Smith, John";"Austin, TX"\n"Doe, Jane";"Dallas, TX"';
        assert.equal(sniffDelimiter(text), ';');
    });

    it('falls back to a comma for a single column', () => {
        assert.equal(sniffDelimiter('email\na@b.com'), ',');
    });
});

describe('parseDelimited', () => {
    it('handles quoted fields with commas and escaped quotes', () => {
        const rows = parseDelimited('name,note\n"Smith, John","he said ""hi"""');

        assert.deepEqual(rows, [['name', 'note'], ['Smith, John', 'he said "hi"']]);
    });

    it('handles newlines inside quoted fields', () => {
        const rows = parseDelimited('name,address\n"Ana","123 Main St\nAustin, TX"');

        assert.equal(rows.length, 2);
        assert.equal(rows[1][1], '123 Main St\nAustin, TX');
    });

    it('handles CRLF and a UTF-8 BOM', () => {
        const rows = parseDelimited('﻿name,email\r\nAna,a@b.com\r\n');

        assert.deepEqual(rows[0], ['name', 'email']);
        assert.deepEqual(rows[1], ['Ana', 'a@b.com']);
    });

    it('keeps empty cells inside a row but drops blank lines', () => {
        const rows = parseDelimited('a,b,c\n1,,3\n\n\n4,5,6');

        assert.deepEqual(rows, [['a', 'b', 'c'], ['1', '', '3'], ['4', '5', '6']]);
    });
});

describe('findRecords', () => {
    it('takes a bare array of objects', () => {
        assert.deepEqual(findRecords([{ a: 1 }, { a: 2 }]), [{ a: 1 }, { a: 2 }]);
    });

    it('digs the records out of a wrapper', () => {
        assert.deepEqual(findRecords({ status: 'ok', data: [{ a: 1 }] }), [{ a: 1 }]);
        assert.deepEqual(findRecords({ result: { items: { leads: [{ a: 1 }, { a: 2 }] } } }).length, 2);
    });

    it('prefers the largest array of objects', () => {
        const payload = { meta: [{ x: 1 }], rows: [{ a: 1 }, { a: 2 }, { a: 3 }] };

        assert.equal(findRecords(payload).length, 3);
    });

    it('treats a lone object as one record', () => {
        assert.deepEqual(findRecords({ name: 'Ana', email: 'a@b.com' }), [{ name: 'Ana', email: 'a@b.com' }]);
    });

    it('returns nothing for junk', () => {
        assert.deepEqual(findRecords(null), []);
        assert.deepEqual(findRecords('a string'), []);
        assert.deepEqual(findRecords([1, 2, 3]), []);
    });
});

describe('tableToRecords', () => {
    it('uses the first row as headers', () => {
        const { headers, records } = tableToRecords([['name', 'email'], ['Ana', 'a@b.com']]);

        assert.deepEqual(headers, ['name', 'email']);
        assert.deepEqual(records, [{ name: 'Ana', email: 'a@b.com' }]);
    });

    it('names blank headers positionally', () => {
        const { headers } = tableToRecords([['name', '', 'email']]);

        assert.deepEqual(headers, ['name', 'column_2', 'email']);
    });

    it('pads rows shorter than the header', () => {
        const { records } = tableToRecords([['a', 'b', 'c'], ['1']]);

        assert.deepEqual(records, [{ a: '1', b: '', c: '' }]);
    });
});

describe('parseAny', () => {
    it('detects CSV', () => {
        const result = parseAny('name,email\nAna,a@b.com');

        assert.equal(result.format, 'csv');
        assert.deepEqual(result.records, [{ name: 'Ana', email: 'a@b.com' }]);
    });

    it('detects JSON, including a wrapped payload', () => {
        const result = parseAny('{"data":[{"name":"Ana","email":"a@b.com"}]}');

        assert.equal(result.format, 'json');
        assert.equal(result.records.length, 1);
        assert.deepEqual(result.headers, ['name', 'email']);
    });

    it('detects JSONL', () => {
        const result = parseAny('{"name":"Ana"}\n{"name":"Bob"}');

        assert.equal(result.format, 'jsonl');
        assert.equal(result.records.length, 2);
    });

    it('honours an explicit format over the sniffer', () => {
        const result = parseAny('a\tb\n1\t2', { format: 'tsv' });

        assert.deepEqual(result.records, [{ a: '1', b: '2' }]);
    });

    it('reports empty input rather than throwing', () => {
        assert.deepEqual(parseAny('').records, []);
        assert.equal(parseAny('   ').format, 'empty');
        assert.deepEqual(parseAny(null).records, []);
    });

    it('collects headers across records with different keys', () => {
        const result = parseAny('[{"a":1},{"b":2}]');

        assert.deepEqual(result.headers.sort(), ['a', 'b']);
    });
});
