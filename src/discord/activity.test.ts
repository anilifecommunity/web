import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeDiscordGate } from './activity';
import { getGateStatus, setGateToken } from '../utils/workerApi';

test('Discord is ready only after the playback gate returns a usable token', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === '/api/gate/discord') {
      return new Response(JSON.stringify({ ok: true, gate: 'gate-token' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    assert.equal(url, '/api/gate/status');
    assert.equal(new Headers(init?.headers).get('X-Anilife-Gate'), 'gate-token');
    return new Response(JSON.stringify({ passed: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    await authorizeDiscordGate('discord-token');
    assert.equal(await getGateStatus(), true);
  } finally {
    setGateToken(null);
    globalThis.fetch = originalFetch;
  }
});

test('Discord gate failure is not reported as connected readiness', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
  try {
    await assert.rejects(
      () => authorizeDiscordGate('discord-token'),
      /Anilife verification failed/
    );
  } finally {
    setGateToken(null);
    globalThis.fetch = originalFetch;
  }
});
