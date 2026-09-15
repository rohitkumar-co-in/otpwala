import assert from 'node:assert/strict';
import test from 'node:test';
import { createActionToken, getTelegramWebhookSecret, verifyActionToken } from './telegram-security.ts';

test('Telegram payment action tokens are signed, scoped, and expire', async () => {
  const now = Date.UTC(2026, 8, 15, 12, 0, 0);
  const token = await createActionToken('request-1', 'bot-secret', now);

  assert.equal(await verifyActionToken('request-1', token, 'bot-secret', now), true);
  assert.equal(await verifyActionToken('request-2', token, 'bot-secret', now), false);
  assert.equal(await verifyActionToken('request-1', token, 'wrong-secret', now), false);
  assert.equal(await verifyActionToken('request-1', token, 'bot-secret', now + 24 * 60 * 60 * 1000 + 1_000), false);
});

test('Telegram webhook secret is stable and bound to the bot token', async () => {
  const first = await getTelegramWebhookSecret('bot-secret');
  assert.equal(first, await getTelegramWebhookSecret('bot-secret'));
  assert.notEqual(first, await getTelegramWebhookSecret('another-secret'));
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
});
