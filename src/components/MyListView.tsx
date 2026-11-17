import React, { useState } from 'react';
import { safeImageUrl } from '../utils/safeUrl';
import { useApp } from '../context/AppContext';
import { Anime, ContinueWatchingEntry, WatchlistEntry } from '../types/anime';
import { animeMatchesSearch, displayAnimeTitle } from '../utils/animePreferences';
import {
  RotateCcw,
  BarChart3,
  Check,
  Search,
  Play,
  Bookmark,
  ExternalLink,
  UserCheck,
  AlertCircle,
  LogIn,
  Sparkles,
  X
} from 'lucide-react';

type LibraryTab = 'Continue Watching' | 'Watching' | 'Rewatching' | 'Completed' | 'Planning' | 'Paused' | 'Dropped' | 'All';

const LIBRARY_TABS: LibraryTab[] = [
  'Continue Watching',
  'Watching',
  'Rewatching',
  'Planning',
  'Paused',
  'Completed',
  'Dropped',
  'All',
];

interface LibraryItem {
  anime: Anime;
  entry?: WatchlistEntry;
  continueEntry?: ContinueWatchingEntry;
}

export const MyListView: React.FC = () => {
  const {
    watchlist,
    continueWatching,
    removeFromContinueWatching,
    setSelectedAnime,
    playAnimeEpisode,
    activeProfile,
    settings,
    currentUser,
    oauthToken,
    isSyncingAniList,
    syncAniList,
    liveCatalog,
    setShowAuthModal
  } = useApp();

  const [activeTab, setActiveTab] = useState<LibraryTab>('Continue Watching');
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('Any format');
  const [showStatsModal, setShowStatsModal] = useState(false);

  
  const resolvedList: LibraryItem[] = watchlist
    .map(entry => {
      const anime = liveCatalog.find(a => a.id === entry.animeId);
      return anime ? { entry, anime } : null;
    })
    .filter((item): item is { entry: WatchlistEntry; anime: Anime } => item !== null);

  const resolvedContinue: LibraryItem[] = continueWatching
    .map((continueEntry) => {
      const anime = liveCatalog.find((item) => item.id === continueEntry.animeId);
      return anime ? { continueEntry, anime } : null;
    })
    .filter((item): item is { continueEntry: ContinueWatchingEntry; anime: Anime } => item !== null);

  const tabCounts: Record<LibraryTab, number> = {
    'Continue Watching': resolvedContinue.length,
    Watching: resolvedList.filter(({ entry }) => entry?.status === 'Watching').length,
    Rewatching: resolvedList.filter(({ entry }) => entry?.status === 'Rewatching').length,
    Planning: resolvedList.filter(({ entry }) => entry?.status === 'Plan to watch').length,
    Paused: resolvedList.filter(({ entry }) => entry?.status === 'Paused').length,
    Completed: resolvedList.filter(({ entry }) => entry?.status === 'Completed').length,
    Dropped: resolvedList.filter(({ entry }) => entry?.status === 'Dropped').length,
    All: resolvedList.length,
  };

  const activeEntries = activeTab === 'Continue Watching' ? resolvedContinue : resolvedList;
  const filteredEntries = activeEntries.filter(({ anime, entry }) => {
    const matchText = animeMatchesSearch(anime, filterQuery);
    const matchFormat = selectedFormat === 'Any format' || anime.format === selectedFormat;
    let matchTab = true;
    if (activeTab === 'Watching') matchTab = entry?.status === 'Watching';
    else if (activeTab === 'Rewatching') matchTab = entry?.status === 'Rewatching';
    else if (activeTab === 'Completed') matchTab = entry?.status === 'Completed';
    else if (activeTab === 'Planning') matchTab = entry?.status === 'Plan to watch';
    else if (activeTab === 'Paused') matchTab = entry?.status === 'Paused';
    else if (activeTab === 'Dropped') matchTab = entry?.status === 'Dropped';
    return matchText && matchFormat && matchTab;
  });

  const userStats = currentUser?.statistics?.anime;

  return (
    <div className="space-y-6 pb-20 animate-fadeIn">
      {}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-black/50 border border-[var(--anilife-accent)]/20 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[var(--anilife-accent)] p-0.5 shrink-0 bg-black/60">
            <img
              src={safeImageUrl(currentUser?.avatar?.large || activeProfile.avatar, '/assets/images/Anilife-Logo.png')}
              alt={currentUser?.name || activeProfile.name}
              className="w-full h-full object-cover rounded-full"
            />
          </div>
          <div>
            <span className="text-[11px] font-bold tracking-widest text-[var(--anilife-accent)] uppercase">
              My Library
            </span>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>{currentUser?.name || settings.anilistUsername || activeProfile.name}</span>
                {currentUser ? (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <UserCheck className="w-3 h-3" />
                    AniList Synced
                  </span>
                ) : (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Local Cache
                  </span>
                )}
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {userStats ? (
                  <span>
                    {userStats.count} anime tracked • {userStats.episodesWatched} episodes watched • {userStats.meanScore}% mean score
                  </span>
                ) : (
                  <span>{resolvedList.length} anime tracked in your library</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {}
        <div className="flex items-center gap-2 self-start sm:self-center">
          {currentUser && (
            <button
              onClick={() => setShowStatsModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/15 text-xs text-zinc-200 font-medium transition-colors cursor-pointer"
            >
              <BarChart3 className="w-3.5 h-3.5 text-[var(--anilife-accent)]" />
              <span>Stats</span>
            </button>
          )}

          <button
            onClick={() => setShowAuthModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/15 text-xs text-[var(--anilife-accent)] font-medium transition-colors cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{currentUser ? 'AniList Account' : 'Sign In'}</span>
          </button>

          <button
            onClick={syncAniList}
            disabled={isSyncingAniList}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[var(--anilife-accent)] hover:bg-[var(--anilife-accent-hover)] text-xs text-black font-bold transition-colors cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isSyncingAniList ? 'animate-spin' : ''}`} />
            <span>{isSyncingAniList ? 'Syncing...' : 'Sync'}</span>
          </button>
        </div>
      </div>

      {}
      {!currentUser && (
        <div className="p-5 rounded-3xl bg-black/60 border border-[var(--anilife-accent)]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-bold text-base text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--anilife-accent)]" />
              <span>Connect your AniList Account</span>
            </h3>
            <p className="text-xs text-zinc-300 max-w-xl">
              Sign in with your AniList account to enable real-time bidirectional syncing of your watching lists, episode progress, and ratings.
            </p>
          </div>
          <button
            onClick={() => setShowAuthModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--anilife-accent)] hover:bg-[var(--anilife-accent-hover)] text-black font-bold text-xs shadow-lg shadow-[var(--anilife-accent-shadow)] transition-all cursor-pointer whitespace-nowrap"
          >
            <LogIn className="w-4 h-4" />
            <span>Sign In to AniList</span>
          </button>
        </div>
      )}

      {}
      <div role="group" aria-label="Library views" className="flex items-center gap-2 border-b border-white/10 pb-3 overflow-x-auto no-scrollbar">
        {LIBRARY_TABS.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-[var(--anilife-accent)] text-black shadow-md shadow-[var(--anilife-accent-shadow)]'
                  : 'bg-white/5 hover:bg-white/10 text-zinc-300'
              }`}
            >
              <span>{tab}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${isActive ? 'bg-black/15' : 'bg-white/10 text-zinc-400'}`}>
                {tabCounts[tab]}
              </span>
            </button>
          );
        })}

      </div>

      {}
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-center gap-2">
        <select
          value={selectedFormat}
          onChange={(e) => setSelectedFormat(e.target.value)}
          className="px-3.5 py-2 rounded-full bg-white/5 border border-white/10 text-xs text-zinc-300 focus:outline-none focus:border-[var(--anilife-accent)] cursor-pointer"
        >
          <option value="Any format" className="bg-[#14121e]">Any format</option>
          <option value="TV" className="bg-[#14121e]">TV</option>
          <option value="Movie" className="bg-[#14121e]">Movie</option>
          <option value="ONA" className="bg-[#14121e]">ONA</option>
        </select>

        <div className="relative min-w-[180px] flex-1 sm:max-w-2xl">
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter by title..."
            className="w-full pl-8 pr-3 py-2 rounded-full bg-white/5 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[var(--anilife-accent)]"
          />
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {}
      {filteredEntries.length === 0 ? (
        <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10 space-y-3">
          <Bookmark className="w-10 h-10 text-zinc-500 mx-auto" />
          <h3 className="text-lg font-bold text-white">No items found in {activeTab}</h3>
          <p className="text-sm text-zinc-400 max-w-sm mx-auto">
            {activeTab === 'Continue Watching'
              ? 'Start an episode here or on another synced device to see it in this view.'
              : currentUser
                ? `You don't have any anime marked as ${activeTab} in your merged Anilife and AniList library.`
                : 'Sign in with your AniList account or add shows from Browse to populate this list.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {filteredEntries.map(({ anime, entry, continueEntry }) => {
            const episodeToPlay = continueEntry?.episodeNumber
              ?? (entry?.status === 'Completed' ? 1 : Math.max(1, (entry?.progress ?? 0) + 1));
            const watchProgress = continueEntry && continueEntry.durationSec > 0
              ? Math.min(100, Math.round((continueEntry.currentTimeSec / continueEntry.durationSec) * 100))
              : null;
            return (
            <div
              key={anime.id}
              className="group space-y-2 relative"
            >
              <div className="relative aspect-[3/4] w-full rounded-2xl overflow-hidden border border-white/10 group-hover:border-[var(--anilife-accent)]/50 transition-all duration-300 group-hover:shadow-lg group-hover:shadow-[var(--anilife-accent-shadow)] bg-zinc-900">
                <img
                  src={anime.posterImage}
                  alt={displayAnimeTitle(anime, settings.titleLanguage)}
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx158870-g875H3jE8wR8.jpg';
                  }}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />

                {}
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/80 backdrop-blur-md text-[10px] font-bold text-[var(--anilife-accent)] border border-[var(--anilife-accent)]/30">
                  {continueEntry ? 'Continue watching' : entry?.status}
                </div>

                {}
                {(entry?.score ?? 0) > 0 && (
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-bold text-amber-300">
                    ★ {entry?.score}
                  </div>
                )}

                {continueEntry && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeFromContinueWatching(anime.id);
                    }}
                    className="absolute right-2 top-2 z-10 rounded-full bg-black/80 p-2 text-zinc-300 transition hover:text-white"
                    aria-label={`Remove ${displayAnimeTitle(anime, settings.titleLanguage)} from Continue Watching`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}

                {}
                <button
                  type="button"
                  onClick={() => {
                    playAnimeEpisode(anime, episodeToPlay);
                  }}
                  className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={`Play ${displayAnimeTitle(anime, settings.titleLanguage)} episode ${episodeToPlay}`}
                >
                  <div className="w-10 h-10 rounded-full bg-[var(--anilife-accent)] text-black flex items-center justify-center shadow-lg">
                    <Play className="w-5 h-5 fill-black ml-0.5" />
                  </div>
                </button>
              </div>

              <div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedAnime(anime);
                  }}
                  className="block w-full text-left font-semibold text-xs sm:text-sm text-white line-clamp-1 group-hover:text-[var(--anilife-accent)] transition-colors"
                >
                  {displayAnimeTitle(anime, settings.titleLanguage)}
                </button>
                <p className="text-[11px] text-zinc-400 line-clamp-1">
                  {continueEntry
                    ? `Episode ${continueEntry.episodeNumber}${watchProgress !== null ? ` • ${watchProgress}% watched` : ''}`
                    : entry?.progress
                      ? `${entry.progress} episodes watched`
                      : anime.format} • {anime.year}
                </p>
              </div>
            </div>
          )})}
        </div>
      )}

      {}
      {showStatsModal && userStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn font-sans">
          <div className="w-full max-w-md bg-[#0e0c18] border border-[var(--anilife-accent)]/30 rounded-3xl p-6 shadow-2xl text-white space-y-4">
            <h3 className="text-lg font-bold">AniList Profile & Stats</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                <div className="text-xs text-zinc-400">Total Anime</div>
                <div className="text-2xl font-bold text-[var(--anilife-accent)]">
                  {userStats.count}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                <div className="text-xs text-zinc-400">Episodes Watched</div>
                <div className="text-2xl font-bold text-emerald-400">
                  {userStats.episodesWatched}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                <div className="text-xs text-zinc-400">Days Watched</div>
                <div className="text-2xl font-bold text-cyan-400">
                  {(userStats.minutesWatched / 1440).toFixed(1)}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                <div className="text-xs text-zinc-400">Mean Score</div>
                <div className="text-2xl font-bold text-amber-400">
                  {userStats.meanScore}%
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowStatsModal(false)}
              className="w-full py-2.5 rounded-full bg-[var(--anilife-accent)] hover:bg-[var(--anilife-accent-hover)] text-black font-bold text-sm transition-colors text-center cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

