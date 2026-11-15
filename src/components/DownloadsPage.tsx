import React from 'react';
import { DownloadSection } from './DownloadSection';

export const DownloadsPage: React.FC = () => (
  <div className="mx-auto w-full max-w-5xl space-y-6 pb-12">
    <header className="space-y-2">
      <h1 className="text-2xl font-black text-white sm:text-3xl">Downloads</h1>
      <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
        Choose Universal if you are unsure which processor your device uses. Android TV builds
        also support compatible Fire TV devices.
      </p>
    </header>
    <DownloadSection />
  </div>
);
