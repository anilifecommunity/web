import { useEffect, useRef } from 'react';
import { convertAniListToAnime, useApp } from '../context/AppContext';
import { fetchAniListMediaById } from '../utils/anilistApi';
import type { Anime } from '../types/anime';
import { parseRoute, TAB_PATHS } from './urlRoute';
import { canWatchEpisode } from '../utils/episodeAvailability';
import { displayAnimeTitle, isAnimeVisible } from '../utils/animePreferences';

function findLocalAnime(id: string, catalog: Anime[]): Anime | undefined {
  return catalog.find((anime) => anime.id === id);
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

      app.setRouteError(null);
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
        if (/^\d+$/.test(route.id)) {
          const media = await fetchAniListMediaById(Number(route.id)).catch(() => null);
          if (media) anime = convertAniListToAnime(media);
        }
        if (!anime) {
          const media = await fetchAniListMediaById(Number(route.id)).catch(() => null);
          if (media) anime = convertAniListToAnime(media);
        }
        if (cancelled) return;
        if (!anime) {
          app.setRouteError(
            'That title could not be found. Check the link or search for the anime again.'
          );
          app.setActiveTab('home');
          window.history.replaceState(null, '', '/');
          return;
        }
        if (!isAnimeVisible(anime, app.settings.hideAdultContent)) {
          app.setRouteError('This title is hidden by your adult-content preference.');
          app.setActiveTab('home');
          window.history.replaceState(null, '', '/');
          return;
        }
        app.rememberAnime(anime);
        if (route.kind === 'anime') {
          app.setSelectedAnime(anime);
        } else {
          if (!canWatchEpisode(anime, route.episode)) {
            app.setRouteError(
              anime.nextEpisode?.number === route.episode
                ? `Episode ${route.episode} has not aired yet.`
                : `Episode ${route.episode} is not confirmed as available yet.`
            );
            app.setSelectedAnime(anime);
            window.history.replaceState(null, '', `/anime/${anime.id}`);
          } else {
            app.setActiveVideo({
              anime,
              episodeNumber: route.episode,
              audioMode: app.settings.defaultAudioMode ?? 'SUB',
              serverId: app.settings.activeServer,
            });
          }
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
      title = `${displayAnimeTitle(app.activeVideo.anime, app.settings.titleLanguage)} · Episode ${app.activeVideo.episodeNumber}`;
    } else if (app.selectedAnime) {
      path = `/anime/${app.selectedAnime.id}`;
      title = displayAnimeTitle(app.selectedAnime, app.settings.titleLanguage);
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
                : app.activeTab === 'downloads'
                  ? 'Downloads'
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
    app.settings.titleLanguage,
  ]);
}

