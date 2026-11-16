import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { type Env } from './index';
import { createGateToken, GATE_COOKIE } from './gate';

const GATE_SECRET = 'gate-secret';
const WATCH_SECRET = 'watch-secret';

function env(watchKey = WATCH_SECRET): Env {
  return {
    APP_ENV: 'production',
    TURNSTILE_SECRET: 'turnstile-secret',
    GATE_SIGNING_KEY: GATE_SECRET,
    ...(watchKey ? { WATCH_TOKEN_KEY: watchKey } : {}),
    ASSETS: { fetch: async () => new Response('asset') },
  } as unknown as Env;
}

async function request(path: string, gate: string, init: RequestInit = {}): Promise<Response> {
  return worker.fetch(new Request(`https://anilife.cc${path}`, {
    ...init,
    headers: {
      Origin: 'https://anilife.cc',
      Cookie: `${GATE_COOKIE}=${gate}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  }), env());
}

test('watch routes mint, validate and reject copied or tampered sessions', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === 'https://graphql.anilist.co') {
      return new Response(JSON.stringify({
        data: { Media: { status: 'FINISHED', episodes: 28, nextAiringEpisode: null } },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return originalFetch(input);
  };
  try {
    const gate = await createGateToken(GATE_SECRET);
    const createdResponse = await request('/api/watch/session', gate, {
      method: 'POST',
      body: JSON.stringify({ aniListId: 154587, episode: 6 }),
    });
    assert.equal(createdResponse.status, 200);
    const created = await createdResponse.json() as {
      reference: string;
      tag: string;
      token: string;
      aniListId: number;
      episode: number;
      path: string;
    };
    assert.match(created.path, /^\/watch\/[0-9a-f-]{36}\/episode-6-[0-9a-f]{12}$/);
    assert.doesNotMatch(created.path, /154587/);

    const valid = await request('/api/watch/session/validate', gate, {
      method: 'POST',
      body: JSON.stringify(created),
    });
    assert.equal(valid.status, 200);
    assert.equal((await valid.json() as { aniListId: number }).aniListId, 154587);

    const otherGate = await createGateToken(GATE_SECRET);
    const copied = await request('/api/watch/session/validate', otherGate, {
      method: 'POST',
      body: JSON.stringify(created),
    });
    assert.equal(copied.status, 403);

    const tampered = await request('/api/watch/session/validate', gate, {
      method: 'POST',
      body: JSON.stringify({ ...created, episode: 7 }),
    });
    assert.equal(tampered.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolver refuses a verified viewer without a watch authorization', async () => {
  const gate = await createGateToken(GATE_SECRET);
  const response = await request('/api/resolve?aniListId=154587&episode=1&audio=sub', gate);
  assert.equal(response.status, 401);
  assert.equal((await response.json() as { error: string }).error, 'watch_session_required');
});

test('production fails closed when the watch secret is absent', async () => {
  const gate = await createGateToken(GATE_SECRET);
  const response = await worker.fetch(new Request(
    'https://anilife.cc/api/resolve?aniListId=154587&episode=1&audio=sub',
    {
      headers: {
        Origin: 'https://anilife.cc',
        Cookie: `${GATE_COOKIE}=${gate}`,
        'X-Anilife-Watch': '1.not-a-real-token.but-present',
        'X-Anilife-Watch-Reference': '01a1dff1-a48d-71ff-8931-4f1c0ae8e860',
        'X-Anilife-Watch-Tag': 'cf01ae4cd9ba',
      },
    }
  ), env(''));
  assert.equal(response.status, 503);
  assert.equal((await response.json() as { error: string }).error, 'watch_sessions_not_configured');
});
