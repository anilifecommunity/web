import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateToken, gateCookie, GATE_COOKIE, readCookie, verifyGateToken } from './gate';
import { hit, resetRateLimits } from './rateLimit';

const SECRET = 'test-signing-key-not-a-real-secret';

test('gate tokens round-trip and are bound to their expiry', async () => {
  const token = await createGateToken(SECRET);
  assert.equal(await verifyGateToken(SECRET, token), true);
  assert.equal(await verifyGateToken('another-key', token), false);
});

test('expired and tampered gate tokens are refused', async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await createGateToken(SECRET, now - 90_000);
  assert.equal(await verifyGateToken(SECRET, token, now), false);

  const good = await createGateToken(SECRET, now);
  const [expires, signature] = good.split('.');
  const tampered = `${Number(expires) + 3600}.${signature}`;
  assert.equal(await verifyGateToken(SECRET, tampered, now), false);
  assert.equal(await verifyGateToken(SECRET, undefined, now), false);
  assert.equal(await verifyGateToken(SECRET, 'garbage', now), false);
});

test('gate cookie carries HttpOnly, Secure and SameSite', () => {
  const cookie = gateCookie('123.sig');
  assert.ok(cookie.startsWith(`${GATE_COOKIE}=123.sig`));
  assert.ok(cookie.includes('HttpOnly'));
  assert.ok(cookie.includes('Secure'));
  assert.ok(cookie.includes('SameSite=Lax'));
});

test('cookies are read without confusing similar names', () => {
  const request = new Request('https://anilife.cc/', {
    headers: { Cookie: 'a=1; anilife_gate=abc.def; anilife_gate_x=no' },
  });
  assert.equal(readCookie(request, GATE_COOKIE), 'abc.def');
  assert.equal(readCookie(request, 'missing'), undefined);
});

test('rate limiting blocks after the limit and recovers after the window', () => {
  resetRateLimits();
  const start = 1_000_000;
  for (let i = 0; i < 3; i += 1) {
    assert.equal(hit('ip', 3, 1000, start).allowed, true);
  }
  const blocked = hit('ip', 3, 1000, start);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1);
  assert.equal(hit('ip', 3, 1000, start + 1001).allowed, true);
  assert.equal(hit('other', 3, 1000, start).allowed, true);
});
