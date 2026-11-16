import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  FastForward,
  Gauge,
  ListVideo,
  Maximize2,
  MonitorUp,
  RefreshCw,
  Server,
  Settings,
  Subtitles,
  Volume2,
  X,
} from 'lucide-react';
import { useApp, type VideoPlaybackTarget } from '../context/AppContext';
import { recordDiagnostic } from '../data/diagnostics';
import { messageFor } from '../resolver';
import { Anime, Episode, ServerOption } from '../types/anime';
import { selectAiredEpisodes } from '../utils/episodeAvailability';
import { getAnimeAniListId } from '../utils/animeData';
import { fetchMediaIndexEpisodes, fetchMediaIndexSkip, MediaIndexSkipData } from '../utils/mediaIndexApi';
import {
  enabledServerIds,
  orderServerOptions,
  preferredServerOption,
  resolveServerOrder,
  serverFallbackNotice,
  webServerOptions,
} from '../utils/providerOptions';
import { resolveEpisode } from '../utils/workerApi';
import { displayAnimeTitle } from '../utils/animePreferences';

interface Props {
  anime: Anime;
  initialEpisodeNumber: number;
  initialAudioMode?: 'SUB' | 'DUB';
  initialServerId?: string;
  watchSession: VideoPlaybackTarget['watchSession'];
  onClose: () => void;
}

type Panel = 'episodes' | 'sources' | 'settings' | null;

