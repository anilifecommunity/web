import React, { useState, useEffect, useRef, useMemo } from 'react';
import Hls from 'hls.js';
import { Anime, Episode, ServerOption } from '../types/anime';
import { useApp } from '../context/AppContext';
import { getAnimeAniListId } from '../utils/animeData';
import {
  webServerOptions,
  preferredServerOption,
  enabledServerIds,
  resolveServerOrder,
  orderServerOptions,
} from '../utils/providerOptions';
import { messageFor } from '../resolver';
import { resolveEpisode } from '../utils/workerApi';
import { recordDiagnostic } from '../data/diagnostics';
import { formatPlayerClock, formatTime, calculateProgressPercent } from '../utils/playerUtils';
import {
  fetchMediaIndexEpisodes,
  fetchMediaIndexSkip,
  MediaIndexSkipData
} from '../utils/mediaIndexApi';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  SkipForward,
  FastForward,
  Lock,
  Unlock,
  ListOrdered,
  Radio,
  Subtitles,
  Maximize2,
  Minimize2,
  Settings as SettingsIcon,
  X,
  Volume2,
  VolumeX,
  Gauge,
  Tv,
  Check,
  ChevronDown,
  Heart,
  Search,
  Sparkles
} from 'lucide-react';

interface Props {
  anime: Anime;
  initialEpisodeNumber: number;
  initialAudioMode?: 'SUB' | 'DUB';
  onClose: () => void;
}

const SPEED_STEPS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
const QUALITY_STEPS = ['Auto', '1080p', '720p', '480p', '360p'] as const;

