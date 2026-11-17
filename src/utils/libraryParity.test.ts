import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContinueWatchingEntry, WatchlistEntry } from '../types/anime';
import {
  mergeContinueWatching,
  mergeLibraryEntries,
  remoteContinueEpisode,
  remoteContinueSeed,
} from './libraryParity';

const listEntry = (animeId: string, status: WatchlistEntry['status'], updatedAt: string): WatchlistEntry => ({
  animeId,
  status,
  updatedAt,
});

const historyEntry = (
  animeId: string,
  episodeNumber: number,
  updatedAt: string,
  fromRemote = false
): ContinueWatchingEntry => ({
  animeId,
  episodeNumber,
  currentTimeSec: fromRemote ? 0 : 400,
  durationSec: fromRemote ? 0 : 1_400,
  serverName: fromRemote ? 'auto' : 'zoko',
  audioMode: 'DUB',
  updatedAt,
  fromRemote,
});

test('library merge preserves local-only rows, deduplicates ids and applies remote fields', () => {
  const local = [
    listEntry('1', 'Plan to watch', '2026-01-01T00:00:00.000Z'),
    listEntry('2', 'Watching', '2026-01-02T00:00:00.000Z'),
  ];
  const remote = [{
    ...listEntry('2', 'Rewatching', '2026-01-03T00:00:00.000Z'),
    progress: 4,
    score: 88,
  }, listEntry('2', 'Dropped', '2025-12-01T00:00:00.000Z')];

  const merged = mergeLibraryEntries(local, remote);

  assert.deepEqual(merged.map((entry) => entry.animeId), ['2', '1']);
  assert.deepEqual(merged[0], { ...remote[0] });
});

test('remote continue target never advances a caught-up title to an unreleased episode', () => {
  assert.equal(remoteContinueEpisode({
    animeId: '1', status: 'CURRENT', progress: 8, totalEpisodes: 12,
    nextEpisodeNumber: 9, updatedAt: '2026-01-01T00:00:00.000Z',
  }), 8);
  assert.equal(remoteContinueEpisode({
    animeId: '1', status: 'CURRENT', progress: 7, totalEpisodes: 12,
    nextEpisodeNumber: 9, updatedAt: '2026-01-01T00:00:00.000Z',
  }), 8);
  assert.equal(remoteContinueEpisode({
    animeId: '1', status: 'COMPLETED', progress: 12, totalEpisodes: 12,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }), null);
});

test('remote progress advances a local row while preserving its playback preferences', () => {
  const local = historyEntry('1', 3, '2026-01-01T00:00:00.000Z');
  const seed = remoteContinueSeed({
    animeId: '1', status: 'CURRENT', progress: 8, totalEpisodes: 12,
    updatedAt: '2026-01-02T00:00:00.000Z',
  });
  assert.ok(seed);

  const [merged] = mergeContinueWatching([local], [seed]);

  assert.equal(merged.episodeNumber, 9);
  assert.equal(merged.currentTimeSec, 0);
  assert.equal(merged.serverName, 'zoko');
  assert.equal(merged.audioMode, 'DUB');
  assert.equal(merged.fromRemote, false);
});

test('remote progress never regresses local playback and stale remote-only rows disappear', () => {
  const local = historyEntry('1', 10, '2026-01-03T00:00:00.000Z');
  const staleRemote = historyEntry('2', 4, '2026-01-01T00:00:00.000Z', true);
  const seed = historyEntry('1', 9, '2026-01-02T00:00:00.000Z', true);

  assert.deepEqual(mergeContinueWatching([local, staleRemote], [seed]), [local]);
});
