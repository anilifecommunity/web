import React, { useState, useEffect } from 'react';
import { Anime, Episode, WatchStatus } from '../types/anime';
import { useApp } from '../context/AppContext';
import { getAnimeAniListId } from '../utils/animeData';
import { fetchMediaIndexEpisodes } from '../utils/mediaIndexApi';
import {
  ArrowLeft,
  Search,
  Eye,
  EyeOff,
  Play,
  Share2,
  ChevronDown,
  ArrowUpDown,
  LayoutGrid,
  List,
  Lock,
  Clock,
  Check
} from 'lucide-react';

interface Props {
  anime: Anime;
  onClose: () => void;
}

export const AnimeDetailModal: React.FC<Props> = ({ anime, onClose }) => {
  const {
    playAnimeEpisode,
    watchlist,
    setAnimeWatchStatus,
    continueWatching
  } = useApp();

  const [activeTab, setActiveTab] = useState<'Home' | 'Episodes' | 'Related'>('Home');
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState(0);
  const [episodeSearch, setEpisodeSearch] = useState('');
  const [sortOldest, setSortOldest] = useState(true);
  const [isGridView, setIsGridView] = useState(false);
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [watchedEpisodes, setWatchedEpisodes] = useState<Record<number, boolean>>({});
  const [realEpisodes, setRealEpisodes] = useState<Episode[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  
  const isEpisodeUnreleased = (ep: Episode): boolean => {
    if ('isUnreleased' in ep && ep.isUnreleased) return true;
    if (ep.airedDate) {
      const airDate = new Date(ep.airedDate);
      if (!isNaN(airDate.getTime()) && airDate.getTime() > Date.now()) {
        return true;
      }
    }
    return false;
  };

  
  useEffect(() => {
    const numId = getAnimeAniListId(anime);
    if (numId) {
      fetchMediaIndexEpisodes(numId).then((eps) => {
        if (eps && eps.length > 0) {
          const mapped: Episode[] = eps.map((e: any) => {
            const airedDate = e.airDate || e.air_date;
            const isUnreleased = !!(airedDate && new Date(airedDate).getTime() > Date.now());
            return {
              id: `${anime.id}-ep-${e.number}`,
              number: e.number,
              title: e.title || `Episode ${e.number}`,
              durationSec: e.length ? e.length * 60 : (e.runtime ? e.runtime * 60 : 0),
              thumbnail: isUnreleased ? '' : (e.image || e.still || anime.bannerImage || anime.posterImage),
              videoUrl: '',
              synopsis: e.description || e.overview,
              airedDate,
              isUnreleased
            };
          });
          setRealEpisodes(mapped);
        }
      });
    }
  }, [anime]);

  const currentWatchlistEntry = watchlist.find(w => w.animeId === anime.id);
  const watchStatus: WatchStatus = currentWatchlistEntry?.status || 'Watching';

  const continueEntry = continueWatching.find(c => c.animeId === anime.id);
  const currentEpNum = continueEntry?.episodeNumber || 1;
  const progressPercent = continueEntry
    ? Math.round((continueEntry.currentTimeSec / (continueEntry.durationSec || 1440)) * 100)
    : 15;

  const activeSeason = anime.seasons[selectedSeasonIdx] || anime.seasons[0];
  const allEpisodes = realEpisodes.length > 0 ? realEpisodes : (activeSeason?.episodes || []);

  const filteredEpisodes = allEpisodes
    .filter(ep => !episodeSearch.trim() || ep.title.toLowerCase().includes(episodeSearch.toLowerCase()) || `ep ${ep.number}`.includes(episodeSearch.toLowerCase()))
    .sort((a, b) => sortOldest ? a.number - b.number : b.number - a.number);

  const toggleEpisodeWatched = (epNumber: number) => {
    setWatchedEpisodes(prev => ({
      ...prev,
      [epNumber]: !prev[epNumber]
    }));
  };

  const statusList: WatchStatus[] = ['Watching', 'Plan to watch', 'Completed', 'Paused', 'Rewatching', 'Dropped'];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black text-white animate-fadeIn font-sans">
      {}
      {toastMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full bg-black/90 border border-[#74cf66]/50 shadow-2xl text-xs sm:text-sm font-bold text-white flex items-center gap-2 animate-bounce">
          <Clock className="w-4 h-4 text-[#74cf66]" />
          <span>{toastMsg}</span>
        </div>
      )}

      {}
      <div className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-8 py-3.5 bg-black/80 backdrop-blur-xl border-b border-white/10">
        <button
          onClick={onClose}
          className="p-2 -ml-2 rounded-full hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
          title="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <h2 className="text-sm sm:text-base font-bold text-white truncate max-w-xs sm:max-w-md">
          {anime.title}
        </h2>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => showToast(`Share link copied for ${anime.title}!`)}
            className="p-2 rounded-full hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Share"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {}
        <div className="relative rounded-3xl overflow-hidden aspect-[16/9] sm:aspect-[21/9] border border-[#74cf66]/30 shadow-2xl">
          <img
            src={anime.bannerImage || anime.posterImage}
            alt={anime.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />

          {}
          <div className="absolute bottom-4 left-4 flex items-end gap-4">
            <div className="relative w-20 sm:w-28 aspect-[3/4] rounded-2xl overflow-hidden border-2 border-white/20 shadow-xl shrink-0 group">
              <img
                src={anime.posterImage}
                alt={anime.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Search className="w-5 h-5 text-white" />
              </div>
            </div>

            <div className="space-y-1 mb-1">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#74cf66]/20 border border-[#74cf66]/40 text-[#74cf66]">
                {anime.studio}
              </span>
              <h1 className="text-xl sm:text-3xl font-black text-white">{anime.title}</h1>
              <p className="text-xs sm:text-sm text-zinc-300">
                {anime.score}% score • {(anime.membersCount / 1000).toFixed(1)}K members • {allEpisodes.length} episodes
              </p>
            </div>
          </div>
        </div>

        {}
        <div className="flex flex-wrap items-center gap-2.5">
          {}
          <div className="relative">
            <button
              onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#74cf66]/20 hover:bg-[#74cf66]/30 border border-[#74cf66]/40 text-xs sm:text-sm font-semibold text-[#74cf66] transition-all cursor-pointer shadow-md"
            >
              <span>{watchStatus}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#74cf66]" />
            </button>

            {isStatusDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 w-48 rounded-2xl bg-[#0e0c18] border border-[#74cf66]/40 p-1.5 shadow-2xl z-30 space-y-1">
                {statusList.map((st) => (
                  <button
                    key={st}
                    onClick={() => {
                      setAnimeWatchStatus(anime.id, st);
                      setIsStatusDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors cursor-pointer ${
                      watchStatus === st ? 'bg-[#74cf66] text-black font-bold' : 'hover:bg-white/10 text-zinc-300'
                    }`}
                  >
                    <span>{st}</span>
                    {watchStatus === st && <Check className="w-3.5 h-3.5 text-black" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {}
          <button
            onClick={() => toggleEpisodeWatched(currentEpNum)}
            className="p-2.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Toggle watched"
          >
            {watchedEpisodes[currentEpNum] ? (
              <Eye className="w-4 h-4 text-[#74cf66]" />
            ) : (
              <EyeOff className="w-4 h-4" />
            )}
          </button>

          {}
          <button
            onClick={() => {
              onClose();
              playAnimeEpisode(anime, currentEpNum);
            }}
            className="flex-1 min-w-[160px] flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#74cf66] hover:bg-[#62b956] text-black font-bold text-xs sm:text-sm transition-all shadow-lg shadow-[rgba(116,207,102,0.3)] cursor-pointer"
          >
            <Play className="w-4 h-4 fill-black" />
            <span>Continue {currentEpNum}</span>
          </button>
        </div>

        {}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>Episode {currentEpNum} of {allEpisodes.length}</span>
            <span className="text-[#74cf66]">{progressPercent}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-[#74cf66] rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {}
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          {(['Home', 'Episodes', 'Related'] as const).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#74cf66] text-black shadow-md shadow-[rgba(116,207,102,0.3)]'
                    : 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {}
        {activeTab === 'Home' && (
          <div className="space-y-6 animate-fadeIn">
            {}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-center">
                <div className="font-bold text-sm sm:text-base text-white">{anime.status}</div>
                <div className="text-[11px] text-zinc-400 uppercase tracking-wider mt-0.5">Status</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-center">
                <div className="font-bold text-sm sm:text-base text-white">{anime.format}</div>
                <div className="text-[11px] text-zinc-400 uppercase tracking-wider mt-0.5">Format</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-center">
                <div className="font-bold text-sm sm:text-base text-white">{anime.year}</div>
                <div className="text-[11px] text-zinc-400 uppercase tracking-wider mt-0.5">Year</div>
              </div>
            </div>

            {}
            <div className="flex flex-wrap gap-2">
              {anime.genres.map((g) => (
                <span
                  key={g}
                  className="px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-[#74cf66]/20 text-xs font-medium text-zinc-300"
                >
                  {g}
                </span>
              ))}
            </div>

            {}
            <div className="space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-300">Overview</h3>
              <p className={`text-sm text-zinc-300 leading-relaxed ${isOverviewExpanded ? '' : 'line-clamp-3'}`}>
                {anime.synopsis}
              </p>
              <button
                onClick={() => setIsOverviewExpanded(!isOverviewExpanded)}
                className="text-xs font-semibold text-[#74cf66] hover:underline cursor-pointer"
              >
                {isOverviewExpanded ? 'Show less' : 'More'}
              </button>
            </div>

            {}
            <div className="divide-y divide-white/10 text-xs sm:text-sm">
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-zinc-400">Start date</span>
                <span className="font-medium text-white">{anime.startDate}</span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-zinc-400">Season</span>
                <span className="font-medium text-white">{anime.seasonName} {anime.year}</span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-zinc-400">Members</span>
                <span className="font-medium text-white">{anime.membersCount.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {}
        {activeTab === 'Episodes' && (
          <div className="space-y-5 animate-fadeIn">
            {}
            <div className="flex gap-2">
              {anime.seasons.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSeasonIdx(idx)}
                  className={`px-4 py-2 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
                    selectedSeasonIdx === idx
                      ? 'bg-[#74cf66] text-black shadow-md shadow-[rgba(116,207,102,0.3)]'
                      : 'bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/5'
                  }`}
                >
                  <div>{s.title}</div>
                  <div className="text-[10px] text-zinc-400">{s.year}</div>
                </button>
              ))}
            </div>

            {}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <input
                  type="text"
                  value={episodeSearch}
                  onChange={(e) => setEpisodeSearch(e.target.value)}
                  placeholder="Filter episodes..."
                  className="w-full pl-9 pr-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#74cf66]"
                />
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>

              <button
                onClick={() => setSortOldest(!sortOldest)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-zinc-300 font-medium transition-colors cursor-pointer"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-[#74cf66]" />
                <span>{sortOldest ? 'Oldest' : 'Newest'}</span>
              </button>

              <button
                onClick={() => setIsGridView(!isGridView)}
                className="p-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                title="Toggle Grid / List"
              >
                {isGridView ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
              </button>
            </div>

            {}
            <div className="space-y-3">
              <div className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">
                {allEpisodes.length} episodes
              </div>

              <div className={isGridView ? 'grid grid-cols-2 sm:grid-cols-3 gap-3' : 'space-y-2'}>
                {filteredEpisodes.map((ep) => {
                  const isEpWatched = !!watchedEpisodes[ep.number];
                  const unreleased = isEpisodeUnreleased(ep);

                  
                  const durationDisplay = ep.durationSec && ep.durationSec > 0
                    ? `${Math.round(ep.durationSec / 60)}m`
                    : (ep.airedDate ? ep.airedDate : '');

                  return (
                    <div
                      key={ep.id}
                      onClick={() => {
                        if (unreleased) {
                          showToast(`Episode ${ep.number} has not aired yet!`);
                          return;
                        }
                        onClose();
                        playAnimeEpisode(anime, ep.number);
                      }}
                      className={`group flex ${
                        isGridView ? 'flex-col' : 'items-center'
                      } justify-between gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                        unreleased
                          ? 'bg-white/[0.02] border-white/5 opacity-60 hover:opacity-75'
                          : 'bg-white/5 border-white/10 hover:border-[#74cf66]/40 hover:bg-white/10'
                      }`}
                    >
                      <div className={`flex ${isGridView ? 'flex-col' : 'items-center'} gap-3 flex-1 min-w-0`}>
                        {}
                        <div className="relative aspect-video w-full sm:w-36 rounded-xl overflow-hidden shrink-0 bg-zinc-900 flex items-center justify-center">
                          {unreleased ? (
                            <div className="flex flex-col items-center justify-center text-zinc-500 p-2 text-center space-y-1">
                              <Lock className="w-5 h-5 text-zinc-500" />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Unreleased</span>
                            </div>
                          ) : (
                            <img
                              src={ep.thumbnail || anime.posterImage}
                              alt={ep.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = anime.posterImage;
                              }}
                            />
                          )}

                          <span className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            unreleased ? 'bg-zinc-800/90 text-zinc-400' : 'bg-black/80 text-white'
                          }`}>
                            EP {ep.number}
                          </span>

                          {}
                          {isEpWatched && !unreleased && (
                            <div className="absolute bottom-0 inset-x-0 h-1 bg-[#74cf66]" />
                          )}
                        </div>

                        {}
                        <div className="min-w-0 flex-1">
                          <h4 className={`font-semibold text-sm truncate ${
                            unreleased ? 'text-zinc-400' : 'text-white group-hover:text-[#74cf66] transition-colors'
                          }`}>
                            {ep.title}
                          </h4>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            {unreleased ? (
                              <span className="text-[#74cf66]/80 font-medium flex items-center gap-1">
                                <Clock className="w-3 h-3 inline" /> Airing {ep.airedDate || 'Soon'}
                              </span>
                            ) : (
                              <>Episode {ep.number} {durationDisplay ? `• ${durationDisplay}` : ''}</>
                            )}
                          </p>
                        </div>
                      </div>

                      {}
                      {!unreleased && (
                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleEpisodeWatched(ep.number);
                            }}
                            className={`p-2 rounded-full hover:bg-white/10 transition-colors ${
                              isEpWatched ? 'text-[#74cf66]' : 'text-zinc-500 hover:text-white'
                            }`}
                            title={isEpWatched ? 'Mark as unwatched' : 'Mark as watched'}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {}
        {activeTab === 'Related' && (
          <div className="space-y-6 animate-fadeIn">
            {}
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-300">Seasons</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#74cf66]/10 border border-[#74cf66]/40">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#74cf66] text-black font-bold flex items-center justify-center text-xs">
                      1
                    </div>
                    <img
                      src={anime.posterImage}
                      alt={anime.title}
                      className="w-10 h-14 object-cover rounded-lg"
                    />
                    <div>
                      <h4 className="font-semibold text-sm text-white">{anime.title}</h4>
                      <p className="text-xs text-zinc-400">Season 1 • {anime.year} • {allEpisodes.length} eps</p>
                      <span className="text-[11px] text-[#74cf66] font-semibold">Current Season</span>
                    </div>
                  </div>
                  <Play className="w-4 h-4 fill-[#74cf66] text-[#74cf66]" />
                </div>

                {anime.related
                  .filter(r => r.relation.includes('Season'))
                  .map((rel, idx) => (
                    <div
                      key={rel.id}
                      onClick={() => showToast(`Opening ${rel.title}`)}
                      className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/10 hover:border-[#74cf66]/30 transition-all hover:bg-white/10 cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-white/10 text-zinc-400 font-bold flex items-center justify-center text-xs">
                          {idx + 2}
                        </div>
                        <img
                          src={rel.poster}
                          alt={rel.title}
                          className="w-10 h-14 object-cover rounded-lg"
                        />
                        <div>
                          <h4 className="font-semibold text-sm text-white">{rel.title}</h4>
                          <p className="text-xs text-zinc-400">{rel.relation}</p>
                        </div>
                      </div>
                      <Play className="w-4 h-4 text-zinc-400" />
                    </div>
                  ))}
              </div>
            </div>

            {}
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-300">More Like This</h3>
              <div className="space-y-2">
                {anime.related
                  .filter(r => r.relation === 'More like this')
                  .map((rel) => (
                    <div
                      key={rel.id}
                      onClick={() => showToast(`Opening ${rel.title}`)}
                      className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/10 hover:border-[#74cf66]/30 transition-all hover:bg-white/10 cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={rel.poster}
                          alt={rel.title}
                          className="w-10 h-14 object-cover rounded-lg"
                        />
                        <div>
                          <h4 className="font-semibold text-sm text-white">{rel.title}</h4>
                          <p className="text-xs text-zinc-400">{rel.format} • {rel.year}</p>
                        </div>
                      </div>
                      <Play className="w-4 h-4 text-zinc-400" />
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

