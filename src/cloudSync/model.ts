import type { AppSettings, ContinueWatchingEntry, UserProfile, WatchlistEntry, WatchStatus } from '../types/anime';

export type CloudEntityType =
  | 'profile'
  | 'portable_setting'
  | 'watchlist'
  | 'watched_episode'
  | 'continue_progress'
  | 'linked_identity_metadata';

export interface CloudChange {
  profileId: string;
  entityType: CloudEntityType;
  entityKey: string;
  action: 'upsert' | 'delete';
  revision: number;
  value?: Record<string, unknown>;
}

export interface CloudOperation extends Omit<CloudChange, 'revision'> {
  opId: string;
  baseRevision: number;
}

export interface LocalCloudSnapshot {
  profiles: UserProfile[];
  activeProfileId: string;
  settings: AppSettings;
  watchlist: Record<string, WatchlistEntry[]>;
  history: Record<string, ContinueWatchingEntry[]>;
}

export interface CloudShadow {
  revision: number;
  action: 'upsert' | 'delete';
  value?: Record<string, unknown>;
}

const PORTABLE_SETTINGS = [
  'autoPlayNext', 'autoSkipIntro', 'skipFiller', 'showSkipButton', 'subtitlesOnDub',
  'showSubtitlesByDefault', 'hideAdultContent', 'displayRelatedManga', 'blurSpoilers',
  'titleLanguage', 'defaultAudioMode', 'preferredSubLanguage', 'secondChoiceSubtitles',
  'defaultQuality', 'themePreset', 'accentColor', 'watchedThreshold', 'skipButtonLength',
  'playbackSpeed',
] as const;

const toCloudStatus: Record<WatchStatus, string> = {
  Watching: 'Watching',
  Rewatching: 'Rewatching',
  'Plan to watch': 'Planning',
  Paused: 'Paused',
  Completed: 'Completed',
  Dropped: 'Dropped',
};

const fromCloudStatus: Record<string, WatchStatus> = {
  Watching: 'Watching',
  Rewatching: 'Rewatching',
  Planning: 'Plan to watch',
  Paused: 'Paused',
  Completed: 'Completed',
  Dropped: 'Dropped',
};

export function cloudKey(profileId: string, entityType: string, entityKey: string): string {
  return `${profileId}\0${entityType}\0${entityKey}`;
}

function media(animeId: string): Record<string, unknown> | null {
  if (!/^[1-9][0-9]{0,9}$/.test(animeId)) return null;
  const anilist = Number(animeId);
  return { kind: 'ANIME', mediaKey: `al-${animeId}`, aliases: { anilist } };
}

function settingValue(key: typeof PORTABLE_SETTINGS[number], settings: AppSettings): unknown {
  if (key === 'defaultQuality') return settings.defaultQuality.toLowerCase();
  return settings[key as keyof AppSettings];
}

export function desiredCloudEntities(
  snapshot: LocalCloudSnapshot,
  profileMap: Record<string, string>,
): Map<string, Omit<CloudChange, 'revision'>> {
  const desired = new Map<string, Omit<CloudChange, 'revision'>>();
  for (const profile of snapshot.profiles) {
    const profileId = profileMap[profile.id];
    if (!profileId) continue;
    const profileChange: Omit<CloudChange, 'revision'> = {
      profileId,
      entityType: 'profile',
      entityKey: 'profile',
      action: 'upsert',
      value: {
        name: profile.name,
        ...(profile.avatar ? { avatarRef: profile.avatar } : {}),
        ...(profile.accentColor ? { accentColor: profile.accentColor } : {}),
        kidsMode: profile.isKidsMode === true,
      },
    };
    desired.set(cloudKey(profileId, 'profile', 'profile'), profileChange);

    for (const entry of snapshot.watchlist[profile.id] ?? []) {
      const reference = media(entry.animeId);
      if (!reference) continue;
      const entityKey = `ANIME:${String(reference.mediaKey)}`;
      const value = {
        media: reference,
        status: toCloudStatus[entry.status],
        ...(entry.progress === undefined ? {} : { progress: entry.progress }),
        ...(entry.score === undefined ? {} : { score: entry.score }),
      };
      desired.set(cloudKey(profileId, 'watchlist', entityKey), {
        profileId, entityType: 'watchlist', entityKey, action: 'upsert', value,
      });
    }

    for (const entry of snapshot.history[profile.id] ?? []) {
      const reference = media(entry.animeId);
      if (!reference || entry.durationSec <= 0) continue;
      const entityKey = `ANIME:${String(reference.mediaKey)}`;
      desired.set(cloudKey(profileId, 'continue_progress', entityKey), {
        profileId,
        entityType: 'continue_progress',
        entityKey,
        action: 'upsert',
        value: {
          media: reference,
          episode: String(entry.episodeNumber),
          positionSeconds: Math.max(0, Math.min(86_400, entry.currentTimeSec)),
          durationSeconds: Math.max(1, Math.min(86_400, entry.durationSec)),
          audioMode: entry.audioMode,
        },
      });
    }
  }

  const settingsProfile = profileMap[snapshot.activeProfileId];
  if (settingsProfile) {
    for (const key of PORTABLE_SETTINGS) {
      const entityKey = `setting:${key}`;
      desired.set(cloudKey(settingsProfile, 'portable_setting', entityKey), {
        profileId: settingsProfile,
        entityType: 'portable_setting',
        entityKey,
        action: 'upsert',
        value: { key, value: settingValue(key, snapshot.settings) },
      });
    }
  }
  return desired;
}

