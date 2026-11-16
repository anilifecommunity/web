import { webServerOptions } from './providerOptions';
import type { Anime, ContinueWatchingEntry, ServerOption } from '../types/anime';

export const SERVERS: ServerOption[] = webServerOptions();

const LEGACY_SLUG_IDS: Record<string, number> = {
  'gushing-over-magical-girls': 162780,
  'eminence-in-shadow': 130298,
  'aristocrat-otherworldly-adventure': 153332,
  'arifureta-strongest': 100668,
  'farming-life-another-world': 146850,
  'worlds-finest-assassin': 129898,
  'eighty-six': 116589,
  'loner-life-in-another-world': 173693,
  frieren: 154587,
  'apothecary-diaries': 161645,
  dandadan: 171018,
  'solo-leveling': 151807,
  'chainsaw-man': 127230,
  'jujutsu-kaisen': 113415,
  'demon-slayer': 101922,
  'spy-x-family': 140960,
  'mushoku-tensei': 108465,
  'oshi-no-ko': 150672,
  'hells-paradise': 128893,
  'bleach-tybw': 114446,
  'one-piece': 21,
};

/** Numeric IDs are canonical; the map only keeps existing v1 bookmarks playable. */
export function getAnimeAniListId(anime: Anime): number {
  if (anime.anilistId && Number.isFinite(anime.anilistId)) return anime.anilistId;
  const parsed = Number.parseInt(anime.id, 10);
  return parsed > 0 ? parsed : LEGACY_SLUG_IDS[anime.id] ?? Number.NaN;
}

export const INITIAL_CONTINUE_WATCHING: ContinueWatchingEntry[] = [];
