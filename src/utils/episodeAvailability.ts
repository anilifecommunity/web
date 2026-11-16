import type { Anime, Episode } from '../types/anime';

export function selectAiredEpisodes(anime: Anime, now = Date.now()): Episode[] {
  if (anime.status === 'Not Yet Aired') return [];

  const episodes = anime.seasons.flatMap((season) => season.episodes);
  return episodes.filter((episode) => {
    if (episode.isUnreleased) return false;

    if (episode.airedDate) {
      const airedAt = Date.parse(episode.airedDate);
      if (Number.isFinite(airedAt) && airedAt > now) return false;
    }

    if (anime.nextEpisode) return episode.number < anime.nextEpisode.number;
    if (anime.status === 'Finished') return true;

    const airedAt = episode.airedDate ? Date.parse(episode.airedDate) : Number.NaN;
    return Number.isFinite(airedAt) && airedAt <= now;
  });
}

export function canWatchEpisode(anime: Anime, episodeNumber: number, now = Date.now()): boolean {
  return selectAiredEpisodes(anime, now).some((episode) => episode.number === episodeNumber);
}

export function firstAiredEpisode(anime: Anime, now = Date.now()): Episode | undefined {
  return selectAiredEpisodes(anime, now).sort((a, b) => a.number - b.number)[0];
}
