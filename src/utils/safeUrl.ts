const DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i;

/**
 * Returns an image URL only when it is a same-origin path, an HTTPS URL or an inline raster image.
 * Anything else falls back, so a stored profile or API value cannot inject a script URL into DOM.
 */
export function safeImageUrl(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const url = value.trim();
  if (!url) return fallback;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  if (url.startsWith('https://')) return url;
  if (DATA_IMAGE.test(url)) return url;
  return fallback;
}
