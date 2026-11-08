import test from 'node:test';
import assert from 'node:assert/strict';
import { convertAniListToAnime } from '../utils/animeConversion';
import type { AniListMedia } from '../utils/anilistApi';

function media(overrides: Partial<AniListMedia> = {}): AniListMedia {
  return {
    id: 219714,
    title: { english: 'SPY x FAMILY Season 4', romaji: 'SPY x FAMILY Season 4' },
    coverImage: { extraLarge: 'https://example.com/poster.jpg' },
    bannerImage: 'https://example.com/banner.jpg',
    averageScore: 80,
    format: 'TV',
    status: 'NOT_YET_RELEASED',
    seasonYear: 2026,
    season: 'FALL',
    genres: ['Action'],
    duration: 24,
    ...overrides,
  };
}

test('a not-yet-released anime has no playable episodes', () => {
  const anime = convertAniListToAnime(media());
  assert.equal(anime.status, 'Not Yet Aired');
  assert.equal(anime.seasons[0].episodes.length, 0);
});

test('a releasing anime only exposes episodes before the next airing', () => {
  const anime = convertAniListToAnime(
    media({
      status: 'RELEASING',
      episodes: 12,
      nextAiringEpisode: { episode: 6, airingAt: 1_800_000_000, timeUntilAiring: 86_400 },
    })
  );
  assert.equal(anime.status, 'Releasing');
  assert.equal(anime.seasons[0].episodes.length, 5);
  assert.deepEqual(anime.nextEpisode, { number: 6, airingAt: 1_800_000_000 });
});

test('a finished anime exposes its full episode count', () => {
  const anime = convertAniListToAnime(media({ status: 'FINISHED', episodes: 12 }));
  assert.equal(anime.status, 'Finished');
  assert.equal(anime.seasons[0].episodes.length, 12);
});
