import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AniListRequestError,
  buildAniListOAuthUrl,
  clearOAuthToken,
  consumePendingOAuthState,
  createOAuthState,
  isAniListAuthError,
  loadOAuthToken,
  parseOAuthReturn,
  saveOAuthToken,
  savePendingOAuthState,
  type OAuthStorage,
} from './oauth';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
  } as Storage;
}

function storage(initial: { local?: Record<string, string>; session?: Record<string, string> } = {}): OAuthStorage {
  return {
    local: memoryStorage(initial.local),
    session: memoryStorage(initial.session),
  };
}

test('durable token storage survives a new session and clears on logout', () => {
  const store = storage();
  saveOAuthToken('token-123', store);
  assert.equal(store.local.getItem('anilife_oauth_token_v2'), 'token-123');
  assert.equal(loadOAuthToken(store), 'token-123');
  clearOAuthToken(store);
  assert.equal(loadOAuthToken(store), null);
});

test('a legacy session token is migrated once', () => {
  const store = storage({ session: { anilife_oauth_token: 'legacy-token' } });
  assert.equal(loadOAuthToken(store), 'legacy-token');
  assert.equal(store.local.getItem('anilife_oauth_token_v2'), 'legacy-token');
  assert.equal(store.session.getItem('anilife_oauth_token'), null);
  assert.equal(loadOAuthToken(store), 'legacy-token');
});

test('OAuth state is random, one-use and must match exactly', () => {
  const session = memoryStorage();
  const first = createOAuthState();
  const second = createOAuthState();
  assert.ok(first.length >= 32);
  assert.notEqual(first, second);

  savePendingOAuthState(first, session);
  assert.equal(consumePendingOAuthState(first, session), true);
  assert.equal(consumePendingOAuthState(first, session), false, 'replay must fail');

  savePendingOAuthState(first, session);
  assert.equal(consumePendingOAuthState(second, session), false);
  assert.equal(consumePendingOAuthState(first, session), false, 'mismatch consumes the state');

  assert.equal(consumePendingOAuthState('missing', memoryStorage()), false);
});

test('OAuth return parsing reads the bearer only from the fragment', () => {
  const fragment = parseOAuthReturn(
    '#access_token=fragment-token&state=state-123',
    '?access_token=query-token&error=access_denied&error_description=Denied'
  );
  assert.equal(fragment.token, 'fragment-token');
  assert.equal(fragment.state, 'state-123');
  assert.equal(fragment.error, 'access_denied');
  assert.equal(fragment.errorDescription, 'Denied');

  const queryOnly = parseOAuthReturn('', '?access_token=query-token');
  assert.equal(queryOnly.token, undefined);
});

test('the authorize URL includes the client id, token response type and state', () => {
  const url = new URL(buildAniListOAuthUrl('12345', 'state-abc'));
  assert.equal(url.origin, 'https://anilist.co');
  assert.equal(url.searchParams.get('client_id'), '12345');
  assert.equal(url.searchParams.get('response_type'), 'token');
  assert.equal(url.searchParams.get('state'), 'state-abc');
});

test('only a proven authentication rejection is treated as an auth failure', () => {
  assert.equal(isAniListAuthError(new AniListRequestError('Invalid token', 401)), true);
  assert.equal(isAniListAuthError(new AniListRequestError('Server error', 500)), false);
  assert.equal(isAniListAuthError(new Error('network')), false);
});

test('the callback asset uses state, the fragment and durable storage', () => {
  const html = readFileSync(new URL('../../public/auth/callback.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../../public/auth/callback.js', import.meta.url), 'utf8');
  assert.match(html, /src="\/auth\/callback\.js"/);
  assert.doesNotMatch(html, /<script>[^<]/);
  assert.match(script, /anilife_oauth_state_v1/);
  assert.match(script, /anilife_oauth_token_v2/);
  assert.match(script, /history\.replaceState/);
  assert.match(script, /window\.location\.replace\('\/'\)/);
  assert.doesNotMatch(script, /queryParams\.get\('access_token'\)/);
  assert.doesNotMatch(script, /OAUTH_AUTH_SUCCESS/);
  assert.doesNotMatch(script, /window\.opener/);
});

test('the document theme bootstrap is an external same-origin script', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../../public/theme-init.js', import.meta.url), 'utf8');
  assert.match(html, /src="\/theme-init\.js"/);
  assert.doesNotMatch(html, /<script>[^<]/);
  assert.match(script, /anilife_settings_v3/);
  assert.match(script, /--anilife-accent/);
});

test('the dev server does not rewrite the callback to a missing index', () => {
  const config = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(config, /auth\/callback\/index\.html/);
});
