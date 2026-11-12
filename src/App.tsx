import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { HeaderNav } from './components/HeaderNav';
import { HomeFeed } from './components/HomeFeed';
import { BrowseSearch } from './components/BrowseSearch';
import { ScheduleView } from './components/ScheduleView';
import { MyListView } from './components/MyListView';
import { AnimeDetailModal } from './components/AnimeDetailModal';
import { VideoPlayer } from './components/VideoPlayer';
import { SettingsModal } from './components/SettingsModal';
import { RandomPickModal } from './components/RandomPickModal';
import { NotificationsModal } from './components/NotificationsModal';
import { CrunchyrollProfileScreen } from './components/CrunchyrollProfileScreen';
import { AniListAuthModal } from './components/AniListAuthModal';
import { AppIntro } from './components/AppIntro';
import { FirstVisitGate } from './components/FirstVisitGate';
import { useUrlRoute } from './hooks/useUrlRoute';
import { useDiscordActivity } from './discord/useDiscordActivity';
import { X } from 'lucide-react';

const ABOUT_NOTICE_KEY = 'anilife_about_notice_v1';

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
    showNotificationsModal,
    setShowNotificationsModal,
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

  const [showAboutNotice, setShowAboutNotice] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ABOUT_NOTICE_KEY) !== '1';
    } catch {
      return true;
    }
  });

  const dismissAboutNotice = () => {
    try {
      localStorage.setItem(ABOUT_NOTICE_KEY, '1');
    } catch {}
    setShowAboutNotice(false);
  };

  return (
    <div className="relative min-h-screen text-zinc-100 flex flex-col font-sans selection:bg-[#74cf66] selection:text-black">
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
        className={`relative z-10 flex flex-col min-h-screen transition-all ${
          settings.navigationLayout === 'sidebar' ? 'md:pl-16' : ''
        }`}
      >
        <HeaderNav />

        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 pt-5">
          {activeTab === 'home' && <HomeFeed />}
          {activeTab === 'search' && <BrowseSearch />}
          {activeTab === 'schedule' && <ScheduleView />}
          {activeTab === 'mylist' && <MyListView />}
        </main>
      </div>
        </>
      )}

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

      {routeError && (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12101e] p-6 text-center shadow-2xl">
            <h2 className="text-lg font-bold text-white">Title not found</h2>
            <p className="mt-2 text-sm text-zinc-400">{routeError}</p>
            <button
              onClick={() => setRouteError(null)}
              className="mt-5 rounded-full bg-[#74cf66] px-5 py-2 text-sm font-bold text-black transition-colors hover:bg-[#62b956] cursor-pointer"
            >
              Back to Home
            </button>
          </div>
        </div>
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
                <p className="font-semibold text-[#74cf66]">Thank you for being part of Anilife.</p>
              </div>

              <button
                type="button"
                onClick={dismissAboutNotice}
                className="mt-6 w-full rounded-full bg-[#74cf66] px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-[#62b956] cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {}
      {hasSelectedProfileSession && (
        <>
      {selectedAnime && (
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
      {showNotificationsModal && (
        <NotificationsModal onClose={() => setShowNotificationsModal(false)} />
      )}

      {}
      {showAuthModal && (
        <AniListAuthModal onClose={() => setShowAuthModal(false)} />
      )}
        </>
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

