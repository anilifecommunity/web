import assert from 'node:assert/strict';
import test from 'node:test';
import { protectedRequestAllowed, securityHeaders } from './security';

test('ordinary pages deny all framing while Discord uses an isolated path', () => {
  const ordinary = securityHeaders(new Request('https://anilife.cc/anime/1'));
  assert.match(ordinary['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.equal(ordinary['X-Frame-Options'], 'DENY');

  const activity = securityHeaders(new Request('https://anilife.cc/activity?frame_id=1&instance_id=2'));
  assert.match(activity['Content-Security-Policy'], /frame-ancestors https:\/\/discord\.com https:\/\/\*\.discordsays\.com/);
  assert.equal(activity['X-Frame-Options'], undefined);
});

test('watch pages do not send their route as a referrer', () => {
  const headers = securityHeaders(new Request('https://anilife.cc/watch/ref/episode-1-tag'));
  assert.equal(headers['Referrer-Policy'], 'no-referrer');
});

test('protected requests reject foreign origins except the exact Discord Activity origin', () => {
  assert.equal(protectedRequestAllowed(new Request('https://anilife.cc/api/watch/session', {
    method: 'POST',
    headers: { Origin: 'https://anilife.cc', 'Sec-Fetch-Site': 'same-origin' },
  })), true);
  assert.equal(protectedRequestAllowed(new Request('https://anilife.cc/api/watch/session', {
    method: 'POST',
    headers: { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' },
  })), false);
  assert.equal(protectedRequestAllowed(new Request('https://anilife.cc/api/watch/session', {
    method: 'POST',
    headers: { Origin: 'https://1567279187893551185.discordsays.com', 'Sec-Fetch-Site': 'cross-site' },
  })), true);
});

test('CSP allows Supabase Realtime for watch parties', () => {
  const csp = securityHeaders(new Request('https://anilife.cc/anime/1'))['Content-Security-Policy'];
  assert.match(csp, /connect-src[^;]*https:\/\/\*\.supabase\.co/);
  assert.match(csp, /connect-src[^;]*wss:\/\/\*\.supabase\.co/);
});
