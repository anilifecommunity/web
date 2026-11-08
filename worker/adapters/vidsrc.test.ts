import test from 'node:test';
import assert from 'node:assert/strict';
import { findAniZipEpisode } from './anizip';
import { buildEmbedUrl } from './vidsrc';

test('maps an AniList episode to its TMDB season and episode', () => {
  const mapping = {
    episodes: {
      '1': { seasonNumber: 3, episodeNumber: 13 },
      '2': { seasonNumber: 3, episodeNumber: 14 },
    },
  };
  assert.deepEqual(findAniZipEpisode(mapping, '2'), { season: 3, episode: 14 });
});

test('falls back to an absolute episode number when the key is missing', () => {
  const mapping = {
    episodes: {
      a: { seasonNumber: 2, episodeNumber: 5, absoluteEpisodeNumber: 17 },
    },
  };
  assert.deepEqual(findAniZipEpisode(mapping, '17'), { season: 2, episode: 5 });
});

test('builds TV and movie embed URLs', () => {
  assert.equal(
    buildEmbedUrl('127532', false, 1, 1),
    'https://vidsrc.to/embed/tv/127532/1/1'
  );
  assert.equal(buildEmbedUrl('127532', true, 1, 1), 'https://vidsrc.to/embed/movie/127532');
});
