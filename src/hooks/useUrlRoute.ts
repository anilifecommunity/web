import { useEffect, useRef } from 'react';
import { convertAniListToAnime, useApp } from '../context/AppContext';
import { ANIME_CATALOG } from '../utils/animeData';
import { fetchAniListMediaById } from '../utils/anilistApi';
import type { Anime } from '../types/anime';

type Tab = 'home' | 'search' | 'schedule' | 'mylist';

type Route =
  | { kind: 'tab'; tab: Tab }
  | { kind: 'anime'; id: string }
  | { kind: 'watch'; id: string; episode: number }
  | { kind: 'settings' }
  | { kind: 'profiles' }
  | { kind: 'home' };

const TAB_PATHS: Record<Tab, string> = {
  home: '/',
  search: '/discover',
  schedule: '/schedule',
  mylist: '/library',
};

function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { kind: 'tab', tab: 'home' };

  const [first, second, , fourth] = parts;
  if (first === 'anime' && second) {
    if (parts.length >= 4 && parts[2] === 'watch') {
      const episode = Number(fourth);
      return { kind: 'watch', id: second, episode: Number.isFinite(episode) && episode > 0 ? episode : 1 };
    }
    return { kind: 'anime', id: second };
  }
  if (first === 'settings') return { kind: 'settings' };
  if (first === 'profiles') return { kind: 'profiles' };
  if (first === 'search' || first === 'discover') return { kind: 'tab', tab: 'search' };
  if (first === 'schedule') return { kind: 'tab', tab: 'schedule' };
  if (first === 'library' || first === 'mylist') return { kind: 'tab', tab: 'mylist' };
  if (first === 'downloads') return { kind: 'tab', tab: 'home' };
  if (first === 'home') return { kind: 'tab', tab: 'home' };
  return { kind: 'home' };
}

function findLocalAnime(id: string, catalog: Anime[]): Anime | undefined {
  return catalog.find((anime) => anime.id === id) || ANIME_CATALOG.find((anime) => anime.id === id);
}

/**
 * Keeps the address bar and the app state in step.
 *
 * Tabs and modals get real paths so reload, deep links and back/forward all work. Opening a deeper
 * route pushes history; closing it replaces, so back never walks through a stack of closed dialogs.
 */
export function useUrlRoute(): void {
  const app = useApp();
  const suppress = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const apply = async () => {
      suppress.current = true;
      const route = parseRoute(window.location.pathname);

      app.setShowSettingsModal(false);
      app.setShowProfileModal(false);
      app.setSelectedAnime(null);
      app.setActiveVideo(null);

      if (route.kind === 'tab') {
        app.setActiveTab(route.tab);
        const canonical = TAB_PATHS[route.tab];
        if (window.location.pathname !== canonical) {
          window.history.replaceState(null, '', canonical);
        }
      } else if (route.kind === 'settings') {
        app.setShowSettingsModal(true);
      } else if (route.kind === 'profiles') {
        app.setShowProfileModal(true);
      } else if (route.kind === 'anime' || route.kind === 'watch') {
        let anime = findLocalAnime(route.id, app.liveCatalog);
        if (!anime) {
          const media = await fetchAniListMediaById(Number(route.id)).catch(() => null);
          if (media) anime = convertAniListToAnime(media);
        }
        if (cancelled) return;
        if (!anime) {
          app.setActiveTab('home');
          window.history.replaceState(null, '', '/');
          return;
        }
        app.rememberAnime(anime);
        if (route.kind === 'anime') {
          app.setSelectedAnime(anime);
        } else {
          app.setActiveVideo({
            anime,
            episodeNumber: route.episode,
            audioMode: app.settings.defaultAudioMode ?? 'SUB',
            serverId: app.settings.activeServer,
          });
        }
      } else {
        app.setActiveTab('home');
      }

      window.setTimeout(() => {
        suppress.current = false;
      }, 0);
    };

    void apply();
    const onPopState = () => {
      void apply();
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      cancelled = true;
      window.removeEventListener('popstate', onPopState);
    };
    // The route applier runs once; state changes are written by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (suppress.current) return;

    let path: string;
    let title = 'Anilife';
    if (app.activeVideo) {
      path = `/anime/${app.activeVideo.anime.id}/watch/${app.activeVideo.episodeNumber}`;
      title = `${app.activeVideo.anime.title} · Episode ${app.activeVideo.episodeNumber}`;
    } else if (app.selectedAnime) {
      path = `/anime/${app.selectedAnime.id}`;
      title = app.selectedAnime.title;
    } else if (app.showSettingsModal) {
      path = '/settings';
      title = 'Settings';
    } else if (app.showProfileModal) {
      path = '/profiles';
      title = 'Profiles';
    } else {
      path = TAB_PATHS[app.activeTab];
      title =
        app.activeTab === 'home'
          ? 'Anime Streaming'
          : app.activeTab === 'search'
            ? 'Discover'
            : app.activeTab === 'schedule'
              ? 'Schedule'
              : app.activeTab === 'mylist'
                ? 'My List'
                : 'Anilife';
    }

    document.title = `${title} · Anilife`;

    if (path === window.location.pathname) return;
    const deeper =
      path.split('/').filter(Boolean).length > window.location.pathname.split('/').filter(Boolean).length;
    if (deeper) window.history.pushState(null, '', path);
    else window.history.replaceState(null, '', path);
  }, [
    app.activeTab,
    app.selectedAnime,
    app.activeVideo,
    app.showSettingsModal,
    app.showProfileModal,
  ]);
}

