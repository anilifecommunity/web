import test from 'node:test';
import assert from 'node:assert/strict';
import { GuardError, readJsonCapped, readTextCapped, validateUpstreamUrl } from './guards';

const HOSTS = new Set(['anichan.to', 'cdn.example.com']);

function reason(fn: () => unknown): string {
  try {
    fn();
    return 'no-error';
  } catch (error) {
    return error instanceof GuardError ? error.reason : 'wrong-error';
  }
}

test('accepts an https url on an allowlisted host', () => {
  const url = validateUpstreamUrl('https://anichan.to/api/watch/servers?anilistId=1', HOSTS);
  assert.equal(url.hostname, 'anichan.to');
});

test('refuses http, other hosts, ports, credentials and private addresses', () => {
  assert.equal(reason(() => validateUpstreamUrl('http://anichan.to/x', HOSTS)), 'scheme_not_allowed');
  assert.equal(reason(() => validateUpstreamUrl('https://evil.example/x', HOSTS)), 'host_not_allowed');
  assert.equal(reason(() => validateUpstreamUrl('https://anichan.to:8080/x', HOSTS)), 'host_not_allowed');
  assert.equal(reason(() => validateUpstreamUrl('https://user:pass@anichan.to/x', HOSTS)), 'invalid_url');
  assert.equal(reason(() => validateUpstreamUrl('https://127.0.0.1/x', HOSTS)), 'private_host');
  assert.equal(reason(() => validateUpstreamUrl('https://localhost/x', HOSTS)), 'private_host');
  assert.equal(reason(() => validateUpstreamUrl('https://10.1.2.3/x', HOSTS)), 'private_host');
  assert.equal(reason(() => validateUpstreamUrl('https://[::1]/x', HOSTS)), 'private_host');
  assert.equal(reason(() => validateUpstreamUrl('not a url', HOSTS)), 'invalid_url');
});

test('caps response bodies', async () => {
  const small = new Response('{"ok":true}');
  assert.deepEqual(await readJsonCapped(small, 1024), { ok: true });

  const large = new Response('x'.repeat(2048));
  await assert.rejects(
    () => readTextCapped(large, 1024),
    (error: unknown) => error instanceof GuardError && error.reason === 'response_too_large'
  );

  const declared = new Response('x', { headers: { 'content-length': '999999' } });
  await assert.rejects(
    () => readTextCapped(declared, 1024),
    (error: unknown) => error instanceof GuardError && error.reason === 'response_too_large'
  );
});

test('rejects invalid json instead of passing it through', async () => {
  await assert.rejects(
    () => readJsonCapped(new Response('<html>not json</html>'), 1024),
    (error: unknown) => error instanceof GuardError && error.reason === 'upstream_error'
  );
});
