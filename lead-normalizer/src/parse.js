/**
 * Reading whatever a third-party scraper spat out.
 *
 * Exports from browser extensions and SaaS tools are inconsistent in every way
 * that matters: comma or semicolon or tab, CRLF or LF, a BOM or not, JSON or
 * JSONL or an array nested under some wrapper key. Rather than ask the user
 * which it is, sniff it — getting this wrong is obvious immediately, and being
 * asked to classify your own file is a poor first impression.
 */

/**
 * Strips a UTF-8 BOM. Excel writes one on every CSV it saves, and left in place
 * it corrupts the first header name, which then fails to match anything.
 *
 * @param {string} text
 * @returns {string}
 */
function stripBom(text) {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Picks the delimiter by counting candidates outside quoted regions on the
 * first few lines. Counting inside quotes is what makes naive sniffers choose
 * a comma for a semicolon-delimited file full of "Smith, John" cells.
 *
 * @param {string} text
 * @returns {string}
 */
export function sniffDelimiter(text) {
    const sample = text.split(/\r?\n/).slice(0, 5).join('\n');
    const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };

    let inQuotes = false;
    for (let index = 0; index < sample.length; index++) {
        const char = sample[index];

        if (char === '"') {
            if (inQuotes && sample[index + 1] === '"') { index++; continue; }
            inQuotes = !inQuotes;
            continue;
        }
        if (!inQuotes && char in counts) counts[char] += 1;
    }

    return Object.entries(counts).sort(([, a], [, b]) => b - a)[0][1] > 0
        ? Object.entries(counts).sort(([, a], [, b]) => b - a)[0][0]
        : ',';
}

/**
 * A complete RFC 4180 reader: quoted fields, escaped quotes, embedded newlines
 * and commas. Worth doing properly — a split on `,` mangles exactly the rows
 * that matter, the ones with an address or a multi-value cell.
 *
 * @param {string} text
 * @param {string} [delimiter] sniffed when omitted
 * @returns {string[][]}
 */
export function parseDelimited(text, delimiter) {
    const source = stripBom(text);
    const sep = delimiter ?? sniffDelimiter(source);

    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let index = 0; index < source.length; index++) {
        const char = source[index];

        if (inQuotes) {
            if (char === '"') {
                if (source[index + 1] === '"') { field += '"'; index++; }
                else inQuotes = false;
            } else {
                field += char;
            }
            continue;
        }

        if (char === '"') { inQuotes = true; continue; }
        if (char === sep) { row.push(field); field = ''; continue; }

        if (char === '\r') {
            if (source[index + 1] === '\n') index++;
            row.push(field); field = '';
            rows.push(row); row = [];
            continue;
        }
        if (char === '\n') {
            row.push(field); field = '';
            rows.push(row); row = [];
            continue;
        }

        field += char;
    }

    if (field.length || row.length) { row.push(field); rows.push(row); }

    // Drop trailing blank lines, but keep genuinely empty cells inside a row.
    return rows.filter((candidate) => candidate.some((cell) => cell.trim() !== ''));
}

/**
 * Finds the array of records inside a JSON payload.
 *
 * Tools wrap their exports in all sorts of envelopes — `{ data: [...] }`,
 * `{ results: [...] }`, `{ items: { leads: [...] } }` — so search rather than
 * assume, preferring the largest array of objects found.
 *
 * @param {unknown} payload
 * @returns {object[]}
 */
export function findRecords(payload) {
    if (Array.isArray(payload)) {
        return payload.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
    }
    if (!payload || typeof payload !== 'object') return [];

    let best = [];
    const visit = (node, depth) => {
        if (depth > 4 || !node || typeof node !== 'object') return;

        if (Array.isArray(node)) {
            const objects = node.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
            if (objects.length > best.length) best = objects;
            return;
        }
        for (const value of Object.values(node)) visit(value, depth + 1);
    };

    visit(payload, 0);

    // A single record object with no array anywhere is still one lead.
    if (!best.length && Object.keys(payload).length) return [payload];
    return best;
}

/**
 * Turns a table into records, using the first row as headers.
 *
 * @param {string[][]} rows
 * @returns {{headers: string[], records: object[]}}
 */
export function tableToRecords(rows) {
    if (!rows.length) return { headers: [], records: [] };

    const headers = rows[0].map((header, index) => header.trim() || `column_${index + 1}`);
    const records = rows.slice(1).map((row) => {
        const record = {};
        headers.forEach((header, index) => { record[header] = row[index] ?? ''; });
        return record;
    });

    return { headers, records };
}

/**
 * Front door: text in, records out.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {'auto'|'csv'|'tsv'|'json'|'jsonl'} [options.format]
 * @returns {{format: string, headers: string[], records: object[]}}
 */
export function parseAny(text, { format = 'auto' } = {}) {
    const source = stripBom(String(text ?? '')).trim();
    if (!source) return { format: 'empty', headers: [], records: [] };

    const looksJson = source.startsWith('{') || source.startsWith('[');
    const chosen = format !== 'auto' ? format : (looksJson ? 'json' : 'csv');

    if (chosen === 'json') {
        try {
            const records = findRecords(JSON.parse(source));
            return { format: 'json', headers: [...new Set(records.flatMap(Object.keys))], records };
        } catch {
            // A JSONL file's first line parses as JSON but the whole file does
            // not, so fall through and try line by line.
        }
    }

    if (chosen === 'json' || chosen === 'jsonl') {
        const records = source
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => { try { return JSON.parse(line); } catch { return null; } })
            .filter((item) => item && typeof item === 'object');

        if (records.length) {
            return { format: 'jsonl', headers: [...new Set(records.flatMap(Object.keys))], records };
        }
    }

    const delimiter = chosen === 'tsv' ? '\t' : undefined;
    const { headers, records } = tableToRecords(parseDelimited(source, delimiter));
    return { format: 'csv', headers, records };
}
