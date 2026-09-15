const origin = process.env.OTPWALA_ORIGIN || 'https://otpwala.me';
const checks = [];

async function check(name, path, expectedStatus, validate = () => true) {
  const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
  const body = await response.text();
  const ok = response.status === expectedStatus && validate(response, body);
  checks.push({ name, ok, status: response.status });
  if (!ok) throw new Error(`${name} failed (HTTP ${response.status}): ${body.slice(0, 200)}`);
}

await check('Homepage', '/', 200, (r) => Boolean(r.headers.get('content-security-policy')) && Boolean(r.headers.get('strict-transport-security')));
await check('Health API', '/api/health', 200, (r, body) => r.headers.get('cache-control') === 'no-store' && JSON.parse(body).status === 'ok');
await check('Auth config', '/api/auth/config', 200, (_r, body) => JSON.parse(body).success === true);
await check('User support auth boundary', '/api/support/tickets', 401);
await check('Account export auth boundary', '/api/account/export', 401);
await check('Admin auth boundary', '/api/admin/audit-logs', 403);
await check('Dashboard support page', '/dashboard/support/', 200);
await check('Admin support page', '/admin/support/', 200);

for (const result of checks) console.log(`[PASS] ${result.name} (${result.status})`);
console.log(`Production smoke tests passed: ${checks.length}/${checks.length}`);
