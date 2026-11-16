import React, { useState } from 'react';
import { Clock3, Flame, Info, Play, Star, Trophy, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Anime, AppSettings, ContinueWatchingEntry } from '../types/anime';
import { canWatchEpisode, firstAiredEpisode } from '../utils/episodeAvailability';
import { displayAnimeTitle } from '../utils/animePreferences';
import { safeImageUrl } from '../utils/safeUrl';

const factsFor = (anime: Anime) => [
  anime.format,
  anime.year > 0 ? String(anime.year) : '',
  anime.durationMins > 0 ? `${anime.durationMins}m` : '',
  ...anime.genres.slice(0, 2),
].filter(Boolean);

const PosterCard: React.FC<{ anime: Anime; rank?: number; titleLanguage: AppSettings['titleLanguage']; onOpen: () => void }> = ({ anime, rank, titleLanguage, onOpen }) => (
  <button type="button" onClick={onOpen} className="group min-w-0 text-left">
    <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-white/10 bg-zinc-900 transition duration-200 group-hover:-translate-y-1 group-hover:border-[var(--anilife-accent)]/50 group-hover:shadow-xl group-hover:shadow-black/40">
      {anime.posterImage ? (
        <img src={safeImageUrl(anime.posterImage, '')} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-zinc-800 to-black" />
      )}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 to-transparent" />
      {rank ? <span className="absolute left-2 top-2 rounded-md bg-black/80 px-2 py-1 text-xs font-black text-amber-300">#{rank}</span> : null}
      {anime.score > 0 ? (
        <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/80 px-2 py-1 text-[10px] font-bold text-[var(--anilife-accent)]">
          <Star className="h-3 w-3 fill-current" /> {anime.score}%
        </span>
      ) : null}
    </div>
    <h3 className="mt-2 line-clamp-1 text-sm font-bold text-zinc-100 transition-colors group-hover:text-[var(--anilife-accent)]">{displayAnimeTitle(anime, titleLanguage)}</h3>
    <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500">{factsFor(anime).slice(0, 3).join(' / ')}</p>
  </button>
);

export const HomeFeed: React.FC = () => {
  const {
    setSelectedAnime,
    continueWatching,
    playAnimeEpisode,
    removeFromContinueWatching,
    liveCatalog,
    trendingAnime,
    popularSeasonAnime,
    topRatedAnime,
    spotlightAnime,
    settings,
  } = useApp();
  const [activeSpotlightIdx, setActiveSpotlightIdx] = useState(0);

  const spotlights = spotlightAnime.length ? spotlightAnime.slice(0, 5) : liveCatalog.slice(0, 5);
  const spotlight = spotlights[activeSpotlightIdx] || liveCatalog[0];
  const spotlightEpisode = spotlight ? firstAiredEpisode(spotlight) : undefined;
  const trending = (trendingAnime.length ? trendingAnime : liveCatalog).slice(0, 10);
  const season = (popularSeasonAnime.length ? popularSeasonAnime : liveCatalog.slice(8)).slice(0, 14);
  const ranking = (topRatedAnime.length ? topRatedAnime : liveCatalog).slice(0, 6);
  const continueItems = continueWatching
    .map((entry) => {
      const anime = liveCatalog.find((item) => item.id === entry.animeId);
      return anime ? { entry, anime } : null;
    })
    .filter(Boolean) as Array<{ entry: ContinueWatchingEntry; anime: Anime }>;

  return (
    <div className="space-y-10 pb-20 animate-fadeIn">
      {spotlight && (
        <section className="relative isolate flex min-h-[430px] items-end overflow-hidden rounded-2xl border border-white/10 p-5 shadow-2xl sm:min-h-[520px] sm:p-10">
          <img src={safeImageUrl(spotlight.bannerImage || spotlight.posterImage, '')} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/75 to-black/15" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-transparent to-black/30" />

          <div className="max-w-2xl">
            <p className="anilife-eyebrow">Featured on Anilife</p>
            <h1 className="max-w-xl text-4xl font-black leading-[0.98] tracking-tight text-white sm:text-6xl">{displayAnimeTitle(spotlight, settings.titleLanguage)}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-zinc-300">
              {spotlight.score > 0 && <span className="flex items-center gap-1 text-[var(--anilife-accent)]"><Star className="h-3.5 w-3.5 fill-current" /> {spotlight.score}%</span>}
              {factsFor(spotlight).map((fact) => <span key={fact}>{fact}</span>)}
            </div>
            {spotlight.synopsis && <p className="mt-4 line-clamp-3 max-w-xl text-sm leading-relaxed text-zinc-300 sm:text-base">{spotlight.synopsis}</p>}
            <div className="mt-6 flex flex-wrap gap-2">
              <button type="button" onClick={() => spotlightEpisode ? playAnimeEpisode(spotlight, spotlightEpisode.number) : setSelectedAnime(spotlight)} className="anilife-button anilife-button-primary">
                {spotlightEpisode ? <Play className="h-4 w-4 fill-current" /> : <Info className="h-4 w-4" />}
                {spotlightEpisode ? `Watch episode ${spotlightEpisode.number}` : 'Release details'}
              </button>
              <button type="button" onClick={() => setSelectedAnime(spotlight)} className="anilife-button anilife-button-secondary"><Info className="h-4 w-4" /> Details</button>
            </div>
          </div>

          {spotlights.length > 1 && (
            <div className="absolute right-5 top-5 flex gap-1.5 rounded-full border border-white/10 bg-black/50 p-2 backdrop-blur-md">
              {spotlights.map((item, index) => (
                <button type="button" key={item.id} onClick={() => setActiveSpotlightIdx(index)} aria-label={`Show ${displayAnimeTitle(item, settings.titleLanguage)}`} className="flex h-5 w-5 items-center justify-center rounded-full">
                  <span className={`block h-1.5 rounded-full transition-all ${index === activeSpotlightIdx ? 'w-5 bg-[var(--anilife-accent)]' : 'w-1.5 bg-zinc-500'}`} />
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {continueItems.length > 0 && (
        <section aria-labelledby="continue-heading">
          <div className="mb-4">
            <p className="anilife-eyebrow">Your activity</p>
            <h2 id="continue-heading" className="anilife-section-title">Continue watching</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {continueItems.map(({ anime, entry }) => {
              const playable = canWatchEpisode(anime, entry.episodeNumber);
              const progress = entry.durationSec > 0 ? Math.min(100, Math.round((entry.currentTimeSec / entry.durationSec) * 100)) : 0;
              return (
                <article key={`${anime.id}-${entry.episodeNumber}`} className="group relative w-72 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.035] sm:w-80">
                  <button type="button" onClick={() => playable ? playAnimeEpisode(anime, entry.episodeNumber) : setSelectedAnime(anime)} className="block w-full text-left">
                    <div className="relative aspect-video overflow-hidden bg-zinc-900">
                      <img src={safeImageUrl(anime.bannerImage || anime.posterImage, '')} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                      <span className="absolute bottom-3 left-3 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--anilife-accent)] text-black"><Play className="h-4 w-4 fill-current" /></span>
                    </div>
                    <div className="p-3">
                      <h3 className="truncate text-sm font-bold">{displayAnimeTitle(anime, settings.titleLanguage)}</h3>
                      <p className="mt-1 text-xs text-zinc-500">Episode {entry.episodeNumber} / {progress}% watched</p>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[var(--anilife-accent)]" style={{ width: `${progress}%` }} /></div>
                    </div>
                  </button>
                  <button type="button" onClick={() => removeFromContinueWatching(anime.id)} className="absolute right-2 top-2 rounded-full bg-black/70 p-2 text-zinc-300 opacity-100 backdrop-blur-sm transition hover:text-white sm:opacity-0 sm:group-hover:opacity-100" aria-label={`Remove ${displayAnimeTitle(anime, settings.titleLanguage)} from continue watching`}><X className="h-3.5 w-3.5" /></button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]" aria-labelledby="trending-heading">
        <div>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div><p className="anilife-eyebrow">What people are finding</p><h2 id="trending-heading" className="anilife-section-title">Trending now</h2></div>
            <Flame className="h-5 w-5 text-amber-400" aria-hidden="true" />
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 xl:grid-cols-5">
            {trending.map((anime, index) => <PosterCard key={anime.id} anime={anime} rank={index + 1} titleLanguage={settings.titleLanguage} onOpen={() => setSelectedAnime(anime)} />)}
          </div>
        </div>

        <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" aria-labelledby="ranking-heading">
          <div className="mb-3 flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-300" /><h2 id="ranking-heading" className="text-lg font-black">Top rated</h2></div>
          <div className="divide-y divide-white/10">
            {ranking.map((anime, index) => (
              <button type="button" key={anime.id} onClick={() => setSelectedAnime(anime)} className="group grid w-full grid-cols-[2rem_3.25rem_1fr] items-center gap-3 py-3 text-left">
                <span className="text-2xl font-black text-zinc-700 group-hover:text-[var(--anilife-accent)]">{index + 1}</span>
                <div className="aspect-[2/3] overflow-hidden rounded-md bg-zinc-900">{anime.posterImage && <img src={safeImageUrl(anime.posterImage, '')} alt="" loading="lazy" className="h-full w-full object-cover" />}</div>
                <span className="min-w-0"><span className="line-clamp-2 text-sm font-bold text-zinc-200 group-hover:text-white">{displayAnimeTitle(anime, settings.titleLanguage)}</span><span className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500">{anime.score > 0 ? <><Star className="h-3 w-3 fill-amber-300 text-amber-300" /> {anime.score}%</> : anime.format}</span></span>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section aria-labelledby="season-heading">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div><p className="anilife-eyebrow">Currently airing</p><h2 id="season-heading" className="anilife-section-title">Popular this season</h2></div>
          <Clock3 className="h-5 w-5 text-[var(--anilife-accent)]" aria-hidden="true" />
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
          {season.map((anime) => <PosterCard key={anime.id} anime={anime} titleLanguage={settings.titleLanguage} onOpen={() => setSelectedAnime(anime)} />)}
        </div>
      </section>
    </div>
  );
};
