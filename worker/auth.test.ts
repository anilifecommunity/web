import assert from 'node:assert/strict';
import test from 'node:test';
import type { D1Database } from '@cloudflare/workers-types';
import worker, { type Env } from './index';
import { authBaseUrl, authConfigured, sessionCookieName } from './auth';

function env(overrides: Partial<Env> = {}): Env {
  return {
    APP_ENV: 'production',
    DISCORD_CLIENT_ID: 'discord-client',
    DISCORD_CLIENT_SECRET: 'discord-secret',
    BETTER_AUTH_SECRET: 'a'.repeat(32),
    ANILIFE_CLOUD_DB: {} as D1Database,
    ASSETS: { fetch: async () => new Response('asset') },
    ...overrides,
  } as unknown as Env;
}

test('cloud auth fails closed unless every private binding is configured', async () => {
  assert.equal(authConfigured(env()), true);
  assert.equal(authConfigured(env({ ANILIFE_CLOUD_DB: undefined })), false);
  assert.equal(authConfigured(env({ BETTER_AUTH_SECRET: 'too-short' })), false);
  assert.equal(authConfigured(env({ DISCORD_CLIENT_SECRET: undefined })), false);
  assert.equal(authConfigured(env({ AUTH_BASE_URL: 'http://anilife.cc' })), false);
  assert.equal(authBaseUrl(env({ AUTH_BASE_URL: 'https://anilife.cc/api/auth' })), null);
  assert.equal(
    authBaseUrl(env({ APP_ENV: 'development', AUTH_BASE_URL: 'http://localhost:8787' })),
    'http://localhost:8787',
  );
  assert.equal(sessionCookieName(env({ AUTH_BASE_URL: 'https://anilife.cc' })), '__Host-anilife-session');
  assert.equal(
    sessionCookieName(env({ APP_ENV: 'development', AUTH_BASE_URL: 'http://localhost:8787' })),
    'anilife-session',
  );

  const response = await worker.fetch(
    new Request('https://anilife.cc/api/auth/get-session'),
    env({ ANILIFE_CLOUD_DB: undefined }),
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json() as { error: string }).error, 'cloud_auth_not_configured');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
});
