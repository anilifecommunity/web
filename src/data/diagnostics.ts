import { getRecord, putRecord } from './idb';

/**
 * Bounded, redacted local diagnostics.
 *
 * Nothing leaves the device. Uploads are separate opt-in controls that default to off, and no
 * endpoint is called here. Events carry a code from the Android catalogue plus primitive detail;
 * URLs, tokens, titles, referers and identifiers are stripped before storage.
 */

export interface DiagnosticEvent {
  code: string;
  at: number;
  detail?: Record<string, string | number | boolean>;
}

const MAX_EVENTS = 200;
const STORE_KEY = 'events';
const SENSITIVE = /https?:\/\/|bearer\s|token|password|secret|authorization|cookie/i;
const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i;

let buffer: DiagnosticEvent[] = [];
let loaded = false;

function sanitizeDetail(detail: Record<string, unknown> | undefined): Record<string, string | number | boolean> | undefined {
  if (!detail) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (!/^[a-z][a-z0-9_]{0,31}$/i.test(key)) continue;
    if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed || trimmed.length > 120) continue;
      if (SENSITIVE.test(trimmed) || URL_LIKE.test(trimmed)) continue;
      out[key] = trimmed;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  const stored = await getRecord<DiagnosticEvent[]>('diagnostics_local', STORE_KEY);
  if (Array.isArray(stored)) buffer = stored.slice(-MAX_EVENTS);
}

async function persist(): Promise<void> {
  await putRecord('diagnostics_local', STORE_KEY, buffer.slice(-MAX_EVENTS));
}

/** Records one redacted event. Safe to call from a catch block. */
export function recordDiagnostic(
  code: string,
  detail?: Record<string, unknown>
): void {
  const safeCode = /^[A-Z]{2,6}-\d{1,3}$/.test(code) ? code : 'APP-01';
  const safeDetail = sanitizeDetail(detail);
  const event: DiagnosticEvent = {
    code: safeCode,
    at: Date.now(),
    ...(safeDetail ? { detail: safeDetail } : {}),
  };
  buffer = [...buffer, event].slice(-MAX_EVENTS);
  void persist();
}

export async function loadDiagnostics(): Promise<DiagnosticEvent[]> {
  await ensureLoaded();
  return [...buffer];
}

export async function clearDiagnostics(): Promise<void> {
  buffer = [];
  loaded = true;
  await putRecord('diagnostics_local', STORE_KEY, []);
}

export interface DiagnosticsSummary {
  total: number;
  byCode: Record<string, number>;
  newest: number | null;
}

export async function diagnosticsSummary(): Promise<DiagnosticsSummary> {
  await ensureLoaded();
  const byCode: Record<string, number> = {};
  for (const event of buffer) byCode[event.code] = (byCode[event.code] ?? 0) + 1;
  return {
    total: buffer.length,
    byCode,
    newest: buffer.length > 0 ? buffer[buffer.length - 1].at : null,
  };
}

export async function downloadDiagnostics(): Promise<void> {
  const events = await loadDiagnostics();
  const report = {
    app: 'anilife-web',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    // Deliberately no user agent, IP, title, profile or stream URL.
    events,
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `anilife-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
