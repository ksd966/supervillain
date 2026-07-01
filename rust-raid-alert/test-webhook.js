/**
 * Salje laznu "raid alert" poruku na n8n webhook da testiras ceo lanac
 * (n8n -> Telegram) BEZ cekanja na pravi alarm u igri.
 *
 *   node test-webhook.js
 */

require('dotenv').config();

const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

if (!WEBHOOK_URL) {
  console.error('[GRESKA] N8N_WEBHOOK_URL nije podesen u .env');
  process.exit(1);
}

const payload = {
  event: 'rust_raid_alert',
  title: 'TEST ALARM',
  message: 'Ovo je test — ako vidis ovo na Telegramu, sve radi!',
  channelId: 'alarm',
  server: 'Test Server',
  ip: '127.0.0.1',
  port: '28017',
  time: new Date().toISOString(),
  timeLocal: new Date().toLocaleString('sr-RS', { timeZone: process.env.TZ || 'Europe/Belgrade' }),
};

(async () => {
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    console.log('Odgovor: HTTP ' + res.status + ' ' + res.statusText);
    console.log(res.ok ? '[OK] Poslato. Proveri Telegram.' : '[GRESKA] Proveri n8n workflow.');
  } catch (err) {
    console.error('[GRESKA] Ne mogu da posaljem:', err.message);
  }
})();
