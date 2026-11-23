import assert from 'node:assert/strict';
import test from 'node:test';
import { createWatchSession, loadWatchSession, resolveEpisode, WatchSessionError, type WatchSession } from './workerApi';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => void values.delete(key),
    setItem: (key: string, value: string) => void values.set(key, String(value)),
  } as Storage;
}

test('one anime authorization survives a browser restart and covers another released episode', async () => {
  const originalFetch = globalThis.fetch;
  const originalLocal = globalThis.localStorage;
  const originalSession = globalThis.sessionStorage;
  const stored: WatchSession = {
    reference: '01a1dff1-a48d-71ff-8931-4f1c0ae8e860',
    tag: 'cf01ae4cd9ba',
    aniListId: 154587,
    episode: 1,
    expiresAt: 4_000_000_000,
  };
  let created = 0;
  let validated = 0;
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true });
  globalThis.fetch = async (input) => {
    const path = new URL(input instanceof Request ? input.url : String(input), 'https://anilife.cc').pathname;
    if (path === '/api/watch/session/validate') {
      validated += 1;
      return new Response(JSON.stringify({ ok: true, aniListId: 154587, episode: 2 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    created += 1;
    return new Response(JSON.stringify({ ok: true, ...stored }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const first = await createWatchSession(154587, 1);
    assert.doesNotMatch(
      Array.from({ length: localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index) ?? '')).join(''),
      /\"token\"/
    );
    Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true });
    const second = await createWatchSession(154587, 2);
    assert.equal(first.reference, second.reference);
    assert.equal(second.episode, 2);
    assert.equal(loadWatchSession(second.reference, 2)?.episode, 2);
    assert.equal(created, 1);
    assert.equal(validated, 1);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'localStorage', { value: originalLocal, configurable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: originalSession, configurable: true });
  }
});

test('watch creation preserves the Worker reason for an expired browser verification', async () => {
  const originalFetch = globalThis.fetch;
  const originalLocal = globalThis.localStorage;
  const originalSession = globalThis.sessionStorage;
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true });
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: 'verification_required' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    await assert.rejects(
      createWatchSession(154587, 1),
      (error: unknown) => error instanceof WatchSessionError && error.status === 401 && error.code === 'verification_required'
    );
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'localStorage', { value: originalLocal, configurable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: originalSession, configurable: true });
  }
});

test('resolver requests preserve the adult-content preference', async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ ok: false, error: 'provider_unavailable' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await resolveEpisode({ aniListId: 21, episode: 1, audio: 'sub', hideAdult: true });
    await resolveEpisode({ aniListId: 21, episode: 1, audio: 'sub', hideAdult: false });
    assert.equal(new URL(urls[0], 'https://anilife.cc').searchParams.get('hideAdult'), '1');
    assert.equal(new URL(urls[1], 'https://anilife.cc').searchParams.get('hideAdult'), '0');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
