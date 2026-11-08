import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Anime,
  AppSettings,
  ContinueWatchingEntry,
  UserProfile,
  WatchlistEntry,
  WatchStatus,
  Episode,
  ThemePresetName
} from '../types/anime';
import { ANIME_CATALOG, SERVERS } from '../utils/animeData';
import {
  DEFAULT_PROFILES,
  DEFAULT_SETTINGS,
  THEME_PRESETS,
  loadSettings,
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
} from '../utils/storage';
import {
  AniListMedia,
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
  loadOAuthToken,
  saveOAuthToken,
  clearOAuthToken,
  loadCachedCatalog,
  saveCachedCatalog,
  saveCachedAniListData,
  loadCachedAniListData
} from '../utils/anilistApi';
import {
  fetchMediaIndexEpisodes,
  fetchMediaIndexSkip,
  isAnimeDubbed
} from '../utils/mediaIndexApi';

export interface VideoPlaybackTarget {
  anime: Anime;
  episodeNumber: number;
  audioMode: 'SUB' | 'DUB';
  serverId: string;
}

export function convertAniListToAnime(m: AniListMedia): Anime {
  const title = m.title.english || m.title.romaji || m.title.native || 'Untitled Anime';
  const banner = m.bannerImage || m.coverImage.extraLarge || m.coverImage.large || '';
  const poster = m.coverImage.extraLarge || m.coverImage.large || m.coverImage.medium || '';
  const epCount = m.episodes || (m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : 12);

  const episodes: Episode[] = Array.from({ length: Math.min(24, Math.max(1, epCount)) }, (_, i) => ({
    id: `${m.id}-ep-${i + 1}`,
    number: i + 1,
    title: `Episode ${i + 1}`,
    durationSec: (m.duration || 24) * 60,
    thumbnail: banner || poster || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop',
    videoUrl: '',
    airedDate: m.seasonYear ? `${m.season || 'Fall'} ${m.seasonYear}` : undefined
  }));

  return {
    id: String(m.id),
    title,
    romajiTitle: m.title.romaji,
    nativeTitle: m.title.native,
    bannerImage: banner || poster,
    posterImage: poster || banner,
    score: m.averageScore || 75,
    format: (m.format as any) || 'TV',
    year: m.seasonYear || 2024,
    status: m.status === 'FINISHED' ? 'Finished' : 'Releasing',
    durationMins: m.duration || 24,
    genres: m.genres && m.genres.length > 0 ? m.genres : ['Action', 'Fantasy'],
    synopsis: m.description ? m.description.replace(/<[^>]*>/g, '').replace(/&#039;/g, "'").replace(/&quot;/g, '"') : 'No synopsis available.',
    studio: m.studios?.nodes?.[0]?.name || 'Animation Studio',
    startDate: m.seasonYear ? `${m.season || 'Fall'} ${m.seasonYear}` : '2024',
    seasonName: m.season || 'Fall',
    membersCount: m.popularity || 85000,
    trailerUrl: '',
    hasDub: true,
    hasSub: true,
    seasons: [
      {
        id: `${m.id}-s1`,
        number: 1,
        title: 'Season 1',
        year: m.seasonYear || 2024,
        episodes
      }
    ],
    related: []
  };
}

interface AppContextType {
  activeTab: 'home' | 'search' | 'schedule' | 'mylist';
  setActiveTab: (tab: 'home' | 'search' | 'schedule' | 'mylist') => void;
  selectedAnime: Anime | null;
  setSelectedAnime: (anime: Anime | null) => void;
  activeVideo: VideoPlaybackTarget | null;
  setActiveVideo: (video: VideoPlaybackTarget | null) => void;
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
  showNotificationsModal: boolean;
  setShowNotificationsModal: (show: boolean) => void;
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;
  
  
  recentSearches: string[];
  addRecentSearch: (query: string) => void;
  removeRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
  
  
  updateWatchProgress: (animeId: string, episodeNumber: number, currentTimeSec: number, durationSec: number) => void;
  removeFromContinueWatching: (animeId: string) => void;
  setAnimeWatchStatus: (animeId: string, status: WatchStatus) => Promise<void>;
  playAnimeEpisode: (anime: Anime, episodeNum?: number, audioMode?: 'SUB' | 'DUB') => void;
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

  
  showIntro: boolean;
  setShowIntro: (show: boolean) => void;
  playIntroAnimation: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<'home' | 'search' | 'schedule' | 'mylist'>('home');
  const [selectedAnime, setSelectedAnime] = useState<Anime | null>(null);
  const [activeVideo, setActiveVideo] = useState<VideoPlaybackTarget | null>(null);

  
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
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = localStorage.getItem('anilife_app_settings_v2');
      const settingsObj = raw ? JSON.parse(raw) : null;
      const isEnabled = settingsObj ? settingsObj.playAppIntro !== false : true;
      const sessionSeen = sessionStorage.getItem('anilife_intro_seen');
      return isEnabled && !sessionSeen;
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

  
  const [liveCatalog, setLiveCatalog] = useState<Anime[]>(() => loadCachedCatalog() || ANIME_CATALOG);
  const [trendingAnime, setTrendingAnime] = useState<Anime[]>([]);
  const [popularSeasonAnime, setPopularSeasonAnime] = useState<Anime[]>([]);
  const [topRatedAnime, setTopRatedAnime] = useState<Anime[]>([]);
  const [spotlightAnime, setSpotlightAnime] = useState<Anime[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);

  
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
    if (typeof window !== 'undefined' && window.location.hash.includes('access_token=')) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const token = hashParams.get('access_token');
      if (token) {
        saveOAuthToken(token);
        if (window.opener) {
          try {
            window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', token }, '*');
            window.close();
          } catch {}
        }
        loginWithToken(token);
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const token = event.data.token || loadOAuthToken();
        if (token) {
          loginWithToken(token);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  
  useEffect(() => {
    const token = oauthToken || loadOAuthToken();
    if (token) {
      fetchViewerProfile(token)
        .then((viewer) => {
          setCurrentUser(viewer);
          updateSettings({ anilistConnected: true, anilistUsername: viewer.name });
          fetchUserAnimeList(viewer.name, token).then(syncUserCollection);
        })
        .catch((err) => {
          console.error('Failed to restore AniList session:', err);
        });
    } else if (settings.anilistUsername) {
      fetchUserAnimeList(settings.anilistUsername).then(syncUserCollection).catch(() => {});
    }
  }, [oauthToken]);

  
  useEffect(() => {
    let isMounted = true;
    async function loadLiveAniList() {
      setIsLoadingCatalog(true);
      try {
        const [trendingP1, trendingP2, seasonP1, seasonP2, topRated, popularAll] = await Promise.all([
          fetchTrendingAnime(1, 30).catch(() => []),
          fetchTrendingAnime(2, 30).catch(() => []),
          fetchPopularSeasonAnime(1, 30).catch(() => []),
          fetchPopularSeasonAnime(2, 30).catch(() => []),
          fetchTopRatedAnime(1, 30).catch(() => []),
          fetchPopularAllTimeAnime(1, 30).catch(() => [])
        ]);

        if (!isMounted) return;

        const convTrending = [...trendingP1, ...trendingP2].map(convertAniListToAnime);
        const convSeason = [...seasonP1, ...seasonP2].map(convertAniListToAnime);
        const convTopRated = topRated.map(convertAniListToAnime);
        const convPopular = popularAll.map(convertAniListToAnime);

        if (convTrending.length > 0) setTrendingAnime(convTrending);
        if (convSeason.length > 0) setPopularSeasonAnime(convSeason);
        if (convTopRated.length > 0) setTopRatedAnime(convTopRated);

        
        const spotlights = (convTrending.length > 0 ? convTrending : convSeason).slice(0, 5);
        if (spotlights.length > 0) setSpotlightAnime(spotlights);

        
        const allItems = [...convTrending, ...convSeason, ...convTopRated, ...convPopular];
        const uniqueMap = new Map<string, Anime>();
        allItems.forEach(item => {
          if (!uniqueMap.has(item.id)) {
            uniqueMap.set(item.id, item);
          }
        });

        
        ANIME_CATALOG.forEach(item => {
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
      } catch (err) {
        console.error('Error fetching live AniList data:', err);
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
    const continueItems: ContinueWatchingEntry[] = [];

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
          updatedAt: new Date(entry.updatedAt * 1000).toISOString()
        });

        if (entry.status === 'CURRENT') {
          continueItems.push({
            animeId: String(entry.media.id),
            episodeNumber: Math.max(1, entry.progress || 1),
            currentTimeSec: 600,
            durationSec: (entry.media.duration || 24) * 60,
            serverName: settings.activeServer,
            audioMode: 'SUB',
            updatedAt: new Date(entry.updatedAt * 1000).toISOString()
          });
        }
      });
    });

    if (newEntries.length > 0) {
      setWatchlistState(newEntries);
      saveWatchlist(activeProfile.id, newEntries);
    }

    if (continueItems.length > 0) {
      setContinueWatchingState(continueItems);
      saveContinueWatching(activeProfile.id, continueItems);
    }
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
    return true;
  };

  const applyThemePreset = (presetName: ThemePresetName) => {
    const preset = THEME_PRESETS[presetName];
    if (preset) {
      updateSettings({
        themePreset: presetName,
        canvasBackground: preset.canvas,
        accentColor: preset.accent,
      });
    }
  };

  const initiateAniListOAuth = () => {
    const redirectUri = `${window.location.origin}/auth/callback.html`;
    const authUrl = getAniListOAuthUrl(redirectUri);
    window.location.href = authUrl;
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
      const updated = { ...prev, ...newSettings };
      saveSettings(updated);
      return updated;
    });
  };

  const updateWatchProgress = (animeId: string, episodeNumber: number, currentTimeSec: number, durationSec: number) => {
    setContinueWatchingState(prev => {
      const existingIdx = prev.findIndex(item => item.animeId === animeId);
      const updatedItem: ContinueWatchingEntry = {
        animeId,
        episodeNumber,
        currentTimeSec,
        durationSec,
        serverName: settings.activeServer,
        audioMode: settings.defaultAudioMode || 'SUB',
        updatedAt: new Date().toISOString()
      };

      let nextList: ContinueWatchingEntry[];
      if (existingIdx >= 0) {
        nextList = [...prev];
        nextList[existingIdx] = updatedItem;
      } else {
        nextList = [updatedItem, ...prev];
      }
      saveContinueWatching(activeProfile.id, nextList);
      return nextList;
    });

    if (oauthToken && durationSec > 0 && (currentTimeSec / durationSec) >= (settings.watchedThreshold / 100)) {
      const numericId = parseInt(animeId, 10);
      if (!isNaN(numericId)) {
        saveUserMediaListEntry(oauthToken, numericId, 'CURRENT', episodeNumber).catch(err => {
          console.error('Failed to sync episode progress to AniList:', err);
        });
      }
    }
  };

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
      if (prev.some(item => item.id === anime.id)) return prev;
      const next = [anime, ...prev];
      saveCachedCatalog(next);
      return next;
    });
  };

  const playAnimeEpisode = (anime: Anime, episodeNum: number = 1, audioMode: 'SUB' | 'DUB' = 'SUB') => {
    rememberAnime(anime);
    setSelectedAnime(null);
    setActiveVideo({
      anime,
      episodeNumber: episodeNum,
      audioMode,
      serverId: settings.activeServer || 'reanime'
    });
  };

  return (
    <AppContext.Provider
      value={{
        activeTab,
        setActiveTab,
        rememberAnime,
        selectedAnime,
        setSelectedAnime,
        activeVideo,
        setActiveVideo,
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
        showNotificationsModal,
        setShowNotificationsModal,
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
        liveCatalog,
        trendingAnime,
        popularSeasonAnime,
        topRatedAnime,
        spotlightAnime,
        isLoadingCatalog,
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

