import test from 'node:test';
import assert from 'node:assert/strict';
import { makePolicedFetch, hostAllowed } from './policedFetch';

const get = (url: string) => ({ method: 'GET', url, headers: [['Referer', 'https://good.example/']] as Array<[string, string]> });

test('allowlist: exact host and subdomains only', () => {
  assert.ok(hostAllowed('cdn.good.example', ['good.example']));
  assert.ok(!hostAllowed('notgood.example', ['good.example']));
});

test('blocks other hosts, http, IPs and redirect escapes; passes headers through', async () => {
  const seen: Array<Record<string, string>> = [];
  const f = makePolicedFetch(['good.example'], (async (_u: string, init: RequestInit) => { seen.push(init.headers as Record<string, string>); return new Response('ok'); }) as unknown as typeof fetch);
  assert.equal(new TextDecoder().decode((await f(get('https://good.example/a'))).body), 'ok');
  assert.equal(seen[0].Referer, 'https://good.example/');
  await assert.rejects(f(get('https://evil.example/')), /host not allowed/);
  await assert.rejects(f(get('http://good.example/')), /https only/);
  await assert.rejects(f(get('https://127.0.0.1/')), /ip\/localhost/);
  const redirecting = makePolicedFetch(['good.example'], (async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } })) as unknown as typeof fetch);
  await assert.rejects(redirecting(get('https://good.example/')), /host not allowed/);
});
