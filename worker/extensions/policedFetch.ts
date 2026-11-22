import type { HttpRequest, HttpResponse } from './replay';

const MAX_BODY = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export function hostAllowed(hostname: string, allowed: string[]): boolean {
  const h = hostname.toLowerCase();
  return allowed.some((a) => h === a || h.endsWith('.' + a));
}

export function makePolicedFetch(allowed: string[], fetchImpl: typeof fetch = fetch) {
  return async (req: HttpRequest): Promise<HttpResponse> => {
    let url = req.url;
    let method = req.method || 'GET';
    let body: Uint8Array | undefined = req.body ? Uint8Array.from(req.body as ArrayLike<number>) : undefined;

    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      let u: URL;
      try { u = new URL(url); } catch { throw new Error('invalid url'); }
      if (u.protocol !== 'https:') throw new Error('https only');
      if (u.username || u.password) throw new Error('credentials in url');
      if (/^[\d.]+$/.test(u.hostname) || u.hostname.includes(':') || u.hostname === 'localhost') throw new Error('ip/localhost not allowed');
      if (!hostAllowed(u.hostname, allowed)) throw new Error(`host not allowed: ${u.hostname}`);

      const res = await fetchImpl(u.toString(), {
        method, body, redirect: 'manual',
        headers: Object.fromEntries(req.headers ?? []),
        signal: AbortSignal.timeout(10_000),
      });
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, u).toString();
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) { method = 'GET'; body = undefined; }
        continue;
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length > MAX_BODY) throw new Error('response too large');
      return { status: res.status, headers: [...res.headers.entries()], body: buf };
    }
    throw new Error('too many redirects');
  };
}
