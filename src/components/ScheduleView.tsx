import React, { useState, useEffect } from 'react';
import { convertAniListToAnime, useApp } from '../context/AppContext';
import { fetchAiringSchedule, AiringScheduleItem, fetchAniListMediaById } from '../utils/anilistApi';
import {
  Calendar as CalendarIcon,
  Clock,
  Loader2
} from 'lucide-react';
import { displayAniListTitle, isAnimeVisible } from '../utils/animePreferences';
import { mediaIndexRelease, type MediaIndexScheduleRow } from '../utils/mediaIndexRelease';
import { convertMediaIndexMediaToAnime } from '../utils/animeConversion';

type ScheduleSource = 'LIVE' | 'INDEX' | 'LOCAL' | 'UNAVAILABLE';

function indexedScheduleItem(row: MediaIndexScheduleRow): AiringScheduleItem {
  return {
    id: row.id * 100_000 + row.episode,
    airingAt: row.airingAt,
    timeUntilAiring: Math.max(0, row.airingAt - Math.floor(Date.now() / 1000)),
    episode: row.episode,
    media: {
      id: row.id,
      isAdult: row.adult === true,
      type: 'ANIME',
      title: {
        english: row.english,
        romaji: row.romaji,
        native: row.native,
      },
      coverImage: { extraLarge: row.cover, large: row.cover },
      format: row.format,
      seasonYear: row.year,
    },
  };
}

