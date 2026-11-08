import React, { useState, useMemo, useEffect } from 'react';
import { useApp, convertAniListToAnime } from '../context/AppContext';
import { Anime } from '../types/anime';
import { searchAniList } from '../utils/anilistApi';
import {
  Search,
  SlidersHorizontal,
  History,
  X,
  Star,
  Film,
  Loader2
} from 'lucide-react';

export const BrowseSearch: React.FC = () => {
  const {
    setSelectedAnime,
    recentSearches,
    addRecentSearch,
    removeRecentSearch,
    clearRecentSearches,
    liveCatalog
  } = useApp();

  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [liveSearchResults, setLiveSearchResults] = useState<Anime[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const categories = [
    'All',
    'Season',
    'Movies',
    'Action',
    'Adventure',
    'Comedy',
    'Drama',
    'Fantasy',
    'Romance',
    'Sci-Fi',
    'Supernatural'
  ];

  
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setLiveSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const results = await searchAniList(
          trimmed,
          selectedCategory !== 'All' && selectedCategory !== 'Season' && selectedCategory !== 'Movies'
            ? selectedCategory
            : undefined
        );
        const mapped = results.map(convertAniListToAnime);
        setLiveSearchResults(mapped);
      } catch (err) {
        console.error('AniList search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timeout);
  }, [query, selectedCategory]);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (query.trim()) {
      addRecentSearch(query.trim());
    }
  };

  const handleChipClick = (term: string) => {
    setQuery(term);
    addRecentSearch(term);
  };

  const handleReset = () => {
    setQuery('');
    setSelectedCategory('All');
    setLiveSearchResults([]);
  };

  
  const filteredAnime = useMemo(() => {
    if (query.trim().length >= 2 && liveSearchResults.length > 0) {
      
      return liveSearchResults;
    }

    return liveCatalog.filter((anime) => {
      const matchQuery =
        !query.trim() ||
        anime.title.toLowerCase().includes(query.toLowerCase()) ||
        (anime.romajiTitle && anime.romajiTitle.toLowerCase().includes(query.toLowerCase())) ||
        anime.genres.some(g => g.toLowerCase().includes(query.toLowerCase()));

      let matchCategory = true;
      if (selectedCategory === 'Season') {
        matchCategory = anime.status === 'Releasing';
      } else if (selectedCategory === 'Movies') {
        matchCategory = anime.format === 'Movie';
      } else if (selectedCategory !== 'All') {
        matchCategory = anime.genres.includes(selectedCategory);
      }

      return matchQuery && matchCategory;
    });
  }, [query, selectedCategory, liveSearchResults, liveCatalog]);

  return (
    <div className="space-y-6 pb-20 animate-fadeIn">
      {}
      <div>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Browse</h1>
        <p className="text-sm text-zinc-400 mt-1">Search millions of anime powered by AniList</p>
      </div>

      {}
      <div className="flex items-center gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anime by title, character, or genre..."
            className="w-full pl-11 pr-10 py-3.5 rounded-2xl bg-black/60 border border-[#74cf66]/30 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-[#74cf66] focus:ring-1 focus:ring-[#74cf66] shadow-inner transition-all"
          />
          <Search className="w-5 h-5 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          {isSearching ? (
            <Loader2 className="w-4 h-4 text-[#74cf66] animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
          ) : query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </form>

        <button
          onClick={handleReset}
          className="text-sm font-semibold text-[#74cf66] hover:text-[#62b956] px-2 py-2 cursor-pointer transition-colors"
        >
          Reset
        </button>

        <button
          onClick={() => alert('Filter options: sort by score, format, popularity, year.')}
          className="w-12 h-12 rounded-full bg-[#74cf66] hover:bg-[#62b956] text-black flex items-center justify-center shadow-lg shadow-[rgba(116,207,102,0.3)] transition-all cursor-pointer shrink-0"
          title="Filter and Sort"
        >
          <SlidersHorizontal className="w-5 h-5" />
        </button>
      </div>

      {}
      {recentSearches.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold uppercase tracking-wider">
            <span>Recent searches</span>
            <button
              onClick={clearRecentSearches}
              className="text-[11px] hover:text-[#74cf66] transition-colors cursor-pointer"
            >
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((term) => (
              <div
                key={term}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-[#74cf66]/20 text-xs text-zinc-300 group cursor-pointer transition-all"
                onClick={() => handleChipClick(term)}
              >
                <History className="w-3.5 h-3.5 text-[#74cf66]" />
                <span>{term}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRecentSearch(term);
                  }}
                  className="text-zinc-500 hover:text-white p-0.5 ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {}
      <div className="space-y-2">
        <div className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">
          Categories
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#74cf66] text-black shadow-md shadow-[rgba(116,207,102,0.3)] ring-1 ring-[#74cf66]/50'
                    : 'bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/5'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {}
      <div className="pt-2">
        <div className="flex items-center justify-between text-xs text-zinc-400 mb-3">
          <span>
            {isSearching ? 'Searching AniList...' : `Showing ${filteredAnime.length} results`}
          </span>
          {query.trim().length >= 2 && (
            <span className="text-[#74cf66] text-[11px] font-semibold">
              Live AniList Data
            </span>
          )}
        </div>

        {filteredAnime.length === 0 && !isSearching ? (
          <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10 space-y-3">
            <Film className="w-10 h-10 text-zinc-500 mx-auto" />
            <h3 className="text-lg font-bold text-white">No anime found</h3>
            <p className="text-sm text-zinc-400">Try searching for different keywords or reset filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {filteredAnime.map((anime) => (
              <div
                key={anime.id}
                onClick={() => setSelectedAnime(anime)}
                className="group cursor-pointer space-y-2"
              >
                <div className="relative aspect-[3/4] w-full rounded-xl sm:rounded-2xl overflow-hidden border border-white/10 group-hover:border-[#74cf66]/50 transition-all duration-300 group-hover:shadow-lg group-hover:shadow-[rgba(116,207,102,0.2)] bg-zinc-900">
                  <img
                    src={anime.posterImage}
                    alt={anime.title}
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx158870-g875H3jE8wR8.jpg';
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-full bg-black/75 backdrop-blur-md text-[10px] font-bold text-[#74cf66] flex items-center gap-1">
                    <Star className="w-2.5 h-2.5 fill-[#74cf66] text-[#74cf66]" />
                    <span>{anime.score}%</span>
                  </div>
                  {anime.hasDub && (
                    <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-bold text-amber-300">
                      DUB
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-xs sm:text-sm text-white line-clamp-1 group-hover:text-[#74cf66] transition-colors">
                    {anime.title}
                  </h3>
                  <p className="text-[11px] text-zinc-400 line-clamp-1">
                    {anime.format} • {anime.year} • {anime.genres.slice(0, 2).join(', ')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
