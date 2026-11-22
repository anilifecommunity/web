import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { type Env } from './index';

const VERIFIER = 'a'.repeat(64);

function env(): Env {
  return {
    APP_ENV: 'test',
    DISCORD_CLIENT_ID: 'client-id',
    DISCORD_CLIENT_SECRET: 'client-secret',
    ASSETS: { fetch: async () => new Response('asset') },
  } as unknown as Env;
}

function tokenRequest(origin = 'https://anilife.cc'): Request {
  return new Request('https://anilife.cc/api/discord/token', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'authorization-code', codeVerifier: VERIFIER }),
  });
}

test('confidential Discord token exchange retains the PKCE verifier', async () => {
  const originalFetch = globalThis.fetch;
  let form = new URLSearchParams();
  globalThis.fetch = async (_input, init) => {
    form = new URLSearchParams(String(init?.body ?? ''));
    return new Response(JSON.stringify({ access_token: 'token' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const response = await worker.fetch(tokenRequest(), env());
    assert.equal(response.status, 200);
    assert.equal(form.get('code_verifier'), VERIFIER);
    assert.equal(form.get('client_secret'), 'client-secret');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('public Discord fallback retains PKCE and rejects foreign callers', async () => {
  const originalFetch = globalThis.fetch;
  const forms: URLSearchParams[] = [];
  globalThis.fetch = async (_input, init) => {
    forms.push(new URLSearchParams(String(init?.body ?? '')));
    if (forms.length === 1) {
      return new Response(JSON.stringify({ error: 'invalid_client' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ access_token: 'token' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const response = await worker.fetch(tokenRequest(), env());
    assert.equal(response.status, 200);
    assert.equal(forms.length, 2);
    assert.equal(forms[0].get('code_verifier'), VERIFIER);
    assert.equal(forms[1].get('code_verifier'), VERIFIER);
    assert.equal(forms[1].has('client_secret'), false);

    const foreign = await worker.fetch(tokenRequest('https://evil.example'), env());
    assert.equal(foreign.status, 403);
    assert.equal((await foreign.json() as { error: string }).error, 'cross_origin_denied');
    assert.equal(forms.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
