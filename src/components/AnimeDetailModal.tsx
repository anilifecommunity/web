import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, Check, ChevronDown, Clock3, Play, Search, Share2 } from 'lucide-react';
import type { Anime, Episode, WatchStatus } from '../types/anime';
import { useApp } from '../context/AppContext';
import { getAnimeAniListId } from '../utils/animeData';
import { fetchMediaIndexEpisodes } from '../utils/mediaIndexApi';
import { selectAiredEpisodes } from '../utils/episodeAvailability';

interface Props {
  anime: Anime;
  onClose: () => void;
}

const STATUS_OPTIONS: WatchStatus[] = [
  'Watching',
  'Plan to watch',
  'Completed',
  'Paused',
  'Rewatching',
  'Dropped',
];

export const AnimeDetailModal: React.FC<Props> = ({ anime, onClose }) => {
  const {
    continueWatching,
    liveCatalog,
    playAnimeEpisode,
    setAnimeWatchStatus,
    setSelectedAnime,
    watchlist,
  } = useApp();
  const [episodeSearch, setEpisodeSearch] = useState('');
  const [newestFirst, setNewestFirst] = useState(false);
  const [realEpisodes, setRealEpisodes] = useState<Episode[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const watchStatusRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeWatchStatus = (event: PointerEvent) => {
      const menu = watchStatusRef.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    };
    document.addEventListener('pointerdown', closeWatchStatus);
    return () => document.removeEventListener('pointerdown', closeWatchStatus);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const aniListId = getAnimeAniListId(anime);
    if (!aniListId) return;

    fetchMediaIndexEpisodes(aniListId).then((episodes) => {
      if (cancelled || !episodes?.length) return;
      setRealEpisodes(episodes.map((entry: any) => ({
        id: `${anime.id}-ep-${entry.number}`,
        number: entry.number,
        title: entry.title || `Episode ${entry.number}`,
        durationSec: (entry.length || entry.runtime || anime.durationMins || 0) * 60,
        thumbnail: entry.image || entry.still || anime.bannerImage || anime.posterImage,
        videoUrl: '',
        synopsis: entry.description || entry.overview,
        airedDate: entry.airDate || entry.air_date,
      })));
    });

    return () => {
      cancelled = true;
    };
  }, [anime]);

  const availabilityAnime = useMemo(() => {
    if (!realEpisodes.length) return anime;
    const seasons = anime.seasons.length
      ? anime.seasons.map((season, index) => index === 0 ? { ...season, episodes: realEpisodes } : season)
      : [{ id: `${anime.id}-s1`, number: 1, title: 'Season 1', year: anime.year, episodes: realEpisodes }];
    return { ...anime, seasons };
  }, [anime, realEpisodes]);

  const airedEpisodes = useMemo(
    () => selectAiredEpisodes(availabilityAnime),
    [availabilityAnime]
  );
  const continueEntry = continueWatching.find((entry) => entry.animeId === anime.id);
  const currentEpisode = airedEpisodes.find((episode) => episode.number === continueEntry?.episodeNumber)
    || airedEpisodes[0];
  const progress = continueEntry && continueEntry.durationSec > 0
    ? Math.min(100, Math.round((continueEntry.currentTimeSec / continueEntry.durationSec) * 100))
    : null;
  const watchStatus = watchlist.find((entry) => entry.animeId === anime.id)?.status || 'Plan to watch';

  const filteredEpisodes = airedEpisodes
    .filter((episode) => {
      const query = episodeSearch.trim().toLowerCase();
      return !query
        || episode.title.toLowerCase().includes(query)
        || String(episode.number).includes(query);
    })
    .sort((a, b) => newestFirst ? b.number - a.number : a.number - b.number);

  const nextAiring = anime.nextEpisode && anime.nextEpisode.airingAt * 1000 > Date.now()
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(anime.nextEpisode.airingAt * 1000))
    : null;

  const share = async () => {
    const url = new URL(`/anime/${anime.id}`, window.location.origin).toString();
    try {
      if (navigator.share) await navigator.share({ title: anime.title, url });
      else await navigator.clipboard.writeText(url);
      setNotice('Share link ready.');
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') setNotice('Could not share this title.');
    }
  };

  const openRelated = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const related = liveCatalog.find((entry) => entry.id === id);
    if (!related) return;
    event.preventDefault();
    setSelectedAnime(related);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--anilife-canvas)] text-white animate-fadeIn">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-3 px-4 sm:px-7">
          <button type="button" onClick={onClose} className="anilife-icon-button" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Title</p>
            <p className="truncate text-sm font-semibold">{anime.title}</p>
          </div>
          <button type="button" onClick={() => void share()} className="anilife-icon-button" aria-label="Share title">
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main>
        <section className="relative isolate min-h-[560px] overflow-hidden border-b border-white/10 lg:min-h-[650px]">
          {(anime.bannerImage || anime.posterImage) && (
            <img src={anime.bannerImage || anime.posterImage} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover opacity-45" />
          )}
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,#050506_0%,rgba(5,5,6,.92)_38%,rgba(5,5,6,.38)_78%),linear-gradient(0deg,#050506_0%,transparent_58%)]" />

          <div className="mx-auto grid min-h-[560px] max-w-[1500px] items-end gap-8 px-4 py-10 sm:px-7 lg:grid-cols-[240px_minmax(0,780px)] lg:py-16">
            <div className="hidden overflow-hidden rounded-xl border border-white/15 bg-zinc-900 shadow-2xl lg:block">
              {anime.posterImage && <img src={anime.posterImage} alt={`${anime.title} poster`} className="aspect-[2/3] w-full object-cover" />}
            </div>

            <div className="space-y-5">
              <div className="flex flex-wrap gap-2 text-xs font-medium text-zinc-300">
                <span className="rounded-md bg-white/10 px-2.5 py-1">{anime.format}</span>
                <span className="rounded-md bg-white/10 px-2.5 py-1">{anime.status}</span>
                {anime.year > 0 && <span className="rounded-md bg-white/10 px-2.5 py-1">{anime.year}</span>}
                {anime.score > 0 && <span className="rounded-md bg-white/10 px-2.5 py-1">{anime.score}% AniList</span>}
              </div>

              <div>
                <h1 className="max-w-4xl text-4xl font-black leading-[0.98] tracking-[-0.04em] sm:text-6xl lg:text-7xl">{anime.title}</h1>
                {anime.romajiTitle && anime.romajiTitle !== anime.title && <p className="mt-3 text-sm text-zinc-400">{anime.romajiTitle}</p>}
              </div>

              <div className="max-w-3xl">
                <p className={`text-sm leading-7 text-zinc-300 sm:text-base ${synopsisExpanded ? '' : 'line-clamp-6 sm:line-clamp-none'}`}>{anime.synopsis || 'Synopsis unavailable.'}</p>
                {anime.synopsis && (
                  <button type="button" onClick={() => setSynopsisExpanded((value) => !value)} className="mt-2 text-xs font-bold text-[var(--anilife-accent)] sm:hidden">
                    {synopsisExpanded ? 'Show less' : 'Read full synopsis'}
                  </button>
                )}
              </div>

              {anime.genres.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-zinc-400">
                  {anime.genres.map((genre) => <span key={genre}>{genre}</span>)}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                {currentEpisode ? (
                  <button type="button" onClick={() => playAnimeEpisode(anime, currentEpisode.number, continueEntry?.audioMode || 'SUB')} className="anilife-button anilife-button-primary">
                    <Play className="h-4 w-4 fill-current" />
                    {continueEntry ? `Continue episode ${currentEpisode.number}` : `Watch episode ${currentEpisode.number}`}
                  </button>
                ) : (
                  <span className="inline-flex min-h-11 items-center rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-semibold text-zinc-300">
                    {anime.status === 'Not Yet Aired' ? 'Upcoming - no episodes aired' : 'Release status not confirmed'}
                  </span>
                )}

                <details
                  ref={watchStatusRef}
                  className="group/watch-status relative min-w-[180px]"
                  onKeyDown={(event) => {
                    if (event.key !== 'Escape' || !watchStatusRef.current?.open) return;
                    watchStatusRef.current.open = false;
                    watchStatusRef.current.querySelector('summary')?.focus();
                  }}
                >
                  <summary aria-label={`Watch status: ${watchStatus}`} className="anilife-select flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                    <span className="font-semibold">{watchStatus}</span>
                    <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-open/watch-status:rotate-180" />
                  </summary>
                  <div className="absolute bottom-full left-0 z-40 mb-2 w-full min-w-[210px] rounded-xl border border-white/15 bg-zinc-950/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl" role="group" aria-label="Choose watch status">
                    {STATUS_OPTIONS.map((status) => {
                      const selected = status === watchStatus;
                      return (
                        <button
                          type="button"
                          key={status}
                          aria-pressed={selected}
                          onClick={() => {
                            void setAnimeWatchStatus(anime.id, status);
                            if (watchStatusRef.current) watchStatusRef.current.open = false;
                          }}
                          className={`flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors ${selected ? 'bg-[var(--anilife-accent)]/15 text-[var(--anilife-accent)]' : 'text-zinc-300 hover:bg-white/[0.07] hover:text-white'}`}
                        >
                          {status}
                          {selected && <Check aria-hidden="true" className="h-4 w-4" />}
                        </button>
                      );
                    })}
                  </div>
                </details>
              </div>

              {progress !== null && currentEpisode && (
                <div className="max-w-md" aria-label={`${progress}% watched`}>
                  <div className="mb-2 flex justify-between text-xs text-zinc-400"><span>Episode {currentEpisode.number}</span><span>{progress}%</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[var(--anilife-accent)]" style={{ width: `${progress}%` }} /></div>
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-[1500px] space-y-12 px-4 py-10 sm:px-7 lg:py-14">
          {nextAiring && anime.nextEpisode && (
            <section className="anilife-status-card" aria-labelledby="next-airing-title">
              <CalendarDays className="h-5 w-5 text-[var(--anilife-accent)]" />
              <div><h2 id="next-airing-title" className="font-semibold">Episode {anime.nextEpisode.number} airs next</h2><p className="mt-1 text-sm text-zinc-400">{nextAiring} in your local time. Streaming availability may follow later.</p></div>
            </section>
          )}

          <section aria-labelledby="episodes-title" className="space-y-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div><p className="anilife-eyebrow">Released episodes</p><h2 id="episodes-title" className="anilife-section-title">{airedEpisodes.length ? `${airedEpisodes.length} available` : 'Nothing released yet'}</h2></div>
              {airedEpisodes.length > 0 && (
                <div className="flex gap-2">
                  <label className="relative"><span className="sr-only">Filter episodes</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><input value={episodeSearch} onChange={(event) => setEpisodeSearch(event.target.value)} placeholder="Find episode" className="anilife-input pl-9" /></label>
                  <button type="button" onClick={() => setNewestFirst((value) => !value)} className="anilife-button anilife-button-secondary">{newestFirst ? 'Newest' : 'Oldest'}</button>
                </div>
              )}
            </div>

            {filteredEpisodes.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredEpisodes.map((episode) => (
                  <button type="button" key={episode.id} onClick={() => playAnimeEpisode(anime, episode.number)} className="group grid grid-cols-[112px_minmax(0,1fr)] overflow-hidden rounded-xl border border-white/10 bg-white/[0.035] text-left transition hover:border-[var(--anilife-accent)]/60 hover:bg-white/[0.06] sm:grid-cols-[124px_minmax(0,1fr)]">
                    <div className="relative min-h-[88px] min-w-0 w-full overflow-hidden bg-zinc-900">
                      {(episode.thumbnail || anime.posterImage) && <img src={episode.thumbnail || anime.posterImage} alt="" loading="lazy" className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]" />}
                      <span className="absolute left-2 top-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-bold">EP {episode.number}</span>
                    </div>
                    <div className="min-w-0 self-center p-3"><h3 className="line-clamp-2 text-sm font-semibold">{episode.title}</h3><p className="mt-2 flex items-center gap-1 text-xs text-zinc-500"><Clock3 className="h-3.5 w-3.5" />{episode.durationSec > 0 ? `${Math.round(episode.durationSec / 60)} min` : 'Duration unavailable'}</p></div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.025] p-8 text-sm text-zinc-400">
                {airedEpisodes.length === 0 ? 'Episodes will appear here only after their release is confirmed.' : 'No released episodes match this search.'}
              </div>
            )}
          </section>

          <section aria-labelledby="details-title" className="grid gap-8 border-t border-white/10 pt-10 lg:grid-cols-[1fr_1.4fr]">
            <div><p className="anilife-eyebrow">About</p><h2 id="details-title" className="anilife-section-title">Series details</h2></div>
            <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
              <div><dt className="text-zinc-500">Status</dt><dd className="mt-1 font-medium">{anime.status}</dd></div>
              <div><dt className="text-zinc-500">Format</dt><dd className="mt-1 font-medium">{anime.format}</dd></div>
              {anime.year > 0 && <div><dt className="text-zinc-500">Year</dt><dd className="mt-1 font-medium">{anime.year}</dd></div>}
              {anime.studio && <div><dt className="text-zinc-500">Studio</dt><dd className="mt-1 font-medium">{anime.studio}</dd></div>}
              {anime.membersCount > 0 && <div><dt className="text-zinc-500">AniList popularity</dt><dd className="mt-1 font-medium">{anime.membersCount.toLocaleString()}</dd></div>}
              {anime.durationMins > 0 && <div><dt className="text-zinc-500">Episode length</dt><dd className="mt-1 font-medium">About {anime.durationMins} min</dd></div>}
            </dl>
          </section>

          {anime.related.length > 0 && (
            <section aria-labelledby="related-title" className="space-y-5 border-t border-white/10 pt-10">
              <div><p className="anilife-eyebrow">Keep exploring</p><h2 id="related-title" className="anilife-section-title">Related titles</h2></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {anime.related.map((related) => (
                  <a key={related.id} href={`/anime/${related.id}`} onClick={(event) => openRelated(event, related.id)} className="flex min-h-24 gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3 transition hover:border-[var(--anilife-accent)]/50">
                    {related.poster && <img src={related.poster} alt="" loading="lazy" className="aspect-[2/3] w-12 rounded-md object-cover" />}
                    <div className="min-w-0 self-center"><h3 className="line-clamp-2 text-sm font-semibold">{related.title}</h3><p className="mt-1 text-xs text-zinc-500">{related.relation}</p></div>
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      {notice && <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-white/15 bg-zinc-950 px-4 py-3 text-sm shadow-2xl" role="status" aria-live="polite"><Check className="h-4 w-4 text-[var(--anilife-accent)]" />{notice}</div>}
    </div>
  );
};
