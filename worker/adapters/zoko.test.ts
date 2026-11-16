import test from 'node:test';
import assert from 'node:assert/strict';
import { buildZokoUrl } from './zoko';

test('builds documented Zoko MAL embed URLs for each supported track', () => {
  assert.equal(buildZokoUrl(21, '1', 'sub'), 'https://zokoanime.video/stream/mal/21/1/sub?color=74cf66');
  assert.equal(buildZokoUrl(21, '2', 'sub', 'hard'), 'https://zokoanime.video/stream/mal/21/2/hsub?color=74cf66');
  assert.equal(buildZokoUrl(21, '3', 'dub'), 'https://zokoanime.video/stream/mal/21/3/dub?color=74cf66');
});

test('refuses an ambiguous audio request', () => {
  assert.throws(() => buildZokoUrl(21, '1', 'unknown'), (error: any) => error.reason === 'audio_unavailable');
});
