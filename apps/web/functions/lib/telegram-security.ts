const ACTION_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(message: string, secret: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

export async function createActionToken(requestId: string, botToken: string, now = Date.now()): Promise<string> {
  if (!requestId || !botToken) throw new Error('Action token inputs are required');
  const issuedAt = Math.floor(now / 1000).toString(36);
  const signature = base64Url((await hmac(`payment-action:${requestId}:${issuedAt}`, botToken)).slice(0, 18));
  return `${issuedAt}.${signature}`;
}

export async function verifyActionToken(
  requestId: string, token: string, botToken: string, now = Date.now()
): Promise<boolean> {
  if (!requestId || !token || !botToken) return false;
  const [issuedAt, signature, extra] = token.split('.');
  if (!issuedAt || !signature || extra) return false;
  const issuedAtMs = Number.parseInt(issuedAt, 36) * 1000;
  if (!Number.isFinite(issuedAtMs) || issuedAtMs > now + 5 * 60 * 1000 || now - issuedAtMs > ACTION_TOKEN_MAX_AGE_MS) {
    return false;
  }
  return safeEqual(await createActionToken(requestId, botToken, issuedAtMs), token);
}

export async function getTelegramWebhookSecret(botToken: string): Promise<string> {
  if (!botToken) return '';
  return base64Url(await hmac('otpwala:telegram-webhook:v1', botToken));
}
