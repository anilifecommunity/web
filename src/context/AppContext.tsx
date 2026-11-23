import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Anime,
  AppSettings,
  ContinueWatchingEntry,
  UserProfile,
  WatchlistEntry,
  WatchStatus,
  ThemePresetName
} from '../types/anime';
import { getAnimeAniListId } from '../utils/animeData';
import { createWatchSession, WatchSessionError, type WatchSession } from '../utils/workerApi';
import {
  DEFAULT_PROFILES,
  DEFAULT_SETTINGS,
  THEME_PRESETS,
  loadSettings,
  mergeSettings,
  saveSettings,
  loadProfiles,
  saveProfiles,
  loadActiveProfileId,
  saveActiveProfileId,
  loadWatchlist,
  saveWatchlist,
  loadContinueWatching,
  saveContinueWatching,
  loadRecentSearches,
  saveRecentSearches,
  deleteProfileStorage,
} from '../utils/storage';
import {
  AniListUserData,
  AniListUserCollection,
  fetchTrendingAnime,
  fetchPopularSeasonAnime,
  fetchTopRatedAnime,
  fetchPopularAllTimeAnime,
  fetchViewerProfile,
  fetchUserAnimeList,
  saveUserMediaListEntry,
  getAniListOAuthUrl,
  isAniListAuthError,
  loadOAuthToken,
  saveOAuthToken,
  clearOAuthToken,
  loadCachedCatalog,
  saveCachedCatalog,
  saveCachedAniListData,
  loadCachedAniListData
} from '../utils/anilistApi';
import { isAnimeDubbed } from '../utils/mediaIndexApi';
import { mediaIndexRelease, type MediaIndexDataState, type MediaIndexFailureCode } from '../utils/mediaIndexRelease';

export interface VideoPlaybackTarget {
  anime: Anime;
  episodeNumber: number;
  audioMode: 'SUB' | 'DUB';
  audioFallback?: boolean;
  dubAvailability: boolean | null;
  serverId: string;
  watchSession: WatchSession;
}

import { convertAniListToAnime, convertMediaIndexCompactToAnime, convertMediaIndexMediaToAnime } from '../utils/animeConversion';
import { canWatchEpisode } from '../utils/episodeAvailability';
import { isAnimeVisible } from '../utils/animePreferences';
import { availableAudioMode } from '../utils/playerUtils';
import { createAniListProgressQueue } from '../utils/anilistProgress';
import {
  mergeContinueWatching,
  mergeLibraryEntries,
  remoteContinueSeed,
} from '../utils/libraryParity';

export { convertAniListToAnime };

export interface CatalogMetadataState {
  state: 'LIVE' | MediaIndexDataState | 'UNAVAILABLE';
  releaseId?: string;
  generatedAt?: string;
  failure?: MediaIndexFailureCode;
}

