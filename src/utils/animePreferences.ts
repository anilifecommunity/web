import type { Anime, AppSettings } from '../types/anime';

type TitleLanguage = AppSettings['titleLanguage'];

export function displayAnimeTitle(anime: Pick<Anime, 'title' | 'englishTitle' | 'romajiTitle' | 'nativeTitle'>, language: TitleLanguage): string {
  if (language === 'native') return anime.nativeTitle || anime.romajiTitle || anime.englishTitle || anime.title;
  if (language === 'romaji') return anime.romajiTitle || anime.englishTitle || anime.title || anime.nativeTitle || 'Untitled Anime';
  return anime.englishTitle || anime.title || anime.romajiTitle || anime.nativeTitle || 'Untitled Anime';
}

export function displayAniListTitle(
  title: { english?: string; romaji?: string; native?: string },
  language: TitleLanguage
): string {
  if (language === 'native') return title.native || title.romaji || title.english || 'Untitled Anime';
  if (language === 'romaji') return title.romaji || title.english || title.native || 'Untitled Anime';
  return title.english || title.romaji || title.native || 'Untitled Anime';
}

export function isAnimeVisible(anime: Pick<Anime, 'isAdult'>, hideAdultContent: boolean): boolean {
  return !hideAdultContent || anime.isAdult !== true;
}
