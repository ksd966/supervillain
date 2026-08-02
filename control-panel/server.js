#!/usr/bin/env node
/**
 * Local control panel for the scraper actors.
 *
 * Runs on your own machine, spawns the actors as child processes, streams their
 * logs and hands back the results. No dependencies beyond Node itself — the
 * point is that this starts with a double-click and keeps working.
 *
 * Every run gets its own storage directory, so two runs never clobber each
 * other's dataset and an old run's results stay downloadable.
 *
 * The server binds to every interface so a phone on the same Wi-Fi (or an ngrok
 * tunnel) can reach it. That makes access control mandatory rather than
 * optional: a token is generated on first start and required on every request.
 */

import { spawn } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeIconPng } from './icon.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const runsDir = join(here, 'runs');
const publicDir = join(here, 'public');

const PORT = Number(process.env.PORT ?? 8377);
const HOST = process.env.HOST ?? '0.0.0.0';
const MAX_LOG_LINES = 500;
const MAX_RUNS_KEPT = 40;

/** Actors this panel knows how to launch, in the order they make sense to use. */
const ACTORS = [
    {
        id: 'google-leads-scraper',
        title: 'Google / OSM leads',
        blurb: 'Niša + grad → biznisi, telefoni, e-mailovi, Instagram handle-ovi.',
    },
    {
        id: 'instagram-keyword-scraper',
        title: 'Instagram po ključnoj reči',
        blurb: 'Niša + grad → IG profili sa e-mailom, preko pretraživača. Instagram se ne dira.',
    },
    {
        id: 'instagram-email-scraper',
        title: 'Instagram e-mailovi',
        blurb: 'Lista profila → kontakt e-mailovi. Prima INSTAGRAM_HANDLES iz prethodnog.',
    },
    {
        id: 'lead-normalizer',
        title: 'Sredi export',
        blurb: 'Nalepi CSV/JSON iz bilo kog alata → čist, dedupliran, verifikovan CSV.',
    },
    {
        id: 'apify-actor',
        title: 'Generički crawler',
        blurb: 'Bilo koji sajt, tvoji CSS selektori.',
    },
].filter((actor) => existsSync(join(repoRoot, actor.id, 'src', 'main.js')));

// --- access control ----------------------------------------------------------

const tokenFile = join(here, '.token');

function loadOrCreateToken() {
    if (process.env.PANEL_TOKEN) return process.env.PANEL_TOKEN;

    if (existsSync(tokenFile)) {
        const existing = readFileSync(tokenFile, 'utf8').trim();
        if (existing) return existing;
    }

    const token = randomBytes(18).toString('base64url');
    writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
    return token;
}

const TOKEN = loadOrCreateToken();
const tokenDigest = createHash('sha256').update(TOKEN).digest();

/**
 * Compared as fixed-length digests so the check cannot be timed, and so a
 * wrong-length guess does not throw.
 *
 * @param {string|null|undefined} candidate
 * @returns {boolean}
 */
function tokenMatches(candidate) {
    if (!candidate) return false;
    return timingSafeEqual(createHash('sha256').update(candidate).digest(), tokenDigest);
}

// --- run registry ------------------------------------------------------------

mkdirSync(runsDir, { recursive: true });

/** @type {Map<string, object>} */
const runs = new Map();

/** @param {string} id */
function runStorageDir(id) {
    return join(runsDir, id);
}

/**
 * @param {string} actorId
 * @param {object} input
 * @returns {object} the run record
 */
