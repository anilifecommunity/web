import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { HeaderNav } from './components/HeaderNav';
import { HomeFeed } from './components/HomeFeed';
import { BrowseSearch } from './components/BrowseSearch';
import { ScheduleView } from './components/ScheduleView';
import { MyListView } from './components/MyListView';
import { DownloadsView } from './components/DownloadsView';
import { AnimeDetailModal } from './components/AnimeDetailModal';
import { VideoPlayer } from './components/VideoPlayer';
import { SettingsModal } from './components/SettingsModal';
import { RandomPickModal } from './components/RandomPickModal';
import { NotificationsModal } from './components/NotificationsModal';
import { CrunchyrollProfileScreen } from './components/CrunchyrollProfileScreen';
import { AniListAuthModal } from './components/AniListAuthModal';
import { AppIntro } from './components/AppIntro';
import { FirstVisitGate } from './components/FirstVisitGate';

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
    settings,
  } = useApp();

  const [hasSelectedProfileSession, setHasSelectedProfileSession] = useState<boolean>(() => {
    try {
      return Boolean(sessionStorage.getItem('anilife_profile_selected'));
    } catch {
      return false;
    }
  });

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
          {activeTab === 'downloads' && <DownloadsView />}
        </main>
      </div>

      {}

      {}
      {showIntro && (
        <AppIntro
          onFinish={() => {
            setShowIntro(false);
          }}
        />
      )}

      {}
      {!showIntro && (!hasSelectedProfileSession || showProfileModal) && (
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

      {}
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
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <FirstVisitGate>
        <AppContent />
      </FirstVisitGate>
    </AppProvider>
  );
}
