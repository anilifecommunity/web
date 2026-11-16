import test from 'node:test';
import assert from 'node:assert/strict';
import type { Anime, Episode } from '../types/anime';
import { canWatchEpisode, selectAiredEpisodes } from './episodeAvailability';

function episode(number: number, airedDate?: string): Episode {
  return {
    id: `ep-${number}`,
    number,
    title: `Episode ${number}`,
    durationSec: 1_440,
    thumbnail: '',
    videoUrl: '',
    airedDate,
  };
}

function anime(overrides: Partial<Anime> = {}): Anime {
  return {
    id: '1',
    title: 'Fixture',
    bannerImage: '',
    posterImage: '',
    score: 0,
    format: 'TV',
    year: 0,
    status: 'Releasing',
    durationMins: 0,
    genres: [],
    synopsis: '',
    studio: '',
    startDate: '',
    seasonName: '',
    membersCount: 0,
    hasDub: false,
    hasSub: false,
    seasons: [{ id: 's1', number: 1, title: 'Season 1', year: 0, episodes: [] }],
    related: [],
    ...overrides,
  };
}

test('not-yet-released titles expose no episode cards', () => {
  const item = anime({
    status: 'Not Yet Aired',
    seasons: [{ id: 's1', number: 1, title: 'Season 1', year: 0, episodes: [episode(1)] }],
  });
  assert.deepEqual(selectAiredEpisodes(item, Date.UTC(2026, 10, 15)), []);
  assert.equal(canWatchEpisode(item, 1, Date.UTC(2026, 10, 15)), false);
});

test('a 3 of 24 release exposes only episodes before the next airing', () => {
  const item = anime({
    nextEpisode: { number: 4, airingAt: 1_800_000_000 },
    seasons: [{
      id: 's1',
      number: 1,
      title: 'Season 1',
      year: 2026,
      episodes: Array.from({ length: 24 }, (_, index) => episode(index + 1)),
    }],
  });
  assert.deepEqual(selectAiredEpisodes(item).map((entry) => entry.number), [1, 2, 3]);
  assert.equal(canWatchEpisode(item, 4), false);
});

test('finished long series are not capped at 24 episodes', () => {
  const item = anime({
    status: 'Finished',
    seasons: [{
      id: 's1',
      number: 1,
      title: 'Season 1',
      year: 2000,
      episodes: Array.from({ length: 134 }, (_, index) => episode(index + 1)),
    }],
  });
  assert.equal(selectAiredEpisodes(item).length, 134);
});

test('unknown releasing metadata does not invent playable episodes', () => {
  const item = anime({
    seasons: [{ id: 's1', number: 1, title: 'Season 1', year: 0, episodes: [episode(1)] }],
  });
  assert.deepEqual(selectAiredEpisodes(item), []);
});

test('explicit future dates stay unavailable even on a finished title', () => {
  const item = anime({
    status: 'Finished',
    seasons: [{
      id: 's1',
      number: 1,
      title: 'Season 1',
      year: 2026,
      episodes: [episode(1, '2026-11-14T00:00:00Z'), episode(2, '2026-11-16T00:00:00Z')],
    }],
  });
  assert.deepEqual(
    selectAiredEpisodes(item, Date.parse('2026-11-15T00:00:00Z')).map((entry) => entry.number),
    [1]
  );
});
