import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Anime, Episode } from '../types/anime';
import { ANIME_CATALOG } from '../utils/animeData';
import {
  ArrowLeft,
  Play,
  Trash2,
  Folder,
  LayoutList,
  LayoutGrid,
  DownloadCloud,
  CheckSquare,
  Square
} from 'lucide-react';

interface SavedDownload {
  id: string;
  animeId: string;
  animeTitle: string;
  posterImage: string;
  episodeNumber: number;
  episodeTitle: string;
  thumbnail: string;
  sizeMb: number;
  downloadDate: string;
}

const STORAGE_DOWNLOADS_KEY = 'anilife_saved_downloads_v1';

function getSavedDownloads(): SavedDownload[] {
  try {
    const raw = localStorage.getItem(STORAGE_DOWNLOADS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistSavedDownloads(items: SavedDownload[]) {
  try {
    localStorage.setItem(STORAGE_DOWNLOADS_KEY, JSON.stringify(items));
  } catch {}
}

export const DownloadsView: React.FC = () => {
  const { playAnimeEpisode, setActiveTab, setSelectedAnime } = useApp();
  const [downloads, setDownloads] = useState<SavedDownload[]>(getSavedDownloads);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    persistSavedDownloads(downloads);
  }, [downloads]);

  
  const animeGroups = React.useMemo(() => {
    const map = new Map<string, { animeTitle: string; posterImage: string; items: SavedDownload[] }>();
    for (const d of downloads) {
      if (!map.has(d.animeId)) {
        map.set(d.animeId, {
          animeTitle: d.animeTitle,
          posterImage: d.posterImage,
          items: []
        });
      }
      map.get(d.animeId)!.items.push(d);
    }
    return Array.from(map.entries()).map(([animeId, data]) => ({
      animeId,
      ...data,
      totalSizeMb: data.items.reduce((acc, it) => acc + it.sizeMb, 0)
    }));
  }, [downloads]);

  const handleDeleteItem = (id: string) => {
    setDownloads((prev) => prev.filter((d) => d.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleRemoveAllForAnime = (animeId: string) => {
    setDownloads((prev) => prev.filter((d) => d.animeId !== animeId));
  };

  const handlePlay = (animeId: string, episodeNumber: number) => {
    const matched = ANIME_CATALOG.find((a) => a.id === animeId);
    if (matched) {
      playAnimeEpisode(matched, episodeNumber);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6 pb-20 animate-fadeIn">
      {}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveTab('home')}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#74cf66] hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Downloads</span>
        </button>
      </div>

      {downloads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
            <DownloadCloud className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-white">No episodes downloaded</h2>
            <p className="text-sm text-zinc-400 max-w-sm">
              Episodes you download while watching will appear here for offline playback.
            </p>
          </div>
          <button
            onClick={() => setActiveTab('search')}
            className="px-5 py-2.5 rounded-xl bg-[#74cf66] hover:bg-[#62b956] text-black text-xs font-bold transition-all shadow-[0_0_15px_rgba(116,207,102,0.3)] cursor-pointer"
          >
            Browse Anime
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {animeGroups.map((group) => {
            const sizeGb = (group.totalSizeMb / 1024).toFixed(1);
            return (
              <div key={group.animeId} className="space-y-4">
                {}
                <div className="relative rounded-2xl bg-[#16161a] border border-white/5 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 overflow-hidden">
                  <div className="flex items-center gap-4">
                    <img
                      src={group.posterImage}
                      alt={group.animeTitle}
                      className="w-16 h-22 sm:w-20 sm:h-28 rounded-xl object-cover ring-1 ring-white/10 shrink-0 shadow-lg"
                    />
                    <div className="space-y-1">
                      <h2 className="text-xl sm:text-2xl font-bold text-white">
                        {group.animeTitle}
                      </h2>
                      <div className="text-xs text-zinc-400">
                        {group.items.length} {group.items.length === 1 ? 'episode' : 'episodes'} saved · {sizeGb} GB
                      </div>
                      <div className="pt-2 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => handlePlay(group.animeId, group.items[0]?.episodeNumber || 1)}
                          className="px-4 py-1.5 rounded-full bg-[#f472b6] hover:bg-[#ec4899] text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Play Episode {group.items[0]?.episodeNumber || 1}</span>
                        </button>
                        <button
                          onClick={() => {
                            const matched = ANIME_CATALOG.find((a) => a.id === group.animeId);
                            if (matched) setSelectedAnime(matched);
                          }}
                          className="px-3 py-1.5 rounded-lg border border-white/15 hover:border-white/30 text-xs font-semibold text-zinc-300 hover:text-white transition-colors cursor-pointer"
                        >
                          Title page
                        </button>
                        <button
                          onClick={() => handleRemoveAllForAnime(group.animeId)}
                          className="px-3 py-1.5 text-xs font-semibold text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                        >
                          Remove all
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    <span>Episodes</span>
                  </div>
                  <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
                      title="List View"
                    >
                      <LayoutList className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
                      title="Grid View"
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {}
                <div className={viewMode === 'list' ? 'space-y-2' : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3'}>
                  {group.items.map((item) => {
                    const isSelected = selectedIds.has(item.id);
                    return (
                      <div
                        key={item.id}
                        className="group rounded-xl bg-[#141418] hover:bg-[#1a1a20] border border-white/5 p-3 flex items-center justify-between gap-3 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            onClick={() => toggleSelect(item.id)}
                            className="text-zinc-500 hover:text-white shrink-0 cursor-pointer"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-[#74cf66]" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                          <div className="relative w-24 sm:w-28 aspect-video rounded-lg overflow-hidden bg-black shrink-0">
                            <img
                              src={item.thumbnail || item.posterImage}
                              alt={item.episodeTitle}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-black/30 group-hover:bg-transparent transition-colors flex items-center justify-center">
                              <button
                                onClick={() => handlePlay(item.animeId, item.episodeNumber)}
                                className="w-7 h-7 rounded-full bg-white/90 text-black flex items-center justify-center hover:scale-110 transition-transform cursor-pointer"
                              >
                                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                              </button>
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-bold text-white truncate">
                              Episode {item.episodeNumber}
                            </div>
                            <div className="text-[11px] text-zinc-400 truncate">
                              {item.episodeTitle}
                            </div>
                            <div className="text-[10px] text-zinc-500">
                              {item.sizeMb} MB
                            </div>
                          </div>
                        </div>

                        {}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handlePlay(item.animeId, item.episodeNumber)}
                            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                            title="Play"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Delete Download"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

