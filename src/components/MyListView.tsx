import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { WatchStatus } from '../types/anime';
import {
  RotateCcw,
  BarChart3,
  Plus,
  Check,
  Search,
  Play,
  Bookmark,
  ExternalLink,
  UserCheck,
  AlertCircle,
  LogIn,
  Sparkles
} from 'lucide-react';

export const MyListView: React.FC = () => {
  const {
    watchlist,
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

  const [activeTab, setActiveTab] = useState<'Watching' | 'Completed' | 'Planning' | 'Paused' | 'Dropped' | 'All'>('Watching');
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('Any format');
  const [showStatsModal, setShowStatsModal] = useState(false);

  
  const resolvedList = watchlist
    .map(entry => {
      const anime = liveCatalog.find(a => a.id === entry.animeId);
      return anime ? { entry, anime } : null;
    })
    .filter(Boolean) as { entry: any; anime: any }[];

  const filteredEntries = resolvedList.filter(({ anime, entry }) => {
    const matchText = !filterQuery.trim() || anime.title.toLowerCase().includes(filterQuery.toLowerCase());
    const matchFormat = selectedFormat === 'Any format' || anime.format === selectedFormat;
    let matchTab = true;
    if (activeTab === 'Watching') matchTab = entry.status === 'Watching';
    else if (activeTab === 'Completed') matchTab = entry.status === 'Completed';
    else if (activeTab === 'Planning') matchTab = entry.status === 'Plan to watch';
    else if (activeTab === 'Paused') matchTab = entry.status === 'Paused';
    else if (activeTab === 'Dropped') matchTab = entry.status === 'Dropped';
    return matchText && matchFormat && matchTab;
  });

  const userStats = currentUser?.statistics?.anime;

  return (
    <div className="space-y-6 pb-20 animate-fadeIn">
      {}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-black/50 border border-[#74cf66]/20 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[#74cf66] p-0.5 shrink-0 bg-black/60">
            <img
              src={currentUser?.avatar?.large || activeProfile.avatar}
              alt={currentUser?.name || activeProfile.name}
              className="w-full h-full object-cover rounded-full"
            />
          </div>
          <div>
            <span className="text-[11px] font-bold tracking-widest text-[#74cf66] uppercase">
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
              <BarChart3 className="w-3.5 h-3.5 text-[#74cf66]" />
              <span>Stats</span>
            </button>
          )}

          <button
            onClick={() => setShowAuthModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/15 text-xs text-[#74cf66] font-medium transition-colors cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{currentUser ? 'AniList Account' : 'Sign In'}</span>
          </button>

          <button
            onClick={syncAniList}
            disabled={isSyncingAniList}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#74cf66] hover:bg-[#62b956] text-xs text-black font-bold transition-colors cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isSyncingAniList ? 'animate-spin' : ''}`} />
            <span>{isSyncingAniList ? 'Syncing...' : 'Sync'}</span>
          </button>
        </div>
      </div>

      {}
      {!currentUser && (
        <div className="p-5 rounded-3xl bg-black/60 border border-[#74cf66]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-bold text-base text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#74cf66]" />
              <span>Connect your AniList Account</span>
            </h3>
            <p className="text-xs text-zinc-300 max-w-xl">
              Sign in with your AniList account to enable real-time bidirectional syncing of your watching lists, episode progress, and ratings.
            </p>
          </div>
          <button
            onClick={() => setShowAuthModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#74cf66] hover:bg-[#62b956] text-black font-bold text-xs shadow-lg shadow-[rgba(116,207,102,0.3)] transition-all cursor-pointer whitespace-nowrap"
          >
            <LogIn className="w-4 h-4" />
            <span>Sign In to AniList</span>
          </button>
        </div>
      )}

      {}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3 overflow-x-auto no-scrollbar">
        {(['Watching', 'Completed', 'Planning', 'Paused', 'Dropped', 'All'] as const).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#74cf66] text-black shadow-md shadow-[rgba(116,207,102,0.3)]'
                  : 'bg-white/5 hover:bg-white/10 text-zinc-300'
              }`}
            >
              <span>{tab}</span>
            </button>
          );
        })}

        <button
          onClick={() => alert('Custom anime list creation.')}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/5 hover:bg-white/10 text-xs text-[#74cf66] font-medium transition-colors cursor-pointer whitespace-nowrap ml-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New list</span>
        </button>
      </div>

      {}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectedFormat}
          onChange={(e) => setSelectedFormat(e.target.value)}
          className="px-3.5 py-2 rounded-full bg-white/5 border border-white/10 text-xs text-zinc-300 focus:outline-none focus:border-[#74cf66] cursor-pointer"
        >
          <option value="Any format" className="bg-[#14121e]">Any format</option>
          <option value="TV" className="bg-[#14121e]">TV</option>
          <option value="Movie" className="bg-[#14121e]">Movie</option>
          <option value="ONA" className="bg-[#14121e]">ONA</option>
        </select>

        <div className="relative flex-1 min-w-[180px]">
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter by title..."
            className="w-full pl-8 pr-3 py-2 rounded-full bg-white/5 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#74cf66]"
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
            {currentUser
              ? `You don't have any anime marked as ${activeTab} on your AniList profile.`
              : 'Sign in with your AniList account or add shows from Browse to populate this list.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {filteredEntries.map(({ anime, entry }) => (
            <div
              key={anime.id}
              onClick={() => setSelectedAnime(anime)}
              className="group cursor-pointer space-y-2 relative"
            >
              <div className="relative aspect-[3/4] w-full rounded-2xl overflow-hidden border border-white/10 group-hover:border-[#74cf66]/50 transition-all duration-300 group-hover:shadow-lg group-hover:shadow-[rgba(116,207,102,0.2)] bg-zinc-900">
                <img
                  src={anime.posterImage}
                  alt={anime.title}
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx158870-g875H3jE8wR8.jpg';
                  }}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />

                {}
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/80 backdrop-blur-md text-[10px] font-bold text-[#74cf66] border border-[#74cf66]/30">
                  {entry.status}
                </div>

                {}
                {entry.score > 0 && (
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-bold text-amber-300">
                    ★ {entry.score}
                  </div>
                )}

                {}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    playAnimeEpisode(anime, entry.progress || 1);
                  }}
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  <div className="w-10 h-10 rounded-full bg-[#74cf66] text-black flex items-center justify-center shadow-lg">
                    <Play className="w-5 h-5 fill-black ml-0.5" />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-xs sm:text-sm text-white line-clamp-1 group-hover:text-[#74cf66] transition-colors">
                  {anime.title}
                </h3>
                <p className="text-[11px] text-zinc-400 line-clamp-1">
                  {entry.progress ? `Ep ${entry.progress} watched` : anime.format} • {anime.year}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {}
      {showStatsModal && userStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn font-sans">
          <div className="w-full max-w-md bg-[#0e0c18] border border-[#74cf66]/30 rounded-3xl p-6 shadow-2xl text-white space-y-4">
            <h3 className="text-lg font-bold">AniList Profile & Stats</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                <div className="text-xs text-zinc-400">Total Anime</div>
                <div className="text-2xl font-bold text-[#74cf66]">
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
              className="w-full py-2.5 rounded-full bg-[#74cf66] hover:bg-[#62b956] text-black font-bold text-sm transition-colors text-center cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
