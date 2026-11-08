import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  clearDiscordActivity,
  connectDiscordActivity,
  getDiscordState,
  isDiscordActivity,
  setDiscordActivity,
  subscribeDiscord,
  type DiscordState,
} from './activity';

const MAX_DETAILS = 128;

export function useDiscordStatus(): DiscordState {
  const [state, setState] = useState<DiscordState>(() => getDiscordState());
  useEffect(() => subscribeDiscord(setState), []);
  return state;
}

export function useDiscordActivity(): void {
  const { activeVideo, settings } = useApp();
  const state = useDiscordStatus();

  useEffect(() => {
    if (!isDiscordActivity()) return;
    void connectDiscordActivity();
  }, []);

  useEffect(() => {
    if (state.status !== 'connected') return;
    if (!settings.discordRichPresence) {
      void clearDiscordActivity();
      return;
    }

    if (activeVideo) {
      const title = activeVideo.anime.title.slice(0, MAX_DETAILS);
      void setDiscordActivity({
        type: 3,
        details: title,
        state: `Episode ${activeVideo.episodeNumber} - ${activeVideo.audioMode}`,
        assets: {
          large_image: activeVideo.anime.posterImage,
          large_text: title,
        },
        timestamps: { start: Math.floor(Date.now() / 1000) },
      });
      return;
    }

    void setDiscordActivity({
      type: 3,
      details: 'Browsing Anilife',
      state: 'Anime streaming',
      assets: {
        large_image: '/assets/images/Anilife-Logo.png',
        large_text: 'Anilife',
      },
    });
  }, [activeVideo, settings.discordRichPresence, state.status]);
}
