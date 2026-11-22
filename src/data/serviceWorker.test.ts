import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

test('service worker caches only a successful same-origin HTML navigation shell', async () => {
  const source = await readFile(new URL('../../public/sw.js', import.meta.url), 'utf8');
  const handlers = new Map<string, (event: any) => void>();
  const writes: string[] = [];
  const deletes: string[] = [];
  let upstream = new Response('{}', { headers: { 'Content-Type': 'application/json' } });
  const context = {
    URL,
    Response,
    fetch: async () => upstream,
    caches: {
      open: async (name: string) => ({
        put: async (key: string) => { writes.push(`${name}:${key}`); },
      }),
      match: async () => undefined,
      keys: async () => ['anilife-shell-previous', 'anilife-shell-build-test'],
      delete: async (key: string) => { deletes.push(key); return true; },
    },
    self: {
      location: { origin: 'https://anilife.cc', href: 'https://anilife.cc/sw.js?v=build-test' },
      clients: { claim: async () => undefined },
      skipWaiting: async () => undefined,
      addEventListener: (name: string, handler: (event: any) => void) => {
        handlers.set(name, handler);
      },
    },
  };
  vm.runInNewContext(source, context);

  const navigate = async (path: string): Promise<Response> => {
    let handled: Promise<Response> | undefined;
    handlers.get('fetch')?.({
      request: { method: 'GET', mode: 'navigate', url: `https://anilife.cc${path}` },
      respondWith(value: Promise<Response>) { handled = value; },
    });
    assert.ok(handled);
    const response = await handled;
    await new Promise<void>((resolve) => setImmediate(resolve));
    return response;
  };

  await navigate('/downloads/index.json');
  assert.deepEqual(writes, []);

  upstream = new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } });
  await navigate('/anime/1');
  assert.deepEqual(writes, ['anilife-shell-build-test:/index.html']);

  let activation: Promise<unknown> | undefined;
  handlers.get('activate')?.({ waitUntil(value: Promise<unknown>) { activation = value; } });
  assert.ok(activation);
  await activation;
  assert.deepEqual(deletes, ['anilife-shell-previous']);
});
