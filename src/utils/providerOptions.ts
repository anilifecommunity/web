import { getProvider, isAttemptable, PROVIDERS } from '../resolver';
import type { ServerOption } from '../types/anime';

export function isImplementedProvider(id: string): boolean {
  return getProvider(id)?.implemented === true;
}

function toServerOption(providerId: string, index: number): ServerOption {
  const provider = getProvider(providerId);
  const audio = provider?.capabilities.audio ?? ['sub'];
  return {
    id: providerId,
    name: `Server ${index + 1}`,
    speed: 'Normal',
    supportsSub: audio.includes('sub') || audio.includes('multi'),
    supportsDub: audio.includes('dub') || audio.includes('multi'),
    supportsDownload: false,
  };
}

/**
 * The server a new player should start on: the saved choice when it is enabled and still ships
 * an adapter, otherwise the first implemented enabled server, otherwise the first enabled option.
 */
export function preferredServerOption(
  options: ServerOption[],
  savedId?: string,
  enabledIds?: string[]
): ServerOption | undefined {
  const enabled = enabledIds ? new Set(enabledIds) : null;
  const usable = enabled ? options.filter((option) => enabled.has(option.id)) : options;
  const saved = savedId ? usable.find((option) => option.id === savedId) : undefined;
  if (saved && isImplementedProvider(saved.id)) return saved;
  return usable.find((option) => isImplementedProvider(option.id)) ?? saved ?? usable[0];
}

/**
 * Servers the web player may actually attempt.
 *
 * A provider only appears here when its web status is browser-direct, worker-metadata-only or
 * iframe. Unverified, native-only and unavailable providers stay out of every picker instead of
 * being offered and failing.
 */
export function webServerOptions(hideAdult = false): ServerOption[] {
  return PROVIDERS.filter(
    (provider) => isAttemptable(provider) && (!hideAdult || !provider.capabilities.adultOnly)
  )
    .sort((a, b) => Number(Boolean(b.implemented)) - Number(Boolean(a.implemented)))
    .map((provider, index) => toServerOption(provider.id, index));
}

/**
 * Explicitly disabled servers stay disabled. An absent or empty list means "not configured",
 * which is treated as all web-capable servers enabled.
 */
export function enabledServerIds(
  enabledServers: string[] | undefined,
  hideAdult = false
): string[] {
  const options = webServerOptions(hideAdult);
  const configured = enabledServers ?? [];
  if (configured.length === 0) return options.map((option) => option.id);
  const allowed = new Set(options.map((option) => option.id));
  return configured.filter((id) => allowed.has(id));
}

/** Enabled servers with the preferred one first, then the viewer's configured order. */
export function resolveServerOrder(
  options: ServerOption[],
  activeId: string | undefined,
  enabledIds: string[]
): string[] {
  const allowed = new Set(enabledIds);
  const enabled = options.filter((option) => allowed.has(option.id)).map((option) => option.id);
  if (!activeId || !enabled.includes(activeId)) return enabled;
  return [activeId, ...enabled.filter((id) => id !== activeId)];
}
