import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Anime } from '../types/anime';
import { Dices, Play, RefreshCw, X, Star, Info } from 'lucide-react';

const RANDOM_CATEGORIES = [
  'Anything',
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Isekai',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Supernatural',
  'Mystery',
  'Psychological',
  'Sports',
  'Shounen',
  'Seinen',
  'Dubbed',
  'Top Rated'
] as const;

type RandomCategory = (typeof RANDOM_CATEGORIES)[number];

const ANIME_FALLBACK_IMAGE = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-n2hr0omr9adP.jpg';

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
    const list = availableAnime.length > 0 ? availableAnime : liveCatalog;
    return list[Math.floor(Math.random() * list.length)] || liveCatalog[0];
  });

  const rollDice = () => {
    setIsRolling(true);
    const candidates = availableAnime.length > 0 ? availableAnime : liveCatalog;

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
    const pool = filtered.length > 0 ? filtered : liveCatalog;
    setPickedAnime(pool[Math.floor(Math.random() * pool.length)]);
  };

  if (!pickedAnime) return null;

  const displayTitle =
    settings.titleLanguage === 'romaji'
      ? pickedAnime.romajiTitle || pickedAnime.title
      : settings.titleLanguage === 'native'
      ? pickedAnime.nativeTitle || pickedAnime.romajiTitle || pickedAnime.title
      : pickedAnime.title || pickedAnime.romajiTitle;

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
            <div className="p-2.5 rounded-xl bg-[#74cf66]/20 text-[#74cf66]">
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
                  ? 'bg-[#74cf66] text-black shadow-[0_0_10px_rgba(116,207,102,0.3)]'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Anime Showcase Card */}
        <div className="relative rounded-2xl overflow-hidden aspect-video bg-zinc-900 border border-zinc-800 shadow-xl group">
          <img
            src={pickedAnime.bannerImage || pickedAnime.posterImage || ANIME_FALLBACK_IMAGE}
            alt={displayTitle}
            onError={(e) => {
              e.currentTarget.src = ANIME_FALLBACK_IMAGE;
            }}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />

          {/* Top badges */}
          <div className="absolute top-3 inset-x-3 flex items-center justify-between">
            <span className="px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md text-[11px] font-bold text-white flex items-center gap-1">
              <Star className="w-3 h-3 fill-[#74cf66] text-[#74cf66]" />
              <span>{pickedAnime.score || 75}%</span>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-[#74cf66] text-black text-[10px] font-bold">
              {pickedAnime.format || 'TV'}
            </span>
          </div>

          {/* Bottom details */}
          <div className="absolute bottom-0 inset-x-0 p-4 space-y-1.5">
            <h3 className="text-xl font-bold text-white line-clamp-1">{displayTitle}</h3>
            <p className="text-xs text-zinc-300 line-clamp-2 leading-relaxed">
              {pickedAnime.synopsis}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {pickedAnime.genres?.slice(0, 3).map((g) => (
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
            disabled={isRolling}
            className="flex-1 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRolling ? 'animate-spin' : ''}`} />
            <span>Roll Again</span>
          </button>

          <button
            onClick={() => {
              onClose();
              setSelectedAnime(pickedAnime);
            }}
            className="px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            title="Details"
          >
            <Info className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              onClose();
              playAnimeEpisode(pickedAnime, 1);
            }}
            className="flex-1 py-3 rounded-xl bg-[#74cf66] hover:bg-[#62b956] text-black font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-[0_0_12px_rgba(116,207,102,0.3)] cursor-pointer"
          >
            <Play className="w-4 h-4 fill-black" />
            <span>Watch Now</span>
          </button>
        </div>
      </div>
    </div>
  );
};
