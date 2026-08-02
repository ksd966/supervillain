/**
 * Popup: the list, the buttons, the CSV.
 *
 * The CSV is built here rather than in the service worker because a popup has a
 * DOM and `URL.createObjectURL`, which a service worker does not — so the
 * download is a plain anchor click with no extra permission needed.
 */

const $ = (selector) => document.querySelector(selector);

let leads = [];
let settings = {};

const send = (message) => chrome.runtime.sendMessage(message);

// --- rendering ---------------------------------------------------------------

function render() {
    const list = $('#list');
    const withMail = leads.filter((lead) => lead.emails?.length).length;

    $('#c-mail').textContent = withMail;
    $('#c-all').textContent = leads.length;

    if (!leads.length) {
        list.innerHTML = `<li class="empty">
            <b>Još nema ničega.</b>
            Otvori Google i pretraži nišu i grad — na primer
            „frizerski salon Novi Sad". Rezultati se kupe sami,
            pa klikni „Izvuci kontakte".
        </li>`;
        return;
    }

    // Unscanned first: those are the ones still waiting on work.
    const sorted = [...leads].sort((a, b) => {
        if (Boolean(a.emails?.length) !== Boolean(b.emails?.length)) return a.emails?.length ? -1 : 1;
        return (a.name ?? '').localeCompare(b.name ?? '');
    });

    list.innerHTML = '';
    for (const lead of sorted) {
        const host = safeHost(lead.url);
        const item = document.createElement('li');

        item.innerHTML = `
            <div class="top">
                <div style="min-width:0">
                    <div class="name">${escapeHtml(lead.name ?? host)}</div>
                    <div class="host">${escapeHtml(host)}</div>
                </div>
                <button class="x" title="Ukloni">×</button>
            </div>
            ${lead.emails?.length ? `<div class="mail">${escapeHtml(lead.emails.join(', '))}</div>` : ''}
            ${lead.instagram?.length ? `<div class="ig">@${lead.instagram.map(escapeHtml).join(', @')}</div>` : ''}
            ${!lead.scannedAt ? '<div class="pending">nije još skenirano</div>' : ''}
            ${lead.scanError ? `<div class="err">${escapeHtml(lead.scanError)}</div>` : ''}
        `;

        item.querySelector('.x').onclick = async () => {
            await send({ type: 'delete-lead', key: lead.key });
            await load();
        };
        list.append(item);
    }
}

function safeHost(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
}

// --- CSV ---------------------------------------------------------------------

