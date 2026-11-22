const h = () => {
  const impl = globalThis.__ANILIFE_HOST__;
  if (!impl) throw new Error('extension host not installed');
  return impl;
};
export const http = (req) => h().http(req);
export const browserFetch = (origin, req) => h().browserFetch(origin, req);
export const log = (message) => h().log(message);
export const cacheGet = (key) => h().cacheGet(key);
export const cacheSet = (key, value, ttl) => h().cacheSet(key, value, ttl);