export const VideoPlayer: React.FC<Props> = ({
  anime,
  initialEpisodeNumber,
  initialAudioMode = 'SUB',
  initialServerId,
  watchSession,
  onClose,
}) => {
  const { settings, updateSettings, updateWatchProgress, playAnimeEpisode } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hlsRecoveryRef = useRef(0);

  const [currentEpisodeNumber, setCurrentEpisodeNumber] = useState(initialEpisodeNumber);
  const [audioMode, setAudioMode] = useState<'SUB' | 'DUB'>(initialAudioMode);
  const [panel, setPanel] = useState<Panel>(null);
  const [realEpisodes, setRealEpisodes] = useState<Episode[]>(anime.seasons[0]?.episodes || []);
  const [streamUrl, setStreamUrl] = useState('');
  const [embedUrl, setEmbedUrl] = useState('');
  const [embedProviderId, setEmbedProviderId] = useState('');
  const [embedSupportsProgress, setEmbedSupportsProgress] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);
  const [serverNonce, setServerNonce] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [playbackSpeed, setPlaybackSpeed] = useState(settings.playbackSpeed || 1);
  const [screenSize, setScreenSize] = useState<'Fit' | 'Crop' | 'Fill'>(settings.screenFit || 'Fit');
  const [skipData, setSkipData] = useState<MediaIndexSkipData | null>(null);
  const [toast, setToast] = useState('');
  const [subtitles, setSubtitles] = useState<Array<{ language: string; label: string; url: string; default?: boolean }>>([]);
  const [selectedSubLanguage, setSelectedSubLanguage] = useState(settings.preferredSubLanguage || 'English');
  const [qualityLevels, setQualityLevels] = useState<Array<{ index: number; label: string }>>([]);
  const [qualityLevel, setQualityLevel] = useState(-1);

  useEffect(() => setCurrentEpisodeNumber(initialEpisodeNumber), [initialEpisodeNumber]);

  const changeEpisode = useCallback((episode: number) => {
    if (episode !== currentEpisodeNumber) void playAnimeEpisode(anime, episode, audioMode);
  }, [anime, audioMode, currentEpisodeNumber, playAnimeEpisode]);

  const serverOptions = useMemo(
    () => orderServerOptions(webServerOptions(settings.hideAdultContent), settings.serverPriority),
    [settings.hideAdultContent, settings.serverPriority],
  );
  const enabledIds = useMemo(
    () => enabledServerIds(settings.enabledServers, settings.hideAdultContent),
    [settings.enabledServers, settings.hideAdultContent],
  );
  const switchableServers = useMemo(
    () => serverOptions.filter((server) => enabledIds.includes(server.id)),
    [enabledIds, serverOptions],
  );
  const [activeServer, setActiveServer] = useState<ServerOption>(() =>
    preferredServerOption(serverOptions, initialServerId ?? settings.activeServer, enabledIds) || {
      id: 'none',
      name: 'No source',
      speed: 'Normal',
      supportsDub: false,
      supportsSub: false,
      supportsDownload: false,
    },
  );

  const activeEpisodes = useMemo(() => {
    const episodes = realEpisodes.length ? realEpisodes : anime.seasons[0]?.episodes || [];
    const seasons = anime.seasons.length
      ? anime.seasons.map((season, index) => (index === 0 ? { ...season, episodes } : season))
      : [{ id: `${anime.id}-s1`, number: 1, title: 'Season 1', year: anime.year, episodes }];
    return selectAiredEpisodes({ ...anime, seasons });
  }, [anime, realEpisodes]);

  const currentEpisode = activeEpisodes.find((episode) => episode.number === currentEpisodeNumber);
  const activeServerLabel = activeServer.name || 'Server';
  const numericAniListId = getAnimeAniListId(anime);
  const objectFitClass = screenSize === 'Fit' ? 'object-contain' : screenSize === 'Crop' ? 'object-cover' : 'object-fill';
  const canDub = switchableServers.some((server) => server.supportsDub);
  const notAiredError = /has not aired|not confirmed as available/i.test(error);
  const displayTitle = displayAnimeTitle(anime, settings.titleLanguage);

  const showToast = useCallback((message: string, durationMs = 2600) => {
    setToast(message);
    window.setTimeout(() => setToast(''), durationMs);
  }, []);

  const seek = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(seconds, duration || seconds));
    setCurrentTime(video.currentTime);
  }, [duration]);

  useEffect(() => {
    if (Number.isNaN(numericAniListId)) return;
    fetchMediaIndexEpisodes(numericAniListId).then((episodes) => {
      if (!episodes?.length) return;
      setRealEpisodes(episodes.map((episode: any) => ({
        id: `${anime.id}-ep-${episode.number}`,
        number: episode.number,
        title: episode.title || `Episode ${episode.number}`,
        durationSec: (episode.length || episode.runtime || anime.durationMins || 0) * 60,
        thumbnail: episode.image || episode.still || anime.bannerImage || anime.posterImage,
        videoUrl: '',
        synopsis: episode.description || episode.overview,
        airedDate: episode.airDate || episode.air_date,
      })));
    });
  }, [anime, numericAniListId]);

  useEffect(() => {
    if (Number.isNaN(numericAniListId)) return;
    fetchMediaIndexSkip(numericAniListId, currentEpisodeNumber).then(setSkipData);
  }, [currentEpisodeNumber, numericAniListId]);

  useEffect(() => {
    const abort = new AbortController();
    let cancelled = false;
    setIsLoading(true);
    setError('');
    setStreamUrl('');
    setEmbedUrl('');
    setEmbedProviderId('');
    setEmbedSupportsProgress(false);
    setSubtitles([]);
    setQualityLevels([]);
    setQualityLevel(-1);
    setCurrentTime(0);
    setDuration(0);

    async function loadSource() {
      if (Number.isNaN(numericAniListId)) {
        setError('This title has no AniList id, so no source can be resolved.');
        setIsLoading(false);
        return;
      }
      if (!activeEpisodes.some((episode) => episode.number === currentEpisodeNumber)) {
        const airs = anime.nextEpisode?.number === currentEpisodeNumber
          ? new Date(anime.nextEpisode.airingAt * 1000).toLocaleDateString(undefined, {
              day: 'numeric', month: 'short', year: 'numeric',
            })
          : null;
        setError(airs
          ? `Episode ${currentEpisodeNumber} has not aired yet. It is scheduled for ${airs}.`
          : `Episode ${currentEpisodeNumber} is not confirmed as available yet.`);
        setIsLoading(false);
        return;
      }

      const result = await resolveEpisode({
        aniListId: numericAniListId,
        episode: currentEpisodeNumber,
        audio: audioMode === 'DUB' ? 'dub' : 'sub',
        lang: selectedSubLanguage,
        order: resolveServerOrder(serverOptions, activeServer.id, enabledIds),
        enabled: enabledIds,
        fallback: true,
        watchSession,
      }, abort.signal);
      if (cancelled) return;
      if (!result.ok) {
        setError(messageFor(result.error));
        setIsLoading(false);
        return;
      }

      const offer = result.offer;
      const fallbackNotice = serverFallbackNotice(serverOptions, activeServer.id, offer.providerId);
      if (fallbackNotice) showToast(fallbackNotice, 4800);
      const matchedServer = serverOptions.find((server) => server.id === offer.providerId);
      if (matchedServer) setActiveServer(matchedServer);
      setSubtitles(offer.subtitles.map((subtitle, index) => ({
        language: subtitle.language,
        label: subtitle.label || subtitle.language.toUpperCase(),
        url: subtitle.url,
        default: index === 0,
      })));
      const intro = offer.skipWindows?.find((window) => window.kind === 'intro');
      const outro = offer.skipWindows?.find((window) => window.kind === 'outro');
      if (intro || outro) {
        setSkipData((previous) => ({
          ...previous,
          ...(intro ? { op: [intro.startMs / 1000, intro.endMs / 1000] as [number, number] } : {}),
          ...(outro ? { ed: [outro.startMs / 1000, outro.endMs / 1000] as [number, number] } : {}),
        }));
      }
      if (offer.embed) {
        setEmbedUrl(offer.embed.url);
        setEmbedProviderId(offer.embed.providerId || offer.providerId);
        setEmbedSupportsProgress(offer.embed.supportsProgress === true);
      }
      else if (offer.streams[0]) setStreamUrl(offer.streams[0].url);
      else setError('No enabled server returned a playable stream for this episode.');
      setIsLoading(false);
    }

    loadSource();
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [
    activeEpisodes,
    activeServer.id,
    anime.nextEpisode,
    audioMode,
    currentEpisodeNumber,
    enabledIds,
    numericAniListId,
    retryNonce,
    selectedSubLanguage,
    serverNonce,
    serverOptions,
    watchSession,
  ]);

  useEffect(() => {
    if (!embedUrl || !embedSupportsProgress || embedProviderId !== 'zoko') return;
    const origin = new URL(embedUrl).origin;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { channel?: string; type?: string; position?: number; duration?: number };
      if (!data || data.channel !== 'zokoanime') return;
      const position = Number(data.position);
      const nextDuration = Number(data.duration);
      if (Number.isFinite(position) && position >= 0) setCurrentTime(position);
      if (Number.isFinite(nextDuration) && nextDuration > 0) setDuration(nextDuration);
      if (data.type === 'play') setIsPlaying(true);
      if (data.type === 'pause') setIsPlaying(false);
      if (data.type === 'error') setError('This server could not continue playback. Retry or choose another enabled server.');
      if (data.type === 'ready') {
        iframeRef.current?.contentWindow?.postMessage({ channel: 'zokoanime', type: 'autonext', on: false }, origin);
        iframeRef.current?.contentWindow?.postMessage({ channel: 'zokoanime', type: 'autoskip', on: settings.autoSkipIntro }, origin);
        iframeRef.current?.contentWindow?.postMessage({ channel: 'zokoanime', type: 'state' }, origin);
      }
      if (data.type === 'ended') {
        setIsPlaying(false);
        if (nextDuration > 0) updateWatchProgress(anime.id, currentEpisodeNumber, nextDuration, nextDuration, audioMode);
        const next = activeEpisodes.find((episode) => episode.number === currentEpisodeNumber + 1);
        if (next && settings.autoPlayNext) changeEpisode(next.number);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [activeEpisodes, anime.id, audioMode, currentEpisodeNumber, embedProviderId, embedSupportsProgress, embedUrl, settings.autoPlayNext, settings.autoSkipIntro, updateWatchProgress]);

  useEffect(() => {
    if (!embedUrl || !embedSupportsProgress || embedProviderId !== 'animeembed') return;
    const origin = new URL(embedUrl).origin;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== iframeRef.current?.contentWindow) return;
      const message = event.data as {
        channel?: string;
        version?: number;
        event?: string;
        data?: { currentTime?: number; duration?: number };
      };
      if (message?.channel !== 'animeembed' || message.version !== 1) return;
      const position = Number(message.data?.currentTime);
      const nextDuration = Number(message.data?.duration);
      if (Number.isFinite(position) && position >= 0) setCurrentTime(position);
      if (Number.isFinite(nextDuration) && nextDuration > 0) setDuration(nextDuration);
      if (message.event === 'play') setIsPlaying(true);
      if (message.event === 'pause') setIsPlaying(false);
      if (message.event === 'error') setError('This server could not continue playback. Retry or choose another enabled server.');
      if (message.event === 'ended') {
        setIsPlaying(false);
        const finalDuration = nextDuration > 0 ? nextDuration : duration;
        if (finalDuration > 0) updateWatchProgress(anime.id, currentEpisodeNumber, finalDuration, finalDuration, audioMode);
        const next = activeEpisodes.find((episode) => episode.number === currentEpisodeNumber + 1);
        if (next && settings.autoPlayNext) changeEpisode(next.number);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [activeEpisodes, anime.id, audioMode, currentEpisodeNumber, duration, embedProviderId, embedSupportsProgress, embedUrl, settings.autoPlayNext, updateWatchProgress]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;
    const startupTimer = window.setTimeout(() => {
      setError('The stream did not start in time. Retry or choose another enabled server.');
      setIsLoading(false);
    }, 30_000);
    const clearStartupTimer = () => window.clearTimeout(startupTimer);
    const onPlaying = () => {
      clearStartupTimer();
      setIsPlaying(true);
      setIsLoading(false);
    };
    video.addEventListener('playing', onPlaying);

    const isHls = streamUrl.includes('.m3u8') || streamUrl.includes('format=hls');
    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 60 });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        hlsRecoveryRef.current = 0;
        const seen = new Set<number>();
        setQualityLevels(hls.levels
          .map((level, index) => ({ index, height: level.height }))
          .filter((level) => level.height > 0 && !seen.has(level.height) && seen.add(level.height))
          .map((level) => ({ index: level.index, label: `${level.height}p` })));
        setIsLoading(false);
        video.playbackRate = playbackSpeed;
        video.volume = volume;
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (hlsRecoveryRef.current < 2 && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hlsRecoveryRef.current += 1;
          hls.startLoad();
          return;
        }
        if (hlsRecoveryRef.current < 2 && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hlsRecoveryRef.current += 1;
          hls.recoverMediaError();
          return;
        }
        recordDiagnostic('PLAY-02', { episode: currentEpisodeNumber });
        setError('This stream could not continue. Retry or choose another enabled server.');
        setIsLoading(false);
      });
    } else {
      video.src = streamUrl;
      video.playbackRate = playbackSpeed;
      video.volume = volume;
    }

    return () => {
      clearStartupTimer();
      video.removeEventListener('playing', onPlaying);
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [currentEpisodeNumber, streamUrl]);

  useEffect(() => {
    if (!isPlaying || !skipData || !settings.autoSkipIntro) return;
    const range = [skipData.op, skipData.ed].find(
      (item) => Array.isArray(item) && currentTime >= item[0] && currentTime < item[1],
    );
    if (!range) return;
    seek(range[1] + 0.2);
    showToast('Skipped chapter');
  }, [currentTime, isPlaying, seek, settings.autoSkipIntro, showToast, skipData]);

  useEffect(() => {
    if (currentTime > 0 && duration > 0) {
      updateWatchProgress(anime.id, currentEpisodeNumber, currentTime, duration, audioMode);
    }
  }, [anime.id, audioMode, currentEpisodeNumber, currentTime, duration, updateWatchProgress]);

  const selectServer = (server: ServerOption) => {
    setActiveServer(server);
    updateSettings({ activeServer: server.id });
    setServerNonce((value) => value + 1);
  };

  const changeQuality = (level: number) => {
    setQualityLevel(level);
    if (hlsRef.current) hlsRef.current.currentLevel = level;
  };

  const episodeDuration = currentEpisode?.durationSec || (anime.durationMins > 0 ? anime.durationMins * 60 : 0);
  const markEmbedWatched = () => {
    if (!episodeDuration) return;
    updateWatchProgress(anime.id, currentEpisodeNumber, episodeDuration, episodeDuration, audioMode);
    showToast(`Episode ${currentEpisodeNumber} marked watched`);
  };

  const inSkipWindow = [skipData?.op, skipData?.ed].find(
    (range) => Array.isArray(range) && currentTime >= range[0] && currentTime < range[1],
  );

  return (
    <div ref={containerRef} className="fixed inset-0 z-[100] overflow-y-auto bg-black text-white xl:overflow-hidden">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-3 px-3 py-3 sm:px-6">
          <button type="button" onClick={onClose} className="anilife-icon-button" aria-label="Back to anime details">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white">{displayTitle}</p>
            <p className="truncate text-xs text-zinc-400">Episode {currentEpisodeNumber}{currentEpisode?.title ? ` - ${currentEpisode.title}` : ''}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setPanel(panel === 'sources' ? null : 'sources')} className="anilife-icon-button" aria-label="Choose server"><Server className="h-4 w-4" /></button>
            <button type="button" onClick={() => setPanel(panel === 'settings' ? null : 'settings')} className="anilife-icon-button" aria-label="Player settings"><Settings className="h-4 w-4" /></button>
            <button type="button" onClick={() => containerRef.current?.requestFullscreen?.()} className="anilife-icon-button" aria-label="Enter fullscreen"><Maximize2 className="h-4 w-4" /></button>
          </div>
        </div>
      </header>

      {toast && <div className="fixed left-1/2 top-20 z-[120] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-2xl border border-[var(--anilife-accent)]/40 bg-black/90 px-4 py-3 text-center text-xs font-bold leading-relaxed shadow-2xl" role="status">{toast}</div>}

      <main className="anilife-player-layout mx-auto max-w-[1680px] gap-4 p-3 sm:p-6 xl:h-[calc(100dvh-69px)] xl:overflow-hidden">
        <div className="space-y-4 xl:overflow-y-auto xl:pr-1 no-scrollbar">
          <section className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl sm:rounded-2xl" aria-label="Video player">
            {embedUrl ? (
              <iframe ref={iframeRef} src={embedUrl} title={`${displayTitle} episode ${currentEpisodeNumber}`} className="absolute inset-0 h-full w-full bg-black" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="no-referrer-when-downgrade" />
            ) : (
              <video
                ref={videoRef}
                src={streamUrl && !streamUrl.includes('.m3u8') ? streamUrl : undefined}
                className={`h-full w-full ${objectFitClass}`}
                controls
                playsInline
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                onLoadedMetadata={() => setDuration(videoRef.current?.duration || episodeDuration)}
                onVolumeChange={() => setVolume(videoRef.current?.volume ?? volume)}
                onEnded={() => {
                  setIsPlaying(false);
                  const next = activeEpisodes.find((episode) => episode.number === currentEpisodeNumber + 1);
                  if (next && settings.autoPlayNext) changeEpisode(next.number);
                }}
                onError={() => {
                  recordDiagnostic('PLAY-01', { episode: currentEpisodeNumber });
                  setError(`This browser could not play the stream from ${activeServerLabel}.`);
                  setIsLoading(false);
                }}
              >
                {subtitles.map((subtitle) => <track key={`${subtitle.language}-${subtitle.url}`} kind="subtitles" src={subtitle.url} srcLang={subtitle.language} label={subtitle.label} default={subtitle.default} />)}
              </video>
            )}

            {isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85" role="status">
                <RefreshCw className="h-7 w-7 animate-spin text-[var(--anilife-accent)]" />
                <p className="text-sm font-semibold text-zinc-300">Finding a playable source</p>
              </div>
            )}

            {error && !isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/92 p-6 text-center">
                <div className="max-w-md space-y-4">
                  <div><h2 className="text-xl font-bold">{notAiredError ? 'Episode unavailable' : 'Playback unavailable'}</h2><p className="mt-2 text-sm leading-relaxed text-zinc-400">{error}</p></div>
                  {!notAiredError && (
                    <div className="flex flex-wrap justify-center gap-2">
                      <button type="button" onClick={() => setRetryNonce((value) => value + 1)} className="anilife-button anilife-button-primary"><RefreshCw className="h-4 w-4" /> Retry</button>
                      <button type="button" onClick={() => setPanel('sources')} className="anilife-button anilife-button-secondary"><Server className="h-4 w-4" /> Choose server</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!settings.autoSkipIntro && inSkipWindow && !embedUrl && (
              <button type="button" onClick={() => seek(inSkipWindow[1] + 0.2)} className="anilife-button anilife-button-primary absolute bottom-14 right-4 z-20"><FastForward className="h-4 w-4" /> Skip chapter</button>
            )}
          </section>

          {embedUrl && (
            <aside className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs leading-relaxed text-amber-100/80" aria-label="Third-party player safety">
              Some raw server players may show third-party ads or pop-ups. For safer browsing, use{' '}
              <a className="font-semibold text-amber-100 underline underline-offset-2" href="https://brave.com/download/" target="_blank" rel="noreferrer">Brave</a>{' '}
              or <a className="font-semibold text-amber-100 underline underline-offset-2" href="https://www.mozilla.org/firefox/new/" target="_blank" rel="noreferrer">Firefox</a>{' '}
              with <a className="font-semibold text-amber-100 underline underline-offset-2" href="https://addons.mozilla.org/firefox/addon/ublock-origin/" target="_blank" rel="noreferrer">uBlock Origin</a>.
              Chromium users can use <a className="font-semibold text-amber-100 underline underline-offset-2" href="https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh" target="_blank" rel="noreferrer">uBlock Origin Lite</a>.
            </aside>
          )}

          <section className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <p className="anilife-eyebrow">Now playing</p>
              <h1 className="mt-1 truncate text-xl font-black sm:text-2xl">{displayTitle}</h1>
              <p className="mt-1 text-sm text-zinc-400">Episode {currentEpisodeNumber}{currentEpisode?.title ? ` - ${currentEpisode.title}` : ''}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setAudioMode('SUB')} className={`anilife-button ${audioMode === 'SUB' ? 'anilife-button-primary' : 'anilife-button-secondary'}`}>Sub</button>
              <button type="button" onClick={() => setAudioMode('DUB')} disabled={!canDub} title={canDub ? 'Play dubbed audio' : 'Dubbed audio is unavailable for this title'} className={`anilife-button ${audioMode === 'DUB' ? 'anilife-button-primary' : 'anilife-button-secondary'} disabled:cursor-not-allowed disabled:opacity-40`}>Dub</button>
              {embedUrl && !embedSupportsProgress && <button type="button" onClick={markEmbedWatched} disabled={!episodeDuration} title={episodeDuration ? 'Mark this episode watched' : 'Playback must report its duration first'} className="anilife-button anilife-button-secondary disabled:cursor-not-allowed disabled:opacity-40"><Check className="h-4 w-4" /> Mark watched</button>}
            </div>
          </section>
        </div>

        <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] xl:h-full">
          <div className="flex items-center justify-between border-b border-white/10 p-4">
            <div><p className="anilife-eyebrow">Season 1</p><h2 className="mt-1 font-bold">Episodes</h2></div>
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-zinc-400">{activeEpisodes.length}</span>
          </div>
          <div className="grid max-h-[52vh] min-h-0 gap-2 overflow-y-auto p-3 sm:grid-cols-2 xl:max-h-none xl:flex-1 xl:grid-cols-1">
            {activeEpisodes.map((episode) => {
              const active = episode.number === currentEpisodeNumber;
              return (
                <button type="button" key={episode.id} onClick={() => changeEpisode(episode.number)} aria-current={active ? 'true' : undefined} className={`group grid grid-cols-[96px_1fr] gap-3 rounded-xl border p-2 text-left transition-colors ${active ? 'border-[var(--anilife-accent)]/60 bg-[var(--anilife-accent)]/10' : 'border-transparent bg-white/[0.035] hover:border-white/15 hover:bg-white/[0.06]'}`}>
                  <div className="relative aspect-video overflow-hidden rounded-lg bg-zinc-900">{episode.thumbnail && <img src={episode.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />}<span className="absolute bottom-1 left-1 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-bold">EP {episode.number}</span></div>
                  <span className="min-w-0 self-center"><span className="line-clamp-2 text-xs font-semibold text-zinc-200 group-hover:text-white">{episode.title || `Episode ${episode.number}`}</span>{episode.durationSec ? <span className="mt-1 block text-[10px] text-zinc-500">{Math.round(episode.durationSec / 60)} min</span> : null}</span>
                </button>
              );
            })}
          </div>
        </aside>
      </main>

      {panel && (
        <div className="fixed inset-0 z-[110] flex justify-end bg-black/65 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && setPanel(null)}>
          <section className="h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-zinc-950 p-5 shadow-2xl" role="dialog" aria-modal="true" aria-label={`${panel} panel`}>
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">{panel === 'episodes' ? <ListVideo className="h-5 w-5 text-[var(--anilife-accent)]" /> : panel === 'sources' ? <Server className="h-5 w-5 text-[var(--anilife-accent)]" /> : <Settings className="h-5 w-5 text-[var(--anilife-accent)]" />}<h2 className="text-lg font-bold capitalize">{panel}</h2></div>
              <button type="button" onClick={() => setPanel(null)} className="anilife-icon-button" aria-label="Close panel"><X className="h-4 w-4" /></button>
            </div>

            {panel === 'sources' && (
              <div className="space-y-2">
                <p className="mb-4 text-sm leading-relaxed text-zinc-400">Anilife tries enabled servers in your preferred order and tells you when it switches. Provider names stay private.</p>
                {switchableServers.map((server) => (
                  <button type="button" key={server.id} onClick={() => selectServer(server)} className={`flex w-full items-center justify-between rounded-xl border p-4 text-left ${server.id === activeServer.id ? 'border-[var(--anilife-accent)]/60 bg-[var(--anilife-accent)]/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
                    <span><span className="block text-sm font-bold">{server.name}</span><span className="mt-1 block text-xs text-zinc-500">{[server.supportsSub && 'Sub', server.supportsDub && 'Dub'].filter(Boolean).join(' / ') || 'Playback'}</span></span>
                    {server.id === activeServer.id && <Check className="h-4 w-4 text-[var(--anilife-accent)]" />}
                  </button>
                ))}
              </div>
            )}

            {panel === 'settings' && (
              <div className="space-y-6">
                <label className="block space-y-2"><span className="flex items-center gap-2 text-sm font-bold"><Volume2 className="h-4 w-4" /> Volume</span><input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => { const next = Number(event.target.value); setVolume(next); if (videoRef.current) videoRef.current.volume = next; }} className="w-full accent-[var(--anilife-accent)]" /></label>
                <label className="block space-y-2"><span className="flex items-center gap-2 text-sm font-bold"><Gauge className="h-4 w-4" /> Playback speed</span><select value={playbackSpeed} onChange={(event) => { const next = Number(event.target.value); setPlaybackSpeed(next); updateSettings({ playbackSpeed: next }); if (videoRef.current) videoRef.current.playbackRate = next; }} className="anilife-select w-full">{[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => <option key={speed} value={speed}>{speed}x</option>)}</select></label>
                <label className="block space-y-2"><span className="flex items-center gap-2 text-sm font-bold"><MonitorUp className="h-4 w-4" /> Video fit</span><select value={screenSize} onChange={(event) => { const next = event.target.value as 'Fit' | 'Crop' | 'Fill'; setScreenSize(next); updateSettings({ screenFit: next }); }} className="anilife-select w-full"><option value="Fit">Fit</option><option value="Crop">Crop</option><option value="Fill">Fill</option></select></label>
                {qualityLevels.length > 0 && !embedUrl && <label className="block space-y-2"><span className="text-sm font-bold">Stream quality</span><select value={qualityLevel} onChange={(event) => changeQuality(Number(event.target.value))} className="anilife-select w-full"><option value={-1}>Auto</option>{qualityLevels.map((level) => <option key={level.index} value={level.index}>{level.label}</option>)}</select></label>}
                {subtitles.length > 0 && <label className="block space-y-2"><span className="flex items-center gap-2 text-sm font-bold"><Subtitles className="h-4 w-4" /> Subtitle language</span><select value={selectedSubLanguage} onChange={(event) => { setSelectedSubLanguage(event.target.value); updateSettings({ preferredSubLanguage: event.target.value }); }} className="anilife-select w-full">{[...new Set(subtitles.map((subtitle) => subtitle.language))].map((language) => <option key={language} value={language}>{language}</option>)}</select></label>}
                <label className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm font-semibold">Auto-play next episode<input type="checkbox" checked={settings.autoPlayNext} onChange={(event) => updateSettings({ autoPlayNext: event.target.checked })} className="h-5 w-5 accent-[var(--anilife-accent)]" /></label>
                <label className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm font-semibold">Auto-skip available chapters<input type="checkbox" checked={settings.autoSkipIntro} onChange={(event) => updateSettings({ autoSkipIntro: event.target.checked })} className="h-5 w-5 accent-[var(--anilife-accent)]" /></label>
              </div>
            )}

            {panel === 'episodes' && (
              <div className="space-y-2">{activeEpisodes.map((episode) => <button type="button" key={episode.id} onClick={() => { changeEpisode(episode.number); setPanel(null); }} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left ${episode.number === currentEpisodeNumber ? 'border-[var(--anilife-accent)]/60 bg-[var(--anilife-accent)]/10' : 'border-white/10 bg-white/[0.03]'}`}><span className="min-w-0"><span className="block text-xs text-zinc-500">Episode {episode.number}</span><span className="block truncate text-sm font-semibold">{episode.title || `Episode ${episode.number}`}</span></span>{episode.number === currentEpisodeNumber && <Check className="h-4 w-4 text-[var(--anilife-accent)]" />}</button>)}</div>
            )}

            <button type="button" onClick={() => setPanel(null)} className="anilife-button anilife-button-secondary mt-6 w-full justify-center">Done <ChevronDown className="h-4 w-4" /></button>
          </section>
        </div>
      )}
    </div>
  );
};
