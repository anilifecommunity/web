import { getProvider, isAttemptable, PROVIDERS } from '../resolver';
import type { ServerOption } from '../types/anime';

export function isImplementedProvider(id: string): boolean {
  return getProvider(id)?.implemented === true;
}

/**
 * The server a new player should start on: the saved choice when it still ships an adapter,
 * otherwise the first implemented server, otherwise the first saved/available option.
 */
export function preferredServerOption(options: ServerOption[], savedId?: string): ServerOption | undefined {
  const saved = savedId ? options.find((option) => option.id === savedId) : undefined;
  if (saved && isImplementedProvider(saved.id)) return saved;
  return options.find((option) => isImplementedProvider(option.id)) ?? saved ?? options[0];
}

/**
 * Servers the web player may actually attempt.
 *
 * A provider only appears here when its web status is browser-direct, worker-metadata-only or
 * iframe. Unverified, native-only and unavailable providers stay out of the picker instead of
 * being offered and failing.
 */
export function webServerOptions(hideAdult = false): ServerOption[] {
  return PROVIDERS.filter(
    (provider) => isAttemptable(provider) && (!hideAdult || !provider.capabilities.adultOnly)
  )
    .sort((a, b) => Number(Boolean(b.implemented)) - Number(Boolean(a.implemented)))
    .map((provider) => {
    const audio = provider.capabilities.audio ?? ['sub'];
    return {
      id: provider.id,
      name: provider.displayName,
      speed: 'Normal',
      supportsSub: audio.includes('sub') || audio.includes('multi'),
      supportsDub: audio.includes('dub') || audio.includes('multi'),
      supportsDownload: false,
      badge: provider.webStatus === 'browser-direct' ? 'Direct' : provider.webStatus === 'iframe' ? 'Embed' : undefined,
    } satisfies ServerOption;
  });
}
