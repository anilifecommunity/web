import type { AppSettings, ContinueWatchingEntry, WatchlistEntry } from '../types/anime';
import {
  loadActiveProfileId,
  loadContinueWatching,
  loadRecentSearches,
  loadSettings,
  loadWatchlist,
  saveContinueWatching,
  saveRecentSearches,
  saveSettings,
  saveWatchlist,
} from '../utils/storage';

export const BACKUP_FORMAT = 'anilili-backup';
export const BACKUP_VERSION = 1;
export const KDF = 'pbkdf2-hmac-sha256';
export const ITERATIONS = 210_000;
export const MIN_PASSPHRASE_LENGTH = 8;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const APP_VERSION = 'web-0.1.0';

export interface SealedCredentials {
  kdf: string;
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  services: string[];
}

export interface BackupCredentials {
  aniListToken?: string | null;
  openSubtitlesUsername?: string | null;
  openSubtitlesPassword?: string | null;
  malCode?: string | null;
  malVerifier?: string | null;
  malIssuedAt?: number;
}

export interface BackupDocument {
  format: string;
  version: number;
  createdAt: number;
  appVersion: string;
  settings: Record<string, unknown>;
  watchlist: unknown[];
  history: unknown[];
  searchHistory: string[];
  customLists: unknown[];
  watched: unknown[];
  credentials?: SealedCredentials | null;
}

export class BackupError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
  }
}

// ------------------------------------------------------------------ mapping

function englishAudioToPreferDub(mode: string | undefined): boolean {
  return (mode ?? 'SUB').toUpperCase() === 'DUB';
}

/**
 * Web settings → Android DataStore keys. Android ignores keys it does not know, and missing keys
 * keep their defaults, so this is safe in both directions.
 */
export function settingsToAndroid(settings: AppSettings): Record<string, unknown> {
  const disabled = (settings.enabledServers && settings.enabledServers.length > 0
    ? settings.enabledServers
    : settings.serverPriority ?? []
  );
  return {
    autoplay: settings.autoPlayNext,
    auto_skip_intro_outro: settings.autoSkipIntro,
    auto_skip_filler: settings.skipFiller,
    show_skip_button: settings.showSkipButton,
    skip_button_seconds: settings.skipButtonLength,
    watched_threshold_percent: settings.watchedThreshold,
    default_quality: settings.defaultQuality,
    default_playback_speed: settings.playbackSpeed,
    prefer_dub: englishAudioToPreferDub(settings.defaultAudioMode),
    preferred_subtitle_language: settings.preferredSubLanguage,
    secondary_subtitle_language: settings.secondChoiceSubtitles,
    subtitles_with_dub: settings.subtitlesOnDub,
    subtitles_by_default: settings.showSubtitlesByDefault,
    hide_adult_content: settings.hideAdultContent,
    preferred_provider: settings.activeServer,
    server_priority: (settings.serverPriority ?? []).join(','),
    disabled_providers: (settings.enabledServers ?? []).length > 0
      ? (settings.serverPriority ?? []).filter((id) => !disabled.includes(id)).join(',')
      : '',
    theme_accent: settings.accentColor,
    theme_style: settings.themePreset,
    static_app_chrome: settings.navigationLayout === 'sidebar',
    blur_episode_images: settings.blurSpoilers,
  };
}

/** Android DataStore keys → the web settings shape. Only known keys are adopted. */
export function settingsFromAndroid(source: Record<string, unknown>): Partial<AppSettings> {
  const out: Partial<AppSettings> = {};
  const bool = (key: string): boolean | undefined =>
    typeof source[key] === 'boolean' ? (source[key] as boolean) : undefined;
  const num = (key: string): number | undefined =>
    typeof source[key] === 'number' ? (source[key] as number) : undefined;
  const str = (key: string): string | undefined =>
    typeof source[key] === 'string' ? (source[key] as string) : undefined;

  if (bool('autoplay') !== undefined) out.autoPlayNext = bool('autoplay');
  if (bool('auto_skip_intro_outro') !== undefined) out.autoSkipIntro = bool('auto_skip_intro_outro');
  if (bool('auto_skip_filler') !== undefined) out.skipFiller = bool('auto_skip_filler');
  if (bool('show_skip_button') !== undefined) out.showSkipButton = bool('show_skip_button');
  if (num('skip_button_seconds') !== undefined) out.skipButtonLength = num('skip_button_seconds');
  if (num('watched_threshold_percent') !== undefined) out.watchedThreshold = num('watched_threshold_percent');
  if (str('default_quality')) out.defaultQuality = str('default_quality') as AppSettings['defaultQuality'];
  if (num('default_playback_speed') !== undefined) out.playbackSpeed = num('default_playback_speed');
  if (bool('prefer_dub') !== undefined) out.defaultAudioMode = bool('prefer_dub') ? 'DUB' : 'SUB';
  if (str('preferred_subtitle_language')) out.preferredSubLanguage = str('preferred_subtitle_language');
  if (str('secondary_subtitle_language')) out.secondChoiceSubtitles = str('secondary_subtitle_language');
  if (bool('subtitles_with_dub') !== undefined) out.subtitlesOnDub = bool('subtitles_with_dub');
  if (bool('subtitles_by_default') !== undefined) out.showSubtitlesByDefault = bool('subtitles_by_default');
  if (bool('hide_adult_content') !== undefined) out.hideAdultContent = bool('hide_adult_content');
  if (str('preferred_provider')) out.activeServer = str('preferred_provider');
  if (str('server_priority')) {
    out.serverPriority = str('server_priority')!.split(',').map((value) => value.trim()).filter(Boolean);
  }
  if (str('theme_accent')) out.accentColor = str('theme_accent');
  return out;
}