function startRun(actorId, input) {
    const actor = ACTORS.find((candidate) => candidate.id === actorId);
    if (!actor) throw new Error(`Unknown actor: ${actorId}`);

    const id = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
    const storageDir = runStorageDir(id);
    mkdirSync(join(storageDir, 'key_value_stores', 'default'), { recursive: true });
    writeFileSync(join(storageDir, 'key_value_stores', 'default', 'INPUT.json'), JSON.stringify(input, null, 2));

    const child = spawn(process.execPath, ['src/main.js'], {
        cwd: join(repoRoot, actorId),
        env: {
            ...process.env,
            // Both are set because the Apify SDK and Crawlee read different
            // ones depending on version.
            CRAWLEE_STORAGE_DIR: storageDir,
            APIFY_LOCAL_STORAGE_DIR: storageDir,
            FORCE_COLOR: '0',
        },
    });

    const run = {
        id,
        actorId,
        actorTitle: actor.title,
        input,
        status: 'running',
        startedAt: new Date().toISOString(),
        finishedAt: null,
        exitCode: null,
        log: [],
        child,
    };

    const append = (chunk) => {
        for (const line of chunk.toString().split('\n')) {
            if (!line.trim()) continue;
            run.log.push(line);
        }
        if (run.log.length > MAX_LOG_LINES) run.log.splice(0, run.log.length - MAX_LOG_LINES);
    };

    child.stdout.on('data', append);
    child.stderr.on('data', append);

    child.on('error', (error) => {
        run.status = 'failed';
        run.log.push(`Failed to start: ${error.message}`);
        run.finishedAt = new Date().toISOString();
    });

    child.on('close', (code, signal) => {
        run.exitCode = code;
        run.finishedAt = new Date().toISOString();
        if (run.status === 'stopping') run.status = 'stopped';
        else run.status = code === 0 ? 'finished' : 'failed';
        if (signal) run.log.push(`Process ended with signal ${signal}.`);
        run.child = null;
    });

    runs.set(id, run);

    // Keep the registry from growing without bound over a long-running panel.
    const finished = [...runs.values()].filter((candidate) => candidate.status !== 'running');
    if (finished.length > MAX_RUNS_KEPT) {
        finished
            .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
            .slice(0, finished.length - MAX_RUNS_KEPT)
            .forEach((stale) => runs.delete(stale.id));
    }

    return run;
}

/**
 * @param {object} run
 * @returns {object} JSON-safe view (the child process handle is not serialisable)
 */
function publicRun(run) {
    const { child, ...rest } = run;
    return { ...rest, hasResults: existsSync(join(runStorageDir(run.id), 'datasets', 'default')) };
}

/**
 * @param {string} id
 * @returns {object[]}
 */
function readDataset(id) {
    const dir = join(runStorageDir(id), 'datasets', 'default');
    if (!existsSync(dir)) return [];

    return readdirSync(dir)
        .filter((file) => file.endsWith('.json'))
        .sort()
        .map((file) => {
            try {
                return JSON.parse(readFileSync(join(dir, file), 'utf8'));
            } catch {
                return null;
            }
        })
        .filter(Boolean);
}

/**
 * @param {string} id
 * @param {string} key
 * @returns {string|null}
 */
function readKeyValue(id, key) {
    const dir = join(runStorageDir(id), 'key_value_stores', 'default');
    for (const extension of ['.json', '.csv', '.txt']) {
        const path = join(dir, `${key}${extension}`);
        if (existsSync(path)) return readFileSync(path, 'utf8');
    }
    return null;
}

/**
 * Flattens whatever the actor produced into a spreadsheet.
 *
 * Column order is fixed for the fields every actor shares, then whatever else
 * turns up, so the important columns are not buried behind incidental ones.
 *
 * @param {object[]} rows
 * @returns {string}
 */
