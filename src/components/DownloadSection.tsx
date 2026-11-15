import React, { useEffect, useState } from 'react';
import { Check, Download, ExternalLink, RefreshCw } from 'lucide-react';
import {
  fetchDownloadIndex,
  formatFileSize,
  type DownloadAsset,
  type DownloadIndex,
} from '../utils/releaseIndex';

const LABELS: Record<string, string> = {
  'mobile-universal': 'Universal',
  'mobile-arm64': 'ARM64',
  'mobile-armv7': 'ARMv7',
  'tv-universal': 'Universal TV',
  'tv-arm64': 'ARM64 TV',
  'tv-armv7': 'ARMv7 TV',
};

const ABI_HELP: Record<DownloadAsset['abi'], string> = {
  universal: 'Works on supported devices when you are unsure which processor you have.',
  'arm64-v8a': 'For most modern 64-bit Android devices.',
  'armeabi-v7a': 'For older 32-bit Android devices.',
};

export function DownloadGroup({ title, assets, version }: { title: string; assets: DownloadAsset[]; version: string }) {
  return (
    <section className="space-y-3 rounded-2xl border border-white/5 bg-white/5 p-4" aria-labelledby={`downloads-${assets[0].formFactor}`}>
      <h3 id={`downloads-${assets[0].formFactor}`} className="text-sm font-bold text-white">{title}</h3>
      <div className="grid gap-2 sm:grid-cols-3">
        {assets.map((asset) => (
          <a
            key={asset.id}
            href={asset.url}
            className="flex min-h-32 flex-col justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 p-3 text-left transition-colors hover:border-[var(--anilife-accent)] hover:bg-white/10"
            aria-label={`Download Anilife ${version} ${LABELS[asset.id]} APK, ${formatFileSize(asset.sizeBytes)}${asset.recommended ? ', recommended' : ''}`}
          >
            <span>
              <span className="flex items-center justify-between gap-2">
                <span className="font-bold text-white">{LABELS[asset.id]}</span>
                {asset.recommended && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--anilife-accent)] px-2 py-0.5 text-[9px] font-bold text-black">
                    <Check className="h-3 w-3" /> Recommended
                  </span>
                )}
              </span>
              <span className="mt-1 block text-[10px] leading-relaxed text-zinc-400">{ABI_HELP[asset.abi]}</span>
            </span>
            <span className="flex items-center justify-between text-[11px] font-semibold text-[var(--anilife-accent)]">
              <span>{formatFileSize(asset.sizeBytes)}</span>
              <Download className="h-4 w-4" />
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

export function DownloadRelease({ index }: { index: DownloadIndex }) {
  const published = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(index.publishedAt));
  return (
    <section className="space-y-4" aria-labelledby="download-anilife-title">
      <div>
        <h2 id="download-anilife-title" className="text-sm font-bold text-white">Download Anilife</h2>
        <p className="mt-1 text-[11px] text-zinc-400">Stable {index.tag} - published {published}</p>
        <a
          href={index.releaseUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex min-h-6 items-center gap-1.5 text-xs font-semibold text-[var(--anilife-accent)] hover:underline"
        >
          Checksums and release notes <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
      <DownloadGroup title="Android" assets={index.assets.filter((asset) => asset.formFactor === 'mobile')} version={index.version} />
      <DownloadGroup title="Android TV / Fire TV" assets={index.assets.filter((asset) => asset.formFactor === 'tv')} version={index.version} />
    </section>
  );
}

export const DownloadSection: React.FC = () => {
  const [attempt, setAttempt] = useState(0);
  const [index, setIndex] = useState<DownloadIndex | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setIndex(null);
    setError(false);
    fetchDownloadIndex(controller.signal)
      .then(setIndex)
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [attempt]);

  if (error) {
    return (
      <section className="space-y-3 rounded-2xl border border-red-400/20 bg-red-400/5 p-4" aria-labelledby="download-anilife-title">
        <h2 id="download-anilife-title" className="text-sm font-bold text-white">Download Anilife</h2>
        <p className="text-xs leading-relaxed text-zinc-300" role="alert">
          The latest stable downloads are unavailable right now. No old or unverified links are shown.
        </p>
        <button
          type="button"
          onClick={() => setAttempt((value) => value + 1)}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--anilife-accent)] px-4 py-2 text-xs font-bold text-black"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </section>
    );
  }

  if (!index) {
    return (
      <section className="rounded-2xl border border-white/5 bg-white/5 p-4" aria-labelledby="download-anilife-title" aria-busy="true">
        <h2 id="download-anilife-title" className="text-sm font-bold text-white">Download Anilife</h2>
        <p className="mt-2 text-xs text-zinc-400">Loading the latest stable release...</p>
      </section>
    );
  }

  return <DownloadRelease index={index} />;
};