// ------------------------------------------------------------------ base64

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function associatedData(): Uint8Array {
  return new TextEncoder().encode(`${BACKUP_FORMAT}/${BACKUP_VERSION}`);
}

function bufferOf(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: bufferOf(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ------------------------------------------------------------------ crypto

export async function sealCredentials(
  passphrase: string,
  credentials: BackupCredentials,
  iterations = ITERATIONS
): Promise<SealedCredentials> {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new BackupError('BAK-01', `Use at least ${MIN_PASSPHRASE_LENGTH} characters for the passphrase.`);
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt, iterations);
  const plaintext = JSON.stringify({
    aniListToken: credentials.aniListToken ?? null,
    openSubtitlesUsername: credentials.openSubtitlesUsername ?? null,
    openSubtitlesPassword: credentials.openSubtitlesPassword ?? null,
    malCode: credentials.malCode ?? null,
    malVerifier: credentials.malVerifier ?? null,
    malIssuedAt: credentials.malIssuedAt ?? 0,
  });
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: bufferOf(iv), additionalData: bufferOf(associatedData()) },
    key,
    new TextEncoder().encode(plaintext)
  );

  const services: string[] = [];
  if (credentials.aniListToken) services.push('anilist');
  if (credentials.malCode && credentials.malVerifier) services.push('mal');
  if (credentials.openSubtitlesUsername) services.push('opensubtitles');

  return {
    kdf: KDF,
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    services,
  };
}

export async function openCredentials(
  passphrase: string,
  sealed: SealedCredentials
): Promise<BackupCredentials> {
  if (sealed.kdf !== KDF) {
    throw new BackupError('BAK-01', 'These logins were sealed by a newer version of Anilife.');
  }
  let salt: Uint8Array;
  let iv: Uint8Array;
  let ciphertext: Uint8Array;
  try {
    salt = base64ToBytes(sealed.salt);
    iv = base64ToBytes(sealed.iv);
    ciphertext = base64ToBytes(sealed.ciphertext);
  } catch {
    throw new BackupError('BAK-01', 'The logins in that backup are damaged.');
  }
  if (iv.length !== IV_BYTES) throw new BackupError('BAK-01', 'The logins in that backup are damaged.');

  try {
    const key = await deriveKey(passphrase, salt, sealed.iterations);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bufferOf(iv), additionalData: bufferOf(associatedData()) },
      key,
      bufferOf(ciphertext)
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as BackupCredentials;
  } catch {
    throw new BackupError('BAK-01', 'That passphrase does not match this backup.');
  }
}

// ------------------------------------------------------------------ document

function parseDate(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }
  return Date.now();
}

function historyToAndroid(entry: ContinueWatchingEntry): Record<string, unknown> {
  return {
    anilistId: Number(entry.animeId) || 0,
    title: '',
    cover: null,
    episodeNumber: entry.episodeNumber,
    episodeTitle: null,
    provider: entry.serverName || 'auto',
    category: entry.audioMode === 'DUB' ? 'dub' : 'sub',
    positionMs: Math.max(0, Math.round((entry.currentTimeSec ?? 0) * 1000)),
    durationMs: Math.max(0, Math.round((entry.durationSec ?? 0) * 1000)),
    updatedAt: parseDate(entry.updatedAt),
    watchedEpisodes: [],
    fromRemote: false,
  };
}

function watchlistToAndroid(entry: WatchlistEntry): Record<string, unknown> {
  return {
    anilistId: Number(entry.animeId) || 0,
    title: '',
    cover: null,
    addedAt: parseDate(entry.updatedAt),
    // Extra key: Android ignores unknown fields, web keeps the local status.
    status: entry.status,
  };
}

export interface BuildBackupOptions {
  credentials?: BackupCredentials;
  passphrase?: string;
  profileId?: string;
}

export async function buildBackupDocument(options: BuildBackupOptions = {}): Promise<BackupDocument> {
  const profileId = options.profileId ?? loadActiveProfileId();
  const settings = loadSettings();
  let credentials: SealedCredentials | null = null;
  if (options.credentials && options.passphrase) {
    credentials = await sealCredentials(options.passphrase, options.credentials);
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: Date.now(),
    appVersion: APP_VERSION,
    settings: settingsToAndroid(settings),
    watchlist: loadWatchlist(profileId).map(watchlistToAndroid),
    history: loadContinueWatching(profileId).map(historyToAndroid),
    searchHistory: loadRecentSearches(profileId),
    customLists: [],
    watched: [],
    credentials,
  };
}

