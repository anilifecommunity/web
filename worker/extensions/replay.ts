// Extensions call http() synchronously but a Worker can only fetch asynchronously. Run the extension,
// abort at the first request without an answer, fetch it, then run again from the start replaying
// the earlier answers. Logs and cache writes from aborted runs are dropped.

export interface HttpRequest { method: string; url: string; headers: Array<[string, string]>; body?: Uint8Array | number[] | null }
export interface HttpResponse { status: number; headers: Array<[string, string]>; body: Uint8Array }

export interface HostImports {
  http(req: HttpRequest): HttpResponse;
  browserFetch(origin: string, req: HttpRequest): HttpResponse;
  log(message: string): void;
  cacheGet(key: string): string | undefined;
  cacheSet(key: string, value: string, ttl: number): void;
}

export interface ReplayOptions<Q, R> {
  instantiate: (host: HostImports) => Promise<(query: Q) => R> | ((query: Q) => R);
  query: Q;
  fetchAsync: (req: HttpRequest) => Promise<HttpResponse>;
  cache: Map<string, { value: string; expires: number }>;
  onLog?: (message: string) => void;
  maxRequests?: number;
  now?: () => number;
}

type Step =
  | { kind: 'http'; sig: string; res: HttpResponse | { error: string } }
  | { kind: 'cache-get'; key: string; value: string | undefined };

class Pending extends Error { constructor() { super('pending host request'); } }

// jco reads `.payload` as the error value of result<_, E>
const asError = (message: string) => Object.assign(new Error(message), { payload: message });
const signature = (r: HttpRequest) => JSON.stringify([r.method, r.url, r.headers, r.body ? Array.from(r.body) : null]);

export async function runWithReplay<Q, R>(opts: ReplayOptions<Q, R>): Promise<R> {
  const { cache, fetchAsync, maxRequests = 12, now = Date.now } = opts;
  const memo: Step[] = [];

  for (let round = 0; round <= maxRequests; round++) {
    let cursor = 0;
    let pending: { req: HttpRequest; sig: string } | null = null;
    const logs: string[] = [];
    const writes = new Map<string, { value: string; expires: number }>();

    const host: HostImports = {
      http(req) {
        const sig = signature(req);
        const step = memo[cursor];
        if (step) {
          if (step.kind !== 'http' || step.sig !== sig) throw asError('extension is not deterministic (request changed on replay)');
          cursor++;
          if ('error' in step.res) throw asError(step.res.error);
          return step.res;
        }
        if (!pending) pending = { req, sig };
        throw new Pending();
      },
      browserFetch() { throw asError('browser-fetch is not supported on web'); },
      log(message) { logs.push(message); },
      cacheGet(key) {
        const step = memo[cursor];
        if (step) {
          if (step.kind !== 'cache-get' || step.key !== key) throw asError('extension is not deterministic (cache read changed on replay)');
          cursor++;
          return step.value;
        }
        if (pending) return undefined;
        const own = writes.get(key) ?? cache.get(key);
        const value = own && own.expires > now() ? own.value : undefined;
        memo.push({ kind: 'cache-get', key, value });
        cursor++;
        return value;
      },
      cacheSet(key, value, ttl) {
        writes.set(key, { value, expires: now() + Math.min(Math.max(ttl, 0), 3600) * 1000 });
      },
    };

    let result: R | undefined;
    let failure: unknown;
    try {
      const servers = await opts.instantiate(host);
      result = servers(opts.query);
    } catch (e) {
      failure = e;
    }

    if (pending) {
      const { req, sig } = pending as { req: HttpRequest; sig: string };
      let res: HttpResponse | { error: string };
      try { res = await fetchAsync(req); } catch (e) { res = { error: String((e as Error)?.message ?? e).slice(0, 300) }; }
      memo.push({ kind: 'http', sig, res });
      continue;
    }

    if (failure) {
      const e = failure as { payload?: unknown; message?: string };
      throw new Error(String(e.payload ?? e.message ?? failure).slice(0, 300));
    }
    for (const line of logs) opts.onLog?.(line);
    for (const [k, v] of writes) cache.set(k, v);
    return result as R;
  }
  throw new Error('extension made too many requests');
}