function toCsv(rows) {
    const columns = ['name', 'emails', 'instagram', 'phone', 'url', 'query', 'foundAt', 'scannedAt'];
    const cell = (value) => {
        const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
        return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    return [
        columns.join(','),
        ...rows.map((row) => columns.map((column) => cell(row[column])).join(',')),
    ].join('\n') + '\n';
}

function download(csv) {
    // BOM so Excel opens UTF-8 correctly — without it, š/č/ž come out mangled.
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

    anchor.href = url;
    anchor.download = `leads-${stamp}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// --- actions -----------------------------------------------------------------

async function load() {
    const response = await send({ type: 'get-leads' });
    leads = response?.leads ?? [];
    settings = response?.settings ?? {};

    $('#s-auto').checked = Boolean(settings.autoCollectSerp);
    $('#s-url').value = settings.panelUrl ?? '';
    $('#s-token').value = settings.panelToken ?? '';
    $('#s-conc').value = settings.scanConcurrency ?? 3;
    $('#s-delay').value = settings.scanDelayMs ?? 400;

    render();
}

function busy(isBusy, text = '') {
    $('#progress').style.display = isBusy ? 'block' : 'none';
    $('#progress').textContent = text;
    for (const button of document.querySelectorAll('.bar button')) button.disabled = isBusy;
}

$('#scan-all').onclick = async () => {
    const pending = leads.filter((lead) => !lead.scannedAt).length;
    if (!pending) { busy(true, 'Sve je već skenirano.'); setTimeout(() => busy(false), 1600); return; }

    busy(true, `Skeniram 0/${pending}…`);
    await send({ type: 'scan-all' });
    busy(false);
    await load();
};

$('#scan-page').onclick = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.startsWith('http')) { busy(true, 'Ova strana se ne može skenirati.'); setTimeout(() => busy(false), 1600); return; }

    busy(true, 'Skeniram stranu…');
    await send({ type: 'scan-page', url: tab.url });
    busy(false);
    await load();
};

$('#export').onclick = () => {
    if (!leads.length) return;
    download(toCsv(leads));
};

$('#to-panel').onclick = async () => {
    busy(true, 'Šaljem u panel…');
    const result = await send({ type: 'send-to-panel' });
    busy(true, result?.ok ? `Poslato ${result.count} handle-ova u Instagram actor.` : (result?.reason ?? 'Nije uspelo.'));
    setTimeout(() => busy(false), 2600);
};

$('#clear').onclick = async () => {
    await send({ type: 'clear-leads' });
    await load();
};

$('#s-save').onclick = async () => {
    await send({
        type: 'save-settings',
        settings: {
            autoCollectSerp: $('#s-auto').checked,
            panelUrl: $('#s-url').value.trim(),
            panelToken: $('#s-token').value.trim(),
            scanConcurrency: Number($('#s-conc').value) || 3,
            scanDelayMs: Number($('#s-delay').value) || 400,
        },
    });
    busy(true, 'Sačuvano.');
    setTimeout(() => busy(false), 1200);
};

// --- Instagram keyword search ------------------------------------------------

let igLeads = [];

function renderIg() {
    const list = $('#ig-list');

    if (!igLeads.length) {
        list.innerHTML = `<li class="empty">
            <b>Nema još profila.</b>
            Upiši nišu i grad pa klikni „Pretraži".
        </li>`;
        return;
    }

    const sorted = [...igLeads].sort((a, b) => {
        if (Boolean(a.email) !== Boolean(b.email)) return a.email ? -1 : 1;
        return a.username.localeCompare(b.username);
    });

    list.innerHTML = '';
    for (const lead of sorted) {
        const item = document.createElement('li');
        item.innerHTML = `
            <div class="top">
                <div style="min-width:0">
                    <div class="name">${escapeHtml(lead.name ?? lead.username)}</div>
                    <div class="ig">@${escapeHtml(lead.username)}</div>
                </div>
            </div>
            ${lead.emails?.length ? `<div class="mail">${escapeHtml(lead.emails.join(', '))}</div>` : '<div class="pending">bez adrese u snippetu</div>'}
            ${lead.keywords?.length ? `<div class="host">${escapeHtml(lead.keywords.join(' · '))}</div>` : ''}
        `;
        list.append(item);
    }
}

async function loadIg() {
    const response = await send({ type: 'get-ig-leads' });
    igLeads = response?.leads ?? [];
    renderIg();
}

const splitList = (value) => value.split(',').map((part) => part.trim()).filter(Boolean);

function igBusy(isBusy, text = '') {
    $('#ig-progress').style.display = isBusy ? 'block' : 'none';
    $('#ig-progress').textContent = text;
    for (const button of document.querySelectorAll('#pane-ig button')) button.disabled = isBusy;
}

$('#ig-run').onclick = async () => {
    const keywords = splitList($('#ig-keywords').value);
    if (!keywords.length) { igBusy(true, 'Upiši bar jednu ključnu reč.'); setTimeout(() => igBusy(false), 1800); return; }

    igBusy(true, 'Pokrećem pretragu…');
    const result = await send({
        type: 'ig-search',
        keywords,
        location: $('#ig-location').value.trim(),
        emailDomains: splitList($('#ig-domains').value),
        pages: Number($('#ig-pages').value) || 2,
    });
    igBusy(false);
    await loadIg();

    if (result?.ok) {
        igBusy(true, `Gotovo: ${result.queries} upita, ${result.found} novih profila.`);
        setTimeout(() => igBusy(false), 3000);
    }
};

$('#ig-export').onclick = () => {
    if (!igLeads.length) return;

    // One row per address, matching what the commercial actors emit.
    const rows = igLeads.flatMap((lead) => (lead.emails?.length
        ? lead.emails.map((email) => ({ ...lead, email }))
        : [lead]));

    const columns = ['keyword', 'username', 'name', 'email', 'url', 'description'];
    const cell = (value) => {
        const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
        return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = [
        columns.join(','),
        ...rows.map((row) => columns.map((column) => cell(column === 'keyword' ? (row.keywords ?? []).join(' ') : row[column])).join(',')),
    ].join('\n') + '\n';

    download(csv);
};

$('#ig-clear').onclick = async () => { await send({ type: 'clear-ig-leads' }); await loadIg(); };
$('#ig-panel').onclick = $('#to-panel').onclick;

// --- tabs --------------------------------------------------------------------

function showPane(which) {
    $('#tab-sites').setAttribute('aria-selected', String(which === 'sites'));
    $('#tab-ig').setAttribute('aria-selected', String(which === 'ig'));
    $('#pane-sites').hidden = which !== 'sites';
    $('#pane-ig').hidden = which !== 'ig';
}

$('#tab-sites').onclick = () => showPane('sites');
$('#tab-ig').onclick = () => { showPane('ig'); loadIg(); };

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'scan-progress') {
        $('#progress').textContent = `Skeniram ${message.done}/${message.total}…`;
    }
    if (message.type === 'ig-progress') {
        $('#ig-progress').textContent = `Pretraga ${message.done}/${message.total} — ${message.label}`;
    }
});

load();
loadIg();