export const ScheduleView: React.FC = () => {
  const { setSelectedAnime, setRouteError, liveCatalog, settings } = useApp();

  
  const now = new Date();
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - 1 + i);
    d.setHours(0, 0, 0, 0);
    const dayStartSec = Math.floor(d.getTime() / 1000);
    const dayEndSec = dayStartSec + 86400;

    let label = `${dayLabels[d.getDay()]} ${monthLabels[d.getMonth()]} ${d.getDate()}`;
    if (i === 1) label = `Today ${monthLabels[d.getMonth()]} ${d.getDate()}`;
    else if (i === 0) label = `Yesterday ${monthLabels[d.getMonth()]} ${d.getDate()}`;
    else if (i === 2) label = `Tomorrow ${monthLabels[d.getMonth()]} ${d.getDate()}`;

    return {
      label,
      date: d,
      dayStartSec,
      dayEndSec,
      isToday: i === 1,
    };
  });

  const [selectedDayIdx, setSelectedDayIdx] = useState(1); 
  const [scheduleItems, setScheduleItems] = useState<AiringScheduleItem[]>([]);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
  const [scheduleSource, setScheduleSource] = useState<ScheduleSource>('LIVE');

  const selectedDay = days[selectedDayIdx];
  const visibleScheduleItems = scheduleItems.filter((item) =>
    isAnimeVisible(item.media, settings.hideAdultContent)
  );

  useEffect(() => {
    let isMounted = true;
    setIsLoadingSchedule(true);

    const loadSchedule = async () => {
      try {
        const items = await fetchAiringSchedule(selectedDay.dayStartSec, selectedDay.dayEndSec, 30);
        if (!isMounted) return;
        setScheduleItems(items);
        setScheduleSource('LIVE');
      } catch (err) {
        console.warn('AniList schedule is unavailable; trying the verified Media Index snapshot.', err);
        try {
          const indexed = await mediaIndexRelease.schedule(
            selectedDay.date.getFullYear(),
            selectedDay.date.getMonth() + 1,
          );
          if (!isMounted) return;
          const rows = indexed.data
            .filter((row) => row.airingAt >= selectedDay.dayStartSec && row.airingAt < selectedDay.dayEndSec)
            .map(indexedScheduleItem);
          setScheduleItems(rows);
          setScheduleSource(indexed.state);
        } catch (fallbackError) {
          console.error('Both live and verified schedule metadata are unavailable:', fallbackError);
          if (!isMounted) return;
          setScheduleItems([]);
          setScheduleSource('UNAVAILABLE');
        }
      } finally {
        if (isMounted) setIsLoadingSchedule(false);
      }
    };
    void loadSchedule();

    return () => { isMounted = false; };
  }, [selectedDayIdx]);

  return (
    <div className="space-y-6 pb-20 animate-fadeIn">
      {}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Schedule</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {scheduleSource === 'LIVE'
              ? 'Live broadcast timetables direct from AniList'
              : scheduleSource === 'LOCAL'
                ? 'Last verified schedule saved on this device'
                : scheduleSource === 'INDEX'
                  ? 'Latest verified Media Index schedule snapshot'
                  : 'Broadcast metadata is temporarily unavailable'}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 border border-[var(--anilife-accent)]/30 text-xs text-[var(--anilife-accent)] font-semibold">
          <span className={`w-2 h-2 rounded-full bg-[var(--anilife-accent)] ${scheduleSource === 'LIVE' ? 'animate-pulse' : ''}`} />
          <span>{scheduleSource === 'LIVE' ? 'Live AniList feed' : scheduleSource === 'LOCAL' ? 'Saved snapshot' : scheduleSource === 'INDEX' ? 'Verified snapshot' : 'Unavailable'}</span>
        </div>
      </div>

      {}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
        {days.map((d, idx) => {
          const isSelected = selectedDayIdx === idx;
          return (
            <button
              key={d.label}
              onClick={() => setSelectedDayIdx(idx)}
              className={`flex flex-col items-center px-4 py-2 rounded-2xl whitespace-nowrap transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[var(--anilife-accent)] text-black font-bold shadow-lg shadow-[var(--anilife-accent-shadow)] ring-1 ring-[var(--anilife-accent)]'
                  : 'bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/5'
              }`}
            >
              <span className="text-xs font-semibold">{d.label}</span>
              {d.isToday && (
                <span className={`text-[10px] uppercase font-bold mt-0.5 ${isSelected ? 'text-black' : 'text-[var(--anilife-accent)]'}`}>
                  Live
                </span>
              )}
            </button>
          );
        })}
      </div>

      {}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-zinc-400">
          <span>Releases on {selectedDay.label}</span>
          {!isLoadingSchedule && <span>{visibleScheduleItems.length} episodes</span>}
        </div>

        {isLoadingSchedule ? (
          <div className="py-20 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-[var(--anilife-accent)] animate-spin mx-auto" />
            <p className="text-sm text-zinc-400">Fetching broadcast schedule...</p>
          </div>
        ) : visibleScheduleItems.length === 0 ? (
          <div className="text-center py-14 bg-white/5 rounded-2xl border border-white/10 text-zinc-400 text-sm">
            {scheduleSource === 'UNAVAILABLE'
              ? 'Schedule metadata could not be loaded. Try again when your connection or AniList is available.'
              : 'No scheduled broadcasts found for this date.'}
          </div>
        ) : (
          <div className="space-y-3">
            {visibleScheduleItems.map((item) => {
              const airDate = new Date(item.airingAt * 1000);
              const airTime = airDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const animeTitle = displayAniListTitle(item.media.title, settings.titleLanguage);
              const coverImg = item.media.coverImage.extraLarge || item.media.coverImage.large || '';

              return (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-[var(--anilife-accent)]/30 transition-all hover:bg-white/10 group"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${animeTitle}`}
                    onClick={async () => {
                      const found = liveCatalog.find(a => a.id === String(item.media.id));
                      if (found) {
                        setSelectedAnime(found);
                      } else {
                        const media = await fetchAniListMediaById(item.media.id).catch(() => null);
                        if (media) setSelectedAnime(convertAniListToAnime(media));
                        else {
                          const indexed = await mediaIndexRelease.media(item.media.id).catch(() => null);
                          if (indexed) setSelectedAnime(convertMediaIndexMediaToAnime(indexed.data));
                          else setRouteError('This title could not be loaded from live or verified metadata. Try again in a moment.');
                        }
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.currentTarget.click();
                      }
                    }}
                    className="flex items-center gap-3.5 cursor-pointer flex-1"
                  >
                    <img
                      src={coverImg}
                      alt={animeTitle}
                      className="w-14 h-20 rounded-xl object-cover shadow-md group-hover:scale-105 transition-transform bg-zinc-900"
                    />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-[11px] font-bold text-[var(--anilife-accent)] bg-[var(--anilife-accent)]/15 px-2 py-0.5 rounded-full border border-[var(--anilife-accent)]/20">
                          <Clock className="w-3 h-3" />
                          <span>{airTime}</span>
                        </span>
                        <span className="text-xs text-zinc-300 font-semibold">• Episode {item.episode}</span>
                        {item.media.averageScore && (
                          <span className="text-xs text-amber-300 font-medium">★ {item.media.averageScore}%</span>
                        )}
                      </div>
                      <h3 className="font-bold text-sm sm:text-base text-white group-hover:text-[var(--anilife-accent)] transition-colors">
                        {animeTitle}
                      </h3>
                      <p className="text-xs text-zinc-400">
                        {item.media.format} • {item.media.genres?.slice(0, 2).join(', ')}
                      </p>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
