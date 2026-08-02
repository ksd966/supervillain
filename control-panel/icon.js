/**
 * Generates the app icon as a PNG at request time.
 *
 * iOS needs a real PNG for the home-screen icon — it will not take an SVG — and
 * checking binary blobs into a repo to satisfy that is a poor trade. Encoding a
 * PNG by hand is about thirty lines: a header, one zlib-compressed image data
 * chunk, and an end marker.
 */

import { deflateSync } from 'node:zlib';
import { crc32 } from 'node:zlib';

/**
 * @param {string} type four-character chunk name
 * @param {Buffer} data
 * @returns {Buffer}
 */
function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);

    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(body) >>> 0);

    return Buffer.concat([length, body, checksum]);
}

/**
 * Draws the icon: a dark rounded square with three bars, suggesting a list of
 * results. Deliberately simple — it has to read at 60 pixels on a home screen.
 *
 * @param {number} size
 * @returns {Buffer} PNG bytes
 */
export function makeIconPng(size = 180) {
    const radius = Math.round(size * 0.22);
    const background = [17, 20, 26];
    const accent = [94, 214, 164];
    const dim = [58, 68, 82];

    /** @returns {[number, number, number, number]} */
    const pixel = (x, y) => {
        // Rounded-square mask: only the four corner boxes need a distance test.
        const cornerX = x < radius ? radius - x : (x >= size - radius ? x - (size - radius) + 1 : 0);
        const cornerY = y < radius ? radius - y : (y >= size - radius ? y - (size - radius) + 1 : 0);
        if (cornerX && cornerY && Math.hypot(cornerX, cornerY) > radius) return [0, 0, 0, 0];

        // Three bars, the first one accented.
        const barLeft = Math.round(size * 0.24);
        const barHeight = Math.round(size * 0.085);
        const gap = Math.round(size * 0.075);
        const firstTop = Math.round(size * 0.29);

        for (let index = 0; index < 3; index++) {
            const top = firstTop + index * (barHeight + gap);
            const width = Math.round(size * (index === 0 ? 0.52 : index === 1 ? 0.42 : 0.3));

            if (y >= top && y < top + barHeight && x >= barLeft && x < barLeft + width) {
                const [r, g, b] = index === 0 ? accent : dim;
                return [r, g, b, 255];
            }
        }

        return [...background, 255];
    };

    // Raw scanlines, each prefixed with a filter-type byte (0 = none).
    const raw = Buffer.alloc(size * (size * 4 + 1));
    let offset = 0;
    for (let y = 0; y < size; y++) {
        raw[offset++] = 0;
        for (let x = 0; x < size; x++) {
            const [r, g, b, a] = pixel(x, y);
            raw[offset++] = r;
            raw[offset++] = g;
            raw[offset++] = b;
            raw[offset++] = a;
        }
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;   // bit depth
    ihdr[9] = 6;   // colour type: RGBA
    ihdr[10] = 0;  // compression: deflate
    ihdr[11] = 0;  // filter method
    ihdr[12] = 0;  // interlace: none

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}
