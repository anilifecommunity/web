import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { Anime, Episode, ServerOption } from '../types/anime';
import { useApp } from '../context/AppContext';
import { SERVERS, getAnimeAniListId } from '../utils/animeData';
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
  Download,
  Heart,
  Search,
  Sparkles,
  Server
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
  const [activeServer, setActiveServer] = useState<ServerOption>(() => {
    return SERVERS.find(s => s.id === settings.activeServer) || SERVERS[0];
  });

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
  const [activeDrawer, setActiveDrawer] = useState<'none' | 'servers' | 'episodes' | 'captions'>('none');

  
  const [skipData, setSkipData] = useState<MediaIndexSkipData | null>(null);
  const [skipToast, setSkipToast] = useState<string | null>(null);

  
  const [realEpisodes, setRealEpisodes] = useState<Episode[]>(() => {
    return anime.seasons[0]?.episodes || [];
  });

  
  const [streamUrl, setStreamUrl] = useState<string>('');
  const [streamError, setStreamError] = useState<boolean>(false);

  
  const [clockString, setClockString] = useState('');

  
  const [subOffsetSec, setSubOffsetSec] = useState(settings.subtitleOffsetSec || 0.0);
  const [selectedSubLanguage, setSelectedSubLanguage] = useState(settings.preferredSubLanguage || 'English');
  const [subtitles, setSubtitles] = useState<Array<{ language: string; label: string; url: string; default?: boolean }>>([]);
  const hlsRef = useRef<Hls | null>(null);

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
    let isCancelled = false;

    async function resolveSource() {
      const candidateServers = settings.serverPriority && settings.serverPriority.length > 0
        ? settings.serverPriority
        : SERVERS.map(s => s.id);

      const orderedServers = [
        activeServer.id,
        ...candidateServers.filter(id => id !== activeServer.id)
      ];

      for (const serverId of orderedServers) {
        if (isCancelled) return;
        try {
          const queryParams = new URLSearchParams({
            provider: serverId,
            animeId: isNaN(numericAniListId) ? '154587' : String(numericAniListId),
            episode: String(currentEpisodeNumber),
            audio: audioMode.toLowerCase(),
            title: anime.title || ''
          });

          const res = await fetch(`/api/sources?${queryParams.toString()}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.source?.streamUrl && !isCancelled) {
              setStreamUrl(data.source.streamUrl);
              const matchedServer = SERVERS.find(s => s.id === serverId);
              if (matchedServer) setActiveServer(matchedServer);

              if (Array.isArray(data.source.subtitles)) {
                setSubtitles(data.source.subtitles);
              }
              if (data.source.skip) {
                const toTuple = (v: unknown): [number, number] | undefined => {
                  if (Array.isArray(v) && v.length >= 2 && !isNaN(Number(v[0])) && !isNaN(Number(v[1]))) {
                    return [Number(v[0]), Number(v[1])];
                  }
                  if (v && typeof v === 'object' && 'start' in v && 'end' in v) {
                    return [Number((v as { start: number }).start), Number((v as { end: number }).end)];
                  }
                  return undefined;
                };
                const op = toTuple(data.source.skip.intro);
                const ed = toTuple(data.source.skip.outro);
                if (op || ed) {
                  setSkipData(prev => ({
                    ...prev,
                    ...(op ? { op } : {}),
                    ...(ed ? { ed } : {})
                  }));
                }
              }
              setIsLoading(false);
              return;
            }
          }
        } catch (err) {
          console.warn(`[VideoPlayer] Server ${serverId} failed, trying next...`, err);
        }
      }

      if (!isCancelled) {
        setStreamError(true);
        setIsLoading(false);
      }
    }

    if (settings.discordRichPresence && anime.title) {
      fetch('/api/discord/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: anime.title, episode: currentEpisodeNumber })
      }).catch(() => {});
    }

    resolveSource();
    return () => { isCancelled = true; };
  }, [numericAniListId, currentEpisodeNumber, activeServer.id, audioMode, anime.title, settings.discordRichPresence]);

  
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isLoading || !streamUrl) return;

    
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHls = streamUrl.endsWith('.m3u8') || streamUrl.includes('.m3u8') || streamUrl.includes('format=hls');

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
        setIsLoading(false);
        video.playbackRate = playbackSpeed;
        video.volume = volume;
        video.muted = isMuted;
        video.play().then(() => setIsPlaying(true)).catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              setIsLoading(false);
              break;
          }
        }
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
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, isLoading]);

  
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

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex flex-col h-full w-full overflow-hidden select-none font-sans">
      {}
      {skipToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full bg-black/80 backdrop-blur-xl border border-[#74cf66]/50 shadow-2xl text-xs sm:text-sm font-bold text-white flex items-center gap-2 animate-bounce">
          <Sparkles className="w-4 h-4 text-[#74cf66]" />
          <span>{skipToast}</span>
        </div>
      )}

      {}
      <div
        ref={containerRef}
        onClick={handleContainerClick}
        className="relative w-full shrink-0 aspect-video h-[45vh] sm:h-[55vh] lg:h-[65vh] max-h-[70vh] bg-black overflow-hidden flex items-center justify-center cursor-pointer group shadow-2xl"
      >
        {}
        <video
          ref={videoRef}
          src={!streamUrl.includes('.m3u8') ? streamUrl : undefined}
          className={`w-full h-full ${objectFitClass} transition-all duration-300`}
          crossOrigin="anonymous"
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
              if (activeEpisodes.some(ep => ep.number === nextNum)) {
                setCurrentEpisodeNumber(nextNum);
                showToast(`Auto-playing Episode ${nextNum}...`);
              }
            }
          }}
          playsInline
          onError={() => {
            setIsLoading(false);
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

        {}
        {streamError && !isLoading && (
          <div className="absolute inset-0 z-35 flex flex-col items-center justify-center bg-black/90 p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 font-bold text-xl">
              !
            </div>
            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-bold text-white">
                Stream unavailable from {activeServer.name}
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 max-w-md">
                Unable to load Episode {currentEpisodeNumber}. Please switch to another server or retry.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveDrawer('servers');
                }}
                className="px-5 py-2.5 rounded-full bg-[#74cf66] hover:bg-[#62b956] text-black font-bold text-xs sm:text-sm shadow-lg shadow-[rgba(116,207,102,0.3)] transition-transform hover:scale-105 cursor-pointer"
              >
                Switch Server
              </button>
            </div>
          </div>
        )}

        {}
        {isLoading && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm space-y-3">
            <div className="relative flex items-center justify-center">
              <div className="w-16 h-16 border-4 border-[#74cf66]/20 border-t-[#74cf66] rounded-full animate-spin" />
              <img
                src="/assets/images/Anilife-Logo.png"
                alt="AniLife"
                className="absolute w-8 h-8 rounded-full shadow-lg"
              />
            </div>
            <p className="text-xs font-semibold text-[#74cf66]">
              Looking for the fastest source to play this episode
            </p>
          </div>
        )}

        {}
        {!settings.autoSkipIntro && (isInOp || isInEd) && (
          <button
            onClick={handleSkipButton}
            className="absolute bottom-20 right-6 z-40 px-5 py-2 rounded-full bg-[#74cf66] hover:bg-[#62b956] text-black font-bold text-xs sm:text-sm shadow-xl shadow-[rgba(116,207,102,0.4)] border border-[#74cf66]/50 flex items-center gap-2 animate-pulse cursor-pointer transition-transform hover:scale-105"
          >
            <FastForward className="w-4 h-4" />
            <span>{isInOp ? 'Skip Opening' : 'Skip Ending'}</span>
          </button>
        )}

        {}
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

        {}
        {!isLocked && (
          <div
            className={`absolute inset-0 z-20 flex flex-col justify-between p-4 sm:p-6 bg-gradient-to-t from-black/85 via-black/25 to-black/80 transition-opacity duration-300 ${
              isControlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          >
            {}
            <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="p-2 -ml-2 rounded-full hover:bg-white/10 text-white transition-colors cursor-pointer"
                  title="Back"
                >
                  <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
                <div className="min-w-0">
                  <h1 className="text-sm sm:text-base font-bold truncate max-w-[200px] sm:max-w-md">
                    {anime.title}
                  </h1>
                  <p className="text-[11px] sm:text-xs text-zinc-300 truncate">
                    EP {currentEpisode.number} • {currentEpisode.title}
                  </p>
                </div>
              </div>

              {}
              <div className="flex items-center gap-1 sm:gap-2">
                {}
                <span className="hidden sm:inline-block text-xs text-zinc-300 font-mono px-2 py-1 rounded bg-black/40 border border-white/10">
                  {clockString}
                </span>

                {}
                <button
                  onClick={() => setIsLocked(true)}
                  className="p-2 rounded-full hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                  title="Lock screen controls"
                >
                  <Lock className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>

                {}
                <button
                  onClick={() => setActiveDrawer(activeDrawer === 'captions' ? 'none' : 'captions')}
                  className="p-2 rounded-full hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                  title="Subtitles"
                >
                  <Subtitles className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>

                {}
                <button
                  onClick={() => setActiveDrawer(activeDrawer === 'servers' ? 'none' : 'servers')}
                  className="p-2 rounded-full hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                  title="Change server"
                >
                  <Server className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>

                {}
                <button
                  onClick={() => setShowSettingsSheet(true)}
                  className="p-2 rounded-full hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                  title="Player Settings"
                >
                  <SettingsIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>

            {}
            <div
              className="flex items-center justify-center gap-8 sm:gap-14"
              onClick={(e) => e.stopPropagation()}
            >
              {}
              <button
                onClick={() => handleSeek(currentTime - 10)}
                className="p-3 rounded-full hover:bg-white/10 text-white/90 hover:text-white transition-all transform hover:scale-110 cursor-pointer"
                title="Rewind 10 seconds"
              >
                <RotateCcw className="w-6 h-6 sm:w-8 sm:h-8" />
              </button>

              {}
              <button
                onClick={() => {
                  if (currentEpisodeNumber > 1) {
                    setCurrentEpisodeNumber(currentEpisodeNumber - 1);
                  }
                }}
                disabled={currentEpisodeNumber <= 1}
                className="p-2 text-white/80 hover:text-white disabled:opacity-30 cursor-pointer"
                title="Previous episode"
              >
                <SkipBack className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>

              {}
              <button
                onClick={handlePlayPause}
                className="p-4 sm:p-5 rounded-full bg-[#74cf66] hover:bg-[#62b956] text-black shadow-2xl shadow-[rgba(116,207,102,0.4)] transition-all transform hover:scale-110 active:scale-95 cursor-pointer"
              >
                {isPlaying ? (
                  <Pause className="w-8 h-8 sm:w-10 sm:h-10 fill-black" />
                ) : (
                  <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-black translate-x-0.5" />
                )}
              </button>

              {}
              <button
                onClick={() => {
                  const nextNum = currentEpisodeNumber + 1;
                  if (activeEpisodes.some(ep => ep.number === nextNum)) {
                    setCurrentEpisodeNumber(nextNum);
                  }
                }}
                disabled={!activeEpisodes.some(ep => ep.number === currentEpisodeNumber + 1)}
                className="p-2 text-white/80 hover:text-white disabled:opacity-30 cursor-pointer"
                title="Next episode"
              >
                <SkipForward className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>

              {}
              <button
                onClick={() => handleSeek(currentTime + 10)}
                className="p-3 rounded-full hover:bg-white/10 text-white/90 hover:text-white transition-all transform hover:scale-110 cursor-pointer"
                title="Forward 10 seconds"
              >
                <FastForward className="w-6 h-6 sm:w-8 sm:h-8" />
              </button>
            </div>

            {}
            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
              {}
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-zinc-300 w-11 text-right">
                  {formatTime(currentTime)}
                </span>
                <div className="relative flex-1 group/slider py-2 flex items-center">
                  <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    step="0.5"
                    value={currentTime}
                    onChange={(e) => handleSeek(Number(e.target.value))}
                    className="w-full h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer accent-[#74cf66] focus:outline-none"
                  />
                </div>
                <span className="text-xs font-mono text-zinc-400 w-11">
                  {formatTime(duration)}
                </span>
              </div>

              {}
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <div className="flex items-center gap-2">
                  {}
                  <button
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.muted = !isMuted;
                        setIsMuted(!isMuted);
                      }
                    }}
                    className="p-1.5 rounded-full hover:bg-white/10 text-zinc-300 hover:text-white"
                  >
                    {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                  </button>

                  {}
                  <button
                    onClick={() => setAudioMode(audioMode === 'SUB' ? 'DUB' : 'SUB')}
                    className="px-2.5 py-0.5 rounded-full bg-black/60 border border-[#74cf66]/40 text-[11px] font-bold text-[#74cf66] cursor-pointer"
                  >
                    {audioMode}
                  </button>

                  {}
                  <button
                    onClick={() => setActiveDrawer('servers')}
                    className="px-2.5 py-0.5 rounded-full bg-white/10 hover:bg-white/15 text-[11px] font-semibold text-zinc-300 cursor-pointer"
                  >
                    {activeServer.name}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {}
                  <button
                    onClick={() => setShowSettingsSheet(true)}
                    className="px-2 py-0.5 rounded-md hover:bg-white/10 font-bold text-[11px]"
                  >
                    {playbackSpeed}x
                  </button>

                  {}
                  <button
                    onClick={() => setActiveDrawer(activeDrawer === 'episodes' ? 'none' : 'episodes')}
                    className="p-1.5 rounded-full hover:bg-white/10 text-zinc-300 hover:text-white"
                    title="Episodes list"
                  >
                    <ListOrdered className="w-4 h-4" />
                  </button>

                  {}
                  <button
                    onClick={() => {
                      if (!document.fullscreenElement) {
                        containerRef.current?.requestFullscreen?.();
                      } else {
                        document.exitFullscreen?.();
                      }
                    }}
                    className="p-1.5 rounded-full hover:bg-white/10 text-zinc-300 hover:text-white"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {}
        {}
        {}
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
                  {audioMode === 'DUB' ? `Dub plays from ${activeServer.name}.` : `Japanese audio with ${selectedSubLanguage} subtitles.`}
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
        {}
        {}
        {activeDrawer === 'servers' && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-y-0 right-0 w-full sm:w-96 bg-[#0e0c18]/95 border-l border-[#74cf66]/30 backdrop-blur-2xl p-5 z-50 overflow-y-auto space-y-4 animate-fadeIn text-xs"
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div>
                <h3 className="font-bold text-sm text-white">Video Sources & Servers</h3>
                <p className="text-[11px] text-zinc-400">Switch provider without leaving playback</p>
              </div>
              <button
                onClick={() => setActiveDrawer('none')}
                className="p-1 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {SERVERS.map((server) => {
                const isSelected = activeServer.id === server.id;
                return (
                  <button
                    key={server.id}
                    onClick={() => {
                      setActiveServer(server);
                      updateSettings({ activeServer: server.id });
                      setActiveDrawer('none');
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#74cf66]/20 border border-[#74cf66] text-white'
                        : 'bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-300'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{server.name}</span>
                        {server.badge && (
                          <span className="px-2 py-0.5 rounded-full bg-black/80 border border-[#74cf66]/30 text-[9px] font-bold text-[#74cf66]">
                            {server.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-1">
                        {server.description || (server.supportsDub ? 'Supports Sub & Dub' : 'Subtitles only')}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-bold ${server.speed === 'Ultra' ? 'text-emerald-400' : 'text-blue-400'}`}>
                        {server.speed}
                      </span>
                      {isSelected && <Check className="w-4 h-4 text-[#74cf66]" />}
                    </div>
                  </button>
                );
              })}
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

      {}
      <div className="flex-1 overflow-y-auto max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {}
        <div className="space-y-1">
          <h2 className="text-xl sm:text-2xl font-black text-white">{currentEpisode.title}</h2>
          <div className="flex items-center gap-2 text-xs sm:text-sm text-zinc-400">
            <span className="text-[#74cf66] font-bold">{anime.score}% score</span>
            <span>•</span>
            <span>Episode {currentEpisode.number}</span>
            {currentEpisode.airedDate && (
              <>
                <span>•</span>
                <span>{currentEpisode.airedDate}</span>
              </>
            )}
          </div>
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed pt-1">
            {currentEpisode.synopsis || anime.synopsis}
          </p>
        </div>

        {}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-3">
            <img
              src={anime.posterImage}
              alt={anime.title}
              className="w-10 h-10 rounded-full object-cover border border-[#74cf66]"
            />
            <div>
              <h3 className="font-bold text-sm text-white">{anime.title}</h3>
              <p className="text-[11px] text-zinc-400">{(anime.membersCount / 1000).toFixed(1)}K members</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => showToast(`Downloaded episode ${currentEpisode.number} for offline play!`)}
              className="p-2 rounded-full hover:bg-white/10 text-zinc-300 hover:text-white"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsFavorited(!isFavorited)}
              className={`p-2 rounded-full hover:bg-white/10 ${
                isFavorited ? 'text-red-400' : 'text-zinc-300'
              }`}
              title="Favorite"
            >
              <Heart className={`w-4 h-4 ${isFavorited ? 'fill-red-400' : ''}`} />
            </button>
          </div>
        </div>

        {}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveDrawer('servers')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-zinc-200 border border-white/10 cursor-pointer"
          >
            <span>{activeServer.name}</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setAudioMode(audioMode === 'SUB' ? 'DUB' : 'SUB')}
            className="px-3.5 py-1.5 rounded-full bg-[#74cf66]/20 border border-[#74cf66]/40 text-xs font-bold text-[#74cf66] cursor-pointer"
          >
            {audioMode}
          </button>

          <button
            onClick={() => setActiveDrawer('servers')}
            className="text-xs text-[#74cf66] hover:text-[#62b956] ml-1 cursor-pointer font-medium"
          >
            More servers...
          </button>
        </div>

        {}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-white">Episodes ({activeEpisodes.length})</h3>
          </div>

          <div className="space-y-2">
            {activeEpisodes.map((ep) => {
              const isSelected = ep.number === currentEpisodeNumber;
              return (
                <div
                  key={ep.id}
                  onClick={() => setCurrentEpisodeNumber(ep.number)}
                  className={`flex items-center justify-between gap-3 p-3 rounded-2xl transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#74cf66]/10 border border-[#74cf66]/40'
                      : 'bg-white/5 hover:bg-white/10 border border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-24 aspect-video rounded-xl overflow-hidden shrink-0 bg-black/60">
                      <img
                        src={ep.thumbnail || anime.posterImage}
                        alt={ep.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = anime.posterImage;
                        }}
                      />
                      <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-bold text-white">
                        EP {ep.number}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <h4 className={`font-semibold text-sm truncate ${isSelected ? 'text-[#74cf66]' : 'text-white'}`}>
                        {ep.title}
                      </h4>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Episode {ep.number} {ep.durationSec ? `• ${Math.round(ep.durationSec / 60)}m` : ''}
                      </p>
                    </div>
                  </div>

                  {isSelected && (
                    <Play className="w-4 h-4 fill-[#74cf66] text-[#74cf66] shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
