export const CACHE_REFRESH_MARKER = 'anilife_cache_refresh_2026_11_16';

export async function runOneTimeCacheRefresh(
  storage: Storage = localStorage,
  cacheStorage: Pick<CacheStorage, 'keys' | 'delete'> | undefined =
    typeof caches === 'undefined' ? undefined : caches
): Promise<boolean> {
  try {
    if (storage.getItem(CACHE_REFRESH_MARKER)) return false;
    const staleCatalogKeys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key): key is string => Boolean(key?.startsWith('anilife_live_catalog_cache_')));
    staleCatalogKeys.forEach((key) => storage.removeItem(key));
    if (cacheStorage) {
      const names = await cacheStorage.keys().catch(() => []);
      await Promise.all(names.filter((name) => name.startsWith('anilife-')).map((name) => cacheStorage.delete(name)));
    }
    storage.setItem(CACHE_REFRESH_MARKER, '1');
    return true;
  } catch {
    return false;
  }
}