function toCsv(rows) {
    if (!rows.length) return '\n';

    const preferred = [
        'name', 'username', 'fullName', 'emails', 'phone', 'businessPhoneNumber',
        'website', 'externalUrl', 'instagramHandles', 'address', 'category',
        'businessCategoryName', 'followersCount', 'rating', 'reviewsCount',
        'url', 'googleMapsUrl', 'source', 'scrapedAt',
    ];
    const present = new Set(rows.flatMap((row) => Object.keys(row)));
    const columns = [
        ...preferred.filter((column) => present.has(column)),
        ...[...present].filter((column) => !preferred.includes(column) && column !== 'emailDetails' && column !== 'html'),
    ];

    const cell = (value) => {
        if (value == null) return '';
        const text = Array.isArray(value)
            ? value.map((item) => (typeof item === 'object' ? JSON.stringify(item) : item)).join(' | ')
            : (typeof value === 'object' ? JSON.stringify(value) : String(value));
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    return [
        columns.join(','),
        ...rows.map((row) => columns.map((column) => cell(row[column])).join(',')),
    ].join('\n') + '\n';
}

// --- input schemas -----------------------------------------------------------

/**
 * Turns an actor's Apify input schema into the compact field list the UI
 * renders. Reading the real schema means the form never drifts from what the
 * actor actually accepts.
 *
 * @param {string} actorId
 * @returns {object[]}
 */
function fieldsForActor(actorId) {
    const schemaPath = join(repoRoot, actorId, '.actor', 'input_schema.json');
    if (!existsSync(schemaPath)) return [];

    let schema;
    try {
        schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    } catch {
        return [];
    }

    return Object.entries(schema.properties ?? {}).map(([name, spec]) => ({
        name,
        title: spec.title ?? name,
        description: spec.description ?? '',
        type: spec.type,
        editor: spec.editor ?? (spec.type === 'boolean' ? 'checkbox' : 'textfield'),
        enum: spec.enum ?? null,
        enumTitles: spec.enumTitles ?? null,
        default: spec.prefill ?? spec.default ?? null,
        secret: Boolean(spec.isSecret),
        section: spec.sectionCaption ?? null,
        required: (schema.required ?? []).includes(name),
    }));
}

// --- HTTP --------------------------------------------------------------------

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
};

/**
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(payload) });
    res.end(payload);
}

/**
 * @param {http.IncomingMessage} req
 * @returns {Promise<object>}
 */
function readBody(req) {
    return new Promise((resolveBody, rejectBody) => {
        const chunks = [];
        let size = 0;

        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > 1_000_000) {
                rejectBody(new Error('Request body too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (!chunks.length) { resolveBody({}); return; }
            try {
                resolveBody(JSON.parse(Buffer.concat(chunks).toString()));
            } catch (error) {
                rejectBody(error);
            }
        });
        req.on('error', rejectBody);
    });
}

const iconCache = new Map();

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;

    // The browser extension posts from a `chrome-extension://` origin, which the
    // same-origin policy blocks without this. Only extension origins are
    // allowed: a web page must not be able to drive the panel just because the
    // user happens to have it running.
    const origin = req.headers.origin;
    if (origin && /^(chrome|moz|safari-web)-extension:\/\//.test(origin)) {
        res.setHeader('access-control-allow-origin', origin);
        res.setHeader('access-control-allow-headers', 'authorization, content-type');
        res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('vary', 'origin');
    }

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // The login page and the icons are the only unauthenticated surface: the
    // page itself contains no data and iOS fetches icons without headers.
    const isPublicAsset = path === '/login' || path.startsWith('/icon-') || path === '/manifest.webmanifest';

    if (!isPublicAsset) {
        const header = req.headers.authorization ?? '';
        const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!tokenMatches(bearer ?? url.searchParams.get('token'))) {
            if (path === '/' ) {
                res.writeHead(302, { location: '/login' });
                res.end();
                return;
            }
            sendJson(res, 401, { error: 'Invalid or missing token.' });
            return;
        }
    }

    try {
        // --- API ---
        if (path === '/api/actors' && req.method === 'GET') {
            sendJson(res, 200, ACTORS.map((actor) => ({ ...actor, fields: fieldsForActor(actor.id) })));
            return;
        }

        if (path === '/api/runs' && req.method === 'GET') {
            sendJson(res, 200, [...runs.values()]
                .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
                .map(publicRun));
            return;
        }

        if (path === '/api/runs' && req.method === 'POST') {
            const body = await readBody(req);
            if (!body.actorId) { sendJson(res, 400, { error: 'actorId is required' }); return; }
            sendJson(res, 201, publicRun(startRun(body.actorId, body.input ?? {})));
            return;
        }

        const runMatch = path.match(/^\/api\/runs\/([\w-]+)(\/[\w.]+)?$/);
        if (runMatch) {
            const run = runs.get(runMatch[1]);
            if (!run) { sendJson(res, 404, { error: 'No such run' }); return; }

            const sub = runMatch[2];

            if (!sub && req.method === 'GET') { sendJson(res, 200, publicRun(run)); return; }

            if (!sub && req.method === 'DELETE') {
                if (run.child) {
                    run.status = 'stopping';
                    run.child.kill('SIGTERM');
                }
                sendJson(res, 200, publicRun(run));
                return;
            }

            if (sub === '/results' && req.method === 'GET') {
                sendJson(res, 200, { rows: readDataset(run.id) });
                return;
            }

            if (sub === '/results.csv' && req.method === 'GET') {
                const csv = readKeyValue(run.id, 'CLEAN_CSV')
                    ?? readKeyValue(run.id, 'EMAILS_CSV')
                    ?? toCsv(readDataset(run.id));
                res.writeHead(200, {
                    'content-type': 'text/csv; charset=utf-8',
                    'content-disposition': `attachment; filename="${run.actorId}-${run.id}.csv"`,
                });
                res.end(csv);
                return;
            }

            if (sub === '/full.csv' && req.method === 'GET') {
                res.writeHead(200, {
                    'content-type': 'text/csv; charset=utf-8',
                    'content-disposition': `attachment; filename="${run.actorId}-${run.id}-full.csv"`,
                });
                res.end(toCsv(readDataset(run.id)));
                return;
            }

            if (sub === '/handles' && req.method === 'GET') {
                const raw = readKeyValue(run.id, 'INSTAGRAM_HANDLES');
                sendJson(res, 200, { handles: raw ? JSON.parse(raw) : [] });
                return;
            }
        }

        // --- icons (generated, so there are no binary blobs in the repo) ---
        const iconMatch = path.match(/^\/icon-(\d+)\.png$/);
        if (iconMatch) {
            const size = Math.min(Number(iconMatch[1]), 512);
            if (!iconCache.has(size)) iconCache.set(size, makeIconPng(size));
            const png = iconCache.get(size);
            res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' });
            res.end(png);
            return;
        }

        // --- static ---
        const file = path === '/' ? 'index.html' : (path === '/login' ? 'login.html' : path.slice(1));
        const filePath = join(publicDir, file);

        // Path traversal guard: everything served must sit inside public/.
        if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
            sendJson(res, 404, { error: 'Not found' });
            return;
        }

        res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
        createReadStream(filePath).pipe(res);
    } catch (error) {
        sendJson(res, 500, { error: error.message });
    }
});

