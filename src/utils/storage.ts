import { AppSettings, ContinueWatchingEntry, UserProfile, WatchlistEntry, ThemePresetName } from '../types/anime';
import { INITIAL_CONTINUE_WATCHING } from './animeData';
import { webServerOptions } from './providerOptions';
import { STORAGE_KEYS } from '../data/keys';
import { putRecord } from '../data/idb';

export { STORAGE_KEYS };

const WEB_PROVIDER_IDS = webServerOptions().map((server) => server.id);

export const POPULAR_AVATARS = [
  { name: 'Satoru Gojo', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b127691-9zqh1xpIubn7.png' },
  { name: 'Monkey D. Luffy', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b40-MNypXsxSRb1R.png' },
  { name: 'Frieren', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b176754-PCnpqIOkjhFk.png' },
  { name: 'Maomao', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b126824-MqsCncTO1qpv.png' },
  { name: 'Roronoa Zoro', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b62-S7oAeA9WInjV.png' },
  { name: 'Anya Forger', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b138100-4Li0tWRCa5bQ.png' },
  { name: 'Levi Ackerman', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b45627-CR68RyZmddGG.png' },
  { name: 'Killua Zoldyck', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b27-Z5O02kQUydpT.jpg' },
  { name: 'Megumin', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b89361-tq8PQQ4MmF0M.png' },
  { name: 'Rimuru Tempest', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b123962-eL9yGV0NLMF7.png' },
  { name: 'Naruto Uzumaki', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b17-phjcWCkRuIhu.png' },
  { name: 'Goku', url: 'https://s4.anilist.co/file/anilistcdn/character/large/246-wsRRr6z1kii8.png' },
  { name: 'Vegeta', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b913-NIFkKazWM8VO.png' },
  { name: 'Freeza', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b3694-bDfOdSSdFfPv.png' },
  { name: 'Emilia', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b88572-IzTwXEHSobRs.jpg' },
  { name: 'Subaru Natski', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b88573-F8yMTK9GhnTA.png' },
  { name: 'Rem', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b88575-Ayu8UPDA8NS6.png' },
  { name: 'Ram', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b88576-NWkotUiJ3mK3.png' },
  { name: 'Ace D. Portgas', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b2072-Lc6jEdsueJUK.jpg' },
  { name: 'Cid Kagenou', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b136837-3WR22FYet8Hv.jpg' },
  { name: 'Aqua', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b89362-ibkc0eoECaW1.png' },
  { name: 'Power', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b137079-6yLEUYR3bmpr.png' },
  { name: 'Denji', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b130102-FO1VHNnEnLlB.png' },
  { name: 'Pochita', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b170266-bBXPkNJnd3mg.png' },
  { name: 'Saitama', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b73935-ON5d0mAcrItd.jpg' },
  { name: 'Sasuke Uchiha', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b13-SISLEw1oAD7a.png' },
  { name: 'Tanya Degurechaff', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b121052-bQZT3nIvaryX.png' },
  { name: 'Beatrice', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b90181-wRPm0OEaucmw.png' },
  { name: 'Puc', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b90187-xJXlD84KXl3t.jpg' },
  { name: 'Veldora Tempest', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b128034-Gg5MrpTFNSv8.png' },
  { name: 'Kazuma', url: 'https://s4.anilist.co/file/anilistcdn/character/large/b89364-7Th8Tv1XKJtt.png' },
  { name: 'Anilife', url: '/assets/images/Anilife-Logo.png' }
];

export const THEME_PRESETS: Record<ThemePresetName, { canvas: 'amoled' | 'dark'; accent: string; label: string }> = {
  'Midnight': { canvas: 'amoled', accent: '#74cf66', label: 'Anilife Emerald (#74cf66)' },
  'Crimson Night': { canvas: 'amoled', accent: '#D1102B', label: 'Crimson Night (Blood Red)' },
  'Toxic': { canvas: 'amoled', accent: '#39FF14', label: 'Toxic (Neon Green)' },
  'Royal': { canvas: 'amoled', accent: '#9333EA', label: 'Royal (Deep Purple)' },
  'Deep Sea': { canvas: 'amoled', accent: '#3B82F6', label: 'Deep Sea (Ocean Blue)' },
  'Cyber': { canvas: 'amoled', accent: '#22D3EE', label: 'Cyber (Cyan Glow)' },
  'Sakura': { canvas: 'dark', accent: '#F472B6', label: 'Sakura (Pink Pastel)' },
  'Ember': { canvas: 'amoled', accent: '#F97316', label: 'Ember (Sunset Orange)' },
  'Gilded': { canvas: 'amoled', accent: '#FACC15', label: 'Gilded (Gold)' },
  'Forest': { canvas: 'dark', accent: '#10B981', label: 'Forest (Emerald)' },
  'High contrast': { canvas: 'amoled', accent: '#FFFFFF', label: 'High contrast (Pure Monochrome)' },
};

export const DEFAULT_PROFILES: UserProfile[] = [
  {
    id: 'profile-main',
    name: 'Profile 1',
    avatar: 'https://s4.anilist.co/file/anilistcdn/character/large/b127691-9zqh1xpIubn7.png',
    accentColor: '#74cf66',
    createdAt: Date.now(),
  }
];

export const DEFAULT_SETTINGS: AppSettings = {
  
  themePreset: 'Midnight',
  canvasBackground: 'amoled',
  accentColor: '#74cf66',
  backdropSource: 'none',
  backdropImage: '',
  backdropDim: 'Medium',
  backdropBlur: true,
  glassPopups: true,
  refreshSpinner: true,
  playAppIntro: true,

  
  autoPlayNext: true,
  autoSkipIntro: true,
  skipFiller: true,
  showSkipButton: true,
  skipButtonLength: 85,
  watchedThreshold: 80,
  defaultQuality: 'Auto',
  playbackSpeed: 1.0,
  screenFit: 'Fit',
  defaultAudioMode: 'SUB',

  
  showSubtitlesByDefault: true,
  subtitlesOnDub: false,
  preferredSubLanguage: 'English',
  secondChoiceSubtitles: 'Automatic',
  captionSize: 'Medium',
  subtitleOffsetSec: 0,

  
  activeServer: 'reanime',
  serverPriority: [...WEB_PROVIDER_IDS],
  enabledServers: [...WEB_PROVIDER_IDS],
  serverOrderVersion: 2,
  serverCatalogVersion: 2,

  
  hideAdultContent: false,
  titleLanguage: 'romaji',
  blurSpoilers: false,
  onlyWatchableEpisodes: false,

  
  anilistConnected: false,
  anilistUsername: '',
  discordConnected: false,
  discordPresence: true,
  discordRichPresence: true,
  dnsOverHttps: true,

  
  navigationLayout: 'topbar',
  autoHideNav: false,
  multiProfileEnabled: true,

  diagnosticUpload: false,
  performanceUpload: false,
};

const LEGACY_STORAGE_KEYS = {
  SETTINGS: 'anilife_settings_v2',
  PROFILES: 'anilife_profiles_v2',
} as const;

function normalizeProviderLists(settings: AppSettings): AppSettings {
  const known = new Set(WEB_PROVIDER_IDS);
  const storedPriority = settings.serverPriority ?? [];
  const legacyPriority =
    settings.serverOrderVersion !== 2 || storedPriority.some((id) => !known.has(id));

  // A legacy list contains native-only and unavailable ids. Replace its order with the current
  // web-capable default (implemented servers first); otherwise keep the viewer's order.
  const priority = legacyPriority
    ? [...WEB_PROVIDER_IDS]
    : [
        ...storedPriority.filter((id) => known.has(id)),
        ...WEB_PROVIDER_IDS.filter((id) => !storedPriority.includes(id)),
      ];

  // An absent or empty list means "not configured" and enables every web-capable server.
  // A non-empty list is preserved so an explicit disable is never silently reverted.
  const configuredEnabled = (settings.enabledServers ?? []).filter((id) => known.has(id));
  let enabled =
    settings.enabledServers && settings.enabledServers.length > 0 && configuredEnabled.length > 0
      ? configuredEnabled
      : [...WEB_PROVIDER_IDS];

  // One-time catalogue migration: existing viewers should see newly added fallback servers.
  // After the version is stored, an explicit disable is preserved.
  if ((settings.serverCatalogVersion ?? 0) !== 2) {
    const additions = ['vidsrc', 'vidlink', '2embed'].filter((id) => known.has(id));
    enabled = [...new Set([...enabled, ...additions])];
  }

  return {
    ...settings,
    serverPriority: priority,
    enabledServers: enabled,
    serverOrderVersion: 2,
    serverCatalogVersion: 2,
  };
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) {
      // One-time upgrade from the v2 key, written forward so the next boot is a plain read.
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEYS.SETTINGS);
      if (legacy) {
        const stored = JSON.parse(legacy) as Partial<AppSettings>;
        const merged = normalizeProviderLists({
          ...DEFAULT_SETTINGS,
          ...stored,
          serverOrderVersion: stored.serverOrderVersion ?? 0,
          serverCatalogVersion: stored.serverCatalogVersion ?? 0,
        });
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(merged));
        return merged;
      }
      return DEFAULT_SETTINGS;
    }
    const stored = JSON.parse(raw) as Partial<AppSettings>;
    return normalizeProviderLists({
      ...DEFAULT_SETTINGS,
      ...stored,
      serverOrderVersion: stored.serverOrderVersion ?? 0,
      serverCatalogVersion: stored.serverCatalogVersion ?? 0,
    });
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    void putRecord('settings', 'settings', settings);
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

export function loadProfiles(): UserProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROFILES);
    if (!raw) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEYS.PROFILES);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (Array.isArray(parsed) && parsed.length > 0) {
          localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(parsed));
          return parsed;
        }
      }
      return DEFAULT_PROFILES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return DEFAULT_PROFILES;
  } catch {
    return DEFAULT_PROFILES;
  }
}

export function saveProfiles(profiles: UserProfile[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
    void putRecord('profiles', 'profiles', profiles);
  } catch (err) {
    console.error('Failed to save profiles:', err);
  }
}

export function loadActiveProfileId(): string {
  try {
    const id = localStorage.getItem(STORAGE_KEYS.ACTIVE_PROFILE_ID);
    return id || DEFAULT_PROFILES[0].id;
  } catch {
    return DEFAULT_PROFILES[0].id;
  }
}

export function saveActiveProfileId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROFILE_ID, id);
    void putRecord('app_meta', 'activeProfileId', id);
  } catch (err) {
    console.error('Failed to save active profile id:', err);
  }
}

export function loadWatchlist(profileId: string = 'default'): WatchlistEntry[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.WATCHLIST_PREFIX}${profileId}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveWatchlist(profileId: string, entries: WatchlistEntry[]): void {
  try {
    localStorage.setItem(`${STORAGE_KEYS.WATCHLIST_PREFIX}${profileId}`, JSON.stringify(entries));
    void putRecord('watchlist', profileId, entries);
  } catch (err) {
    console.error('Failed to save watchlist:', err);
  }
}

export function loadContinueWatching(profileId: string = 'default'): ContinueWatchingEntry[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.CONTINUE_PREFIX}${profileId}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveContinueWatching(profileId: string, entries: ContinueWatchingEntry[]): void {
  try {
    localStorage.setItem(`${STORAGE_KEYS.CONTINUE_PREFIX}${profileId}`, JSON.stringify(entries));
    void putRecord('history', profileId, entries);
  } catch (err) {
    console.error('Failed to save continue watching:', err);
  }
}

export function loadRecentSearches(profileId: string = 'default'): string[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.SEARCH_PREFIX}${profileId}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveRecentSearches(profileId: string, searches: string[]): void {
  try {
    localStorage.setItem(`${STORAGE_KEYS.SEARCH_PREFIX}${profileId}`, JSON.stringify(searches));
    void putRecord('search_history', profileId, searches);
  } catch (err) {
    console.error('Failed to save recent searches:', err);
  }
}


