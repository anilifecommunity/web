import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Anime } from '../types/anime';
import { Dices, Play, RefreshCw, X, Star, Info } from 'lucide-react';
import { displayAnimeTitle } from '../utils/animePreferences';

const RANDOM_CATEGORIES = [
  'Anything',
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Supernatural',
  'Mystery',
  'Sports',
  'Dubbed',
  'Top Rated'
] as const;

type RandomCategory = (typeof RANDOM_CATEGORIES)[number];

export const RandomPickModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { playAnimeEpisode, setSelectedAnime, liveCatalog, settings } = useApp();

  const [selectedFilter, setSelectedFilter] = useState<RandomCategory>('Anything');
  const [isRolling, setIsRolling] = useState(false);

  const availableAnime = useMemo(() => {
    const catalog = liveCatalog && liveCatalog.length > 0 ? liveCatalog : [];
    if (selectedFilter === 'Anything') return catalog;
    if (selectedFilter === 'Dubbed') return catalog.filter((a) => a.hasDub);
    if (selectedFilter === 'Top Rated') return catalog.filter((a) => (a.score || 0) >= 80);
    return catalog.filter((a) =>
      a.genres && a.genres.some((g) => g.toLowerCase() === selectedFilter.toLowerCase())
    );
  }, [liveCatalog, selectedFilter]);

  const [pickedAnime, setPickedAnime] = useState<Anime>(() => {
    return availableAnime[Math.floor(Math.random() * availableAnime.length)];
  });

  const rollDice = () => {
    setIsRolling(true);
    const candidates = availableAnime;

    if (candidates.length === 0) {
      setIsRolling(false);
      return;
    }

    setTimeout(() => {
      let nextPick = candidates[Math.floor(Math.random() * candidates.length)];
      if (candidates.length > 1 && nextPick.id === pickedAnime?.id) {
        nextPick = candidates.find((c) => c.id !== pickedAnime?.id) || nextPick;
      }
      setPickedAnime(nextPick);
      setIsRolling(false);
    }, 350);
  };

  const handleCategoryChange = (category: RandomCategory) => {
    setSelectedFilter(category);
    let filtered = liveCatalog;
    if (category === 'Dubbed') {
      filtered = liveCatalog.filter((a) => a.hasDub);
    } else if (category === 'Top Rated') {
      filtered = liveCatalog.filter((a) => (a.score || 0) >= 80);
    } else if (category !== 'Anything') {
      filtered = liveCatalog.filter((a) =>
        a.genres && a.genres.some((g) => g.toLowerCase() === category.toLowerCase())
      );
    }
    setPickedAnime(filtered[Math.floor(Math.random() * filtered.length)]);
  };

  const displayTitle = pickedAnime && displayAnimeTitle(pickedAnime, settings.titleLanguage);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#121216] border border-zinc-800 rounded-3xl p-6 shadow-2xl text-white space-y-5 animate-slideUp overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-[var(--anilife-accent)]/20 text-[var(--anilife-accent)]">
              <Dices className={`w-5 h-5 ${isRolling ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Random Anime</h2>
              <p className="text-xs text-zinc-400">Can't decide? Let fate pick your next show</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Pills */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
          {RANDOM_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedFilter === cat
                  ? 'bg-[var(--anilife-accent)] text-black shadow-[0_0_10px_var(--anilife-accent-shadow)]'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Anime Showcase Card */}
        <div className="relative rounded-2xl overflow-hidden aspect-video bg-zinc-900 border border-zinc-800 shadow-xl group">
          {pickedAnime && (pickedAnime.bannerImage || pickedAnime.posterImage) ? <img
            src={pickedAnime.bannerImage || pickedAnime.posterImage}
            alt={displayTitle}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          /> : <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-400">{pickedAnime ? 'Artwork is unavailable for this title.' : 'No titles match this filter.'}</div>}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />

          {/* Top badges */}
          <div className="absolute top-3 inset-x-3 flex items-center justify-between">
            <span className="px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md text-[11px] font-bold text-white flex items-center gap-1">
              <Star className="w-3 h-3 fill-[var(--anilife-accent)] text-[var(--anilife-accent)]" />
              {pickedAnime?.score > 0 && <span>{pickedAnime.score}%</span>}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-[var(--anilife-accent)] text-black text-[10px] font-bold">
              {pickedAnime?.format || 'Unknown'}
            </span>
          </div>

          {/* Bottom details */}
          <div className="absolute bottom-0 inset-x-0 p-4 space-y-1.5">
            {pickedAnime && <h3 className="text-xl font-bold text-white line-clamp-1">{displayTitle}</h3>}
            <p className="text-xs text-zinc-300 line-clamp-2 leading-relaxed">
              {pickedAnime?.synopsis}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {pickedAnime?.genres?.slice(0, 3).map((g) => (
                <span
                  key={g}
                  className="px-2 py-0.5 rounded-md bg-white/10 text-[10px] font-semibold text-zinc-300"
                >
                  {g}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={rollDice}
            disabled={isRolling || availableAnime.length === 0}
            className="flex-1 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRolling ? 'animate-spin' : ''}`} />
            <span>Roll Again</span>
          </button>

          <button
            onClick={() => {
              if (!pickedAnime) return;
              onClose();
              setSelectedAnime(pickedAnime);
            }}
            disabled={!pickedAnime}
            className="px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            title="Details"
          >
            <Info className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              if (!pickedAnime) return;
              onClose();
              playAnimeEpisode(pickedAnime, 1);
            }}
            disabled={!pickedAnime}
            className="flex-1 py-3 rounded-xl bg-[var(--anilife-accent)] hover:bg-[var(--anilife-accent-hover)] text-black font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-[0_0_12px_var(--anilife-accent-shadow)] cursor-pointer"
          >
            <Play className="w-4 h-4 fill-black" />
            <span>Watch Now</span>
          </button>
        </div>
      </div>
    </div>
  );
};
