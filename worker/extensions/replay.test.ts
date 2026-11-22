import test from 'node:test';
import assert from 'node:assert/strict';
import { runWithReplay, type HostImports, type HttpRequest, type HttpResponse } from './replay';

const enc = (s: string): HttpResponse => ({ status: 200, headers: [], body: new TextEncoder().encode(s) });
const dec = (b: Uint8Array) => new TextDecoder().decode(b);
const req = (url: string): HttpRequest => ({ method: 'GET', url, headers: [['Referer', 'https://a.example/']], body: undefined });


test('multi-step flow: each request is fetched once and earlier answers are replayed', async () => {
  const fetched: string[] = [];
  const out = await runWithReplay({
    cache: new Map(), query: { n: 7 },
    instantiate: (host) => (q: { n: number }) => {
      const a = dec(host.http(req('https://a.example/search')).body);
      const b = dec(host.http(req(`https://a.example/ep/${a}`)).body);
      return { a, b, n: q.n };
    },
    fetchAsync: async (r) => { fetched.push(r.url); return enc(r.url.endsWith('search') ? 'slug' : 'video'); },
  });
  assert.deepEqual(out, { a: 'slug', b: 'video', n: 7 });
  assert.deepEqual(fetched, ['https://a.example/search', 'https://a.example/ep/slug']);
});

test('an extension that swallows the abort and returns Err does not poison the cache or finish early', async () => {
  const cache = new Map();
  const logs: string[] = [];
  const out = await runWithReplay({
    cache, query: {}, onLog: (l) => logs.push(l),
    instantiate: (host) => () => {
      host.log('lookup');
      let body: string | null = null;
      try { body = dec(host.http(req('https://a.example/x')).body); } catch { /* extension treats it as "not found" */ }
      if (body === null) { host.cacheSet('slug', 'NOT_FOUND', 60); throw Object.assign(new Error('x'), { payload: 'not found' }); }
      host.cacheSet('slug', body, 60);
      return body;
    },
    fetchAsync: async () => enc('real'),
  });
  assert.equal(out, 'real');
  assert.equal(cache.get('slug').value, 'real');
  assert.deepEqual(logs, ['lookup']); // aborted run's log dropped
});

test('cache reads are replayed so a mid-run cache write cannot change the path', async () => {
  const cache = new Map();
  const fetched: string[] = [];
  const out = await runWithReplay({
    cache, query: {},
    instantiate: (host) => () => {
      const hit = host.cacheGet('k');
      if (hit === undefined) host.cacheSet('k', 'v', 60);
      const r = host.http(req(`https://a.example/${hit ?? 'miss'}`));
      return dec(r.body);
    },
    fetchAsync: async (r) => { fetched.push(r.url); return enc('ok'); },
  });
  assert.equal(out, 'ok');
  assert.deepEqual(fetched, ['https://a.example/miss']); // replay saw the original miss, not its own write
  assert.equal(cache.get('k').value, 'v');
});

test('fetch failures reach the extension as errors', async () => {
  await assert.rejects(runWithReplay({
    cache: new Map(), query: {},
    instantiate: (host) => () => { try { host.http(req('https://a.example/')); } catch (e) { throw e; } return 1; },
    fetchAsync: async () => { throw new Error('host not allowed: evil'); },
  }), /host not allowed: evil/);
});

test('non-deterministic extensions are rejected', async () => {
  let call = 0;
  await assert.rejects(runWithReplay({
    cache: new Map(), query: {},
    instantiate: (host) => () => {
      call++;
      host.http(req('https://a.example/first'));
      host.http(req(`https://a.example/t=${call}`)); // changes every replay
      return 1;
    },
    fetchAsync: async () => enc('x'),
  }), /not deterministic/);
});

test('request cap', async () => {
  await assert.rejects(runWithReplay({
    cache: new Map(), query: {}, maxRequests: 3,
    instantiate: (host) => () => { for (let i = 0; i < 10; i++) host.http(req(`https://a.example/${i}`)); return 1; },
    fetchAsync: async () => enc('x'),
  }), /too many requests/);
});
