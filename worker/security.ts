const DISCORD_ANCESTORS = "https://discord.com https://*.discordsays.com";

function isDiscordActivityRequest(request: Request): boolean {
  const url = new URL(request.url);
  return url.pathname === '/activity' ||
    url.pathname.startsWith('/activity/') ||
    (url.searchParams.has('frame_id') && url.searchParams.has('instance_id'));
}

function contentSecurityPolicy(activity: boolean): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    activity ? `frame-ancestors ${DISCORD_ANCESTORS}` : "frame-ancestors 'none'",
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://graphql.anilist.co https://cdn.jsdelivr.net https://raw.githubusercontent.com https://api.aniskip.com https://challenges.cloudflare.com https://*.supabase.co wss://*.supabase.co",
    "worker-src 'self' blob:",
    "frame-src 'self' https://animeembed.com https://*.animeembed.com https://zokoanime.video https://*.zokoanime.video https://flixcloud.cc https://*.flixcloud.cc https://vidlink.pro https://*.vidlink.pro https://challenges.cloudflare.com",
    "form-action 'self' https://anilist.co",
    "manifest-src 'self'",
  ].join('; ');
}

export function securityHeaders(request: Request): Record<string, string> {
  const url = new URL(request.url);
  const preview = url.hostname.endsWith('.workers.dev');
  const activity = isDiscordActivityRequest(request);
  const protectedWatch = url.pathname.startsWith('/watch/') || url.pathname.startsWith('/activity/watch/');
  return {
    'Content-Security-Policy': contentSecurityPolicy(activity),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': protectedWatch ? 'no-referrer' : 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    ...(activity ? {} : { 'X-Frame-Options': 'DENY' }),
    ...(preview || protectedWatch ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
    ...(url.protocol === 'https:'
      ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }
      : {}),
  };
}

export function protectedRequestAllowed(request: Request): boolean {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  const sameOrigin = !origin || origin === url.origin;
  const sameSiteFetch = !fetchSite || ['same-origin', 'same-site', 'none'].includes(fetchSite);
  if (sameOrigin && sameSiteFetch) return true;
  return origin === 'https://1567279187893551185.discordsays.com';
}