/**
 * Opens the panel in a browser app window — its own window and taskbar entry,
 * no address bar, no tabs. That is what `--app` gives you, and it is the whole
 * of what an Electron shell would have added here, minus the 150 MB runtime and
 * the build step.
 *
 * @param {string} url
 */
function openAppWindow(url) {
    const candidates = process.platform === 'win32'
        ? [
            `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
            `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
            `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
            `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
            `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
        ]
        : process.platform === 'darwin'
            ? [
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
                '/Applications/Chromium.app/Contents/MacOS/Chromium',
            ]
            : ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge'];

    const found = candidates.find((path) => (path.includes('/') || path.includes('\\') ? existsSync(path) : true));

    if (!found) {
        console.log('  Chrome/Edge nisu pronađeni — otvori gornju adresu ručno u browseru.\n');
        return;
    }

    const child = spawn(found, [`--app=${url}`, '--window-size=1180,900'], {
        detached: true,
        stdio: 'ignore',
    });
    child.on('error', () => {
        console.log('  Nije uspelo otvaranje prozora — otvori gornju adresu ručno.\n');
    });
    child.unref();
}

server.listen(PORT, HOST, () => {
    const line = '─'.repeat(64);
    console.log(`\n${line}`);
    console.log('  Scraper control panel');
    console.log(line);
    console.log(`  Na ovom računaru:  http://localhost:${PORT}/?token=${TOKEN}`);
    console.log(`  Sa telefona (LAN): http://<IP-ovog-PCja>:${PORT}/?token=${TOKEN}`);
    console.log(`\n  Token: ${TOKEN}`);
    console.log(`  (čuva se u control-panel/.token — obriši fajl da dobiješ novi)`);
    console.log(`\n  Actor-i: ${ACTORS.map((a) => a.id).join(', ') || 'nijedan pronađen'}`);
    console.log(`${line}\n`);

    if (process.argv.includes('--open')) openAppWindow(`http://localhost:${PORT}/?token=${TOKEN}`);
});
