import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRoute, TAB_PATHS } from './urlRoute';

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