interface AppContextType {
  activeTab: 'home' | 'search' | 'schedule' | 'mylist' | 'downloads';
  setActiveTab: (tab: 'home' | 'search' | 'schedule' | 'mylist' | 'downloads') => void;
  selectedAnime: Anime | null;
  setSelectedAnime: (anime: Anime | null) => void;
  activeVideo: VideoPlaybackTarget | null;
  setActiveVideo: (video: VideoPlaybackTarget | null) => void;
  routeError: string | null;
  setRouteError: (message: string | null) => void;
  continueWatching: ContinueWatchingEntry[];
  watchlist: WatchlistEntry[];
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  applyThemePreset: (presetName: ThemePresetName) => void;
  
  
  profiles: UserProfile[];
  activeProfile: UserProfile;
  switchProfile: (profile: UserProfile) => void;
  addProfile: (name: string, avatar: string, accentColor: string, pin?: string, isKidsMode?: boolean) => UserProfile;
  updateProfile: (id: string, updates: Partial<UserProfile>) => void;
  deleteProfile: (id: string) => boolean;

  
  showProfileModal: boolean;
  setShowProfileModal: (show: boolean) => void;
  showSettingsModal: boolean;
  setShowSettingsModal: (show: boolean) => void;
  showRandomModal: boolean;
  setShowRandomModal: (show: boolean) => void;
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;
  
  
  recentSearches: string[];
  addRecentSearch: (query: string) => void;
  removeRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
  
  
  updateWatchProgress: (animeId: string, episodeNumber: number, currentTimeSec: number, durationSec: number, audioMode: 'SUB' | 'DUB') => void;
  removeFromContinueWatching: (animeId: string) => void;
  setAnimeWatchStatus: (animeId: string, status: WatchStatus) => Promise<void>;
  playAnimeEpisode: (anime: Anime, episodeNum?: number, audioMode?: 'SUB' | 'DUB') => Promise<void>;
  /** Keeps a title available locally so history rows can resolve it later. */
  rememberAnime: (anime: Anime) => void;

  
  currentUser: AniListUserData | null;
  oauthToken: string | null;
  isSyncingAniList: boolean;
  initiateAniListOAuth: () => void;
  loginWithToken: (token: string) => Promise<boolean>;
  logoutFromAniList: () => void;
  connectAniListUser: (username: string) => Promise<{ success: boolean; error?: string }>;
  syncAniList: () => Promise<void>;

  
  liveCatalog: Anime[];
  trendingAnime: Anime[];
  popularSeasonAnime: Anime[];
  topRatedAnime: Anime[];
  spotlightAnime: Anime[];
  isLoadingCatalog: boolean;
  catalogMetadata: CatalogMetadataState;

  
  showIntro: boolean;
  setShowIntro: (show: boolean) => void;
  playIntroAnimation: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<'home' | 'search' | 'schedule' | 'mylist' | 'downloads'>('home');
  const [selectedAnime, setSelectedAnime] = useState<Anime | null>(null);
  const [activeVideo, setActiveVideo] = useState<VideoPlaybackTarget | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const selectAnimeRequestRef = useRef(0);

  
  const [settings, setSettingsState] = useState<AppSettings>(loadSettings);

  
  const [profiles, setProfiles] = useState<UserProfile[]>(loadProfiles);
  const [activeProfile, setActiveProfileState] = useState<UserProfile>(() => {
    const list = loadProfiles();
    const activeId = loadActiveProfileId();
    return list.find(p => p.id === activeId) || list[0] || DEFAULT_PROFILES[0];
  });

  
  const [watchlist, setWatchlistState] = useState<WatchlistEntry[]>(() => loadWatchlist(activeProfile.id));
  const [continueWatching, setContinueWatchingState] = useState<ContinueWatchingEntry[]>(() => loadContinueWatching(activeProfile.id));
  const [recentSearches, setRecentSearchesState] = useState<string[]>(() => loadRecentSearches(activeProfile.id));

  
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showRandomModal, setShowRandomModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const sessionSeen = sessionStorage.getItem('anilife_intro_seen');
      return settings.playAppIntro !== false && !sessionSeen;
    } catch {
      return false;
    }
  });

  const playIntroAnimation = () => {
    setShowIntro(true);
  };

  
  const [oauthToken, setOauthToken] = useState<string | null>(loadOAuthToken);
  const [currentUser, setCurrentUser] = useState<AniListUserData | null>(null);
  const [isSyncingAniList, setIsSyncingAniList] = useState(false);
  const queueAniListProgress = useMemo(
    () => oauthToken
      ? createAniListProgressQueue((mediaId, progress) =>
          saveUserMediaListEntry(oauthToken, mediaId, 'CURRENT', progress))
      : null,
    [oauthToken],
  );

  
  const [liveCatalog, setLiveCatalog] = useState<Anime[]>(() => loadCachedCatalog() || []);
  const [trendingAnime, setTrendingAnime] = useState<Anime[]>([]);
  const [popularSeasonAnime, setPopularSeasonAnime] = useState<Anime[]>([]);
  const [topRatedAnime, setTopRatedAnime] = useState<Anime[]>([]);
  const [spotlightAnime, setSpotlightAnime] = useState<Anime[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [catalogMetadata, setCatalogMetadata] = useState<CatalogMetadataState>(() => ({
    state: loadCachedCatalog()?.length ? 'LOCAL' : 'UNAVAILABLE',
  }));

  
  useEffect(() => {
    document.documentElement.style.setProperty('--anilife-accent', settings.accentColor);
    
    if (settings.canvasBackground === 'amoled') {
      document.documentElement.style.setProperty('--anilife-canvas', '#000000');
      document.documentElement.style.setProperty('--anilife-bg', '#000000');
    } else {
      document.documentElement.style.setProperty('--anilife-canvas', '#121214');
      document.documentElement.style.setProperty('--anilife-bg', '#0e0d16');
    }
  }, [settings.accentColor, settings.canvasBackground]);

  useEffect(() => {
    if (settings.themePreferenceExplicit !== false) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      const canvasBackground = media.matches ? 'amoled' : 'dark';
      setSettingsState((current) =>
        current.canvasBackground === canvasBackground ? current : { ...current, canvasBackground }
      );
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [settings.themePreferenceExplicit]);

  
  useEffect(() => {
    let cancelled = false;
    const token = oauthToken || loadOAuthToken();
    if (token) {
      updateSettings({ anilistConnected: false });
      fetchViewerProfile(token)
        .then((viewer) => {
          if (cancelled) return;
          setCurrentUser(viewer);
          updateSettings({ anilistConnected: true, anilistUsername: viewer.name });
          fetchUserAnimeList(viewer.name, token).then(syncUserCollection);
        })
        .catch((err) => {
          if (cancelled) return;
          if (isAniListAuthError(err)) {
            clearOAuthToken();
            setOauthToken(null);
            setCurrentUser(null);
            updateSettings({ anilistConnected: false, anilistUsername: '' });
            return;
          }
          console.warn('Failed to restore AniList session:', err);
        });
    } else if (settings.anilistUsername) {
      fetchUserAnimeList(settings.anilistUsername).then(syncUserCollection).catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [oauthToken]);

  
  useEffect(() => {
    let isMounted = true;
    async function loadLiveAniList() {
      setIsLoadingCatalog(true);
      try {
        const liveResults = await Promise.allSettled([
          fetchTrendingAnime(1, 30),
          fetchPopularSeasonAnime(1, 30),
          fetchTopRatedAnime(1, 30),
          fetchPopularAllTimeAnime(1, 30),
        ]);
        if (!isMounted) return;

        const liveRows = liveResults.map((result) => result.status === 'fulfilled' ? result.value : []);
        const liveComplete = liveRows.every((rows) => rows.length > 0);
        let fallbackRows: Awaited<ReturnType<typeof mediaIndexRelease.home>> | null = null;
        if (!liveComplete) {
          fallbackRows = await mediaIndexRelease.home().catch(() => null);
        }

        const indexed = fallbackRows?.data.rows;
        const convTrending = liveRows[0].length
          ? liveRows[0].map(convertAniListToAnime)
          : (indexed?.trending.length ? indexed.trending : indexed?.popular ?? []).map(convertMediaIndexCompactToAnime);
        const convSeason = liveRows[1].length
          ? liveRows[1].map(convertAniListToAnime)
          : (indexed?.season ?? []).map(convertMediaIndexCompactToAnime);
        const convTopRated = liveRows[2].length
          ? liveRows[2].map(convertAniListToAnime)
          : (indexed?.topRated ?? []).map(convertMediaIndexCompactToAnime);
        const convPopular = liveRows[3].length
          ? liveRows[3].map(convertAniListToAnime)
          : (indexed?.popular ?? []).map(convertMediaIndexCompactToAnime);

        if (convTrending.length > 0) setTrendingAnime(convTrending);
        if (convSeason.length > 0) setPopularSeasonAnime(convSeason);
        if (convTopRated.length > 0) setTopRatedAnime(convTopRated);

        const spotlights = indexed?.spotlight.length && !liveRows[0].length
          ? indexed.spotlight.map(convertMediaIndexCompactToAnime).slice(0, 5)
          : (convTrending.length > 0 ? convTrending : convSeason).slice(0, 5);
        if (spotlights.length > 0) setSpotlightAnime(spotlights);

        
        const allItems = [...convTrending, ...convSeason, ...convTopRated, ...convPopular];
        const uniqueMap = new Map<string, Anime>();
        allItems.forEach(item => {
          if (!uniqueMap.has(item.id)) {
            uniqueMap.set(item.id, item);
          }
        });

        
        // Keep titles remembered by playback or a deep link even when they are not in this
        // AniList page: the Continue Watching row resolves against this catalogue.
        loadCachedCatalog()?.forEach(item => {
          if (!uniqueMap.has(item.id)) {
            uniqueMap.set(item.id, item);
          }
        });

        const merged = Array.from(uniqueMap.values());
        setLiveCatalog(merged);
        saveCachedCatalog(merged);

        if (liveComplete) {
          setCatalogMetadata({ state: 'LIVE' });
        } else if (fallbackRows) {
          setCatalogMetadata({
            state: fallbackRows.state,
            releaseId: fallbackRows.releaseId,
            generatedAt: fallbackRows.generatedAt,
            failure: fallbackRows.failure,
          });
        } else {
          setCatalogMetadata({ state: merged.length ? 'LOCAL' : 'UNAVAILABLE' });
        }
      } catch (err) {
        console.error('Error fetching live AniList data:', err);
        if (isMounted) setCatalogMetadata({ state: loadCachedCatalog()?.length ? 'LOCAL' : 'UNAVAILABLE' });
      } finally {
        if (isMounted) setIsLoadingCatalog(false);
      }
    }

    loadLiveAniList();
    return () => { isMounted = false; };
  }, []);

  const syncUserCollection = (data: AniListUserCollection) => {
    saveCachedAniListData(data);
    setCurrentUser(data.user);

    const newEntries: WatchlistEntry[] = [];
    const remoteContinueEntries: ContinueWatchingEntry[] = [];
    const remoteAnime = new Map<string, Anime>();

    data.lists.forEach(list => {
      list.entries.forEach(entry => {
        let st: WatchStatus = 'Watching';
        if (entry.status === 'COMPLETED') st = 'Completed';
        else if (entry.status === 'PLANNING') st = 'Plan to watch';
        else if (entry.status === 'PAUSED') st = 'Paused';
        else if (entry.status === 'DROPPED') st = 'Dropped';
        else if (entry.status === 'REPEATING') st = 'Rewatching';

        newEntries.push({
          animeId: String(entry.media.id),
          status: st,
          progress: Math.max(0, entry.progress || 0),
          score: Math.max(0, entry.score || 0),
          updatedAt: new Date(entry.updatedAt * 1000).toISOString()
        });

        const anime = convertAniListToAnime(entry.media);
        remoteAnime.set(anime.id, anime);
        const continueEntry = remoteContinueSeed({
          animeId: anime.id,
          status: entry.status,
          progress: Math.max(0, entry.progress || 0),
          totalEpisodes: entry.media.episodes,
          nextEpisodeNumber: entry.media.nextAiringEpisode?.episode,
          updatedAt: new Date(entry.updatedAt * 1000).toISOString(),
        });
        if (continueEntry) remoteContinueEntries.push(continueEntry);

      });
    });

    setLiveCatalog((current) => {
      const byId = new Map(current.map((anime) => [anime.id, anime]));
      // Account queries intentionally fetch less metadata than detail/trending queries. They fill
      // catalogue gaps, but must not replace a richer copy already remembered by the app.
      remoteAnime.forEach((anime, id) => {
        if (!byId.has(id)) byId.set(id, anime);
      });
      const merged = [...byId.values()];
      saveCachedCatalog(merged);
      return merged;
    });

    setWatchlistState((current) => {
      const merged = mergeLibraryEntries(current, newEntries);
      saveWatchlist(activeProfile.id, merged);
      return merged;
    });

    setContinueWatchingState((current) => {
      const merged = mergeContinueWatching(current, remoteContinueEntries);
      saveContinueWatching(activeProfile.id, merged);
      return merged;
    });

  };

  
  const switchProfile = (profile: UserProfile) => {
    setActiveProfileState(profile);
    saveActiveProfileId(profile.id);
    setWatchlistState(loadWatchlist(profile.id));
    setContinueWatchingState(loadContinueWatching(profile.id));
    setRecentSearchesState(loadRecentSearches(profile.id));
    if (profile.accentColor) {
      updateSettings({ accentColor: profile.accentColor });
    }
  };

  
  const addProfile = (name: string, avatar: string, accentColor: string, pin?: string, isKidsMode?: boolean): UserProfile => {
    const newProf: UserProfile = {
      id: `profile-${Date.now()}`,
      name: name.trim() || 'New Viewer',
      avatar,
      accentColor,
      pin: pin ? pin.trim() : undefined,
      isKidsMode,
      createdAt: Date.now()
    };
    const updated = [...profiles, newProf];
    setProfiles(updated);
    saveProfiles(updated);
    return newProf;
  };

  
  const updateProfile = (id: string, updates: Partial<UserProfile>) => {
    const updated = profiles.map(p => (p.id === id ? { ...p, ...updates } : p));
    setProfiles(updated);
    saveProfiles(updated);
    if (activeProfile.id === id) {
      const refreshed = { ...activeProfile, ...updates };
      setActiveProfileState(refreshed);
      if (updates.accentColor) {
        updateSettings({ accentColor: updates.accentColor });
      }
    }
  };

  
  const deleteProfile = (id: string): boolean => {
    if (profiles.length <= 1) return false;
    const updated = profiles.filter(p => p.id !== id);
    setProfiles(updated);
    saveProfiles(updated);
    if (activeProfile.id === id) {
      switchProfile(updated[0]);
    }
    void deleteProfileStorage(id);
    return true;
  };

  const applyThemePreset = (presetName: ThemePresetName) => {
    const preset = THEME_PRESETS[presetName];
    if (preset) {
      updateSettings({
        themePreset: presetName,
        themePreferenceExplicit: true,
        canvasBackground: preset.canvas,
        accentColor: preset.accent,
      });
    }
  };

  const initiateAniListOAuth = () => {
    try {
      window.location.href = getAniListOAuthUrl();
    } catch (error) {
      console.error('AniList sign-in is not configured:', error);
    }
  };

  const loginWithToken = async (token: string): Promise<boolean> => {
    setIsSyncingAniList(true);
    try {
      const viewer = await fetchViewerProfile(token);
      setOauthToken(token);
      saveOAuthToken(token);
      setCurrentUser(viewer);
      updateSettings({ anilistConnected: true, anilistUsername: viewer.name });

      const collection = await fetchUserAnimeList(viewer.name, token);
      syncUserCollection(collection);

      setIsSyncingAniList(false);
      return true;
    } catch (err) {
      console.error('Failed to log in with AniList token:', err);
      setIsSyncingAniList(false);
      return false;
    }
  };

  const logoutFromAniList = () => {
    clearOAuthToken();
    setOauthToken(null);
    setCurrentUser(null);
    updateSettings({ anilistConnected: false, anilistUsername: '' });
  };

  const connectAniListUser = async (username: string): Promise<{ success: boolean; error?: string }> => {
    if (!username.trim()) {
      return { success: false, error: 'Please enter a valid AniList username' };
    }
    setIsSyncingAniList(true);
    try {
      const data = await fetchUserAnimeList(username.trim(), oauthToken);
      syncUserCollection(data);
      updateSettings({ anilistConnected: true, anilistUsername: data.user.name });
      setIsSyncingAniList(false);
      return { success: true };
    } catch (err: any) {
      setIsSyncingAniList(false);
      return { success: false, error: err.message || 'User not found or AniList unreachable' };
    }
  };

  const syncAniList = async () => {
    if (currentUser?.name) {
      await connectAniListUser(currentUser.name);
    } else if (settings.anilistUsername) {
      await connectAniListUser(settings.anilistUsername);
    }
  };

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettingsState(prev => {
      const updated = mergeSettings(prev, newSettings);
      saveSettings(updated);
      return updated;
    });
  };

  const updateWatchProgress = useCallback((animeId: string, episodeNumber: number, currentTimeSec: number, durationSec: number, audioMode: 'SUB' | 'DUB') => {
    const currentTime = Math.max(0, Math.round(currentTimeSec));
    const duration = Math.max(0, Math.round(durationSec));
    setContinueWatchingState(prev => {
      const existingIdx = prev.findIndex(item => item.animeId === animeId);
      const existing = existingIdx >= 0 ? prev[existingIdx] : null;
      const completed = duration > 0 && currentTime >= duration - 1;
      const alreadyComplete = completed && existing && existing.currentTimeSec >= duration - 1;
      if (
        existing &&
        existing.episodeNumber === episodeNumber &&
        existing.audioMode === audioMode &&
        existing.serverName === settings.activeServer &&
        Math.abs(existing.currentTimeSec - currentTime) < 5 &&
        Math.abs(existing.durationSec - duration) < 2 &&
        (!completed || alreadyComplete)
      ) return prev;
      const updatedItem: ContinueWatchingEntry = {
        animeId,
        episodeNumber,
        currentTimeSec: currentTime,
        durationSec: duration,
        serverName: settings.activeServer,
        audioMode,
        updatedAt: new Date().toISOString(),
        fromRemote: false,
      };

      let nextList: ContinueWatchingEntry[];
      if (existingIdx >= 0) {
        nextList = [updatedItem, ...prev.filter((_, index) => index !== existingIdx)];
      } else {
        nextList = [updatedItem, ...prev];
      }
      saveContinueWatching(activeProfile.id, nextList);
      return nextList;
    });

    if (queueAniListProgress && duration > 0 && (currentTime / duration) >= (settings.watchedThreshold / 100)) {
      const numericId = parseInt(animeId, 10);
      if (!isNaN(numericId)) {
        queueAniListProgress(numericId, episodeNumber).catch(err => {
          console.error('Failed to sync episode progress to AniList:', err);
        });
      }
    }
  }, [activeProfile.id, queueAniListProgress, settings.activeServer, settings.watchedThreshold]);

  const removeFromContinueWatching = (animeId: string) => {
    setContinueWatchingState(prev => {
      const filtered = prev.filter(item => item.animeId !== animeId);
      saveContinueWatching(activeProfile.id, filtered);
      return filtered;
    });
  };

  const setAnimeWatchStatus = async (animeId: string, status: WatchStatus) => {
    setWatchlistState(prev => {
      const existingIdx = prev.findIndex(item => item.animeId === animeId);
      let updated: WatchlistEntry[];
      if (existingIdx >= 0) {
        updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], status, updatedAt: new Date().toISOString() };
      } else {
        updated = [{ animeId, status, updatedAt: new Date().toISOString() }, ...prev];
      }
      saveWatchlist(activeProfile.id, updated);
      return updated;
    });

    if (oauthToken) {
      const numericId = parseInt(animeId, 10);
      if (!isNaN(numericId)) {
        let anilistStatus: 'CURRENT' | 'COMPLETED' | 'PLANNING' | 'DROPPED' | 'PAUSED' | 'REPEATING' = 'CURRENT';
        if (status === 'Completed') anilistStatus = 'COMPLETED';
        else if (status === 'Plan to watch') anilistStatus = 'PLANNING';
        else if (status === 'Paused') anilistStatus = 'PAUSED';
        else if (status === 'Dropped') anilistStatus = 'DROPPED';
        else if (status === 'Rewatching') anilistStatus = 'REPEATING';

        try {
          await saveUserMediaListEntry(oauthToken, numericId, anilistStatus);
        } catch (err) {
          console.error('Failed to update anime on AniList:', err);
        }
      }
    }
  };

  const addRecentSearch = (query: string) => {
    if (!query.trim()) return;
    setRecentSearchesState(prev => {
      const filtered = prev.filter(q => q.toLowerCase() !== query.toLowerCase());
      const next = [query.trim(), ...filtered].slice(0, 10);
      saveRecentSearches(activeProfile.id, next);
      return next;
    });
  };

  const removeRecentSearch = (query: string) => {
    setRecentSearchesState(prev => {
      const next = prev.filter(q => q !== query);
      saveRecentSearches(activeProfile.id, next);
      return next;
    });
  };

  const clearRecentSearches = () => {
    setRecentSearchesState([]);
    saveRecentSearches(activeProfile.id, []);
  };

  const rememberAnime = (anime: Anime) => {
    setLiveCatalog(prev => {
      const existing = prev.find((item) => item.id === anime.id);
      if (existing && existing.synopsis !== 'Details are available when you open this title.') return prev;
      const next = existing
        ? prev.map((item) => item.id === anime.id ? anime : item)
        : [anime, ...prev];
      saveCachedCatalog(next);
      return next;
    });
  };

  const selectAnime = (anime: Anime | null) => {
    const request = ++selectAnimeRequestRef.current;
    setSelectedAnime(anime);
    if (!anime
      || anime.synopsis !== 'Details are available when you open this title.'
      || !/^\d+$/.test(anime.id)) return;

    void mediaIndexRelease.media(Number(anime.id)).then((indexed) => {
      if (request !== selectAnimeRequestRef.current) return;
      const hydrated = convertMediaIndexMediaToAnime(indexed.data);
      if (!isAnimeVisible(hydrated, settings.hideAdultContent)) {
        setSelectedAnime((current) => current?.id === anime.id ? null : current);
        setRouteError('This title is hidden by your adult-content preference.');
        return;
      }
      setSelectedAnime((current) => current?.id === anime.id ? hydrated : current);
      setLiveCatalog((current) => {
        const next = current.some((item) => item.id === hydrated.id)
          ? current.map((item) => item.id === hydrated.id ? hydrated : item)
          : [hydrated, ...current];
        saveCachedCatalog(next);
        return next;
      });
    }).catch(() => undefined);
  };

  const playAnimeEpisode = async (anime: Anime, episodeNum: number = 1, audioMode?: 'SUB' | 'DUB') => {
    if (!isAnimeVisible(anime, settings.hideAdultContent)) {
      setSelectedAnime(null);
      setRouteError('This title is hidden by your adult-content preference.');
      return;
    }
    rememberAnime(anime);
    if (!canWatchEpisode(anime, episodeNum)) {
      setRouteError(
        anime.nextEpisode?.number === episodeNum
          ? `Episode ${episodeNum} has not aired yet.`
          : `Episode ${episodeNum} is not confirmed as available yet.`
      );
      return;
    }
    const aniListId = getAnimeAniListId(anime);
    if (!Number.isSafeInteger(aniListId)) {
      setRouteError('This title cannot create a protected watch session because its AniList id is unavailable.');
      return;
    }
    const preferredAudioMode = audioMode || settings.defaultAudioMode || 'SUB';
    let hasVerifiedDub: boolean | null;
    let watchSession: WatchSession;
    try {
      [hasVerifiedDub, watchSession] = await Promise.all([
        isAnimeDubbed(aniListId),
        createWatchSession(aniListId, episodeNum),
      ]);
    } catch (error) {
      if (error instanceof WatchSessionError && error.status === 401) {
        window.location.reload();
        return;
      }
      const code = error instanceof WatchSessionError ? error.code : 'unknown';
      setRouteError(
        code === 'episode_unavailable'
          ? `Episode ${episodeNum} is not confirmed as released yet.`
          : code === 'release_status_unavailable'
            ? `Anilife could not verify episode ${episodeNum}'s release status right now. Try again in a moment.`
          : code === 'rate_limited'
            ? 'Too many watch requests were made from this connection. Wait a minute, then try again.'
            : code === 'network'
              ? 'Anilife could not reach its playback service. Check your connection and try again.'
              : 'Anilife could not start this episode right now. Try again in a moment.'
      );
      return;
    }
    const resolvedAudioMode = availableAudioMode(preferredAudioMode, hasVerifiedDub);
    setSelectedAnime(null);
    setActiveVideo({
      anime,
      episodeNumber: episodeNum,
      audioMode: resolvedAudioMode,
      audioFallback: resolvedAudioMode !== preferredAudioMode,
      dubAvailability: hasVerifiedDub,
      serverId: settings.activeServer || 'zoko',
      watchSession,
    });
  };

  const visibleLiveCatalog = useMemo(
    () => liveCatalog.filter((anime) => isAnimeVisible(anime, settings.hideAdultContent)),
    [liveCatalog, settings.hideAdultContent]
  );
  const visibleTrendingAnime = useMemo(
    () => trendingAnime.filter((anime) => isAnimeVisible(anime, settings.hideAdultContent)),
    [trendingAnime, settings.hideAdultContent]
  );
  const visiblePopularSeasonAnime = useMemo(
    () => popularSeasonAnime.filter((anime) => isAnimeVisible(anime, settings.hideAdultContent)),
    [popularSeasonAnime, settings.hideAdultContent]
  );
  const visibleTopRatedAnime = useMemo(
    () => topRatedAnime.filter((anime) => isAnimeVisible(anime, settings.hideAdultContent)),
    [topRatedAnime, settings.hideAdultContent]
  );
  const visibleSpotlightAnime = useMemo(
    () => spotlightAnime.filter((anime) => isAnimeVisible(anime, settings.hideAdultContent)),
    [spotlightAnime, settings.hideAdultContent]
  );

  return (
    <AppContext.Provider
      value={{
        activeTab,
        setActiveTab,
        rememberAnime,
        selectedAnime,
        setSelectedAnime: selectAnime,
        activeVideo,
        setActiveVideo,
        routeError,
        setRouteError,
        continueWatching,
        watchlist,
        settings,
        updateSettings,
        applyThemePreset,
        profiles,
        activeProfile,
        switchProfile,
        addProfile,
        updateProfile,
        deleteProfile,
        showProfileModal,
        setShowProfileModal,
        showSettingsModal,
        setShowSettingsModal,
        showRandomModal,
        setShowRandomModal,
        showAuthModal,
        setShowAuthModal,
        recentSearches,
        addRecentSearch,
        removeRecentSearch,
        clearRecentSearches,
        updateWatchProgress,
        removeFromContinueWatching,
        setAnimeWatchStatus,
        playAnimeEpisode,
        currentUser,
        oauthToken,
        isSyncingAniList,
        initiateAniListOAuth,
        loginWithToken,
        logoutFromAniList,
        connectAniListUser,
        syncAniList,
        liveCatalog: visibleLiveCatalog,
        trendingAnime: visibleTrendingAnime,
        popularSeasonAnime: visiblePopularSeasonAnime,
        topRatedAnime: visibleTopRatedAnime,
        spotlightAnime: visibleSpotlightAnime,
        isLoadingCatalog,
        catalogMetadata,
        showIntro,
        setShowIntro,
        playIntroAnimation
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};