export function applyChangesToShadow(
  shadow: Record<string, CloudShadow>,
  changes: CloudChange[],
): Record<string, CloudShadow> {
  const next = { ...shadow };
  for (const item of changes) {
    const key = cloudKey(item.profileId, item.entityType, item.entityKey);
    if ((next[key]?.revision ?? 0) > item.revision) continue;
    next[key] = {
      revision: item.revision,
      action: item.action,
      ...(item.value ? { value: item.value } : {}),
    };
  }
  return next;
}

function profileForCloud(profileMap: Record<string, string>, profileId: string): string | null {
  return Object.entries(profileMap).find(([, cloudId]) => cloudId === profileId)?.[0] ?? null;
}

export function mergeRemoteChanges(
  snapshot: LocalCloudSnapshot,
  changes: CloudChange[],
  profileMap: Record<string, string>,
  initial: boolean,
): LocalCloudSnapshot {
  const next: LocalCloudSnapshot = {
    ...snapshot,
    profiles: snapshot.profiles.map((profile) => ({ ...profile })),
    settings: { ...snapshot.settings },
    watchlist: Object.fromEntries(Object.entries(snapshot.watchlist).map(([key, value]) => [key, [...value]])),
    history: Object.fromEntries(Object.entries(snapshot.history).map(([key, value]) => [key, [...value]])),
  };

  const latest = new Map<string, CloudChange>();
  for (const item of changes) {
    const key = cloudKey(item.profileId, item.entityType, item.entityKey);
    if ((latest.get(key)?.revision ?? 0) <= item.revision) latest.set(key, item);
  }

  for (const item of [...latest.values()].filter((change) => change.entityType === 'profile')) {
    let localId = profileForCloud(profileMap, item.profileId);
    if (!localId) {
      localId = `cloud-${item.profileId}`;
      profileMap[localId] = item.profileId;
    }
    const index = next.profiles.findIndex((profile) => profile.id === localId);
    if (item.action === 'delete') {
      if (!initial && index >= 0 && next.profiles.length > 1) next.profiles.splice(index, 1);
      continue;
    }
    const value = item.value ?? {};
    if (index < 0) {
      next.profiles.push({
        id: localId,
        name: String(value.name ?? 'Cloud profile'),
        avatar: String(value.avatarRef ?? '/assets/images/Anilife-Logo.png'),
        accentColor: String(value.accentColor ?? '#74cf66'),
        isKidsMode: value.kidsMode === true,
        createdAt: Date.now(),
      });
    } else if (!initial) {
      next.profiles[index] = {
        ...next.profiles[index],
        name: String(value.name ?? next.profiles[index].name),
        avatar: String(value.avatarRef ?? next.profiles[index].avatar),
        accentColor: String(value.accentColor ?? next.profiles[index].accentColor),
        isKidsMode: value.kidsMode === true,
      };
    }
  }

  for (const item of latest.values()) {
    const localId = profileForCloud(profileMap, item.profileId);
    if (!localId || item.entityType === 'profile') continue;
    if (item.entityType === 'watchlist') {
      const rows = next.watchlist[localId] ?? [];
      const animeId = item.entityKey.split(':al-')[1];
      const index = rows.findIndex((row) => row.animeId === animeId);
      if (item.action === 'delete') {
        if (!initial && index >= 0) rows.splice(index, 1);
      } else if (index < 0 || !initial) {
        const value = item.value ?? {};
        const row: WatchlistEntry = {
          animeId,
          status: fromCloudStatus[String(value.status)] ?? 'Watching',
          updatedAt: new Date().toISOString(),
          ...(typeof value.progress === 'number' ? { progress: value.progress } : {}),
          ...(typeof value.score === 'number' ? { score: value.score } : {}),
        };
        if (index >= 0) rows[index] = row;
        else rows.push(row);
      }
      next.watchlist[localId] = rows;
    } else if (item.entityType === 'continue_progress') {
      const rows = next.history[localId] ?? [];
      const animeId = item.entityKey.split(':al-')[1];
      const index = rows.findIndex((row) => row.animeId === animeId);
      if (item.action === 'delete') {
        if (!initial && index >= 0) rows.splice(index, 1);
      } else if (index < 0 || !initial) {
        const value = item.value ?? {};
        const row: ContinueWatchingEntry = {
          animeId,
          episodeNumber: Number(value.episode),
          currentTimeSec: Number(value.positionSeconds),
          durationSec: Number(value.durationSeconds),
          audioMode: value.audioMode === 'DUB' ? 'DUB' : 'SUB',
          serverName: '',
          updatedAt: new Date().toISOString(),
          fromRemote: true,
        };
        if (index >= 0) rows[index] = row;
        else rows.push(row);
      }
      next.history[localId] = rows;
    } else if (item.entityType === 'portable_setting' && item.action === 'upsert' && !initial) {
      const value = item.value ?? {};
      const key = String(value.key) as keyof AppSettings;
      if (key === 'defaultQuality') {
        const quality = String(value.value);
        next.settings.defaultQuality = (quality === 'auto' ? 'Auto' : quality) as AppSettings['defaultQuality'];
      } else if (key in next.settings) {
        (next.settings as unknown as Record<string, unknown>)[key] = value.value;
      }
    }
  }
  return next;
}
