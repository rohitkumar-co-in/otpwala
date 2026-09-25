import fs from 'fs';
import path from 'path';

// Parse .env manually
const envPath = path.resolve(process.cwd(), '.env');
const env: Record<string, string> = {};
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      env[key] = val;
    }
  }
}

async function runTests() {
  console.log('--- STARTING COMPREHENSIVE ENDPOINTS TEST ---');
  const { onRequest } = await import('../apps/web/functions/api/[[path]].ts');

  const tests = [
    { name: 'Health Check', url: 'https://otpwala.me/api/health', method: 'GET' },
    { name: 'Site config', url: 'https://otpwala.me/api/site-config', method: 'GET' },
    { name: 'Auth Config', url: 'https://otpwala.me/api/auth/config', method: 'GET' },
    {
      name: 'Check Email (Existing or non-existing)',
      url: 'https://otpwala.me/api/auth/check-email',
      method: 'POST',
      body: JSON.stringify({ email: 'test_non_existing_99999@gmail.com' }),
    },
    { name: 'Wallet Config', url: 'https://otpwala.me/api/wallet/config', method: 'GET' },
    { name: 'Get Services Catalog', url: 'https://otpwala.me/api/services', method: 'GET' },
    { name: 'Get Countries Catalog', url: 'https://otpwala.me/api/countries', method: 'GET' },
    { name: 'Get WhatsApp Countries', url: 'https://otpwala.me/api/services/wa/countries', method: 'GET' },
    { name: 'Get WhatsApp USA Price (path format)', url: 'https://otpwala.me/api/prices/wa/187', method: 'GET' },
    { name: 'Get Telegram USA Price (path format)', url: 'https://otpwala.me/api/prices/tg/187', method: 'GET' },
    { name: 'Get Telegram India Price (query format)', url: 'https://otpwala.me/api/prices?service=tg&country=22', method: 'GET' },
    { name: 'Telegram Webhook GET status', url: 'https://otpwala.me/api/telegram/webhook', method: 'GET' },
  ];

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const req = new Request(t.url, {
        method: t.method,
        headers,
        body: t.body,
      });

      const res = await onRequest({ request: req, env });
      const status = res.status;
      const data = await res.json();

      if (status >= 200 && status < 300 && data.success !== false) {
        console.log(`[PASS] ${t.name} (Status: ${status})`);
        passed++;
      } else {
        console.error(`[FAIL] ${t.name} (Status: ${status}) Data:`, data);
        failed++;
      }
    } catch (err: any) {
      console.error(`[ERROR] ${t.name} Exception:`, err.message);
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed out of ${tests.length} tests.`);
}

runTests().catch(console.error);
