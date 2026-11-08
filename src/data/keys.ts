/**
 * localStorage keys shared by the storage layer, the IndexedDB mirror and backups.
 * These are the live web v3 keys; they are preserved exactly so an upgrade never loses data.
 */
export const STORAGE_KEYS = {
  SETTINGS: 'anilife_settings_v3',
  WATCHLIST_PREFIX: 'anilife_watchlist_v3_',
  CONTINUE_PREFIX: 'anilife_continue_v3_',
  SEARCH_PREFIX: 'anilife_searches_v3_',
  PROFILES: 'anilife_profiles_v3',
  ACTIVE_PROFILE_ID: 'anilife_active_profile_id_v3',
  OAUTH_TOKEN: 'anilife_oauth_token',
  LIVE_CATALOG_CACHE: 'anilife_live_catalog_cache_v3',
} as const;
