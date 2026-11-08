import { isAttemptable, PROVIDERS } from '../resolver';
import type { ServerOption } from '../types/anime';

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
  ).map((provider) => {
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
