import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { isAppNavigationPath, type Env } from './index';

function env(): Env {
  return {
    APP_ENV: 'test',
    ASSETS: {
      fetch: async () => new Response('<!doctype html><div id="root"></div>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    },
  } as unknown as Env;
}

test('the Worker and client share strict public route shapes', () => {
  assert.equal(isAppNavigationPath('/'), true);
  assert.equal(isAppNavigationPath('/downloads'), true);
  assert.equal(isAppNavigationPath('/anime/154587'), true);
  assert.equal(isAppNavigationPath('/anime/154587/watch/6'), true);
  assert.equal(isAppNavigationPath('/activity/discover'), true);
  assert.equal(isAppNavigationPath('/missing-page'), false);
  assert.equal(isAppNavigationPath('/anime/154587/extra'), false);
  assert.equal(isAppNavigationPath('/watch/not-a-reference/episode-1-bad'), false);
});
test('unknown navigation returns the app error shell with a genuine 404', async () => {
  const response = await worker.fetch(new Request('https://anilife.cc/missing-page', {
    headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' },
  }), env());
  assert.equal(response.status, 404);
  assert.match(response.headers.get('Content-Type') ?? '', /text\/html/);
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(response.headers.get('X-Anilife-Error-Class'), 'request');
  assert.match(await response.text(), /id="root"/);
});

test('valid deep links stay successful and unsupported methods declare Allow', async () => {
  const deepLink = await worker.fetch(new Request('https://anilife.cc/anime/154587'), env());
  assert.equal(deepLink.status, 200);

  const apiMethod = await worker.fetch(new Request('https://anilife.cc/api/health', { method: 'POST' }), env());
  assert.equal(apiMethod.status, 405);
  assert.equal(apiMethod.headers.get('Allow'), 'GET');
  assert.equal((await apiMethod.json() as { error: string }).error, 'method_not_allowed');

  const pageMethod = await worker.fetch(new Request('https://anilife.cc/settings', { method: 'POST' }), env());
  assert.equal(pageMethod.status, 405);
  assert.equal(pageMethod.headers.get('Allow'), 'GET, HEAD');
});

