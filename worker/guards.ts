/**
 * Outbound request guards.
 *
 * Resolver adapters never accept a caller-supplied destination. Each adapter names one fixed
 * HTTPS origin; this module enforces that, validates every redirect hop, caps the response size
 * and the time spent, and refuses loopback/private hosts even if a redirect points there.
 */

export type GuardReason =
  | 'invalid_url'
  | 'scheme_not_allowed'
  | 'host_not_allowed'
  | 'private_host'
  | 'too_many_redirects'
  | 'response_too_large'
  | 'timeout'
  | 'upstream_error';

export class GuardError extends Error {
  readonly reason: GuardReason;

  constructor(reason: GuardReason, message?: string) {
    super(message ?? reason);
    this.name = 'GuardError';
    this.reason = reason;
  }
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return true;
  if (host === '::1' || host === '0.0.0.0' || host === '::') return true;
  if (IPV4.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (host.includes(':')) return true;
  return false;
}

export function validateUpstreamUrl(raw: string, allowedHosts: ReadonlySet<string>): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new GuardError('invalid_url');
  }
  if (url.protocol !== 'https:') throw new GuardError('scheme_not_allowed');
  if (url.username || url.password) throw new GuardError('invalid_url');
  if (url.port && url.port !== '443') throw new GuardError('host_not_allowed');
  const host = url.hostname.toLowerCase();
  if (isPrivateHostname(host)) throw new GuardError('private_host');
  if (!allowedHosts.has(host)) throw new GuardError('host_not_allowed');
  return url;
}

export interface GuardOptions {
  allowedHosts: ReadonlySet<string>;
  maxRedirects?: number;
  maxBytes?: number;
  timeoutMs?: number;
}

export class RequestBodyError extends Error {
  readonly reason: 'invalid_content_type' | 'invalid_json' | 'request_too_large';

  constructor(reason: RequestBodyError['reason']) {
    super(reason);
    this.name = 'RequestBodyError';
    this.reason = reason;
  }
}

const DEFAULT_MAX_BYTES = 1024 * 1024;

/**
 * Fetches a fixed-origin HTTPS resource with manual redirect handling.
 * The caller's signal (if any) and the internal timeout both abort the request.
 */
export async function safeFetch(
  raw: string,
  init: RequestInit,
  options: GuardOptions
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 3;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const external = init.signal;
  const forwardAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', forwardAbort);
  }

  let current = validateUpstreamUrl(raw, options.allowedHosts);

  try {
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      const response = await fetch(current.toString(), {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          // Never let an upstream response or a caller smuggle credentials along.
          ...(current.username || current.password ? { Authorization: '' } : {}),
        },
        redirect: 'manual',
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new GuardError('upstream_error', 'redirect without location');
        const next = new URL(location, current).toString();
        await response.body?.cancel().catch(() => undefined);
        current = validateUpstreamUrl(next, options.allowedHosts);
        continue;
      }

      const body = await readBytesCapped(response, maxBytes, controller.signal);
      const headers = new Headers(response.headers);
      headers.delete('content-encoding');
      headers.delete('content-length');
      const bodyAllowed = init.method !== 'HEAD' && ![101, 204, 205, 304].includes(response.status);
      return new Response(bodyAllowed ? body : null, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    throw new GuardError('too_many_redirects');
  } catch (error) {
    if (error instanceof GuardError) throw error;
    if (controller.signal.aborted) throw new GuardError('timeout');
    throw new GuardError('upstream_error');
  } finally {
    clearTimeout(timer);
    if (external) external.removeEventListener('abort', forwardAbort);
  }
}

async function readBytesCapped(
  source: Pick<Response, 'headers' | 'body'>,
  maxBytes: number,
  signal?: AbortSignal
): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(source.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new GuardError('response_too_large');

  if (!source.body) return new Uint8Array();

  const reader = source.body.getReader();
  const chunks: Uint8Array<ArrayBufferLike>[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await readChunk(reader, signal);
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new GuardError('response_too_large');
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal?: AbortSignal
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (!signal) return reader.read();
  if (signal.aborted) throw new Error('aborted');
  return new Promise((resolve, reject) => {
    const aborted = () => {
      void reader.cancel().catch(() => undefined);
      reject(new Error('aborted'));
    };
    signal.addEventListener('abort', aborted, { once: true });
    reader.read().then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}

/** Reads a response body while enforcing a hard byte ceiling. */
export async function readTextCapped(response: Response, maxBytes: number): Promise<string> {
  return new TextDecoder().decode(await readBytesCapped(response, maxBytes));
}

export async function readJsonCapped(response: Response, maxBytes: number): Promise<unknown> {
  const text = await readTextCapped(response, maxBytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new GuardError('upstream_error', 'invalid json');
  }
}

/** Reads a JSON request without trusting Content-Length or buffering an unbounded body. */
export async function readRequestJsonCapped<T>(request: Request, maxBytes: number): Promise<T> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json' && !contentType?.endsWith('+json')) {
    throw new RequestBodyError('invalid_content_type');
  }
  let text: string;
  try {
    text = new TextDecoder().decode(await readBytesCapped(request, maxBytes));
  } catch (error) {
    if (error instanceof GuardError && error.reason === 'response_too_large') {
      throw new RequestBodyError('request_too_large');
    }
    throw error;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new RequestBodyError('invalid_json');
  }
}

/** Reads a raw request body with the same hard ceiling used by the signed release publisher. */
export async function readRequestBytesCapped(request: Request, maxBytes: number): Promise<ArrayBuffer> {
  try {
    const bytes = await readBytesCapped(request, maxBytes);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } catch (error) {
    if (error instanceof GuardError && error.reason === 'response_too_large') {
      throw new RequestBodyError('request_too_large');
    }
    throw error;
  }
}

