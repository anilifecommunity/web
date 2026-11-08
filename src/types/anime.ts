export interface Episode {
  id: string;
  number: number;
  title: string;
  durationSec: number;
  thumbnail: string;
  videoUrl: string;
  isFiller?: boolean;
  isUnreleased?: boolean;
  airedDate?: string;
  synopsis?: string;
}

export interface Season {
  id: string;
  number: number;
  title: string;
  year: number;
  episodes: Episode[];
}

export interface RelatedAnime {
  id: string;
  title: string;
  relation: string; 
  format: string; 
  year: number;
  poster: string;
  episodesCount?: number;
}

export interface Anime {
  id: string;
  anilistId?: number;
  title: string;
  romajiTitle?: string;
  nativeTitle?: string;
  bannerImage: string;
  posterImage: string;
  score: number; 
  format: 'TV' | 'Movie' | 'ONA' | 'OVA' | 'Special';
  year: number;
  status: 'Finished' | 'Releasing' | 'Not Yet Aired';
  durationMins: number;
  genres: string[];
  synopsis: string;
  studio: string;
  startDate: string;
  seasonName: string; 
  membersCount: number;
  trailerUrl?: string;
  hasDub: boolean;
  hasSub: boolean;
  seasons: Season[];
  related: RelatedAnime[];
  airSchedule?: {
    dayOfWeek: number; 
    airTime: string; 
    nextEpisode: number;
  };
}

export type WatchStatus = 'Watching' | 'Rewatching' | 'Plan to watch' | 'Paused' | 'Completed' | 'Dropped';

export interface WatchlistEntry {
  animeId: string;
  status: WatchStatus;
  updatedAt: string;
  customList?: string;
}

export interface ContinueWatchingEntry {
  animeId: string;
  episodeNumber: number;
  currentTimeSec: number;
  durationSec: number;
  serverName: string;
  audioMode: 'SUB' | 'DUB';
  updatedAt: string;
}

export interface ServerOption {
  id: string;
  name: string;
  isStarred?: boolean;
  speed: 'Fast' | 'Ultra' | 'Normal';
  supportsDub: boolean;
  supportsSub: boolean;
  supportsDownload: boolean;
  badge?: string; 
  description?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  accentColor: string;
  pin?: string;
  isKidsMode?: boolean;
  createdAt?: number;
}

export type ThemePresetName =
  | 'Midnight'
  | 'Crimson Night'
  | 'Toxic'
  | 'Royal'
  | 'Deep Sea'
  | 'Cyber'
  | 'Sakura'
  | 'Ember'
  | 'Gilded'
  | 'Forest'
  | 'High contrast';

export interface AppSettings {
  
  themePreset: ThemePresetName;
  canvasBackground: 'amoled' | 'dark';
  accentColor: string;
  backdropSource: 'none' | 'anime' | 'custom';
  backdropImage: string;
  backdropDim: 'Light' | 'Medium' | 'Dark';
  backdropBlur: boolean;
  glassPopups: boolean;
  refreshSpinner: boolean;
  playAppIntro: boolean;

  
  autoPlayNext: boolean;
  autoSkipIntro: boolean;
  skipFiller: boolean;
  showSkipButton: boolean;
  skipButtonLength: number; 
  watchedThreshold: number; 
  defaultQuality: 'Auto' | '1080p' | '720p' | '480p';
  playbackSpeed: number; 
  screenFit: 'Fit' | 'Crop' | 'Fill';
  defaultAudioMode: 'SUB' | 'DUB';

  
  showSubtitlesByDefault: boolean;
  subtitlesOnDub: boolean;
  preferredSubLanguage: string;
  secondChoiceSubtitles: string;
  captionSize: 'Small' | 'Medium' | 'Large';
  subtitleOffsetSec: number;

  
  activeServer: string;
  serverPriority: string[];
  enabledServers: string[];
  serverOrderVersion?: number;

  
  hideAdultContent: boolean;
  titleLanguage: 'romaji' | 'english' | 'native';
  blurSpoilers: boolean;
  onlyWatchableEpisodes: boolean;

  
  anilistConnected: boolean;
  anilistUsername?: string;
  discordConnected: boolean;
  discordUsername?: string;
  discordAvatar?: string;
  discordPresence: boolean;
  discordRichPresence: boolean;
  dnsOverHttps: boolean;

  
  navigationLayout: 'sidebar' | 'topbar';
  autoHideNav: boolean;

  /** Both default off. No upload endpoint is called until an operator configures one. */
  diagnosticUpload?: boolean;
  performanceUpload?: boolean;
}