export const VideoPlayer: React.FC<Props> = ({
  anime,
  initialEpisodeNumber,
  initialAudioMode = 'SUB',
  onClose
}) => {
  const { settings, updateSettings, updateWatchProgress } = useApp();

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [currentEpisodeNumber, setCurrentEpisodeNumber] = useState(initialEpisodeNumber);
  const [audioMode, setAudioMode] = useState<'SUB' | 'DUB'>(initialAudioMode);
  const serverOptions = useMemo(
    () => orderServerOptions(webServerOptions(settings.hideAdultContent), settings.serverPriority),
    [settings.hideAdultContent, settings.serverPriority]
  );

  const [activeServer, setActiveServer] = useState<ServerOption>(() => {
    const options = orderServerOptions(
      webServerOptions(settings.hideAdultContent),
      settings.serverPriority
    );
    return preferredServerOption(
      options,
      settings.activeServer,
      enabledServerIds(settings.enabledServers, settings.hideAdultContent)
    ) || {
      id: 'none',
      name: 'No source',
      speed: 'Normal',
      supportsDub: false,
      supportsSub: false,
      supportsDownload: false,
    };
  });

  const activeServerPosition = serverOptions.findIndex((server) => server.id === activeServer.id);
  const activeServerLabel = activeServerPosition >= 0 ? `Server ${activeServerPosition + 1}` : 'Server';
  const [retryNonce, setRetryNonce] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(1440); 
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(settings.playbackSpeed || 1.0);
  const [screenSize, setScreenSize] = useState<'Fit' | 'Crop' | 'Fill'>(settings.screenFit || 'Fit');
  const [quality, setQuality] = useState<'Auto' | '1080p' | '720p' | '480p' | '360p'>(settings.defaultQuality || 'Auto');
  const [isLocked, setIsLocked] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isFavorited, setIsFavorited] = useState(false);

  
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<'none' | 'episodes' | 'captions'>('none');

  
  const [skipData, setSkipData] = useState<MediaIndexSkipData | null>(null);
  const [skipToast, setSkipToast] = useState<string | null>(null);

  
  const [realEpisodes, setRealEpisodes] = useState<Episode[]>(() => {
    return anime.seasons[0]?.episodes || [];
  });

  
  const [streamUrl, setStreamUrl] = useState<string>('');
  const [embedUrl, setEmbedUrl] = useState<string>('');
  const [streamError, setStreamError] = useState<boolean>(false);
  const [streamErrorText, setStreamErrorText] = useState('');

  
  const [clockString, setClockString] = useState('');

  
  const [subOffsetSec, setSubOffsetSec] = useState(settings.subtitleOffsetSec || 0.0);
  const [selectedSubLanguage, setSelectedSubLanguage] = useState(settings.preferredSubLanguage || 'English');
  const [subtitles, setSubtitles] = useState<Array<{ language: string; label: string; url: string; default?: boolean }>>([]);
  const hlsRef = useRef<Hls | null>(null);
  const hlsRecoveryRef = useRef(0);

  const numericAniListId = getAnimeAniListId(anime);

  
  useEffect(() => {
    if (!isNaN(numericAniListId)) {
      fetchMediaIndexEpisodes(numericAniListId).then((eps) => {
        if (eps && eps.length > 0) {
          const mapped: Episode[] = eps.map((e: any) => ({
            id: `${anime.id}-ep-${e.number}`,
            number: e.number,
            title: e.title || `Episode ${e.number}`,
            durationSec: (e.length || e.runtime || anime.durationMins || 24) * 60,
            thumbnail: e.image || e.still || anime.bannerImage || anime.posterImage,
            videoUrl: '',
            synopsis: e.description || e.overview,
            airedDate: e.airDate || e.air_date
          }));
          setRealEpisodes(mapped);
        }
      });
    }
  }, [anime.id, numericAniListId]);

  
  useEffect(() => {
    if (!isNaN(numericAniListId)) {
      fetchMediaIndexSkip(numericAniListId, currentEpisodeNumber).then((data) => {
        setSkipData(data);
      });
    }
  }, [numericAniListId, currentEpisodeNumber]);

  
  useEffect(() => {
    setIsLoading(true);
    setStreamError(false);
    setStreamErrorText('');
    setEmbedUrl('');
    const abort = new AbortController();
    let isCancelled = false;

    async function resolveSource() {
      if (isNaN(numericAniListId)) {
        if (isCancelled) return;
        setStreamErrorText('This title has no AniList id, so no source can be resolved.');
        setStreamError(true);
        setIsLoading(false);
        return;
      }

      const enabled = enabledServerIds(settings.enabledServers, settings.hideAdultContent);
      const order = resolveServerOrder(serverOptions, activeServer.id, enabled);
      const result = await resolveEpisode(
        {
          aniListId: numericAniListId,
          episode: currentEpisodeNumber,
          audio: audioMode === 'DUB' ? 'dub' : 'sub',
          lang: selectedSubLanguage,
          order,
          enabled,
          fallback: true,
        },
        abort.signal
      );

      if (isCancelled) return;

      if (!result.ok) {
        setStreamErrorText(messageFor(result.error));
        setStreamError(true);
        setIsLoading(false);
        return;
      }

      const offer = result.offer;
      const matchedServer = serverOptions.find((server) => server.id === offer.providerId);
      if (matchedServer && matchedServer.id !== activeServer.id) {
        setActiveServer(matchedServer);
      }
      if (settings.activeServer !== offer.providerId) {
        updateSettings({ activeServer: offer.providerId });
      }
      if (offer.embed) {
        const episodeSeconds =
          realEpisodes.find((episode) => episode.number === currentEpisodeNumber)?.durationSec ||
          (anime.seasons[0]?.episodes || []).find((episode) => episode.number === currentEpisodeNumber)?.durationSec ||
          (anime.durationMins || 24) * 60;
        setEmbedUrl(offer.embed.url);
        setStreamUrl('');
        setSubtitles([]);
        // The iframe cannot report time. Record that the episode was started so it appears in
        // Continue Watching; the player offers an explicit "Mark watched" control.
        updateWatchProgress(anime.id, currentEpisodeNumber, 1, episodeSeconds);
        setIsLoading(false);
        return;
      }

      if (offer.streams.length === 0) {
        setStreamErrorText('No server returned a playable stream for this episode.');
        setStreamError(true);
        setIsLoading(false);
        return;
      }

      setStreamUrl(offer.streams[0].url);
      setSubtitles(
        offer.subtitles.map((sub, index) => ({
          language: sub.language,
          label: sub.label || sub.language.toUpperCase(),
          url: sub.url,
          default: index === 0,
        }))
      );

      const intro = offer.skipWindows?.find((window) => window.kind === 'intro');
      const outro = offer.skipWindows?.find((window) => window.kind === 'outro');
      if (intro || outro) {
        setSkipData((prev) => ({
          ...prev,
          ...(intro ? { op: [intro.startMs / 1000, intro.endMs / 1000] as [number, number] } : {}),
          ...(outro ? { ed: [outro.startMs / 1000, outro.endMs / 1000] as [number, number] } : {}),
        }));
      }

      setIsLoading(false);
    }

    resolveSource();
    return () => {
      isCancelled = true;
      abort.abort();
    };
  }, [numericAniListId, currentEpisodeNumber, audioMode, selectedSubLanguage, retryNonce]);

  
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHls = streamUrl.endsWith('.m3u8') || streamUrl.includes('.m3u8') || streamUrl.includes('format=hls');
    const startupTimer = window.setTimeout(() => {
      setStreamErrorText('The stream did not start in time. Retry or review enabled servers in Settings.');
      setStreamError(true);
      setIsLoading(false);
    }, 30_000);
    const clearStartupTimer = () => window.clearTimeout(startupTimer);
    const onPlaying = () => {
      clearStartupTimer();
      setIsPlaying(true);
      setIsLoading(false);
    };
    video.addEventListener('playing', onPlaying);

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 60
      });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        hlsRecoveryRef.current = 0;
        setIsLoading(false);
        video.playbackRate = playbackSpeed;
        video.volume = volume;
        video.muted = isMuted;
        video.play().then(() => setIsPlaying(true)).catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;

        const canRecover = hlsRecoveryRef.current < 2;
        if (canRecover && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hlsRecoveryRef.current += 1;
          hls.startLoad();
          return;
        }
        if (canRecover && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hlsRecoveryRef.current += 1;
          hls.recoverMediaError();
          return;
        }

        hls.destroy();
        hlsRef.current = null;
        recordDiagnostic('PLAY-02', { episode: currentEpisodeNumber });
        setStreamErrorText('This stream could not continue. Retry or review enabled servers in Settings.');
        setStreamError(true);
        setIsLoading(false);
      });
    } else {
      video.src = streamUrl;
      video.playbackRate = playbackSpeed;
      video.volume = volume;
      video.muted = isMuted;
      video.play().then(() => {
        setIsPlaying(true);
        setIsLoading(false);
      }).catch(() => {
        setIsLoading(false);
      });
    }

    return () => {
      clearStartupTimer();
      video.removeEventListener('playing', onPlaying);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl]);

  
  useEffect(() => {
    if (!skipData || !isPlaying) return;

    
    if (Array.isArray(skipData.op) && skipData.op.length >= 2) {
      const [opStart, opEnd] = skipData.op;
      if (currentTime >= opStart && currentTime < opEnd) {
        if (settings.autoSkipIntro) {
          handleSeek(opEnd + 0.2);
          showToast(`Skipped Intro (${formatTime(opStart)} → ${formatTime(opEnd)})`);
        }
      }
    }

    
    if (Array.isArray(skipData.ed) && skipData.ed.length >= 2) {
      const [edStart, edEnd] = skipData.ed;
      if (currentTime >= edStart && currentTime < edEnd) {
        if (settings.autoSkipIntro) {
          handleSeek(edEnd + 0.2);
          showToast(`Skipped Outro (${formatTime(edStart)} → ${formatTime(edEnd)})`);
        }
      }
    }
  }, [currentTime, skipData, settings.autoSkipIntro, isPlaying]);

  const showToast = (msg: string) => {
    setSkipToast(msg);
    setTimeout(() => setSkipToast(null), 3000);
  };

  const markEmbedWatched = () => {
    const episodeSeconds =
      realEpisodes.find((episode) => episode.number === currentEpisodeNumber)?.durationSec ||
      (anime.seasons[0]?.episodes || []).find((episode) => episode.number === currentEpisodeNumber)?.durationSec ||
      (anime.durationMins || 24) * 60;
    updateWatchProgress(anime.id, currentEpisodeNumber, episodeSeconds, episodeSeconds);
    showToast(`Marked Episode ${currentEpisodeNumber} watched`);
  };

  
  useEffect(() => {
    const updateClock = () => {
      const clock = formatPlayerClock(currentTime, duration, new Date());
      setClockString(clock.displayString);
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [currentTime, duration]);

  
  useEffect(() => {
    if (currentTime > 0) {
      updateWatchProgress(anime.id, currentEpisodeNumber, currentTime, duration);
    }
  }, [currentTime, currentEpisodeNumber, anime.id, duration]);

  
  useEffect(() => {
    if (!isPlaying || isLocked || showSettingsSheet || activeDrawer !== 'none') return;
    const hideTimer = setTimeout(() => {
      setIsControlsVisible(false);
    }, 4500);
    return () => clearTimeout(hideTimer);
  }, [isPlaying, isControlsVisible, isLocked, showSettingsSheet, activeDrawer]);

  const handleContainerClick = () => {
    if (!isLocked) {
      setIsControlsVisible(prev => !prev);
    }
  };

  const handlePlayPause = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleSeek = (newTimeSec: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(newTimeSec, duration));
    setCurrentTime(videoRef.current.currentTime);
  };

  const handleSkipButton = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (skipData?.op && currentTime >= skipData.op[0] && currentTime <= skipData.op[1]) {
      handleSeek(skipData.op[1] + 0.2);
      showToast('Skipped Opening');
    } else if (skipData?.ed && currentTime >= skipData.ed[0] && currentTime <= skipData.ed[1]) {
      handleSeek(skipData.ed[1] + 0.2);
      showToast('Skipped Ending');
    } else {
      handleSeek(currentTime + (settings.skipButtonLength || 85));
    }
  };

  const activeEpisodes = realEpisodes.length > 0 ? realEpisodes : (anime.seasons[0]?.episodes || []);
  const currentEpisode: Episode =
    activeEpisodes.find(ep => ep.number === currentEpisodeNumber) ||
    activeEpisodes[0] || {
      id: 'default',
      number: currentEpisodeNumber,
      title: `Episode ${currentEpisodeNumber}`,
      durationSec: 1440,
      thumbnail: anime.posterImage,
      videoUrl: streamUrl
    };

  
  const objectFitClass =
    screenSize === 'Fit' ? 'object-contain' : screenSize === 'Crop' ? 'object-cover' : 'object-fill';

  
  const isInOp = Array.isArray(skipData?.op) && skipData.op.length >= 2 && currentTime >= skipData.op[0] && currentTime <= skipData.op[1];
  const isInEd = Array.isArray(skipData?.ed) && skipData.ed.length >= 2 && currentTime >= skipData.ed[0] && currentTime <= skipData.ed[1];

  const nextEpisode = activeEpisodes.find((ep) => ep.number === currentEpisodeNumber + 1);

  return (
    <div className="fixed inset-0 z-[100] flex h-full w-full overflow-hidden bg-[#08080a] text-white select-none font-sans">
      {skipToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[120] px-5 py-2.5 rounded-full bg-black/80 backdrop-blur-xl border border-[#74cf66]/50 shadow-2xl text-xs sm:text-sm font-bold text-white flex items-center gap-2 animate-bounce">
          <Sparkles className="w-4 h-4 text-[#74cf66]" />
          <span>{skipToast}</span>
        </div>
      )}

      <div
        ref={containerRef}
        onClick={handleContainerClick}
        className="relative flex-1 min-w-0 h-full bg-black overflow-hidden group cursor-pointer"
      >
        {embedUrl ? (
          <iframe
            src={embedUrl}
            title={`${anime.title} Episode ${currentEpisodeNumber}`}
            className="absolute inset-0 h-full w-full bg-black"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <video
            ref={videoRef}
            src={streamUrl && !streamUrl.includes('.m3u8') ? streamUrl : undefined}
            className={`absolute inset-0 h-full w-full ${objectFitClass} transition-all duration-300`}
            onCanPlay={() => setIsLoading(false)}
            onLoadedData={() => setIsLoading(false)}
            onTimeUpdate={() => {
              if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
            }}
            onLoadedMetadata={() => {
              setIsLoading(false);
              if (videoRef.current) setDuration(videoRef.current.duration || 1440);
            }}
            onEnded={() => {
              setIsPlaying(false);
              if (settings.autoPlayNext) {
                const nextNum = currentEpisodeNumber + 1;
                if (activeEpisodes.some((ep) => ep.number === nextNum)) {
                  setCurrentEpisodeNumber(nextNum);
                  showToast(`Auto-playing Episode ${nextNum}...`);
                }
              }
            }}
            playsInline
            onError={() => {
              setIsLoading(false);
              recordDiagnostic('PLAY-01', { episode: currentEpisodeNumber });
              setStreamErrorText(`This browser could not play the stream from ${activeServerLabel}.`);
              setStreamError(true);
            }}
          >
            {subtitles.map((sub, idx) => (
              <track
                key={idx}
                kind="subtitles"
                src={sub.url}
                srcLang={sub.language}
                label={sub.label}
                default={sub.default || idx === 0}
              />
            ))}
          </video>
        )}

        <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/90 via-black/5 to-black/55" />

        {streamError && !isLoading && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/90 p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 font-bold text-xl">
              !
            </div>
            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-bold text-white">
                Stream unavailable from {activeServerLabel}
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 max-w-md">
                {streamErrorText || `Unable to load Episode ${currentEpisodeNumber}. Every enabled server was tried.`}
              </p>
              <p className="text-[11px] text-zinc-500 max-w-sm">
                Retry, or review enabled servers in Settings.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRetryNonce((value) => value + 1);
                }}
                className="px-5 py-2.5 rounded-full bg-[#74cf66] hover:bg-[#62b956] text-black font-bold text-xs sm:text-sm shadow-lg shadow-[rgba(116,207,102,0.3)] transition-transform hover:scale-105 cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm space-y-3">
            <div className="relative flex items-center justify-center">
              <div className="w-16 h-16 border-4 border-[#74cf66]/20 border-t-[#74cf66] rounded-full animate-spin" />
              <img
                src="/assets/images/Anilife-Logo.png"
                alt="Anilife"
                className="absolute w-8 h-8 rounded-full shadow-lg"
              />
            </div>
            <p className="text-xs font-semibold text-[#74cf66]">
              Finding a server for this episode
            </p>
          </div>
        )}

        {!settings.autoSkipIntro && (isInOp || isInEd) && (
          <button
            onClick={handleSkipButton}
            className="absolute bottom-28 right-6 z-40 px-5 py-2 rounded-full bg-[#74cf66] hover:bg-[#62b956] text-black font-bold text-xs sm:text-sm shadow-xl shadow-[rgba(116,207,102,0.4)] border border-[#74cf66]/50 flex items-center gap-2 animate-pulse cursor-pointer transition-transform hover:scale-105"
          >
            <FastForward className="w-4 h-4" />
            <span>{isInOp ? 'Skip Opening' : 'Skip Ending'}</span>
          </button>
        )}

        {isLocked && (
          <div className="absolute top-4 left-4 z-40">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsLocked(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-xs font-bold text-white hover:bg-black/80 cursor-pointer"
            >
              <Unlock className="w-4 h-4 text-[#74cf66]" />
              <span>Tap to unlock screen</span>
            </button>
          </div>
        )}

        {!isLocked && (
          <div
            className={`absolute inset-0 z-20 flex flex-col justify-between p-4 sm:p-6 transition-opacity duration-300 ${
              isControlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="flex items-start justify-between gap-3" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={onClose}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-md border border-white/15 text-white transition-colors hover:bg-black/70 cursor-pointer shrink-0"
                  title="Back"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <h1 className="truncate text-sm font-bold text-white sm:text-base">{anime.title}</h1>
                  <p className="truncate text-[11px] text-zinc-300 sm:text-xs">
                    EP {currentEpisodeNumber} - {currentEpisode.title}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <span className="hidden rounded bg-black/40 px-2 py-1 text-xs font-mono text-zinc-200 border border-white/10 sm:inline-block">
                  {clockString}
                </span>
                <button
                  onClick={() => setIsLocked(true)}
                  className="rounded-full p-2 text-zinc-200 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                  title="Lock controls"
                >
                  <Lock className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <button
                  onClick={() => setShowSettingsSheet(true)}
                  className="rounded-full p-2 text-zinc-200 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                  title="Player settings"
                >
                  <SettingsIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>

            <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="pointer-events-none max-w-xl">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55 sm:text-[11px]">
                  You're Watching
                </p>
                <h2 className="mt-1 truncate text-2xl font-black leading-tight text-white drop-shadow-lg sm:text-4xl">
                  {anime.title}
                </h2>
                <p className="mt-1 text-xs font-medium text-white/65 sm:text-sm">
                  Episode {currentEpisodeNumber}
                </p>
              </div>

              {embedUrl && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-white/60">
                    Use the player controls.
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white">
                      {activeServerLabel}
                    </span>
                    <button
                      onClick={markEmbedWatched}
                      className="rounded-full bg-[#74cf66] px-3 py-1.5 text-[11px] font-bold text-black transition-colors hover:bg-[#62b956] cursor-pointer"
                    >
                      Mark watched
                    </button>
                    <button
                      onClick={() => setActiveDrawer(activeDrawer === 'captions' ? 'none' : 'captions')}
                      className="rounded-full p-2 text-white/85 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                      title="Subtitles"
                    >
                      <Subtitles className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => setShowSettingsSheet(true)}
                      className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-white/20 cursor-pointer"
                    >
                      {quality}
                    </button>
                    <button
                      onClick={() => setActiveDrawer(activeDrawer === 'episodes' ? 'none' : 'episodes')}
                      className="rounded-full p-2 text-white/85 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                      title="Episodes"
                    >
                      <ListOrdered className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )}

              <div className={embedUrl ? 'hidden' : 'space-y-4'}>
              <div className="flex items-center gap-3">
                <span className="w-11 text-right text-[11px] font-mono text-zinc-200">
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  step="0.5"
                  value={currentTime}
                  onChange={(e) => handleSeek(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-[#74cf66] focus:outline-none"
                />
                <span className="w-11 text-[11px] font-mono text-zinc-400">
                  {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 sm:gap-2.5">
                  <button
                    onClick={() => handleSeek(currentTime - 10)}
                    className="rounded-full p-2 text-white/85 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                    title="Rewind 10 seconds"
                  >
                    <RotateCcw className="h-5 w-5 sm:h-6 sm:w-6" />
                  </button>
                  <button
                    onClick={handlePlayPause}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-[#74cf66] text-black shadow-xl shadow-[rgba(116,207,102,0.35)] transition-transform hover:scale-105 active:scale-95 cursor-pointer sm:h-12 sm:w-12"
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <Pause className="h-5 w-5 fill-black sm:h-6 sm:w-6" />
                    ) : (
                      <Play className="h-5 w-5 translate-x-0.5 fill-black sm:h-6 sm:w-6" />
                    )}
                  </button>
                  <button
                    onClick={() => handleSeek(0)}
                    className="rounded-full p-2 text-white/85 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                    title="Restart episode"
                  >
                    <SkipBack className="h-5 w-5 sm:h-6 sm:w-6" />
                  </button>
                  <button
                    onClick={() => {
                      if (currentEpisodeNumber > 1) setCurrentEpisodeNumber(currentEpisodeNumber - 1);
                    }}
                    disabled={currentEpisodeNumber <= 1}
                    className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 cursor-pointer"
                    title="Previous episode"
                  >
                    <SkipBack className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>
                  <button
                    onClick={() => {
                      const nextNum = currentEpisodeNumber + 1;
                      if (activeEpisodes.some((ep) => ep.number === nextNum)) setCurrentEpisodeNumber(nextNum);
                    }}
                    disabled={!nextEpisode}
                    className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 cursor-pointer"
                    title="Next episode"
                  >
                    <SkipForward className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>
                  <button
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.muted = !isMuted;
                        setIsMuted(!isMuted);
                      }
                    }}
                    className="rounded-full p-2 text-white/85 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <VolumeX className="h-5 w-5 text-red-400" /> : <Volume2 className="h-5 w-5" />}
                  </button>
                  <div className="ml-1 hidden min-w-0 flex-col sm:flex">
                    <span className="truncate text-xs font-bold text-white">{anime.title}</span>
                    <span className="truncate text-[10px] text-zinc-400">Episode {currentEpisodeNumber}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 sm:gap-2">
                  {embedUrl && (
                    <button
                      onClick={markEmbedWatched}
                      className="rounded-full bg-[#74cf66] px-3 py-1.5 text-[11px] font-bold text-black transition-colors hover:bg-[#62b956] cursor-pointer"
                      title="Mark this episode watched"
                    >
                      Mark watched
                    </button>
                  )}
                  <button
                    onClick={() => setActiveDrawer(activeDrawer === 'captions' ? 'none' : 'captions')}
                    className="rounded-full p-2 text-white/85 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                    title="Subtitles"
                  >
                    <Subtitles className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setShowSettingsSheet(true)}
                    className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-white/20 cursor-pointer"
                    title="Quality"
                  >
                    {quality}
                  </button>
                  <button
                    onClick={() => setAudioMode(audioMode === 'SUB' ? 'DUB' : 'SUB')}
                    className="rounded-full border border-[#74cf66]/40 bg-[#74cf66]/15 px-2.5 py-1 text-[11px] font-bold text-[#74cf66] cursor-pointer"
                    title="Audio track"
                  >
                    {audioMode}
                  </button>
                  <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white">
                    {activeServerLabel}
                  </span>
                  <button
                    onClick={() => setShowSettingsSheet(true)}
                    className="rounded-full p-2 text-white/85 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                    title="Player settings"
                  >
                    <SettingsIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setActiveDrawer(activeDrawer === 'episodes' ? 'none' : 'episodes')}
                    className="rounded-full p-2 text-white/85 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                    title="Episodes"
                  >
                    <ListOrdered className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => {
                      if (!document.fullscreenElement) {
                        containerRef.current?.requestFullscreen?.();
                      } else {
                        document.exitFullscreen?.();
                      }
                    }}
                    className="rounded-full p-2 text-white/85 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                    title="Fullscreen"
                  >
                    <Maximize2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
              </div>
            </div>
          </div>
        )}

        {showSettingsSheet && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 z-50 flex flex-col justify-end bg-black/75 backdrop-blur-md animate-fadeIn"
          >
            <div
              className="w-full max-w-lg mx-auto bg-[#0a0a0c] border-t border-white/15 rounded-t-3xl p-5 sm:p-6 shadow-2xl space-y-5 max-h-[85vh] overflow-y-auto no-scrollbar text-white animate-slideUp"
            >
              {}
              <div className="flex items-center justify-between pb-1 border-b border-white/10">
                <div>
                  <div className="text-[10px] font-bold text-zinc-400 tracking-wider uppercase">
                    NOW PLAYING
                  </div>
                  <h2 className="text-lg font-black text-white">Settings</h2>
                </div>
                <button
                  onClick={() => setShowSettingsSheet(false)}
                  className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  VOLUME
                </div>
                <div className="flex items-center gap-3">
                  <Volume2 className="w-5 h-5 text-zinc-300 shrink-0" />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setVolume(val);
                      setIsMuted(false);
                      if (videoRef.current) {
                        videoRef.current.volume = val;
                        videoRef.current.muted = false;
                      }
                    }}
                    className="w-full h-2 bg-white/20 rounded-full appearance-none cursor-pointer accent-white"
                  />
                  <span className="text-xs font-bold text-zinc-200 w-10 text-right">
                    {Math.round(volume * 100)}%
                  </span>
                </div>
              </div>

              {}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  PLAYBACK SPEED
                </div>
                <div className="flex items-center gap-3">
                  <Gauge className="w-5 h-5 text-zinc-300 shrink-0" />
                  <div className="flex-1 flex items-center justify-between gap-1 py-1">
                    {SPEED_STEPS.map((spd) => {
                      const isSelected = playbackSpeed === spd;
                      return (
                        <button
                          key={spd}
                          type="button"
                          onClick={() => {
                            setPlaybackSpeed(spd);
                            if (videoRef.current) videoRef.current.playbackRate = spd;
                          }}
                          className={`relative flex flex-col items-center p-1.5 cursor-pointer group`}
                        >
                          <div
                            className={`w-2.5 h-2.5 rounded-full transition-transform ${
                              isSelected
                                ? 'bg-white scale-125 shadow-md shadow-white/50'
                                : 'bg-zinc-600 hover:bg-zinc-400'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-xs font-bold text-zinc-200 w-10 text-right">
                    {playbackSpeed}x
                  </span>
                </div>
              </div>

              {}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  QUALITY
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded border border-zinc-400 text-[10px] font-black flex items-center justify-center shrink-0 text-zinc-300">
                    HQ
                  </div>
                  <div className="flex-1 flex items-center justify-between gap-1 py-1">
                    {QUALITY_STEPS.map((q) => {
                      const isSelected = quality === q;
                      return (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setQuality(q)}
                          className={`relative flex flex-col items-center p-1 cursor-pointer`}
                        >
                          <div
                            className={`w-2.5 h-2.5 rounded-full transition-transform ${
                              isSelected
                                ? 'bg-white scale-125 shadow-md shadow-white/50'
                                : 'bg-zinc-600 hover:bg-zinc-400'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-xs font-bold text-zinc-200 w-10 text-right">
                    {quality}
                  </span>
                </div>
              </div>

              {}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  AUDIO
                </div>
                <div className="grid grid-cols-2 gap-2 p-1 bg-white/5 rounded-2xl border border-white/5">
                  <button
                    type="button"
                    onClick={() => setAudioMode('SUB')}
                    className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      audioMode === 'SUB'
                        ? 'bg-zinc-800 text-white shadow-md'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Sub
                  </button>
                  <button
                    type="button"
                    onClick={() => setAudioMode('DUB')}
                    className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      audioMode === 'DUB'
                        ? 'bg-zinc-800 text-white shadow-md'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Dub
                  </button>
                </div>
                <div className="text-[11px] text-zinc-400 pl-1">
                  {audioMode === 'DUB' ? `Dub plays from ${activeServerLabel}.` : `Japanese audio with ${selectedSubLanguage} subtitles.`}
                </div>
              </div>

              {}
              <div className="space-y-1">
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  AUDIO FORMAT
                </div>
                <div className="text-xs text-zinc-300 pl-1">
                  AAC • Stereo • decoded on this device
                </div>
              </div>

              {}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  SCREEN SIZE
                </div>
                <div className="grid grid-cols-3 gap-2 p-1 bg-white/5 rounded-2xl border border-white/5">
                  {(['Fit', 'Crop', 'Fill'] as const).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setScreenSize(sz)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        screenSize === sz
                          ? 'bg-zinc-800 text-white shadow-md'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              {}
              <div className="space-y-2.5 pt-1">
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  PLAYBACK
                </div>

                {}
                <label className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 cursor-pointer">
                  <span className="text-xs font-semibold text-white">Auto-play next episode</span>
                  <input
                    type="checkbox"
                    checked={settings.autoPlayNext}
                    onChange={(e) => updateSettings({ autoPlayNext: e.target.checked })}
                    className="w-5 h-5 accent-[#74cf66] rounded cursor-pointer"
                  />
                </label>

                {}
                <label className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 cursor-pointer">
                  <div>
                    <div className="text-xs font-semibold text-white">Auto-skip intro, recap and outro</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">Skip timing supplied by this server</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.autoSkipIntro}
                    onChange={(e) => updateSettings({ autoSkipIntro: e.target.checked })}
                    className="w-5 h-5 accent-[#74cf66] rounded cursor-pointer"
                  />
                </label>
              </div>

              {}
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettingsSheet(false)}
                  className="p-2 rounded-full bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  <ChevronDown className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {}
        {activeDrawer === 'captions' && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-y-0 right-0 w-full sm:w-80 bg-[#0e0c18]/95 border-l border-[#74cf66]/30 backdrop-blur-2xl p-5 z-50 overflow-y-auto space-y-4 animate-fadeIn text-xs"
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="font-bold text-sm text-white">Subtitles & Captions</h3>
              <button
                onClick={() => setActiveDrawer('none')}
                className="p-1 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <span className="font-bold uppercase tracking-wider text-[11px] text-zinc-400">Subtitle Language</span>
              <div className="space-y-1">
                {['English', 'Spanish', 'French', 'German', 'Portuguese', 'Off'].map((lang) => (
                  <button
                    key={lang}
                    onClick={() => {
                      setSelectedSubLanguage(lang);
                      updateSettings({ preferredSubLanguage: lang });
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all ${
                      selectedSubLanguage === lang
                        ? 'bg-[#74cf66] text-black font-bold'
                        : 'bg-white/5 hover:bg-white/10 text-zinc-300'
                    }`}
                  >
                    <span>{lang}</span>
                    {selectedSubLanguage === lang && <Check className="w-4 h-4 text-black" />}
                  </button>
                ))}
              </div>
            </div>

            {}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <span className="font-bold uppercase tracking-wider text-[11px] text-zinc-400">Timing Offset</span>
              <div className="flex items-center justify-between bg-white/5 p-2 rounded-2xl">
                <button
                  onClick={() => setSubOffsetSec(prev => Number((prev - 0.25).toFixed(2)))}
                  className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 font-bold"
                >
                  -0.25s
                </button>
                <span className="font-bold">{subOffsetSec > 0 ? `+${subOffsetSec}` : subOffsetSec}s</span>
                <button
                  onClick={() => setSubOffsetSec(prev => Number((prev + 0.25).toFixed(2)))}
                  className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 font-bold"
                >
                  +0.25s
                </button>
              </div>
            </div>
          </div>
        )}

        {}
        {activeDrawer === 'episodes' && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-y-0 right-0 w-full sm:w-80 bg-[#0e0c18]/95 border-l border-[#74cf66]/30 backdrop-blur-2xl p-5 z-50 overflow-y-auto space-y-3 animate-fadeIn text-xs"
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="font-bold text-sm text-white">Episodes ({activeEpisodes.length})</h3>
              <button
                onClick={() => setActiveDrawer('none')}
                className="p-1 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-[80vh] overflow-y-auto no-scrollbar">
              {activeEpisodes.map((ep) => {
                const isSelected = ep.number === currentEpisodeNumber;
                return (
                  <button
                    key={ep.id}
                    onClick={() => {
                      setCurrentEpisodeNumber(ep.number);
                      setActiveDrawer('none');
                    }}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#74cf66]/20 border border-[#74cf66] text-white'
                        : 'bg-white/5 hover:bg-white/10 text-zinc-300'
                    }`}
                  >
                    <span className="w-6 text-center font-bold text-zinc-400 text-xs">
                      {ep.number}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{ep.title}</div>
                      <div className="text-[10px] text-zinc-400">
                        {ep.durationSec ? `${Math.round(ep.durationSec / 60)} min` : '24 min'}
                      </div>
                    </div>
                    {isSelected && <Play className="w-3.5 h-3.5 fill-[#74cf66] text-[#74cf66] shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <aside className="hidden lg:flex w-[380px] xl:w-[420px] shrink-0 flex-col border-l border-white/10 bg-[#0f0f12]">
        <div className="border-b border-white/10 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Up Next</p>
              <h2 className="truncate text-base font-bold text-white">
                {nextEpisode ? `Episode ${nextEpisode.number}` : 'End of series'}
              </h2>
              <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                Playing - Episode {currentEpisodeNumber} - {anime.title}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveDrawer('episodes')}
                className="rounded-full p-2 text-zinc-300 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                title="Episodes"
              >
                <ListOrdered className="h-4 w-4" />
              </button>
              <button
                onClick={() => setIsFavorited(!isFavorited)}
                className={`rounded-full p-2 transition-colors hover:bg-white/10 cursor-pointer ${
                  isFavorited ? 'text-red-400' : 'text-zinc-300 hover:text-white'
                }`}
                title="Favourite"
              >
                <Heart className={`h-4 w-4 ${isFavorited ? 'fill-red-400' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-3 no-scrollbar">
          {activeEpisodes.map((ep) => {
            const isSelected = ep.number === currentEpisodeNumber;
            const durationLabel = ep.durationSec ? `${Math.round(ep.durationSec / 60)} min` : '24 min';
            return (
              <button
                key={ep.id}
                onClick={() => setCurrentEpisodeNumber(ep.number)}
                className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-[#74cf66]/40 bg-[#74cf66]/15'
                    : 'border-transparent hover:bg-white/5'
                }`}
              >
                <div className="relative aspect-video w-[104px] shrink-0 overflow-hidden rounded-md bg-black">
                  <img
                    src={ep.thumbnail || anime.posterImage}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = anime.posterImage;
                    }}
                  />
                  <span className="absolute bottom-1 left-1 rounded bg-black/80 px-1 py-0.5 text-[9px] font-bold text-white">
                    Ep {ep.number}
                  </span>
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[9px] text-white/80">
                    {durationLabel}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-xs font-semibold ${isSelected ? 'text-[#74cf66]' : 'text-white'}`}>
                    {ep.title}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-zinc-500">
                    {ep.airedDate || durationLabel}
                  </p>
                </div>
                {isSelected && <Play className="h-3.5 w-3.5 shrink-0 fill-[#74cf66] text-[#74cf66]" />}
              </button>
            );
          })}
        </div>

        <div className="space-y-2 border-t border-white/10 p-3">
          {embedUrl && (
            <button
              onClick={markEmbedWatched}
              className="w-full rounded-xl bg-[#74cf66] px-3 py-2 text-xs font-bold text-black transition-colors hover:bg-[#62b956] cursor-pointer"
            >
              Mark episode watched
            </button>
          )}
          <div className="flex items-center gap-2">
            <span className="flex-1 truncate rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-[11px] font-semibold text-zinc-200">
              {activeServerLabel}
            </span>
            <button
              onClick={() => setAudioMode(audioMode === 'SUB' ? 'DUB' : 'SUB')}
              className="rounded-xl border border-[#74cf66]/40 bg-[#74cf66]/15 px-3 py-2 text-[11px] font-bold text-[#74cf66] cursor-pointer"
            >
              {audioMode}
            </button>
            <button
              onClick={() => setShowSettingsSheet(true)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-zinc-200 transition-colors hover:bg-white/10 cursor-pointer"
            >
              Settings
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
};

