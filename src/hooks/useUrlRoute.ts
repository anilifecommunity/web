import { useEffect, useRef } from 'react';
import { convertAniListToAnime, useApp } from '../context/AppContext';
import { fetchAniListMediaById } from '../utils/anilistApi';
import type { Anime } from '../types/anime';
import { parseRoute, shouldPushRoute, TAB_PATHS } from './urlRoute';
import { displayAnimeTitle, isAnimeVisible } from '../utils/animePreferences';
import { isDiscordActivity } from '../discord/activity';
import { loadWatchSession, removeWatchSession, validateWatchSession, watchSessionPath } from '../utils/workerApi';

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
      const activityPrefix = isDiscordActivity() ? '/activity' : '';
      const withActivity = (path: string) => activityPrefix + (path === '/' ? '' : path);
      const loadAnime = async (id: string): Promise<Anime | undefined> => {
        let anime = findLocalAnime(id, app.liveCatalog);
        if (/^\d+$/.test(id)) {
          const media = await fetchAniListMediaById(Number(id)).catch(() => null);
          if (media) anime = convertAniListToAnime(media);
        }
        return anime;
      };

      try {
        app.setRouteError(null);
        app.setShowSettingsModal(false);
        app.setShowProfileModal(false);
        app.setSelectedAnime(null);
        app.setActiveVideo(null);

        if (route.kind === 'tab') {
          app.setActiveTab(route.tab);
          const canonical = withActivity(TAB_PATHS[route.tab]);
          if (window.location.pathname !== canonical) {
            window.history.replaceState(null, '', canonical);
          }
        } else if (route.kind === 'settings') {
          app.setShowSettingsModal(true);
        } else if (route.kind === 'profiles') {
          app.setShowProfileModal(true);
        } else if (route.kind === 'watch') {
          const session = loadWatchSession(route.reference);
          if (!session || session.episode !== route.episode || session.tag !== route.tag) {
            app.setRouteError('This protected watch link is unavailable in this browser session. Open the anime page to start a new session.');
            return;
          }
          const validation = await validateWatchSession(session);
          if (!validation.ok || validation.aniListId !== session.aniListId || validation.episode !== route.episode) {
            if (validation.status === 403 || validation.status === 410) removeWatchSession(route.reference);
            const recoveryAnime = await loadAnime(String(session.aniListId));
            if (recoveryAnime) app.setSelectedAnime(recoveryAnime);
            app.setRouteError(
              validation.status === 410
                ? 'Your watch link has expired. Close this message and start the episode again from the anime page.'
                : 'This protected watch link is invalid for the current browser session.'
            );
            return;
          }
          const anime = await loadAnime(String(validation.aniListId));
          if (cancelled) return;
          if (!anime || !isAnimeVisible(anime, app.settings.hideAdultContent)) {
            app.setRouteError('This title is unavailable or hidden by your content preference.');
            return;
          }
          app.rememberAnime(anime);
          app.setActiveVideo({
            anime,
            episodeNumber: route.episode,
            audioMode: app.settings.defaultAudioMode ?? 'SUB',
            serverId: app.settings.activeServer,
            watchSession: session,
          });
        } else if (route.kind === 'anime' || route.kind === 'legacyWatch') {
          const anime = await loadAnime(route.id);
          if (cancelled) return;
          if (!anime) {
            app.setRouteError(
              'That title could not be found. Check the link or search for the anime again.'
            );
            app.setActiveTab('home');
            window.history.replaceState(null, '', withActivity('/'));
            return;
          }
          if (!isAnimeVisible(anime, app.settings.hideAdultContent)) {
            app.setRouteError('This title is hidden by your adult-content preference.');
            app.setActiveTab('home');
            window.history.replaceState(null, '', withActivity('/'));
            return;
          }
          app.rememberAnime(anime);
          app.setSelectedAnime(anime);
          if (route.kind === 'legacyWatch') {
            window.history.replaceState(null, '', withActivity(`/anime/${anime.id}`));
          }
        } else {
          app.setActiveTab('home');
        }
      } finally {
        window.setTimeout(() => {
          suppress.current = false;
        }, 0);
      }
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
      path = watchSessionPath(app.activeVideo.watchSession);
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

    if (isDiscordActivity()) path = `/activity${path === '/' ? '' : path}`;

    document.title = `${title} · Anilife`;

    if (path === window.location.pathname) return;
    if (shouldPushRoute(window.location.pathname, path)) window.history.pushState(null, '', path);
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

