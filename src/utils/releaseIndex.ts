const EXPECTED_ASSETS = [
  ['mobile-universal', 'mobile', 'universal', true, 'Anilife.apk'],
  ['mobile-arm64', 'mobile', 'arm64-v8a', false, 'Anilife_arm64-v8a.apk'],
  ['mobile-armv7', 'mobile', 'armeabi-v7a', false, 'Anilife_armeabi-v7a.apk'],
  ['tv-universal', 'tv', 'universal', true, 'Anilife_tv.apk'],
  ['tv-arm64', 'tv', 'arm64-v8a', false, 'Anilife_tv_arm64-v8a.apk'],
  ['tv-armv7', 'tv', 'armeabi-v7a', false, 'Anilife_tv_armeabi-v7a.apk'],
] as const;

const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_128 = /^[0-9a-f]{128}$/;

export interface DownloadAsset {
  id: string;
  formFactor: 'mobile' | 'tv';
  abi: 'universal' | 'arm64-v8a' | 'armeabi-v7a';
  recommended: boolean;
  name: string;
  url: string;
  sha256: string;
  sizeBytes: number;
}

export interface DownloadIndex {
  schema: 1;
  channel: 'stable';
  version: string;
  versionCode: number;
  sequence: number;
  tag: string;
  publishedAt: string;
  releaseUrl: string;
  updateEvent: { id: string; pubkey: string; sig: string };
  assets: DownloadAsset[];
}

export class DownloadIndexUnavailable extends Error {
  constructor() {
    super('The latest stable Anilife downloads are unavailable right now.');
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DownloadIndexUnavailable();
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function parseDownloadIndex(value: unknown): DownloadIndex {
  const index = record(value);
  if (index.schema !== 1 || index.channel !== 'stable') throw new DownloadIndexUnavailable();
  if (typeof index.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(index.version)) {
    throw new DownloadIndexUnavailable();
  }
  if (!positiveInteger(index.versionCode) || !positiveInteger(index.sequence)) {
    throw new DownloadIndexUnavailable();
  }
  if (index.sequence < index.versionCode || index.tag !== `v${index.version}`) {
    throw new DownloadIndexUnavailable();
  }
  if (typeof index.publishedAt !== 'string' || !Number.isFinite(Date.parse(index.publishedAt))) {
    throw new DownloadIndexUnavailable();
  }

  const prefix = 'https://github.com/anilifecommunity/android-and-tv/releases';
  if (index.releaseUrl !== `${prefix}/tag/${index.tag}`) throw new DownloadIndexUnavailable();
  const event = record(index.updateEvent);
  if (
    typeof event.id !== 'string' ||
    typeof event.pubkey !== 'string' ||
    typeof event.sig !== 'string' ||
    !HEX_64.test(event.id) ||
    !HEX_64.test(event.pubkey) ||
    !HEX_128.test(event.sig)
  ) {
    throw new DownloadIndexUnavailable();
  }

  if (!Array.isArray(index.assets) || index.assets.length !== EXPECTED_ASSETS.length) {
    throw new DownloadIndexUnavailable();
  }
  const byName = new Map<string, Record<string, unknown>>();
  for (const value of index.assets) {
    const asset = record(value);
    if (typeof asset.name !== 'string' || byName.has(asset.name)) throw new DownloadIndexUnavailable();
    byName.set(asset.name, asset);
  }

  for (const [id, formFactor, abi, recommended, name] of EXPECTED_ASSETS) {
    const asset = byName.get(name);
    if (
      !asset ||
      asset.id !== id ||
      asset.formFactor !== formFactor ||
      asset.abi !== abi ||
      asset.recommended !== recommended ||
      asset.url !== `${prefix}/download/${index.tag}/${name}` ||
      typeof asset.sha256 !== 'string' ||
      !HEX_64.test(asset.sha256) ||
      !positiveInteger(asset.sizeBytes)
    ) {
      throw new DownloadIndexUnavailable();
    }
  }

  return index as unknown as DownloadIndex;
}

export async function fetchDownloadIndex(
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch
): Promise<DownloadIndex> {
  let response: Response;
  try {
    response = await fetcher('/downloads/index.json', {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch {
    throw new DownloadIndexUnavailable();
  }
  if (!response.ok) throw new DownloadIndexUnavailable();
  try {
    return parseDownloadIndex(await response.json());
  } catch {
    throw new DownloadIndexUnavailable();
  }
}

export function formatFileSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
