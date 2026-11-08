import test from 'node:test';
import assert from 'node:assert/strict';
import type { Anime } from '../types/anime';
import { getAnimeAniListId } from './animeData';
import { enabledServerIds, resolveServerOrder, webServerOptions } from './providerOptions';

function sample(id: string, aniListId?: number): Anime {
  return { id, anilistId: aniListId } as unknown as Anime;
}

test('an unknown title never resolves to another series', () => {
  const id = getAnimeAniListId(sample('a-title-that-is-not-mapped'));
  assert.ok(Number.isNaN(id));
});

test('a known AniList id is returned unchanged', () => {
  assert.equal(getAnimeAniListId(sample('local', 151807)), 151807);
});

test('a numeric local id is treated as the AniList id', () => {
  assert.equal(getAnimeAniListId(sample('151807')), 151807);
});

test('an absent server list enables every attemptable server', () => {
  const all = webServerOptions().map((option) => option.id);
  assert.deepEqual(enabledServerIds(undefined), all);
  assert.deepEqual(enabledServerIds([]), all);
});

test('an explicit enable list is preserved without re-adding disabled servers', () => {
  const all = webServerOptions().map((option) => option.id);
  assert.ok(all.length >= 2);
  const onlySecond = [all[1]];
  assert.deepEqual(enabledServerIds(onlySecond), onlySecond);
});

test('resolve order puts the preferred server first and drops disabled servers', () => {
  const options = webServerOptions();
  const ids = options.map((option) => option.id);
  const enabled = [ids[1], ids[0]];
  assert.deepEqual(resolveServerOrder(options, ids[1], enabled), [ids[1], ids[0]]);
  assert.deepEqual(resolveServerOrder(options, ids[0], [ids[0]]), [ids[0]]);
});
