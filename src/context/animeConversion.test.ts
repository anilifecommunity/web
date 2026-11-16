import test from 'node:test';
import assert from 'node:assert/strict';
import { convertAniListRelatedManga, convertAniListToAnime, mergeAniListSearchResults } from '../utils/animeConversion';
import { animeMatchesSearch, displayAnimeTitle, displayAniListTitle, isAnimeVisible } from '../utils/animePreferences';
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
  const anime = convertAniListToAnime(media({ status: 'FINISHED', episodes: 134 }));
  assert.equal(anime.status, 'Finished');
  assert.equal(anime.seasons[0].episodes.length, 134);
});

test('unknown releasing metadata stays honest', () => {
  const anime = convertAniListToAnime(media({
    averageScore: undefined,
    duration: undefined,
    episodes: 24,
    genres: undefined,
    popularity: undefined,
    season: undefined,
    seasonYear: undefined,
    status: 'RELEASING',
    format: undefined,
  }));
  assert.equal(anime.seasons[0].episodes.length, 0);
  assert.equal(anime.score, 0);
  assert.equal(anime.year, 0);
  assert.equal(anime.durationMins, 0);
  assert.equal(anime.format, 'Unknown');
  assert.deepEqual(anime.genres, []);
  assert.equal(anime.membersCount, 0);
  assert.equal(anime.hasDub, false);
  assert.equal(anime.hasSub, false);
});

test('unknown duration does not invent a 24 minute runtime', () => {
  const anime = convertAniListToAnime(media({ status: 'FINISHED', episodes: 1, duration: undefined }));
  assert.equal(anime.seasons[0].episodes[0].durationSec, 0);
});

test('title and adult preferences use AniList metadata with safe fallbacks', () => {
  const source = media({
    isAdult: true,
    title: { english: 'English title', romaji: 'Romaji title', native: 'Native title' },
  });
  const anime = convertAniListToAnime(source);
  assert.equal(displayAnimeTitle(anime, 'english'), 'English title');
  assert.equal(displayAnimeTitle(anime, 'romaji'), 'Romaji title');
  assert.equal(displayAnimeTitle(anime, 'native'), 'Native title');
  assert.equal(displayAniListTitle(source.title, 'native'), 'Native title');
  assert.equal(isAnimeVisible(anime, true), false);
  assert.equal(isAnimeVisible(anime, false), true);
});

test('alternate anime titles remain searchable in English, Romaji and native script', () => {
  const anime = convertAniListToAnime(media({
    title: { english: 'The Apothecary Diaries', romaji: 'Kusuriya no Hitorigoto', native: '薬屋のひとりごと' },
    synonyms: ['The Pharmacist Monologues'],
  }));
  assert.equal(animeMatchesSearch(anime, 'apothecary'), true);
  assert.equal(animeMatchesSearch(anime, 'kusuriya'), true);
  assert.equal(animeMatchesSearch(anime, '薬屋'), true);
  assert.equal(animeMatchesSearch(anime, 'pharmacist monologues'), true);
});

test('verified manga relations are deduplicated, source-first and safely linked', () => {
  const source = media({
    relations: {
      edges: [
        { relationType: 'SPIN_OFF', node: media({ id: 2, type: 'MANGA', format: 'MANGA', countryOfOrigin: 'KR', title: { english: 'Side comic', romaji: 'Side Comic' } }) },
        { relationType: 'ADAPTATION', node: media({ id: 1, type: 'MANGA', format: 'MANGA', title: { english: 'Main comic', romaji: 'Main Comic' } }) },
        { relationType: 'SOURCE', node: media({ id: 1, type: 'MANGA', format: 'MANGA', title: { english: 'Main comic', romaji: 'Main Comic' } }) },
        { relationType: 'SOURCE', node: media({ id: 3, type: 'ANIME', title: { english: 'Another anime' } }) },
      ],
    },
  });
  const related = convertAniListRelatedManga(source);
  assert.deepEqual(related.map((item) => item.id), ['1', '2']);
  assert.equal(related[0].relationLabel, 'Source material');
  assert.equal(related[0].siteUrl, 'https://anilist.co/manga/1');
  assert.equal(related[1].formatLabel, 'Manhwa');
  assert.equal(displayAnimeTitle(related[0], 'romaji'), 'Main Comic');
});

test('manga search contributes only verified related anime without duplicates', () => {
  const direct = media({ id: 10, type: 'ANIME' });
  const related = media({ id: 11, type: 'ANIME' });
  const manga = media({
    id: 20,
    type: 'MANGA',
    relations: { edges: [{ node: direct }, { node: related }, { node: media({ id: 21, type: 'MANGA' }) }] },
  });
  assert.deepEqual(mergeAniListSearchResults([direct], [manga]).map((item) => item.id), [10, 11]);
});
