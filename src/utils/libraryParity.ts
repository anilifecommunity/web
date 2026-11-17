import type { ContinueWatchingEntry, WatchlistEntry } from '../types/anime';

export interface RemoteProgressSnapshot {
  animeId: string;
  status: string;
  progress: number;
  totalEpisodes?: number;
  nextEpisodeNumber?: number;
  updatedAt: string;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestFirst<T extends { updatedAt: string }>(entries: T[]): T[] {
  return entries.sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt));
}

/** Additive local + AniList merge. Remote fields win for the same AniList media id. */
export function mergeLibraryEntries(
  localEntries: WatchlistEntry[],
  remoteEntries: WatchlistEntry[]
): WatchlistEntry[] {
  const latestById = (entries: WatchlistEntry[]) => {
    const result = new Map<string, WatchlistEntry>();
    for (const entry of entries) {
      const current = result.get(entry.animeId);
      if (!current || timestamp(entry.updatedAt) >= timestamp(current.updatedAt)) {
        result.set(entry.animeId, entry);
      }
    }
    return result;
  };
  const byId = latestById(localEntries);
  for (const entry of latestById(remoteEntries).values()) {
    const local = byId.get(entry.animeId);
    byId.set(entry.animeId, local ? { ...local, ...entry } : entry);
  }
  return latestFirst([...byId.values()]);
}
/**
 * Convert a list-service episode count into the episode a Continue Watching row should offer.
 * Caught-up airing titles rest on the latest aired episode instead of pointing at an unreleased one.
 */
export function remoteContinueEpisode(snapshot: RemoteProgressSnapshot): number | null {
  if (!['CURRENT', 'REPEATING'].includes(snapshot.status) || snapshot.progress < 1) return null;
  if (snapshot.totalEpisodes && snapshot.progress >= snapshot.totalEpisodes) return null;
  if (snapshot.nextEpisodeNumber && snapshot.nextEpisodeNumber > 1) {
    const latestAired = snapshot.nextEpisodeNumber - 1;
    return snapshot.progress >= latestAired ? latestAired : snapshot.progress + 1;
  }
  return snapshot.progress + 1;
}

export function remoteContinueSeed(
  snapshot: RemoteProgressSnapshot
): ContinueWatchingEntry | null {
  const episodeNumber = remoteContinueEpisode(snapshot);
  if (episodeNumber === null) return null;
  return {
    animeId: snapshot.animeId,
    episodeNumber,
    currentTimeSec: 0,
    durationSec: 0,
    serverName: 'auto',
    audioMode: 'SUB',
    updatedAt: snapshot.updatedAt,
    fromRemote: true,
  };
}

/**
 * Merge account progress into profile-scoped playback history.
 * A locally played row keeps its clock/provider/audio unless the account is strictly farther ahead.
 */
export function mergeContinueWatching(
  localEntries: ContinueWatchingEntry[],
  remoteSeeds: ContinueWatchingEntry[]
): ContinueWatchingEntry[] {
  const remoteIds = new Set(remoteSeeds.map((entry) => entry.animeId));
  const byId = new Map<string, ContinueWatchingEntry>();

  for (const entry of localEntries) {
    if (entry.fromRemote && !remoteIds.has(entry.animeId)) continue;
    const current = byId.get(entry.animeId);
    if (!current || timestamp(entry.updatedAt) > timestamp(current.updatedAt)) {
      byId.set(entry.animeId, entry);
    }
  }

  for (const seed of remoteSeeds) {
    const current = byId.get(seed.animeId);
    if (!current) {
      byId.set(seed.animeId, seed);
      continue;
    }
    if (current.fromRemote) {
      if (timestamp(seed.updatedAt) >= timestamp(current.updatedAt)) byId.set(seed.animeId, seed);
      continue;
    }
    if (seed.episodeNumber > current.episodeNumber) {
      byId.set(seed.animeId, {
        ...current,
        episodeNumber: seed.episodeNumber,
        currentTimeSec: 0,
        durationSec: 0,
        updatedAt:
          timestamp(seed.updatedAt) > timestamp(current.updatedAt)
            ? seed.updatedAt
            : current.updatedAt,
        fromRemote: false,
      });
    }
  }

  return latestFirst([...byId.values()]);
}