export function serializeBackup(document: BackupDocument): string {
  return JSON.stringify(document, null, 2);
}

export function parseBackup(text: string): BackupDocument {
  if (text.length > MAX_SOURCE_BYTES) {
    throw new BackupError('BAK-01', 'That file is too large to be an Anilife backup.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('BAK-03', 'That is not an Anilife backup.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new BackupError('BAK-03', 'That is not an Anilife backup.');
  }
  const doc = parsed as Record<string, unknown>;
  if (doc.format !== BACKUP_FORMAT || doc.version !== BACKUP_VERSION) {
    throw new BackupError('BAK-03', 'That is not an Anilife backup.');
  }
  const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
  const asStrings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: typeof doc.createdAt === 'number' ? doc.createdAt : 0,
    appVersion: typeof doc.appVersion === 'string' ? doc.appVersion : '',
    settings: doc.settings && typeof doc.settings === 'object' ? (doc.settings as Record<string, unknown>) : {},
    watchlist: asArray(doc.watchlist),
    history: asArray(doc.history),
    searchHistory: asStrings(doc.searchHistory),
    customLists: asArray(doc.customLists),
    watched: asArray(doc.watched),
    credentials: (doc.credentials as SealedCredentials | undefined) ?? null,
  };
}

function normalizeHistory(raw: unknown): ContinueWatchingEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  const animeId = String(entry.animeId ?? entry.anilistId ?? '');
  if (!animeId || animeId === 'NaN') return null;
  const positionMs = typeof entry.positionMs === 'number' ? entry.positionMs : null;
  return {
    animeId,
    episodeNumber: Number(entry.episodeNumber ?? 1) || 1,
    currentTimeSec:
      typeof entry.currentTimeSec === 'number'
        ? entry.currentTimeSec
        : positionMs !== null
          ? positionMs / 1000
          : 0,
    durationSec:
      typeof entry.durationSec === 'number'
        ? entry.durationSec
        : typeof entry.durationMs === 'number'
          ? entry.durationMs / 1000
          : 0,
    serverName: String(entry.serverName ?? entry.provider ?? 'auto'),
    audioMode: String(entry.audioMode ?? entry.category ?? 'sub').toUpperCase() === 'DUB' ? 'DUB' : 'SUB',
    updatedAt: new Date(
      typeof entry.updatedAt === 'number' ? entry.updatedAt : parseDate(entry.updatedAt)
    ).toISOString(),
  };
}

function normalizeWatchlist(raw: unknown): WatchlistEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  const animeId = String(entry.animeId ?? entry.anilistId ?? '');
  if (!animeId || animeId === 'NaN') return null;
  const status = typeof entry.status === 'string' ? entry.status : 'Plan to watch';
  return {
    animeId,
    status: status as WatchlistEntry['status'],
    updatedAt: new Date(
      typeof entry.updatedAt === 'number' ? entry.updatedAt : parseDate(entry.addedAt ?? entry.updatedAt)
    ).toISOString(),
  };
}

export interface RestoreSummary {
  settings: number;
  watchlist: number;
  history: number;
  searchHistory: number;
}

/**
 * Merges a backup into the current profile. Existing newer history rows win; watchlist rows merge
 * by id; searches are deduplicated. Nothing is deleted first, so a restore is additive.
 */
export function applyBackup(document: BackupDocument, profileId = loadActiveProfileId()): RestoreSummary {
  const settingsPatch = settingsFromAndroid(document.settings);
  if (Object.keys(settingsPatch).length > 0) {
    saveSettings({ ...loadSettings(), ...settingsPatch });
  }

  const existingWatchlist = loadWatchlist(profileId);
  const watchlistById = new Map(existingWatchlist.map((entry) => [entry.animeId, entry]));
  let watchlistCount = 0;
  for (const raw of document.watchlist) {
    const entry = normalizeWatchlist(raw);
    if (!entry) continue;
    watchlistById.set(entry.animeId, entry);
    watchlistCount += 1;
  }
  if (watchlistCount > 0) saveWatchlist(profileId, [...watchlistById.values()]);

  const existingHistory = loadContinueWatching(profileId);
  const historyById = new Map(existingHistory.map((entry) => [entry.animeId, entry]));
  let historyCount = 0;
  for (const raw of document.history) {
    const entry = normalizeHistory(raw);
    if (!entry) continue;
    const current = historyById.get(entry.animeId);
    if (!current || Date.parse(entry.updatedAt) >= Date.parse(current.updatedAt)) {
      historyById.set(entry.animeId, entry);
      historyCount += 1;
    }
  }
  if (historyCount > 0) saveContinueWatching(profileId, [...historyById.values()]);

  const searches = [
    ...new Set([...document.searchHistory, ...loadRecentSearches(profileId)]),
  ].slice(0, 20);
  saveRecentSearches(profileId, searches);

  return {
    settings: Object.keys(settingsPatch).length,
    watchlist: watchlistCount,
    history: historyCount,
    searchHistory: searches.length,
  };
}

export function downloadBackup(backup: BackupDocument, filename?: string): void {
  const blob = new Blob([serializeBackup(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename ?? `anilife-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

