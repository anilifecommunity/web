import React, { lazy, Suspense, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { HeaderNav } from './components/HeaderNav';
import { HomeFeed } from './components/HomeFeed';
import { FirstVisitGate } from './components/FirstVisitGate';
import { useUrlRoute } from './hooks/useUrlRoute';
import { useDiscordActivity } from './discord/useDiscordActivity';
import { X } from 'lucide-react';
import { markAboutNoticeSeen, shouldShowAboutNotice } from './utils/notice';
import { ErrorExperience } from './components/ErrorExperience';

const BrowseSearch = lazy(() => import('./components/BrowseSearch').then((module) => ({ default: module.BrowseSearch })));
const ScheduleView = lazy(() => import('./components/ScheduleView').then((module) => ({ default: module.ScheduleView })));
const MyListView = lazy(() => import('./components/MyListView').then((module) => ({ default: module.MyListView })));
const DownloadsPage = lazy(() => import('./components/DownloadsPage').then((module) => ({ default: module.DownloadsPage })));
const AnimeDetailModal = lazy(() => import('./components/AnimeDetailModal').then((module) => ({ default: module.AnimeDetailModal })));
const VideoPlayer = lazy(() => import('./components/VideoPlayer').then((module) => ({ default: module.VideoPlayer })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then((module) => ({ default: module.SettingsModal })));
const RandomPickModal = lazy(() => import('./components/RandomPickModal').then((module) => ({ default: module.RandomPickModal })));
const CrunchyrollProfileScreen = lazy(() => import('./components/CrunchyrollProfileScreen').then((module) => ({ default: module.CrunchyrollProfileScreen })));
const AniListAuthModal = lazy(() => import('./components/AniListAuthModal').then((module) => ({ default: module.AniListAuthModal })));
const AppIntro = lazy(() => import('./components/AppIntro').then((module) => ({ default: module.AppIntro })));

const LoadingSurface = () => (
  <div className="flex min-h-48 items-center justify-center text-sm text-zinc-400" role="status">
    Loading Anilife...
  </div>
);

const UrlRouteSync: React.FC = () => {
  useUrlRoute();
  return null;
};

const AppContent: React.FC = () => {
  const {
    activeTab,
    selectedAnime,
    setSelectedAnime,
    activeVideo,
    setActiveVideo,
    showSettingsModal,
    setShowSettingsModal,
    showRandomModal,
    setShowRandomModal,
    showProfileModal,
    setShowProfileModal,
    showAuthModal,
    setShowAuthModal,
    showIntro,
    setShowIntro,
    routeError,
    setRouteError,
    settings,
  } = useApp();

  useDiscordActivity();

  const [hasSelectedProfileSession, setHasSelectedProfileSession] = useState<boolean>(() => {
    if (settings.multiProfileEnabled === false) return true;
    try {
      return Boolean(sessionStorage.getItem('anilife_profile_selected'));
    } catch {
      return false;
    }
  });

  const [showAboutNotice, setShowAboutNotice] = useState<boolean>(() => shouldShowAboutNotice());

  const dismissAboutNotice = () => {
    markAboutNoticeSeen();
    setShowAboutNotice(false);
  };

  const hasBlockingOverlay = Boolean(
    selectedAnime ||
      activeVideo ||
      showSettingsModal ||
      showRandomModal ||
      showAuthModal ||
      showProfileModal ||
      routeError ||
      (showAboutNotice && hasSelectedProfileSession && !showIntro)
  );

  return (
    <div className={`relative text-zinc-100 flex flex-col font-sans selection:bg-[var(--anilife-accent)] selection:text-black ${hasBlockingOverlay ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      {}
      <div
        className="fixed inset-0 z-0 pointer-events-none transition-colors duration-500"
        style={{
          backgroundColor: settings.canvasBackground === 'amoled' ? '#000000' : '#121214'
        }}
      />

      {}
      {settings.backdropSource !== 'none' && settings.backdropImage && (
        <>
          <div
            className="fixed inset-0 z-0 bg-cover bg-center pointer-events-none transition-all duration-700"
            style={{
              backgroundImage: `url(${settings.backdropImage})`,
              filter: settings.backdropBlur ? 'blur(16px)' : 'none',
              transform: settings.backdropBlur ? 'scale(1.05)' : 'scale(1)',
            }}
          />
          <div
            className="fixed inset-0 z-0 pointer-events-none transition-opacity duration-300"
            style={{
              backgroundColor:
                settings.backdropDim === 'Dark'
                  ? 'rgba(0, 0, 0, 0.88)'
                  : settings.backdropDim === 'Light'
                  ? 'rgba(0, 0, 0, 0.50)'
                  : 'rgba(0, 0, 0, 0.70)',
            }}
          />
        </>
      )}

      {}
      {hasSelectedProfileSession && (
        <>
      <div
        inert={hasBlockingOverlay ? true : undefined}
        aria-hidden={hasBlockingOverlay || undefined}
        className={`relative z-10 flex flex-col min-h-screen transition-all ${
          settings.navigationLayout === 'sidebar' ? 'md:pl-16' : ''
        }`}
      >
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[250] focus:rounded-full focus:bg-[var(--anilife-accent)] focus:px-4 focus:py-2 focus:font-bold focus:text-black">
          Skip to content
        </a>
        <HeaderNav />
        <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 pt-5">
          <Suspense fallback={<LoadingSurface />}>
            {activeTab === 'home' && <HomeFeed />}
            {activeTab === 'search' && <BrowseSearch />}
            {activeTab === 'schedule' && <ScheduleView />}
            {activeTab === 'mylist' && <MyListView />}
            {activeTab === 'downloads' && <DownloadsPage />}
          </Suspense>
        </main>
      </div>
        </>
      )}

      <Suspense fallback={<LoadingSurface />}>
        {showIntro && (
          <AppIntro
            onFinish={() => {
              setShowIntro(false);
            }}
          />
        )}

      {}
      {!showIntro && ((settings.multiProfileEnabled !== false && !hasSelectedProfileSession) || showProfileModal) && (
        <CrunchyrollProfileScreen
          onSelectProfile={() => {
            setHasSelectedProfileSession(true);
            setShowProfileModal(false);
            try {
              sessionStorage.setItem('anilife_profile_selected', '1');
            } catch {}
          }}
        />
      )}
      </Suspense>

      {routeError && (
        <ErrorExperience error={routeError} onDismiss={() => setRouteError(null)} />
      )}

      {showAboutNotice && hasSelectedProfileSession && !showProfileModal && !showIntro && (
        <div
          className="fixed inset-0 z-[180] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-anilife-title"
        >
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-[#12101e] shadow-2xl">
            <button
              type="button"
              onClick={dismissAboutNotice}
              className="absolute right-3 top-3 z-10 rounded-full p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="max-h-[80vh] overflow-y-auto p-6 pr-12 sm:p-7 sm:pr-14">
              <div className="mb-4 flex items-center gap-3">
                <img
                  src="/assets/images/Anilife-Logo.png"
                  alt=""
                  className="h-10 w-10 rounded-xl object-contain"
                />
                <h2 id="about-anilife-title" className="text-lg font-bold text-white">
                  About Anilife
                </h2>
              </div>

              <div className="space-y-3 text-sm leading-relaxed text-zinc-300">
                <p>
                  Anilife does not host, upload, or store any anime content on its website or
                  servers. Instead, our platform works similarly to a search engine, discovering
                  and indexing publicly available sources from across the internet and providing
                  users with access to them for streaming.
                </p>
                <p>
                  We do not claim ownership of or affiliation with any third-party content or
                  sources displayed on our platform. Our goal is simply to make discovering and
                  accessing anime easier.
                </p>
                <p>
                  If you have any questions, concerns, copyright-related inquiries, or other
                  matters you'd like to discuss, feel free to contact our team through our
                  official Discord server.
                </p>
                <p className="font-semibold text-[var(--anilife-accent)]">Thank you for being part of Anilife.</p>
              </div>

              <button
                type="button"
                onClick={dismissAboutNotice}
                className="mt-6 w-full rounded-full bg-[var(--anilife-accent)] px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-[var(--anilife-accent-hover)] cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {}
      {hasSelectedProfileSession && (
        <Suspense fallback={<LoadingSurface />}>
      {selectedAnime && !activeVideo && (
        <AnimeDetailModal
          anime={selectedAnime}
          onClose={() => setSelectedAnime(null)}
        />
      )}

      {}
      {activeVideo && (
        <VideoPlayer
          anime={activeVideo.anime}
          initialEpisodeNumber={activeVideo.episodeNumber}
          initialAudioMode={activeVideo.audioMode}
          initialAudioFallback={activeVideo.audioFallback}
          initialDubAvailability={activeVideo.dubAvailability}
          initialServerId={activeVideo.serverId}
          watchSession={activeVideo.watchSession}
          onClose={() => setActiveVideo(null)}
        />
      )}

      {}
      {showSettingsModal && (
        <SettingsModal onClose={() => setShowSettingsModal(false)} />
      )}

      {}
      {showRandomModal && (
        <RandomPickModal onClose={() => setShowRandomModal(false)} />
      )}

      {}
      {}
      {showAuthModal && (
        <AniListAuthModal onClose={() => setShowAuthModal(false)} />
      )}
        </Suspense>
      )}
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <FirstVisitGate>
        <UrlRouteSync />
        <AppContent />
      </FirstVisitGate>
    </AppProvider>
  );
}

