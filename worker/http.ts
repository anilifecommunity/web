const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
      ...extraHeaders,
    },
  });
}

export function fail(status: number, error: string, detail?: Record<string, unknown>): Response {
  return json({ ok: false, error, ...detail }, status);
}

export function parseInteger(value: string | null, fallback?: number): number | undefined {
  if (value === null || value === '') return fallback;
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/** Boots/tests can call this to wipe module-local state. */
export function noStoreHeaders(): Record<string, string> {
  return { 'Cache-Control': 'no-store' };
}
