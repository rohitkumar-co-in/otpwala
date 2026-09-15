import assert from 'node:assert/strict';
import test from 'node:test';
import { isSessionCurrent, isValidSessionId } from './session-policy.ts';

const first = '123e4567-e89b-42d3-a456-426614174000';
const second = '123e4567-e89b-42d3-a456-426614174001';

test('session IDs must be UUIDs', () => {
  assert.equal(isValidSessionId(first), true);
  assert.equal(isValidSessionId('guessable-session'), false);
  assert.equal(isValidSessionId(`sess_${first}`), false);
  assert.equal(isValidSessionId(''), false);
});

test('single-device session policy rejects missing and replaced sessions', () => {
  assert.equal(isSessionCurrent(undefined, undefined), true);
  assert.equal(isSessionCurrent(first, first), true);
  assert.equal(isSessionCurrent(first, second), false);
  assert.equal(isSessionCurrent(first, ''), false);
});
