import React, { useState, useMemo, useEffect, useRef } from 'react';
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

type SortKey = 'Popularity' | 'Score' | 'Title' | 'Newest';

const SORT_OPTIONS: SortKey[] = ['Popularity', 'Score', 'Title', 'Newest'];
const FORMATS = ['All', 'TV', 'Movie', 'OVA', 'ONA', 'Special'];
const YEARS = ['All', '2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018'];

function initialParam(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return new URLSearchParams(window.location.search).get(name) ?? fallback;
}

export const BrowseSearch: React.FC = () => {
  const {
    setSelectedAnime,
    recentSearches,
    addRecentSearch,
    removeRecentSearch,
    clearRecentSearches,
    liveCatalog
  } = useApp();

  const [query, setQuery] = useState(() => initialParam('q', ''));
  const [selectedCategory, setSelectedCategory] = useState<string>(() => initialParam('cat', 'All'));
  const [liveSearchResults, setLiveSearchResults] = useState<Anime[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [formatFilter, setFormatFilter] = useState(() => initialParam('format', 'All'));
  const [yearFilter, setYearFilter] = useState(() => initialParam('year', 'All'));
  const [minScore, setMinScore] = useState(() => Number(initialParam('score', '0')) || 0);
  const [sortBy, setSortBy] = useState<SortKey>(() => {
    const value = initialParam('sort', 'Popularity');
    return SORT_OPTIONS.includes(value as SortKey) ? (value as SortKey) : 'Popularity';
  });

  const requestRef = useRef(0);

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
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

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
        if (requestRef.current !== requestId) return;
        setLiveSearchResults(results.map(convertAniListToAnime));
      } catch {
        if (requestRef.current !== requestId) return;
        setLiveSearchResults([]);
      } finally {
        if (requestRef.current === requestId) setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timeout);
  }, [query, selectedCategory]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string, fallback: string) => {
      if (value && value !== fallback) params.set(key, value);
      else params.delete(key);
    };
    setOrDelete('q', query.trim(), '');
    setOrDelete('cat', selectedCategory, 'All');
    setOrDelete('format', formatFilter, 'All');
    setOrDelete('year', yearFilter, 'All');
    setOrDelete('score', minScore > 0 ? String(minScore) : '', '');
    setOrDelete('sort', sortBy, 'Popularity');
    const search = params.toString();
    const next = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', next);
  }, [query, selectedCategory, formatFilter, yearFilter, minScore, sortBy]);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (query.trim()) addRecentSearch(query.trim());
  };

  const handleChipClick = (term: string) => {
    setQuery(term);
    addRecentSearch(term);
  };

  const handleReset = () => {
    setQuery('');
    setSelectedCategory('All');
    setFormatFilter('All');
    setYearFilter('All');
    setMinScore(0);
    setSortBy('Popularity');
    setLiveSearchResults([]);
  };

  const activeFilterCount =
    (formatFilter !== 'All' ? 1 : 0) +
    (yearFilter !== 'All' ? 1 : 0) +
    (minScore > 0 ? 1 : 0) +
    (sortBy !== 'Popularity' ? 1 : 0);

  const filteredAnime = useMemo(() => {
    const base =
      query.trim().length >= 2 && liveSearchResults.length > 0
        ? liveSearchResults
        : liveCatalog.filter((anime) => {
            const lower = query.toLowerCase();
            const matchQuery =
              !query.trim() ||
              anime.title.toLowerCase().includes(lower) ||
              (anime.romajiTitle && anime.romajiTitle.toLowerCase().includes(lower)) ||
              anime.genres.some((genre) => genre.toLowerCase().includes(lower));

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

    const filtered = base.filter((anime) => {
      if (selectedCategory === 'Season' && anime.status !== 'Releasing') return false;
      if (selectedCategory === 'Movies' && anime.format !== 'Movie') return false;
      if (formatFilter !== 'All' && anime.format !== formatFilter) return false;
      if (yearFilter !== 'All' && String(anime.year) !== yearFilter) return false;
      if (minScore > 0 && anime.score < minScore) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'Score':
          return b.score - a.score;
        case 'Title':
          return a.title.localeCompare(b.title);
        case 'Newest':
          return b.year - a.year;
        case 'Popularity':
        default:
          return b.membersCount - a.membersCount;
      }
    });
  }, [
    query,
    selectedCategory,
    liveSearchResults,
    liveCatalog,
    formatFilter,
    yearFilter,
    minScore,
    sortBy
  ]);

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
          onClick={() => setShowFilters((value) => !value)}
          className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all cursor-pointer shrink-0 ${
            showFilters || activeFilterCount > 0
              ? 'bg-[#74cf66] text-black shadow-[rgba(116,207,102,0.3)]'
              : 'bg-white/10 text-zinc-200 hover:bg-white/20'
          }`}
          title="Filter and Sort"
          aria-expanded={showFilters}
        >
          <SlidersHorizontal className="w-5 h-5" />
          {activeFilterCount > 0 && (
            <span className="absolute -mt-6 -mr-6 flex h-4 min-w-4 items-center justify-center rounded-full bg-black px-1 text-[9px] font-bold text-[#74cf66]">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:grid-cols-4">
          <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Format
            <select
              value={formatFilter}
              onChange={(e) => setFormatFilter(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs font-medium normal-case tracking-normal text-white focus:border-[#74cf66] focus:outline-none"
            >
              {FORMATS.map((format) => (
                <option key={format} value={format}>{format}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Year
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs font-medium normal-case tracking-normal text-white focus:border-[#74cf66] focus:outline-none"
            >
              {YEARS.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Min score
            <select
              value={String(minScore)}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs font-medium normal-case tracking-normal text-white focus:border-[#74cf66] focus:outline-none"
            >
              {[0, 60, 70, 75, 80, 85, 90].map((score) => (
                <option key={score} value={score}>{score === 0 ? 'Any' : `${score}%+`}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Sort by
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs font-medium normal-case tracking-normal text-white focus:border-[#74cf66] focus:outline-none"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>
      )}

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
