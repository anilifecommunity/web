import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRoute, shouldPushRoute, TAB_PATHS } from './urlRoute';

test('loads downloads as a first-class route', () => {
  assert.deepEqual(parseRoute('/downloads'), { kind: 'tab', tab: 'downloads' });
  assert.deepEqual(parseRoute('/downloads/'), { kind: 'tab', tab: 'downloads' });
  assert.equal(TAB_PATHS.downloads, '/downloads');
});

test('back and forward route parsing keeps downloads distinct from home', () => {
  assert.deepEqual(
    ['/downloads', '/discover', '/downloads'].map(parseRoute),
    [
      { kind: 'tab', tab: 'downloads' },
      { kind: 'tab', tab: 'search' },
      { kind: 'tab', tab: 'downloads' },
    ]
  );
});

test('secure watch routes carry only an opaque reference and episode slug', () => {
  const reference = '01a1dff1-a48d-71ff-8931-4f1c0ae8e860';
  assert.deepEqual(parseRoute(`/watch/${reference}/episode-6-cf01ae4cd9ba`), {
    kind: 'watch',
    reference,
    episode: 6,
    tag: 'cf01ae4cd9ba',
  });
  assert.deepEqual(parseRoute(`/activity/watch/${reference}/episode-6-cf01ae4cd9ba`), {
    kind: 'watch',
    reference,
    episode: 6,
    tag: 'cf01ae4cd9ba',
  });
});

test('legacy watch routes are distinguished for safe migration', () => {
  assert.deepEqual(parseRoute('/anime/154587/watch/6'), {
    kind: 'legacyWatch',
    id: '154587',
    episode: 6,
  });
});

test('unknown and malformed paths stay distinct from home', () => {
  assert.deepEqual(parseRoute('/missing-page'), { kind: 'notFound', path: '/missing-page' });
  assert.deepEqual(parseRoute('/anime/154587/extra'), { kind: 'notFound', path: '/anime/154587/extra' });
  assert.deepEqual(parseRoute('/anime/154587/watch/nope'), { kind: 'notFound', path: '/anime/154587/watch/nope' });
  assert.deepEqual(parseRoute('/activity/missing-page'), { kind: 'notFound', path: '/activity/missing-page' });
});

test('episode changes create history while closing a watch route does not', () => {
  const first = '/watch/01a1dff1-a48d-71ff-8931-4f1c0ae8e860/episode-1-cf01ae4cd9ba';
  const second = '/watch/11a1dff1-a48d-71ff-8931-4f1c0ae8e860/episode-2-af01ae4cd9bb';
  assert.equal(shouldPushRoute('/anime/154587', first), true);
  assert.equal(shouldPushRoute(first, second), true);
  assert.equal(shouldPushRoute(second, '/anime/154587'), false);
});
