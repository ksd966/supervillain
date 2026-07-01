/**
 * Rust Raid Alert - FCM listener
 *
 * Slusa Rust+ push notifikacije (Firebase Cloud Messaging) i kada se okine
 * Smart Alarm u tvojoj bazi, salje POST na n8n webhook. n8n dalje salje
 * poruku na Telegram.
 *
 * Pre pokretanja moras jednom da uradis:
 *   npm run register        (kreira rustplus.config.json)
 * i da uparis Smart Alarm sa Rust+ (vidi README.md).
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

// isti klijent koji koristi i zvanicni `fcm-listen` CLI
const PushReceiverClient = require('@liamcottle/push-receiver/src/client');

const CONFIG_FILE = process.env.RUSTPLUS_CONFIG || path.join(__dirname, 'rustplus.config.json');
const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

// Ako je true (podrazumevano), prosledjujemo samo alarm notifikacije,
// a ignorisemo pairing/ostale poruke. Postavi ALARM_ONLY=false da vidis sve.
const ALARM_ONLY = String(process.env.ALARM_ONLY || 'true').toLowerCase() !== 'false';

function fail(msg) {
  console.error('\x1b[31m[GRESKA]\x1b[0m ' + msg);
  process.exit(1);
}

if (!WEBHOOK_URL) {
  fail('N8N_WEBHOOK_URL nije podesen. Napravi .env fajl (vidi .env.example).');
}

if (typeof fetch !== 'function') {
  fail('Potreban je Node.js 18+ (koristi se ugradjeni fetch). Proveri: node --version');
}

let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
} catch (e) {
  fail(
    'Ne mogu da procitam ' + CONFIG_FILE + '.\n' +
    'Pokreni prvo:  npm run register   (uparivanje sa Rust+ FCM-om).'
  );
}

const gcm = config && config.fcm_credentials && config.fcm_credentials.gcm;
if (!gcm || !gcm.androidId || !gcm.securityToken) {
  fail('U ' + CONFIG_FILE + ' fale fcm_credentials.gcm.androidId / securityToken. Ponovi `npm run register`.');
}

// Pretvori appData niz [{key,value}] u obican objekat { key: value }
function appDataToObject(data) {
  const out = {};
  const items = (data && data.appData) || [];
  for (const item of items) {
    if (item && typeof item.key === 'string') out[item.key] = item.value;
  }
  return out;
}

async function forwardToN8n(payload) {
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error('[n8n] Webhook je vratio HTTP ' + res.status + ' ' + res.statusText);
    } else {
      console.log('[n8n] Alert prosledjen ->', payload.title);
    }
  } catch (err) {
    console.error('[n8n] Ne mogu da posaljem webhook:', err.message);
  }
}

function timestamp() {
  return new Date().toLocaleString('sr-RS', { timeZone: process.env.TZ || 'Europe/Belgrade' });
}

console.log('Rust Raid Alert listener se pokrece...');
console.log('  Config:      ' + CONFIG_FILE);
console.log('  Webhook:     ' + WEBHOOK_URL);
console.log('  Samo alarmi: ' + (ALARM_ONLY ? 'da' : 'ne (prosledjuju se sve notifikacije)'));

const client = new PushReceiverClient(gcm.androidId, gcm.securityToken, []);

client.on('ON_DATA_RECEIVED', (data) => {
  const app = appDataToObject(data);

  // `body` je JSON string sa detaljima o serveru/entitetu
  let body = {};
  try {
    body = JSON.parse(app.body || '{}');
  } catch (_) {
    body = {};
  }

  const channelId = app.channelId || body.channelId || '';
  const title = app.title || body.title || 'Rust Alarm';
  const message = app.message || body.message || '';

  // Smart Alarm dolazi na kanalu "alarm". Pairing/serveri idu na druge kanale.
  if (ALARM_ONLY && channelId !== 'alarm') {
    console.log('[skip] Ignorisana notifikacija (channelId=' + (channelId || 'n/a') + ', title="' + title + '")');
    return;
  }

  const payload = {
    event: 'rust_raid_alert',
    title,
    message,
    channelId,
    server: body.name || '',
    ip: body.ip || '',
    port: body.port || '',
    entityId: body.entityId || '',
    entityType: body.entityType || '',
    time: new Date().toISOString(),
    timeLocal: timestamp(),
  };

  console.log('\x1b[33m[ALARM]\x1b[0m ' + timestamp() + ' | ' + title + ' — ' + message);
  forwardToN8n(payload);
});

client.on('connect', () => {
  console.log('\x1b[32m[OK]\x1b[0m Povezan na Rust+ FCM. Cekam alarme...');
});

client.connect().catch((err) => {
  fail('Ne mogu da se povezem na FCM: ' + err.message);
});

// Cist izlaz na Ctrl+C
process.on('SIGINT', () => {
  console.log('\nGasim listener.');
  process.exit(0);
});
