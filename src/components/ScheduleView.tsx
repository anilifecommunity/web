import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { fetchAiringSchedule, AiringScheduleItem } from '../utils/anilistApi';
import {
  Calendar as CalendarIcon,
  Clock,
  Bell,
  Star,
  Play,
  Loader2
} from 'lucide-react';

export const ScheduleView: React.FC = () => {
  const { setSelectedAnime, playAnimeEpisode, liveCatalog } = useApp();

  
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
  const [reminders, setReminders] = useState<Record<string, boolean>>({});
  const [scheduleItems, setScheduleItems] = useState<AiringScheduleItem[]>([]);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);

  const selectedDay = days[selectedDayIdx];

  useEffect(() => {
    let isMounted = true;
    setIsLoadingSchedule(true);

    fetchAiringSchedule(selectedDay.dayStartSec, selectedDay.dayEndSec, 30)
      .then((items) => {
        if (!isMounted) return;
        setScheduleItems(items);
      })
      .catch((err) => {
        console.error('Failed to fetch AniList schedule:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingSchedule(false);
      });

    return () => { isMounted = false; };
  }, [selectedDayIdx]);

  const toggleReminder = (id: string) => {
    setReminders(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6 pb-20 animate-fadeIn">
      {}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Schedule</h1>
          <p className="text-sm text-zinc-400 mt-1">Live broadcast timetables direct from AniList</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 border border-[var(--anilife-accent)]/30 text-xs text-[var(--anilife-accent)] font-semibold">
          <span className="w-2 h-2 rounded-full bg-[var(--anilife-accent)] animate-pulse" />
          <span>Real-time AniList Feed</span>
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
          {!isLoadingSchedule && <span>{scheduleItems.length} episodes</span>}
        </div>

        {isLoadingSchedule ? (
          <div className="py-20 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-[var(--anilife-accent)] animate-spin mx-auto" />
            <p className="text-sm text-zinc-400">Fetching broadcast schedule from AniList...</p>
          </div>
        ) : scheduleItems.length === 0 ? (
          <div className="text-center py-14 bg-white/5 rounded-2xl border border-white/10 text-zinc-400 text-sm">
            No scheduled broadcasts found for this date.
          </div>
        ) : (
          <div className="space-y-3">
            {scheduleItems.map((item) => {
              const airDate = new Date(item.airingAt * 1000);
              const airTime = airDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const animeTitle = item.media.title.english || item.media.title.romaji || 'Anime';
              const coverImg = item.media.coverImage.extraLarge || item.media.coverImage.large || '';
              const hasReminder = reminders[String(item.id)];

              return (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-[var(--anilife-accent)]/30 transition-all hover:bg-white/10 group"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${animeTitle}`}
                    onClick={() => {
                      const found = liveCatalog.find(a => a.id === String(item.media.id));
                      if (found) {
                        setSelectedAnime(found);
                      } else {
                        setSelectedAnime({
                          id: String(item.media.id),
                          title: animeTitle,
                          bannerImage: coverImg,
                          posterImage: coverImg,
                          score: item.media.averageScore || 78,
                          format: (item.media.format as any) || 'TV',
                          year: airDate.getFullYear(),
                          status: 'Releasing',
                          durationMins: 24,
                          genres: item.media.genres || ['Anime'],
                          synopsis: 'Broadcasting live on schedule.',
                          studio: 'Broadcasting Studio',
                          startDate: String(airDate.getFullYear()),
                          seasonName: 'Current',
                          membersCount: 45000,
                          hasDub: true,
                          hasSub: true,
                          seasons: [{ id: 's1', number: 1, title: 'Season 1', year: airDate.getFullYear(), episodes: [] }],
                          related: []
                        });
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

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      onClick={() => toggleReminder(String(item.id))}
                      className={`p-2 rounded-full border transition-colors cursor-pointer ${
                        hasReminder
                          ? 'bg-[var(--anilife-accent)]/20 border-[var(--anilife-accent)] text-[var(--anilife-accent)]'
                          : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10'
                      }`}
                      title={hasReminder ? 'Reminder set' : 'Remind me'}
                    >
                      <Bell className={`w-4 h-4 ${hasReminder ? 'fill-[var(--anilife-accent)] text-[var(--anilife-accent)]' : ''}`} />
                    </button>
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
